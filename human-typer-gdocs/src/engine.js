// Humanized typing engine for Google Docs.
// Exposed as window.HumanTyperEngine.
(function () {
  "use strict";

  // Adjacent-key map for QWERTY typo simulation. Lowercase only — the engine
  // preserves casing from the original character.
  const QWERTY_NEIGHBORS = {
    a: "qwsz",
    b: "vghn",
    c: "xdfv",
    d: "serfcx",
    e: "wsdr",
    f: "drtgvc",
    g: "ftyhbv",
    h: "gyujnb",
    i: "ujko",
    j: "huikmn",
    k: "jiolm",
    l: "kop",
    m: "njk,",
    n: "bhjm",
    o: "iklp",
    p: "ol",
    q: "wa",
    r: "edft",
    s: "awedxz",
    t: "rfgy",
    u: "yhji",
    v: "cfgb",
    w: "qase",
    x: "zsdc",
    y: "tghu",
    z: "asx",
    " ": "  ",
  };

  // ---------- Random helpers ----------
  function randRange(min, max) {
    return Math.random() * (max - min) + min;
  }

  // Approx Gaussian via central limit (sum of 6 uniforms).
  function gaussian(mean, std) {
    let s = 0;
    for (let i = 0; i < 6; i++) s += Math.random();
    return mean + std * (s - 3);
  }

  function pickNeighbor(ch) {
    const lower = ch.toLowerCase();
    const neighbors = QWERTY_NEIGHBORS[lower];
    if (!neighbors) return ch;
    const pick = neighbors[Math.floor(Math.random() * neighbors.length)];
    if (!pick) return ch;
    // Preserve case.
    return ch === ch.toUpperCase() && ch !== ch.toLowerCase() ? pick.toUpperCase() : pick;
  }

  function needsShift(ch) {
    if (ch >= "A" && ch <= "Z") return true;
    return "~!@#$%^&*()_+{}|:\"<>?".includes(ch);
  }

  function isSentenceEnd(ch) {
    return ch === "." || ch === "!" || ch === "?";
  }

  // ---------- Google Docs event injection ----------
  // Google Docs uses an offscreen iframe (`.docs-texteventtarget-iframe`) that
  // receives keyboard events. Dispatching synthesized events into that iframe
  // is the most reliable way to drive the editor from a content script.
  function getDocsTarget() {
    const iframe = document.querySelector("iframe.docs-texteventtarget-iframe");
    if (!iframe || !iframe.contentDocument) return null;
    return {
      doc: iframe.contentDocument,
      win: iframe.contentWindow,
      target: iframe.contentDocument.activeElement || iframe.contentDocument.body,
    };
  }

  function focusDocs() {
    const t = getDocsTarget();
    if (!t) return false;
    try {
      t.win.focus();
      t.target.focus();
    } catch (e) {
      /* ignore */
    }
    return true;
  }

  // US-layout virtual key codes for punctuation. The engine MUST use real
  // virtual key codes here — using `charCodeAt(0)` collides with real keys
  // (e.g. apostrophe = 39 = ArrowRight, period = 46 = Delete), which causes
  // Google Docs to move the cursor or delete content instead of inserting
  // text.
  const PUNCT_VK = {
    " ": 32,
    "`": 192, "~": 192,
    "-": 189, "_": 189,
    "=": 187, "+": 187,
    "[": 219, "{": 219,
    "]": 221, "}": 221,
    "\\": 220, "|": 220,
    ";": 186, ":": 186,
    "'": 222, "\"": 222,
    ",": 188, "<": 188,
    ".": 190, ">": 190,
    "/": 191, "?": 191,
    "!": 49, "@": 50, "#": 51, "$": 52, "%": 53,
    "^": 54, "&": 55, "*": 56, "(": 57, ")": 48,
  };

  // KeyboardEvent.code values for punctuation (US layout, physical position).
  const PUNCT_CODE = {
    " ": "Space",
    "`": "Backquote", "~": "Backquote",
    "-": "Minus", "_": "Minus",
    "=": "Equal", "+": "Equal",
    "[": "BracketLeft", "{": "BracketLeft",
    "]": "BracketRight", "}": "BracketRight",
    "\\": "Backslash", "|": "Backslash",
    ";": "Semicolon", ":": "Semicolon",
    "'": "Quote", "\"": "Quote",
    ",": "Comma", "<": "Comma",
    ".": "Period", ">": "Period",
    "/": "Slash", "?": "Slash",
    "!": "Digit1", "@": "Digit2", "#": "Digit3", "$": "Digit4", "%": "Digit5",
    "^": "Digit6", "&": "Digit7", "*": "Digit8", "(": "Digit9", ")": "Digit0",
  };

  function virtualKeyCodeFor(ch) {
    if (ch.length !== 1) return 0;
    if (ch >= "A" && ch <= "Z") return ch.charCodeAt(0); // 65-90
    if (ch >= "a" && ch <= "z") return ch.charCodeAt(0) - 32; // map to 65-90
    if (ch >= "0" && ch <= "9") return ch.charCodeAt(0); // 48-57
    return PUNCT_VK[ch] || 0;
  }

  function codeFor(ch) {
    if (ch.length !== 1) return "";
    if (/[a-zA-Z]/.test(ch)) return "Key" + ch.toUpperCase();
    if (/[0-9]/.test(ch)) return "Digit" + ch;
    return PUNCT_CODE[ch] || "";
  }

  function keyEventInit(key, opts = {}) {
    const isSingle = key.length === 1;
    const code = isSingle ? codeFor(key) : key;
    const vk = isSingle ? virtualKeyCodeFor(key) : (opts.keyCode || 0);
    return {
      key,
      code,
      keyCode: vk,
      which: vk,
      bubbles: true,
      cancelable: true,
      composed: true,
      shiftKey: !!opts.shiftKey,
      ctrlKey: !!opts.ctrlKey,
      altKey: !!opts.altKey,
      metaKey: !!opts.metaKey,
    };
  }

  function dispatchKey(target, type, init) {
    target.dispatchEvent(new KeyboardEvent(type, init));
  }

  function dispatchInput(target, type, init) {
    try {
      target.dispatchEvent(new InputEvent(type, init));
    } catch (e) {
      // Fallback for older browsers.
      const evt = new Event(type, { bubbles: true, cancelable: true });
      Object.assign(evt, init);
      target.dispatchEvent(evt);
    }
  }

  function sendChar(ch) {
    const t = getDocsTarget();
    if (!t) return false;
    const init = keyEventInit(ch, { shiftKey: needsShift(ch) });

    dispatchKey(t.target, "keydown", init);
    dispatchKey(t.target, "keypress", init);
    // textInput is the legacy event Google Docs historically listens for.
    dispatchInput(t.target, "textInput", { data: ch, bubbles: true, cancelable: true });
    dispatchInput(t.target, "beforeinput", {
      data: ch,
      inputType: "insertText",
      bubbles: true,
      cancelable: true,
    });
    dispatchInput(t.target, "input", {
      data: ch,
      inputType: "insertText",
      bubbles: true,
      cancelable: true,
    });
    dispatchKey(t.target, "keyup", init);
    return true;
  }

  function sendBackspace() {
    const t = getDocsTarget();
    if (!t) return false;
    const init = keyEventInit("Backspace", { keyCode: 8 });
    dispatchKey(t.target, "keydown", init);
    dispatchInput(t.target, "beforeinput", {
      inputType: "deleteContentBackward",
      bubbles: true,
      cancelable: true,
    });
    dispatchInput(t.target, "input", {
      inputType: "deleteContentBackward",
      bubbles: true,
      cancelable: true,
    });
    dispatchKey(t.target, "keyup", init);
    return true;
  }

  function sendEnter() {
    const t = getDocsTarget();
    if (!t) return false;
    const init = keyEventInit("Enter", { keyCode: 13 });
    dispatchKey(t.target, "keydown", init);
    dispatchInput(t.target, "beforeinput", {
      inputType: "insertParagraph",
      bubbles: true,
      cancelable: true,
    });
    dispatchInput(t.target, "input", {
      inputType: "insertParagraph",
      bubbles: true,
      cancelable: true,
    });
    dispatchKey(t.target, "keyup", init);
    return true;
  }

  // ---------- Timing model ----------
  // WPM uses 5 chars per word (standard typing-speed convention).
  function meanMsPerChar(wpm) {
    return 60000 / Math.max(1, wpm * 5);
  }

  function nextDelay(cfg, ch) {
    const mean = meanMsPerChar(cfg.wpm);
    const std = mean * cfg.jitter;
    let d = Math.max(8, gaussian(mean, std));
    if (needsShift(ch)) d *= cfg.capsSlowdown || 1;
    return d;
  }

  function sleep(ms) {
    return new Promise((res) => setTimeout(res, ms));
  }

  // ---------- The core typing loop ----------
  // Plays back `text` as a sequence of keystrokes against Google Docs, with
  // jittered timing, typos, corrections, and (optionally) large-section
  // delete-and-retype edits.
  //
  // Options:
  //   config:    preset config object (see presets.js)
  //   onProgress(state): called with { typed, total, status } at each step
  //   shouldStop(): returns true to abort early
  //   shouldPause(): returns true to suspend typing until it returns false
  async function typeText({ text, config, onProgress, shouldStop, shouldPause }) {
    if (!focusDocs()) {
      throw new Error(
        "Could not find the Google Docs editor. Click into the document body, then try again."
      );
    }

    const cfg = config;
    let typed = 0;
    const total = text.length;
    const report = (status) => {
      if (onProgress) onProgress({ typed, total, status });
    };

    report("typing");

    let i = 0;
    while (i < text.length) {
      if (shouldStop && shouldStop()) {
        report("stopped");
        return;
      }
      while (shouldPause && shouldPause()) {
        report("paused");
        await sleep(120);
        if (shouldStop && shouldStop()) {
          report("stopped");
          return;
        }
      }

      const ch = text[i];

      // Newlines → Enter key.
      if (ch === "\n") {
        sendEnter();
        i += 1;
        typed = i;
        report("typing");
        await sleep(nextDelay(cfg, " ") * 1.5);
        continue;
      }

      // Decide if we mistype this character.
      const willTypo = Math.random() < cfg.typoRate && /[a-zA-Z ]/.test(ch);
      if (willTypo) {
        const wrong = pickNeighbor(ch);
        sendChar(wrong);
        await sleep(nextDelay(cfg, wrong));

        // "Late notice" — type a few more correct chars before catching it.
        const lateNotice = Math.random() < cfg.lateNoticeChance;
        let extra = 0;
        if (lateNotice) {
          extra = 1 + Math.floor(Math.random() * 4);
          extra = Math.min(extra, text.length - i - 1);
          for (let j = 0; j < extra; j++) {
            const nc = text[i + 1 + j];
            if (nc === "\n") break;
            sendChar(nc);
            await sleep(nextDelay(cfg, nc));
          }
          // Brief "uh oh" pause.
          await sleep(randRange(150, 450));
        }
        // Backspace the wrong char (and any extra chars typed after it).
        for (let j = 0; j < 1 + extra; j++) {
          sendBackspace();
          await sleep(nextDelay(cfg, " ") * 0.6);
        }
        // Now retype the correct char and any extras correctly below.
        sendChar(ch);
        typed = i + 1;
        await sleep(nextDelay(cfg, ch));
        // Replay the extras we deleted.
        for (let j = 0; j < extra; j++) {
          const nc = text[i + 1 + j];
          sendChar(nc);
          await sleep(nextDelay(cfg, nc));
        }
        i += 1 + extra;
        typed = i;
        report("typing");
        continue;
      }

      // Normal keystroke.
      sendChar(ch);
      i += 1;
      typed = i;
      await sleep(nextDelay(cfg, ch));

      // Sentence-end pause.
      if (isSentenceEnd(ch)) {
        await sleep(randRange(cfg.sentencePauseMs[0], cfg.sentencePauseMs[1]));

        // Possibly do a "big delete" — delete the last N chars and retype.
        if (cfg.bigDeleteChance > 0 && Math.random() < cfg.bigDeleteChance) {
          const [bdMin, bdMax] = cfg.bigDeleteScale;
          const target = Math.floor(randRange(bdMin, bdMax));
          // Don't delete past the start of the typed text.
          const deleteN = Math.min(target, i);
          if (deleteN > 0) {
            report("rewriting");
            // "Re-read" pause before deleting.
            await sleep(randRange(400, 1100));
            for (let k = 0; k < deleteN; k++) {
              if (shouldStop && shouldStop()) {
                report("stopped");
                return;
              }
              sendBackspace();
              // Deletions are usually a bit faster than typing.
              await sleep(nextDelay(cfg, " ") * 0.5);
            }
            // Pause to "think" about the rewrite.
            await sleep(randRange(500, 1600));
            // Rewind i and let the loop retype from there.
            i -= deleteN;
            typed = i;
            report("typing");
            continue;
          }
        }
      } else if (
        ch === " " &&
        Math.random() < cfg.thinkingPauseChance
      ) {
        // Thinking pause at word boundary.
        await sleep(randRange(cfg.thinkingPauseMs[0], cfg.thinkingPauseMs[1]));
      }
    }

    report("done");
  }

  window.HumanTyperEngine = {
    typeText,
    // Exposed for testing / advanced UIs.
    _internals: {
      sendChar,
      sendBackspace,
      sendEnter,
      meanMsPerChar,
      pickNeighbor,
      gaussian,
    },
  };
})();
