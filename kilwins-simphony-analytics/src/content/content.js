/*
 * Content script: injects a floating "Analyze" button on any Oracle Simphony
 * portal page.  When clicked, it scrapes every visible report-like table on
 * the page, stores the result in chrome.storage.local, and asks the
 * background service worker to open the dashboard tab.
 *
 * KilwinsExtractor is provided by ../lib/extractor.js (loaded first).
 */
(function () {
  "use strict";

  // The reports portal renders content into many nested iframes / fragments.
  // Inject the floating button only at the top window so we don't get
  // multiple FABs stacked on top of each other.
  const isTopFrame = window === window.top;
  if (!isTopFrame) return;

  const FAB_ID = "kilwins-fab-root";
  if (document.getElementById(FAB_ID)) return;

  const EXTENSION_NAME = "Kilwins Analytics";

  // ---------- DOM ------------------------------------------------------------

  function injectFab() {
    const root = document.createElement("div");
    root.id = FAB_ID;
    root.setAttribute("data-kilwins", "fab");

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "kilwins-fab-btn";
    btn.title = `${EXTENSION_NAME}: analyze this report`;
    btn.setAttribute("aria-label", `${EXTENSION_NAME}: analyze this report`);
    btn.innerHTML = `
      <span class="kilwins-fab-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 3v18h18"></path>
          <path d="M7 14l4-4 3 3 5-6"></path>
          <circle cx="7" cy="14" r="1.6" fill="currentColor"></circle>
          <circle cx="11" cy="10" r="1.6" fill="currentColor"></circle>
          <circle cx="14" cy="13" r="1.6" fill="currentColor"></circle>
          <circle cx="19" cy="7" r="1.6" fill="currentColor"></circle>
        </svg>
      </span>
      <span class="kilwins-fab-label">Analyze report</span>
    `;
    btn.addEventListener("click", onAnalyzeClick);

    const status = document.createElement("div");
    status.className = "kilwins-fab-toast";
    status.id = "kilwins-fab-toast";

    root.appendChild(btn);
    root.appendChild(status);
    document.documentElement.appendChild(root);
  }

  function showToast(msg, tone = "info") {
    const el = document.getElementById("kilwins-fab-toast");
    if (!el) return;
    el.textContent = msg;
    el.dataset.tone = tone;
    el.classList.add("visible");
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove("visible"), 3500);
  }

  // ---------- iframe scraping ------------------------------------------------

  /**
   * Try to extract datasets from this document and any same-origin iframes.
   * Cross-origin iframes are skipped (we silently note them).
   */
  function extractFromAllFrames() {
    const results = [];
    const skippedFrames = [];

    function harvest(doc, src) {
      try {
        const datasets = window.KilwinsExtractor.extractAll(doc);
        for (const d of datasets) {
          d.source = src;
          results.push(d);
        }
      } catch (err) {
        // doc not accessible
        skippedFrames.push(src + " (" + err.message + ")");
      }
    }

    harvest(document, location.href);

    const iframes = Array.from(document.querySelectorAll("iframe"));
    for (const f of iframes) {
      let doc;
      try {
        doc = f.contentDocument;
      } catch (e) {
        skippedFrames.push((f.src || "(inline iframe)") + " [cross-origin]");
        continue;
      }
      if (!doc) continue;
      harvest(doc, f.src || "(inline iframe)");
      // Recurse one level
      const inner = Array.from(doc.querySelectorAll("iframe"));
      for (const ff of inner) {
        try {
          if (ff.contentDocument) harvest(ff.contentDocument, ff.src || "(nested iframe)");
        } catch (e) {
          skippedFrames.push((ff.src || "(nested iframe)") + " [cross-origin]");
        }
      }
    }

    return { results, skippedFrames };
  }

  function onAnalyzeClick() {
    showToast("Scanning page for report data...", "info");

    // Give Oracle JET grids a moment to settle if the user clicked very early
    setTimeout(() => {
      const meta = window.KilwinsExtractor.gatherPageMeta();
      const { results, skippedFrames } = extractFromAllFrames();

      if (!results.length) {
        showToast(
          "No report tables found on this page. Open a report first, then try again.",
          "warn"
        );
        return;
      }

      // Strip parsedRows for storage to avoid quota issues – analyzer can
      // re-derive from headers + rows, but we'll send the full structure for
      // speed. chrome.storage.local supports up to ~5MB per item.
      const payload = {
        meta,
        skippedFrames,
        datasets: results,
      };

      try {
        chrome.runtime.sendMessage(
          { type: "kilwins:open-dashboard", payload },
          (resp) => {
            if (chrome.runtime.lastError) {
              showToast("Couldn't open dashboard: " + chrome.runtime.lastError.message, "error");
              return;
            }
            if (resp && resp.ok) {
              showToast(
                `Captured ${results.length} table(s). Opening dashboard...`,
                "success"
              );
            } else {
              showToast("Dashboard couldn't be opened.", "error");
            }
          }
        );
      } catch (err) {
        showToast("Extension messaging failed: " + err.message, "error");
      }
    }, 50);
  }

  // ---------- bootstrap ------------------------------------------------------

  function init() {
    injectFab();
    // Re-inject if Oracle JET wipes the body (it sometimes re-renders on
    // route change).  MutationObserver keeps the FAB present.
    const obs = new MutationObserver(() => {
      if (!document.getElementById(FAB_ID)) injectFab();
    });
    obs.observe(document.documentElement, { childList: true, subtree: false });
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  }
})();
