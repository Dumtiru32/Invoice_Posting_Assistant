// server.js (ESM)
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Parse JSON bodies (for your /ai/* routes)
app.use(express.json());

// Serve your frontend
app.use(express.static(path.resolve(__dirname)));
app.get("/", (req, res) => {
  res.sendFile(path.resolve(__dirname, "index.html"));
});

// ---- AI endpoints used by your chat ----
app.post("/ai/validate-enhanced", (req, res) => {
  res.json({
    summary: `<p><strong>Enhanced validation executed.</strong></p>`,
    discrepancies: `<ul><li>No discrepancies detected in test mode.</li></ul>`,
    segmentSuggestions: `
      <p><strong>Suggested Segment:</strong><br>
      CLA.141.6121030.603603.12001.ADEO.999.BE12000.63025247.99999
      </p>`
  });
});

app.post("/ai/retour-email", (req, res) => {
  const ctx  = req.body || {};
  const inv  = ctx?.invoice?.invoiceNumber || "Unknown";
  const comp = ctx?.company?.id || "UNKNOWN";
  res.json({
    subject: `Invoice ${inv} – Incorrect or Missing PO`,
    body:
`Hello,

Please find attached the INVOICE ${inv}, which contains incorrect data.

The PO number is missing or incorrect.
For suppliers requiring a PO, the correct format should be:
PO-${comp}-......

We cannot accept or process invoices without correct data.

Please resend the corrected invoice to:
AP.${comp}@Katoennatie.com

Payment reminders:
Finance.${comp}@Katoennatie.com

Best regards,`
  });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});