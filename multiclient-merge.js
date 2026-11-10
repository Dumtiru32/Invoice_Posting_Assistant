(function (global) {
  "use strict";
  const $ = id => document.getElementById(id);
  const clean = v => v == null ? "" : String(v).trim();
  const norm = v => clean(v).replace(/\s+/g, "").toLowerCase();
  const account = v => (clean(v).match(/^\s*(\d{6})(?!\d)/) || [," "])[1].trim();
  const total = v => /(?:^grand total$| total$)/i.test(clean(v));
  const doc = v => clean(v).toLowerCase() === "(blank)" ? "" : clean(v).replaceAll("/", "-");
  const key = v => doc(v).toLowerCase().replace(/[^a-z0-9]+/g, "");
  const esc = v => clean(v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
  const safeName = v => (clean(v).replace(/[\\/:*?"<>|]+/g, "_").replace(/[. ]+$/g, "") || "Client") + ".pdf";
  const allowed = new Set(["609007", "607598"]), waste = "607599";
  let current = null, urls = [];

  function headerRow(rows) {
    for (let r = 0; r < rows.length; r++) if (norm(rows[r]?.[2]) === "segment4" && ["externaldocumentnr.","externaldocumentnr"].includes(norm(rows[r]?.[5]))) return r;
    throw new Error("Could not find Segment4 in column C and External Document Nr. in column F.");
  }
  function headerColumn(rows, h, names, fallback) {
    const set = new Set(names);
    const found = (rows[h] || []).findIndex(v => set.has(norm(v)));
    return found >= 0 ? found : fallback;
  }
  async function inspectMulti(file) {
    const wb = global.XLSX.read(await file.arrayBuffer(), {type:"array", cellFormula:false, cellHTML:false});
    if (!wb.SheetNames.includes("Overview")) throw new Error('The workbook does not contain the required "Overview" sheet.');
    const rows = global.XLSX.utils.sheet_to_json(wb.Sheets.Overview, {header:1, raw:true, defval:null, blankrows:true});
    const h = headerRow(rows), descCol = headerColumn(rows,h,["description"],7), groups = new Map();
    let client="", acc="";
    const group = name => { if (!groups.has(name)) groups.set(name,{clientName:name,entries:[],wasteDocumentsRequired:false,wasteDescriptions:[]}); return groups.get(name); };
    for (let r=h+1; r<rows.length; r++) {
      const row=rows[r]||[], rawClient=clean(row[0]), rawAcc=clean(row[2]), rawDoc=clean(row[5]);
      if (total(rawClient)) { client=""; acc=""; continue; }
      if (rawClient && rawClient.toLowerCase() !== "(blank)") { client=rawClient; acc=""; }
      if (!client) continue;
      const g=group(client);
      if (rawAcc && account(rawAcc)===waste) g.wasteDocumentsRequired=true;
      if (total(rawAcc)) { acc=""; continue; }
      if (rawAcc) acc=account(rawAcc);
      if (acc===waste) { g.wasteDocumentsRequired=true; const d=clean(row[descCol]); if(d && d.toLowerCase()!=="(blank)") g.wasteDescriptions.push(d); continue; }
      if (!allowed.has(acc) || !rawDoc || total(rawDoc)) continue;
      const number=doc(rawDoc); if(!number) continue;
      g.entries.push({row:r+1,account:acc,documentNumber:number,lookupKey:key(number),remarks:"",isWasteDocument:false});
    }
    const clients=[...groups.values()].filter(g=>g.entries.length||g.wasteDocumentsRequired).map(g=>{
      const seen=new Set(); g.entries=g.entries.filter(x=>x.lookupKey&&!seen.has(x.lookupKey)&&(seen.add(x.lookupKey),true)).map((x,i)=>({...x,sequence:i+1}));
      return {...g,outputName:safeName(g.clientName),count:g.entries.length,batchSize:20,batchCount:Math.ceil(g.entries.length/20),wasteDocuments:[],warnings:[]};
    });
    if(!clients.length) throw new Error("No qualifying clients were found in column A.");
    return {mode:"multi",clients,clientCount:clients.length,count:clients.reduce((s,c)=>s+c.count,0)};
  }
  function status(text,type="") { const el=$("mergeMessages"); if(el) el.innerHTML=`<div class="merge-alert ${type}">${text}</div>`; }
  function progress(n,text){ const b=$("mergeProgressBar"),t=$("mergeProgressText"); if(b)b.style.width=`${n}%`;if(t)t.textContent=text; }
  function clearClientUi(){ urls.forEach(URL.revokeObjectURL);urls=[];const c=$("mergeClientWorkspaces");if(c){c.innerHTML="";c.hidden=true;} }
  function render(data){
    clearClientUi(); const host=$("mergeClientWorkspaces"), single=$("mergePdfUploadCard"); if(single)single.hidden=true; host.hidden=false;
    host.innerHTML=data.clients.map((c,i)=>`<article class="merge-client-card" data-i="${i}"><h3>${esc(c.clientName)}</h3><div class="merge-client-meta">Output: <strong>${esc(c.outputName)}</strong></div>${c.wasteDocumentsRequired?'<div class="merge-alert waste-required"><strong>607599 waste PDFs required</strong><p>Upload at least one waste PDF for this client.</p></div>':''}<div class="merge-client-documents"><strong>${c.count} invoice document(s)</strong><ol>${c.entries.map(x=>`<li>${esc(x.documentNumber)} (${esc(x.account)})</li>`).join("")}</ol></div><label class="merge-dropzone"><strong>Upload PDFs for ${esc(c.clientName)}</strong><span>Only this client's PDFs</span><input class="merge-hidden-input mc-pdfs" type="file" accept=".pdf,application/pdf" multiple></label><div class="merge-file-summary mc-summary">No PDFs selected</div><label class="merge-client-continuation">Optional continuation PDF<input class="mc-cont" type="file" accept=".pdf,application/pdf"></label><div class="merge-client-actions"><button class="merge-primary mc-run" disabled>Validate and merge</button><a class="merge-download mc-download" hidden>Download ${esc(c.outputName)}</a></div><div class="merge-client-status"></div></article>`).join("");
    host.querySelectorAll(".merge-client-card").forEach(card=>{const i=+card.dataset.i,c=data.clients[i],input=card.querySelector(".mc-pdfs"),summary=card.querySelector(".mc-summary"),run=card.querySelector(".mc-run"),out=card.querySelector(".mc-download"),msg=card.querySelector(".merge-client-status");input.addEventListener("change",()=>{const fs=[...input.files].filter(f=>/\.pdf$/i.test(f.name));summary.textContent=fs.length?`${fs.length} PDF(s):\n${fs.map(f=>f.name).join("\n")}`:"No PDFs selected";run.disabled=!fs.length;out.hidden=true;msg.textContent="";});run.addEventListener("click",async()=>{run.disabled=true;out.hidden=true;msg.className="merge-client-status";msg.textContent="Validating...";try{const result=await global.PdfMergeWorkflow.processMerge({inspection:c,pdfFiles:[...input.files],continuationFile:card.querySelector(".mc-cont").files[0]||null,onProgress:(p,t)=>progress(p,`${c.clientName}: ${t}`)});if(!result.ok){const parts=[];if(result.missing?.length)parts.push(`Missing: ${result.missing.map(x=>esc(x.documentNumber)).join(", ")}`);if(result.ambiguous?.length)parts.push(`Ambiguous: ${result.ambiguous.map(x=>esc(x.documentNumber)).join(", ")}`);if(result.missingWasteDocuments?.length)parts.push("At least one 607599 waste PDF is required.");msg.className="merge-client-status error";msg.innerHTML=`<strong>Blocked only for ${esc(c.clientName)}.</strong><br>${parts.join("<br>")}`;return;}const url=URL.createObjectURL(result.file);urls.push(url);out.href=url;out.download=c.outputName;out.hidden=false;msg.className="merge-client-status success";msg.textContent=`Merged ${result.mergedSourceCount} PDF(s).`;progress(100,`${c.clientName}: complete`);}catch(e){msg.className="merge-client-status error";msg.textContent=e.message;}finally{run.disabled=false;}});});
    $("mergeOrderedList").innerHTML=`<p><strong>${data.clientCount}</strong> clients detected. Each client is uploaded, validated, merged and downloaded separately.</p><ul>${data.clients.map(c=>`<li>${esc(c.clientName)}: ${c.count} invoice document(s)${c.wasteDocumentsRequired?" + waste PDFs":""}</li>`).join("")}</ul>`;
    status("Multi-client report inspected. A failed client does not block the other clients.","success");
  }
  document.addEventListener("DOMContentLoaded",()=>{
    const select=$("mergeFileType"), inspect=$("inspectMergeReportBtn"), host=$("mergeClientWorkspaces"), single=$("mergePdfUploadCard");
    select?.addEventListener("change",()=>{current=null;clearClientUi();if(single)single.hidden=false;});
    inspect?.addEventListener("click",async e=>{if(select?.value!=="multi")return;e.preventDefault();e.stopImmediatePropagation();const file=$("mergeReportInput")?.files?.[0];if(!file)return status("Upload the multi-client Consumables report first.","error");inspect.disabled=true;progress(10,"Inspecting multi-client report...");try{current=await inspectMulti(file);render(current);progress(100,`Report inspected: ${current.clientCount} clients`);}catch(err){current=null;progress(0,"Inspection failed");status(esc(err.message),"error");}finally{inspect.disabled=false;}},true);
  });
})(window);
