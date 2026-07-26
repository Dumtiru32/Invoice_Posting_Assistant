import "dotenv/config";
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// EXISTING ROUTE (UNCHANGED)
import validateEnhanced from "./routes/validateEnhanced.js";

// NEW: OCR / RASTER PDF PROCESSING FUNCTION
import { convertAndProcessBase64 } from "./convertAndProcessBase64.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// ----------------------------------------
// MIDDLEWARE
// ----------------------------------------
app.use(cors());

// IMPORTANT: Increase payload limit for large Base64 PDFs
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// ----------------------------------------
// EXISTING ENDPOINTS
// ----------------------------------------
app.post("/ai/validate-enhanced", validateEnhanced);

// ----------------------------------------
// NEW: SOP-DRIVEN AI VALIDATION (Validation button in ap-ai-chat)
// ----------------------------------------
// Loaded once at startup. Restart the server after editing the .md file.
const SOP_PATH = path.join(__dirname, "knowledge", "sop_ap_processing.md");
let SOP_TEXT = "";
try {
    SOP_TEXT = fs.readFileSync(SOP_PATH, "utf8");
    console.log(`✅ Loaded SOP (${SOP_TEXT.length} chars) from ${SOP_PATH}`);
} catch (err) {
    console.error(`❌ Could not load SOP at ${SOP_PATH}:`, err.message);
}

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

function buildSystemPrompt() {
    return `You are an Accounts Payable validation assistant for a company using Oracle ERP.
You check a single invoice against the company's SOP and return a structured resolution.

Below is the full SOP. Treat it as the authoritative source of truth. If the invoice's
SupplierType is not covered by the SOP, say so explicitly rather than guessing.

<SOP>
${SOP_TEXT}
</SOP>

Segment string format (10 dot-separated parts, always in this order):
CompanyID.LOB.Account.ReportingLine.CostCenter.Client.Intercompany.Location.Project.Spare

Example: CLA.141.6100000.609007.12001.CLIENT.999.BE12000.AA99999999.99999

You will receive a JSON "context" object describing one invoice: supplier, company,
approver, invoice header fields, matched PO candidates, supplier line history, 
exceptions if they are existing for the specific supplier, tax rates detected on the PDF,
and the raw extracted PDF text when available. The app has already computed a segment
string deterministically (context.existingComputedSegment, if present) — use it as a
starting point/reference, but correct it if the SOP indicates it's wrong, and explain why.

Respond with ONLY a single JSON object, no markdown fences, no prose outside the JSON,
matching exactly this shape:

{
  "summary": { "status": "OK" | "DISCREPANCY" | "BLOCKED" },
  "discrepancies": [ { "type": "string", "message": "string" } ],
  "suggestedSegment": "string or null — the exact 10-part segment string per the SOP",
  "taxClassification": { "code": "string or null", "rate": "string or null", "label": "string or null" },
  "supplierHistory":{"description": "string or null", "segments":"string or null — the exact 10-part segment string per the line description"}
  "actions": { "primary": "string", "alternatives": [ "string" ] }
}

STRICT JSON RULES — this response is parsed by JSON.parse() with no manual fixing, so:
- Every object must contain ONLY the keys shown above. Never add extra keys, and never add
  a bare string/value as an extra array element (e.g. do NOT write
  { "type": "...", "message": "...", "some extra note" } — that is invalid JSON and will fail).
- If you want to cite the SOP rule that applies, weave it into the "message" text itself
  (e.g. "...per Consumables_PO variance tolerance rule."), never as a separate value.
- No trailing commas. No comments. No text before "{" or after the final "}".

Rules for filling this out:
- "status": OK if nothing needs a human's attention; DISCREPANCY if something needs a
  correction but can be posted after fixing; BLOCKED if the SOP says to halt processing
  (e.g. buyer must amend the PO, invoice exceeds PO value on TrainingPersonnel_PO, etc.).
- "discrepancies": one entry per issue found (VAT mismatch, PO status invalid, variance
  outside tolerance, missing Requester field where required, wrong tax code, etc.). List
  at most 5, ordered by importance — merge minor/related points into one entry rather than
  splitting them out. Keep each "message" to 1–2 sentences, not a paragraph.
- "suggestedSegment": set to null only if the SOP does not define a segment for this SupplierType 
and the PO Item Description is not found in the Supplier Lines History table
  (see "Known Gaps" in the SOP) — in that case say so in a discrepancy entry instead.
- "taxClassification.label": a short phrase (under ~15 words), not a paragraph.
- "actions.primary": one clear next step for the AP operator, in plain language.
- "actions.alternatives": any secondary options (e.g. "escalate to buyer", "escalate to KAM").
- Keep messages concise and specific — cite the SOP rule that applies (e.g. "Consumables_PO:
  CHEP has no PO requirement, route to KAM").`;
}

// POST /ai/validate
// body: { mode: "validate_invoice", context: {...} }
app.post("/ai/validate", async (req, res) => {
    if (!ANTHROPIC_API_KEY) {
        return res.status(500).json({
            error: "Server is missing ANTHROPIC_API_KEY. Add it to server/.env and restart."
        });
    }

    const { mode, context } = req.body || {};
    if (!context) {
        return res.status(400).json({ error: "Missing 'context' in request body." });
    }

    const userMessage = `mode: ${mode || "validate_invoice"}

context:
${JSON.stringify(context, null, 2)}

Analyze this invoice against the SOP and return the JSON resolution object described in the system prompt.`;

    try {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01"
            },
            body: JSON.stringify({
                model: ANTHROPIC_MODEL,
                max_tokens: 8000,
                thinking: { type: "disabled" },
                system: [
                    {
                        type: "text",
                        text: buildSystemPrompt(),
                        cache_control: { type: "ephemeral", ttl: "1h" }
                    }
                ],
                messages: [{ role: "user", content: userMessage }]
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error("Anthropic API error:", response.status, errText);
            return res.status(502).json({ error: `Anthropic API error ${response.status}` });
        }

        const data = await response.json();
        if (data.usage) {
            console.log(
                `Tokens — input: ${data.usage.input_tokens}, ` +
                `cache read: ${data.usage.cache_read_input_tokens || 0}, ` +
                `cache write: ${data.usage.cache_creation_input_tokens || 0}, ` +
                `output: ${data.usage.output_tokens}`
            );
        }
        const textBlock = (data.content || []).find((b) => b.type === "text");
        const raw = textBlock ? textBlock.text : "";

        if (!raw) {
            console.error("No text content in Anthropic response.");
            console.error("stop_reason:", data.stop_reason);
            console.error("Full response:", JSON.stringify(data, null, 2));
            return res.status(502).json({
                error: `Anthropic returned no text content (stop_reason: ${data.stop_reason || "unknown"}).`,
                fullResponse: data
            });
        }

        let parsed;
        let cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();

        // If the model added any stray text before/after the object,
        // pull out just the outermost { ... } block.
        const firstBrace = cleaned.indexOf("{");
        const lastBrace = cleaned.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            cleaned = cleaned.slice(firstBrace, lastBrace + 1);
        }

        try {
            parsed = JSON.parse(cleaned);
        } catch (firstErr) {
            // Fallback repair: strip a stray unlabeled string value that sometimes
            // gets appended to an object instead of a proper "key": "value" pair,
            // e.g. { "type": "...", "message": "...", "extra note" }  →  { "type": "...", "message": "..." }
            try {
                const repaired = cleaned.replace(/,\s*"(?:[^"\\]|\\.)*"\s*(?=[}\]])/g, "");
                parsed = JSON.parse(repaired);
                console.warn("⚠️ AI response needed JSON repair (stray trailing value removed).");
            } catch (secondErr) {
                console.error("Failed to parse AI response as JSON.");
                console.error("Parse error:", firstErr.message);
                console.error("----- RAW RESPONSE START -----");
                console.error(raw);
                console.error("----- RAW RESPONSE END -----");
                return res.status(502).json({
                    error: "AI response was not valid JSON.",
                    raw
                });
            }
        }

        return res.json(parsed);
    } catch (err) {
        console.error("AI validate failed:", err);
        return res.status(500).json({ error: err.message });
    }
});

// ----------------------------------------
// NEW ENDPOINT FOR RASTER PDF → OCR
// ----------------------------------------
// POST /api/process-invoice
// Body: { base64: "JVBERi0xLjc…", optional: {supplierId, ...} }
app.post("/api/process-invoice", async (req, res) => {
    try {
        const { base64 } = req.body;

        if (!base64) {
            return res.status(400).json({
                error: "Missing Base64 input"
            });
        }

        // Call the new processing engine
        const result = await convertAndProcessBase64(base64);

        // Return both files back in Base64 format
        return res.json({
            status: "ok",
            isRasterBased: result.isRasterBased,
            ocrConfidence: result.ocrConfidence,
            originalFile: result.originalFile.toString("base64"),
            processedTextFile: result.processedTextFile
                ? result.processedTextFile.toString("base64")
                : null
        });
    } catch (err) {
        console.error("❌ /api/process-invoice error:", err);
        return res.status(500).json({ error: err.message });
    }
});

// ----------------------------------------
// HEALTH CHECK
// ----------------------------------------
app.get("/health", (req, res) => res.json({ status: "OK", sopLoaded: SOP_TEXT.length > 0 }));

// ----------------------------------------
// SERVER START
// ----------------------------------------
const PORT = process.env.PORT || 5501;
app.listen(PORT, () =>
    console.log(`AI Validation server running on port ${PORT}`)
);
