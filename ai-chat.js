// ai-chat.js (scoped, no global 'fab' etc.)
(() => {
  // ====== DOM lookups ======
  const fab       = document.getElementById("ap-ai-fab");
  const chat      = document.getElementById("ap-ai-chat");
  const messages  = document.getElementById("ap-ai-messages");
  const input     = document.getElementById("ap-ai-input");
  const sendBtn   = document.getElementById("ap-ai-send");
  const closeBtn  = document.getElementById("ap-ai-close");
  const minBtn    = document.getElementById("ap-ai-minimize");
  const dragBar   = document.getElementById("ap-ai-chat-drag");

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

  // ====== Build/Call AI ======
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

  // ====== Open / Close / Minimize ======
  fab?.addEventListener("click", () => {
    chat.hidden = false;
    input.focus();
  });
  closeBtn?.addEventListener("click", () => {
    chat.hidden = true;
  });
  let minimized = false;
  minBtn?.addEventListener("click", () => {
    minimized = !minimized;
    chat.querySelector(".ap-ai-chat__messages").style.display = minimized ? "none" : "block";
    chat.querySelector(".ap-ai-chat__composer").style.display = minimized ? "none" : "grid";
  });

  // ====== Draggable ======
  (function makeDraggable(panel, handle) {
    if (!panel || !handle) return;
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

  // ====== Composer behavior ======
  sendBtn?.addEventListener("click", async () => {
    const text = input.value.trim();
    if (!text) return;
    appendUserMsg(text);

    if (/draft\s+email/i.test(text)) {
      appendBotMsg("✉️ Email drafting via /ai/draft-email not wired in this demo. Type 'validate' to run validation.");
    } else {
      await callValidate();
    }

    input.value = "";
    input.focus();
  });

    // ======================================================
    // NEW: ENHANCED VALIDATION BUTTON
    // ======================================================
    document.getElementById("ai-btn-validate")?.addEventListener("click", async () => {
        appendUserMsg("Run enhanced validation, please.");

        const ctx = window.buildAiContext ? window.buildAiContext() : null;
        if (!ctx) {
            appendBotMsg("<strong>⚠️ No invoice context available.</strong><br>Process a PDF first.");
            return;
        }

        setLoading(true);
        try {
            const res = await fetch("/ai/validate-enhanced", {
                method: "POST",
                headers: {"Content-Type":"application/json"},
                body: JSON.stringify(ctx)
            });
            const data = await res.json();

            let html = `<h4>Validation Results</h4>`;
            html += data.summary || "";
            html += data.discrepancies || "";
            html += data.segmentSuggestions || "";

            appendBotMsg(html);
        } catch (err) {
            appendBotMsg(`<strong>❌ Error:</strong> ${err.message}`);
        }
        setLoading(false);
    });


    // ======================================================
    // NEW: RETOUR INVOICE EMAIL BUTTON
    // ======================================================
    
document.getElementById("ai-btn-validate")?.addEventListener("click", async () => {
    // Auto-open the chat if minimized/closed
    chat.hidden = false;
    input?.focus();

    appendUserMsg("Run enhanced validation, please.");

    const ctx = window.buildAiContext ? window.buildAiContext() : null;
    if (!ctx) {
        appendBotMsg("<strong>⚠️ No invoice context available.</strong><br>Process a PDF first.");
        return;
    }

    setLoading(true);
    try {
        const res = await fetch("/ai/validate-enhanced", {
            method: "POST",
            headers: {"Content-Type":"application/json"},
            body: JSON.stringify(ctx)
        });

        const data = await res.json();

        let html = `<h4>Validation Results</h4>`;
        html += data.summary || "";
        html += data.discrepancies || "";
        html += data.segmentSuggestions || "";

        appendBotMsg(html);

    } catch (err) {
        appendBotMsg(`<strong>❌ Error:</strong> ${err.message}`);
    }
    setLoading(false);
});


// ======================================================
// NEW: RETOUR INVOICE EMAIL BUTTON (AUTO-OPEN ENABLED)
// ======================================================
    document.getElementById("ai-btn-retour")?.addEventListener("click", async () => {
        chat.hidden = false;
        input?.focus();

        appendUserMsg("Create retour invoice email, please.");

        const ctx = window.buildAiContext ? window.buildAiContext() : null;
        if (!ctx) {
            appendBotMsg("<strong>⚠️ No invoice context available.</strong><br>Process a PDF first.");
            return;
        }

        setLoading(true);
        try {
            const res = await fetch("/ai/retour-email", {
                method: "POST",
                headers: {"Content-Type":"application/json"},
                body: JSON.stringify(ctx)
            });

            const data = await res.json();

            let html = `
                <h4>Retour Invoice Email (Draft)</h4>
                <strong>Subject:</strong> ${data.subject}<br><br>
                <textarea style="width:100%;height:180px;">${data.body}</textarea>
                <div class="ap-ai-small">This is a draft for review. You must send it manually.</div>
            `;

            appendBotMsg(html);

        } catch (err) {
            appendBotMsg(`<strong>❌ Error:</strong> ${err.message}`);
        }
        setLoading(false);
    });


  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendBtn.click();
    }
  });

  // ====== Optional: external quick action button ======
  // Safe to include; if button doesn't exist, nothing happens
  //document.getElementById("btn-validate-ai")?.addEventListener("click", async () => {
    //chat.hidden = false;
    //appendUserMsg("Validate this invoice, please.");
    //await callValidate();
  //});

  // Expose a tiny API if you need to open the chat from elsewhere
  window.APChat = {
    open: () => { chat.hidden = false; input?.focus(); },
    validate: async () => { chat.hidden = false; await callValidate(); }
  };
})();

(() => {
  // Prevent double wiring in hot-reload scenarios
  if (window.__AP_CHAT_WIRED__) return;
  window.__AP_CHAT_WIRED__ = true;

  // ... rest of your ai-chat.js code ...
})();