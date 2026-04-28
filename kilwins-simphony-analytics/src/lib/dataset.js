/*
 * Cell parsing + dataset normalization.
 *
 * A "dataset" looks like:
 *   {
 *     id: string,
 *     title: string,
 *     kind: string,                    // 'wide-weekday' | 'tall' | 'plain'
 *     headers: string[],
 *     rows: string[][],                // raw text cells
 *     parsedRows: Array<Cell[]>,       // typed cells
 *     columns: Column[],               // column metadata + summary stats
 *     rowCount: number,
 *     columnCount: number,
 *     totalsRowIndex: number | null,
 *     skippedRowIndices: number[],     // rows excluded from analysis (Total/All Day)
 *   }
 *
 * Cell:
 *   { raw: string, value: number|string|null, type: 'currency'|'percent'|'number'|'date'|'weekday'|'time'|'string'|'empty' }
 *
 * Column:
 *   { index, name, type, isDimension, isTime, isMetric, isWeekday,
 *     sum, mean, min, max, nonZeroCount, nonNumericRatio }
 */
(function (root) {
  "use strict";

  // ---------- regex ---------------------------------------------------------

  const PAREN_NEG_RE = /^\(.*\)$/;
  const PERCENT_RE = /^(-?\d+(?:[\.,]\d+)?)\s*%$/;
  const NUMBER_RE = /^-?\d+(?:[\.,]\d+)*$/;
  const DATE_RE = /^(?:\d{1,4}[\/\-]\d{1,2}[\/\-]\d{1,4})(?:[\sT]\d{1,2}:\d{2}(?::\d{2})?)?$/;
  const WEEKDAY_RE = /^(?:mon|tue|wed|thu|fri|sat|sun)(?:day)?\.?$/i;
  const WEEKDAY_FULL_RE = /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i;
  const TIME_RE = /^\d{1,2}(?::\d{2})?\s*(?:am|pm)?$/i;

  function stripCommas(s) {
    return String(s).replace(/,/g, "");
  }

  function parseCellValue(raw) {
    const text = (raw == null ? "" : String(raw)).trim();
    if (text === "" || text === "—" || text === "-" || text === "N/A" || text === "n/a") {
      return { raw: text, value: null, type: "empty" };
    }

    // Currency: $ prefix or paren-negative w/ digits
    if (/^[$€£¥₹]/.test(text) || (PAREN_NEG_RE.test(text) && /\d/.test(text))) {
      const cleaned = stripCommas(text)
        .replace(/[$€£¥₹\s]/g, "")
        .replace(/^\((.*)\)$/, "-$1");
      const n = Number(cleaned);
      if (!Number.isNaN(n)) return { raw: text, value: n, type: "currency" };
    }

    // Percent
    const pm = text.match(PERCENT_RE);
    if (pm) {
      const n = Number(stripCommas(pm[1]));
      if (!Number.isNaN(n)) return { raw: text, value: n, type: "percent" };
    }

    // Plain number (incl. comma-grouped like "1,588.23")
    if (NUMBER_RE.test(text)) {
      const n = Number(stripCommas(text));
      if (!Number.isNaN(n)) return { raw: text, value: n, type: "number" };
    }

    // Date
    if (DATE_RE.test(text)) {
      const d = new Date(text);
      if (!Number.isNaN(d.getTime())) return { raw: text, value: d.toISOString(), type: "date" };
    }

    if (WEEKDAY_FULL_RE.test(text) || WEEKDAY_RE.test(text)) {
      return { raw: text, value: text.toLowerCase(), type: "weekday" };
    }
    if (TIME_RE.test(text)) {
      return { raw: text, value: text.toLowerCase(), type: "time" };
    }

    return { raw: text, value: text, type: "string" };
  }

  // ---------- column inference ----------------------------------------------

  const TIME_NAME_RE = /\b(date|day(?!\s*part)|period|week|month|year|hour|hr|time|weekday|dow)\b/i;

  function isWeekdayHeader(name) {
    return WEEKDAY_FULL_RE.test(String(name).trim());
  }

  function inferColumns(headers, parsedRows) {
    const columnCount = headers.length;
    const columns = [];

    for (let j = 0; j < columnCount; j++) {
      const cells = parsedRows.map((row) => row[j]).filter(Boolean);
      const nonEmpty = cells.filter((c) => c.type !== "empty");

      const typeCounts = {};
      for (const c of nonEmpty) typeCounts[c.type] = (typeCounts[c.type] || 0) + 1;

      // Pick the dominant non-empty cell type (with a tiebreak preference for numeric)
      const order = ["currency", "percent", "number", "date", "weekday", "time", "string"];
      let dominant = "string";
      let dominantCount = -1;
      for (const t of order) {
        const n = typeCounts[t] || 0;
        if (n > dominantCount) {
          dominantCount = n;
          dominant = t;
        }
      }

      const numericCells = nonEmpty.filter((c) =>
        c.type === "currency" || c.type === "percent" || c.type === "number"
      );
      const isMetric = numericCells.length >= Math.max(1, Math.floor(nonEmpty.length / 2)) && numericCells.length > 0;

      let sum = null, mean = null, min = null, max = null, nonZeroCount = 0;
      if (numericCells.length) {
        sum = 0;
        for (const c of numericCells) {
          const v = c.value;
          sum += v;
          if (min == null || v < min) min = v;
          if (max == null || v > max) max = v;
          if (v !== 0) nonZeroCount++;
        }
        mean = sum / numericCells.length;
      }

      const name = String(headers[j] == null ? "" : headers[j]).trim() || `Column ${j + 1}`;
      const isWeekday = isWeekdayHeader(name);
      const isTime = isWeekday || TIME_NAME_RE.test(name) || dominant === "weekday" || dominant === "time" || dominant === "date";
      columns.push({
        index: j,
        name,
        type: dominant,
        isMetric,
        isDimension: !isMetric,
        isTime,
        isWeekday,
        sum,
        mean,
        min,
        max,
        nonZeroCount,
        nonNumericRatio: nonEmpty.length ? 1 - numericCells.length / nonEmpty.length : 1,
      });
    }
    return columns;
  }

  // ---------- helpers -------------------------------------------------------

  const TOTAL_LABELS = new Set([
    "total",
    "grand total",
    "all",
    "all day",
    "all-day",
    "subtotal",
    "sub total",
    "sum",
    "weekday total",
    "report total",
  ]);

  function isTotalLabel(s) {
    if (s == null) return false;
    return TOTAL_LABELS.has(String(s).trim().toLowerCase());
  }

  // ---------- public dataset builder ----------------------------------------

  let datasetCounter = 0;
  function nextDatasetId(prefix) {
    datasetCounter += 1;
    return (prefix || "ds") + "-" + datasetCounter;
  }

  function buildDataset({ headers, rows, title, kind, source }) {
    const headerArr = (headers || []).map((h) => (h == null ? "" : String(h)));
    const rawRows = (rows || []).map((r) => {
      const arr = [];
      for (let j = 0; j < headerArr.length; j++) arr.push(r[j] == null ? "" : String(r[j]));
      return arr;
    });
    const parsedRows = rawRows.map((row) => row.map(parseCellValue));

    // identify total rows by first-column label
    const skippedRowIndices = [];
    let totalsRowIndex = null;
    for (let i = 0; i < rawRows.length; i++) {
      const first = (rawRows[i][0] || "").trim();
      if (isTotalLabel(first)) {
        skippedRowIndices.push(i);
        if (totalsRowIndex == null && first.toLowerCase() === "total") totalsRowIndex = i;
      }
    }

    const columns = inferColumns(headerArr, parsedRows);

    const weekdayCount = columns.filter((c) => c.isWeekday).length;
    const finalKind = kind || (weekdayCount >= 3 ? "wide-weekday" : "tall");

    return {
      id: nextDatasetId("ds"),
      title: title || "Dataset",
      kind: finalKind,
      source: source || null,
      headers: headerArr,
      rows: rawRows,
      parsedRows,
      columns,
      rowCount: rawRows.length,
      columnCount: headerArr.length,
      totalsRowIndex,
      skippedRowIndices,
    };
  }

  const api = {
    parseCellValue,
    inferColumns,
    buildDataset,
    isTotalLabel,
    isWeekdayHeader,
    nextDatasetId,
    PAREN_NEG_RE,
    PERCENT_RE,
    NUMBER_RE,
    DATE_RE,
    WEEKDAY_RE,
    WEEKDAY_FULL_RE,
    TIME_RE,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.KilwinsDataset = api;
  }
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this);
