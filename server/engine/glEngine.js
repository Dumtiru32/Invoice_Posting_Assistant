/**
 * glEngine.js - Enhanced GL Mapping Engine
 * Priority: Level 1 (Manual) > Level 2 (Group Query) > Level 3 (History)
 */

export async function determinePostingSegments({
  poDetails = [],        
  manualTable = [],      
  segmentsQuery = [],    
  supplierHistory = []
}) {
  const results = [];

  // Indexing for performance (< 2s requirement)
  const manualMap = new Map(manualTable.map(item => [item.Label?.toLowerCase(), item.Segment]));
  const queryMap = new Map(segmentsQuery.map(item => [item.Description?.toLowerCase(), item]));

  for (const line of poDetails) {
    const desc = (line["Item Description"] || "").toLowerCase().trim();
    let match = null;
    let method = "";
    let confidence = 0;

    // LEVEL 1: Manual Table (Highest Priority - Supports partial Dutch/English matching)
    // We check if the manual label is contained within the PO description
    for (let [label, segment] of manualMap) {
      if (desc.includes(label)) {
        match = segment;
        method = "Manual Table";
        confidence = 0.95;
        break;
      }
    }

    // LEVEL 2: Group Supplier Segments Query
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

    // LEVEL 3: History Fallback
    if (!match) {
      const histEntry = supplierHistory.find(r => desc === String(r.Description || "").toLowerCase());
      match = histEntry?.AccountingString || histEntry?.Segment || null;
      method = "History";
      confidence = 0.70;
    }

    // LEVEL 4: Final Assembly & Dynamic Replacements
    if (match) {
      const finalString = applyDynamicReplacements(match, line);
      const parts = finalString.split('.');
      
      results.push({
        glAccount: parts[2] || "N/A",
        costCenter: parts[4] || "N/A",
        accountingString: finalString,
        confidence: `${(confidence * 100)}%`,
        method: method,
        invalidSegments: checkInvalidSegments(finalString)
      });
    } else {
      results.push({
        description: desc,
        glAccount: "Unknown",
        accountingString: "Unknown Segments Correspondence",
        confidence: "0%",
        method: "Fallback",
        error: "No historical or manual record found for this description. Please provide segment correspondence."
      });
    }
  }
  return results;
}

function applyDynamicReplacements(rawString, poLine) {
  let parts = rawString.split('.');
  
  // Level 1 Logic: Replace Segment 6 (Index 5) if "Client"
  if (parts[5]?.toLowerCase() === "client") {
    parts[5] = poLine["Customer"] || "AA99999999";
  }
  
  // Level 1 Logic: Replace Segment 8 (Index 7) if Fleet placeholder exists
  // Checks for the specific placeholder patterns requested
  if (parts[7] === "AA99998" || parts[7] === "AA99999") {
    parts[7] = poLine["EquipmentFleetNumber"] || parts[7];
  }
  
  return parts.join('.');
}

function checkInvalidSegments(str) {
  const parts = str.split('.');
  const invalid = [];
  // Flag Seg8/Seg9 if they remain as placeholders
  if (parts[7]?.startsWith("AA999")) invalid.push("Seg8 (Fleet)");
  if (parts[8]?.startsWith("AA999")) invalid.push("Seg9 (Project)");
  return invalid.length > 0 ? invalid.join(', ') : "None";
}