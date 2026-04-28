# Live Network Tracker (Chrome extension)

A Manifest V3 Chrome extension that, on click of the toolbar icon, opens a new
tab that **live-tracks every datapoint of network traffic** between the client
and the server for the source page.

It does this by attaching the [Chrome DevTools
Protocol](https://chromedevtools.github.io/devtools-protocol/) to the source
tab via the [`chrome.debugger`](https://developer.chrome.com/docs/extensions/reference/api/debugger)
API and forwarding every event to the tracker tab. This is the same mechanism
DevTools' Network panel uses, which is why it can see things `chrome.webRequest`
can't (in particular, **request and response bodies**, **WebSocket frames**,
**Server-Sent Events**, **security details** and **timing breakdowns**).

## What it captures

For every HTTP(S) request on the target tab:

- Request method, URL, full headers (including the extra-info headers that
  DevTools shows separately), POST/payload data, query string, initiator
  (script/stack/parser/preflight/redirect), frame id, loader id, document URL,
  associated cookies, resource type and priority.
- Response status, status text, full headers (including the raw response
  headers text), MIME type, protocol, remote IP/port, security state, full
  certificate / security details, blocked-cookie diagnostics, CORS info.
- Body bytes (encoded and decoded), the response body itself (eagerly fetched
  on `loadingFinished`, with an on-demand "fetch body" button as a fallback),
  base64-flag, served-from-cache flag.
- Full timing breakdown (`requestTime`, DNS, connect, SSL, send, wait,
  receive, push, worker, etc.).
- Redirect chain.
- Failure reason / blocked reason / canceled flag.

For WebSockets:

- `webSocketCreated`, handshake request, handshake response, every sent /
  received frame (with opcode, mask, payload), frame errors, close.

For EventSource (SSE): every message with `eventName`, `eventId`, `data`.

For Reporting API, Trust Tokens, Signed Exchange, Subresource Web Bundles,
Network priority changes, certificate / security state changes, console
messages, runtime exceptions and Page lifecycle events: forwarded verbatim
as informational rows so nothing is lost.

Every CDP event is also kept in a `rawEvents` log so the **Export JSON**
button gives you the full firehose, and **Export HAR** gives you a standard
HAR 1.2 file you can load into other tools.

## Install (unpacked)

1. Clone this repo.
2. Visit `chrome://extensions`.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and pick the `network-tracker-extension` folder.

The extension's icon should appear in the toolbar.

## Use

1. Navigate to any normal web page (anything other than `chrome://`,
   `chrome-extension://`, `edge://`, `about:` or the Chrome Web Store —
   Chrome blocks the debugger API on those).
2. Click the toolbar icon.
3. A new tab opens with the live tracker. Chrome shows the standard yellow
   "an extension is debugging this tab" banner on the source tab while
   capture is active — that's how the API works and there's no way for an
   extension to suppress it.
4. Interact with the source page. Every request appears live in the tracker.
   Click any row to inspect every captured datapoint in the right pane:
   Headers, Cookies, Payload, Response body, Timing, Initiator, Security,
   Frames (for WS/SSE), Redirects, All events, Raw.

Toolbar:

- **Filter** — substring match across URL, method, status, MIME, type,
  protocol, remote IP.
- **Auto-scroll** — keep the latest row in view.
- **Preserve on nav** — keep events across top-level navigations (default on;
  uncheck to clear when the source tab navigates).
- **Pause / Resume** — stop appending new events without detaching.
- **Clear** — wipe the table (capture continues live).
- **Export JSON** — download the full request log + raw CDP event firehose.
- **Export HAR** — download a HAR 1.2 file (loadable in DevTools, Charles, etc).

Closing the tracker tab automatically detaches the debugger from the source
tab. Closing the source tab marks the tracker as detached.

## Why a *new tab* and not a popup or DevTools panel?

The user's prompt was specifically "on click opens a new tab that tracks all
data." A new tab is also the only sensible UI for a live-streaming firehose
of network events — popups close on focus loss and DevTools panels are
restricted to the page already being inspected.

## Permissions, briefly

- `debugger` — required to attach CDP and receive Network/Page/Security events.
- `tabs` — to open the tracker tab and bind it to a source tab id.
- `activeTab` — minimum-privilege access to whichever tab is currently active
  when the icon is clicked.
- `<all_urls>` — debugger attachment is per-tab, but Chrome still gates it
  behind a host permission for the tab's URL.
- `scripting`, `storage`, `downloads` — reserved for export-to-disk; nothing
  is persisted across sessions.

The extension does not exfiltrate anything. All captured data stays local in
the tracker tab unless you click Export.

## Limitations

- Chrome's debugger API does not expose pre-flight OPTIONS request bodies in
  all cases (browser-level limitation).
- Only one debugger client can be attached to a tab at a time. If DevTools is
  already open on the source tab, attaching will fail; close DevTools and
  click the icon again.
- Some response bodies (very large streams, opaque cross-origin responses,
  some service-worker-served responses) cannot be retrieved by the protocol.
  In that case the "Fetch response body" button will return an error.
- The yellow "is being debugged" banner is added by Chrome itself and cannot
  be hidden by an extension.
