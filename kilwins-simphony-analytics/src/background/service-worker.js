// Service worker for Kilwins Simphony Analytics.
// The extension is fully self-contained — clicking the toolbar icon (or pinned
// action button) opens the local dashboard page in a new tab. There is no
// network access, no host permissions, and no content script injection.

const DASHBOARD_URL = chrome.runtime.getURL("src/dashboard/dashboard.html");

async function openDashboard() {
  try {
    const tabs = await chrome.tabs.query({ url: DASHBOARD_URL + "*" });
    if (tabs.length > 0) {
      const tab = tabs[0];
      await chrome.tabs.update(tab.id, { active: true });
      if (tab.windowId !== undefined) {
        await chrome.windows.update(tab.windowId, { focused: true });
      }
      return;
    }
    await chrome.tabs.create({ url: DASHBOARD_URL });
  } catch (err) {
    console.error("[kilwins-analytics] failed to open dashboard:", err);
  }
}

chrome.action.onClicked.addListener(() => {
  openDashboard();
});

chrome.runtime.onInstalled.addListener(() => {
  openDashboard();
});
