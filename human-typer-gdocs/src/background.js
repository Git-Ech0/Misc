// Toggle the sidebar when the toolbar icon is clicked.
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id || !tab.url?.startsWith("https://docs.google.com/document/")) {
    return;
  }
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "HT_TOGGLE_SIDEBAR" });
  } catch (err) {
    // Content script may not be injected (e.g. fresh install before reload).
    console.warn("[HumanTyper] Could not toggle sidebar:", err);
  }
});
