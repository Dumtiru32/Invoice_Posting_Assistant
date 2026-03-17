/**
 * glEngine.js - Enhanced GL Mapping Engine
 * Priority: Level 1 (Manual) > Level 2 (Group Query) > Level 3 (History)
 */

// ---------------------------------------------------------------------------
//  MAIN GL SEGMENT ENGINE
// ---------------------------------------------------------------------------
export async function determinePostingSegments({
    poDetails = [],
    manualTable = [],
    segmentsQuery = [],
    supplierHistory = []
}) {
    const results = [];

    // index structures (performance <2s)
    const manualMap = new Map(
        manualTable.map(item => [item.Label?.toLowerCase(), item.Segment])
    );

    const queryMap = new Map(
        segmentsQuery.map(item => [item.Description?.toLowerCase(), item])
    );

    for (const line of poDetails) {
        const desc = (line["Item Description"] ?? "").toLowerCase().trim();
        let match = null;
        let method = "";
        let confidence = 0;

        // --------------------------
        // LEVEL 1 – Manual Table
        // --------------------------
        for (let [label, segment] of manualMap) {
            if (desc.includes(label)) {
                match = segment;
                method = "Manual Table";
                confidence = 0.95;
                break;
            }
        }

        // --------------------------
        // LEVEL 2 – Group Supplier Query
        //--------------------------
        if (!match) {
            const qryEntry = queryMap.get(desc);
            if (qryEntry) {
                match = [
                    qryEntry.Company, qryEntry.Segment2, qryEntry.GLAccountNr,
                    qryEntry.Segment4, qryEntry.Segment5, qryEntry.Customer,
                    qryEntry.Intercompany, qryEntry.Segment8, qryEntry.Project
                ].join('.');
                method = "Group Query";
                confidence = 0.85;
            }
        }

        // --------------------------
        // LEVEL 3 – History Fallback
        // --------------------------
        if (!match) {
            const histEntry = supplierHistory.find(
                r => desc === String(r.Description ?? "").toLowerCase()
            );
            match = histEntry?.AccountingString ?? histEntry?.Segment ?? null;
            method = "History";
            confidence = 0.70;
        }

        // --------------------------
        // LEVEL 4 – Finish assembly
        // --------------------------
        if (match) {
            const finalString = applyDynamicReplacements(match, line);
            const parts = finalString.split('.');

            results.push({
                glAccount: parts[2] ?? "N/A",
                costCenter: parts[4] ?? "N/A",
                accountingString: finalString,
                confidence: `${confidence * 100}%`,
                method,
                invalidSegments: checkInvalidSegments(finalString)
            });

        } else {
            results.push({
                description: desc,
                glAccount: "Unknown",
                accountingString: "Unknown Segments Correspondence",
                confidence: "0%",
                method: "Fallback",
                error: "No manual, query, or history record found for this description."
            });
        }
    }

    return results;
}

// ---------------------------------------------------------------------------
//  HELPERS
// ---------------------------------------------------------------------------
function applyDynamicReplacements(rawString, poLine) {
    let parts = rawString.split('.');

    // Replace CLIENT placeholder
    if (parts[5]?.toLowerCase() === "client") {
        parts[5] = poLine["Customer"] ?? "AA99999999";
    }

    // Replace fleet placeholder
    if (parts[7] === "AA99998" || parts[7] === "AA99999") {
        parts[7] = poLine["EquipmentFleetNumber"] ?? parts[7];
    }

    return parts.join('.');
}

function checkInvalidSegments(str) {
    const parts = str.split('.');
    const invalid = [];

    if (parts[7]?.startsWith("AA999")) invalid.push("Seg8 (Fleet)");
    if (parts[8]?.startsWith("AA999")) invalid.push("Seg9 (Project)");

    return invalid.length ? invalid.join(', ') : "None";
}

// ---------------------------------------------------------------------------
//  NEW — UNIFIED GL ENGINE ENTRY POINT FOR AI, OCR, VALIDATION
// ---------------------------------------------------------------------------
/**
 * suggestGLAccounts()
 * This is the unified engine used by validateEnhanced.js
 * and now works perfectly with the OCR/raster PDF pipeline.
 */
export async function suggestGLAccounts(invoice, context) {
    try {
        const {
            poDetails = [],
            manualTable = [],
            segmentsQuery = [],
            supplierHistory = []
        } = context ?? {};

        const results = await determinePostingSegments({
            poDetails,
            manualTable,
            segmentsQuery,
            supplierHistory
        });

        return {
            success: true,
            count: results.length,
            results
        };

    } catch (err) {
        return {
            success: false,
            error: err.message,
            results: []
        };
    }
}

// Default export (optional, keeps compatibility)
export default {
    suggestGLAccounts,
    determinePostingSegments
};