// Live Network Tracker — UI layer.
//
// Receives CDP events from the background service worker and renders them in
// real time. Each network requestId becomes a row; WebSocket / EventSource
// connections accumulate frames in a sub-list; orphan events (Page, Security,
// Reporting API, etc.) are appended as informational rows.

const params = new URLSearchParams(location.search);
const targetTabId = Number(params.get("targetTabId"));
const targetUrl = params.get("targetUrl") || "";
const targetTitle = params.get("targetTitle") || "";
const errorReason = params.get("error");

document.title = `Network Tracker — ${targetTitle || targetUrl || "tab " + targetTabId}`;
const targetLink = document.getElementById("target-link");
targetLink.href = targetUrl || "#";
targetLink.textContent = targetTitle ? `${targetTitle}  —  ${targetUrl}` : targetUrl || `tab ${targetTabId}`;

// ---------------------------------------------------------------------------
// State.
// ---------------------------------------------------------------------------
const state = {
  paused: false,
  preserveOnNav: true,
  autoscroll: true,
  filter: "",
  /** @type Map<string, RequestRecord> */
  requests: new Map(),
  /** Ordered display rows. Each entry is { kind, id, ts } where kind is one of
   *  "request" | "ws" | "eventsource" | "info". */
  rows: [],
  selectedRowId: null,
  counters: { total: 0, requests: 0, finished: 0, failed: 0, ws: 0, bytes: 0 },
  startedAt: Date.now(),
  rawEvents: [], // Every CDP event we ever received, in order. Used by Export JSON.
};

// ---------------------------------------------------------------------------
// Connect to background.
// ---------------------------------------------------------------------------
let port = null;
function connect() {
  if (errorReason === "unsupported") {
    showError(
      "This page cannot be tracked. Chrome blocks the debugger API on chrome://, " +
        "edge://, about:, the Chrome Web Store and other privileged URLs."
    );
    setStatus("error", "Unsupported page");
    return;
  }
  if (!Number.isFinite(targetTabId) || targetTabId < 0) {
    showError("Missing target tab id.");
    setStatus("error", "No target");
    return;
  }
  port = chrome.runtime.connect({ name: "network-tracker" });
  port.onMessage.addListener(onMessage);
  port.onDisconnect.addListener(() => {
    setStatus("detached", "Disconnected from background");
  });
  port.postMessage({
    type: "start",
    targetTabId,
    trackerTabId: chrome.devtools?.inspectedWindow?.tabId, // unused, just metadata
    targetUrl,
  });
  setStatus("idle", "Attaching debugger…");
}

function onMessage(msg) {
  if (!msg || typeof msg !== "object") return;
  if (msg.type === "status") {
    handleStatus(msg);
    return;
  }
  if (msg.type !== "cdp") return;
  if (state.paused) return;
  state.counters.total++;
  state.rawEvents.push({ method: msg.method, params: msg.params, ts: Date.now() });
  routeEvent(msg.method, msg.params);
  updateCounters();
}

function handleStatus(msg) {
  if (msg.status === "attached") {
    setStatus("attached", "Live — capturing every CDP event");
    showTopBanner(
      "Chrome shows the yellow “a debugging tool is debugging this tab” banner on the source tab while capture is active. " +
        "Closing this tracker tab automatically detaches it."
    );
  } else if (msg.status === "error") {
    setStatus("error", "Error");
    showError(msg.message || "Failed to attach debugger.");
  } else if (msg.status === "detached") {
    setStatus("detached", `Detached (${msg.reason || "manual"})`);
  } else if (msg.status === "source-closed") {
    setStatus("detached", "Source tab was closed");
  }
}

function setStatus(status, text) {
  const dot = document.getElementById("status-dot");
  const t = document.getElementById("status-text");
  if (dot) dot.dataset.status = status;
  if (t) t.textContent = text;
}

function showError(msg) {
  const banner = document.createElement("div");
  banner.className = "error-banner";
  banner.textContent = msg;
  document.body.insertBefore(banner, document.body.firstChild);
}

function showTopBanner() {
  /* reserved hook; intentionally no-op so we don't push the toolbar around. */
}

// ---------------------------------------------------------------------------
// CDP event routing.
// ---------------------------------------------------------------------------
function routeEvent(method, params) {
  switch (method) {
    case "Network.requestWillBeSent":
      onRequestWillBeSent(params); break;
    case "Network.requestWillBeSentExtraInfo":
      mergeInto(params.requestId, { requestExtraInfo: params }); break;
    case "Network.responseReceived":
      onResponseReceived(params); break;
    case "Network.responseReceivedExtraInfo":
      mergeInto(params.requestId, { responseExtraInfo: params }); break;
    case "Network.dataReceived":
      onDataReceived(params); break;
    case "Network.loadingFinished":
      onLoadingFinished(params); break;
    case "Network.loadingFailed":
      onLoadingFailed(params); break;
    case "Network.requestServedFromCache":
      mergeInto(params.requestId, { servedFromCache: true }); break;
    case "Network.responseBody":
      mergeInto(params.requestId, { body: params }); break;
    case "Network.responseBodyError":
      mergeInto(params.requestId, { bodyError: params.error }); break;
    case "Network.resourceChangedPriority":
      mergeInto(params.requestId, { priorityChanged: params }); break;
    case "Network.signedExchangeReceived":
      mergeInto(params.requestId, { signedExchange: params }); break;
    case "Network.trustTokenOperationDone":
      mergeInto(params.requestId, { trustToken: params }); break;
    case "Network.subresourceWebBundleMetadataReceived":
    case "Network.subresourceWebBundleMetadataError":
    case "Network.subresourceWebBundleInnerResponseParsed":
    case "Network.subresourceWebBundleInnerResponseError":
      addInfoRow(method, params); break;

    // WebSocket lifecycle.
    case "Network.webSocketCreated":
      onWsCreated(params); break;
    case "Network.webSocketWillSendHandshakeRequest":
    case "Network.webSocketHandshakeResponseReceived":
      mergeInto(params.requestId, { ["ws_" + method.split(".")[1]]: params }); break;
    case "Network.webSocketFrameSent":
      onWsFrame(params, "sent"); break;
    case "Network.webSocketFrameReceived":
      onWsFrame(params, "recv"); break;
    case "Network.webSocketFrameError":
      onWsFrame(params, "err"); break;
    case "Network.webSocketClosed":
      mergeInto(params.requestId, { ws_closed: params }); break;

    // Server-Sent Events.
    case "Network.eventSourceMessageReceived":
      onEventSourceMessage(params); break;

    // Reporting API.
    case "Network.reportingApiReportAdded":
    case "Network.reportingApiReportUpdated":
    case "Network.reportingApiEndpointsChangedForOrigin":
      addInfoRow(method, params); break;

    // Page lifecycle / frames.
    case "Page.frameNavigated":
      addInfoRow(method, params, params.frame ? params.frame.url : "");
      maybeClearOnNav(params);
      break;
    case "Page.lifecycleEvent":
    case "Page.frameRequestedNavigation":
    case "Page.frameStartedLoading":
    case "Page.frameStoppedLoading":
    case "Page.frameAttached":
    case "Page.frameDetached":
    case "Page.documentOpened":
    case "Page.javascriptDialogOpening":
    case "Page.javascriptDialogClosed":
    case "Page.windowOpen":
    case "Page.downloadWillBegin":
    case "Page.downloadProgress":
      addInfoRow(method, params); break;

    case "Security.securityStateChanged":
    case "Security.visibleSecurityStateChanged":
      addInfoRow(method, params); break;

    case "Runtime.consoleAPICalled":
    case "Runtime.exceptionThrown":
      addInfoRow(method, params); break;

    default:
      // Unknown event — still record it as informational so nothing is lost.
      addInfoRow(method, params);
  }
  scheduleRender();
}

function maybeClearOnNav(params) {
  if (state.preserveOnNav) return;
  if (!params.frame || params.frame.parentId) return; // only top-level
  doClear();
}

// ---------------------------------------------------------------------------
// Per-request bookkeeping.
// ---------------------------------------------------------------------------
function ensureRequest(id) {
  let r = state.requests.get(id);
  if (!r) {
    r = {
      kind: "request",
      id,
      seq: state.requests.size + 1,
      url: "",
      method: "",
      type: "",
      status: null,
      statusText: "",
      mime: "",
      requestEvent: null,
      requestExtraInfo: null,
      response: null,
      responseExtraInfo: null,
      bytesReceived: 0,
      encodedDataLength: 0,
      timing: null,
      startTs: Date.now(),
      endTs: null,
      durationMs: null,
      finished: false,
      failed: false,
      failureReason: null,
      body: null,
      bodyError: null,
      servedFromCache: false,
      redirects: [],
      events: [], // every event for this requestId in order
      protocol: "",
      remoteIPAddress: "",
      remotePort: null,
      initiator: null,
    };
    state.requests.set(id, r);
    state.rows.push(r);
  }
  return r;
}

function mergeInto(id, patch) {
  if (!id) return;
  const r = ensureRequest(id);
  Object.assign(r, patch);
  r.events.push({ ts: Date.now(), patch });
}

function onRequestWillBeSent(p) {
  const r = ensureRequest(p.requestId);
  r.events.push({ ts: Date.now(), method: "Network.requestWillBeSent", params: p });
  // Redirects: a previous response is delivered via redirectResponse; track them.
  if (p.redirectResponse) {
    r.redirects.push({
      url: p.redirectResponse.url,
      status: p.redirectResponse.status,
      statusText: p.redirectResponse.statusText,
      headers: p.redirectResponse.headers,
    });
  }
  r.requestEvent = p;
  r.url = p.request?.url || r.url;
  r.method = p.request?.method || r.method;
  r.type = p.type || r.type;
  r.initiator = p.initiator || r.initiator;
  state.counters.requests++;
}

function onResponseReceived(p) {
  const r = ensureRequest(p.requestId);
  r.events.push({ ts: Date.now(), method: "Network.responseReceived", params: p });
  r.response = p.response;
  r.status = p.response?.status ?? r.status;
  r.statusText = p.response?.statusText ?? r.statusText;
  r.mime = p.response?.mimeType ?? r.mime;
  r.protocol = p.response?.protocol || "";
  r.remoteIPAddress = p.response?.remoteIPAddress || "";
  r.remotePort = p.response?.remotePort ?? null;
  r.timing = p.response?.timing || r.timing;
  r.type = p.type || r.type;
}

function onDataReceived(p) {
  const r = ensureRequest(p.requestId);
  r.bytesReceived += p.dataLength || 0;
  r.encodedDataLength += p.encodedDataLength || 0;
  state.counters.bytes += p.encodedDataLength || p.dataLength || 0;
  r.events.push({ ts: Date.now(), method: "Network.dataReceived", params: p });
}

function onLoadingFinished(p) {
  const r = ensureRequest(p.requestId);
  r.finished = true;
  r.endTs = Date.now();
  r.durationMs = r.endTs - r.startTs;
  if (p.encodedDataLength) r.encodedDataLength = p.encodedDataLength;
  r.events.push({ ts: Date.now(), method: "Network.loadingFinished", params: p });
  state.counters.finished++;
}

function onLoadingFailed(p) {
  const r = ensureRequest(p.requestId);
  r.failed = true;
  r.endTs = Date.now();
  r.durationMs = r.endTs - r.startTs;
  r.failureReason = p.errorText || p.blockedReason || p.canceled ? "canceled" : "failed";
  r.events.push({ ts: Date.now(), method: "Network.loadingFailed", params: p });
  state.counters.failed++;
}

// WebSocket — modeled as a "request" record whose body is the frame log.
function onWsCreated(p) {
  const r = ensureRequest(p.requestId);
  r.kind = "ws";
  r.url = p.url || r.url;
  r.method = "WS";
  r.type = "WebSocket";
  r.frames = r.frames || [];
  r.events.push({ ts: Date.now(), method: "Network.webSocketCreated", params: p });
}

function onWsFrame(p, dir) {
  const r = ensureRequest(p.requestId);
  r.kind = "ws";
  r.frames = r.frames || [];
  r.frames.push({
    ts: Date.now(),
    timestamp: p.timestamp,
    direction: dir,
    opcode: p.response?.opcode,
    mask: p.response?.mask,
    payloadData: p.response?.payloadData,
    errorMessage: p.errorMessage,
  });
  state.counters.ws++;
  r.events.push({ ts: Date.now(), method: "Network.webSocketFrame" + dir, params: p });
}

// EventSource — append to a synthetic record per requestId.
function onEventSourceMessage(p) {
  const r = ensureRequest(p.requestId);
  r.kind = "eventsource";
  r.type = "EventSource";
  r.method = "SSE";
  r.frames = r.frames || [];
  r.frames.push({
    ts: Date.now(),
    timestamp: p.timestamp,
    direction: "recv",
    eventName: p.eventName,
    eventId: p.eventId,
    payloadData: p.data,
  });
  r.events.push({ ts: Date.now(), method: "Network.eventSourceMessageReceived", params: p });
}

// Generic info row — Page/Security/Runtime/Reporting/etc.
function addInfoRow(method, params, label) {
  const row = {
    kind: "info",
    id: "info_" + state.rows.length + "_" + method,
    seq: state.rows.length + 1,
    method,
    params,
    label: label || "",
    ts: Date.now(),
  };
  state.rows.push(row);
}

// ---------------------------------------------------------------------------
// Rendering.
// ---------------------------------------------------------------------------
const tbody = document.getElementById("rows-body");
let renderQueued = false;

function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    render();
  });
}

function render() {
  const filter = state.filter.toLowerCase();
  // We re-render incrementally: only append rows that don't have a DOM node yet,
  // and update existing rows that have changed materially.
  for (const row of state.rows) {
    const rowId = rowDomId(row);
    let tr = document.getElementById(rowId);
    if (!tr) {
      tr = document.createElement("tr");
      tr.id = rowId;
      tr.dataset.kind = row.kind;
      tr.addEventListener("click", () => selectRow(row));
      tbody.appendChild(tr);
    }
    paintRow(tr, row);
    tr.style.display = matchesFilter(row, filter) ? "" : "none";
  }
  if (state.autoscroll) {
    const pane = document.querySelector(".table-pane");
    pane.scrollTop = pane.scrollHeight;
  }
  if (state.selectedRowId) {
    const r = findRowById(state.selectedRowId);
    if (r) renderDetails(r);
  }
}

function rowDomId(row) {
  return "row-" + (row.kind === "info" ? row.id : "req-" + row.id);
}

function paintRow(tr, row) {
  if (row.kind === "request" || row.kind === "ws" || row.kind === "eventsource") {
    const status = row.status != null ? row.status : (row.failed ? "FAIL" : "—");
    const size = row.encodedDataLength
      ? formatBytes(row.encodedDataLength)
      : row.bytesReceived
      ? formatBytes(row.bytesReceived)
      : "";
    const dur = row.durationMs != null ? row.durationMs + " ms" : "";
    tr.className = (row.failed ? "failed" : "") + " " + (row.kind === "ws" ? "ws" : row.kind === "eventsource" ? "eventsource" : "");
    tr.innerHTML = "";
    tr.appendChild(td("col-num", String(row.seq)));
    tr.appendChild(td("col-time", formatTime(row.startTs)));
    tr.appendChild(td("col-method", row.method, "method-" + (row.method || "")));
    tr.appendChild(td("col-status", String(status)));
    tr.appendChild(td("col-type", row.type || ""));
    tr.appendChild(td("col-size", size));
    tr.appendChild(td("col-dur", dur));
    tr.appendChild(td("col-url", row.url || "", null, row.url || ""));
  } else {
    tr.className = "info";
    tr.innerHTML = "";
    tr.appendChild(td("col-num", String(row.seq)));
    tr.appendChild(td("col-time", formatTime(row.ts)));
    tr.appendChild(td("col-method", "EVT"));
    tr.appendChild(td("col-status", ""));
    tr.appendChild(td("col-type", row.method));
    tr.appendChild(td("col-size", ""));
    tr.appendChild(td("col-dur", ""));
    tr.appendChild(td("col-url", row.label || briefParams(row.params)));
  }
  if (state.selectedRowId === domSelectionId(row)) tr.classList.add("selected");
  else tr.classList.remove("selected");
}

function td(cls, text, extraCls, title) {
  const el = document.createElement("td");
  el.className = cls + (extraCls ? " " + extraCls : "");
  el.textContent = text != null ? text : "";
  if (title) el.title = title;
  return el;
}

function matchesFilter(row, q) {
  if (!q) return true;
  if (row.kind === "info") {
    return (row.method + " " + (row.label || "") + " " + JSON.stringify(row.params || {})).toLowerCase().includes(q);
  }
  return [
    row.url, row.method, row.type, String(row.status ?? ""),
    row.mime, row.protocol, row.remoteIPAddress
  ].join(" ").toLowerCase().includes(q);
}

function domSelectionId(row) {
  return row.kind === "info" ? row.id : "req:" + row.id;
}

function findRowById(id) {
  for (const r of state.rows) {
    if (domSelectionId(r) === id) return r;
  }
  return null;
}

function selectRow(row) {
  state.selectedRowId = domSelectionId(row);
  // re-paint selection state across visible rows
  for (const tr of tbody.querySelectorAll("tr.selected")) tr.classList.remove("selected");
  const tr = document.getElementById(rowDomId(row));
  if (tr) tr.classList.add("selected");
  renderDetails(row);
}

// ---------------------------------------------------------------------------
// Details panel.
// ---------------------------------------------------------------------------
const details = document.getElementById("details");

function renderDetails(row) {
  details.innerHTML = "";
  if (row.kind === "info") {
    details.appendChild(h2(row.method));
    details.appendChild(pre(JSON.stringify(row.params, null, 2)));
    details.appendChild(h2("Captured at"));
    details.appendChild(textNode(new Date(row.ts).toISOString()));
    return;
  }

  // Header
  details.appendChild(h2("Overview"));
  const ovl = document.createElement("dl");
  appendDt(ovl, "Method", row.method);
  appendDt(ovl, "URL", row.url);
  appendDt(ovl, "Status", row.status != null ? `${row.status} ${row.statusText || ""}` : (row.failed ? "Failed" : "—"));
  appendDt(ovl, "Type", row.type);
  appendDt(ovl, "MIME", row.mime || "");
  appendDt(ovl, "Protocol", row.protocol);
  appendDt(ovl, "Remote", row.remoteIPAddress ? `${row.remoteIPAddress}:${row.remotePort ?? ""}` : "");
  appendDt(ovl, "Encoded bytes", row.encodedDataLength ? row.encodedDataLength.toLocaleString() : "0");
  appendDt(ovl, "Decoded bytes", row.bytesReceived ? row.bytesReceived.toLocaleString() : "0");
  appendDt(ovl, "Duration", row.durationMs != null ? row.durationMs + " ms" : "");
  appendDt(ovl, "Served from cache", String(!!row.servedFromCache));
  appendDt(ovl, "Failure", row.failed ? (row.failureReason || "true") : "");
  appendDt(ovl, "Started", new Date(row.startTs).toISOString());
  appendDt(ovl, "Ended", row.endTs ? new Date(row.endTs).toISOString() : "");
  appendDt(ovl, "Frame", row.requestEvent?.frameId || "");
  appendDt(ovl, "Loader", row.requestEvent?.loaderId || "");
  appendDt(ovl, "Document URL", row.requestEvent?.documentURL || "");
  appendDt(ovl, "RequestId", row.id);
  details.appendChild(ovl);

  // Tabs
  const tabs = document.createElement("div");
  tabs.className = "tabs";
  const panes = {};
  function addTab(name, builder) {
    const btn = document.createElement("button");
    btn.textContent = name;
    btn.type = "button";
    const pane = document.createElement("div");
    pane.className = "tab-pane";
    panes[name] = { btn, pane };
    tabs.appendChild(btn);
    btn.addEventListener("click", () => {
      for (const k of Object.keys(panes)) {
        panes[k].btn.classList.remove("active");
        panes[k].pane.classList.remove("active");
      }
      btn.classList.add("active");
      pane.classList.add("active");
    });
    builder(pane);
  }

  addTab("Headers", (p) => {
    p.appendChild(h2("Request headers"));
    p.appendChild(headerTable(row.requestEvent?.request?.headers, row.requestExtraInfo?.headers));
    p.appendChild(h2("Response headers"));
    p.appendChild(headerTable(row.response?.headers, row.responseExtraInfo?.headers));
    if (row.responseExtraInfo?.headersText) {
      p.appendChild(h2("Raw response headers text"));
      p.appendChild(pre(row.responseExtraInfo.headersText));
    }
  });

  addTab("Cookies", (p) => {
    const reqCookies = row.requestExtraInfo?.associatedCookies || [];
    const setCookie = (row.responseExtraInfo?.headers || row.response?.headers || {})["set-cookie"]
      || (row.responseExtraInfo?.headers || row.response?.headers || {})["Set-Cookie"];
    p.appendChild(h2("Request cookies"));
    if (reqCookies.length === 0) p.appendChild(textNode("(none)"));
    else p.appendChild(pre(JSON.stringify(reqCookies, null, 2)));
    p.appendChild(h2("Response Set-Cookie"));
    if (!setCookie) p.appendChild(textNode("(none)"));
    else p.appendChild(pre(setCookie));
    if (row.responseExtraInfo?.blockedCookies?.length) {
      p.appendChild(h2("Blocked response cookies"));
      p.appendChild(pre(JSON.stringify(row.responseExtraInfo.blockedCookies, null, 2)));
    }
  });

  addTab("Payload", (p) => {
    const post = row.requestEvent?.request?.postData;
    const hasPostData = row.requestEvent?.request?.hasPostData;
    p.appendChild(h2("Query string"));
    p.appendChild(pre(stringifyQuery(row.url)));
    p.appendChild(h2("Request body (postData)"));
    if (post) p.appendChild(pre(post));
    else if (hasPostData) {
      const btn = document.createElement("button");
      btn.textContent = "Fetch full request body";
      btn.addEventListener("click", () => {
        port?.postMessage({ type: "getRequestPostData", requestId: row.id });
      });
      p.appendChild(btn);
    } else {
      p.appendChild(textNode("(none)"));
    }
  });

  addTab("Response body", (p) => {
    if (row.bodyError) {
      p.appendChild(pre("Error: " + row.bodyError));
    }
    if (row.body && row.body.body != null) {
      p.appendChild(h2(row.body.base64Encoded ? "Body (base64-encoded)" : "Body"));
      p.appendChild(pre(row.body.body));
    } else {
      const btn = document.createElement("button");
      btn.textContent = "Fetch response body";
      btn.addEventListener("click", () => {
        port?.postMessage({ type: "getBody", requestId: row.id });
      });
      p.appendChild(btn);
      p.appendChild(textNode(" (some responses don't have a stored body — preflights, redirects, opaque responses, very large streams, etc.)"));
    }
  });

  addTab("Timing", (p) => {
    if (!row.timing) {
      p.appendChild(textNode("No timing data."));
    } else {
      const dl = document.createElement("dl");
      const t = row.timing;
      const entries = Object.keys(t).sort();
      for (const k of entries) appendDt(dl, k, JSON.stringify(t[k]));
      p.appendChild(dl);
    }
  });

  addTab("Initiator", (p) => {
    p.appendChild(pre(JSON.stringify(row.initiator || {}, null, 2)));
  });

  addTab("Security", (p) => {
    p.appendChild(h2("Response security details"));
    p.appendChild(pre(JSON.stringify(row.response?.securityDetails || {}, null, 2)));
    p.appendChild(h2("Security state"));
    p.appendChild(textNode(row.response?.securityState || "(unknown)"));
  });

  if (row.kind === "ws" || row.kind === "eventsource") {
    addTab("Frames", (p) => {
      const list = document.createElement("div");
      list.className = "frame-list";
      for (const f of row.frames || []) {
        const div = document.createElement("div");
        div.className = "frame " + f.direction;
        const dir = f.direction === "sent" ? "→" : f.direction === "recv" ? "←" : "!";
        const payload = f.payloadData ?? f.errorMessage ?? "";
        div.textContent = `${formatTime(f.ts)}  ${dir}  ${payload}`;
        list.appendChild(div);
      }
      p.appendChild(list);
    });
  }

  addTab("Redirects", (p) => {
    if (!row.redirects?.length) p.appendChild(textNode("(none)"));
    else p.appendChild(pre(JSON.stringify(row.redirects, null, 2)));
  });

  addTab("All events", (p) => {
    p.appendChild(pre(JSON.stringify(row.events, null, 2)));
  });

  addTab("Raw", (p) => {
    p.appendChild(pre(JSON.stringify(row, replaceCircular(), 2)));
  });

  details.appendChild(tabs);
  for (const k of Object.keys(panes)) details.appendChild(panes[k].pane);
  // activate first tab
  Object.values(panes)[0].btn.click();
}

function appendDt(dl, key, value) {
  const dt = document.createElement("dt");
  dt.textContent = key;
  const dd = document.createElement("dd");
  dd.textContent = value || "";
  dl.appendChild(dt);
  dl.appendChild(dd);
}

function headerTable(primary, extra) {
  const merged = { ...(primary || {}) };
  if (extra) {
    for (const k of Object.keys(extra)) merged[k] = (merged[k] != null ? merged[k] + "\n" : "") + extra[k];
  }
  const t = document.createElement("table");
  t.className = "kv-table";
  const keys = Object.keys(merged).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  if (keys.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 2;
    td.textContent = "(none)";
    td.style.color = "var(--fg-dim)";
    tr.appendChild(td);
    t.appendChild(tr);
    return t;
  }
  for (const k of keys) {
    const tr = document.createElement("tr");
    const k1 = document.createElement("td"); k1.className = "k"; k1.textContent = k;
    const v1 = document.createElement("td"); v1.textContent = merged[k];
    tr.appendChild(k1); tr.appendChild(v1);
    t.appendChild(tr);
  }
  return t;
}

function stringifyQuery(urlString) {
  try {
    const u = new URL(urlString);
    if (![...u.searchParams].length) return "(none)";
    return [...u.searchParams].map(([k, v]) => `${k} = ${v}`).join("\n");
  } catch {
    return "(invalid URL)";
  }
}

function replaceCircular() {
  const seen = new WeakSet();
  return (k, v) => {
    if (typeof v === "object" && v !== null) {
      if (seen.has(v)) return "[Circular]";
      seen.add(v);
    }
    return v;
  };
}

// ---------------------------------------------------------------------------
// UI controls.
// ---------------------------------------------------------------------------
document.getElementById("filter").addEventListener("input", (e) => {
  state.filter = e.target.value || "";
  scheduleRender();
});
document.getElementById("autoscroll").addEventListener("change", (e) => {
  state.autoscroll = e.target.checked;
});
document.getElementById("preserve").addEventListener("change", (e) => {
  state.preserveOnNav = e.target.checked;
});
document.getElementById("pause").addEventListener("click", (e) => {
  state.paused = !state.paused;
  e.target.textContent = state.paused ? "Resume" : "Pause";
  setStatus(state.paused ? "paused" : "attached", state.paused ? "Paused" : "Live — capturing every CDP event");
});
document.getElementById("clear").addEventListener("click", doClear);
document.getElementById("export-json").addEventListener("click", () => exportJSON());
document.getElementById("export-har").addEventListener("click", () => exportHAR());

function doClear() {
  state.requests.clear();
  state.rows = [];
  state.rawEvents = [];
  state.counters = { total: 0, requests: 0, finished: 0, failed: 0, ws: 0, bytes: 0 };
  tbody.innerHTML = "";
  details.innerHTML = '<div class="details-empty">Cleared. Capture continues live.</div>';
  state.selectedRowId = null;
  updateCounters();
}

function updateCounters() {
  document.getElementById("count-total").textContent = state.counters.total;
  document.getElementById("count-requests").textContent = state.counters.requests;
  document.getElementById("count-finished").textContent = state.counters.finished;
  document.getElementById("count-failed").textContent = state.counters.failed;
  document.getElementById("count-ws").textContent = state.counters.ws;
  document.getElementById("count-bytes").textContent = state.counters.bytes.toLocaleString();
}

// ---------------------------------------------------------------------------
// Export.
// ---------------------------------------------------------------------------
function exportJSON() {
  const payload = {
    targetTabId,
    targetUrl,
    targetTitle,
    capturedAt: new Date(state.startedAt).toISOString(),
    exportedAt: new Date().toISOString(),
    counters: state.counters,
    requests: [...state.requests.values()].map((r) => ({ ...r })),
    rawEvents: state.rawEvents,
  };
  const blob = new Blob([JSON.stringify(payload, replaceCircular(), 2)], {
    type: "application/json",
  });
  triggerDownload(blob, `network-tracker-${Date.now()}.json`);
}

function exportHAR() {
  const har = {
    log: {
      version: "1.2",
      creator: { name: "Live Network Tracker", version: "1.0.0" },
      pages: [
        {
          startedDateTime: new Date(state.startedAt).toISOString(),
          id: "page_1",
          title: targetTitle || targetUrl,
          pageTimings: { onContentLoad: -1, onLoad: -1 },
        },
      ],
      entries: [...state.requests.values()]
        .filter((r) => r.kind === "request")
        .map(toHarEntry),
    },
  };
  const blob = new Blob([JSON.stringify(har, null, 2)], {
    type: "application/json",
  });
  triggerDownload(blob, `network-tracker-${Date.now()}.har`);
}

function toHarEntry(r) {
  const reqHeaders = r.requestEvent?.request?.headers || {};
  const respHeaders = r.response?.headers || {};
  return {
    pageref: "page_1",
    startedDateTime: new Date(r.startTs).toISOString(),
    time: r.durationMs ?? 0,
    request: {
      method: r.method || "",
      url: r.url || "",
      httpVersion: r.protocol || "HTTP/1.1",
      headers: harHeaders(reqHeaders),
      queryString: harQuery(r.url),
      postData: r.requestEvent?.request?.postData
        ? { mimeType: reqHeaders["content-type"] || "", text: r.requestEvent.request.postData }
        : undefined,
      headersSize: -1,
      bodySize: -1,
      cookies: [],
    },
    response: {
      status: r.status ?? 0,
      statusText: r.statusText || "",
      httpVersion: r.protocol || "HTTP/1.1",
      headers: harHeaders(respHeaders),
      content: {
        size: r.bytesReceived || 0,
        mimeType: r.mime || "",
        text: r.body?.body,
        encoding: r.body?.base64Encoded ? "base64" : undefined,
      },
      redirectURL: respHeaders["location"] || respHeaders["Location"] || "",
      headersSize: -1,
      bodySize: r.encodedDataLength || -1,
      cookies: [],
    },
    cache: {},
    timings: {
      blocked: -1, dns: -1, connect: -1, send: 0, wait: r.durationMs ?? 0, receive: 0, ssl: -1,
    },
    serverIPAddress: r.remoteIPAddress || "",
    _initiator: r.initiator,
    _resourceType: r.type,
  };
}

function harHeaders(obj) {
  if (!obj) return [];
  return Object.keys(obj).map((k) => ({ name: k, value: String(obj[k]) }));
}

function harQuery(urlString) {
  try {
    const u = new URL(urlString);
    return [...u.searchParams].map(([name, value]) => ({ name, value }));
  } catch {
    return [];
  }
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// ---------------------------------------------------------------------------
// Misc.
// ---------------------------------------------------------------------------
function pre(text) {
  const el = document.createElement("pre");
  el.textContent = text == null ? "" : String(text);
  return el;
}
function h2(text) {
  const el = document.createElement("h2");
  el.textContent = text;
  return el;
}
function textNode(t) { return document.createTextNode(t); }

function formatTime(ts) {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${hh}:${mm}:${ss}.${ms}`;
}
function formatBytes(n) {
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  return (n / 1024 / 1024).toFixed(2) + " MB";
}
function briefParams(p) {
  if (!p) return "";
  try {
    const s = JSON.stringify(p);
    return s.length > 200 ? s.slice(0, 200) + "…" : s;
  } catch {
    return "";
  }
}

connect();
