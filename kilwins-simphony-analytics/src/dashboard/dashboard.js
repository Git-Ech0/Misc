/*
 * Dashboard renderer.
 *
 * Reads the snapshot ID from location.hash, loads the payload from
 * chrome.storage.local, runs analyzer.js over each dataset, and renders
 * insight cards and a raw data preview per dataset.
 */
(function () {
  "use strict";

  const els = {
    main: document.getElementById("main"),
    empty: document.getElementById("empty-state"),
    list: document.getElementById("report-list"),
    metaLine: document.getElementById("meta-line"),
    exportJson: document.getElementById("export-json"),
    exportCsv: document.getElementById("export-csv"),
    reanalyze: document.getElementById("reanalyze"),
  };

  let currentPayload = null;
  let currentSnapshotId = null;

  function escHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ---------- loading -------------------------------------------------------

  function getSnapshotIdFromHash() {
    const h = (location.hash || "").replace(/^#/, "");
    return h ? decodeURIComponent(h) : null;
  }

  async function loadPayload() {
    const id = getSnapshotIdFromHash();
    if (!id) return null;
    const res = await chrome.storage.local.get(id);
    if (!res || !res[id]) return null;
    currentSnapshotId = id;
    return res[id];
  }

  // ---------- rendering -----------------------------------------------------

  function renderMeta(payload) {
    const m = payload.meta || {};
    const dt = m.capturedAt ? new Date(m.capturedAt) : new Date();
    const where = m.sourceTabUrl || m.url || "(unknown URL)";
    const tabTitle = m.sourceTabTitle || m.title || "Oracle Simphony report";
    const skipped = (payload.skippedFrames || []).length;
    const skippedNote = skipped ? ` · ${skipped} cross-origin frame(s) skipped` : "";
    els.metaLine.innerHTML =
      `Snapshot of <strong>${escHtml(tabTitle)}</strong> · ` +
      `${escHtml(dt.toLocaleString())} · ` +
      `<a href="${escHtml(where)}" target="_blank" rel="noopener">source</a>` +
      escHtml(skippedNote);
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
    summary.textContent = `Raw captured rows (${ds.rowCount.toLocaleString()})`;
    wrap.appendChild(summary);

    const tableWrap = document.createElement("div");
    tableWrap.className = "raw-preview-table-wrap";
    const tbl = document.createElement("table");
    const thead = document.createElement("thead");
    thead.innerHTML =
      "<tr>" + ds.headers.map((h) => `<th>${escHtml(h)}</th>`).join("") + "</tr>";
    tbl.appendChild(thead);
    const tbody = document.createElement("tbody");
    const previewRows = ds.rows.slice(0, 200);
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

  function renderRolePills(roles) {
    if (!roles) return "";
    const pills = [];
    for (const [k, v] of Object.entries(roles)) {
      if (!v || !v.length) continue;
      pills.push(
        `<span class="role-pill" title="${escHtml(v.join(", "))}">${escHtml(k)}: ${escHtml(
          v.join(", ")
        )}</span>`
      );
    }
    return pills.length ? `<div class="role-pills">${pills.join("")}</div>` : "";
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
      </div>
    `;
    block.appendChild(head);

    block.insertAdjacentHTML("beforeend", renderRolePills(analysis.roles));

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

  function renderAll(payload) {
    els.list.innerHTML = "";
    if (!payload || !payload.datasets || payload.datasets.length === 0) {
      els.empty.classList.remove("hidden");
      return;
    }
    els.empty.classList.add("hidden");

    const analyses = window.KilwinsAnalyzer.analyzeAll(payload.datasets);
    payload.datasets.forEach((ds, i) => {
      els.list.appendChild(renderDataset(ds, analyses[i]));
    });
  }

  // ---------- exports -------------------------------------------------------

  function downloadBlob(filename, mime, text) {
    const blob = new Blob([text], { type: mime });
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

  function buildCsv(payload) {
    if (!payload || !payload.datasets) return "";
    const out = [];
    payload.datasets.forEach((ds, idx) => {
      out.push(`# Dataset ${idx + 1}: ${ds.title}`);
      out.push(ds.headers.map(csvEscape).join(","));
      for (const row of ds.rows) {
        out.push(row.map(csvEscape).join(","));
      }
      out.push("");
    });
    return out.join("\n");
  }

  function setupExportHandlers() {
    els.exportJson.addEventListener("click", () => {
      if (!currentPayload) return;
      downloadBlob(
        "kilwins-snapshot-" + Date.now() + ".json",
        "application/json",
        JSON.stringify(currentPayload, null, 2)
      );
    });
    els.exportCsv.addEventListener("click", () => {
      if (!currentPayload) return;
      downloadBlob("kilwins-snapshot-" + Date.now() + ".csv", "text/csv", buildCsv(currentPayload));
    });
    els.reanalyze.addEventListener("click", () => {
      if (!currentPayload) return;
      renderAll(currentPayload);
    });
  }

  // ---------- bootstrap -----------------------------------------------------

  async function init() {
    setupExportHandlers();
    try {
      const payload = await loadPayload();
      if (!payload) {
        els.empty.classList.remove("hidden");
        els.metaLine.textContent =
          "No snapshot loaded. Open a Simphony report and click the Analyze button.";
        return;
      }
      currentPayload = payload;
      renderMeta(payload);
      renderAll(payload);
    } catch (err) {
      console.error("Dashboard failed:", err);
      els.metaLine.textContent = "Error loading snapshot: " + (err && err.message);
      els.empty.classList.remove("hidden");
    }
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  }
})();
