/*
 * Convert a SheetJS array-of-arrays (AoA) into one or more datasets.
 *
 * Real Oracle Simphony exports stack multiple report blocks vertically in a
 * single sheet, separated by blank rows.  We slice the AoA on blank rows,
 * then for each non-empty chunk decide whether it is:
 *   - a "report parameters" block (key/value pairs, only 1-2 columns of data)
 *   - a real data table (header row + multiple data rows)
 *
 * For each real data table we pick the most plausible header row (a row with
 * the most distinct non-numeric strings, after which numeric cells dominate)
 * and build a dataset.
 */
(function (root) {
  "use strict";

  const Dataset = (typeof require === "function")
    ? require("./dataset.js")
    : (root && root.KilwinsDataset);
  if (!Dataset) throw new Error("KilwinsDataset module not loaded");

  function isBlankRow(row) {
    if (!row) return true;
    for (let j = 0; j < row.length; j++) {
      const v = row[j];
      if (v != null && String(v).trim() !== "") return false;
    }
    return true;
  }

  // Trim trailing blank columns of an AoA chunk
  function effectiveColumnCount(chunk) {
    let max = 0;
    for (const row of chunk) {
      for (let j = row.length - 1; j >= max; j--) {
        if (row[j] != null && String(row[j]).trim() !== "") {
          if (j + 1 > max) max = j + 1;
          break;
        }
      }
    }
    return max;
  }

  function trimChunkColumns(chunk) {
    const w = effectiveColumnCount(chunk);
    return chunk.map((row) => row.slice(0, w));
  }

  function isLikelyHeaderRow(row, nextRows) {
    // A header row should have at least 2 non-empty cells where the majority
    // are non-numeric strings, AND the data rows immediately following have
    // numeric content.
    const nonEmpty = row.filter((c) => c != null && String(c).trim() !== "");
    if (nonEmpty.length < 2) return 0;
    const stringy = nonEmpty.filter((c) => {
      const s = String(c).trim();
      // Looks like a label rather than a number
      if (Dataset.NUMBER_RE.test(s.replace(/,/g, ""))) return false;
      if (/^[$€£¥₹]/.test(s)) return false;
      if (Dataset.PERCENT_RE.test(s)) return false;
      return true;
    });
    if (stringy.length < Math.max(2, Math.floor(nonEmpty.length * 0.6))) return 0;

    // Boost when row contains weekday names (very strong signal in Simphony reports)
    const weekdayHits = stringy.filter((c) => Dataset.WEEKDAY_FULL_RE.test(String(c).trim())).length;

    // Check that following rows have numeric cells in the columns the header labels
    let numericFollowing = 0;
    for (let i = 0; i < Math.min(3, nextRows.length); i++) {
      for (const c of nextRows[i]) {
        const s = String(c == null ? "" : c).trim();
        if (s === "") continue;
        if (Dataset.NUMBER_RE.test(s.replace(/,/g, "")) || /^[$€£¥₹]/.test(s) || /^\(.*\)$/.test(s)) {
          numericFollowing++;
        }
      }
    }
    if (numericFollowing === 0) return 0;
    return 1 + weekdayHits + Math.min(numericFollowing, 8);
  }

  function findHeaderInChunk(chunk) {
    let best = -1;
    let bestScore = 0;
    for (let i = 0; i < chunk.length; i++) {
      const score = isLikelyHeaderRow(chunk[i], chunk.slice(i + 1));
      if (score > bestScore) {
        best = i;
        bestScore = score;
      }
    }
    return best;
  }

  // Try to derive a friendly title for a chunk: prefer the first non-empty
  // cell of the row immediately preceding the chunk's header (e.g. a section
  // banner), otherwise the dominant first-column label, otherwise a generic.
  function pickTitle(chunk, headerIdx, leadingRows) {
    if (leadingRows && leadingRows.length) {
      for (let i = leadingRows.length - 1; i >= 0; i--) {
        const row = leadingRows[i];
        if (!isBlankRow(row)) {
          const cells = row.filter((c) => c != null && String(c).trim() !== "");
          if (cells.length >= 1 && cells.length <= 3) {
            return cells.map((c) => String(c).trim()).join(" ");
          }
        }
      }
    }
    if (headerIdx >= 0) {
      const headerRow = chunk[headerIdx];
      const labels = headerRow.filter((c) => c != null && String(c).trim() !== "");
      if (labels.length) {
        const first = String(labels[0]).trim();
        if (/^[A-Za-z]/.test(first) && first.length < 40) return `${first} breakdown`;
      }
    }
    return "Report block";
  }

  // Split an AoA into chunks separated by blank rows.  Returns
  // [{ rows: AoA, leadingBlankRows: int, startIdx: int }, ...]
  function splitOnBlankRows(aoa) {
    const chunks = [];
    let cur = [];
    let curStart = 0;
    let blankRun = 0;
    for (let i = 0; i < aoa.length; i++) {
      if (isBlankRow(aoa[i])) {
        if (cur.length > 0) {
          chunks.push({ rows: cur, startIdx: curStart, blankRun });
          cur = [];
        }
        blankRun += 1;
      } else {
        if (cur.length === 0) curStart = i;
        cur.push(aoa[i]);
        blankRun = 0;
      }
    }
    if (cur.length > 0) chunks.push({ rows: cur, startIdx: curStart, blankRun });
    return chunks;
  }

  // A chunk is a "parameters block" if every row has 2 (or 4) cells and looks
  // like key/value pairs (string then string/number), with the same column
  // pattern repeated.  Captured but not analyzed.
  // Detects a chunk where the first column repeats the same label across rows
  // (e.g. "Selected Week | 582.92 | Previous Week | 1,492.06 | ..."). These are
  // key/value layouts, not tables, and should not be analyzed as datasets.
  function looksLikeKeyValueChunk(rows) {
    if (rows.length < 2) return false;
    const firstCells = rows
      .map((r) => (r[0] == null ? "" : String(r[0]).trim()))
      .filter((s) => s !== "");
    if (firstCells.length < 2) return false;
    const unique = new Set(firstCells);
    if (unique.size === 1) return true;
    // Or: header row and data row 1 share the same first-column label
    if (rows.length >= 2 && firstCells[0] && firstCells[0] === firstCells[1]) return true;
    return false;
  }

  function classifyChunk(chunk) {
    const rows = trimChunkColumns(chunk);
    if (rows.length === 0) return { kind: "empty", rows };

    if (looksLikeKeyValueChunk(rows)) {
      return { kind: "parameters", rows, headerIdx: -1 };
    }

    const headerIdx = findHeaderInChunk(rows);
    if (headerIdx < 0 || rows.length - headerIdx < 2) {
      // Treat as parameters block
      return { kind: "parameters", rows, headerIdx: -1 };
    }
    return { kind: "table", rows, headerIdx };
  }

  function chunkToDataset(chunk, headerIdx, leadingRows, sourceLabel) {
    const headers = chunk[headerIdx].map((c) => (c == null ? "" : String(c)));
    const dataRows = chunk.slice(headerIdx + 1).map((r) => {
      const arr = new Array(headers.length);
      for (let j = 0; j < headers.length; j++) arr[j] = r[j] == null ? "" : String(r[j]);
      return arr;
    });
    // Drop trailing rows that are entirely blank
    while (dataRows.length && dataRows[dataRows.length - 1].every((c) => String(c).trim() === "")) {
      dataRows.pop();
    }
    if (dataRows.length === 0) return null;

    const title = pickTitle(chunk, headerIdx, leadingRows);
    return Dataset.buildDataset({
      headers,
      rows: dataRows,
      title,
      source: sourceLabel || null,
    });
  }

  // Capture report parameters as a key/value list (for display, not analysis)
  function chunkToParameters(chunk) {
    const params = [];
    for (const row of chunk) {
      const cells = row
        .map((c) => (c == null ? "" : String(c).trim()))
        .filter((c) => c !== "");
      if (cells.length >= 2) {
        params.push({ key: cells[0], value: cells.slice(1).join(" ") });
      } else if (cells.length === 1) {
        params.push({ key: cells[0], value: "" });
      }
    }
    return params;
  }

  function parseAOA(aoa, sourceLabel) {
    const chunks = splitOnBlankRows(aoa || []);
    const datasets = [];
    const parameters = [];
    let leadingRows = [];

    for (let c = 0; c < chunks.length; c++) {
      const { rows } = chunks[c];
      const trimmed = trimChunkColumns(rows);
      const cls = classifyChunk(trimmed);

      if (cls.kind === "table") {
        const ds = chunkToDataset(cls.rows, cls.headerIdx, leadingRows, sourceLabel);
        if (ds) datasets.push(ds);
        leadingRows = [];
      } else if (cls.kind === "parameters") {
        // Track these for display + as candidates for the next table's title
        parameters.push(...chunkToParameters(cls.rows));
        leadingRows = cls.rows;
      }
    }

    return { datasets, parameters };
  }

  function parseSheet(workbook, sheetName, sourceLabel) {
    if (typeof XLSX === "undefined") throw new Error("XLSX library not loaded");
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return { datasets: [], parameters: [] };
    const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
    return parseAOA(aoa, sourceLabel || sheetName);
  }

  function parseWorkbook(workbook, sourceLabel) {
    if (typeof XLSX === "undefined") throw new Error("XLSX library not loaded");
    const all = { datasets: [], parameters: [], sheetNames: workbook.SheetNames.slice() };
    for (const name of workbook.SheetNames) {
      const r = parseSheet(workbook, name, sourceLabel ? `${sourceLabel} · ${name}` : name);
      all.datasets.push(...r.datasets);
      all.parameters.push(...r.parameters);
    }
    return all;
  }

  const api = { parseAOA, parseSheet, parseWorkbook, splitOnBlankRows, classifyChunk };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.KilwinsSheetParser = api;
  }
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this);
