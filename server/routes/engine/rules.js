import { normalize, parseDDMMYYYY } from "./utils.js";

export function runAllRules(p) {
  const alerts = [];

  const inv = p.invoice || {};
  const ctx = p.context || {};

  // -------------------------------
  // 1. VAT Integrity
  // -------------------------------
  if (normalize(inv.ReceiverVAT) !== normalize(ctx.CompanyOfficialVAT)) {
    alerts.push({
      code: "VAT_RECEIVER_NOT_OURS",
      severity: "blocker",
      message: "Receiver VAT on the document does not match our official VAT ID."
    });
  }

  // Basic supplier ↔ VAT sanity check
  if (!inv.SupplierName || !inv.SupplierVAT) {
    alerts.push({
      code: "VAT_SUPPLIER_NAME_MISSING",
      severity: "warn",
      message: "Supplier name or VAT is missing from payload."
    });
  }

  // -------------------------------
  // 2. PO requirement
  // -------------------------------
  const isPOtype = (inv.SupplierType || "").toUpperCase().endsWith("_PO");
  const detectedPOs = inv.DetectedPONumber || [];

  if (isPOtype && detectedPOs.length === 0) {
    alerts.push({
      code: "PO_REQUIRED_NOT_DETECTED",
      severity: "blocker",
      message: "PO required for this supplier but not detected."
    });
  }

  // PO Supplier match & status check
  for (const header of ctx.POHeaders || []) {
    const poSupplier = (header.Supplier || "").toLowerCase().trim();
    const invSupplier = (inv.SupplierName || "").toLowerCase().trim();

    if (poSupplier && invSupplier && !poSupplier.includes(invSupplier)) {
      alerts.push({
        code: "PO_SUPPLIER_MISMATCH",
        severity: "blocker",
        message: `PO supplier (“${header.Supplier}”) does not match invoice supplier (“${inv.SupplierName}”).`
      });
    }

    const badStatuses = ["CANCELED", "CLOSED", "REJECTED", "PENDING APPROVAL"];
    if (badStatuses.includes((header.POStatus || "").toUpperCase())) {
      alerts.push({
        code: "PO_STATUS_BLOCKING",
        severity: "blocker",
        message: `PO ${header.PONumber} is in a blocking status: ${header.POStatus}`
      });
    }
  }

  // -------------------------------
  // 3. Invoice Number Heuristics
  // -------------------------------
  const n = (inv.InvoiceNumber || "").toLowerCase();
  if (/klantnummer|customer\s*id|folio|account/.test(n)) {
    alerts.push({
      code: "INV_NO_LOOKS_LIKE_CUSTOMER_ID",
      severity: "warn",
      message: "Potential Invoice Number mismatch; value resembles a Customer/Folio/Account ID."
    });
  }

  // -------------------------------
  // 4. Temporal Rules
  // -------------------------------
  const issue = parseDDMMYYYY(inv.IssueDate);
  const due   = parseDDMMYYYY(inv.DueDate);

  const today = new Date();

  if (issue && issue > today) {
    alerts.push({
      code: "DATE_IN_FUTURE",
      severity: "warn",
      message: "Issue Date is in the future."
    });
  }

  if (issue && due && due <= issue) {
    alerts.push({
      code: "DUE_BEFORE_ISSUE",
      severity: "warn",
      message: "Due Date is earlier than Issue Date."
    });
  }

  // -------------------------------
  // 5. Currency Logic
  // -------------------------------
  const invCur = (inv.Currency || "").toUpperCase();
  const poCur  = (ctx.POHeaders?.[0]?.Currency || "").toUpperCase();

  if (invCur && poCur && invCur !== poCur) {
    alerts.push({
      code: "CURRENCY_MISMATCH",
      severity: "warn",
      message: `Invoice currency (${invCur}) differs from PO currency (${poCur}).`
    });
  }

  return alerts;
}