// server.cjs  (CommonJS, robust logging)
const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Log absolute paths so we know *exactly* what's running
console.log("[BOOT] __dirname:", __dirname);
console.log("[BOOT] Starting Express...");

// Parse JSON bodies
app.use(express.json());

// Serve frontend from the current folder
app.use(express.static(path.resolve(__dirname)));
app.get("/", (req, res) => {
  res.sendFile(path.resolve(__dirname, "index.html"));
});

// Demo AI endpoints so your chat buttons return JSON
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
  console.log(`[OK] Server running at http://localhost:${PORT}`);
});