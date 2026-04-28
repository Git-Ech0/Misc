// Live Network Tracker — background service worker (MV3).
//
// Responsibilities:
//   1. When the user clicks the toolbar action on a page, open a new "tracker" tab
//      that is bound to that source tab.
//   2. Attach the chrome.debugger (Chrome DevTools Protocol) to the source tab and
//      enable the Network and Page domains so we receive every request, response,
//      header, body, cookie, WebSocket frame, EventSource message, timing,
//      security and lifecycle event the browser sees for that tab.
//   3. Forward every CDP event verbatim to the tracker tab via a long-lived
//      runtime port. The tracker page is the UI layer — it never talks to the
//      debugger directly.
//   4. Best-effort fetch the full response body for every finished request and
//      stream it to the tracker tab as a synthetic `Network.responseBody` event.
//   5. Clean up: detach the debugger when the tracker tab is closed, when the
//      source tab is closed, or when the user manually cancels the session.
//
// CDP reference: https://chromedevtools.github.io/devtools-protocol/tot/Network/

const DEBUGGER_PROTOCOL_VERSION = "1.3";

// Map<targetTabId, { trackerTabId, port, attached, startedAt, sourceUrl }>
const sessions = new Map();
// Map<trackerTabId, targetTabId> — reverse lookup so we can detach on tracker close.
const trackerToTarget = new Map();

// ---------------------------------------------------------------------------
// Toolbar click → open tracker tab.
// ---------------------------------------------------------------------------
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || typeof tab.id !== "number" || tab.id < 0) return;

  // chrome:// and Chrome Web Store pages cannot be debugged.
  const url = tab.url || "";
  if (
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("edge://") ||
    url.startsWith("about:") ||
    url.startsWith("https://chrome.google.com/webstore") ||
    url.startsWith("https://chromewebstore.google.com")
  ) {
    // Open a tracker tab anyway, but it will display an error.
    const trackerUrl = chrome.runtime.getURL(
      `tracker.html?error=unsupported&targetUrl=${encodeURIComponent(url)}`
    );
    await chrome.tabs.create({ url: trackerUrl, index: tab.index + 1 });
    return;
  }

  // If a tracker is already running for this tab, focus it instead of creating a new one.
  const existing = sessions.get(tab.id);
  if (existing && existing.trackerTabId != null) {
    try {
      await chrome.tabs.update(existing.trackerTabId, { active: true });
      const trackerTab = await chrome.tabs.get(existing.trackerTabId);
      if (trackerTab.windowId != null) {
        await chrome.windows.update(trackerTab.windowId, { focused: true });
      }
      return;
    } catch {
      // Tracker tab no longer exists — fall through and create a new one.
      sessions.delete(tab.id);
    }
  }

  const trackerUrl = chrome.runtime.getURL(
    `tracker.html?targetTabId=${tab.id}&targetUrl=${encodeURIComponent(url)}&targetTitle=${encodeURIComponent(
      tab.title || ""
    )}`
  );
  const trackerTab = await chrome.tabs.create({
    url: trackerUrl,
    index: tab.index + 1,
    active: true,
  });

  sessions.set(tab.id, {
    trackerTabId: trackerTab.id,
    port: null,
    attached: false,
    startedAt: Date.now(),
    sourceUrl: url,
  });
  trackerToTarget.set(trackerTab.id, tab.id);
});

// ---------------------------------------------------------------------------
// Tracker tab connects to us via a runtime port and asks us to start capture.
// ---------------------------------------------------------------------------
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "network-tracker") return;

  let boundTargetId = null;

  port.onMessage.addListener(async (msg) => {
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "start") {
      boundTargetId = msg.targetTabId;
      const session = sessions.get(boundTargetId) || {};
      session.port = port;
      session.trackerTabId = msg.trackerTabId ?? session.trackerTabId;
      session.startedAt = session.startedAt || Date.now();
      session.sourceUrl = session.sourceUrl || msg.targetUrl || "";
      sessions.set(boundTargetId, session);
      if (session.trackerTabId != null) {
        trackerToTarget.set(session.trackerTabId, boundTargetId);
      }
      try {
        await attachDebugger(boundTargetId);
        session.attached = true;
        post(port, { type: "status", status: "attached", targetTabId: boundTargetId });
      } catch (err) {
        post(port, {
          type: "status",
          status: "error",
          message: String(err && err.message ? err.message : err),
        });
      }
    } else if (msg.type === "stop") {
      if (boundTargetId != null) {
        await detachDebugger(boundTargetId);
      }
    } else if (msg.type === "getBody") {
      // Tracker UI requested the full body for a specific requestId on demand.
      if (boundTargetId == null) return;
      try {
        const body = await sendCommand(boundTargetId, "Network.getResponseBody", {
          requestId: msg.requestId,
        });
        post(port, {
          type: "cdp",
          method: "Network.responseBody",
          params: { requestId: msg.requestId, ...body, _onDemand: true },
        });
      } catch (err) {
        post(port, {
          type: "cdp",
          method: "Network.responseBodyError",
          params: { requestId: msg.requestId, error: String(err && err.message ? err.message : err) },
        });
      }
    } else if (msg.type === "getRequestPostData") {
      if (boundTargetId == null) return;
      try {
        const data = await sendCommand(boundTargetId, "Network.getRequestPostData", {
          requestId: msg.requestId,
        });
        post(port, {
          type: "cdp",
          method: "Network.requestPostData",
          params: { requestId: msg.requestId, ...data },
        });
      } catch (err) {
        post(port, {
          type: "cdp",
          method: "Network.requestPostDataError",
          params: { requestId: msg.requestId, error: String(err && err.message ? err.message : err) },
        });
      }
    } else if (msg.type === "getCookies") {
      if (boundTargetId == null) return;
      try {
        const data = await sendCommand(boundTargetId, "Network.getCookies", {});
        post(port, { type: "cdp", method: "Network.cookies", params: data });
      } catch (err) {
        post(port, {
          type: "cdp",
          method: "Network.cookiesError",
          params: { error: String(err && err.message ? err.message : err) },
        });
      }
    }
  });

  port.onDisconnect.addListener(async () => {
    if (boundTargetId != null) {
      await detachDebugger(boundTargetId);
      sessions.delete(boundTargetId);
    }
  });
});

// ---------------------------------------------------------------------------
// Tab lifecycle bookkeeping.
// ---------------------------------------------------------------------------
chrome.tabs.onRemoved.addListener(async (tabId) => {
  // If the tracker tab itself was closed, detach from its source.
  if (trackerToTarget.has(tabId)) {
    const targetId = trackerToTarget.get(tabId);
    trackerToTarget.delete(tabId);
    if (targetId != null) {
      await detachDebugger(targetId);
      sessions.delete(targetId);
    }
    return;
  }
  // If the source tab was closed, notify the tracker and detach.
  const session = sessions.get(tabId);
  if (session) {
    await detachDebugger(tabId);
    if (session.port) {
      try {
        post(session.port, { type: "status", status: "source-closed" });
      } catch {}
    }
    sessions.delete(tabId);
  }
});

chrome.debugger.onDetach.addListener((source, reason) => {
  if (!source || source.tabId == null) return;
  const session = sessions.get(source.tabId);
  if (!session) return;
  session.attached = false;
  if (session.port) {
    try {
      post(session.port, { type: "status", status: "detached", reason });
    } catch {}
  }
});

// ---------------------------------------------------------------------------
// CDP event forwarding.
//
// We forward every event verbatim. We additionally synthesize a
// `Network.responseBody` event after each `Network.loadingFinished` so the
// tracker doesn't need a round-trip to display response bodies.
// ---------------------------------------------------------------------------
chrome.debugger.onEvent.addListener(async (source, method, params) => {
  if (!source || source.tabId == null) return;
  const session = sessions.get(source.tabId);
  if (!session || !session.port) return;

  // Forward verbatim.
  try {
    post(session.port, { type: "cdp", method, params });
  } catch {
    return;
  }

  // After loading finishes, eagerly grab the response body. This is best-effort:
  // some resources (preflights, redirects, opaque responses) won't have a body.
  if (method === "Network.loadingFinished" && params && params.requestId) {
    try {
      const body = await sendCommand(source.tabId, "Network.getResponseBody", {
        requestId: params.requestId,
      });
      post(session.port, {
        type: "cdp",
        method: "Network.responseBody",
        params: { requestId: params.requestId, ...body },
      });
    } catch (err) {
      // Silently ignore — body fetch failure is normal for many requests.
    }
  }
});

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------
async function attachDebugger(tabId) {
  await new Promise((resolve, reject) => {
    chrome.debugger.attach({ tabId }, DEBUGGER_PROTOCOL_VERSION, () => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve();
    });
  });

  // Network: every transport-level event.
  await sendCommand(tabId, "Network.enable", {
    maxTotalBufferSize: 100 * 1024 * 1024,
    maxResourceBufferSize: 50 * 1024 * 1024,
    maxPostDataSize: 10 * 1024 * 1024,
  });
  // Page: navigation, frame and lifecycle events for context.
  await sendCommand(tabId, "Page.enable", {}).catch(() => {});
  await sendCommand(tabId, "Page.setLifecycleEventsEnabled", { enabled: true }).catch(() => {});
  // Runtime: console + uncaught exceptions can be useful context.
  await sendCommand(tabId, "Runtime.enable", {}).catch(() => {});
  // Security: certificate / mixed content events.
  await sendCommand(tabId, "Security.enable", {}).catch(() => {});
  // Ask the browser to send us cached response bodies too where possible.
  await sendCommand(tabId, "Network.setCacheDisabled", { cacheDisabled: false }).catch(() => {});
}

async function detachDebugger(tabId) {
  return new Promise((resolve) => {
    chrome.debugger.detach({ tabId }, () => {
      // Ignore lastError — detach can fail if the tab is already gone.
      void chrome.runtime.lastError;
      resolve();
    });
  });
}

function sendCommand(tabId, method, params) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId }, method, params || {}, (result) => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve(result || {});
    });
  });
}

function post(port, msg) {
  try {
    port.postMessage(msg);
  } catch {
    // Port closed; nothing to do.
  }
}
