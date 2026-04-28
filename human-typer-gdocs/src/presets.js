// Preset configurations for the typing engine.
// Exposed as window.HumanTyperPresets for use by content.js / engine.js.
(function () {
  "use strict";

  // Each preset describes:
  //   wpm:                 target words-per-minute (1 word = 5 chars)
  //   jitter:              0..1, std-dev of per-keystroke timing as a fraction of mean
  //   thinkingPauseChance: probability of a "thinking" pause at a word boundary
  //   thinkingPauseMs:     [min, max] ms range for thinking pauses
  //   sentencePauseMs:     [min, max] extra pause after sentence-ending punctuation
  //   typoRate:            0..1, probability of mistyping any given character
  //   lateNoticeChance:    when a typo happens, chance the typist notices "late"
  //                        (after typing 1-4 more characters)
  //   bigDeleteChance:     probability per sentence-end of deleting+retyping a chunk
  //   bigDeleteScale:      [min, max] number of characters to delete in a big delete
  //   capsSlowdown:        multiplier for keystrokes that need shift (uppercase / !@#)
  const PRESETS = {
    sentence: {
      label: "Individual Sentences",
      wpm: 65,
      jitter: 0.35,
      thinkingPauseChance: 0.04,
      thinkingPauseMs: [250, 900],
      sentencePauseMs: [120, 350],
      typoRate: 0.02,
      lateNoticeChance: 0.15,
      bigDeleteChance: 0,
      bigDeleteScale: [0, 0],
      capsSlowdown: 1.15,
    },
    paragraph: {
      label: "Paragraphs",
      wpm: 60,
      jitter: 0.4,
      thinkingPauseChance: 0.08,
      thinkingPauseMs: [400, 1500],
      sentencePauseMs: [200, 700],
      typoRate: 0.03,
      lateNoticeChance: 0.25,
      bigDeleteChance: 0.04,
      bigDeleteScale: [4, 14],
      capsSlowdown: 1.2,
    },
    essay: {
      label: "Essays",
      wpm: 55,
      jitter: 0.45,
      thinkingPauseChance: 0.12,
      thinkingPauseMs: [600, 2500],
      sentencePauseMs: [350, 1400],
      typoRate: 0.04,
      lateNoticeChance: 0.35,
      bigDeleteChance: 0.18,
      bigDeleteScale: [20, 90],
      capsSlowdown: 1.25,
    },
  };

  // Default (most realistic) is Paragraphs — middle of the road.
  const DEFAULT_PRESET = "paragraph";

  window.HumanTyperPresets = {
    PRESETS,
    DEFAULT_PRESET,
    get(name) {
      return PRESETS[name] ? { ...PRESETS[name] } : { ...PRESETS[DEFAULT_PRESET] };
    },
  };
})();
