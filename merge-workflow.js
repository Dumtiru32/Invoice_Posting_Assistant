/*
 * Browser-only PDF merge workflow for Invoice Posting Assistant.
 * Replaces merge_server.py, openxl.py and pdf.py for the Merging PDF procedure only.
 * Requires XLSX (SheetJS) and PDFLib to be loaded before this file.
 */
(function exposePdfMergeWorkflow(global) {
  "use strict";

  const STANDARD_ACCOUNTS = new Set(["609007", "607598"]);
  const SPECIAL_ACCOUNTS = new Set(["601101", "607598"]);
  const WASTE_ACCOUNT = "607599";
  const SEGMENT4_COLUMN = 3;              // Excel column C, one-based
  const EXTERNAL_DOCUMENT_COLUMN = 6;     // Excel column F, one-based
  const DEFAULT_DESCRIPTION_COLUMN = 8;   // Excel column H, one-based
  const OVERVIEW_SHEET = "Overview";
  const BATCH_SIZE = 20;
  const MAX_TOTAL_BYTES = 750 * 1024 * 1024;
  const PARSER_VERSION = "pivot-fill-v3-js";

  function assertLibraries() {
    if (!global.XLSX) {
      throw new Error("The Excel library (SheetJS) is not loaded. Check the XLSX script reference in index.html.");
    }
    if (!global.PDFLib?.PDFDocument) {
      throw new Error("The PDF library (pdf-lib) is not loaded. Check the PDFLib script reference in index.html.");
    }
  }

  function clean(value) {
    if (value === null || typeof value === "undefined") return "";
    if (typeof value === "number" && Number.isInteger(value)) return String(value);
    return String(value).trim();
  }

  function normalizeDocumentNumber(value) {
    const text = clean(value);
    if (!text || text.toLowerCase() === "(blank)") return "";
    return text.replaceAll("/", "-");
  }

  function canonicalLookup(value) {
    return normalizeDocumentNumber(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
  }

  function accountCode(value) {
    const text = clean(value);
    const match = text.match(/^\s*(\d{6})(?!\d)/);
    return match ? match[1] : text;
  }

  function isTotalLabel(value) {
    return clean(value).toLowerCase().endsWith(" total");
  }

  function normalizedHeader(value) {
    return clean(value).replace(/\s+/g, "").toLowerCase();
  }

  function cell(rows, rowNumber, columnNumber) {
    return rows[rowNumber - 1]?.[columnNumber - 1] ?? null;
  }

  function findHeaderRow(rows) {
    for (let row = 1; row <= rows.length; row += 1) {
      const segmentHeader = normalizedHeader(cell(rows, row, SEGMENT4_COLUMN));
      const documentHeader = normalizedHeader(cell(rows, row, EXTERNAL_DOCUMENT_COLUMN));
      if (
        segmentHeader === "segment4" &&
        ["externaldocumentnr.", "externaldocumentnr"].includes(documentHeader)
      ) {
        return row;
      }
    }
    throw new Error(
      "Could not find the header row. Expected Segment4 in column C and External Document Nr. in column F."
    );
  }

  function findColumnByHeader(rows, headerRow, names) {
    const header = rows[headerRow - 1] || [];
    for (let index = 0; index < header.length; index += 1) {
      if (names.has(normalizedHeader(header[index]))) return index + 1;
    }
    return null;
  }

  function detectSpecialCustomer(rows, workbookName) {
    const parts = [String(workbookName || "").replace(/\.[^.]+$/, "")];
    rows.slice(0, 30).forEach(row => {
      row.forEach(value => {
        if (value !== null && typeof value !== "undefined") parts.push(clean(value));
      });
    });
    const haystack = parts.join(" ").toLowerCase();
    return haystack.includes("delonghi") || haystack.includes("kitchena");
  }

  function outputNameFor(workbookName) {
    const name = String(workbookName || "report.xlsx");
    return name.replace(/\.(xlsx|xlsm)$/i, "") + ".pdf";
  }

  async function inspectWorkbook(workbookFile) {
    assertLibraries();
    if (!(workbookFile instanceof File)) {
      throw new Error("Upload exactly one Excel report first.");
    }
    if (!/\.(xlsx|xlsm)$/i.test(workbookFile.name)) {
      throw new Error("The report must be an .xlsx or .xlsm workbook.");
    }

    let workbook;
    try {
      const bytes = await workbookFile.arrayBuffer();
      workbook = global.XLSX.read(bytes, {
        type: "array",
        cellDates: false,
        cellFormula: false,
        cellHTML: false
      });
    } catch (error) {
      throw new Error(`The Excel report could not be opened: ${error.message}`);
    }

    if (!workbook.SheetNames.includes(OVERVIEW_SHEET)) {
      throw new Error('The workbook does not contain the required "Overview" sheet.');
    }

    const worksheet = workbook.Sheets[OVERVIEW_SHEET];
    const rows = global.XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: true
    });

    const headerRow = findHeaderRow(rows);
    const remarksColumn = findColumnByHeader(
      rows,
      headerRow,
      new Set(["remark", "remarks", "comment", "comments"])
    );
    const descriptionColumn = findColumnByHeader(
      rows,
      headerRow,
      new Set(["description"])
    ) || DEFAULT_DESCRIPTION_COLUMN;

    const specialCustomer = detectSpecialCustomer(rows, workbookFile.name);
    const allowedAccounts = specialCustomer ? SPECIAL_ACCOUNTS : STANDARD_ACCOUNTS;

    const entries = [];
    const wasteDocuments = [];
    const wasteDescriptions = [];
    const emptyDocumentRows = [];
    let wasteAccountPresent = false;
    let currentAccount = "";
    let currentDocument = "";

    for (let rowNumber = headerRow + 1; rowNumber <= rows.length; rowNumber += 1) {
      const rawAccount = clean(cell(rows, rowNumber, SEGMENT4_COLUMN));
      const rawDocument = clean(cell(rows, rowNumber, EXTERNAL_DOCUMENT_COLUMN));

      // Detect 607599 before skipping totals. A collapsed Pivot can expose only "607599 Total".
      if (rawAccount && accountCode(rawAccount) === WASTE_ACCOUNT) {
        wasteAccountPresent = true;
      }

      if (isTotalLabel(rawAccount)) {
        currentAccount = "";
        currentDocument = "";
        continue;
      }
      if (isTotalLabel(rawDocument)) {
        currentDocument = "";
        continue;
      }

      if (rawAccount) {
        const code = accountCode(rawAccount);
        if (code !== currentAccount) currentDocument = "";
        currentAccount = code;
      }
      const account = currentAccount;

      if (account === WASTE_ACCOUNT) {
        wasteAccountPresent = true;
        const description = clean(cell(rows, rowNumber, descriptionColumn));
        if (description && description.toLowerCase() !== "(blank)") {
          wasteDescriptions.push({ row: rowNumber, description });
        }
        const documentNumber = normalizeDocumentNumber(rawDocument);
        if (documentNumber) {
          const remarks = remarksColumn ? clean(cell(rows, rowNumber, remarksColumn)) : "";
          wasteDocuments.push({
            sequence: wasteDocuments.length + 1,
            row: rowNumber,
            documentNumber,
            remarks
          });
        }
        continue;
      }

      if (!allowedAccounts.has(account)) continue;
      if (!rawDocument) continue;

      currentDocument = normalizeDocumentNumber(rawDocument);
      const documentNumber = currentDocument;
      if (!documentNumber) {
        emptyDocumentRows.push(rowNumber);
        continue;
      }

      entries.push({
        sequence: entries.length + 1,
        row: rowNumber,
        account,
        documentNumber,
        rawDocumentNumber: rawDocument,
        remarks: remarksColumn ? clean(cell(rows, rowNumber, remarksColumn)) : "",
        lookupKey: canonicalLookup(documentNumber),
        requiresExplicitUpload: false,
        isWasteDocument: false,
        documentType: "Invoice document"
      });
    }

    if (!entries.length && !wasteAccountPresent) {
      throw new Error(
        "No qualifying rows were found in the Overview sheet for the configured Segment4 accounts."
      );
    }

    const keyRows = new Map();
    entries.forEach(entry => {
      if (!keyRows.has(entry.lookupKey)) keyRows.set(entry.lookupKey, []);
      keyRows.get(entry.lookupKey).push(entry.row);
    });

    const duplicateKeys = new Set(
      [...keyRows.entries()]
        .filter(([key, sourceRows]) => key && sourceRows.length > 1)
        .map(([key]) => key)
    );
    const duplicateDocuments = [...new Set(
      entries
        .filter(entry => duplicateKeys.has(entry.lookupKey))
        .map(entry => entry.documentNumber)
    )].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));

    const uniqueEntries = [];
    const seenKeys = new Set();
    entries.forEach(entry => {
      if (seenKeys.has(entry.lookupKey)) return;
      seenKeys.add(entry.lookupKey);
      entry.sequence = uniqueEntries.length + 1;
      const sourceRows = keyRows.get(entry.lookupKey) || [];
      if (sourceRows.length > 1) {
        entry.sourceRows = sourceRows;
        entry.occurrenceCount = sourceRows.length;
      }
      uniqueEntries.push(entry);
    });

    const warnings = [];
    if (duplicateDocuments.length) {
      warnings.push(
        "Repeated document references were consolidated. Upload one PDF per unique document; each PDF will be merged once at its first Pivot-table occurrence."
      );
    }
    if (wasteAccountPresent) {
      warnings.push(
        "Account 607599 (waste) is present. Upload ALL waste-related PDFs; the number of documents cannot be determined from the report."
      );
    }

    return {
      parserVersion: PARSER_VERSION,
      workbookName: workbookFile.name,
      outputName: outputNameFor(workbookFile.name),
      sheet: OVERVIEW_SHEET,
      headerRow,
      remarksColumn,
      descriptionColumn,
      specialCustomerRule: specialCustomer,
      allowedAccounts: [...new Set([...allowedAccounts, WASTE_ACCOUNT])].sort(),
      entries: uniqueEntries,
      count: uniqueEntries.length,
      batchSize: BATCH_SIZE,
      batchCount: Math.ceil(uniqueEntries.length / BATCH_SIZE),
      duplicateDocuments,
      emptyDocumentRows,
      wasteDocumentsRequired: wasteAccountPresent,
      wasteDocumentCount: null,
      wasteDocumentCountKnown: false,
      wasteDocuments,
      wasteDescriptions,
      explicit607599Documents: wasteDocuments,
      warnings
    };
  }

  async function validatePdf(file) {
    if (!(file instanceof File)) throw new Error("PDF file is missing.");
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      throw new Error(`Not a PDF file: ${file.name}`);
    }
    try {
      const bytes = await file.arrayBuffer();
      const document = await global.PDFLib.PDFDocument.load(bytes);
      const pageCount = document.getPageCount();
      if (pageCount < 1) throw new Error("the file contains no pages");
      document.getPage(0);
      return { file, bytes, pageCount };
    } catch (error) {
      throw new Error(`Unreadable PDF ${file.name}: ${error.message}`);
    }
  }

  function duplicateUploadNames(files) {
    const counts = new Map();
    files.forEach(file => {
      const key = file.name.toLowerCase();
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([name]) => name)
      .sort();
  }

  async function inspectUploadedPdfs(files, onProgress) {
    const valid = [];
    const unreadable = [];
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      try {
        valid.push(await validatePdf(file));
      } catch (error) {
        unreadable.push({ fileName: file.name, error: error.message });
      }
      onProgress?.(20 + Math.round(((index + 1) / Math.max(files.length, 1)) * 35), "Validating PDFs...");
    }
    return { valid, unreadable };
  }

  function matchUploadedPdfs(entries, validated, uploadedFiles) {
    const byKey = new Map();
    validated.forEach(item => {
      const key = canonicalLookup(item.file.name.replace(/\.pdf$/i, ""));
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(item);
    });

    const ordered = [];
    const missing = [];
    const ambiguous = [];
    const used = new Set();
    const seenEntryKeys = new Set();

    entries.forEach(entry => {
      const key = entry.lookupKey;
      if (seenEntryKeys.has(key)) return;
      seenEntryKeys.add(key);

      let candidates = byKey.get(key) || [];
      if (!candidates.length) {
        candidates = validated.filter(item => {
          const fileKey = canonicalLookup(item.file.name.replace(/\.pdf$/i, ""));
          return key && (key.includes(fileKey) || fileKey.includes(key));
        });
      }
      candidates = candidates.filter(item => !used.has(item.file));

      if (candidates.length === 1) {
        used.add(candidates[0].file);
        ordered.push(candidates[0]);
      } else if (candidates.length === 0) {
        missing.push({
          documentNumber: entry.documentNumber,
          remarks: entry.remarks,
          isWasteDocument: false
        });
      } else {
        ambiguous.push({
          documentNumber: entry.documentNumber,
          candidates: candidates.map(item => item.file.name),
          remarks: entry.remarks,
          isWasteDocument: false
        });
      }
    });

    const unexpectedItems = validated.filter(item => !used.has(item.file));
    return {
      ordered,
      missing,
      ambiguous,
      unexpectedItems,
      unexpected: unexpectedItems.map(item => item.file.name),
      duplicateUploads: duplicateUploadNames(uploadedFiles),
      missingWasteDocuments: [],
      ambiguousWasteDocuments: []
    };
  }

  async function mergePdfFiles(outputName, validatedInputs, onProgress) {
    if (!validatedInputs.length) throw new Error("No input PDFs were provided.");
    const output = await global.PDFLib.PDFDocument.create();

    for (let index = 0; index < validatedInputs.length; index += 1) {
      const input = validatedInputs[index];
      const source = await global.PDFLib.PDFDocument.load(input.bytes);
      const pages = await output.copyPages(source, source.getPageIndices());
      pages.forEach(page => output.addPage(page));
      onProgress?.(
        60 + Math.round(((index + 1) / validatedInputs.length) * 35),
        `Merging PDF ${index + 1} of ${validatedInputs.length}...`
      );
    }

    const outputBytes = await output.save();
    return new File([outputBytes], outputName, { type: "application/pdf" });
  }

  async function processMerge({ inspection, pdfFiles, continuationFile = null, onProgress = null }) {
    assertLibraries();
    if (!inspection?.entries) {
      throw new Error("The report session is missing. Inspect the Excel report again.");
    }

    const uploaded = Array.from(pdfFiles || []).filter(file => file?.name?.toLowerCase().endsWith(".pdf"));
    if (!uploaded.length) throw new Error("Upload the required PDF files.");
    if (uploaded.reduce((sum, file) => sum + file.size, 0) + (continuationFile?.size || 0) > MAX_TOTAL_BYTES) {
      throw new Error("The selected files are too large. The total upload size cannot exceed 750 MB.");
    }

    onProgress?.(10, "Reading selected PDFs...");
    const inspected = await inspectUploadedPdfs(uploaded, onProgress);
    const match = matchUploadedPdfs(inspection.entries, inspected.valid, uploaded);
    match.unreadable = inspected.unreadable;

    const wasteRequired = Boolean(inspection.wasteDocumentsRequired);
    const wasteItems = wasteRequired ? match.unexpectedItems : [];
    const unexpectedMerged = wasteItems.map(item => item.file.name);
    const unexpected = wasteRequired ? [] : match.unexpected;
    const missingWasteDocuments = wasteRequired && !wasteItems.length
      ? [{ documentNumber: "607599 waste supporting document" }]
      : [];

    const blocking = Boolean(
      match.missing.length ||
      match.ambiguous.length ||
      match.unreadable.length ||
      match.duplicateUploads.length ||
      missingWasteDocuments.length
    );

    if (blocking) {
      return {
        ok: false,
        complete: false,
        error: "Validation failed. No merged PDF was created.",
        message: "Validation failed. No merged PDF was created.",
        missing: match.missing,
        ambiguous: match.ambiguous,
        unreadable: match.unreadable,
        duplicateUploads: match.duplicateUploads,
        missingWasteDocuments,
        ambiguousWasteDocuments: [],
        unreadableWasteDocuments: [],
        duplicateWasteUploads: [],
        unexpected
      };
    }

    const orderedInputs = [];
    let usedContinuation = false;
    if (continuationFile) {
      const validatedContinuation = await validatePdf(continuationFile);
      orderedInputs.push(validatedContinuation);
      usedContinuation = true;
    }
    orderedInputs.push(...match.ordered);
    orderedInputs.push(...wasteItems);

    const file = await mergePdfFiles(inspection.outputName, orderedInputs, onProgress);
    onProgress?.(100, "Merge complete");

    return {
      ok: true,
      complete: true,
      file,
      fileName: file.name,
      mergedSourceCount: match.ordered.length + wasteItems.length,
      usedContinuation,
      wasteDocumentsMerged: wasteItems.length,
      unexpected,
      unexpectedMerged,
      message: wasteRequired
        ? "Every required invoice was uniquely matched. Additional PDFs were treated as 607599 waste documents, validated, and merged in upload order."
        : "Every required invoice was uniquely matched and merged in workbook order."
    };
  }

  global.PdfMergeWorkflow = Object.freeze({
    parserVersion: PARSER_VERSION,
    inspectWorkbook,
    processMerge,
    canonicalLookup
  });
})(window);
