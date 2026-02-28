// ai-chat.js — Single, clean wiring + validation call

(() => {
  // Prevent double wiring if this file gets loaded twice
  if (window.__AP_CHAT_WIRED__) return;
  window.__AP_CHAT_WIRED__ = true;

  // ====== DOM lookups ======
  const fab      = document.getElementById("ap-ai-fab");
  const chat     = document.getElementById("ap-ai-chat");
  const messages = document.getElementById("ap-ai-messages");
  const input    = document.getElementById("ap-ai-input");
  const sendBtn  = document.getElementById("ap-ai-send");
  const closeBtn = document.getElementById("ap-ai-close");
  const minBtn   = document.getElementById("ap-ai-minimize");
  const dragBar  = document.getElementById("ap-ai-chat-drag");
  const btnValidate = document.getElementById("ai-btn-validate");
  const btnRetour   = document.getElementById("ai-btn-retour"); // (kept for future use)

  // ====== Utilities ======
  function appendUserMsg(text) {
    const el = document.createElement("div");
    el.className = "ap-ai-msg ap-ai-msg--user";
    el.textContent = (text || "").trim();
    messages.appendChild(el);
    messages.scrollTop = messages.scrollHeight;
  }

  function appendBotMsg(html) {
    const el = document.createElement("div");
    el.className = "ap-ai-msg ap-ai-msg--bot";
    el.innerHTML = html || "";
    messages.appendChild(el);
    messages.scrollTop = messages.scrollHeight;
  }

  function setLoading(loading) {
    if (!sendBtn || !input) return;
    sendBtn.disabled = !!loading;
    input.disabled   = !!loading;
    sendBtn.textContent = loading ? "Working…" : "Send";
  }

  // ====== Open / Close / Minimize ======
  fab?.addEventListener("click", () => {
    chat.hidden = false;
    input?.focus();
  });

  closeBtn?.addEventListener("click", () => {
    chat.hidden = true;
  });

  let minimized = false;
  minBtn?.addEventListener("click", () => {
    minimized = !minimized;
    const msgEl = chat.querySelector(".ap-ai-chat__messages");
    const compEl = chat.querySelector(".ap-ai-chat__composer");
    if (msgEl)  msgEl.style.display = minimized ? "none" : "block";
    if (compEl) compEl.style.display = minimized ? "none" : "grid";
  });

  // ====== Draggable header ======
  (function makeDraggable(panel, handle) {
    if (!panel || !handle) return;
    let startX=0, startY=0, startLeft=0, startTop=0, dragging=false;

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
  })(chat, dragBar);

  // ====== Message composer (optional) ======
  sendBtn?.addEventListener("click", async () => {
    const text = input.value.trim();
    if (!text) return;
    appendUserMsg(text);
    // If you want to route /chat messages, you can do it here later.
    input.value = "";
    input.focus();
  });

  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendBtn?.click();
    }
  });

  // ====== Mapper: ctx -> v1 payload ======
  function mapCtxToV1(ctx) {
    const inv = ctx?.invoice || {};
    const po  = ctx?.poCandidates || [];
    return {
      version: "1.0",
      source: "web-app",
      invoice: {
        SupplierName: ctx?.supplier?.name || null,
        SupplierVAT: ctx?.supplier?.vat || null,
        ReceiverVAT: ctx?.company?.vat || null,
        SupplierType: ctx?.supplier?.type || null,
        DetectedPONumber: po.map(p => p.poNumber).filter(Boolean),
        InvoiceNumber: inv.invoiceNumber || null,
        IssueDate: inv.issueDate || null,
        DueDate: inv.dueDate || null,
        Currency: inv.currency || null
      },
      lines: {
        ItemDescription: po.map(p => p.itemDesc).filter(Boolean),
        Amounts: []
      },
      context: {
        CompanyID: ctx?.company?.id || null,
        CompanyName: ctx?.company?.name || null,
        CompanyOfficialVAT: ctx?.company?.vat || null,
        POHeaders: po,
        SupplierGLHistory: []
      },
      policy: {
        noPII: true,
        tolerances: { pricePct: null, qtyPct: null, rounding: "standard" }
      }
    };
  }

  // ======================================================
  // VALIDATION BUTTON — single, corrected handler
  // ======================================================
  const COPILOT_ENDPOINT = "https://your-copilot-service-endpoint.com/api/v1/chat"; 
const API_KEY = "YOUR_MICROSOFT_API_KEY"; // Secure this in a production environment

btnValidate?.addEventListener("click", async () => {
    chat.hidden = false;
    appendUserMsg("Co-pilot, please validate this invoice against our GL rules.");

    const ctx = window.buildAiContext ? window.buildAiContext() : null;
    if (!ctx) {
        appendBotMsg("⚠️ No invoice data found. Please upload a document first.");
        return;
    }

    setLoading(true);

    try {
        // Prepare the payload for Copilot
        const v1Payload = mapCtxToV1(ctx);

        // Fetch local JSONs to send as 'Grounding Data' so Copilot knows your GL rules
        const [manualData, queryData] = await Promise.all([
            fetch('Manual.json').then(res => res.json()).catch(() => []),
            fetch('cons_GroupSupplierSegments_qry.json').then(res => res.json()).catch(() => [])
        ]);

        const response = await fetch(COPILOT_ENDPOINT, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${API_KEY}`
            },
            body: JSON.stringify({
                message: "Validate this invoice data using the provided reference tables.",
                invoiceData: v1Payload,
                referenceTables: { manualData, queryData },
                systemPrompt: "You are a Senior Financial Controller. Validate the 6-point checks and provide GL mappings based on the provided JSON tables."
            })
        });

        if (!response.ok) throw new Error(`Copilot Server Error: ${response.status}`);

        const result = await response.json();
        
        // Assuming Copilot returns a 'text' or 'message' field
        renderCopilotResponse(result.message || result.text);

    } catch (err) {
        console.error(err);
        appendBotMsg(`❌ **Connection Failed:** Could not reach MS Copilot. ${err.message}`);
    } finally {
        setLoading(false);
    }
});

function renderCopilotResponse(content) {
    // Standardizing the response format for the UI
    appendBotMsg(content);
}

  // Optional: expose tiny API
  window.APChat = {
    open: () => { chat.hidden = false; input?.focus(); }
  };
})();


function mapCtxToV1(ctx) {
    const inv = ctx?.invoice || {};
    const po  = ctx?.poCandidates || [];

    return {
        version: "1.0",
        source: "web-app",
        invoice: {
            SupplierName: ctx?.supplier?.name || null,
            SupplierVAT: ctx?.supplier?.vat || null,
            ReceiverVAT: ctx?.company?.vat || null,
            SupplierType: ctx?.supplier?.type || null,
            DetectedPONumber: po.map(p => p.poNumber),
            InvoiceNumber: inv.invoiceNumber || null,
            IssueDate: inv.issueDate || null,
            DueDate: inv.dueDate || null,
            Currency: inv.currency || null
        },
        lines: {
            ItemDescription: po.map(p => p.itemDesc).filter(Boolean),
            Amounts: []
        },
        context: {
            CompanyID: ctx?.company?.id || null,
            CompanyName: ctx?.company?.name || null,
            CompanyOfficialVAT: ctx?.company?.vat || null,
            POHeaders: po,
            SupplierGLHistory: []
        },
        policy: {
            noPII: true,
            tolerances: { pricePct: null, qtyPct: null, rounding: "standard" }
        }
    };
}