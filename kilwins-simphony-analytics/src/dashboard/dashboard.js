/*
 * Dashboard renderer.
 *
 * The dashboard is the entire extension UI.  Users drop an .xlsx export from
 * the Oracle Simphony portal onto the page (or pick one with the file
 * picker), the file is parsed locally with SheetJS, sliced into datasets by
 * sheet-parser.js, and analyzer.js produces the recommendation cards.
 *
 * No network calls are ever made.
 */
(function () {
  "use strict";

  const els = {
    main: document.getElementById("main"),
    dropzone: document.getElementById("dropzone"),
    list: document.getElementById("report-list"),
    metaLine: document.getElementById("meta-line"),
    pickFile: document.getElementById("pick-file"),
    pickFile2: document.getElementById("pick-file-2"),
    fileInput: document.getElementById("file-input"),
    exportJson: document.getElementById("export-json"),
    exportCsv: document.getElementById("export-csv"),
    clear: document.getElementById("clear"),
    status: document.getElementById("status"),
  };

  let currentSnapshot = null; // { fileName, parsedAt, datasets, parameters, sheetNames }
  let currentAnalyses = null;

  // ---------- helpers -------------------------------------------------------

  function escHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function setStatus(msg, kind) {
    if (!msg) {
      els.status.classList.add("hidden");
      els.status.textContent = "";
      els.status.removeAttribute("data-kind");
      return;
    }
    els.status.textContent = msg;
    els.status.classList.remove("hidden");
    if (kind) els.status.setAttribute("data-kind", kind);
    else els.status.removeAttribute("data-kind");
  }

  function setControlsEnabled(enabled) {
    [els.exportJson, els.exportCsv, els.clear].forEach((b) => {
      if (!b) return;
      if (enabled) b.removeAttribute("disabled");
      else b.setAttribute("disabled", "");
    });
  }

  // ---------- file ingestion ------------------------------------------------

  function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(fr.error || new Error("FileReader failed"));
      fr.readAsArrayBuffer(file);
    });
  }

  async function ingestFile(file) {
    if (!file) return;
    setStatus(`Parsing ${file.name}…`, "info");
    try {
      const buf = await readFileAsArrayBuffer(file);
      const wb = XLSX.read(buf, { type: "array", cellDates: false });

      const datasets = [];
      const parameters = [];
      for (const sheetName of wb.SheetNames) {
        const sheet = wb.Sheets[sheetName];
        const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
        const sourceLabel = `${file.name} · ${sheetName}`;
        const r = window.KilwinsSheetParser.parseAOA(aoa, sourceLabel);
        for (const ds of r.datasets) {
          ds.parameters = r.parameters; // expose for context-aware analysis
          ds.sheetName = sheetName;
        }
        datasets.push(...r.datasets);
        parameters.push(...r.parameters);
      }

      if (!datasets.length) {
        setStatus(
          `Couldn't find any tabular data in ${file.name}. Make sure the file is an Oracle Simphony report export.`,
          "error"
        );
        return;
      }

      currentSnapshot = {
        fileName: file.name,
        fileSize: file.size,
        parsedAt: new Date().toISOString(),
        sheetNames: wb.SheetNames.slice(),
        datasets,
        parameters,
      };
      currentAnalyses = window.KilwinsAnalyzer.analyzeAll(datasets);

      renderAll();
      setControlsEnabled(true);
      setStatus("", null);
    } catch (err) {
      console.error("ingest failed:", err);
      setStatus(`Couldn't parse ${file.name}: ${err && err.message ? err.message : err}`, "error");
    }
  }

  // ---------- rendering -----------------------------------------------------

  function renderMeta() {
    if (!currentSnapshot) {
      els.metaLine.textContent = "Drop a Simphony report .xlsx export to begin.";
      return;
    }
    const dt = new Date(currentSnapshot.parsedAt);
    const sizeKb = (currentSnapshot.fileSize / 1024).toFixed(1);
    const dsCount = currentSnapshot.datasets.length;
    const sheetCount = currentSnapshot.sheetNames.length;
    els.metaLine.innerHTML =
      `<strong>${escHtml(currentSnapshot.fileName)}</strong> · ` +
      `${escHtml(dt.toLocaleString())} · ` +
      `${sheetCount} sheet${sheetCount === 1 ? "" : "s"} · ` +
      `${dsCount} report block${dsCount === 1 ? "" : "s"} · ` +
      `${sizeKb} KB · parsed locally`;
  }

  function renderParameters(parameters) {
    if (!parameters || !parameters.length) return null;
    const box = document.createElement("section");
    box.className = "params-block";
    const ul = document.createElement("ul");
    for (const p of parameters) {
      const value = (p.value == null ? "" : String(p.value)).trim();
      const key = (p.key == null ? "" : String(p.key)).trim();
      if (!key && !value) continue;
      if (/^blank$/i.test(key) && !value) continue;
      const li = document.createElement("li");
      li.innerHTML = `<span class="lbl">${escHtml(key)}</span><span class="val">${escHtml(value)}</span>`;
      ul.appendChild(li);
    }
    if (!ul.children.length) return null;
    const head = document.createElement("h3");
    head.textContent = "Report parameters";
    box.appendChild(head);
    box.appendChild(ul);
    return box;
  }

  function renderInsightCard(card) {
    const card_el = document.createElement("article");
    card_el.className = "insight-card";
    card_el.dataset.tone = card.tone || "neutral";

    const head = document.createElement("div");
    head.innerHTML = `
      <h4 class="insight-title">${escHtml(card.title)}</h4>
      ${card.subtitle ? `<p class="insight-sub">${escHtml(card.subtitle)}</p>` : ""}
    `;
    card_el.appendChild(head);

    if (card.items && card.items.length) {
      const ul = document.createElement("ul");
      ul.className = "insight-list";
      for (const it of card.items) {
        const li = document.createElement("li");
        li.innerHTML = `
          <span class="lbl">${escHtml(it.label)}</span>
          <span class="val">${escHtml(it.value || "")}</span>
          ${it.detail ? `<span class="det">${escHtml(it.detail)}</span>` : ""}
        `;
        ul.appendChild(li);
      }
      card_el.appendChild(ul);
    }

    if (card.table && card.table.rows && card.table.rows.length) {
      const tbl = document.createElement("table");
      tbl.className = "insight-table";
      const thead = document.createElement("thead");
      thead.innerHTML =
        "<tr>" + card.table.headers.map((h) => `<th>${escHtml(h)}</th>`).join("") + "</tr>";
      tbl.appendChild(thead);
      const tbody = document.createElement("tbody");
      for (const row of card.table.rows) {
        const tr = document.createElement("tr");
        tr.innerHTML = row.map((c) => `<td>${escHtml(c)}</td>`).join("");
        tbody.appendChild(tr);
      }
      tbl.appendChild(tbody);
      card_el.appendChild(tbl);
    }

    return card_el;
  }

  function renderRawPreview(ds) {
    const wrap = document.createElement("details");
    wrap.className = "raw-preview";
    const summary = document.createElement("summary");
    summary.textContent = `Raw rows (${ds.rowCount.toLocaleString()})`;
    wrap.appendChild(summary);

    const tableWrap = document.createElement("div");
    tableWrap.className = "raw-preview-table-wrap";
    const tbl = document.createElement("table");
    const thead = document.createElement("thead");
    thead.innerHTML =
      "<tr>" + ds.headers.map((h) => `<th>${escHtml(h)}</th>`).join("") + "</tr>";
    tbl.appendChild(thead);
    const tbody = document.createElement("tbody");
    const previewRows = ds.rows.slice(0, 250);
    for (const row of previewRows) {
      const tr = document.createElement("tr");
      tr.innerHTML = row.map((c) => `<td>${escHtml(c)}</td>`).join("");
      tbody.appendChild(tr);
    }
    tbl.appendChild(tbody);
    tableWrap.appendChild(tbl);
    if (ds.rows.length > previewRows.length) {
      const more = document.createElement("div");
      more.style.cssText = "padding:8px;color:var(--text-muted);font-size:12px;";
      more.textContent = `…and ${(ds.rows.length - previewRows.length).toLocaleString()} more rows.`;
      tableWrap.appendChild(more);
    }
    wrap.appendChild(tableWrap);
    return wrap;
  }

  function renderDataset(ds, analysis) {
    const block = document.createElement("section");
    block.className = "report-block";

    const head = document.createElement("div");
    head.className = "report-block-head";
    head.innerHTML = `
      <h2 class="report-block-title">${escHtml(ds.title)}</h2>
      <div class="report-block-meta">
        <span>${ds.rowCount.toLocaleString()} rows</span>
        <span>${ds.columnCount.toLocaleString()} columns</span>
        <span>type: <code>${escHtml(ds.kind)}</code></span>
        ${ds.sheetName ? `<span>sheet: <code>${escHtml(ds.sheetName)}</code></span>` : ""}
      </div>
    `;
    block.appendChild(head);

    if (analysis.insights && analysis.insights.length) {
      const grid = document.createElement("div");
      grid.className = "insight-grid";
      for (const card of analysis.insights) grid.appendChild(renderInsightCard(card));
      block.appendChild(grid);
    } else {
      const empty = document.createElement("div");
      empty.style.cssText = "padding:8px 22px 20px;color:var(--text-muted);font-size:13px;";
      empty.textContent =
        "Couldn't infer recommendations for this table — see the raw rows below.";
      block.appendChild(empty);
    }

    block.appendChild(renderRawPreview(ds));
    return block;
  }

  function renderAll() {
    els.list.innerHTML = "";
    renderMeta();

    if (!currentSnapshot) {
      els.dropzone.classList.remove("hidden");
      return;
    }

    els.dropzone.classList.add("hidden");
    const params = renderParameters(currentSnapshot.parameters);
    if (params) els.list.appendChild(params);

    currentSnapshot.datasets.forEach((ds, i) => {
      els.list.appendChild(renderDataset(ds, currentAnalyses[i]));
    });
  }

  // ---------- exports -------------------------------------------------------

  function downloadBlob(filename, mime, content) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 0);
  }

  function csvEscape(s) {
    const t = String(s == null ? "" : s);
    if (/[",\n\r]/.test(t)) return '"' + t.replace(/"/g, '""') + '"';
    return t;
  }

  function buildCsv() {
    if (!currentSnapshot) return "";
    const out = [];
    currentSnapshot.datasets.forEach((ds, idx) => {
      out.push(`# Dataset ${idx + 1}: ${ds.title} (${ds.rowCount} rows)`);
      out.push(ds.headers.map(csvEscape).join(","));
      for (const row of ds.rows) out.push(row.map(csvEscape).join(","));
      out.push("");
    });
    return out.join("\n");
  }

  function buildJsonExport() {
    if (!currentSnapshot) return "";
    const payload = {
      fileName: currentSnapshot.fileName,
      parsedAt: currentSnapshot.parsedAt,
      sheetNames: currentSnapshot.sheetNames,
      parameters: currentSnapshot.parameters,
      datasets: currentSnapshot.datasets.map((ds) => ({
        id: ds.id,
        title: ds.title,
        kind: ds.kind,
        sheetName: ds.sheetName,
        headers: ds.headers,
        rows: ds.rows,
      })),
      analyses: currentAnalyses,
    };
    return JSON.stringify(payload, null, 2);
  }

  // ---------- event wiring --------------------------------------------------

  function pickFile() {
    els.fileInput.click();
  }

  function clearAll() {
    currentSnapshot = null;
    currentAnalyses = null;
    setControlsEnabled(false);
    setStatus("", null);
    renderAll();
  }

  function setupHandlers() {
    if (els.pickFile) els.pickFile.addEventListener("click", pickFile);
    if (els.pickFile2) els.pickFile2.addEventListener("click", pickFile);
    els.fileInput.addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) ingestFile(file);
      els.fileInput.value = "";
    });
    els.exportJson.addEventListener("click", () => {
      if (!currentSnapshot) return;
      downloadBlob(
        "kilwins-snapshot-" + Date.now() + ".json",
        "application/json",
        buildJsonExport()
      );
    });
    els.exportCsv.addEventListener("click", () => {
      if (!currentSnapshot) return;
      downloadBlob("kilwins-snapshot-" + Date.now() + ".csv", "text/csv", buildCsv());
    });
    els.clear.addEventListener("click", clearAll);

    // Drag-and-drop on the entire main element
    const dropTarget = document.body;
    let dragDepth = 0;
    function onDragEnter(e) {
      e.preventDefault();
      dragDepth += 1;
      document.body.classList.add("dragging");
    }
    function onDragOver(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
    function onDragLeave(e) {
      e.preventDefault();
      dragDepth -= 1;
      if (dragDepth <= 0) {
        dragDepth = 0;
        document.body.classList.remove("dragging");
      }
    }
    async function onDrop(e) {
      e.preventDefault();
      dragDepth = 0;
      document.body.classList.remove("dragging");
      const files = e.dataTransfer && e.dataTransfer.files;
      if (!files || files.length === 0) return;
      // Only the first file
      const file = files[0];
      const lower = file.name.toLowerCase();
      if (!/\.(xlsx|xlsm|xls|csv)$/i.test(lower)) {
        setStatus(
          `Only .xlsx, .xlsm, .xls and .csv exports are supported. Got: ${file.name}`,
          "error"
        );
        return;
      }
      await ingestFile(file);
    }
    dropTarget.addEventListener("dragenter", onDragEnter);
    dropTarget.addEventListener("dragover", onDragOver);
    dropTarget.addEventListener("dragleave", onDragLeave);
    dropTarget.addEventListener("drop", onDrop);
  }

  function init() {
    setupHandlers();
    setControlsEnabled(false);
    renderAll();
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  }
})();
