// Content script: builds the sidebar UI and wires it up to the typing engine.
(function () {
  "use strict";

  if (window.__humanTyperLoaded) return;
  window.__humanTyperLoaded = true;

  const Engine = window.HumanTyperEngine;
  const Presets = window.HumanTyperPresets;

  if (!Engine || !Presets) {
    console.error("[HumanTyper] Engine or presets not loaded");
    return;
  }

  // ---------- State ----------
  const state = {
    presetName: Presets.DEFAULT_PRESET,
    config: Presets.get(Presets.DEFAULT_PRESET),
    running: false,
    paused: false,
    stop: false,
    typed: 0,
    total: 0,
  };

  // ---------- DOM helpers ----------
  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") node.className = v;
      else if (k === "html") node.innerHTML = v;
      else if (k.startsWith("on") && typeof v === "function") {
        node.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (v !== undefined && v !== null) {
        node.setAttribute(k, v);
      }
    }
    for (const c of [].concat(children)) {
      if (c == null) continue;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return node;
  }

  // ---------- Build the UI ----------
  const root = el("div", { id: "human-typer-root" });
  const handle = el(
    "button",
    { id: "human-typer-handle", title: "Open Human Typer" },
    "HUMAN TYPER"
  );
  const cursorIndicator = el("div", { id: "human-typer-cursor-indicator" });

  // Header
  const closeBtn = el("button", { class: "ht-close", title: "Close" }, "×");
  const header = el("div", { class: "ht-header" }, [
    el("div", { class: "ht-title" }, "Human Typer"),
    closeBtn,
  ]);

  // Body
  const textArea = el("textarea", {
    class: "ht-textarea",
    placeholder:
      "Paste or type the text you want the extension to retype into the document...",
  });

  const presetButtons = {};
  const presetRow = el("div", { class: "ht-presets" });
  for (const [key, p] of Object.entries(Presets.PRESETS)) {
    const btn = el(
      "button",
      { class: "ht-preset-btn", "data-preset": key, title: p.label },
      p.label
    );
    btn.addEventListener("click", () => selectPreset(key));
    presetButtons[key] = btn;
    presetRow.appendChild(btn);
  }

  // Settings sliders
  function slider({ id, label, min, max, step, value, format }) {
    const valEl = el("span", { class: "ht-value" }, format(value));
    const input = el("input", {
      type: "range",
      id,
      min,
      max,
      step,
      value: String(value),
    });
    input.addEventListener("input", () => {
      const v = Number(input.value);
      valEl.textContent = format(v);
      onSliderChange(id, v);
    });
    const row = el("div", { class: "ht-row" }, [
      el("label", { for: id }, label),
      input,
      valEl,
    ]);
    return { row, input, valEl };
  }

  const wpmSlider = slider({
    id: "ht-wpm",
    label: "Words per minute",
    min: 20,
    max: 140,
    step: 1,
    value: state.config.wpm,
    format: (v) => `${v} wpm`,
  });
  const jitterSlider = slider({
    id: "ht-jitter",
    label: "Timing jitter",
    min: 0,
    max: 80,
    step: 1,
    value: Math.round(state.config.jitter * 100),
    format: (v) => `${v}%`,
  });
  const typoSlider = slider({
    id: "ht-typo",
    label: "Typo rate",
    min: 0,
    max: 12,
    step: 1,
    value: Math.round(state.config.typoRate * 100),
    format: (v) => `${v}%`,
  });
  const thinkSlider = slider({
    id: "ht-think",
    label: "Thinking pauses",
    min: 0,
    max: 30,
    step: 1,
    value: Math.round(state.config.thinkingPauseChance * 100),
    format: (v) => `${v}%`,
  });
  const bigDelSlider = slider({
    id: "ht-bigdel",
    label: "Big-deletion frequency",
    min: 0,
    max: 40,
    step: 1,
    value: Math.round(state.config.bigDeleteChance * 100),
    format: (v) => `${v}%`,
  });

  const body = el("div", { class: "ht-body" }, [
    el("div", { class: "ht-section" }, [
      el("label", { class: "ht-label" }, "Text to type"),
      textArea,
    ]),
    el("div", { class: "ht-section" }, [
      el("label", { class: "ht-label" }, "Preset"),
      presetRow,
    ]),
    el("div", { class: "ht-section" }, [
      el("label", { class: "ht-label" }, "Humanization settings"),
      wpmSlider.row,
      jitterSlider.row,
      typoSlider.row,
      thinkSlider.row,
      bigDelSlider.row,
    ]),
    el("div", { class: "ht-section" }, [
      el("label", { class: "ht-label" }, "Progress"),
      el("div", { class: "ht-progress" }, [el("div", { id: "ht-progress-bar" })]),
    ]),
  ]);

  // Status + actions
  const statusBar = el("div", { class: "ht-status", "data-state": "idle" }, [
    el("div", { class: "ht-dot" }),
    el("span", { id: "ht-status-text" }, "Idle"),
  ]);

  const startBtn = el(
    "button",
    { class: "ht-btn ht-btn-primary", id: "ht-start" },
    "Start typing"
  );
  const pauseBtn = el(
    "button",
    { class: "ht-btn ht-btn-secondary", id: "ht-pause", disabled: "true" },
    "Pause"
  );
  const stopBtn = el(
    "button",
    { class: "ht-btn ht-btn-danger", id: "ht-stop", disabled: "true" },
    "Stop"
  );
  const actions = el("div", { class: "ht-actions" }, [startBtn, pauseBtn, stopBtn]);

  root.append(header, body, statusBar, actions);
  document.documentElement.appendChild(root);
  document.documentElement.appendChild(handle);
  document.documentElement.appendChild(cursorIndicator);

  // ---------- UI behavior ----------
  function setOpen(open) {
    if (open) {
      root.classList.add("ht-open");
      handle.style.display = "none";
    } else {
      root.classList.remove("ht-open");
      handle.style.display = "block";
    }
  }

  setOpen(false);
  handle.addEventListener("click", () => setOpen(true));
  closeBtn.addEventListener("click", () => setOpen(false));

  // Keyboard shortcut: Ctrl+Shift+H toggles the sidebar.
  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.shiftKey && (e.key === "H" || e.key === "h")) {
      e.preventDefault();
      setOpen(!root.classList.contains("ht-open"));
    }
  });

  chrome.runtime?.onMessage?.addListener((msg) => {
    if (msg?.type === "HT_TOGGLE_SIDEBAR") {
      setOpen(!root.classList.contains("ht-open"));
    }
  });

  function selectPreset(name) {
    state.presetName = name;
    state.config = Presets.get(name);
    for (const [k, btn] of Object.entries(presetButtons)) {
      btn.classList.toggle("ht-active", k === name);
    }
    // Sync sliders to the preset values.
    wpmSlider.input.value = String(state.config.wpm);
    wpmSlider.valEl.textContent = `${state.config.wpm} wpm`;
    jitterSlider.input.value = String(Math.round(state.config.jitter * 100));
    jitterSlider.valEl.textContent = `${Math.round(state.config.jitter * 100)}%`;
    typoSlider.input.value = String(Math.round(state.config.typoRate * 100));
    typoSlider.valEl.textContent = `${Math.round(state.config.typoRate * 100)}%`;
    thinkSlider.input.value = String(
      Math.round(state.config.thinkingPauseChance * 100)
    );
    thinkSlider.valEl.textContent = `${Math.round(
      state.config.thinkingPauseChance * 100
    )}%`;
    bigDelSlider.input.value = String(
      Math.round(state.config.bigDeleteChance * 100)
    );
    bigDelSlider.valEl.textContent = `${Math.round(
      state.config.bigDeleteChance * 100
    )}%`;
  }

  function onSliderChange(id, v) {
    switch (id) {
      case "ht-wpm":
        state.config.wpm = v;
        break;
      case "ht-jitter":
        state.config.jitter = v / 100;
        break;
      case "ht-typo":
        state.config.typoRate = v / 100;
        break;
      case "ht-think":
        state.config.thinkingPauseChance = v / 100;
        break;
      case "ht-bigdel":
        state.config.bigDeleteChance = v / 100;
        break;
    }
  }

  selectPreset(Presets.DEFAULT_PRESET);

  // ---------- Cursor indicator ----------
  // Locate the Google Docs caret overlay on screen and follow it.
  let cursorRaf = null;
  function trackCursor() {
    cancelAnimationFrame(cursorRaf);
    const update = () => {
      const caret = document.querySelector(".kix-cursor-caret");
      if (caret) {
        const rect = caret.getBoundingClientRect();
        if (rect.width >= 0 && rect.height > 0) {
          cursorIndicator.style.left = `${rect.left + rect.width / 2 - 7}px`;
          cursorIndicator.style.top = `${rect.top + rect.height / 2 - 7}px`;
          cursorIndicator.classList.add("ht-visible");
        }
      }
      cursorRaf = requestAnimationFrame(update);
    };
    update();
  }
  function stopCursor() {
    cancelAnimationFrame(cursorRaf);
    cursorIndicator.classList.remove("ht-visible");
  }

  // ---------- Run loop ----------
  function setStatus(state_, text) {
    statusBar.dataset.state = state_;
    document.getElementById("ht-status-text").textContent = text;
  }

  function setProgress(typed, total) {
    const bar = document.getElementById("ht-progress-bar");
    const pct = total ? Math.min(100, (typed / total) * 100) : 0;
    bar.style.width = `${pct}%`;
  }

  startBtn.addEventListener("click", async () => {
    const text = textArea.value;
    if (!text.trim()) {
      setStatus("idle", "Enter some text to type first.");
      return;
    }
    if (state.running) return;

    state.running = true;
    state.stop = false;
    state.paused = false;
    startBtn.disabled = true;
    pauseBtn.disabled = false;
    stopBtn.disabled = false;
    pauseBtn.textContent = "Pause";
    setProgress(0, text.length);
    trackCursor();

    try {
      await Engine.typeText({
        text,
        config: state.config,
        shouldStop: () => state.stop,
        shouldPause: () => state.paused,
        onProgress: ({ typed, total, status }) => {
          setProgress(typed, total);
          if (status === "typing") setStatus("typing", `Typing… ${typed}/${total}`);
          else if (status === "paused") setStatus("paused", "Paused");
          else if (status === "rewriting")
            setStatus("rewriting", "Rewriting last sentence…");
          else if (status === "stopped")
            setStatus("idle", `Stopped at ${typed}/${total}`);
          else if (status === "done") setStatus("done", `Done — ${total} chars`);
        },
      });
    } catch (err) {
      console.error("[HumanTyper]", err);
      setStatus("idle", err.message || "Error — see console.");
    } finally {
      state.running = false;
      state.paused = false;
      startBtn.disabled = false;
      pauseBtn.disabled = true;
      stopBtn.disabled = true;
      stopCursor();
    }
  });

  pauseBtn.addEventListener("click", () => {
    if (!state.running) return;
    state.paused = !state.paused;
    pauseBtn.textContent = state.paused ? "Resume" : "Pause";
  });

  stopBtn.addEventListener("click", () => {
    if (!state.running) return;
    state.stop = true;
    state.paused = false;
  });

  // Initial status
  setStatus("idle", "Idle — click into the doc, then press Start.");
})();
