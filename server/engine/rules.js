/**
 * rules.js - Financial Controller Validation Logic
 */
import { parseDDMMYYYY } from "./utils.js";

export const validationRules = {
    vatBE: /^BE0\d{9}$/i,
    // Expanded placeholders to include "Folio" and Dutch "Klantnummer"
    placeholders: /^(folio|klantnummer|id|customer|invoice|unknown|n\/a)$/i,
    docTypes: ["invoice", "credit note"],
};

export async function runAllRules(payload, config = {}) {
    const alerts = [];
    const inv = payload?.invoice ?? {};
    const raise = (code, severity, message) => alerts.push({ code, severity, message });

    // 1. VAT Check (Our VAT)
    if (inv.ReceiverVAT !== config.companyOfficialVAT) {
        raise("OUR_VAT_MISMATCH", "blocker", `Expected ${config.companyOfficialVAT}, found ${inv.ReceiverVAT}`);
    }

    // 2. Supplier VAT (Against Registry format)
    if (!inv.SupplierVAT || !validationRules.vatBE.test(inv.SupplierVAT)) {
        raise("SUPPLIER_VAT_INVALID", "warning", "Supplier VAT missing or invalid BE format.");
    }

    // 3. Doc Type Check
    const docType = String(inv.SupplierType || "").toLowerCase();
    if (!validationRules.docTypes.includes(docType)) {
        raise("INVALID_DOC_TYPE", "warning", `Document type is "${docType || 'Other'}". Expected Invoice/Credit Note.`);
    }

    // 4. Invoice # Placeholder Check
    if (validationRules.placeholders.test(inv.InvoiceNumber)) {
        raise("POTENTIAL_PLACEHOLDER", "blocker", `Invoice number "${inv.InvoiceNumber}" detected as placeholder.`);
    }

    // 5. Date Delta (90 Days Policy)
    const issue = parseDDMMYYYY(inv.IssueDate);
    const due = parseDDMMYYYY(inv.DueDate);
    if (issue && due) {
        const diffDays = Math.floor((due - issue) / (1000 * 60 * 60 * 24));
        if (diffDays > 90) {
            raise("DATE_DELTA_EXCESSIVE", "warning", `Payment terms (${diffDays} days) exceed 90-day policy.`);
        }
        if (diffDays < 0) {
            raise("DATE_DELTA_NEGATIVE", "blocker", "Due date is set before Issue Date.");
        }
    }

    // 6. Currency Check
    if (inv.Currency && inv.Currency.toUpperCase() !== 'EUR') {
        raise("NON_EUR_TRANSACTION", "warning", `Transaction currency is ${inv.Currency}. Manual FX adjustment required.`);
    }

    return { 
        ok: !alerts.some(a => a.severity === "blocker"), 
        alerts,
        summary: alerts.length === 0 ? "Pass" : (alerts.some(a => a.severity === "blocker") ? "Fail" : "Review Required")
    };
}