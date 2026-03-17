import express from "express";
import cors from "cors";

// EXISTING ROUTE (UNCHANGED)
import validateEnhanced from "./routes/validateEnhanced.js";

// NEW: OCR / RASTER PDF PROCESSING FUNCTION
import { convertAndProcessBase64 } from "./convertAndProcessBase64.js";

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
app.get("/health", (req, res) => res.json({ status: "OK" }));

// ----------------------------------------
// SERVER START
// ----------------------------------------
const PORT = process.env.PORT || 5500;
app.listen(PORT, () =>
    console.log(`AI Validation server running on port ${PORT}`)
);

