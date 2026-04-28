/*
 * Versatile tabular extractor for Oracle Simphony / Oracle JET pages.
 *
 * Detects every "table-like" structure on the page and returns it as a
 * normalized dataset { title, headers, rows, parsedRows, columns }.
 *
 * Supports:
 *   - Native <table> elements
 *   - Oracle JET <oj-table> (which itself renders a <table>)
 *   - Oracle JET <oj-data-grid> (role-based ARIA grid using <div>s)
 *   - Generic ARIA grids:  [role=table], [role=grid]
 *   - Repeated structural patterns (fallback heuristic)
 *
 * Pure: no DOM mutations.  Safe to call from content scripts and from
 * the dashboard's preview iframe.
 */
(function (root) {
  "use strict";

  // ---------- value parsing --------------------------------------------------

  const CURRENCY_RE = /^[\s$€£¥₹]?\(?\s*[-+]?\$?\s*([\d.,]+)\s*\)?[\s$€£¥₹]?$/;
  const PAREN_NEG_RE = /^\(.*\)$/;
  const PERCENT_RE = /^[-+]?\s*([\d.,]+)\s*%$/;
  const NUMBER_RE = /^[-+]?\s*([\d.,]+)\s*$/;
  const DATE_RE =
    /^(?:\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}|\d{1,2}\s*[A-Za-z]{3,}\s*\d{2,4}|[A-Za-z]{3,}\s*\d{1,2},?\s*\d{2,4})$/;
  const WEEKDAY_RE =
    /^(sun(day)?|mon(day)?|tue(s|sday)?|wed(nesday)?|thu(r|rs|rsday)?|fri(day)?|sat(urday)?)$/i;
  const TIME_RE = /^\d{1,2}(:\d{2})?\s*(am|pm)?$/i;

  function stripCommas(s) {
    return String(s).replace(/,/g, "").trim();
  }

  function parseCellValue(raw) {
    const text = (raw == null ? "" : String(raw)).trim();
    if (text === "" || text === "—" || text === "-" || text === "N/A") {
      return { raw: text, value: null, type: "empty" };
    }

    // Currency: $ prefix or paren-negative
    if (/^[$€£¥₹]/.test(text) || (PAREN_NEG_RE.test(text) && /[\d]/.test(text))) {
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

    // Plain number
    if (NUMBER_RE.test(text)) {
      const n = Number(stripCommas(text));
      if (!Number.isNaN(n)) return { raw: text, value: n, type: "number" };
    }

    // Date
    if (DATE_RE.test(text)) {
      const d = new Date(text);
      if (!Number.isNaN(d.getTime())) return { raw: text, value: d.toISOString(), type: "date" };
    }

    if (WEEKDAY_RE.test(text)) return { raw: text, value: text.toLowerCase(), type: "weekday" };
    if (TIME_RE.test(text)) return { raw: text, value: text.toLowerCase(), type: "time" };

    return { raw: text, value: text, type: "string" };
  }

  // ---------- DOM helpers ----------------------------------------------------

  function visibleText(el) {
    if (!el) return "";
    // Prefer aria-label when present (screen-reader text used heavily by JET)
    const aria = el.getAttribute && el.getAttribute("aria-label");
    if (aria && aria.trim()) return aria.trim();
    const t = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
    return t;
  }

  function getNearbyTitle(el) {
    // Walk up looking for a heading, oj-bind-text, label, or aria-labelledby target
    let cur = el;
    for (let depth = 0; depth < 6 && cur; depth++) {
      const labelledBy = cur.getAttribute && cur.getAttribute("aria-labelledby");
      if (labelledBy) {
        const tgt = cur.ownerDocument.getElementById(labelledBy);
        const t = visibleText(tgt);
        if (t) return t;
      }
      const aria = cur.getAttribute && cur.getAttribute("aria-label");
      if (aria && aria.trim()) return aria.trim();
      // Look for a sibling heading
      const heading =
        cur.previousElementSibling &&
        cur.previousElementSibling.querySelector &&
        cur.previousElementSibling.querySelector("h1,h2,h3,h4,.oj-header,.title");
      if (heading) {
        const t = visibleText(heading);
        if (t) return t;
      }
      cur = cur.parentElement;
    }
    // Page title fallback
    return (el.ownerDocument && el.ownerDocument.title) || "";
  }

  function uniqueId(prefix) {
    return prefix + "_" + Math.random().toString(36).slice(2, 9);
  }

  // ---------- table detectors -----------------------------------------------

  function extractFromHtmlTable(table) {
    const rowsEls = Array.from(table.querySelectorAll("tr"));
    if (rowsEls.length === 0) return null;

    let headers = [];
    let dataRowEls = rowsEls;

    // Prefer <thead> rows for headers
    const thead = table.querySelector("thead");
    if (thead) {
      const headRows = Array.from(thead.querySelectorAll("tr"));
      if (headRows.length) {
        headers = Array.from(headRows[headRows.length - 1].children).map((c) => visibleText(c));
        dataRowEls = Array.from(table.querySelectorAll("tbody tr"));
        if (dataRowEls.length === 0) {
          dataRowEls = rowsEls.filter((r) => !thead.contains(r));
        }
      }
    }

    // Otherwise infer from a row of <th> cells
    if (headers.length === 0) {
      const firstThRow = rowsEls.find((r) => r.querySelector("th"));
      if (firstThRow) {
        headers = Array.from(firstThRow.children).map((c) => visibleText(c));
        dataRowEls = rowsEls.filter((r) => r !== firstThRow);
      }
    }

    if (headers.length === 0 && rowsEls.length >= 2) {
      // Last resort: assume first row is header
      headers = Array.from(rowsEls[0].children).map((c) => visibleText(c));
      dataRowEls = rowsEls.slice(1);
    }

    const rows = dataRowEls
      .map((tr) => Array.from(tr.children).map((c) => visibleText(c)))
      .filter((r) => r.some((c) => c !== ""));

    if (rows.length === 0 || headers.length === 0) return null;

    return {
      kind: "html-table",
      title: getNearbyTitle(table),
      headers,
      rows,
    };
  }

  function extractFromAriaGrid(gridEl) {
    // Works for [role=grid], [role=table], oj-data-grid
    const rowEls = Array.from(gridEl.querySelectorAll('[role="row"]'));
    if (rowEls.length === 0) return null;

    let headerRowEl = rowEls.find((r) => r.querySelector('[role="columnheader"]'));
    let headers = [];
    if (headerRowEl) {
      headers = Array.from(headerRowEl.querySelectorAll('[role="columnheader"]')).map((c) =>
        visibleText(c)
      );
    } else {
      // Some JET grids put column headers outside the [role=row] structure
      const cols = Array.from(gridEl.querySelectorAll('[role="columnheader"]'));
      if (cols.length) headers = cols.map((c) => visibleText(c));
    }

    const dataRows = rowEls
      .filter((r) => r !== headerRowEl)
      .map((r) => {
        const cells = Array.from(r.querySelectorAll('[role="gridcell"], [role="cell"]'));
        if (cells.length === 0) {
          // Fallback: use direct children
          return Array.from(r.children).map((c) => visibleText(c));
        }
        return cells.map((c) => visibleText(c));
      })
      .filter((r) => r.some((c) => c !== ""));

    if (dataRows.length === 0 || headers.length === 0) return null;

    return {
      kind: "aria-grid",
      title: getNearbyTitle(gridEl),
      headers,
      rows: dataRows,
    };
  }

  // ---------- normalization --------------------------------------------------

  function inferColumnTypes(headers, parsedRows) {
    return headers.map((name, idx) => {
      const types = parsedRows.map((r) => (r[idx] && r[idx].type) || "empty");
      // Ignore empties; pick majority
      const counts = {};
      for (const t of types) {
        if (t === "empty") continue;
        counts[t] = (counts[t] || 0) + 1;
      }
      let best = "string";
      let bestCount = 0;
      for (const k of Object.keys(counts)) {
        if (counts[k] > bestCount) {
          best = k;
          bestCount = counts[k];
        }
      }
      const isMetric = best === "number" || best === "currency" || best === "percent";
      const isTime = /date|day|weekday|hour|month|year|week|time|period/i.test(name);
      const numericValues = parsedRows
        .map((r) => (r[idx] && (r[idx].type === "number" || r[idx].type === "currency" || r[idx].type === "percent") ? r[idx].value : null))
        .filter((v) => typeof v === "number");

      let sum = 0,
        min = Infinity,
        max = -Infinity;
      for (const v of numericValues) {
        sum += v;
        if (v < min) min = v;
        if (v > max) max = v;
      }
      const mean = numericValues.length ? sum / numericValues.length : 0;
      let variance = 0;
      for (const v of numericValues) variance += (v - mean) ** 2;
      const stddev = numericValues.length ? Math.sqrt(variance / numericValues.length) : 0;

      return {
        name,
        index: idx,
        type: best,
        isMetric,
        isDimension: !isMetric,
        isTime,
        sum: numericValues.length ? sum : null,
        mean: numericValues.length ? mean : null,
        min: numericValues.length ? min : null,
        max: numericValues.length ? max : null,
        stddev: numericValues.length ? stddev : null,
        nonEmpty: numericValues.length,
      };
    });
  }

  function normalizeDataset(raw) {
    // Pad / truncate so every row has the same number of cells as headers
    const width = raw.headers.length;
    const rows = raw.rows.map((r) => {
      const out = r.slice(0, width);
      while (out.length < width) out.push("");
      return out;
    });
    const parsedRows = rows.map((r) => r.map(parseCellValue));
    const columns = inferColumnTypes(raw.headers, parsedRows);
    return {
      id: uniqueId("ds"),
      kind: raw.kind,
      title: raw.title || "Untitled report",
      headers: raw.headers,
      rows,
      parsedRows,
      columns,
      rowCount: rows.length,
      columnCount: width,
    };
  }

  // ---------- top-level scan -------------------------------------------------

  function extractAll(rootDoc) {
    const doc = rootDoc || (typeof document !== "undefined" ? document : null);
    if (!doc) return [];
    const datasets = [];
    const seen = new Set();

    const native = Array.from(doc.querySelectorAll("table"));
    for (const t of native) {
      if (seen.has(t)) continue;
      seen.add(t);
      const raw = extractFromHtmlTable(t);
      if (raw) datasets.push(normalizeDataset(raw));
    }

    const ariaSelectors = [
      '[role="grid"]',
      '[role="table"]',
      "oj-table",
      "oj-data-grid",
      "[data-grid]",
    ];
    for (const sel of ariaSelectors) {
      const els = Array.from(doc.querySelectorAll(sel));
      for (const el of els) {
        if (seen.has(el)) continue;
        // Skip if it just contains a native <table> we already covered
        if (el.querySelector("table") && datasets.some((d) => d.kind === "html-table")) continue;
        const raw = extractFromAriaGrid(el);
        if (raw) {
          seen.add(el);
          datasets.push(normalizeDataset(raw));
        }
      }
    }

    // De-duplicate datasets that share identical headers + first-row content
    const dedup = [];
    const fingerprints = new Set();
    for (const d of datasets) {
      const fp = d.headers.join("|") + "::" + (d.rows[0] || []).join("|");
      if (fingerprints.has(fp)) continue;
      fingerprints.add(fp);
      dedup.push(d);
    }
    return dedup;
  }

  function gatherPageMeta() {
    const doc = typeof document !== "undefined" ? document : null;
    return {
      url: typeof location !== "undefined" ? location.href : "",
      title: doc ? doc.title : "",
      capturedAt: new Date().toISOString(),
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    };
  }

  const api = {
    extractAll,
    gatherPageMeta,
    parseCellValue,
    normalizeDataset,
    inferColumnTypes,
    _internals: {
      extractFromHtmlTable,
      extractFromAriaGrid,
    },
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.KilwinsExtractor = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
