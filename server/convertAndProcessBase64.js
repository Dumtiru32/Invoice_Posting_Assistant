// server/convertAndProcessBase64.js (Pure JS OCR-to-TXT, Windows-safe)

import { createRequire } from "module";
const require = createRequire(import.meta.url);

const pdfParse = require("pdf-parse");
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";   // ← FIXED import path
import { PNG } from "pngjs";
import { createWorker } from "tesseract.js";

/**
 * convertAndProcessBase64()
 * Full OCR-to-TXT pipeline with pure-JS rasterization.
 */
export async function convertAndProcessBase64(base64String) {
  // ---------------------------
  // 1. Validate Base64
  // ---------------------------
  if (!base64String || typeof base64String !== "string") {
    throw new Error("INVALID_BASE64");
  }

  const cleaned = base64String
    .replace(/^data:application\/pdf;base64,/, "")
    .replace(/\s+/g, "");

  let buffer;
  try {
    buffer = Buffer.from(cleaned, "base64");
  } catch {
    throw new Error("INVALID_BASE64");
  }

  // Validate PDF header
  if (!(buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46)) {
    throw new Error("NOT_A_PDF");
  }

  const originalFile = buffer;

  // ---------------------------
  // 2. Pre-flight Text Detection
  // ---------------------------
  let pdfData;
  try {
    pdfData = await pdfParse(buffer, { max: 2 });
  } catch {
    throw new Error("PDF_PARSE_ERROR");
  }

  const extracted = (pdfData.text || "").replace(/\s+/g, "").trim();
  const isRasterBased = extracted.length < 10;

  if (!isRasterBased) {
    return {
      originalFile,
      processedTextFile: null,
      isRasterBased: false,
      ocrConfidence: 100
    };
  }

  // ---------------------------
  // 3. Load PDF with pdfjs-dist (pure JS)
  // ---------------------------
  const loadingTask = pdfjsLib.getDocument({ data: buffer });
  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;

  let fullText = "";
  let confidences = [];

  // ---------------------------
  // 4. Init OCR Worker
  // ---------------------------
  const worker = await createWorker();
  await worker.loadLanguage("eng");
  await worker.initialize("eng");

  // ---------------------------
  // 5. OCR each PDF page
  // ---------------------------
  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);

    // Render PDF page to a JS "canvas"
    const viewport = page.getViewport({ scale: 2.0 });
    const width = viewport.width | 0;
    const height = viewport.height | 0;

    const canvas = {
      width,
      height,
      data: new Uint8ClampedArray(width * height * 4)
    };

    const canvasFactory = {
      create: () => ({
        canvas,
        context: {
          putImageData: ({ data }) => canvas.data.set(data)
        }
      }),
      reset: () => {},
      destroy: () => {}
    };

    const renderContext = {
      canvasContext: {
        putImageData: ({ data }) => canvas.data.set(data)
      },
      viewport,
      canvasFactory
    };

    // Render into canvas buffer
    await page.render(renderContext).promise;

    // Convert pixel buffer → PNG
    const png = new PNG({ width, height });
    png.data = Buffer.from(canvas.data);
    const pngBuffer = PNG.sync.write(png);

    // OCR the PNG image
    const { data } = await worker.recognize(pngBuffer);

    fullText += data.text + "\n\n";
    confidences.push(data.confidence);
  }

  await worker.terminate();

  const avgConfidence = Math.round(
    confidences.reduce((a, b) => a + b, 0) / confidences.length
  );

  // ---------------------------
  // 6. Return TXT output
  // ---------------------------
  return {
    originalFile,
    processedTextFile: Buffer.from(fullText, "utf-8"),
    isRasterBased: true,
    ocrConfidence: avgConfidence
  };
}

export default { convertAndProcessBase64 };