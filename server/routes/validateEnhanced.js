import { runAllRules } from "../engine/rules.js";
import { suggestGLAccounts } from "../engine/glEngine.js";
import { computeScore, nowISO } from "../engine/utils.js";

export default async function validateEnhanced(req, res) {
  try {
    const payload = req.body; // v1 schema
    const alerts = runAllRules(payload);

    const llmInput = {
      SupplierName: payload?.invoice?.SupplierName,
      SupplierVAT:  payload?.invoice?.SupplierVAT,
      SupplierType: payload?.invoice?.SupplierType,
      ItemDescription: payload?.lines?.ItemDescription?.slice(0, 5) || [],
      HistoricalGL:   payload?.context?.SupplierGLHistory?.slice(0, 5) || [],
      POHints: (payload?.context?.POHeaders || []).map(p => ({
        category: null,
        description: p?.ItemDescription || null
      }))
    };

    const glSuggestions = await suggestGLAccounts(llmInput);
    if (!glSuggestions.length) {
      alerts.push({
        code: "UNABLE_TO_DETERMINE_GL",
        severity: "info",
        message: "Unable to determine account; please select manually based on [Manual Name]."
      });
    }

    const score = computeScore(alerts, glSuggestions);
    const summaryStatus =
      alerts.some(a => a.severity === "blocker") ||
      (glSuggestions[0]?.confidence ?? 0) < 0.75
        ? "Attention Required"
        : "High Confidence Validation";

    res.json({
      summary: { status: summaryStatus, score },
      discrepancies: alerts,
      glSuggestions,
      nextActions: {
        primary: summaryStatus === "High Confidence Validation"
          ? "Post to accounting"
          : "Resolve alerts and re-validate",
        alternatives: [
          "Request PO from supplier",
          "Correct invoice number",
          "Confirm due date"
        ]
      },
      audit: { rulesVersion: "2026-02-18", promptId: "validate_v1", timestamp: nowISO() }
    });
  } catch (err) {
    console.error("Validation Error:", err);
    res.status(500).json({ error: err.message || "Internal Server Error" });
  }
}
