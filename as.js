function makeSegments(company, manual, approver, supplierVAT, debug = false) {
      let debugInfo = "";

      // --- 1️⃣ Exception handling (safe + debug) ---
      if (company && manual && !approver) {
        if (manual.ManualBTWException && manual.ManualSegmentException) {
          const vatMatch =
            normalizeVAT(supplierVAT) === normalizeVAT(manual.ManualBTWException);

          if (!approver && vatMatch && manual.ManualSegmentException.trim() !== "") {
            if (debug) {
              debugInfo += `🧩 Exception applied for VAT ${supplierVAT} → ${manual.ManualSegmentException}\n`;
              if (!approver)
                debugInfo += `ℹ Approver not detected but skipped due to supplier exception rule.\n`;
            }
            return `⚙ Exception applied → ${manual.ManualSegmentException}`;
          } else if (debug) {
            debugInfo += `ℹ Exception skipped: ${
              !vatMatch
                ? `Supplier VAT (${supplierVAT}) does not match Manual.ManualBTWException (${manual.ManualBTWException})`
                : "ManualSegmentException is empty"
            }.\n`;
          }
        } else if (debug) {
          debugInfo += `ℹ No exception fields (ManualBTWException / ManualSegmentException) found in Manual record.\n`;
        }
      }

      // --- 2️⃣ Use predefined segment if available ---
      if (approver && approver.Segments && approver.Segments.trim()) {
        if (debug) debugInfo += "✔ Approver segment used (custom segment present).\n";
        return approver.Segments;
      }

      // --- 3️⃣ Diagnostic: check missing data ---
      const missing = [];
      if (!company) missing.push("Company");
      if (!manual) missing.push("Manual (entity-operation link)");
      if (!approver) missing.push("Approver (client/customer match)");

      if (missing.length > 0) {
        if (debug)
          debugInfo += `⚠ Incomplete data for segment: Missing ${missing.join(", ")}.\n`;
        return debugInfo || `⚠ Incomplete data for segment: Missing ${missing.join(", ")}.`;
      }