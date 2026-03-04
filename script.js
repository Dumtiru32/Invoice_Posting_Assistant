
    // ------------------------------
    //  Inline JSON tables
    // ------------------------------
    
    const tva = {
      "0%":{
        country: {
          BE: {
            "SZ":{
              operation:"Provision_NPO, Transport_NPO, Travel_NPO, TrainingPersonnel_PO",
              label: "Service Zero"
                },
            "SS-RC":{
              operation:"",
              label: "Services Standard - reverse charge"
                },
            "NL":{
              operation:"",
              label: "Non Liable"
                }        
              }
        },
        value: 0
      },
      "6%":{
        country: {
          BE: {
            "SL":{
              operation:"Coffee, Consumables_PO, Travel_PO, TeamEevent_PO, TrainingPersonnel_PO",
              label: "Services Low"
                },
            "SL100":{
              operation:"Personnel_party, TeamEevent_PO",
              label: "Services Standard - 100% non deductable"
                },      
              }
          },
          value: 6
          },
      "12%":{
        country: {
          BE: {
            "SM":{
              operation:"Consumables_PO",
              label: "Services Medium"
                },
            "SM100":{
              operation:"Personnel_party, TeamEevent_PO",
              label: "Services Standard - 100% non deductable"
                },    
              }
          },
          value: 12
          },
      "21%":{
        country: {
          BE: {
            "SS":{
              operation:"Bonus_PO, Services_PO, TeamEevent_PO, Transport_PO, Provision_PO, Provision_NPO, Transport_NPO, Software_PO, Travel_NPO, TrainingPersonnel_PO, Software_PO, RentEquipment_PO, Maintenance_PO",
              label: "Services Standard"
                },
            
            "SS100":{
              operation:"Personnel_party, TeamEevent_PO",
              label: "Services Standard - 100% non deductable"
                },       
            "SS-PM":{
              operation:"Goods, Consumables_PO, PalletRent_NPO, SmallMaterials_PO",
              label: "Services Standard - packing material"
                },
            "SS65":{
              operation:"CarRepair_PO",
              label: "Services Standard - 65% non deductable"
                },
            "IS":{
              operation:"Investments",
              label: "Investments Standard"
                },
            "IS-RC":{
              operation:"Investments",
              label: "Investments Standard - reverse charge"
                },
            "IS-RC100":{
              operation:"Investments",
              label: "Investment Standard - 100% non decuctable - reverse charge"
                } ,
            "IS65":{
              operation:"Investments, CarRepair_PO",
              label: "Investments Standard - 65% non decuctable"
                },
            "SS-RC":{
              operation:"Maintenance_PO, Consumables_PO",
              label: "Service Standard - reverse charge"
                }          
              }
          },
          value: 21
          }
    }

    //Tax Category
    const TAX_CATEGORY_MAP = {
      AE: "VAT Reverse Charge",
      E: "Exempt from Tax",
      S: "Standard rate",
      Z: "Zero rated goods",
      G: "Free export item, VAT not charged",
      O: "Service outside scope of tax"
    };

    // ------------------------------
    //  Core logic
    // ------------------------------
    document.getElementById("convertBtn")
    .addEventListener("click", decodeBase64ToPDF);

    document.getElementById("emtyButton")
    .addEventListener("click", emptyTextarea);
    
    //======= CHATBOT ========
    // ====== DOM elements ======
    
    const chat      = document.getElementById("ap-ai-chat");
    const messages  = document.getElementById("ap-ai-messages");
    const input     = document.getElementById("ap-ai-input");
    const sendBtn   = document.getElementById("ap-ai-send");
    const closeBtn  = document.getElementById("ap-ai-close");
    const minBtn    = document.getElementById("ap-ai-minimize");
    const dragBar   = document.getElementById("ap-ai-chat-drag");

    // ====== Open / Close / Minimize ======
   
    closeBtn.addEventListener("click", () => {
      chat.hidden = true;
    });
    let minimized = false;
    minBtn.addEventListener("click", () => {
      minimized = !minimized;
      chat.querySelector(".ap-ai-chat__messages").style.display = minimized ? "none" : "block";
      chat.querySelector(".ap-ai-chat__composer").style.display = minimized ? "none" : "grid";
    });

    // ====== Draggable (simple) ======
    (function makeDraggable(panel, handle) {
      let startX = 0, startY = 0, startLeft = 0, startTop = 0, dragging = false;
      handle.addEventListener("mousedown", (e) => {
        dragging = true;
        const rect = panel.getBoundingClientRect();
        startLeft = rect.left;
        startTop  = rect.top;
        startX = e.clientX;
        startY = e.clientY;
        document.body.style.userSelect = "none";
      });
      window.addEventListener("mousemove", (e) => {
        if (!dragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        panel.style.left = Math.max(6, startLeft + dx) + "px";
        panel.style.top  = Math.max(6, startTop  + dy) + "px";
        panel.style.right = "auto";
        panel.style.bottom = "auto";
        panel.style.position = "fixed";
      });
      window.addEventListener("mouseup", () => {
        dragging = false;
        document.body.style.userSelect = "";
      });
    })(document.getElementById("ap-ai-chat"), dragBar);

    // ====== Utilities ======
    function appendUserMsg(text) {
      const el = document.createElement("div");
      el.className = "ap-ai-msg ap-ai-msg--user";
      el.textContent = text.trim();
      messages.appendChild(el);
      messages.scrollTop = messages.scrollHeight;
    }
    function appendBotMsg(html) {
      const el = document.createElement("div");
      el.className = "ap-ai-msg ap-ai-msg--bot";
      el.innerHTML = html;
      messages.appendChild(el);
      messages.scrollTop = messages.scrollHeight;
    }
    function setLoading(loading) {
      sendBtn.disabled = loading;
      input.disabled = loading;
      sendBtn.textContent = loading ? "Working…" : "Send";
    }

    // ====== Build the AI payload from your existing variables in script.js ======
    // This relies on variables you already fill inside script.js (Supplier, Company, Approver, PoData etc.).
    // We'll expose a helper on window from script.js to get the latest context (see Step 4).
    async function callValidate() {
      const ctx = window.buildAiContext ? window.buildAiContext() : null;
      if (!ctx) {
        appendBotMsg("<strong>⚠️ I couldn't gather invoice context.</strong><br>Process a PDF first, then try again.");
        return;
      }

      setLoading(true);
      try {
        const res = await fetch("/ai/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "validate_invoice", context: ctx })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        // Render a friendly summary
        let html = "<h4>AI Findings</h4>";
        if (data.summary?.status) html += `<div class="ap-ai-small"><strong>Status:</strong> ${data.summary.status}</div>`;

        if (Array.isArray(data.discrepancies) && data.discrepancies.length) {
          html += "<ul>";
          for (const d of data.discrepancies) {
            html += `<li><strong>${d.type || "Issue"}:</strong> ${d.message || ""}</li>`;
          }
          html += "</ul>";
        } else {
          html += "<div>No discrepancies reported in this test response.</div>";
        }

        if (data.actions?.primary) {
          html += `<div style="margin-top:8px;"><strong>Suggested action:</strong> ${data.actions.primary}</div>`;
          if (Array.isArray(data.actions.alternatives) && data.actions.alternatives.length) {
            html += `<div class="ap-ai-small">Alternatives: ${data.actions.alternatives.join(" | ")}</div>`;
          }
        }

        appendBotMsg(html);
      } catch (err) {
        appendBotMsg(`<strong>❌ Error:</strong> ${err.message}`);
      } finally {
        setLoading(false);
      }
    }

    // ====== Composer behavior ======
    
    let lastSent = "";

    sendBtn?.addEventListener("click", () => {
        const text = input.value.trim();
        if (!text || text === lastSent) return; // prevents duplicates

        lastSent = text;
        appendUserMsg(text);
        input.value = "";
        input.focus();
    });


      input?.addEventListener("keydown", (e) => {
          if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();

              // Do NOT trigger click() again if already sending
              if (!sendBtn.disabled) {
                  sendBtn.dispatchEvent(new Event("click"));
              }
          }
      });




    
    function emptyTextarea() {
        const textarea = document.getElementById("base64Input");
        textarea.value = "";     // Clear the content
      }

    
    /**
     * Convert Base64 (raw or data URL) to a Blob
     * @param {string} base64 - The Base64 string (may include data URL prefix).
     * @param {string} mimeType - e.g., "application/pdf"
     * @returns {Blob}
     */
    function base64ToBlob(base64, mimeType = "application/pdf") {
      // Strip surrounding whitespace
      let input = (base64 || "").trim();

      // If it's a data URL, strip the prefix: "data:...;base64,"
      const dataUrlPrefix = /^data:.*;base64,/i;
      if (dataUrlPrefix.test(input)) {
        input = input.replace(dataUrlPrefix, "");
      }

      // Remove any whitespace/newlines that may have been pasted
      input = input.replace(/\s+/g, "");

      // Basic validation
      if (!input) {
        throw new Error("No Base64 content found.");
      }

      // Decode Base64 → binary string
      // atob expects valid Base64; will throw if invalid.
      const binaryString = atob(input);

      // Convert binary string → Uint8Array
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      return new Blob([bytes], { type: mimeType });
    }

    /**
     * Trigger a download of a Blob in the browser.
     * @param {Blob} blob
     * @param {string} filename
     */
      function downloadBlob(blob, filename = "output.pdf") {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          a.remove();
          // Revoke the object URL shortly after to free memory
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }

        /**
         * Main entry point called by the button.
         * Reads Base64 from #base64Input, decodes to PDF, downloads it.
         */
        
        
        function decodeBase64ToPDF() {
          const textarea = document.getElementById("base64Input");
          const raw = textarea?.value || "";

          console.clear();

          console.log("Raw length:", raw.length);
          console.log("Raw first 100 chars:", raw.slice(0, 100));
          console.log("Raw last 100 chars:", raw.slice(-100));

          const cleaned = cleanBase64Strict(raw);

          console.log("Cleaned length:", cleaned.length);
          console.log("Cleaned first 100 chars:", cleaned.slice(0, 100));
          console.log("Cleaned last 100 chars:", cleaned.slice(-100));

          try {
            // 🔴 THIS LINE IS KEY
            const binary = atob(cleaned);
            console.log("atob SUCCESS ✅, binary length:", binary.length);

            // Verify PDF signature after decode
            console.log(
              "Decoded header:",
              binary.charCodeAt(0),
              binary.charCodeAt(1),
              binary.charCodeAt(2),
              binary.charCodeAt(3)
            );

            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i);
            }

            const blob = new Blob([bytes], { type: "application/pdf" });
            
            const url = URL.createObjectURL(blob);
            console.log("Blob URL:", url);

            // Open in new tab (strongest diagnostic)
            window.open(url, "_blank");


          } catch (e) {
            console.error("❌ atob FAILED:", e.message);
            alert("Base64 decode failed. Check console.");
          }
        }



        
        function cleanBase64(base64) {
          return base64
            // remove data URL if present
            .replace(/^data:application\/pdf;base64,/, "")
            // remove escaped characters from JSON
            .replace(/\\+/g, "")
            // remove whitespace and line breaks
            .replace(/\s+/g, "");
        }

        
        function base64ToBlob(base64, contentType = "") {
          const binary = atob(base64);
          const bytes = new Uint8Array(binary.length);

          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }

          return new Blob([bytes], { type: contentType });
        }
        
        function cleanBase64Strict(input) {
          return input
            // remove data URI if present
            .replace(/^data:application\/pdf;base64,/, "")
            // FIX JSON escaped Base64 (\+ \/)
            .replace(/\\\//g, "/")
            .replace(/\\\+/g, "+")
            // remove everything NOT Base64
            .replace(/[^A-Za-z0-9+/=]/g, "");
        }




      function getSupplierTypes(supplier) {
      if (!supplier || !supplier.SupplierType) return [];
      return supplier.SupplierType
        .split(/[;,]/)        // split by comma or semicolon
        .map(t => t.trim().toLowerCase())
        .filter(Boolean);
    }
    // Utility: normalize VAT number (remove BE prefix, dots, spaces, etc.)
    function normalizeVAT(v) {
      return (v || "").toString().replace(/[^0-9]/g, "").replace(/^0+/, "").replace(/[ÓÒÔÕÖ]/gi,"0");
    }

    function normalizeText(s) {
      return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "").trim();
    }

    function normalizeHyphens(str) {
      return str
        .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, "-"); 
    }
    // Removes non‑breaking spaces and normalizes spacing
    function normalizeSpaces(str) {
      return String(str || "")
        .replace(/\u00A0/g, " ") // NBSP → normal space
        .replace(/\s+/g, " ")    // collapse whitespace
        .trim();
    }

    
    //Normalizes a PO core into safe canonical format (no PO prefix inside)
    function normalizePONumber(s) {
      if (!s) return "";

      return String(s)
        .toUpperCase()
        .replace(/\u00A0/g, " ")        // NBSP -> normal space
        .replace(/[\u2010-\u2015\u2212]/g, "-") // Unicode dashes -> "-"
        .replace(/[^A-Z0-9-]/g, "")     // remove non‑alphanumeric
        .replace(/-+/g, "-")            // collapse multiple dashes
        .replace(/^-|-$/g, "");         // trim leading/trailing dash
    }



    async function extractTextFromPDF(file) {
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      let text = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map(it => it.str || "").join(" ") + "\n";
      }
      return text.replace(/\s+/g, " ").trim();
    }

    function detectVATs(text, Company) {
      const re = /[A-Z]{0,2}\d{8,12}/g;
      const matches = text.match(re) || [];
      const unique = [...new Set(matches)];
      const ourVATs = Company.map(c => normalizeVAT(c.CompanyBTW));
      return unique.filter(v => !ourVATs.includes(normalizeVAT(v)));
    }

    function getManual(companyId, supplierTypeRaw) {

      const types = supplierTypeRaw
          ? supplierTypeRaw.split(/[;,]/).map(t => t.trim().toLowerCase())
          : [];

      const matchingManuals = Manual.filter(m =>
        m.ManualEntity === companyId &&
        types.includes(m.OperationType.toLowerCase().trim())
      );
    // Return the array, or null if no matches were found (for cleaner conditional checks later)
      return matchingManuals.length > 0 ? matchingManuals : null;
    }

    function getException(companyId, supplierTypeRaw, supplierVAT) {

      const types = supplierTypeRaw
          ? supplierTypeRaw.split(/[;,]/).map(t => t.trim().toUpperCase())
          : [];

      return Exception.filter(e =>
        e.ExceptionID === companyId &&
        types.includes(e.ExceptionType.toLowerCase().trim()) &&
        e.ExceptionBTW === supplierVAT
      );
    }
    function detectTaxRatePeppol(text) {
    //if (!supplier || !supplier["InvoiceN_label"]) return null;
    
    const label1 = "Tax CatId";
    //const label = "Document Currency Code:";
    const patternRight1 = new RegExp(`${label1}\\s*[:\\-]?\\s*([A-Za-z0-9\\-/]+)`, "i");
    //const patternRight = new RegExp(`${label}\\s*[:\\-]?\\s*([A-Za-z0-9\\-/]+)`, "i");
    //const patternBelow = new RegExp(`${label}[^\\n\\r]{0,30}[\\n\\r\\s]+([A-Za-z0-9\\-/]+)`, "i");

    let match = text.match(patternRight1);
    //if (match && match[1].toLowerCase() === "issue") {match = text.match(patternRight)};
    //if (!match) match = text.match(patternBelow);

    return match ? match[1].trim() : null;
  }

    //Find "reverse charge" 
    function detectReverseCharge(text) {
      const keyword = "verlegging";
      const taxCatId = detectTaxRatePeppol(text);

      // --- 1. Existing keyword-based logic (KEEP) ---
      if (text && text.toLowerCase().includes(keyword)) {
        return `❗ Reverse Charge detected: "Verlegging van heffing."`;
      }

      // --- 2. NEW: Tax Category ID logic ---
      if (taxCatId && TAX_CATEGORY_MAP[taxCatId]) {
        return `❗ Tax rate is <strong>${taxCatId}: ${TAX_CATEGORY_MAP[taxCatId]}</strong>`;
      }
      // --- 3. TAX CATEGORY detection fallback ---
      if (!TAX_CATEGORY_MAP[taxCatId]) {

        const detectedCategories = Object.keys(TAX_CATEGORY_MAP)
          .filter(key => new RegExp(`\\b${key}\\b`).test(text));

        if (detectedCategories.length > 0) {
          return detectedCategories
            .map(key => `❗ Tax rate is <strong>${key}: ${TAX_CATEGORY_MAP[key]}</strong>`)
            .join("\n");
        }
      }


      // --- 4. Fallback ---
      return `✅ Reverse Charge not detected.`;
    }
    // ------------------------------------------------------------
    // makeSegments() with refined exception logic
    // ------------------------------------------------------------
    function makeSegments(company, manualArray, exceptionArray, approver, supplierVAT, debug = false, supplier = null) {
    let debugInfo = debug ? "" : "";
    const outputSegments = [];

    // Preserve approver info as)
    if (approver?.Segments?.trim()) {
      if (debug) debugInfo += "📦 Predefined approver posting segment(s) detected; showing Manual table for override.\n";
      // Show them as info above the table instead of gating rendering
      debugInfo += `<div class="ap-hint">Predefined segments: <code>${approver.Segments}</code></div>`;
    }

    // Exception notes (do not return early)
    const supplierTypeRaw = supplier?.SupplierType ?? "";
    if (supplierTypeRaw.endsWith("NPO") && !approver) {
      const applied = (exceptionArray || []).filter(
        e => supplierVAT && normalizeVAT(e.ExceptionBTW) === normalizeVAT(supplierVAT)
      );
      if (applied.length > 0) {
        debugInfo += `⚙ Exception applied → ${applied
          .map(e => `${e.SegmentException} (VAT: ${e.ExceptionBTW})`)
          .join("<br>")}\n`;
      } else {
        debugInfo += `⚠️ No approver detected and no exception found.\n`;
      }
    }

    // Build manual table for ALL supplier types whenever manual rules exist
    const clientValue = (approver?.Client && approver.Client.trim()) ? approver.Client : "No Approver Assigned";
    if (Array.isArray(manualArray) && manualArray.length) {
      

      manualArray.forEach((manual) => {
        // 1) Priority: Manual value if present & non-empty
        // 2) Else: take Company.json default if the field exists in Company
        // 3) Else: safe literal fallback

        const LOB = (manual?.ManualLOB && manual.ManualLOB.trim() !== "")
          ? manual.ManualLOB
          : (company?.CompanyLineOfBusiness ?? "LOB"); // <-- real key from Company.json

        const ACCOUNT = (manual?.ManualAccount && manual.ManualAccount.trim() !== "")
          ? manual.ManualAccount
          : "ACC"; // Company.json has no CompanyAccount → safe fallback

        const RL = (manual?.ManualRL && manual.ManualRL.trim() !== "")
          ? manual.ManualRL
          : "RL"; // Company.json has no CompanyRL → safe fallback

        const CENTER = (manual?.ManualCenter && manual.ManualCenter.trim() !== "")
          ? manual.ManualCenter
          : "CTR"; // Company.json has no CompanyCenter → safe fallback

        const CLIENT = (approver?.Client && approver.Client.trim() !== "")
          ? approver.Client
          : ((manual?.ManualClient && manual.ManualClient.trim() !== "")
              ? manual.ManualClient
              : "No Approver Assigned");

        const INTERCOMPANY = (company?.CompanyIntercompany && String(company.CompanyIntercompany).trim() !== "")
          ? company.CompanyIntercompany
          : "IC";

        // NOTE: typo in some data: ManualLocatiion (double 'i'); keep both to be safe
        const LOCATION = (manual?.ManualLocatiion && manual.ManualLocatiion.trim() !== "")
          ? manual.ManualLocatiion
          : ((manual?.ManualLocation && manual.ManualLocation.trim() !== "")
              ? manual.ManualLocation
              : (company?.CompanyLocation ?? "LOC"));

        const PROJECT = (manual?.ManualProject && manual.ManualProject.trim() !== "")
          ? manual.ManualProject
          : (company?.CompanyProject ?? "PRJ");

        const SPARE = (company?.CompanySpare && String(company.CompanySpare).trim() !== "")
          ? company.CompanySpare
          : "SPARE";

        const seg = [
          company?.CompanyID ?? "CO",
          LOB,
          ACCOUNT,
          RL,
          CENTER,
          CLIENT,
          INTERCOMPANY,
          LOCATION,   // keep location before project to match the latest usage pattern
          PROJECT,
          SPARE
        ].join(".");

        const lineLabel = manual?.["ManualRC/NRC"] ?? "RC/NRC";
        outputSegments.push(`${lineLabel} - ${seg}`);
      });


      // Subtle UI + console note when approver missing
      if (!approver) {
        console.info("Approver data missing; displaying manual override table.");
        debugInfo += `<div class="ap-hint" style="margin:6px 0;color:#555;">Approver data missing; displaying manual override table.</div>`;
      }
      return debugInfo + buildSegmentsTable(outputSegments);
    }

    // If we have no manual rules, inform clearly but don't crash
    if (debug) debugInfo += `⚠️ No Manual mapping found for ${company?.CompanyID ?? "?"}/${supplier?.SupplierType ?? "?"}.\n`;
    return debugInfo + `<p>⚠️ No manual rules available for this supplier/company.</p>`;
  }


    // Build Segments Table
      function buildSegmentsTable(segments) {
        if (!segments || !segments.length) {
      return "<p>⚠️ No segments available to display.</p>";
    }

    // Split label and segment for sorting
    const parsed = segments.map(line => {
      const [label, segment] = line.split(" - ");
      return { label: (label || "").trim(), segment: (segment || "").trim() };
    });

    // Sort ascending by label (alphabetically, case-insensitive)
    parsed.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));

    // Calculate table width dynamically based on longest segment
    const maxLength = Math.max(...parsed.map(p => p.segment.length));
    const approxCharWidth = 8; // px per character
    const tableWidth = Math.min(1200, maxLength * approxCharWidth);

    // Build HTML table
    let html = `
      <table border="1" cellpadding="5" cellspacing="0"
            style="border-collapse:collapse; margin-top:10px; width:${tableWidth}px; table-layout:auto;">
        <thead style="background:#eef;">
          <tr>
            <th style="text-align:left; padding:6px;">Label</th>
            <th style="text-align:left; padding:6px;">Segment</th>
          </tr>
        </thead>
        <tbody>
    `;

    for (const { label, segment } of parsed) {
      html += `
        <tr>
          <td style="padding:6px;">${label}</td>
          <td style="padding:6px; font-family:monospace;">${segment}</td>
        </tr>`;
    }

    html += `
        </tbody>
      </table>
    `;

    return html;
    }

    // Detect Document Type
  // ------------------------------
  function detectDocumentType(text) {
  const normalized = text.toLowerCase();

  const invoiceKeywords = ["invoice", "factuur", "fattura", "factura", "rechnung", "facture"];
  const creditKeywords = ["creditnota", "krediet nota", "kredietnota", "credit nota"];

  if (creditKeywords.some(k => normalized.includes(k))) return "Credit Note";
  if (invoiceKeywords.some(k => normalized.includes(k))) return "Invoice";
  
  return "Other";
  }

  // ------------------------------
  // Detect Invoice Number
  // ------------------------------
  function detectInvoiceNumber(text, supplier) {
    if (!supplier || !supplier["InvoiceN_label"]) return null;

    const label = supplier["InvoiceN_label"];
    const patternRight = new RegExp(`${label}\\s*[:\\-]?\\s*([A-Za-z0-9\\-/]+)`, "i");
    const patternBelow = new RegExp(`${label}[^\\n\\r]{0,30}[\\n\\r\\s]+([A-Za-z0-9\\-/]+)`, "i");

    let match = text.match(patternRight);
    if (!match) match = text.match(patternBelow);

    return match ? match[1].trim() : null;
  }
    function detectInvoiceNumberPeppol(text, supplier) {
    if (!supplier || !supplier["InvoiceN_label"]) return null;
    
    const label1 = "INVOICE Number: ";
    const label = "Document Currency Code:";
    const patternRight1 = new RegExp(`${label1}\\s*[:\\-]?\\s*([A-Za-z0-9\\-/]+)`, "i");
    const patternRight = new RegExp(`${label}\\s*[:\\-]?\\s*([A-Za-z0-9\\-/]+)`, "i");
    const patternBelow = new RegExp(`${label}[^\\n\\r]{0,30}[\\n\\r\\s]+([A-Za-z0-9\\-/]+)`, "i");

    let match = text.match(patternRight1);
    if (match && match[1].toLowerCase() === "issue") {match = text.match(patternRight)};
    //if (!match) match = text.match(patternBelow);

    return match ? match[1].trim() : null;
  }
  
    /**
     * Extract all VAT rates that appear AFTER the first "Tax Rate" label,
     * normalize them visually, and return a unique list.
     *
     * @param {string} text - full PDF text
     * @returns {string[]} e.g., ["0 %", "6 %", "21 %"]
     */
      const TAX_RATE_LABEL = /tax\s*rate\s*[:\-]?\s*/i;
      const VAT_RATE_TOKEN = /\b(\d{1,2}(?:[.,]\d{1,2})?)\s*%/gi
    function getUniqueVatRatesAfterTaxRateLabel(text) {
      if (!text || typeof text !== 'string') return [];

      // 1) Find the "Tax Rate" label and slice from there
      const labelMatch = text.match(TAX_RATE_LABEL);
      if (!labelMatch) return []; // no label present

      const startIdx = labelMatch.index + labelMatch[0].length;
      const tail = text.slice(startIdx);

      // 2) Collect all percentage tokens after the label
      const uniques = new Set();
      let m;

      while ((m = VAT_RATE_TOKEN.exec(tail)) !== null) {
        // m[1] is the numeric part (e.g., "0", "21.0", "6,5", "12,00")

        // 3) Normalize numeric part:
        //    - convert comma to dot
        //    - trim trailing ".0" or ",0" where appropriate
        //    - but keep real decimals like 6.5
        let raw = m[1].replace(',', '.');
        // trim leading zeros while keeping "0" intact (e.g., "00" -> "0")
        if (/^\d+(\.\d+)?$/.test(raw)) {
          // convert to number to normalize, then back to string
          const n = Number(raw);
          // Keep at most one decimal if it's non-zero, else integer
          raw = Number.isInteger(n) ? String(n) : String(n).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
        } else {
          // in a rare case of weird token, keep as-is
          raw = m[1].replace(',', '.');
        }

        // 4) Final visual normalization: "X %" (single space before %)
        const pretty = `${raw} %`;

        uniques.add(pretty);
      }

      return [...uniques];
    }


  // ------------------------------
  // VAT Extraction and Classification Logic
  // ------------------------------
    function extractTaxClassifications(text, supplier, company, approver, tva) {
      const linesDiv = document.getElementById("dbg");
      linesDiv.innerHTML = ""; // reset previous table

      if (!supplier || !company) {
        linesDiv.innerHTML = "<p>⚠️ Missing supplier or company info for VAT extraction.</p>";
        return;
      }

      const supplierCountry = supplier.VAT?.slice(0, 2).toUpperCase() || "??";
      const ourCountry = company.CompanyBTW?.slice(0, 2).toUpperCase() || "??";
      const supplierType = supplier.SupplierType || "Unknown";

      // Parse tax lines (e.g., "21% - 1200 EUR", "0% - 100 EUR", etc.)

      const vatLinePattern = /(\d{1,2}(?:[.,]\d{1,2})?)%\s*[-:]?\s*([\d.,]+)\s*(?:EUR|€)/gi;
      const vatLines = [...text.matchAll(vatLinePattern)];

      // Table setup
      let html = `
      <table border="1" cellpadding="5" cellspacing="0" style="border-collapse:collapse;margin-top:10px;">
        <tr style="background:#eef;">
          <th>Amount (EUR)</th>
          <th>Distribution Set</th>
          <th>Description</th>
          <th>Tax Classification</th>
        </tr>`;

      // 🚛 Transport exception logic
      const transportException =
        supplierType.toLowerCase().includes("transport") && supplierCountry !== ourCountry;
      const vatRates = getUniqueVatRatesAfterTaxRateLabel(text);  
      if (vatRates.length === 0) {
        html += `⚠️ No Tax Rates found after "Tax Rate" label.\n`;

      } else {
        html += `🔢 Tax Rates detected: <strong>${vatRates.join(', ')}</strong>\n`;
      }
      

      // --- IMPROVED FALLBACK LOGIC (multi SupplierType aware) ---
      const possibleMatches = [];
      const seen = new Set(); // avoid duplicates

      // Normalize SupplierType into array
      const supplierTypes = supplierType
        .split(/[;,]/)
        .map(t => t.trim().toLowerCase())
        .filter(Boolean);

      for (const [rateKey, rateObj] of Object.entries(tva)) {
        const countryData = rateObj.country?.[ourCountry];
        if (!countryData) continue;

        for (const [taxCode, taxInfo] of Object.entries(countryData)) {
          if (!taxInfo.operation) continue;

          const operations = taxInfo.operation
            .split(',')
            .map(op => op.trim().toLowerCase());

          // Match EACH supplier type against EACH operation
          supplierTypes.forEach(st => {
            if (operations.includes(st)) {
              const dedupeKey = `${rateKey}|${taxCode}|${st}`;

              if (!seen.has(dedupeKey)) {
                seen.add(dedupeKey);
                possibleMatches.push({
                  supplierType: st.toUpperCase(),
                  rate: rateKey,
                  taxCode,
                  label: taxInfo.label
                });
              }
            }
          });
        }
      }


        
        if (!possibleMatches.length) {
          html += `
            <tr>
              <td colspan="4">❌ No TVA entries found for SupplierType(s): ${supplierTypes.join(', ')}</td>
            </tr>`;
        } else {
          for (const m of possibleMatches) {
            html += `
              <tr>
                <td>—</td>
                <td>${company.CompanyID}_DEFAULT</td>
                <td>${m.supplierType}</td>
                <td>${m.taxCode} (${m.rate}) – ${m.label}</td>
              </tr>`;
          }
        }


        html += `</table>`;
        linesDiv.innerHTML = html;
        return; // ✅ Stop further processing

      // --- Normal VAT detection logic (when PDF has tax lines) ---
      for (const match of vatLines) {
        const rate = match[1].split(/[.,]/)[0]; // extract only value before comma/dot
        const amount = match[2].replace(",", ".");
        let taxCode = "Unknown";
        let taxLabel = "Unknown Classification";
        const supplierTypes = getSupplierTypes(supplier);

        if (transportException) {
          taxCode = "SS";
          taxLabel = "Services Standard";
        } else if (tva[`${rate}%`]) {
          const tvaCountry = tva[`${rate}%`].country[ourCountry];
          if (tvaCountry) {
            for (const [key, value] of Object.entries(tvaCountry)) {
              if (supplierTypes.some(st => value.operation.toLowerCase().includes(st))) {
                taxCode = key;
                taxLabel = value.label;
                break;
              }
            }
          }
        }

        const distributionSet = `${company.CompanyID}_TRANSPORT RC`;
        const description = supplierType.toLowerCase().includes("transport")
          ? `Transport ${approver?.Client || "UnknownClient"}`
          : `${supplierType} ${approver?.Client || "UnknownClient"}`;

        html += `
          <tr>
            <td>${amount}</td>
            <td>${distributionSet}</td>
            <td>${description}</td>
            <td>${taxCode}: ${taxLabel}</td>
          </tr>`;
      }

      html += `</table>`;
      linesDiv.innerHTML = html;
    }
    // Detect Purchase Order Number
    // ------------------------------
    function detectPoNumbers(text, company) {
        if (!text) return null;

        // Normalize hyphens & NBSP
        const norm = normalizeSpaces(normalizeHyphens(text));

        // Build company ID clean variant
        const compId = company?.CompanyID
          ? company.CompanyID.replace(/[^A-Z0-9]/gi, "").toUpperCase()
          : null;

        const found = new Set();

        // 1) LABEL-BASED extraction (Purchase Order:, Order No:, PO:, etc.)
        const RX_LABEL_AFTER =
          /(?:buyer\s*reference\s*[:\-]?\s*)?(?:purchase\s*order|p\.?\s*o\.?|order\s*(?:no\.?|number|#))\s*[:\-]?\s*([A-Z]{2,})?[\u2010-\u2015\u2212\-_ \t]*([0-9]{3,})/gi;

        let m;
        while ((m = RX_LABEL_AFTER.exec(norm)) !== null) {
          const comp = m[1] ? m[1].toUpperCase() : compId;
          const num = m[2];
          const core = comp ? `${comp}-${num}` : num;
          found.add(core);
        }

        // 2) COMPANY-ID + digits (e.g., "CLA-00112731" with no PO prefix)
        if (compId) {
          const RX_COMP_ONLY = new RegExp(
            `\\b${compId}[\\u2010-\\u2015\\u2212\\-_ \\t]*([0-9]{3,})\\b`,
            "gi"
          );
          let c;
          while ((c = RX_COMP_ONLY.exec(norm)) !== null) {
            const num = c[1];
            found.add(`${compId}-${num}`);
          }
        }

        // 3) PO‑prefix legacy formats (P.O., PO-, etc.)
        const RX_PO_PREFIX =
          /p\.?\s*o\.?[\u2010-\u2015\u2212\-_:\s]*([A-Z0-9]{2,})?[\u2010-\u2015\u2212\-_:\s]*([0-9]{3,})/gi;

        let p;
        while ((p = RX_PO_PREFIX.exec(norm)) !== null) {
          const comp = p[1] ? p[1].toUpperCase() : compId;
          const num = p[2];
          found.add(comp ? `${comp}-${num}` : num);
        }

        // ---- PO PREFIX CORRECTION LAYER ----
        const normalized = new Set();
        for (const item of found) {
          const canonicalCore = normalizePONumber(item); // e.g., "CLA-00112731"

          // If already starts with PO-, keep as-is
          if (/^PO-/i.test(item)) {
            normalized.add(item.toUpperCase());
            continue;
          }

          // Otherwise, enforce PO prefix
          const corrected = `PO-${canonicalCore}`;
          normalized.add(corrected);
        }

        return normalized.size ? Array.from(normalized) : null;
      }

      
      // Expanded Detection & Template Mapping
      function handleProvisionExcelTemplate(supplier) {
          if (!supplier) return;

          const rawType = supplier.SupplierType?.trim() || "";
          if (!rawType) return;


      // Split on commas, semicolons, or slashes, trim, lowercase
          const supplierTypes = rawType
              .split(/[,\;/]/)
              .map(t => t.trim().toLowerCase())
              .filter(Boolean);


      // Map of normalized supplier types → template base filename
          const templateMap = {
              "provision_po": "provision_temp",
              "bonus_po": "bonus_temp"
          };

          
      // Find the first matching known type
          const matchedType = supplierTypes.find(t => templateMap[t]);
          if (!matchedType) return; // No recognized type → no button

          const templateBase = templateMap[matchedType];


          // Construct full file name
          // Extension handled here to avoid ambiguity
          const fileName = `${templateBase}.xlsm`;

          // Template file path (same folder as index.html)
          const excelPath = `templates/${fileName}`;

          const container = document.getElementById("otherResult");
          container.innerHTML += `
              <div style="margin-top:15px; padding:10px; border:1px solid #ccc; background:#f4f4f4;">
                <h3>Provision/Bonus Supplier Detected</h3>
                <p>The supplier type begins with <strong>"Provision_ or Bonus_PO"</strong>.</p>
                <p>You can now open the Excel template specifically for this supplier:</p>
                <p><strong>Template:</strong> ${fileName}</p>
                <button onclick="window.open('${excelPath}', '_blank')">
                    Open Excel Template
                </button>
                <p style="margin-top:10px;">
                    <strong>Follow the instructions from the working file.</strong>
                </p>
            </div>

          `;
      }


     
     
      
// Matches:
//  - 05/01/2026
//  - 05-JAN-2026 (case-insensitive)
const DDMMYYYY = String.raw`
(?:
  (?:0[1-9]|[12][0-9]|3[01])
  \/
  (?:0[1-9]|1[0-2])
  \/
  (?:19|20)\d{2}
)
|
(?:
  (?:0[1-9]|[12][0-9]|3[01])
  -
  (?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)
  -
  (?:19|20)\d{2}
)
`.replace(/\s+/g, "");


      /**
       * Build a tolerant label regex:
       *  - ignores casing
       *  - allows extra spaces and PDF line breaks
       */
      function buildLabelRegex(label) {
        if (!label) return null;
        const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return new RegExp(
          escaped.replace(/\s+/g, "\\s*") + "\\s*[:\\-]?",
          "i"
        );
      }

      /**
       * Extract first dd/mm/yyyy AFTER a label
       */
      function extractDateAfterLabel(text, labelRegex) {
        if (!labelRegex) return null;
        const match = text.match(labelRegex);
        if (!match) return null;

        const tail = text.slice(match.index + match[0].length);
        const dateMatch = tail.match(new RegExp(DDMMYYYY));
        return dateMatch ? dateMatch[0] : null;
      }

      /**
       * Main detector
       *
       * Priority:
       * 1️⃣ Literal "Issue Date:" label
       * 2️⃣ Supplier.InvoiceDate label (Issue Date)
       * 3️⃣ Supplier.DueDate_label label (Due Date)
       */
      function detectIssueAndDueDates(text, supplier = null) {
        if (!text) {
          return { issueDate: null, dueDate: null, debug: "No PDF text." };
        }

        // Normalize PDF whitespace noise
        const normalizedText = text.replace(/\s+/g, " ");

        // --- 1️⃣ ISSUE DATE ---
        let issueDate = null;
        let dueDate = null;

        // Default label
        const issueDefaultRegex = buildLabelRegex("Issue Date");
        issueDate = extractDateAfterLabel(normalizedText, issueDefaultRegex);
        const dueDefaultRegex = buildLabelRegex("Due Date");
        dueDate = extractDateAfterLabel(normalizedText, dueDefaultRegex);

        // Fallback to Supplier.json label
        if (!issueDate && supplier?.InvoiceDate_label) {
          const issueSupplierRegex = buildLabelRegex(supplier.InvoiceDate_label);
          issueDate = extractDateAfterLabel(normalizedText, issueSupplierRegex);
        }
        if (!dueDate && supplier?.DueDate_label) {
          const dueSupplierRegex = buildLabelRegex(supplier.DueDate_label);
          dueDate = extractDateAfterLabel(normalizedText, dueSupplierRegex);
          
        }

       

        return {
          issueDate,
          dueDate,
          debug: {
            issueLabelUsed: issueDate
              ? (issueDefaultRegex.test(normalizedText)
                  ? "Issue Date"
                  : supplier?.InvoiceDate)
              : null,
            dueLabelUsed: dueDate ? supplier?.DueDate_label : null
          }
        };
      }
      
      function normalizeInvoiceDate(dateStr) {
        if (!dateStr) return null;

        // Already dd/mm/yyyy
        if (dateStr.includes("/")) return dateStr;

        // Convert 05-JAN-2026 → 05/01/2026
        const months = {
          JAN: "01", FEB: "02", MAR: "03", APR: "04",
          MAY: "05", JUN: "06", JUL: "07", AUG: "08",
          SEP: "09", OCT: "10", NOV: "11", DEC: "12"
        };

        const [dd, mon, yyyy] = dateStr.toUpperCase().split("-");
        return months[mon] ? `${dd}/${months[mon]}/${yyyy}` : dateStr;
      }

      /**
       * Extracts travel data blocks strictly following the sequence:
       * Description -> Reiziger -> Bestemming.
       * Specifically excludes cases where a "Description:" is immediately followed 
       * by another "Description:" label.
       */
      
      function extractTravelNPOData(text, supplierType) {
        // Logic gate
        if (supplierType !== "Travel_NPO") return null;

        // Fallback for bad inputs
        if (typeof text !== "string" || !text.trim()) return [];

        // Normalize CRLF to LF; treat as a continuous stream
        const normalized = text.replace(/\r\n/g, "\n");

        // We will scan the text for label boundaries, enforcing exact order:
        // (Description|Omschrijving) -> Reiziger -> Bestemming -> Name
        // If the next encountered label isn't the expected one, we discard the block.

        const LABELS_RE = /(Description:|Omschrijving:|Reiziger:|Bestemming:|Name:)/g;

        // Helper to find the next label from a given index
        function findNextLabel(startIdx) {
            LABELS_RE.lastIndex = startIdx;
            const m = LABELS_RE.exec(normalized);
            if (!m) return null;
            return {
                label: m[1],
                index: m.index,
                end: m.index + m[0].length // position right after the label
            };
        }

        const results = [];
        let cursor = 0;

        while (true) {
            const desc = findNextLabel(cursor);
            if (!desc) break;

            // Only start a block at Description or Omschrijving
            if (desc.label !== "Description:" && desc.label !== "Omschrijving:") {
                // Skip unrelated labels and keep scanning
                cursor = desc.end;
                continue;
            }

            // The very next label must be Reiziger:
            const nextAfterDesc = findNextLabel(desc.end);
            if (!nextAfterDesc) break;

            if (nextAfterDesc.label !== "Reiziger:") {
                // Wrong next label (e.g., Name: or another Description:) -> ignore this potential block
                // Move cursor forward just after the Description to keep searching for the next valid one
                cursor = desc.index + 1;
                continue;
            }

            // The very next label after Reiziger must be Bestemming:
            const nextAfterReiziger = findNextLabel(nextAfterDesc.end);
            if (!nextAfterReiziger) break;

            if (nextAfterReiziger.label !== "Bestemming:") {
                // Wrong order -> ignore this block
                cursor = nextAfterDesc.index + 1;
                continue;
            }

            // The very next label after Bestemming must be Name:
            const nextAfterBestemming = findNextLabel(nextAfterReiziger.end);
            if (!nextAfterBestemming) break;

            if (nextAfterBestemming.label !== "Name:") {
                // Wrong order -> ignore this block
                cursor = nextAfterReiziger.index + 1;
                continue;
            }

            // If we reached here, the order is strictly correct.
            // Extract the three values exactly between the labels.
            const description = normalized.slice(desc.end, nextAfterDesc.index).trim() || "Not Found";
            const individual  = normalized.slice(nextAfterDesc.end, nextAfterReiziger.index).trim() || "Not Found";
            const destination = normalized.slice(nextAfterReiziger.end, nextAfterBestemming.index).trim() || "Not Found";

            results.push({
                Description: description,
                Individual: individual,
                Destination: destination
            });

            // Continue scanning right after the Name: label of this completed block
            cursor = nextAfterBestemming.end;
        }

        return results;
    }

                          
    // ------------------------------------------------------------
    // Main Processing Logic
    // ------------------------------------------------------------
    let Approver = [];
    let Company = [];
    let Manual = [];
    let Supplier = [];
    let Exception = [];
    let PoData = [];

    (async () => {
      const data = await loadJSONData();
      Approver = data.Approver;
      Company = data.Company;
      Manual = data.Manual;
      Supplier = data.Supplier;
      Exception = data.Exception;
      PoData = data.PoData;
    })();

    document.getElementById("processBtn").addEventListener("click", async () => {

      // 🧹 Clear all output areas before new processing
      document.getElementById("result").innerHTML = "";
      document.getElementById("dbg").innerHTML = "";
      document.getElementById("manualSugest").innerHTML = "";
      document.getElementById("lines").innerHTML = "";
      document.getElementById("otherResult").innerHTML = "";
      document.getElementById("base64Input").value = "";

      
      const aiMsgs = document.getElementById("ap-ai-messages");
          if (aiMsgs) aiMsgs.innerHTML = "";

      
      const file = document.getElementById("pdfFile").files[0];
      const res = document.getElementById("result");
      const ins = document.getElementById("lines");
      if (!file) return res.textContent = "⚠️ Please select a PDF first.";

      res.innerHTML = "⏳ Reading PDF...";
      try {
        const text = await extractTextFromPDF(file);
        console.log("🔍 FULL PDF TEXT:\n", text);
        if (!text) throw new Error("No readable text found in PDF.");
        
        let output = "";

       // STEP 1 — Enhanced Supplier VAT validation
        let supplier = null;
        let supplierVAT = null;

        for (const s of Supplier) {
          // Normalize both the supplier VAT and the text content to digits only
          const vatNorm = normalizeVAT(s.VAT);        // e.g. "BE0475653257" → "0475653257"
          const textNorm = normalizeVAT(text);        // removes all letters, spaces, dots

          // Create two variants to check in PDF:
          // 1️⃣ Full VAT (with prefix like "BE0475653257")
          // 2️⃣ Numeric-only VAT ("0475653257")
          const fullVAT = s.VAT.replace(/[^A-Z0-9]/g, ""); // clean supplier VAT string
          const numericVAT = vatNorm;                       // just the digits part

          // Normalize text for both versions
          const textUpper = text.toUpperCase().replace(/[^A-Z0-9]/g, "");
          const textDigits = text.replace(/[^0-9]/g, "");

          // ✅ Match either the full VAT or numeric-only VAT
          if (textUpper.includes(fullVAT) || textDigits.includes(numericVAT)) {
            supplier = s;
            supplierVAT = s.VAT;
            output += `✅ Supplier VAT found (matched ${
              textUpper.includes(fullVAT) ? "full" : "numeric-only"
            }): ${s.VAT} (<strong>${s["Supplier Name"]}</strong>)\n`;
            break;
          }
        }
          if (supplier) {
            handleProvisionExcelTemplate(supplier);
        }

        // If no supplier found
        if (!supplier) {
          output += `❌ No Supplier VAT match found in PDF.\n`;
        }
        

        // STEP 2 — Company VAT check
        let ourCompanyVAT = null;
        let company = null;
        //loop through all know company VATs and check which one is found in the PDF text
        for (const c of Company) {
          const vatNorm = normalizeVAT(c.CompanyBTW);  // e.g. "BE0464418182" → "464418182"
          const textNorm = normalizeVAT(text);         // remove letters, dots, spaces
          if (textNorm.includes(vatNorm)) {
            ourCompanyVAT = c.CompanyBTW;
            company = c;
            break;
          }
        }

        if (company) output += `✅ Our company VAT (<strong>${ourCompanyVAT}</strong>) detected (${company.CompanyName}).\n`;
        else output += `⚠️ <strong>Our company VAT not detected.</strong>\n`;

        //Check if SullplierType ends with PO or NPO
        
        const supplierTypeRaw = supplier?.SupplierType || "";
        if (supplierTypeRaw.substring(supplierTypeRaw.length - 3) == "_PO") {
            output += "✅ Supplier requires a Purchase Order.\n";
            // Existing PO-checking logic remains unchanged
        } else if (supplierTypeRaw.substring(supplierTypeRaw.length - 3) == "NPO") {
            output += "ℹ️ PO is not mandatory.\n";
        }


        
        // STEP 3 — Detect Customer / Approver
        let approver = null;

        if (supplierTypeRaw.endsWith("NPO")) {
          for (const a of Approver) {
            if (normalizeText(text).includes(normalizeText(a.Client))) {
              approver = a;

              output += `✅ Client name "<strong>${a.Client}</strong>" found → Approver: <strong>${a.Approver}</strong>\n`;

              // ✅ NEW: display predefined Segments if present
              if (a.Segments && a.Segments.trim()) {
                output += `📦 Predefined posting segment(s) detected for approver: `;
                output += `<strong>${a.Segments}</strong>\n`;
              }

              break;
            }
          }

          if (!approver) {
            output += "⚠️ Approver is required for NPO invoices but was not detected.\n";
          }
        }



        // --- Detect document type ---
        const docType = detectDocumentType(text);
        output += `🧾 Document Type: <strong>${docType}</strong>\n`;

        // --- Detect invoice number ---
        const invoiceNumber = detectInvoiceNumber(text, supplier);
        const invoiceNumberPeppol = detectInvoiceNumberPeppol(text, supplier);
        //const output2 = document.getElementById("otherResult");
        if (invoiceNumberPeppol) {
          output += `🔢 Invoice Number detected: <strong>${invoiceNumberPeppol}</strong>\n`;
        }
        else if(invoiceNumber) {
          output += `🔢 Invoice Number detected: <strong>${invoiceNumber}</strong>\n`;
        }
        else {
        output += '⚠️ <strong>The Invoice Number is not detected, check it manually!</strong>\n';
        }
        // 🔍 Detect Purchase Order Number(s) right after invoice number
        const poNumbers = detectPoNumbers(text, company);
        
        let tableHTML = `
        <table border="1" style="border-collapse: collapse; width: 100%;">
            <thead>
                <tr style="background:#f2f2f2;">
                    <th>Business Unit</th>
                    <th>PO Number</th>
                    <th>PO Header Description</th>
                    <th>Ship To Location</th>
                    <th>Buyer</th>
                    <th>Item Description</th>
                    <th>PO Status</th>
                    <th>PO Total Amount</th>
                    <th>Supplier</th>
                    <th>Distribution Details</th>
                    <th>Customer</th>
                    <th>Pass On Customer</th>
                </tr>
            </thead>
            <tbody>
        `;

        
        if (supplierTypeRaw.substring(supplierTypeRaw.length - 3) === "_PO") {
            if (poNumbers && poNumbers.length) {

                output += `📦 Purchase Order(s) detected:\n`;

                poNumbers.forEach(po => {
                    const matches = PoData.filter(row =>
                        String(row["PO Number"]) === String(po)
                    );

                    if (matches.length > 0) {
                        matches.forEach(match => {

                            // ───────────────────────────────────────────────
                            // NORMALIZED VALUES
                            // ───────────────────────────────────────────────
                            const statusValue = (match["PO Status"] ?? "").toString().trim().toUpperCase();
                            const supplierPDF = (supplier["Supplier Name"] ?? "").toString().trim().toLowerCase();
                            const supplierPO = (match["Supplier"] ?? "").toString().trim().toLowerCase();
                            const passOnValue = match["Pass On Customer"];

                            // ───────────────────────────────────────────────
                            // BAD (RED) STATUSES stay unchanged
                            // ───────────────────────────────────────────────
                            const isBadStatus = ["CANCELED", "CLOSED", "REJECTED", "PENDING APPROVAL"].includes(statusValue);

                            const statusStyle = isBadStatus
                                ? "background-color:red; color:white; font-weight:bold;"
                                : "";

                            // ───────────────────────────────────────────────
                            // SUPPLIER MATCH CHECK (GREEN)
                            // Case-insensitive, trimmed, partial allowed
                            // ───────────────────────────────────────────────
                            const isSupplierMatch =
                                supplierPDF.length > 0 &&
                                supplierPO.length > 0 &&
                                (
                                    supplierPDF === supplierPO ||            // exact match
                                    supplierPO.includes(supplierPDF) ||      // PDF-name inside PO-name
                                    supplierPDF.includes(supplierPO)         // PO-name inside PDF-name
                                );

                            const supplierStyle = isSupplierMatch
                                ? "background-color:green; color:white; font-weight:bold;"
                                : "background-color:red; color:white; font-weight:bold;";

                            // ───────────────────────────────────────────────
                            // PASS ON CUSTOMER VALIDATION (GREEN)
                            // Must NOT be literal "null" string and NOT actual null
                            // ───────────────────────────────────────────────
                            const isPassOnCustomerValid =
                                passOnValue !== null &&
                                passOnValue !== "null" &&
                                passOnValue !== "" &&
                                typeof passOnValue !== "undefined";

                            const passToStyle = isPassOnCustomerValid
                                ? "background-color:green; color:white; font-weight:bold;"
                                : "";

                            // ───────────────────────────────────────────────
                            // ROW RENDERING
                            // ───────────────────────────────────────────────
                            tableHTML += `
                <tr>
                    <td>${match["Business Unit"]}</td>
                    <td>${match["PO Number"]}</td>
                    <td>${match["PO Header Description"]}</td>
                    <td>${match["Ship To Location"]}</td>
                    <td>${match["Buyer"]}</td>
                    <td>${match["Item Description"]}</td>
                    <td style="${statusStyle}">${match["PO Status"]}</td>
                    <td>${match["PO Total Amount"]}</td>
                    <td style="${supplierStyle}">${match["Supplier"]}</td>
                    <td>${match["DistributionDetails"]}</td>
                    <td>${match["Customer"]}</td>
                    <td style="${passToStyle}">${match["Pass On Customer"]}</td>
                </tr>
                `;
                        });

                    } else {
                        // NOT FOUND placeholder row
                        tableHTML += `
                <tr>
                    <td>N/A</td>
                    <td>${po}</td>
                    <td>N/A</td>
                    <td>N/A</td>
                    <td>N/A</td>
                    <td>N/A</td>
                    <td>Not Found</td>
                    <td>N/A</td>
                    <td>N/A</td>
                    <td>N/A</td>
                    <td>N/A</td>
                    <td>N/A</td>
                </tr>
                `;
                    }
                });

                tableHTML += "</tbody></table>";
                output += tableHTML;

            } else {
                output += `⚠️ No Purchase Order number detected for company ID ${company?.CompanyID || "N/A"}.\n`;
            }
        }


         //else {
          //output2.innerHTML += '<form id="invoiceForm" style="margin-top:8px;"><label for="invNum">Insert the Invoice Number:</label><br><input type="text" id="invNum" name="invNum" style="width:200px; margin-top:4px;"><br><br><button type="button" id="checkInvBtn">Check in PDF</button></form>';
        //}
        // --- Reverse charge detection ---
        const reverseChargeMessage = detectReverseCharge(text);
        if (reverseChargeMessage) {
            output += reverseChargeMessage + "\n";
        }

        
        // 🔎 Detect Issue Date & Due Date (dd/mm/yyyy after "Issue Date:")
        let { issueDate, dueDate, debug: dateDebug } = detectIssueAndDueDates(text);
        
        issueDate = normalizeInvoiceDate(issueDate);
        dueDate   = normalizeInvoiceDate(dueDate);

        if (issueDate) {
          
          output += `📅 Issue Date: <strong>${issueDate}</strong>\n`;
        } else {
          output += `⚠️ Issue Date not found.\n`;
        }
        if (dueDate) {
          
          output += `⏳ Due Date: <strong>${dueDate}</strong>\n`;
        } else {
          output += `⚠️ Due Date (second dd/mm/yyyy after label) not found.\n`;
        }
       


        //Display Currency Symbol
        
        const currencyMatch = text.match(/\b(EUR|USD|GBP|RON|CHF|JPY|€)\b/i);
        const currency = currencyMatch ? currencyMatch[1].toUpperCase() : "Unknown";
        output += `💱 Currency detected: <strong>${currency}</strong>\n`;

        
        // Wait for input check button click
        setTimeout(() => {
          const btn = document.getElementById("checkInvBtn");
          if (btn) {
            btn.addEventListener("click", () => {
              const inv = document.getElementById("invNum")?.value?.trim();
              if (!inv) {
                alert("⚠️ Please enter an invoice number first.");
                return;
              }

              const found = text.toLowerCase().includes(inv.toLowerCase());
              const resultBox = document.getElementById("result");
              if (found) {
                resultBox.innerHTML += `<br>✅ Manual Invoice Number "${inv}" found in PDF.`;
              } else {
                resultBox.innerHTML += `<br>❌ Manual Invoice Number "${inv}" not found in PDF.`;
              }
            });
          }
        }, 0);

        // Fallback by Client Number (supports comma/semicolon)
        if (supplierTypeRaw.substring(supplierTypeRaw.length - 3) == "NPO"){
          if (!approver) {
            for (const a of Approver) {
              if (a["Client Number"]) {
                const codes = a["Client Number"].toString().split(/[;,:)(]/).map(c => c.trim()).filter(Boolean);
                const foundCode = codes.find(code => text.includes(code));
                if (foundCode) {
                  approver = a;
                  output += `✅ Client Number "<strong>${foundCode}</strong>" detected → Approver: <strong>${a.Approver}</strong>\n`;
                  break;
                }
              }
            }
          }

          if (!approver) output += `⚠️ No Approver or Client detected in PDF.\n`;
        }
        //Insert Lines
        //Detect Tax Classification on the PDF
        //let ourCountry = ourCompanyVAT ? ourCompanyVAT.slice(0, 2) : "??"; //Country acronym
         //ins.innerHTML += `Test:<strong>${tva["0%"].country.hasOwnProperty(ourCountry)}</strong>`;
        

        // STEP 4 — Build Segment
        const manualArray = company && supplier ? getManual(company.CompanyID, supplier.SupplierType) : null; 
        const exceptionArray = company && !approver ? getException(company.CompanyID, supplier.SupplierType, supplierVAT) : null;
        const seg = makeSegments(company, manualArray, exceptionArray, approver, supplierVAT, true,supplier);
        
        // 🧩 SupplierType info MUST appear right before Posting Segment(s)
        if (supplier?.SupplierType) {
            output += `🧩 SupplierType = ${supplier.SupplierType}
        <strong><a href="manuals.html" target="_blank"><u>Check the </u>Manuals</a></strong>\n`;
        }
        
        // Identify Travel information
        if (supplierTypeRaw === "Travel_NPO") {
            const travelBlocks = extractTravelNPOData(text, supplierTypeRaw);

            if (travelBlocks && travelBlocks.length > 0) {
                output += `\n✈️ **Validated Travel Information:**\n`;
                travelBlocks.forEach((block, i) => {
                    output += `  • **Traveler ${i + 1}:** (${block.Description}) | **Individual**${block.Individual} | **To:** ${block.Destination} \n`;
                });
            }
        }


        output += `\n📊 Posting Segment(s): See table below.\n`;

        
        // Table goes into #manualSugest
        const manualDiv = document.getElementById("manualSugest");
          try {
            manualDiv.innerHTML = seg || `<p>⚠️ Manual table returned no content.</p>`;
          } catch (err) {
            console.error("Manual table rendering failed:", err);
            manualDiv.innerHTML = `<p>❌ Manual table rendering failed: ${err.message}</p>`;
          }


        // STEP 5 — VAT Extraction and Classification Table
        extractTaxClassifications(text, supplier, company, approver, tva);
        // STEP 6 — Load supplier-specific segment lines from JSON
        if (supplier) await loadAndDisplaySupplierSegments(supplier);
          // Add a server call that will send a compac payload for validation;
            const aiPayload = {
              mode: "validate_invoice",              // or "draft_email_supplier", etc.
              context: {
                supplier: {
                  name: supplier?.["Supplier Name"] || null,
                  vat: supplierVAT || null,
                  type: supplier?.SupplierType || null
                },
                company: {
                  id: company?.CompanyID || null,
                  name: company?.CompanyName || null,
                  vat: company?.CompanyBTW || null
                },
                approver: approver ? {
                  name: approver.Approver,
                  client: approver.Client,
                  predefinedSegments: approver.Segments || null
                } : null,
                invoice: {
                  documentType: docType,
                  invoiceNumber: invoiceNumberPeppol || invoiceNumber || null,
                  issueDate: issueDate || null,
                  dueDate: dueDate || null,
                  currency,
                  reverseChargeNote: reverseChargeMessage || null
                },
                poCandidates: (function(){
                  // Optional: pass only the matched PO rows you rendered in the table
                  // If you kept them in a temp array, include here. Otherwise, you can re-query quickly:
                  try {
                    const pos = [];
                    if (poNumbers && poNumbers.length) {
                      poNumbers.forEach(po => {
                        const rows = PoData.filter(r => String(r["PO Number"]) === String(po));
                        rows.forEach(r => pos.push({
                          poNumber: r["PO Number"],
                          status: r["PO Status"],
                          supplier: r["Supplier"],
                          total: r["PO Total Amount"],
                          buyer: r["Buyer"],
                          customer: r["Customer"],
                          passOnCustomer: r["Pass On Customer"],
                          headerDesc: r["PO Header Description"],
                          itemDesc: r["Item Description"],
                          shipTo: r["Ship To Location"],
                          distribution: r["DistributionDetails"]
                        }));
                      });
                    }
                    return pos;
                  } catch { return []; }
                })(),
                tax: {
                  vatRatesAfterLabel: getUniqueVatRatesAfterTaxRateLabel(text), // already defined
                  // You can add any other tax cues you collect
                },
                // Optional: add your tolerance policy if you have it on the client,
                // otherwise server can inject defaults
                policy: {
                  priceTolerancePct: null,      // set server-side if unknown
                  qtyTolerancePct: null,
                  roundingRule: "standard"      // an example
                }
              }
            };

        

        res.innerHTML = output;
        // Example placements inside your existing processBtn success branch:
          window.__lastSupplier = supplier || null;
          window.__lastCompany  = company || null;
          window.__lastApprover = approver || null;

          // Build a compact invoice object:
          window.__lastInvoice = {
            documentType: docType,
            invoiceNumber: invoiceNumberPeppol || invoiceNumber || null,
            issueDate: issueDate || null,
            dueDate: dueDate || null,
            currency: currency || null,
            reverseChargeNote: reverseChargeMessage || null
          };

          // Collect the matched PO rows you rendered (if you have them):
          const collected = [];
          if (poNumbers && poNumbers.length) {
            poNumbers.forEach(po => {
              const matches = PoData.filter(r => String(r["PO Number"]) === String(po));
              matches.forEach(r => {
                collected.push({
                  poNumber: r["PO Number"],
                  status: r["PO Status"],
                  supplier: r["Supplier"],
                  total: r["PO Total Amount"],
                  buyer: r["Buyer"],
                  customer: r["Customer"],
                  passOnCustomer: r["Pass On Customer"],
                  headerDesc: r["PO Header Description"],
                  itemDesc: r["Item Description"],
                  shipTo: r["Ship To Location"],
                  distribution: r["DistributionDetails"]
                });
              });
            });
          }
          window.__lastPoRows = collected;


      } catch (err) {
        res.innerHTML = "❌ Error reading PDF: " + err.message;
        console.error(err);
      }
    });

    // ---- AI Context Builder ----
    // Call this AFTER you've processed a PDF at least once.
    // It reuses variables available in your script's scope (supplier, company, approver, etc.).
    window.buildAiContext = function () {
      try {
        // These variables exist inside your processBtn scope; if you declared them with 'let' inside,
        // you can hoist them to file scope or store the latest values on window after processing.
        // If needed, store last-known objects during processing:
        //   window.__lastSupplier = supplier; window.__lastCompany = company; etc.
        const supplier = window.__lastSupplier || null;
        const company  = window.__lastCompany  || null;
        const approver = window.__lastApprover || null;
        const poRows   = window.__lastPoRows   || [];
        const invoice  = window.__lastInvoice  || null;

        if (!supplier && !company && !invoice) return null;

        return {
          supplier: supplier ? {
            name: supplier["Supplier Name"] || null,
            vat: supplier.VAT || null,
            type: supplier.SupplierType || null
          } : null,
          company: company ? {
            id: company.CompanyID || null,
            name: company.CompanyName || null,
            vat: company.CompanyBTW || null
          } : null,
          approver: approver ? {
            name: approver.Approver,
            client: approver.Client,
            predefinedSegments: approver.Segments || null
          } : null,
          invoice: invoice || null,
          poCandidates: poRows
        };
      } catch (_) {
        return null;
      }
    };

    // ------------------------------------------------------------
    // Load and Display Supplier Lines from cons_GroupSupplierSegments_qry.json
    // ------------------------------------------------------------

    async function loadAndDisplaySupplierSegments(supplier) {
      try {
        const response = await fetch("json/cons_GroupSupplierSegments_qry.json");
        if (!response.ok) throw new Error(`Failed to load JSON: ${response.status}`);
        const data = await response.json();

        const supplierName = supplier?.["Supplier Name"]?.trim().toLowerCase();
        const matchingLines = data.filter(
          (item) => item["Source Contact Name"]?.trim().toLowerCase() === supplierName
        );

        const container = document.getElementById("otherResult");
        if (!matchingLines.length) {
          container.innerHTML += `<p>⚠️ No lines found in cons_GroupSupplierSegments_qry.json for supplier <strong>${supplier?.["Supplier Name"] || "Unknown"}</strong>.</p>`;
          return;
        }

    // Build result table
      let html = `
        <h3>📦 Supplier Lines from History</h3>
        <table border="1" cellpadding="5" cellspacing="0" style="border-collapse:collapse;margin-top:10px;">
          <tr style="background:#eef;">
            ${Object.keys(matchingLines[0])
              .map((key) => `<th>${key}</th>`)
              .join("")}
          </tr>`;

      for (const row of matchingLines) {
        html += `<tr>${Object.values(row)
          .map((val) => `<td>${val ?? ""}</td>`)
          .join("")}</tr>`;
      }

      html += "</table>";
      container.innerHTML += html;
    } catch (err) {
      console.error("Error loading supplier segment data:", err);
      document.getElementById("otherResult").innerHTML += `<p>❌ Error loading supplier segment data: ${err.message}</p>`;
    }
  }
  // Load and Display Approver, Company, Manual, Supplier and Exception Lines from json tables
  async function loadJSONData() {
  try {
    const [
      approverRes,
      companyRes,
      manualRes,
      supplierRes,
      exception,
      poData
    ] = await Promise.all([
      fetch("json/Approver.json"),
      fetch("json/Company.json"),
      fetch("json/Manual.json"),
      fetch("json/Supplier.json"),
      fetch("json/Exception.json"),
      fetch("json/PO_group_qry.json")
    ]);

    const [
      Approver,
      Company,
      Manual,
      Supplier,
      Exception,
      PoData
    ] = await Promise.all([
      approverRes.json(),
      companyRes.json(),
      manualRes.json(),
      supplierRes.json(),
      exception.json(),
      poData.json()
    ]);

    console.log("✅ All JSON tables loaded successfully");
    return { Approver, Company, Manual, Supplier, Exception, PoData };

  } catch (err) {
    console.error("❌ Error loading JSON data:", err);
    return { Approver: [], Company: [], Manual: [], Supplier: [], Exception: [], PoData: [] };
  }
}
  