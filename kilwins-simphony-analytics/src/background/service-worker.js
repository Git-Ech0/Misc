/*
 * Background service worker.
 *
 * Receives the extracted dataset payload from a content script, persists it
 * to chrome.storage.local under a unique key, then opens the dashboard tab
 * with that key in the URL.
 *
 * Each dashboard open is a separate snapshot, so the user can run analyses
 * back-to-back without overwriting older sessions in the active dashboard.
 */
const STORAGE_PREFIX = "kilwins:snapshot:";

function genSnapshotId() {
  return (
    STORAGE_PREFIX +
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 8)
  );
}

async function saveSnapshot(payload) {
  const id = genSnapshotId();
  await chrome.storage.local.set({ [id]: payload });
  return id;
}

async function openDashboard(id) {
  const url = chrome.runtime.getURL(
    "src/dashboard/dashboard.html#" + encodeURIComponent(id)
  );
  await chrome.tabs.create({ url, active: true });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== "kilwins:open-dashboard") return;

  (async () => {
    try {
      const payload = msg.payload || {};
      payload.meta = payload.meta || {};
      payload.meta.sourceTabId = sender.tab && sender.tab.id;
      payload.meta.sourceTabTitle = sender.tab && sender.tab.title;
      payload.meta.sourceTabUrl = sender.tab && sender.tab.url;
      const id = await saveSnapshot(payload);
      await openDashboard(id);
      sendResponse({ ok: true, snapshotId: id });
    } catch (err) {
      console.error("Kilwins service worker failed to open dashboard:", err);
      sendResponse({ ok: false, error: String(err && err.message) });
    }
  })();

  // Required to keep sendResponse async
  return true;
});

// Optional: clicking the toolbar icon opens the most recent snapshot if any.
chrome.action.onClicked.addListener(async () => {
  try {
    const all = await chrome.storage.local.get(null);
    const keys = Object.keys(all)
      .filter((k) => k.startsWith(STORAGE_PREFIX))
      .sort();
    if (keys.length) {
      await openDashboard(keys[keys.length - 1]);
    } else {
      await chrome.tabs.create({
        url: "https://simphony-home.mtu9.oraclerestaurants.com/portal/?ojr=reports%2Flibrary%2F165",
      });
    }
  } catch (err) {
    console.error("Kilwins toolbar handler failed:", err);
  }
});
