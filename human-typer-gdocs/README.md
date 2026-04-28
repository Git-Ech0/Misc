# Human Typer for Google Docs

A demo / educational Chrome extension (Manifest V3) that retypes provided text
into a Google Doc with **human-like timing, typos, corrections, and edits**.

It is built to illustrate how typing-cadence humanization works — variable
inter-keystroke delays, QWERTY-adjacent typos with realistic correction
patterns, thinking pauses at word and sentence boundaries, and (for longer
texts) occasional "rewrite this sentence" delete-and-retype edits.

> **Educational use only.** This extension is intended as a demonstration of
> typing-pattern simulation. Don't use it to misrepresent authorship of work
> you didn't write — Google Docs revision history captures every keystroke,
> and most institutions consider that misuse a violation of academic /
> professional integrity rules.

---

## Features

- **Sidebar UI** injected directly into the Google Docs page. Toggle with the
  side handle, the toolbar icon, or **Ctrl+Shift+H**.
- **Text area** for the source text plus a settings panel.
- **Typing engine** driven by Words Per Minute (WPM, where 1 word = 5 chars).
- **Humanization controls** — jitter, thinking pauses, typo rate, big-deletion
  frequency.
- **Three presets** with realistic defaults:
  - **Individual Sentences** — fast, low-jitter, almost no rewriting.
  - **Paragraphs** — moderate jitter, occasional small re-edits. *(default)*
  - **Essays** — slower, frequent thinking pauses, and large-section deletions
    that delete the last sentence (or part of it) and retype it.
- **Realistic deletion patterns**:
  - Typo corrections — sometimes immediate (1 backspace), sometimes "noticed
    late" (typist commits 2–4 more chars before backspacing back).
  - Sentence-end big deletions — chance scaled per preset (Essay > Paragraph >
    Sentence).
- **Live progress + status** bar with a pulsing indicator that tracks the
  Google Docs caret on screen.

## Installation (load unpacked)

1. Open Chrome and navigate to `chrome://extensions`.
2. Toggle **Developer mode** on (top-right).
3. Click **Load unpacked** and select the `human-typer-gdocs/` folder
   (the folder containing `manifest.json`).
4. Open any Google Doc — the side handle labelled **HUMAN TYPER** will appear
   on the right edge of the page.

## Usage

1. Click into the body of the Google Doc so the caret is where you want
   typing to begin.
2. Open the sidebar (handle / toolbar icon / **Ctrl+Shift+H**).
3. Paste the text you want typed into the text area.
4. Pick a preset (or tune sliders manually).
5. Click **Start typing**.

You can **Pause / Resume** or **Stop** at any time. The status bar shows live
progress and what the engine is currently doing (typing, paused, rewriting).

## How the humanization works

- **WPM** sets the mean ms/keystroke (`60000 / (wpm * 5)`).
- **Jitter** is a Gaussian standard deviation expressed as a fraction of that
  mean — every keystroke samples a fresh delay.
- **Capitals / shifted symbols** apply a small slowdown multiplier
  (`capsSlowdown`).
- **Thinking pauses** trigger probabilistically at word boundaries; a longer
  pause range applies after sentence-ending punctuation.
- **Typos** pick a QWERTY-adjacent character. With probability
  `lateNoticeChance` the typist commits 1–4 more correct characters before
  catching the mistake, then backspaces them all and retypes.
- **Big deletions** (Essay preset mostly) trigger after a sentence ends — the
  engine pauses, backspaces a chunk of recently-typed characters, pauses
  again ("re-thinking"), and retypes them.

## How keystrokes reach Google Docs

Google Docs renders the editor in a custom canvas surface and listens for
keyboard input on a hidden iframe (`.docs-texteventtarget-iframe`). The
extension dispatches synthesized `keydown` / `keypress` / `textInput` /
`beforeinput` / `input` / `keyup` events into that iframe's body, which is
the standard pattern for driving the Docs editor from a content script.

> **Caveat:** Google Docs internals are not a public API. The extension may
> need adjustments if Google changes the editor's input plumbing.

## File layout

```
human-typer-gdocs/
├── manifest.json         # MV3 manifest
├── icons/                # 16/48/128 PNG icons
├── src/
│   ├── background.js     # Service worker — toggles sidebar from the toolbar
│   ├── content.js        # Sidebar UI + run loop
│   ├── engine.js         # Typing engine (timing, typos, deletions)
│   ├── presets.js        # Sentence / Paragraph / Essay presets
│   └── styles.css        # Sidebar styling
└── README.md
```

## Manual test plan

After loading the extension:

1. Open a blank Google Doc and click into the body.
2. Open the sidebar, paste a short paragraph, leave the **Paragraphs** preset
   selected, click **Start typing**. Watch the live status / progress.
3. Switch to the **Essays** preset, paste 2–3 paragraphs, **Start typing**.
   Verify that the engine occasionally backspaces a chunk of recently-typed
   text and retypes it (status flips to *"Rewriting last sentence…"*).
4. Press **Pause** / **Resume** mid-run — typing should suspend and resume
   on a keystroke boundary.
5. Press **Stop** mid-run — typing should halt immediately and the status
   should show *"Stopped at N/M"*.
