"use strict";

/**
 * Multi-period invoice detector.
 *
 * Detects:
 * - Full numeric ranges: 04/08/2026 - 04/08/2027
 * - OCR separators/entities: 01/01/24 -&gt; 31/12/24
 * - Month/year ranges: 10/2024 - 09/2025
 * - Named-month dates: 31-Mar-26 - 30-Mar-27
 * - Year ranges: 2026 - 2027
 * - Labelled ranges: Vanaf ... Tot, From ... To, Von/vom ... Bis, Du ... Au
 * - Quarter references: Q3 2025, per quarter Q4
 * - Named-month periods: Period January-December 2026
 * - Periodicity wording: monthly, annually, yearly, per month/year
 * - German service-period wording, including an OCR-corrupted start value
 *
 * Exposes:
 * - window.checkMultiPeriodInvoice(invoiceText)
 * - window.getMultiPeriodInvoiceDetails(invoiceText)
 * - window.findMultiPeriodRanges(invoiceText)
 */
(function exposeMultiPeriodDetector(global) {
  const YEAR_MIN = 1900;
  const YEAR_MAX = 2199;

  const MONTH_NAME_SOURCE =
    String.raw`(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)`;

  const MONTH_NAME_MAP = Object.freeze({
    jan: 1, january: 1,
    feb: 2, february: 2,
    mar: 3, march: 3,
    apr: 4, april: 4,
    may: 5,
    jun: 6, june: 6,
    jul: 7, july: 7,
    aug: 8, august: 8,
    sep: 9, sept: 9, september: 9,
    oct: 10, october: 10,
    nov: 11, november: 11,
    dec: 12, december: 12
  });

  // Ordered from most specific to least specific.
  const DATE_TOKEN_SOURCE = [
    // DD-MMM-YY / DD-MMM-YYYY, e.g. 31-Mar-26
    String.raw`\d{1,2}\s*[-./]\s*${MONTH_NAME_SOURCE}\s*[-./]\s*(?:(?:19|20|21)\d{2}|\d{2})`,

    // DD/MM/YYYY, DD/MM/YY, DD.MM.YYYY, DD-MM-YY, OCR DD//MM/YY
    String.raw`\d{1,2}\s*(?:\/{1,2}|\.|-)\s*\d{1,2}\s*(?:\/{1,2}|\.|-)\s*(?:(?:19|20|21)\d{2}|\d{2})`,

    // YYYY-MM-DD, YYYY/MM/DD, YYYY.MM.DD
    String.raw`(?:19|20|21)\d{2}\s*[-./]\s*\d{1,2}\s*[-./]\s*\d{1,2}`,

    // MM/YYYY, MM/YY, MM.YYYY, MM.YY
    String.raw`\d{1,2}\s*[/.]\s*(?:(?:19|20|21)\d{2}|\d{2})`,

    // Month YYYY
    // Examples: October 2025, Mar 2026
    String.raw`${MONTH_NAME_SOURCE}\s+(?:19|20|21)\d{2}`,

    // Four-digit year
    String.raw`(?:19|20|21)\d{2}`
  ].join("|");

  const RANGE_SEPARATOR_SOURCE =
    String.raw`(?:->|→|–|—|-|\bto\b|\buntil\b|\btill\b|\bt\.e\.m\.\b)`;

  const DATE_RANGE_REGEX = new RegExp(
    String.raw`(?<![\d./-])` +
      String.raw`(${DATE_TOKEN_SOURCE})` +
      String.raw`\s*(${RANGE_SEPARATOR_SOURCE})\s*` +
      String.raw`(${DATE_TOKEN_SOURCE})` +
      String.raw`(?![\d./-])`,
    "giu"
  );

  const LABELLED_PERIOD_PAIRS = [
    { start: "vanaf", end: "tot", language: "nl" },
    { start: "van", end: "tot", language: "nl" },
    { start: "from", end: "to", language: "en" },
    { start: "start", end: "end", language: "en" },
    { start: "starting", end: "ending", language: "en" },
    { start: "von", end: "bis", language: "de" },
    { start: "vom", end: "bis", language: "de" },
    { start: "du", end: "au", language: "fr" },
    { start: "de", end: "(?:à|a)", language: "fr" }
  ];

  const LABELLED_PERIOD_REGEXES = LABELLED_PERIOD_PAIRS.map(pair => ({
    ...pair,
    regex: new RegExp(
      String.raw`\b(?:${pair.start})\b` +
        String.raw`\s*[:\-]?\s*` +
        String.raw`(${DATE_TOKEN_SOURCE})` +
        String.raw`[\s,;|]*` +
        String.raw`\b(?:${pair.end})\b` +
        String.raw`\s*[:\-]?\s*` +
        String.raw`(${DATE_TOKEN_SOURCE})`,
      "giu"
    )
  }));

  const PERIOD_INDICATION_REGEXES = [
    // Annual tax / assessment-year indication
    // Examples:
    // Property tax Beringen AJ 2026
    // Property Tax AJ 2025
    // Onroerende voorheffing AJ 2026
    /\b(?:property\s+tax|onroerende\s+voorheffing|vastgoedbelasting)\b.{0,80}?\bAJ\s*(?:19|20|21)\d{2}\b/giu,

    // Dutch maintenance contract + year
    // Examples:
    // ONDERHOUDSCONTRACT ROBATECH 2026
    // ONDERHOUDSCONTRACT 2026
    // Onderhoudscontract machine 2027
    /\bONDERHOUDSCONTRACT\b.{0,80}?\b(?:19|20|21)\d{2}\b/giu,

    // Table/header layout:
    // Start Date End Date 01.07.2026 30.06.2027
    /\bStart\s+Date\s+End\s+Date\s+\d{1,2}[./-]\d{1,2}[./-](?:\d{2}|\d{4})\s+\d{1,2}[./-]\d{1,2}[./-](?:\d{2}|\d{4})\b/giu,

    // Named month range in one year: Period January-December 2026
    new RegExp(
      String.raw`\b(?:period\s*:?\s*)?${MONTH_NAME_SOURCE}\s*(?:-|–|—|->|to)\s*${MONTH_NAME_SOURCE}\s+(?:19|20|21)\d{2}\b`,
      "giu"
    ),

    // German service period. Allows OCR noise between "vom" and "bis".
    /\b(?:Leistungsdatum|Leistungszeitraum|Leistungsperiode)\b\s+vom\b.{0,60}?\bbis\b\s+\d{1,2}[./-]\d{1,2}[./-](?:\d{2}|\d{4})\b/giu,

    // Quarter + year and year + quarter
    /\bQ[1-4]\s*[-/]?\s*(?:19|20|21)\d{2}\b/giu,
    /\b(?:19|20|21)\d{2}\s*[-/]?\s*Q[1-4]\b/giu,

    // Quarter wording
    /\bper\s+quarter\b(?:\s*[,;:\-]?\s*\bQ[1-4]\b)?/giu,
    /\bquarterly\b(?:\s*[,;:\-]?\s*\bQ[1-4]\b)?/giu,
    /\b(?:quarter|quarterly)\s*[,;:\-]?\s*Q[1-4]\b/giu,

    // Month/year periodicity
    /\bper\s+month\b/giu,
    /\bmonthly\b/giu,
    /\bper\s+year\b/giu,
    /\bannually\b/giu,
    /\byearly\b/giu,
    /\bjaarlijks\b/giu
  ];

  function toSearchableText(input) {
    if (typeof input !== "string" || !input.trim()) return "";

    let text = input;

    if (/[<&]/.test(text) && typeof DOMParser === "function") {
      try {
        const documentObject = new DOMParser().parseFromString(text, "text/html");
        text = documentObject.body?.textContent || text;
      } catch (error) {
        console.warn("Could not parse invoice HTML:", error);
      }
    }

    // Also decode common entities explicitly, so raw OCR strings containing
    // literal "-&gt;" work even when DOMParser is unavailable.
    return text
      .replace(/&nbsp;|&#160;/gi, " ")
      .replace(/&gt;|&#62;/gi, ">")
      .replace(/&lt;|&#60;/gi, "<")
      .replace(/&amp;/gi, "&")
      .replace(/&rarr;|&#8594;/gi, "→")
      .replace(/&ndash;|&#8211;/gi, "–")
      .replace(/&mdash;|&#8212;/gi, "—")
      .replace(/\u00A0/g, " ")
      .replace(/-{2,}>/g, "->")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isPlausibleYear(year) {
    return Number.isInteger(year) && year >= YEAR_MIN && year <= YEAR_MAX;
  }

  function normalizeYear(rawYear) {
    const value = String(rawYear ?? "").trim();
    if (!/^(?:\d{2}|\d{4})$/.test(value)) return null;

    let year = Number(value);
    if (value.length === 2) year = year <= 69 ? 2000 + year : 1900 + year;

    return isPlausibleYear(year) ? year : null;
  }

  function createValidatedFullDate(year, month, day) {
    if (!isPlausibleYear(year)) return null;
    if (!Number.isInteger(month) || month < 1 || month > 12) return null;
    if (!Number.isInteger(day) || day < 1) return null;

    const maximumDay = new Date(year, month, 0).getDate();
    if (day > maximumDay) return null;

    return { year, month, day, precision: 3 };
  }

  /**
   * Parses one supported date token without removing any prior cases.
   */
  function parseDateToken(rawValue) {
    if (!rawValue) return null;

    const compactValue = String(rawValue)
      .trim()
      .replace(/\s+/g, "")
      .replace(/\/{2,}/g, "/");

    let match;

    // DD-MMM-YY / DD-MMM-YYYY
    match = compactValue.match(
      /^(\d{1,2})[-./](jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[-./]((?:19|20|21)\d{2}|\d{2})$/i
    );
    if (match) {
      const day = Number(match[1]);
      const month = MONTH_NAME_MAP[match[2].toLowerCase()];
      const year = normalizeYear(match[3]);
      return month && year !== null
        ? createValidatedFullDate(year, month, day)
        : null;
    }
    // Month YYYY
    // Examples:
    // October 2025
    // March 2027
    // Oct 2026
    match = compactValue.match(
      /^(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)((?:19|20|21)\d{2})$/i
    );

    if (match) {
      const month = MONTH_NAME_MAP[match[1].toLowerCase()];
      const year = normalizeYear(match[2]);

      if (!month || year === null) {
        return null;
      }

      return {
        year,
        month,
        day: null,
        precision: 2
      };
    }

    // Four-digit year only
    match = compactValue.match(/^((?:19|20|21)\d{2})$/);
    if (match) {
      const year = normalizeYear(match[1]);
      return year !== null
        ? { year, month: null, day: null, precision: 1 }
        : null;
    }

    // MM/YYYY, MM/YY, MM.YYYY, MM.YY
    match = compactValue.match(/^(\d{1,2})[/.]((?:19|20|21)\d{2}|\d{2})$/);
    if (match) {
      const month = Number(match[1]);
      const year = normalizeYear(match[2]);
      return year !== null && month >= 1 && month <= 12
        ? { year, month, day: null, precision: 2 }
        : null;
    }

    // YYYY-MM-DD / YYYY/MM/DD / YYYY.MM.DD
    match = compactValue.match(/^((?:19|20|21)\d{2})[-./](\d{1,2})[-./](\d{1,2})$/);
    if (match) {
      return createValidatedFullDate(
        Number(match[1]),
        Number(match[2]),
        Number(match[3])
      );
    }

    // DD/MM/YYYY, DD/MM/YY, DD.MM.YYYY, DD-MM-YY
    match = compactValue.match(/^(\d{1,2})[-./](\d{1,2})[-./]((?:19|20|21)\d{2}|\d{2})$/);
    if (match) {
      const year = normalizeYear(match[3]);
      return year !== null
        ? createValidatedFullDate(year, Number(match[2]), Number(match[1]))
        : null;
    }

    return null;
  }

  function toComparableNumber(parsed) {
    return parsed.year * 10000 + (parsed.month || 0) * 100 + (parsed.day || 0);
  }

  function formatDateToken(parsed) {
    const year = String(parsed.year);
    if (parsed.precision === 1) return year;

    const month = String(parsed.month).padStart(2, "0");
    if (parsed.precision === 2) return `${month}/${year}`;

    const day = String(parsed.day).padStart(2, "0");
    return `${day}/${month}/${year}`;
  }

  function validatePeriod(rawStart, rawEnd) {
    const parsedStart = parseDateToken(rawStart);
    const parsedEnd = parseDateToken(rawEnd);

    if (!parsedStart || !parsedEnd) return null;
    if (parsedStart.precision !== parsedEnd.precision) return null;
    if (toComparableNumber(parsedStart) >= toComparableNumber(parsedEnd)) return null;

    const start = formatDateToken(parsedStart);
    const end = formatDateToken(parsedEnd);
    return { start, end, normalized: `${start} - ${end}` };
  }

  function addUniqueMatch(matches, seen, candidate) {
    if (!candidate || seen.has(candidate.normalized)) return;
    seen.add(candidate.normalized);
    matches.push(candidate);
  }

  function findDirectRanges(searchableText, matches, seen) {
    DATE_RANGE_REGEX.lastIndex = 0;
    let match;

    while ((match = DATE_RANGE_REGEX.exec(searchableText)) !== null) {
      const validated = validatePeriod(match[1], match[3]);
      if (!validated) continue;

      addUniqueMatch(matches, seen, {
        raw: match[0].replace(/\s+/g, " ").trim(),
        normalized: validated.normalized,
        start: validated.start,
        end: validated.end,
        separator: match[2],
        type: "direct-range",
        index: match.index
      });
    }
  }

  function findLabelledRanges(searchableText, matches, seen) {
    for (const definition of LABELLED_PERIOD_REGEXES) {
      definition.regex.lastIndex = 0;
      let match;

      while ((match = definition.regex.exec(searchableText)) !== null) {
        const validated = validatePeriod(match[1], match[2]);
        if (!validated) continue;

        addUniqueMatch(matches, seen, {
          raw: match[0].replace(/\s+/g, " ").trim(),
          normalized: validated.normalized,
          start: validated.start,
          end: validated.end,
          separator: `${definition.start}/${definition.end}`,
          type: "labelled-period",
          language: definition.language,
          index: match.index
        });
      }
    }
  }

  function findPeriodIndications(searchableText) {
    const results = [];
    const seen = new Set();

    for (const regex of PERIOD_INDICATION_REGEXES) {
      regex.lastIndex = 0;
      let match;

      while ((match = regex.exec(searchableText)) !== null) {
        const normalized = match[0].replace(/\s+/g, " ").trim();
        if (seen.has(normalized.toLowerCase())) continue;
        seen.add(normalized.toLowerCase());

        results.push({
          raw: normalized,
          normalized,
          type: "period-indication",
          index: match.index
        });
      }
    }

    results.sort((a, b) => a.index - b.index);
    return results;
  }

    function findStartEndTableRanges(searchableText, matches, seen) {
      const regex =
        /\bStart\s+Date\s+End\s+Date\s+(\d{1,2}[./-]\d{1,2}[./-](?:\d{2}|\d{4}))\s+(\d{1,2}[./-]\d{1,2}[./-](?:\d{2}|\d{4}))\b/giu;

      let match;

      while ((match = regex.exec(searchableText)) !== null) {
        const validated = validatePeriod(match[1], match[2]);

        if (!validated) {
          continue;
        }

        addUniqueMatch(matches, seen, {
          raw: match[0].replace(/\s+/g, " ").trim(),
          normalized: validated.normalized,
          start: validated.start,
          end: validated.end,
          separator: "Start Date / End Date",
          type: "start-end-table",
          language: "en",
          index: match.index
        });
      }
    }

  function findMultiPeriodRanges(invoiceText) {
    const searchableText = toSearchableText(invoiceText);
    if (!searchableText) return [];

    const matches = [];
    const seen = new Set();
    findDirectRanges(searchableText, matches, seen);
    findLabelledRanges(searchableText, matches, seen);
    findStartEndTableRanges(searchableText, matches, seen);
    matches.sort((a, b) => a.index - b.index);
    return matches;
  }

  function findAllMultiPeriodMatches(invoiceText) {
    const searchableText = toSearchableText(invoiceText);
    if (!searchableText) return [];

    const results = findMultiPeriodRanges(searchableText);
    const seen = new Set(results.map(item => item.normalized.toLowerCase()));

    for (const indication of findPeriodIndications(searchableText)) {
      if (!seen.has(indication.normalized.toLowerCase())) {
        seen.add(indication.normalized.toLowerCase());
        results.push(indication);
      }
    }

    results.sort((a, b) => a.index - b.index);
    return results;
  }

  function checkMultiPeriodInvoice(invoiceText) {
    return findAllMultiPeriodMatches(invoiceText)[0]?.normalized || null;
  }

  function getMultiPeriodInvoiceDetails(invoiceText) {
    return findAllMultiPeriodMatches(invoiceText)[0] || null;
  }


  /**
   * Escapes a supplier-configured label for use in RegExp.
   */
  function escapeRegexLiteral(value) {
    return String(value ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // ============================================================
  // HIGH INVOICE AMOUNT DETECTION
  // ============================================================

  const HIGH_AMOUNT_THRESHOLD_EUR = 10000;

  /**
   * Converts common European/international monetary formats
   * into a JavaScript number.
   *
   * Supported:
   * 12.345,67
   * 12,345.67
   * 12345,67
   * 12345.67
   * 12 345,67
   * EUR 12.345,67
   * € 12,345.67
   */
  function parseInvoiceAmount(rawValue) {
    if (rawValue == null) {
      return null;
    }

    let value = String(rawValue)
      .replace(/\u00A0/g, " ")
      .replace(/(?:EUR|EURO|€)/giu, "")
      .replace(/[\s'’]/g, "")
      .replace(/[^\d,.-]/g, "");

    if (!value || !/\d/.test(value)) {
      return null;
    }

    const negative = value.startsWith("-");

    value = value.replace(/-/g, "");

    const lastComma = value.lastIndexOf(",");
    const lastDot = value.lastIndexOf(".");

    let normalized;

    // Both separators exist:
    // 12.345,67
    // 12,345.67
    if (lastComma >= 0 && lastDot >= 0) {

      const decimalSeparator =
        lastComma > lastDot ? "," : ".";

      const thousandSeparator =
        decimalSeparator === "," ? "." : ",";

      normalized = value
        .split(thousandSeparator)
        .join("")
        .replace(decimalSeparator, ".");

    } else if (
      lastComma >= 0 ||
      lastDot >= 0
    ) {

      // Only one separator type exists.
      const separator =
        lastComma >= 0 ? "," : ".";

      const parts = value.split(separator);
      const lastPart = parts[parts.length - 1];

      /*
      * Exactly two digits after the final separator
      * means decimal separator.
      *
      * 12345,67
      * 12345.67
      * 12.345,67 after prior normalization
      */
      if (lastPart.length === 2) {

        normalized =
          parts.slice(0, -1).join("") +
          "." +
          lastPart;

      } else {

        // Example: 12.345
        // Treat separator as thousands separator.
        normalized = parts.join("");
      }

    } else {

      normalized = value;
    }

    let amount = Number(normalized);

    if (!Number.isFinite(amount)) {
      return null;
    }

    if (negative) {
      amount = -amount;
    }

    return amount;
  }


  /**
   * Belgian invoice rule:
   *
   * Locate each section:
   *
   * Net Payable
   *     ...
   * Exemption
   *
   * Extract ALL monetary numbers inside the section and
   * return the largest one.
   */
  function findLargestBelgiumNetPayableAmount(invoiceText) {
  const text = toSearchableText(invoiceText);

  if (!text) {
    return null;
  }

  const startRegex = /\bNet\s*Payable\b/giu;
  const endRegex = /\bExemption\b/giu;

  const starts = [...text.matchAll(startRegex)];
  const ends = [...text.matchAll(endRegex)];

  if (
    starts.length === 0 ||
    ends.length === 0
  ) {
    return null;
  }

  const candidates = [];

  /*
   * Valid monetary examples:
   *
   * 1 510.08
   * 1.510,08
   * 12.345,67
   * 12,345.67
   * 12345,67
   * 12345.67
   * EUR 12.345,67
   * € 12,345.67
   *
   * IMPORTANT:
   * A plain integer such as 26076370 is NOT considered
   * money unless it has an explicit EUR/Euro/€ marker.
   */
  const moneyRegex =
    /(?<![\p{L}\d])(?:(?:EUR|EURO|€)\s*-?(?:\d{1,3}(?:[ .,'’]\d{3})+|\d+)(?:[.,]\d{2})?|-?(?:\d{1,3}(?:[ .,'’]\d{3})+|\d+)[.,]\d{2}\s*(?:EUR|EURO|€)?)(?![\p{L}\d])/giu;

  for (const start of starts) {
    const sectionStart =
      start.index + start[0].length;

    /*
     * Locate the first Exemption occurring
     * after the current Net Payable.
     */
    const end = ends.find(
      item => item.index > sectionStart
    );

    if (!end) {
      continue;
    }

    const section = text.slice(
      sectionStart,
      end.index
    );

    moneyRegex.lastIndex = 0;

    let match;

    while (
      (match = moneyRegex.exec(section)) !== null
    ) {
      const rawCandidate = match[0]
        .replace(/\s+/g, " ")
        .trim();

      /*
       * Extra protection against invoice numbers,
       * references, PO numbers, etc.
       *
       * Example:
       * VF26076370
       */
      const candidateStart = match.index;

      const candidateEnd =
        match.index + match[0].length;

      const precedingCharacter =
        section[candidateStart - 1] || "";

      const followingCharacter =
        section[candidateEnd] || "";

      if (
        /[\p{L}\d]/u.test(precedingCharacter) ||
        /[\p{L}\d]/u.test(followingCharacter)
      ) {
        continue;
      }

      const amount =
        parseInvoiceAmount(rawCandidate);

      if (
        amount == null ||
        !Number.isFinite(amount) ||
        amount < 0
      ) {
        continue;
      }

      candidates.push({
        amount,
        raw: rawCandidate,
        section,
        source: "Net Payable -> Exemption",
        type: "belgium-net-payable"
      });
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  /*
   * BUSINESS RULE:
   * Select the largest valid monetary amount
   * between Net Payable and Exemption.
   */
  return candidates.reduce(
    (largest, current) =>
      current.amount > largest.amount
        ? current
        : largest
  );
}
/*
 * IMPORTANT:
 * This closes findLargestBelgiumNetPayableAmount().
 */
/**
 * Consistent EUR display.
 */
function formatEuroAmount(amount) {
  return new Intl.NumberFormat(
    "en-IE",
    {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }
  ).format(amount);
}

  /**
   * Extracts monetary candidates associated with Supplier.Amount_label.
   * Supports multiple configured labels separated with "|" and the same
   * forward/reverse convention used by script.js, e.g. "Total | [Amount Due]".
   *
   * This is a FALLBACK only. It should be called only when the Belgium
   * Net Payable -> Exemption extraction did not return a usable amount.
   */
  function findLargestAmountBySupplierLabel(invoiceText, amountLabel) {
    const text = toSearchableText(invoiceText);
    const labels = String(amountLabel ?? "")
      .split("|")
      .map(label => label.trim())
      .filter(Boolean);

    if (!text || !labels.length) return null;

    const MONEY_TOKEN_SOURCE = String.raw`(?:EUR|EURO|€)?\s*-?(?:\d{1,3}(?:[ .,'’]\d{3})+(?:[.,]\d{2})?|\d{4,}(?:[.,]\d{2})?|\d+[.,]\d{2})(?:\s*(?:EUR|EURO|€))?`;
    const candidates = [];

    for (const rawLabel of labels) {
      const reverseMatch = rawLabel.match(/^\[\s*([\s\S]+?)\s*\]$/);
      const reverse = Boolean(reverseMatch);
      const label = (reverseMatch ? reverseMatch[1] : rawLabel).trim();
      if (!label) continue;

      const labelSource = label
        .split(/\s+/)
        .map(escapeRegexLiteral)
        .join(String.raw`\s*`);

      const regex = reverse
        ? new RegExp(`(${MONEY_TOKEN_SOURCE})\\s*[:\\-]?\\s*${labelSource}`, "giu")
        : new RegExp(`${labelSource}\\s*[:\\-]?\\s*(${MONEY_TOKEN_SOURCE})`, "giu");

      let match;
      while ((match = regex.exec(text)) !== null) {
        const raw = match[1].replace(/\s+/g, " ").trim();
        const amount = parseInvoiceAmount(raw);
        if (amount == null || amount < 0) continue;
        candidates.push({
          amount,
          raw,
          label,
          configuredLabel: rawLabel,
          source: "Supplier.Amount_label",
          type: "supplier-amount-label"
        });
      }
    }

    if (!candidates.length) return null;
    return candidates.reduce((largest, current) =>
      current.amount > largest.amount ? current : largest
    );
  }

  /**
   * High-value invoice check with the requested priority:
   * 1. Belgium: largest amount between Net Payable and Exemption.
   * 2. If that extraction fails: Supplier.Amount_label fallback.
   *
   * @param {string} invoiceText
   * @param {object|null} supplier matched Supplier.json row
   */
  function checkHighInvoiceAmountWithSupplier(invoiceText, supplier = null) {
    let result = findLargestBelgiumNetPayableAmount(invoiceText);
    let method = "Net Payable -> Exemption";

    if (!result) {
      result = findLargestAmountBySupplierLabel(invoiceText, supplier?.Amount_label);
      method = "Supplier.Amount_label";
    }

    if (!result || result.amount <= HIGH_AMOUNT_THRESHOLD_EUR) return null;

    return {
      ...result,
      method,
      threshold: HIGH_AMOUNT_THRESHOLD_EUR,
      normalized: `Invoice amount exceeds €10,000: ${formatEuroAmount(result.amount)}`
    };
  }

  /**
   * Supplier-aware combined check used by script.js.
   * Existing period detection is preserved; amount checking is additive.
   */
  function checkMultiPeriodInvoiceWithSupplier(invoiceText, supplier = null) {
    const warnings = [];
    const temporal = checkMultiPeriodInvoice(invoiceText);

    // checkMultiPeriodInvoice may already contain a high-amount warning from
    // the Belgium primary path. Remove it here and rebuild the amount portion
    // supplier-aware to avoid duplicate warnings.
    if (temporal) {
      const temporalParts = String(temporal)
        .split(" | ")
        .filter(part => !/^Invoice amount exceeds €10,000:/i.test(part));
      warnings.push(...temporalParts);
    }

    const amountWarning = checkHighInvoiceAmountWithSupplier(invoiceText, supplier);
    if (amountWarning) warnings.push(amountWarning.normalized);

    return warnings.length ? warnings.join(" | ") : null;
  }

  global.checkHighInvoiceAmountWithSupplier = checkHighInvoiceAmountWithSupplier;
  global.findLargestAmountBySupplierLabel = findLargestAmountBySupplierLabel;
  global.checkMultiPeriodInvoiceWithSupplier = checkMultiPeriodInvoiceWithSupplier;
  global.checkMultiPeriodInvoice = checkMultiPeriodInvoice;
  global.getMultiPeriodInvoiceDetails = getMultiPeriodInvoiceDetails;
  global.findMultiPeriodRanges = findMultiPeriodRanges;
  global.findAllMultiPeriodMatches = findAllMultiPeriodMatches;
})(window);
