/* ============================================================
   retour-email.js  —  "Retour Invoice Email" button (#ai-btn-retour)
   Load AFTER script.js (it reads window.__lastPdfText, __lastSupplier,
   __lastCompany, __lastInvoice, __lastPoRows set in processBtn).
   ============================================================ */
(function () {
  "use strict";

  // ---------- CONFIG (edit here when you scale to other business units) ----------
  const CONFIG = {
    fallbackCompanyId: "CLA",
    fallbackVat: "BE0464418182",
    ownDomains: ["katoennatie.com"],           // never pick our own addresses as "supplier email"
    peppolMailbox: (id) => `AP.PEPPOL.${id}@KATOENNATIE.COM`,
    creditMailbox: (id) => `AP.${id}@KATOENNATIE.COM`     // assumed pattern (CLA -> AP.CLA@...) – confirm
  };

  const PO_REASONS = {
    wrong:    { label: "Wrong PO",            text: "wrong",          needsPo: true  },
    missing:  { label: "Missing PO",          text: "missing",        needsPo: true  },
    used:     { label: "Used PO",             text: "already used",   needsPo: false },
    consumed: { label: "Fully consumed PO",   text: "fully consumed", needsPo: false }
  };

  const KINDS = {
    po:     "PO-related issue",
    vat:    "Missing / incorrect VAT number",
    tax:    "Missing tax information",
    credit: "Incomplete credit note"
  };

  // ---------- helpers ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const EMAIL_RE = "[A-Za-z0-9._%+\\-]+@[A-Za-z0-9\\-]+(?:\\.[A-Za-z0-9\\-]+)*\\.[A-Za-z]{2,}";

  function extractEmails(text) {
    if (!text) return [];
    const isOwn = (e) => CONFIG.ownDomains.some(d => e.endsWith("@" + d) || e.endsWith("." + d));
    const labeled = new Set([...text.matchAll(new RegExp("e-?mail\\s*[:\\-]?\\s*(" + EMAIL_RE + ")", "gi"))]
      .map(m => m[1].toLowerCase()));
    const all = [...new Set((text.match(new RegExp(EMAIL_RE, "g")) || []).map(e => e.toLowerCase()))].filter(e => !isOwn(e));
    const score = (e) => labeled.has(e) ? 0 : /invoice|factur|billing|account|boekhoud|finance|compta|debit|admin/.test(e) ? 1 : 2;
    return all.sort((x, y) => score(x) - score(y));   // "Email:" matches first
  }

  // ---------- template (mirrors RejectedEmailTemplate.docx) ----------
  // Blocks: {p:"text"} or {ol:["item", ...]}; **bold** markers are converted per output format.
  function buildEmail(kind, d) {
    const intro = (doc) => ({ p: `We have received your ${doc}; however, we identified a critical error that requires correction.` });
    const tail = (doc, num, note) => ([
      { p: `Please note that the current ${doc} **${num}** is **rejected** and cannot be processed ${note}.` },
      { p: `We would appreciate your confirmation once the corrected ${doc} has been issued and transmitted.` },
      { p: "Should you require any additional information, please do not hesitate to contact us." },
      { p: "Kind regards," }
    ]);
    const greet = { p: `Dear ${d.supplierName},` };
    const peppolLine = `**Resend the corrected invoice via PEPPOL** to the following address: **${d.peppol}**`;
    const paid = "or paid due to this discrepancy, as it does not meet legal invoicing requirements";

    switch (kind) {
      case "po": {
        const r = PO_REASONS[d.poReason];
        const hint = r.needsPo ? `; it should be ${d.correctPo}` : "";
        return {
          subject: `Invoice ${d.invoiceNumber} rejected – PO number ${r.text}`,
          blocks: [
            greet, intro("invoice"),
            { p: `The **PO number is ${r.text}**${hint}.` },
            { p: "We kindly ask you to:" },
            { ol: ["**Resubmit the invoice** using the correct PO format so we can process it without delay.", peppolLine] },
            ...tail("invoice", d.invoiceNumber, paid)
          ]
        };
      }
      case "vat":
        return {
          subject: `Invoice ${d.invoiceNumber} rejected – VAT number`,
          blocks: [
            greet, intro("invoice"),
            { p: `**The VAT number is missing or incorrect.** The invoice must contain our correct VAT number: **${d.ourVat}**.` },
            { p: "We kindly ask you to:" },
            { ol: [
              "**Correct the invoice** to ensure that the VAT number and customer information correspond to the correct legal entity.",
              "**Verify all VAT-related information** to ensure compliance with Belgian invoicing requirements.",
              peppolLine
            ] },
            ...tail("invoice", d.invoiceNumber, paid)
          ]
        };
      case "tax":
        return {
          subject: `Invoice ${d.invoiceNumber} rejected – tax information`,
          blocks: [
            greet, intro("invoice"),
            { p: "**The VAT amount and/or VAT Tax Classification is missing or incorrect.**" },
            { p: "We kindly ask you to:" },
            { ol: [
              "**Correct the invoice** by including the appropriate VAT amount and VAT Tax Classification.",
              "**Verify that the VAT treatment is correctly reflected** both in the invoice details and the PEPPOL XML file.",
              peppolLine
            ] },
            ...tail("invoice", d.invoiceNumber, paid)
          ]
        };
      case "credit":
        return {
          subject: `Credit note ${d.invoiceNumber} rejected – incomplete information`,
          blocks: [
            greet, intro("credit note"),
            { p: "**The credit note is incomplete. Required document references and/or the amount of returned goods are missing.**" },
            { p: "We kindly ask you to:" },
            { ol: [
              "**Update the credit note** with all relevant document references related to the original invoice.",
              "**Include the value and details of the returned goods or services.**",
              "**Verify that all mandatory information is correctly stated.**",
              `**Resend the corrected credit note** to the following address: **${d.creditMailbox}**`
            ] },
            ...tail("credit note", d.invoiceNumber, "due to incomplete information")
          ]
        };
    }
    return null;
  }

  const toText = (blocks) => blocks.map(b => b.p
      ? b.p.replace(/\*\*/g, "")
      : b.ol.map((x, i) => `${i + 1}. ${x.replace(/\*\*/g, "")}`).join("\n")
  ).join("\n\n");

  const toHtml = (blocks) => blocks.map(b => {
    const bold = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    return b.p ? `<p>${bold(b.p)}</p>` : `<ol>${b.ol.map(x => `<li>${bold(x)}</li>`).join("")}</ol>`;
  }).join("");

  // ---------- UI ----------
  const REASONS = [
    { id: "po-wrong",    kind: "po",     poReason: "wrong",    label: "PO – wrong" },
    { id: "po-missing",  kind: "po",     poReason: "missing",  label: "PO – missing" },
    { id: "po-used",     kind: "po",     poReason: "used",     label: "PO – already used" },
    { id: "po-consumed", kind: "po",     poReason: "consumed", label: "PO – fully consumed" },
    { id: "vat",         kind: "vat",    label: "VAT number missing / incorrect" },
    { id: "tax",         kind: "tax",    label: "Tax information missing" },
    { id: "credit",      kind: "credit", label: "Credit note incomplete" }
  ];

  function showForm() {
    const box = $("ap-ai-messages");
    if (!box) return;

    const supplier = window.__lastSupplier;
    const text = window.__lastPdfText;
    if (!supplier || !text) {
      box.insertAdjacentHTML("beforeend",
        `<div class="ap-ai-msg ap-ai-msg--bot"><strong>⚠️ No invoice processed yet.</strong><br>Process a PDF first, then click again.</div>`);
      box.scrollTop = box.scrollHeight;
      return;
    }

    $("retour-form")?.remove();
    const emails = extractEmails(text);
    const company = window.__lastCompany;
    const cid = company?.CompanyID || CONFIG.fallbackCompanyId;
    const note = company ? "" : `⚠️ Our company was not detected in the PDF – using ${CONFIG.fallbackCompanyId} data.`;
    let selected = null;

    box.insertAdjacentHTML("beforeend", `
      <div class="ap-ai-msg ap-ai-msg--bot" id="retour-form" style="max-width:100%;">
        <h4>Retour Invoice Email</h4>
        <div class="ap-ai-small">Supplier: <strong>${esc(supplier["Supplier Name"])}</strong> · Doc no.: <strong>${esc(window.__lastInvoice?.invoiceNumber || "—")}</strong></div>
        <div class="ap-ai-small" style="margin-top:6px;">1. Choose the reason</div>
        <div id="rt-reasons" style="display:flex;flex-wrap:wrap;gap:6px;margin:4px 0;">
          ${REASONS.map(r => `<button type="button" class="ap-ai-btn" data-reason="${r.id}">${esc(r.label)}</button>`).join("")}
        </div>
        <div id="rt-po-wrap" style="display:none;">
          <label class="ap-ai-small">Correct PO</label>
          <input id="rt-correct-po" style="width:100%;" placeholder="PO-${esc(cid)}-XXXXXXXX">
        </div>
        <div class="ap-ai-small" style="margin-top:6px;">2. Supplier email ${emails.length ? `(${emails.length} found – "Email:" matches first)` : "(none found – type it)"}</div>
        <input id="rt-to" list="rt-emails" style="width:100%;" value="${esc(emails[0] || "")}" placeholder="supplier@example.com">
        <datalist id="rt-emails">${emails.map(e => `<option value="${esc(e)}">`).join("")}</datalist>
        <div style="display:flex;gap:6px;margin-top:6px;">
          <button class="ap-ai-btn ap-ai-btn--primary" id="rt-open" style="flex:1;">Open email draft</button>
          <button class="ap-ai-btn" id="rt-copy" style="flex:1;">Copy (with bold)</button>
        </div>
        <div class="ap-ai-small" id="rt-note" style="margin-top:6px;">${note}</div>
      </div>`);
    box.scrollTop = box.scrollHeight;

    $("rt-reasons").addEventListener("click", (ev) => {
      const b = ev.target.closest("button[data-reason]");
      if (!b) return;
      selected = REASONS.find(r => r.id === b.dataset.reason);
      $("rt-reasons").querySelectorAll("button").forEach(x => {
        const on = x === b;
        x.style.background = on ? "#0a66ff" : "";
        x.style.color = on ? "#fff" : "";
      });
      const needsPo = selected.kind === "po" && PO_REASONS[selected.poReason].needsPo;
      $("rt-po-wrap").style.display = needsPo ? "" : "none";
    });

    const collect = () => {
      const to = $("rt-to").value.trim();
      const inv = window.__lastInvoice?.invoiceNumber;
      const correctPo = $("rt-correct-po").value.trim().toUpperCase();
      const errors = [];
      if (!selected) errors.push("Choose a reason first.");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) errors.push("Enter a valid recipient address.");
      if (!inv) errors.push("Invoice number was not detected – check it manually before sending.");
      if (selected?.kind === "po" && PO_REASONS[selected.poReason].needsPo && !correctPo) errors.push("Enter the correct PO number.");
      if (errors.length) { $("rt-note").innerHTML = "⚠️ " + errors.join("<br>⚠️ "); return null; }

      const email = buildEmail(selected.kind, {
        supplierName: supplier["Supplier Name"],
        invoiceNumber: inv,
        poReason: selected.poReason, correctPo,
        ourVat: company?.CompanyBTW || CONFIG.fallbackVat,
        peppol: CONFIG.peppolMailbox(cid),
        creditMailbox: CONFIG.creditMailbox(cid)
      });
      return { to, ...email };
    };

    $("rt-open").addEventListener("click", () => {
      const m = collect(); if (!m) return;
      const body = toText(m.blocks).replace(/\n/g, "\r\n");
      const url = `mailto:${encodeURIComponent(m.to)}?subject=${encodeURIComponent(m.subject)}&body=${encodeURIComponent(body)}`;
      $("rt-note").textContent = url.length > 2000
        ? "ℹ️ Long email – if your mail client cuts it off, use “Copy (with bold)” instead." : "";
      window.location.href = url;
    });

    $("rt-copy").addEventListener("click", async () => {
      const m = collect(); if (!m) return;
      const html = toHtml(m.blocks), plain = toText(m.blocks);
      try {
        if (window.ClipboardItem) {
          await navigator.clipboard.write([new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([plain], { type: "text/plain" })
          })]);
        } else {
          await navigator.clipboard.writeText(plain);
        }
        $("rt-note").textContent = `✅ Copied. To: ${m.to} · Subject: ${m.subject}`;
      } catch (e) {
        $("rt-note").textContent = "❌ Copy failed: " + e.message;
      }
    });
  }

  $("ai-btn-retour")?.addEventListener("click", showForm);
})();
