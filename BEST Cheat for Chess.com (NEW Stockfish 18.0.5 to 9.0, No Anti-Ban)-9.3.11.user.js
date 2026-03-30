// ==UserScript==
// @name          BEST Cheat for Chess.com (NEW Stockfish 18.0.5 to 9.0, No Anti-Ban)
// @namespace     http://tampermonkey.net/
// @version       9.3.11
// @description   An extremely advanced Chess.com cheat menu with 7 Stockfish models (18.0.5 to 9.0), tons of powerful features, and countless customization options.
// @author        Ech0
// @copyright     2025, Ech0
// @license       MIT
// @match         https://www.chess.com/play/*
// @match         https://www.chess.com/game/*
// @match         https://www.chess.com/analysis
// @match         https://www.chess.com/analysis/*
// @match         https://www.chess.com/puzzles/*
// @match         https://www.chess.com/daily
// @connect       chess-api.com
// @connect       stockfish.online
// @connect       unpkg.com
// @connect       *
// @grant         GM_getResourceText
// @grant         GM_getValue
// @grant         GM_setValue
// @grant         GM_xmlhttpRequest
// @resource      stockfish.js https://unpkg.com/stockfish@18.0.5/bin/stockfish-18-single.js
// @run-at        document-idle
// @downloadURL https://update.greasyfork.org/scripts/557044/BEST%20Cheat%20for%20Chesscom%20%28NEW%20Stockfish%201805%20to%2090%2C%20No%20Anti-Ban%29.user.js
// @updateURL https://update.greasyfork.org/scripts/557044/BEST%20Cheat%20for%20Chesscom%20%28NEW%20Stockfish%201805%20to%2090%2C%20No%20Anti-Ban%29.meta.js
// ==/UserScript==
(function () {
    "use strict";
    // --- CONFIGURATION ---
    const CONFIG = {
        BOARD_SEL: "chess-board, wc-chess-board",
        LOOP_MS: 50,
        API: { MAX_DEPTH: 18, MAX_TIME: 2000 }
    };
    const PIECE_IMGS = {
        p: "https://upload.wikimedia.org/wikipedia/commons/c/c7/Chess_pdt45.svg",
        r: "https://upload.wikimedia.org/wikipedia/commons/f/ff/Chess_rdt45.svg",
        n: "https://upload.wikimedia.org/wikipedia/commons/e/ef/Chess_ndt45.svg",
        b: "https://upload.wikimedia.org/wikipedia/commons/9/98/Chess_bdt45.svg",
        q: "https://upload.wikimedia.org/wikipedia/commons/4/47/Chess_qdt45.svg",
        k: "https://upload.wikimedia.org/wikipedia/commons/f/f0/Chess_kdt45.svg",
        P: "https://upload.wikimedia.org/wikipedia/commons/4/45/Chess_plt45.svg",
        R: "https://upload.wikimedia.org/wikipedia/commons/7/72/Chess_rlt45.svg",
        N: "https://upload.wikimedia.org/wikipedia/commons/7/70/Chess_nlt45.svg",
        B: "https://upload.wikimedia.org/wikipedia/commons/b/b1/Chess_blt45.svg",
        Q: "https://upload.wikimedia.org/wikipedia/commons/1/15/Chess_qlt45.svg",
        K: "https://upload.wikimedia.org/wikipedia/commons/4/42/Chess_klt45.svg",
    };
    const STOCKFISH_ICON = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAACXBIWXMAAAsTAAALEwEAmpwYAAAEGklEQVR4nO2ZW2gcVRjH/9+Z3ewm22xMNtVGU9RIxNqmFxF8sC0iFhF8UF980QcFL1jwaRELXnwQBC94UfBBEQtK0Yqi1LwgaL0k0DQm2zapm2az2d1kd2bO8f/M7Gw22U12052lB34wzMzO+Z/vO+d85ztnlkQIIYQQQgghhBBCSKtQSt1BCHmOEDKplLqD53n7x8fH9xBCfC2U0r2EkNcIIY/xPG9rIR4F8CGl9EEA+wghG5s9+yGl9F0A+9sKEEJ8B+A5AMcIIb6W/v8B4BCl9AkA+1oK8Ty/m1L6LID9hJCNzb7ZhRL6IoD9bQcopc8SQp4ghExt9mw/pfR5APtbcwH1C68W/l8B3wO463+xAOu5gH2EkG2EENSX8F4A+wkhG7mA+l3gVwD3tBCAUvoYIeQpQkh/s2f7KaVPAthfFw/4HsA+QsjGZt/sJ5Q+01oArvN9Qkh/s2f7KaWPE0L2112Au8D3AO4jhGxs9u0+SulTAPbXFfA9gP2EkI3NvttPKX0KwP66Ar4HsJ8QsrHZd/sppU8C2F9XwPcA9hNCNjb7bj+l9CkA++sK+B7AfYSQjc2+208pfQrA/rYClNI9hJCnCCHTmz3bTyl9CsD+tgOU0mcIIU8RQqY3e7afUvo0gP1tBSilz1BKnwGwv60A/H8uQAh5DsB+QsjGZt98Qil9DsD+1gKU0ucIIc8QQqY2e7afUvo8gP2tBaij0N8A7iOEbGz23X5K6fMA9tcV8D2A+wghG5t9t59S+iSA/XUFfA9gPyFkY7Pv9lNKTwLYX1fA9wDuI4RsbPbd/v8U4H/fA0II8Ty/mxDiA7C/Lh7wPID9hJCNzb7dTyl9EcD+ungA8Ty/mxDiA7C/pQCldC+l9EUA+1sK8Ty/hxDya0rpCwD2txTg/7kAIeR5APtbut8ghBBC2pZ/ALy683b5qZ2oAAAAAElFTkSuQmCC";

    const DEFAULT_WASM_URL = "https://unpkg.com/stockfish@18.0.5/bin/stockfish-18-single.wasm";

    // ─── Local Engine Registry ────────────────────────────────────────────────
    // Each entry describes one loadable local engine variant.
    //
    // format:
    //   "wasm-patched"  → SF 18/17/16/15/14/12 style: fetch JS via GM_getResourceText
    //                     (or fall back to XHR if jsUrl is provided), fetch WASM via
    //                     GM_xmlhttpRequest, patch self.fetch, build Worker from Blob.
    //   "asmjs"         → SF 9/10 style: pure asm.js, load JS via XHR,
    //                     create Worker directly — no WASM involved at all.
    //
    // caps:
    //   maxDepth        → UI depth cap for this model
    //   hasNNUE         → whether UCI_LimitStrength/Elo is supported
    //   hasSkillLevel   → whether Skill Level UCI option exists
    //   hasSlowMover    → whether Slow Mover UCI option exists (removed in SF 16+)
    //   hasWDL          → whether UCI_ShowWDL is supported (SF 12+)
    //   hasHash         → Hash table option (all versions)
    //   hasMoveOverhead → Move Overhead option (SF 14+, replaces Slow Mover in SF16)
    //
    // ── Local Engine Registry ────────────────────────────────────────────────
    // Only 5 confirmed-working models. Each has a complete caps map so every
    // UCI option, UI row, and per-model saved setting is driven from here.
    //
    // format: "wasm"  → JS + WASM fetched via XHR, self.fetch patched, Worker Blob
    //         "asmjs" → single stockfish.js from cdnjs, Worker from JS text only
    //
    // Per-model settings are persisted under keys like "m_sf18_05_hashMB" so
    // each model remembers its own last-used values independently.
    const LOCAL_ENGINES = [
        {
            id:      "sf18_05",
            label:   "Stockfish 18.0.5",
            cdn:     "unpkg",
            format:  "wasm",
            jsUrl:   "https://unpkg.com/stockfish@18.0.5/bin/stockfish-18-single.js",
            wasmUrl: "https://unpkg.com/stockfish@18.0.5/bin/stockfish-18-single.wasm",
            // Capabilities
            maxDepth:        25,
            hasHash:         true,
            hasMoveOverhead: true,   // SF 14+
            hasSlowMover:    false,  // removed in SF 16+
            hasSkillLevel:   true,
            hasNNUE:         true,   // UCI_LimitStrength + UCI_Elo
            hasWDL:          true,   // UCI_ShowWDL
            hasContempt:     false,  // removed in SF 12+
            hasMinThink:     true,
            // Per-model defaults
            defaults: { hashMB: 64, moveOverhead: 100, skillLevel: 20,
                        limitStrength: false, elo: 3190, showWDL: false, minThinkTime: 20 },
        },
        {
            id:      "sf16_00",
            label:   "Stockfish 16.0",
            cdn:     "unpkg",
            format:  "wasm",
            jsUrl:   "https://unpkg.com/stockfish@16.0.0/src/stockfish-nnue-16-single.js",
            wasmUrl: "https://unpkg.com/stockfish@16.0.0/src/stockfish-nnue-16-single.wasm",
            maxDepth:        25,
            hasHash:         true,
            hasMoveOverhead: true,
            hasSlowMover:    false,
            hasSkillLevel:   true,
            hasNNUE:         true,
            hasWDL:          true,
            hasContempt:     false,
            hasMinThink:     true,
            defaults: { hashMB: 64, moveOverhead: 100, skillLevel: 20,
                        limitStrength: false, elo: 3190, showWDL: false, minThinkTime: 20 },
        },
        {
            id:      "sf11_00",
            label:   "Stockfish 11.0",
            cdn:     "unpkg",
            format:  "wasm",
            jsUrl:   "https://unpkg.com/stockfish@11.0.0/src/stockfish.js",
            wasmUrl: "https://unpkg.com/stockfish@11.0.0/src/stockfish.wasm",
            maxDepth:        20,
            hasHash:         true,
            hasMoveOverhead: false,  // added in SF 14
            hasSlowMover:    true,
            hasSkillLevel:   true,
            hasNNUE:         false,  // classical HCE eval
            hasWDL:          false,
            hasContempt:     true,   // present up to SF 11
            hasMinThink:     true,
            defaults: { hashMB: 32, slowMover: 100, skillLevel: 20,
                        contempt: 24, minThinkTime: 20 },
        },
        {
            id:      "sf10_02",
            label:   "Stockfish 10.0.2 — asm.js",
            cdn:     "cdnjs",
            format:  "asmjs",
            jsUrl:   "https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js",
            wasmUrl: null,
            maxDepth:        20,
            hasHash:         true,
            hasMoveOverhead: false,
            hasSlowMover:    true,
            hasSkillLevel:   true,
            hasNNUE:         false,
            hasWDL:          false,
            hasContempt:     true,
            hasMinThink:     true,
            defaults: { hashMB: 32, slowMover: 100, skillLevel: 20,
                        contempt: 24, minThinkTime: 20 },
        },
        {
            id:      "sf9_00",
            label:   "Stockfish 9.0.0 — asm.js",
            cdn:     "cdnjs",
            format:  "asmjs",
            jsUrl:   "https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/9.0.0/stockfish.js",
            wasmUrl: null,
            maxDepth:        18,
            hasHash:         true,
            hasMoveOverhead: false,
            hasSlowMover:    true,
            hasSkillLevel:   true,
            hasNNUE:         false,
            hasWDL:          false,
            hasContempt:     true,
            hasMinThink:     true,
            defaults: { hashMB: 16, slowMover: 100, skillLevel: 20,
                        contempt: 24, minThinkTime: 20 },
        },
    ];

    const getEngineById = (id) => LOCAL_ENGINES.find(e => e.id === id) || LOCAL_ENGINES[0];
    const WASM_PRESETS = [{ label: "Custom URL...", url: "custom" }]; // legacy compat

    // --- STATE MANAGEMENT ---
    const state = {
        board: null,
        isThinking: !1,
        ui: {},
        lastRawFEN: "N/A",
        lastSentFEN: "",
        lastSanitizedBoardFEN: "",
        lastMoveResult: "Waiting for analysis...",
        lastLiveResult: "Depth | Evaluation: Best move will appear here.",
        lastPayload: "N/A",
        lastResponse: "N/A",
        moveTargetTime: 0,
        calculatedDelay: 0,
        localEngine: null,
        engineLoadingInProgress: !1,
        engineStatus: "not_installed",
        engineStatusMsg: "",
        currentCloudRequest: null,
        currentBestMove: null,
        currentPV: [],
        analysisStartTime: 0,
        h: 180, s: 100, l: 50,
        newGameObserver: null,
        queueTimeout: null,
        localEval: null,
        localMate: null,
        localPV: null,
        localDepth: null,
        hasSavedCurrentGameResult: !1,
        lastSeenFEN: "",
        playingAs: null,
        visualTab: "move",
        visuals: [],
    };
    const DEFAULT_SETTINGS = {
        engineMode: "cloud",
        depth: 18,
        moveKeybind: "None",
        maxThinkingTime: 0,
        searchMoves: "",
        autoRun: !0,
        autoMove: !0,
        autoQueue: !1,
        hideAfterMove: false,
        showPVArrows: !1,
        pvDepth: 5,
        pvShowNumbers: !1,
        pvCustomGradient: !1,
        pvStartColor: "#FFFF00",
        pvEndColor: "#FF0000",
        minDelay: 0,
        maxDelay: 0,
        highlightColor: "#00eeff",
        visualType: "outline",
        innerOpacity: 0.6,
        outerOpacity: 0.2,
        gradientBias: 0,
        arrowOpacity: 0.8,
        arrowWidth: 15,
        visualOutlineWidth: 5,
        visualOutlineOpacity: 0.5,
        visualOutlineGlow: !0,
        visualOutlineGlowRadius: 50,
        visualDuration: 0.6,
        visualFadeOut: !0,
        themeBg: "#222222",
        themeText: "#eeeeee",
        themeBorder: "#444444",
        themePrimary: "#81b64c",
        menuOpacity: 0.9,
        debugLogs: !1,
        humanizationEnabled: false,
        humProfile: "balanced",
        humMoveQuality: 88,
        humAdaptiveTiming: 65,
        humComplexitySense: 60,
        humTimePressureSense: 70,
        humVariance: 30,
        humTimingScale: 50,
        humTimingJitter: 25,
        humTimingSpikeChance: 8,
        humTimingSpikeBonus: 1.2,
        humDepthScale: 45,
        humDepthJitter: 2,
        humDepthBlunderChance: 5,
        humDepthBlunderPenalty: 3,
        humOpeningBoost: 2,
        humEndgameDrop: 1,
        humClockPanic: 20,
        humClockPanicDepthDrop: 2,
        humClockStabilize: 35,
        humClockStabilizeDelayDrop: 0.4,
        humStreakiness: 30,
        humTiltChance: 10,
        humTiltDepthDrop: 2,
        humTiltDelayBoost: 0.7,
        humRhythm: 40,
        humBurstWindow: 4,
        humBurstDepthDrop: 1,
        humBurstDelayDrop: 0.5,
        humMicroPauseChance: 25,
        humMicroPauseMs: 220,
        humComplexityWeight: 35,
        humComplexityDepthBoost: 2,
        humComplexityDelayBoost: 0.8,
        humPreviewLive: true,
        menuPosition: "top-right",
        localModelId: "sf18_05",
        // Per-model settings are stored under "m_<modelId>_<key>" via GM_setValue.
        // These flat keys are only used as in-memory working copies (loaded on model select).
        localHashMB: 64,
        localMoveOverhead: 100,
        localSkillLevel: 20,
        localLimitStrength: false,
        localElo: 3190,
        localShowWDL: false,
        localMinThinkTime: 20,
        localSlowMover: 100,
        localContempt: 24,
    };
    const settings = { ...DEFAULT_SETTINGS };
    // --- COLOR HELPERS ---
    const hexToRgb = (hex) => {
        const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return r ? { r: parseInt(r[1], 16), g: parseInt(r[2], 16), b: parseInt(r[3], 16) } : { r: 0, g: 0, b: 0 };
    };
    const rgbToHex = (r, g, b) => "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    const rgbToHsl = (r, g, b) => {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;
        if (max === min) h = s = 0;
        else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        return { h: h * 360, s: s * 100, l: l * 100 };
    };
    const hslToRgb = (h, s, l) => {
        let r, g, b;
        h /= 360; s /= 100; l /= 100;
        if (s === 0) r = g = b = l;
        else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1 / 6) return p + (q - p) * 6 * t;
                if (t < 1 / 2) return q;
                if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
                return p;
            };
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1 / 3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1 / 3);
        }
        return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
    };
    // --- SAVE/LOAD HELPERS ---
    // ── Per-model setting helpers ────────────────────────────────────────────
    // Global settings use "bot_<key>". Per-model settings use "m_<modelId>_<key>".
    // The flat settings.localXxx keys are working copies loaded from the active model.

    function saveSetting(key, val) {
        settings[key] = val;
        GM_setValue(`bot_${key}`, val);
    }

    // Save a per-model setting for the given (or current) model
    function saveModelSetting(key, val, modelId) {
        const mid = modelId || settings.localModelId || "sf18_05";
        settings[key] = val;
        GM_setValue(`m_${mid}_${key}`, val);
    }

    // Load all per-model settings for a given model into settings.localXxx
    function loadModelSettings(modelId) {
        const m = getEngineById(modelId);
        const d = m.defaults;
        const g = (k, def) => { const v = GM_getValue(`m_${modelId}_${k}`); return v !== undefined ? v : def; };
        settings.localHashMB        = g("localHashMB",       d.hashMB       ?? 64);
        settings.localMoveOverhead  = g("localMoveOverhead", d.moveOverhead  ?? 100);
        settings.localSkillLevel    = g("localSkillLevel",   d.skillLevel    ?? 20);
        settings.localLimitStrength = g("localLimitStrength",d.limitStrength ?? false);
        settings.localElo           = g("localElo",          d.elo           ?? 3190);
        settings.localShowWDL       = g("localShowWDL",      d.showWDL       ?? false);
        settings.localMinThinkTime  = g("localMinThinkTime", d.minThinkTime  ?? 20);
        settings.localSlowMover     = g("localSlowMover",    d.slowMover     ?? 100);
        settings.localContempt      = g("localContempt",     d.contempt      ?? 24);
    }

    function loadSettings() {
        Object.keys(DEFAULT_SETTINGS).forEach((k) => {
            const saved = GM_getValue(`bot_${k}`);
            if (saved !== undefined) settings[k] = saved;
        });
        // Load per-model settings for the active model
        loadModelSettings(settings.localModelId || "sf18_05");
    }
    // --- BOARD FEN LOGIC ---
    function getRawBoardFEN() {
        if (!state.board?.game) return null;
        try {
            if (typeof state.board.game.getFEN === "function") return state.board.game.getFEN();
            if (typeof state.board.game.fen === "string") return state.board.game.fen;
            if (state.board.game.getPosition) return state.board.game.getPosition();
        } catch (e) {}
        return null;
    }
    function sanitizeFEN(rawFEN) {
        if (!rawFEN) return "";
        let parts = rawFEN.replace(/\s+/g, " ").trim().split(" ");
        if (parts.length < 6) {
            const def = ["w", "-", "-", "0", "1"];
            for (let i = parts.length; i < 6; i++) parts.push(def[i - 1]);
        }
        if (parts[3] && parts[3] !== "-") parts[3] = parts[3].toLowerCase();
        return parts.join(" ");
    }
    // --- VISUAL MANAGER ---
    const Visuals = {
        add: (move, type) => {
            if (!move) return;
            if (type === 'history') {
                Visuals.removeByType('history');
                Visuals.removeByType('analysis');
            } else if (type === 'analysis') {
                Visuals.removeByType('analysis');
            }
            const id = `vis-${type}-${move}`;
            const existingIdx = state.visuals.findIndex(v => v.id === id);
            if (existingIdx !== -1) Visuals.remove(id);

            // NATIVE ARROW HANDLING
            if (settings.visualType === "nativeArrow") {
                state.board = document.querySelector(CONFIG.BOARD_SEL);
                if (state.board?.game?.markings) {
                    state.board.game.markings.addOne({
                        type: "arrow",
                        tags: ["Arrows", id],
                        data: {
                            from: move.substring(0, 2),
                            to: move.substring(2, 4)
                        }
                    });
                }
                state.visuals.push({ id, move, type, interval: null, isFading: false });
                return; // Skips fading/DOM duration logic entirely
            }

            Visuals.draw(id, move);
            const interval = setInterval(() => {
                const vis = state.visuals.find(v => v.id === id);
                if (!vis || vis.isFading) { clearInterval(interval); return; }
                Visuals.draw(id, move);
            }, 50);
            state.visuals.push({ id, move, type, interval, isFading: false });
            if (type === 'history') {
                if (settings.visualDuration === -1) { Visuals.remove(id); return; }
                if (settings.visualDuration > 0) {
                    const ms = settings.visualDuration * 1000;
                    if (settings.visualFadeOut) setTimeout(() => Visuals.fadeOut(id), ms);
                    else setTimeout(() => Visuals.remove(id), ms);
                }
            }
        },
        draw: (id, move) => {
            state.board = document.querySelector(CONFIG.BOARD_SEL);
            if (!state.board) return;
            const existing = document.querySelector(`.${id}`);
            if (existing) {
                if (!state.board.contains(existing)) existing.remove();
                else return;
            }
            const { r, g, b } = hexToRgb(settings.highlightColor);
            const col = (a) => `rgba(${r}, ${g}, ${b}, ${a})`;
            const from = move.substring(0, 2);
            const to = move.substring(2, 4);
            const drawBox = () => {
                [from, to].forEach((alg) => {
                    const sqId = `${alg.charCodeAt(0) - 96}${alg.charAt(1)}`;
                    const div = document.createElement("div");
                    div.className = `square-${sqId} bot-highlight ${id}`;
                    let baseStyle = `position: absolute; pointer-events: none !important; z-index: 1000000 !important; width: 12.5%; height: 12.5%; box-sizing: border-box; transition: none !important; `;
                    if (settings.visualType === "outline") {
                        let glow = settings.visualOutlineGlow ? `box-shadow: 0 0 ${settings.visualOutlineGlowRadius}px ${col(1)}, inset 0 0 ${settings.visualOutlineGlowRadius/2}px ${col(0.5)} !important;` : "";
                        div.style.cssText = baseStyle + `border: ${settings.visualOutlineWidth}px solid ${col(settings.visualOutlineOpacity)} !important; ${glow}`;
                    } else {
                        const bias = settings.gradientBias + "%";
                        div.style.cssText = baseStyle + `background: radial-gradient(closest-side, ${col(settings.innerOpacity)} ${bias}, ${col(settings.outerOpacity)} 100%) !important;`;
                    }
                    state.board.appendChild(div);
                });
            };
            if (settings.visualType === "arrow") drawArrow(move, id);
            else drawBox();
        },
        fadeOut: (id) => {
            const vis = state.visuals.find(v => v.id === id);
            if (!vis) return;
            vis.isFading = true;
            clearInterval(vis.interval);
            const els = document.querySelectorAll(`.${id}`);
            els.forEach(el => {
                el.style.setProperty("transition", `opacity ${settings.visualDuration}s linear`, "important");
                el.style.setProperty("opacity", "0", "important");
            });
            setTimeout(() => Visuals.remove(id), settings.visualDuration * 1000);
        },
        remove: (id) => {
            const idx = state.visuals.findIndex(v => v.id === id);
            if (idx !== -1) { clearInterval(state.visuals[idx].interval); state.visuals.splice(idx, 1); }
            document.querySelectorAll(`.${id}`).forEach(el => el.remove());

            if (settings.visualType === "nativeArrow") {
                const board = document.querySelector(CONFIG.BOARD_SEL);
                if (board?.game?.markings) {
                    board.game.markings.removeAll();
                }
            }
        },
        removeByType: (type) => {
            const toRemove = state.visuals.filter(v => v.type === type);
            toRemove.forEach(v => Visuals.remove(v.id));
        }
    };
    // --- PV MANAGER ---
    const PV = {
        interval: null,
        lastMoves: [],
        update: (pvMoves) => {
            PV.lastMoves = pvMoves || [];
            if (!settings.showPVArrows) { PV.clear(); return; }
            PV.draw();
            if (!PV.interval) PV.interval = setInterval(PV.draw, 100);
        },
        clear: () => { document.querySelectorAll('.pv-arrow').forEach(el => el.remove()); },
        draw: () => {
            state.board = document.querySelector(CONFIG.BOARD_SEL);
            if (!state.board) return;
            if (!settings.showPVArrows || !PV.lastMoves.length) { PV.clear(); return; }
            const existing = document.querySelector('.pv-arrow');
            if (existing && !state.board.contains(existing)) PV.clear();
            const limit = Math.min(PV.lastMoves.length, settings.pvDepth);
            for (let i = 0; i < limit; i++) {
                const move = PV.lastMoves[i];
                const id = `pv-arrow-${i}`;
                const el = document.querySelector(`.${id}`);
                if (el && state.board.contains(el)) {
                    if (el.dataset.move === move) continue;
                    el.remove();
                } else if (el) el.remove();
                let color = settings.highlightColor;
                if (settings.pvCustomGradient) {
                    const start = hexToRgb(settings.pvStartColor);
                    const end = hexToRgb(settings.pvEndColor);
                    const factor = limit === 1 ? 0 : i / (limit - 1);
                    const r = Math.round(start.r + factor * (end.r - start.r));
                    const g = Math.round(start.g + factor * (end.g - start.g));
                    const b = Math.round(start.b + factor * (end.b - start.b));
                    color = `rgb(${r},${g},${b})`;
                }
                drawPVArrow(move, id, color, i + 1);
            }
            let i = limit;
            while (document.querySelector(`.pv-arrow-${i}`)) {
                document.querySelectorAll(`.pv-arrow-${i}`).forEach(e => e.remove());
                i++;
            }
        }
    };
    // --- EVALUATION BAR ---
    // Inject a slight override to force the CSS grid to open up the eval column
    const injectEvalStyles = () => {
        if (document.getElementById('real-eval-styles')) return;
        const style = document.createElement('style');
        style.id = 'real-eval-styles';
        style.innerHTML = `
            .board-layout-chessboard {
                grid-template-columns: [evaluation] 3rem [pieces] 0 [board] 1fr[board-controls] var(--boardControlsWidth) !important;
                column-gap: 1rem;
            }
            .evaluation-bar-color {
                transition: transform 1s ease-in !important;
            }
            /* Hide the old floating bar if it exists from previous script runs */
            #bot-eval-bar { display: none !important; }
        `;
        document.head.appendChild(style);
    };

    const EvalBar = {
        el: null, whiteFill: null, scoreAbbr: null, barInner: null,

        create: () => {
            injectEvalStyles();

            // Force native classes on the body so Chess.com renders the grid properly
            if (!document.body.classList.contains('with-evaluation')) {
                document.body.classList.add('with-evaluation', 'with-visible-evaluation');
            }

            // Find the native grid container
            const boardLayout = document.querySelector('.board-layout-chessboard');
            if (!boardLayout) return;

            if (document.getElementById("custom-eval-wrapper")) {
                EvalBar.el = document.getElementById("custom-eval-wrapper");
                EvalBar.barInner = document.querySelector(".evaluation-bar-bar");
                EvalBar.whiteFill = document.getElementById("custom-eval-fill");
                EvalBar.scoreAbbr = document.getElementById("custom-eval-abbr");
                return;
            }

            // Create the wrapper using Chess.com's grid area class
            const wrapper = document.createElement('div');
            wrapper.id = 'custom-eval-wrapper';
            wrapper.className = 'board-layout-evaluation';
            wrapper.style.cssText = 'display: flex; height: 100%; z-index: 10;';

            // Exact DOM structure from Chess.com's React chunk
            wrapper.innerHTML = `
                <div class="evaluation-bar-bar">
                    <span id="custom-eval-abbr" class="evaluation-bar-scoreAbbreviated evaluation-bar-dark">0.0</span>
                    <div class="evaluation-bar-fill">
                        <div class="evaluation-bar-color evaluation-bar-black"></div>
                        <div id="custom-eval-fill" class="evaluation-bar-color evaluation-bar-white" style="transform: translate3d(0px, 50%, 0px);"></div>
                    </div>
                </div>
            `;

            boardLayout.prepend(wrapper);
            EvalBar.el = wrapper;
            EvalBar.barInner = wrapper.querySelector(".evaluation-bar-bar");
            EvalBar.whiteFill = document.getElementById("custom-eval-fill");
            EvalBar.scoreAbbr = document.getElementById("custom-eval-abbr");
        },

        updatePosition: () => {
            // We no longer need to calculate bounding boxes!
            // Chess.com's native CSS grid handles the positioning and resizing automatically.
        },

        update: (evalScore, mate) => {
            if (!EvalBar.el) EvalBar.create();
            if (!EvalBar.whiteFill || !EvalBar.scoreAbbr) return;

            // Flip the bar if playing as black using Chess.com's native flip class
            const playingAsBlack = (state.playingAs === 2);
            if (playingAsBlack) {
                EvalBar.barInner.classList.add('evaluation-bar-flipped');
            } else {
                EvalBar.barInner.classList.remove('evaluation-bar-flipped');
            }

            let percentage = 50;
            let displayScore = "0.0";

            if (mate !== null && mate !== undefined && mate !== 0) {
                const m = parseInt(mate);
                displayScore = "M" + Math.abs(m);
                // 0% translation = 100% white fill, 100% translation = 0% white fill
                percentage = m > 0 ? 0 : 100;
            } else if (evalScore !== null && evalScore !== undefined) {
                const ev = parseFloat(evalScore);
                displayScore = Math.abs(ev) >= 10 ? Math.round(ev).toString() : ev.toFixed(1);

                if (ev > 0 && displayScore !== "0.0") displayScore = "+" + displayScore;

                // Real Engine Sigmoid math to calculate visual percentage
                percentage = 50 - (Math.atan(ev / 2.5) / (Math.PI / 2) * 50);
                percentage = Math.max(5, Math.min(95, percentage)); // Cap it so it never fully vanishes
            }

            // Apply sliding transformation
            EvalBar.whiteFill.style.transform = `translate3d(0px, ${percentage.toFixed(2)}%, 0px)`;
            EvalBar.scoreAbbr.innerText = displayScore;

            // Adjust text color based on the bar's height overlaying the text
            if (percentage < 50) {
                EvalBar.scoreAbbr.className = 'evaluation-bar-scoreAbbreviated evaluation-bar-dark';
            } else {
                EvalBar.scoreAbbr.className = 'evaluation-bar-scoreAbbreviated evaluation-bar-light';
            }
        },

        reset: () => {
            if (!EvalBar.el) return;
            if (EvalBar.whiteFill) EvalBar.whiteFill.style.transform = "translate3d(0px, 50%, 0px)";
            if (EvalBar.scoreAbbr) {
                EvalBar.scoreAbbr.innerText = "0.0";
                EvalBar.scoreAbbr.className = 'evaluation-bar-scoreAbbreviated evaluation-bar-dark';
            }
        }
    };
    function drawPVArrow(move, id, color, index) {
        if (!state.board) return;
        let isFlipped = state.board.classList.contains("flipped");
        if (!isFlipped && state.board.game && state.board.game.getPlayingAs && state.board.game.getPlayingAs() === "b") isFlipped = true;
        const from = move.substring(0, 2), to = move.substring(2, 4);
        const getCoords = (sq) => {
            const file = sq.charCodeAt(0) - 97, rank = parseInt(sq[1]) - 1;
            return isFlipped ? { x: (7-file)*12.5+6.25, y: rank*12.5+6.25 } : { x: file*12.5+6.25, y: (7-rank)*12.5+6.25 };
        };
        const start = getCoords(from), end = getCoords(to);
        const dx = end.x - start.x, dy = end.y - start.y;
        const len = Math.sqrt(dx*dx + dy*dy);
        if (len === 0) return;
        const scale = (settings.arrowWidth || 15) / 15;
        const headLen = 4*scale, headWidth = 3*scale, lineWidth = 1.0*scale;
        const ux = dx/len, uy = dy/len;
        const endLineX = end.x - ux*headLen, endLineY = end.y - uy*headLen;
        const px = -uy, py = ux;
        const ns = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(ns, "svg");
        svg.setAttribute("class", `pv-arrow ${id}`);
        svg.dataset.move = move;
        svg.style.cssText = "position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; z-index:900;";
        svg.setAttribute("viewBox", "0 0 100 100");
        const line = document.createElementNS(ns, "line");
        line.setAttribute("x1", start.x); line.setAttribute("y1", start.y);
        line.setAttribute("x2", endLineX); line.setAttribute("y2", endLineY);
        line.setAttribute("stroke", color); line.setAttribute("stroke-width", lineWidth);
        line.setAttribute("stroke-opacity", settings.arrowOpacity || 0.8);
        line.setAttribute("stroke-linecap", "round");
        const poly = document.createElementNS(ns, "polygon");
        poly.setAttribute("points", `${end.x},${end.y} ${endLineX+px*(headWidth/2)},${endLineY+py*(headWidth/2)} ${endLineX-px*(headWidth/2)},${endLineY-py*(headWidth/2)}`);
        poly.setAttribute("fill", color); poly.setAttribute("fill-opacity", settings.arrowOpacity || 0.8);
        svg.appendChild(line); svg.appendChild(poly);
        if (settings.pvShowNumbers) {
            const text = document.createElementNS(ns, "text");
            text.setAttribute("x", (start.x+end.x)/2); text.setAttribute("y", (start.y+end.y)/2);
            text.setAttribute("dy", "0.3em"); text.setAttribute("text-anchor", "middle");
            text.setAttribute("fill", "#fff"); text.setAttribute("font-size", "2.5");
            text.setAttribute("font-weight", "bold"); text.setAttribute("stroke", "#000");
            text.setAttribute("stroke-width", "0.1"); text.textContent = index;
            svg.appendChild(text);
        }
        state.board.appendChild(svg);
    }
    function drawArrow(move, id) {
        const color = settings.highlightColor, opacity = settings.arrowOpacity, width = settings.arrowWidth;
        let isFlipped = !1;
        if (state.board.classList.contains("flipped")) isFlipped = !0;
        else if (state.board.game && state.board.game.getPlayingAs && state.board.game.getPlayingAs() === "b") isFlipped = !0;
        const from = move.substring(0, 2), to = move.substring(2, 4);
        const getCoords = (sq) => {
            const file = sq.charCodeAt(0) - 97, rank = parseInt(sq[1]) - 1;
            return isFlipped ? { x: (7-file)*12.5+6.25, y: rank*12.5+6.25 } : { x: file*12.5+6.25, y: (7-rank)*12.5+6.25 };
        };
        const start = getCoords(from), end = getCoords(to);
        const dx = end.x - start.x, dy = end.y - start.y;
        const len = Math.sqrt(dx*dx + dy*dy);
        if (len === 0) return;
        const scale = width/15, headLen = 4*scale, headWidth = 3*scale, lineWidth = 1.2*scale;
        const ux = dx/len, uy = dy/len;
        const endLineX = end.x - ux*headLen, endLineY = end.y - uy*headLen;
        const px = -uy, py = ux;
        const ns = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(ns, "svg");
        svg.setAttribute("class", `bot-highlight ${id}`);
        svg.style.cssText = "position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; z-index:200;";
        svg.setAttribute("viewBox", "0 0 100 100");
        const line = document.createElementNS(ns, "line");
        line.setAttribute("x1", start.x); line.setAttribute("y1", start.y);
        line.setAttribute("x2", endLineX); line.setAttribute("y2", endLineY);
        line.setAttribute("stroke", color); line.setAttribute("stroke-width", lineWidth);
        line.setAttribute("stroke-opacity", opacity);
        const polygon = document.createElementNS(ns, "polygon");
        polygon.setAttribute("points", `${end.x},${end.y} ${endLineX+px*(headWidth/2)},${endLineY+py*(headWidth/2)} ${endLineX-px*(headWidth/2)},${endLineY-py*(headWidth/2)}`);
        polygon.setAttribute("fill", color); polygon.setAttribute("fill-opacity", opacity);
        svg.appendChild(line); svg.appendChild(polygon);
        state.board.appendChild(svg);
    }
    // --- EVAL STATUS LOGIC ---
    function getEvalStatusData(val, isMate) {
        const pa = state.playingAs || 1;
        let relativeScore = (pa === 2) ? -val : val;
        if (isMate) {
            if (relativeScore > 0) return { text: "Significant Advantage (Mate)", color: "#00ff00" };
            return { text: "Significant Disadvantage (Mate)", color: "#ff0000" };
        }
        if (relativeScore > 3) return { text: "Significant Advantage", color: "#00ff00" };
        if (relativeScore > 1.5) return { text: "Clear Advantage", color: "#55ff55" };
        if (relativeScore > 0.5) return { text: "Decisive Advantage", color: "#81b64c" };
        if (relativeScore > 0.25) return { text: "Slight Advantage", color: "#aaffaa" };
        if (relativeScore >= -0.25) return { text: "Equal", color: "#aaaaaa" };
        if (relativeScore >= -0.5) return { text: "Slight Disadvantage", color: "#ffaaaa" };
        if (relativeScore >= -1.5) return { text: "Decisive Disadvantage", color: "#ff7777" };
        if (relativeScore >= -3) return { text: "Clear Disadvantage", color: "#ff4444" };
        return { text: "Significant Disadvantage", color: "#ff0000" };
    }

    // --- SF18 ENGINE CORE ---
    function setEngineStatus(status, msg) {
        state.engineStatus = status;
        state.engineStatusMsg = msg || "";
        updateLocalSettingsUI();
    }

    // ─── MULTI-MODEL ENGINE CORE ──────────────────────────────────────────────

    // Send UCI init commands appropriate for the selected engine model
    function sendEngineInitCommands(eng) {
        const m = getEngineById(eng || settings.localModelId);
        const cmds = ["ucinewgame"];
        if (m.hasHash)         cmds.push(`setoption name Hash value ${settings.localHashMB}`);
        if (m.hasMoveOverhead) cmds.push(`setoption name Move Overhead value ${settings.localMoveOverhead}`);
        if (m.hasSlowMover)    cmds.push(`setoption name Slow Mover value ${settings.localSlowMover}`);
        if (m.hasMinThink)     cmds.push(`setoption name Minimum Thinking Time value ${settings.localMinThinkTime}`);
        if (m.hasWDL)          cmds.push(`setoption name UCI_ShowWDL value ${settings.localShowWDL}`);
        if (m.hasSkillLevel)   cmds.push(`setoption name Skill Level value ${settings.localSkillLevel}`);
        if (m.hasNNUE) {
            cmds.push(`setoption name UCI_LimitStrength value ${settings.localLimitStrength}`);
            cmds.push(`setoption name UCI_Elo value ${settings.localElo}`);
        }
        if (m.hasContempt) cmds.push(`setoption name Contempt value ${settings.localContempt}`);
        cmds.push("setoption name MultiPV value 1");
        cmds.forEach(c => state.localEngine.postMessage(c));
    }

    // Build a Worker from a patched JS blob (for WASM-based engines)
    function buildWasmPatchedEngine(jsCode, wasmBytes) {
        let bin = "";
        const chunk = 8192;
        for (let i = 0; i < wasmBytes.length; i += chunk)
            bin += String.fromCharCode.apply(null, wasmBytes.subarray(i, i + chunk));
        const wasmB64 = btoa(bin);
        const patchCode = `
var _wasmB64 = "${wasmB64}";
var _wasmBytes = (function(){
    var b = atob(_wasmB64), a = new Uint8Array(b.length);
    for(var i=0;i<b.length;i++) a[i]=b.charCodeAt(i);
    return a;
})();
self.fetch = function(url, opts) {
    return Promise.resolve({ ok:true, arrayBuffer:function(){ return Promise.resolve(_wasmBytes.buffer); } });
};
`;
        const blob = new Blob([patchCode + jsCode], { type: "application/javascript" });
        return new Worker(URL.createObjectURL(blob));
    }

    // Build a Worker from a pure asm.js JS string (for old SF 6/8/10/11)
    function buildAsmJsEngine(jsCode) {
        const blob = new Blob([jsCode], { type: "application/javascript" });
        return new Worker(URL.createObjectURL(blob));
    }

    function finalizeEngine(modelId) {
        state.engineLoadingInProgress = false;
        // Don't set ready yet — wait for uciok from the engine
        setEngineStatus("loading", "Initializing...");
        const m = getEngineById(modelId);
        console.log(`[SF Engine] ${m.label} worker built, sending uci...`);
        // uci handshake → engine replies uciok → handleLocalMessage flips to ready
        state.localEngine.postMessage("uci");
        // Send all init options after uci (engine queues them internally)
        sendEngineInitCommands(modelId);
        state.localEngine.postMessage("isready");
        updateUI();
        updateLocalSettingsUI();
    }

    function onEngineWorkerError(e) {
        handleError("Engine Worker Error", e);
        setEngineStatus("error", e.message || "Worker error");
        state.localEngine = null;
        state.engineLoadingInProgress = false;
    }

    // ─── Cache helpers ────────────────────────────────────────────────────────
    function openCache(cb) {
        const dbReq = indexedDB.open("sfEngineCache", 2);
        dbReq.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains("engines")) db.createObjectStore("engines");
        };
        dbReq.onsuccess = (e) => cb(null, e.target.result);
        dbReq.onerror = () => cb(new Error("IndexedDB open failed"), null);
    }

    function readCache(db, key, cb) {
        try {
            const req = db.transaction("engines", "readonly").objectStore("engines").get(key);
            req.onsuccess = (e) => cb(null, e.target.result || null);
            req.onerror = () => cb(null, null);
        } catch (e) { cb(null, null); }
    }

    function writeCache(db, key, data) {
        try {
            const tx = db.transaction("engines", "readwrite");
            tx.objectStore("engines").put(data, key);
        } catch (e) {}
    }

    function deleteCache(db, key, cb) {
        try {
            const tx = db.transaction("engines", "readwrite");
            const req = tx.objectStore("engines").delete(key);
            tx.oncomplete = () => cb && cb();
            req.onerror = () => cb && cb();
        } catch (e) { cb && cb(); }
    }

    // ─── Download helpers ─────────────────────────────────────────────────────
    function xhrText(url, cb, errCb) {
        GM_xmlhttpRequest({
            method: "GET", url, timeout: 30000,
            onload: (r) => {
                if (r.status >= 400) { errCb(new Error(`HTTP ${r.status}`)); return; }
                cb(r.responseText);
            },
            onerror: (e) => errCb(new Error("Network error: " + url)),
            ontimeout: () => errCb(new Error("Timeout: " + url)),
        });
    }

    function xhrBinary(url, cb, errCb) {
        GM_xmlhttpRequest({
            method: "GET", url, responseType: "arraybuffer", timeout: 60000,
            onload: (r) => {
                if (r.status >= 400) { errCb(new Error(`HTTP ${r.status}`)); return; }
                cb(new Uint8Array(r.response));
            },
            onerror: (e) => errCb(new Error("Binary download failed: " + url)),
            ontimeout: () => errCb(new Error("Binary timeout: " + url)),
        });
    }

    // ─── Main load entry point ────────────────────────────────────────────────
    function loadLocalEngine() {
        if (state.localEngine || state.engineLoadingInProgress) return;
        state.engineLoadingInProgress = true;
        state.isThinking = false;
        const modelId = settings.localModelId || "sf18_05";
        const m = getEngineById(modelId);
        const label = m.format === "asmjs" ? `${m.label} (asm.js)` : m.label;
        setEngineStatus("loading", "Checking cache...");
        state.lastMoveResult = `⏳ Loading ${label}...`;
        updateUI();

        openCache((dbErr, db) => {

            if (m.format === "asmjs") {
                // ── asm.js path: XHR the JS text, build Worker directly ──────
                const launch = (jsCode) => {
                    try {
                        state.localEngine = buildAsmJsEngine(jsCode);
                        state.localEngine.onerror = onEngineWorkerError;
                        state.localEngine.onmessage = handleLocalMessage;
                        finalizeEngine(modelId);
                    } catch (e) {
                        state.engineLoadingInProgress = false;
                        setEngineStatus("error", e.message || "Build failed");
                    }
                };
                if (db) {
                    readCache(db, m.cacheKey, (_, cached) => {
                        if (cached) {
                            setEngineStatus("loading", "Loading from cache...");
                            launch(cached);
                        } else {
                            setEngineStatus("loading", "Downloading JS...");
                            xhrText(m.jsUrl,
                                (js) => { if (db) writeCache(db, m.cacheKey, js); launch(js); },
                                (e)  => { state.engineLoadingInProgress = false; setEngineStatus("error", "Download failed: " + e.message); }
                            );
                        }
                    });
                } else {
                    xhrText(m.jsUrl, launch, (e) => { state.engineLoadingInProgress = false; setEngineStatus("error", e.message); });
                }

            } else {
                // ── wasm format: cache BOTH js text and wasm bytes in IndexedDB ──
                // Keys: m.cacheKey + "_js" for the JS text, m.cacheKey + "_wasm" for bytes.
                // SF18.0.5: try @resource first for JS (already bundled), avoids any XHR.

                const jsKey   = m.cacheKey + "_js";
                const wasmKey = m.cacheKey + "_wasm";

                const launch = (jsCode, wasmBytes) => {
                    try {
                        state.localEngine = buildWasmPatchedEngine(jsCode, wasmBytes);
                        state.localEngine.onerror = onEngineWorkerError;
                        state.localEngine.onmessage = handleLocalMessage;
                        finalizeEngine(modelId);
                    } catch (e) {
                        state.engineLoadingInProgress = false;
                        setEngineStatus("error", e.message || "Build failed");
                    }
                };

                // Step 1: get JS (from @resource, IndexedDB cache, or XHR)
                const getJs = (cb) => {
                    // SF18.0.5: @resource is bundled — fastest, no network hit
                    const bundled = GM_getResourceText("stockfish.js");
                    if (bundled) { cb(bundled); return; }

                    // Try IndexedDB cache
                    if (db) {
                        readCache(db, jsKey, (_, cachedJs) => {
                            if (cachedJs) {
                                cb(cachedJs);
                            } else {
                                setEngineStatus("loading", "Downloading JS...");
                                xhrText(m.jsUrl,
                                    (js) => { writeCache(db, jsKey, js); cb(js); },
                                    (e)  => { state.engineLoadingInProgress = false; setEngineStatus("error", "JS download failed: " + e.message); }
                                );
                            }
                        });
                    } else {
                        setEngineStatus("loading", "Downloading JS...");
                        xhrText(m.jsUrl, cb,
                            (e) => { state.engineLoadingInProgress = false; setEngineStatus("error", "JS download failed: " + e.message); }
                        );
                    }
                };

                // Step 2: get WASM (from IndexedDB cache or XHR)
                const getWasm = (jsCode, cb) => {
                    if (db) {
                        readCache(db, wasmKey, (_, cachedWasm) => {
                            if (cachedWasm) {
                                setEngineStatus("loading", "Loading from cache...");
                                cb(jsCode, cachedWasm);
                            } else {
                                setEngineStatus("loading", "Downloading WASM...");
                                xhrBinary(m.wasmUrl,
                                    (bytes) => { writeCache(db, wasmKey, bytes); cb(jsCode, bytes); },
                                    (e)     => { state.engineLoadingInProgress = false; setEngineStatus("error", "WASM download failed: " + e.message); }
                                );
                            }
                        });
                    } else {
                        setEngineStatus("loading", "Downloading WASM...");
                        xhrBinary(m.wasmUrl,
                            (bytes) => cb(jsCode, bytes),
                            (e)     => { state.engineLoadingInProgress = false; setEngineStatus("error", e.message); }
                        );
                    }
                };

                getJs((jsCode) => {
                    if (!jsCode) return;
                    getWasm(jsCode, launch);
                });
            }
        });
    }
    function reinstallEngine() {
        if (state.localEngine) {
            try { state.localEngine.terminate(); } catch (e) {}
            state.localEngine = null;
        }
        state.engineLoadingInProgress = false;
        const m = getEngineById(settings.localModelId);
        setEngineStatus("loading", "Clearing cache...");
        openCache((dbErr, db) => {
            if (!db) { loadLocalEngine(); return; }
            // Delete both JS and WASM cache entries, then reload
            deleteCache(db, m.cacheKey + "_js",   () =>
                deleteCache(db, m.cacheKey + "_wasm", () =>
                    deleteCache(db, m.cacheKey, () => loadLocalEngine()) // legacy key too
                )
            );
        });
    }

    function uninstallEngine() {
        if (state.localEngine) {
            try { state.localEngine.terminate(); } catch (e) {}
            state.localEngine = null;
        }
        state.engineLoadingInProgress = false;
        const m = getEngineById(settings.localModelId);
        openCache((dbErr, db) => {
            if (!db) { setEngineStatus("not_installed", ""); return; }
            deleteCache(db, m.cacheKey + "_js",   () =>
                deleteCache(db, m.cacheKey + "_wasm", () =>
                    deleteCache(db, m.cacheKey, () => setEngineStatus("not_installed", ""))
                )
            );
        });
        state.lastMoveResult = "Local engine uninstalled.";
        updateUI();
    }

    function triggerFallback() {
        if (settings.engineMode === 'local') return;
        console.warn(`API Error. Switching to Local SF18 at Depth ${settings.depth}.`);
        settings.engineMode = 'local';
        saveSetting('engineMode', 'local');
        if (state.ui.selMode) state.ui.selMode.value = 'local';
        state.lastMoveResult = `⚠️ API Error. Switched to Local SF18.`;
        loadLocalEngine();
        if (state.lastSanitizedBoardFEN) analyzeLocal(state.lastSanitizedBoardFEN, settings.depth);
        updateUI();
    }
    function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
    function countPiecesFromFen(fen) {
        if (!fen) return 32;
        const board = fen.split(" ")[0] || "";
        return (board.match(/[prnbqkPRNBQK]/g) || []).length;
    }
    function readPlayerClockSeconds() {
        const clockBot = document.querySelector(".clock-bottom .clock-time-monospace, .clock-bottom");
        if (!clockBot) return null;
        const t = (clockBot.innerText || "").trim();
        const p = t.split(":").map(v => parseInt(v, 10));
        if (p.some(Number.isNaN)) return null;
        if (p.length === 2) return p[0] * 60 + p[1];
        if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
        return null;
    }
    function getHumanProfilePreset(profile) {
        if (profile === "cautious") return { delay: 1.15, depth: 1.08, mistake: 0.55 };
        if (profile === "chaotic") return { delay: 0.95, depth: 0.92, mistake: 1.4 };
        if (profile === "blitz") return { delay: 0.7, depth: 0.82, mistake: 1.25 };
        return { delay: 1, depth: 1, mistake: 1 };
    }
    function getHumanizationPreview(fen, depthInput = settings.depth) {
        const depthBase = clamp(parseInt(depthInput) || 1, 1, 40);
        const minBase = Math.max(0, parseFloat(settings.minDelay) || 0);
        const maxBase = Math.max(minBase, parseFloat(settings.maxDelay) || minBase);
        const preview = {
            enabled: !!settings.humanizationEnabled,
            depthBase,
            depthFinal: depthBase,
            delayMinBase: minBase,
            delayMaxBase: maxBase,
            delayMinFinal: minBase,
            delayMaxFinal: maxBase,
            moveQuality: clamp(parseInt(settings.humMoveQuality) || 88, 30, 100),
            altMoveChance: 0
        };
        if (!settings.humanizationEnabled) return preview;
        const profile = getHumanProfilePreset(settings.humProfile);
        const pieces = countPiecesFromFen(fen);
        const complexityLevel = clamp((32 - pieces) / 20, 0, 1);
        const complexitySense = clamp((settings.humComplexitySense || 0) / 100, 0, 1);
        const adaptiveTiming = clamp((settings.humAdaptiveTiming || 0) / 100, 0, 1);
        const pressureSense = clamp((settings.humTimePressureSense || 0) / 100, 0, 1);
        const variance = clamp((settings.humVariance || 0) / 100, 0, 1);
        const clockSec = readPlayerClockSeconds();
        const panic = clockSec !== null && clockSec < 20;
        const comfortable = clockSec !== null && clockSec > 50;
        const complexityBoost = complexityLevel * complexitySense;
        let delayMin = minBase * profile.delay;
        let delayMax = maxBase * profile.delay;
        delayMin += adaptiveTiming * complexityBoost * 0.8;
        delayMax += adaptiveTiming * complexityBoost * 1.5;
        if (panic) {
            const panicCut = 0.45 * pressureSense;
            delayMin *= (1 - panicCut);
            delayMax *= (1 - panicCut * 0.9);
        } else if (comfortable) {
            delayMin += pressureSense * 0.25;
            delayMax += pressureSense * 0.55;
        }
        const jitter = variance * 0.8;
        delayMin = Math.max(0, delayMin + ((Math.random() * 2 - 1) * jitter));
        delayMax = Math.max(delayMin, delayMax + ((Math.random() * 2 - 1) * jitter * 1.4));

        const qualityPenalty = clamp((100 - preview.moveQuality) / 100, 0, 0.7);
        let depthFinal = depthBase * profile.depth;
        depthFinal += Math.round(adaptiveTiming * complexityBoost * 3);
        depthFinal -= Math.round(qualityPenalty * 7);
        if (panic) depthFinal -= Math.round(pressureSense * 2.5);
        depthFinal += Math.round((Math.random() * 2 - 1) * (variance * 1.8));
        preview.altMoveChance = clamp(parseFloat((qualityPenalty * profile.mistake * (0.55 + complexityLevel * 0.25)).toFixed(2)), 0, 0.8);

        preview.depthFinal = clamp(depthFinal, 1, 40);
        preview.delayMinFinal = parseFloat(delayMin.toFixed(2));
        preview.delayMaxFinal = parseFloat(delayMax.toFixed(2));
        return preview;
    }
    function analyze(depth = settings.depth, fenOverride = null, isRetry = !1) {
        if (state.isThinking && !fenOverride && !isRetry) return;
        let finalFEN = fenOverride || sanitizeFEN(getRawBoardFEN());
        if (!finalFEN) return;
        state.lastRawFEN = finalFEN;
        state.lastSentFEN = finalFEN;
        if (!fenOverride) state.lastSanitizedBoardFEN = finalFEN;
        state.isThinking = !0;
        state.analysisStartTime = performance.now();
        const h = getHumanizationPreview(finalFEN, depth);
        depth = h.depthFinal;
        const minMs = h.delayMinFinal * 1000, maxMs = h.delayMaxFinal * 1000;
        const delay = Math.random() * (maxMs - minMs) + minMs;
        state.moveTargetTime = performance.now() + delay;
        state.calculatedDelay = (delay / 1000).toFixed(2);
        updateUI();
        if (settings.engineMode === "cloud") analyzeCloud(finalFEN, depth, isRetry);
        else if (settings.engineMode === "sfonline") analyzeSF16(finalFEN, depth);
        else analyzeLocal(finalFEN, depth);
    }
    function analyzeCloud(finalFEN, depth, isRetry) {
        const actualDepth = Math.min(depth, 18);
        const payload = {
            fen: finalFEN,
            depth: actualDepth,
            maxThinkingTime: Math.min(settings.maxThinkingTime, CONFIG.API.MAX_TIME),
            taskId: Math.random().toString(36).substring(7),
        };
        if (settings.searchMoves.trim()) payload.searchmoves = settings.searchMoves.trim();
        state.lastPayload = `POST https://chess-api.com/v1\n${JSON.stringify(payload, null, 2)}`;
        if (state.ui.liveOutput) state.ui.liveOutput.innerHTML = isRetry ? "♻️ Retrying Safe FEN..." : "☁️ SF18 Cloud Analysis...";
        updateUI();
        state.currentCloudRequest = GM_xmlhttpRequest({
            method: "POST", url: "https://chess-api.com/v1",
            headers: { "Content-Type": "application/json" },
            data: JSON.stringify(payload), timeout: 15000,
            onload: (res) => handleCloudResponse(res, finalFEN, actualDepth, isRetry),
            onerror: (err) => { handleError("Network Error", err); triggerFallback(); },
            ontimeout: () => { handleError("Timeout (15s)"); triggerFallback(); },
        });
    }
    function analyzeSF16(finalFEN, depth) {
        const actualDepth = Math.min(depth, 15);
        const url = `https://stockfish.online/api/s/v2.php?fen=${encodeURIComponent(finalFEN)}&depth=${actualDepth}&mode=bestmove`;
        state.lastPayload = `GET ${url}`;
        if (state.ui.liveOutput) state.ui.liveOutput.innerHTML = "☁️ SF17.1.0 Analysis...";
        updateUI();
        state.currentCloudRequest = GM_xmlhttpRequest({
            method: "GET", url, timeout: 20000,
            onload: (res) => handleSF16Response(res, finalFEN, actualDepth),
            onerror: (err) => { handleError("Network Error (SF16)", err); triggerFallback(); },
            ontimeout: () => { handleError("Timeout (SF16 20s)"); triggerFallback(); },
        });
    }
    function maybeUseAlternateCloudMove(finalFEN, mainDepth, primaryMove, done) {
        const preview = getHumanizationPreview(finalFEN, mainDepth);
        if (!preview.enabled || preview.altMoveChance <= 0 || Math.random() >= preview.altMoveChance) { done(primaryMove); return; }
        const altDepth = clamp(Math.round(mainDepth * 0.55), 4, Math.max(4, mainDepth - 2));
        GM_xmlhttpRequest({
            method: "POST", url: "https://chess-api.com/v1",
            headers: { "Content-Type": "application/json" },
            data: JSON.stringify({
                fen: finalFEN,
                depth: altDepth,
                maxThinkingTime: Math.min(settings.maxThinkingTime, CONFIG.API.MAX_TIME),
                taskId: Math.random().toString(36).substring(7)
            }),
            timeout: 8000,
            onload: (res) => {
                try {
                    const rawData = JSON.parse(res.responseText);
                    const result = Array.isArray(rawData) ? rawData[0] : rawData;
                    const altMove = result?.move || result?.bestmove || primaryMove;
                    done(altMove || primaryMove);
                } catch (_) { done(primaryMove); }
            },
            onerror: () => done(primaryMove),
            ontimeout: () => done(primaryMove),
        });
    }
    function maybeUseAlternateSFMove(finalFEN, mainDepth, primaryMove, done) {
        const preview = getHumanizationPreview(finalFEN, mainDepth);
        if (!preview.enabled || preview.altMoveChance <= 0 || Math.random() >= preview.altMoveChance) { done(primaryMove); return; }
        const altDepth = clamp(Math.round(mainDepth * 0.55), 4, Math.max(4, mainDepth - 2));
        const url = `https://stockfish.online/api/s/v2.php?fen=${encodeURIComponent(finalFEN)}&depth=${altDepth}&mode=bestmove`;
        GM_xmlhttpRequest({
            method: "GET", url, timeout: 8000,
            onload: (res) => {
                try {
                    const data = JSON.parse(res.responseText);
                    const altMove = (data?.bestmove ? (data.bestmove.split(" ")[1] || data.bestmove) : null) || primaryMove;
                    done(altMove);
                } catch (_) { done(primaryMove); }
            },
            onerror: () => done(primaryMove),
            ontimeout: () => done(primaryMove),
        });
    }
    function handleSF16Response(response, sentFEN, sentDepth) {
        state.isThinking = !1;
        state.lastResponse = response.responseText;
        try {
            if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
            const data = JSON.parse(response.responseText);
            if (!data.success || !data.bestmove) { triggerFallback(); return; }
            const duration = ((performance.now() - state.analysisStartTime) / 1000).toFixed(2);
            const bestMove = data.bestmove.split(" ")[1] || data.bestmove;
            maybeUseAlternateSFMove(sentFEN, sentDepth, bestMove, (finalMove) => {
                processBestMove(finalMove, data.evaluation, data.mate, data.continuation ? data.continuation.split(" ") : null, null, duration, true);
                updateUI();
            });
            return;
        } catch (e) { triggerFallback(); }
        updateUI();
    }
    function handleCloudResponse(response, sentFEN, depth, isRetry) {
        state.isThinking = !1;
        state.lastResponse = response.responseText;
        if (response.responseText.includes("HIGH_USAGE") || response.status === 429) { triggerFallback(); return; }
        try {
            if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
            const rawData = JSON.parse(response.responseText);
            const result = Array.isArray(rawData) ? rawData[0] : rawData;
            if (!result || result.error || result.status === "error") {
                const errText = result?.error || result?.message || "Unknown Error";
                if (errText.includes("HIGH_USAGE")) { triggerFallback(); return; }
                if ((errText.includes("FEN") || errText.includes("VALIDATION")) && !isRetry) {
                    const parts = sentFEN.split(" ");
                    if (parts.length >= 4 && parts[3] !== "-") { parts[3] = "-"; analyze(depth, parts.join(" "), !0); return; }
                }
                triggerFallback(); return;
            }
            if (result.move || result.bestmove) {
                const duration = ((performance.now() - state.analysisStartTime) / 1000).toFixed(2);
                const bestMove = result.move || result.bestmove;
                maybeUseAlternateCloudMove(sentFEN, depth, bestMove, (finalMove) => {
                    processBestMove(finalMove, result.eval, result.mate, result.continuationArr, result.winChance, duration, true);
                    updateUI();
                });
                return;
            } else { triggerFallback(); }
        } catch (e) { triggerFallback(); }
        updateUI();
    }
    function analyzeLocal(fen, depth) {
        if (!state.localEngine) {
            loadLocalEngine();
            return;
        }
        state.localEval = null; state.localMate = null; state.localPV = null; state.localDepth = null;
        const m = getEngineById(settings.localModelId);
        const actualDepth = Math.min(depth, m.maxDepth);
        const cmds = [`position fen ${fen}`, `go depth ${actualDepth}`];
        state.lastPayload = `Worker CMDs:\n${cmds.join("\n")}`;
        state.ui.liveOutput.innerHTML = "⚡ Local SF18 Analysis...";
        updateUI();
        cmds.forEach((cmd) => state.localEngine.postMessage(cmd));
    }
    function handleLocalMessage(e) {
        const msg = typeof e.data === "string" ? e.data : (e.data?.toString ? e.data.toString() : null);
        if (!msg || typeof msg !== "string") return;
        state.lastResponse = (state.lastResponse.length > 500 ? "..." + state.lastResponse.slice(-500) : state.lastResponse) + "\n" + msg;
        if (state.ui.logRec) state.ui.logRec.innerText = state.lastResponse;

        // Engine signals it's ready — flip status immediately
        if (msg === "uciok" || msg.startsWith("uciok")) {
            if (state.engineStatus !== "ready") {
                const m = getEngineById(settings.localModelId || "sf18_05");
                setEngineStatus("ready", "");
                state.lastMoveResult = `✅ ${m.label} ready.`;
                updateUI();
            }
            return;
        }
        if (msg === "readyok") {
            if (state.engineStatus !== "ready") {
                const m = getEngineById(settings.localModelId || "sf18_05");
                setEngineStatus("ready", "");
                state.lastMoveResult = `✅ ${m.label} ready.`;
                updateUI();
            }
            return;
        }
        if (msg.startsWith("info") && msg.includes("depth") && msg.includes("score")) {
            const depthMatch = msg.match(/depth (\d+)/);
            const scoreMatch = msg.match(/score (cp|mate) (-?\d+)/);
            const pvMatch = msg.match(/ pv (.*)/);
            if (depthMatch && scoreMatch) {
                const depth = depthMatch[1];
                let val = parseInt(scoreMatch[2]);
                const type = scoreMatch[1];
                const fenParts = state.lastSentFEN ? state.lastSentFEN.split(" ") : [];
                const sideToMove = fenParts.length > 1 ? fenParts[1] : "w";
                if (sideToMove === "b") val = -val;
                const pv = pvMatch ? pvMatch[1] : "";
                if (type === "mate") { state.localMate = val; state.localEval = null; }
                else { state.localMate = null; state.localEval = (val / 100).toFixed(2); }
                state.localPV = pv; state.localDepth = depth;
                if (pv) state.currentPV = pv.split(" ");
                EvalBar.update(type === "mate" ? null : parseFloat(state.localEval), type === "mate" ? val : null);
                let scoreTxt;
                if (type === "mate") { scoreTxt = "M" + Math.abs(val); if (val < 0) scoreTxt = "-" + scoreTxt; }
                else { scoreTxt = (val > 0 ? "+" : "") + (val / 100).toFixed(2); }
                const evalVal = type === "mate" ? val : parseFloat(state.localEval);
                const statusData = getEvalStatusData(evalVal, type === "mate");
                const duration = ((performance.now() - state.analysisStartTime) / 1000).toFixed(2);
                if (pv) {
                    const best = pv.split(" ")[0];
                    Visuals.add(best, 'analysis');
                    PV.update(state.currentPV);
                    state.lastMoveResult = `⏳ D${depth}: <span style="font-weight:bold; color:var(--bot-primary);">${best}</span>`;
                }
                state.lastLiveResult = `
                    <div style="display:flex; justify-content:space-between; align-items:center; font-weight:bold;">
                        <div style="display:flex; align-items:center; gap: 8px;">
                            <span style="color:var(--bot-primary); font-size:1.1em;">${scoreTxt}</span>
                            <span style="font-size:0.85em; color:${statusData.color}; font-weight:bold;">${statusData.text}</span>
                        </div>
                        <span style="font-size:0.7em; color:#aaa; font-weight:normal;">(${duration}s)</span>
                    </div>`;
                updateUI();
            }
        }
        if (msg.startsWith("bestmove")) {
            state.isThinking = !1;
            const parts = msg.split(" ");
            const bestMove = parts[1];
            if (bestMove && bestMove !== "(none)") {
                const duration = ((performance.now() - state.analysisStartTime) / 1000).toFixed(2);
                processBestMove(bestMove, state.localEval, state.localMate, state.localPV ? state.localPV.split(" ") : null, null, duration, state.localDepth, true);
            } else state.lastMoveResult = "⚠️ No move found";
            updateUI();
        }
    }
    function processBestMove(bestMove, evalScore, mate, continuationArr, winChance, duration, depth = null, isFinal = false) {
        state.currentBestMove = bestMove;
        state.currentPV = continuationArr || (bestMove ? [bestMove] : []);
        if (isFinal || !state.isThinking) { Visuals.add(bestMove, 'history'); PV.clear(); }
        else { Visuals.add(bestMove, 'analysis'); PV.update(state.currentPV); }
        const evalNum = (evalScore !== null && evalScore !== undefined) ? parseFloat(evalScore) : null;
        const mateNum = (mate !== null && mate !== undefined && mate !== 0) ? parseInt(mate) : null;
        EvalBar.update(evalNum, mateNum);
        let scoreTxt = "", pvStr = "N/A", numericValForStatus = 0, isMate = false;
        if (evalScore !== undefined || mate !== undefined) {
            if (mate) {
                isMate = true; numericValForStatus = mate;
                scoreTxt = `M${Math.abs(mate)}`; if (mate < 0) scoreTxt = "-" + scoreTxt;
            } else {
                const sc = parseFloat(evalScore); numericValForStatus = sc;
                scoreTxt = (sc > 0 ? "+" : "") + sc;
            }
            if (continuationArr) pvStr = continuationArr.join(" ");
        }
        const statusData = getEvalStatusData(numericValForStatus, isMate);
        const durHtml = duration ? `<span style="font-size:0.7em; color:#aaa; font-weight:normal;">(${duration}s)</span>` : "";
        state.lastMoveResult = `✅ Best: <span style="font-weight:bold; color:var(--bot-primary);">${bestMove}</span>`;
        let wcHtml = "";
        if (winChance) wcHtml = `<span style="color:#aaa; font-size:0.8em;">(${Math.round(winChance)}%)</span>`;
        else if (depth) wcHtml = `<span style="font-size:0.8em; color:#aaa;">(D${depth})</span>`;
        state.lastLiveResult = `
            <div style="display:flex; justify-content:space-between; align-items:center; font-weight:bold;">
                <div style="display:flex; align-items:center; gap: 8px;">
                    <span style="color:var(--bot-primary); font-size:1.1em;">${scoreTxt}</span>
                    <span style="font-size:0.85em; color:${statusData.color}; font-weight:bold;">${statusData.text}</span>
                </div>
                <div>${wcHtml} ${durHtml}</div>
            </div>
            <div style="margin-top:5px; font-size:0.85em; color:#bbb; width:100%; max-width:100%; box-sizing:border-box; word-wrap:break-word; overflow-wrap:anywhere; white-space:normal;">
                <span style="color:#888;">PV:</span> ${pvStr}
            </div>`;
        if (settings.autoMove) triggerAutoMove();
    }
    function triggerAutoMove() {
        if (!state.currentBestMove || !state.board?.game) return;
        const turn = state.board.game.getTurn();
        const playingAs = state.board.game.getPlayingAs();
        if (turn !== playingAs) return;
        const wait = Math.max(0, state.moveTargetTime - performance.now());
        setTimeout(() => playMove(state.currentBestMove), wait);
    }
    function handleError(type, err) {
        state.isThinking = !1;
        console.error(type, err);
        state.lastResponse = `${type}: ${err?.message || err}`;
        state.lastMoveResult = `❌ ${type}`;
        updateUI();
    }
    function playMove(move) {
        if (!state.board?.game) return;
        const from = move.substring(0, 2), to = move.substring(2, 4);
        const currentRaw = getRawBoardFEN();
        if (currentRaw && sanitizeFEN(currentRaw).split(" ")[0] !== state.lastSentFEN.split(" ")[0]) return;
        for (const m of state.board.game.getLegalMoves()) {
            if (m.from === from && m.to === to) {
                const promotion = move.length > 4 ? move.substring(4, 5) : "q";
                state.board.game.move({ ...m, promotion, animate: !0, userGenerated: !0 });
                return;
            }
        }
    }
    function toggleAutoQueue() {
        if (state.newGameObserver) { state.newGameObserver.disconnect(); state.newGameObserver = null; }
        if (state.queueTimeout) { clearTimeout(state.queueTimeout); state.queueTimeout = null; }
        if (settings.autoQueue) {
            state.newGameObserver = new MutationObserver(() => {
                const btns = Array.from(document.querySelectorAll("button"));
                const newGameBtn = btns.find((b) => {
                    const txt = b.innerText.toLowerCase();
                    return txt.includes("new") && !txt.includes("rematch") && b.offsetParent !== null;
                });
                if (newGameBtn && !state.queueTimeout) {
                    state.queueTimeout = setTimeout(() => { newGameBtn.click(); state.queueTimeout = null; }, 100);
                }
            });
            state.newGameObserver.observe(document.body, { childList: !0, subtree: !0 });
        }
    }
    function resetSettings() {
        const currentModel = settings.engineMode;
        Object.assign(settings, DEFAULT_SETTINGS);
        settings.engineMode = currentModel;
        Object.keys(DEFAULT_SETTINGS).forEach((k) => { if (k !== "engineMode") saveSetting(k, DEFAULT_SETTINGS[k]); });
        saveSetting("engineMode", currentModel);
        const hsl = rgbToHsl(...Object.values(hexToRgb(settings.highlightColor)));
        state.h = hsl.h; state.s = hsl.s; state.l = hsl.l;
        toggleAutoQueue();
        createUI();
        applyMenuPosition();
    }
    function syncColor() {
        const rgb = hslToRgb(state.h, state.s, state.l);
        const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
        settings.highlightColor = hex;
        saveSetting("highlightColor", hex);
        if (state.ui.inpR) {
            state.ui.inpR.value = rgb.r; state.ui.inpG.value = rgb.g; state.ui.inpB.value = rgb.b;
            state.ui.inpHex.value = hex;
            state.ui.colorPreview.style.background = hex;
            state.ui.sliderH.value = state.h; state.ui.sliderS.value = state.s; state.ui.sliderL.value = state.l;
            if (state.ui.sliderHNum) state.ui.sliderHNum.value = Math.round(state.h);
            if (state.ui.sliderSNum) state.ui.sliderSNum.value = Math.round(state.s);
            if (state.ui.sliderLNum) state.ui.sliderLNum.value = Math.round(state.l);
        }
        Visuals.removeByType('history');
        if (state.currentBestMove) Visuals.add(state.currentBestMove, 'history');
    }
    function applyTheme() {
        const modals = [state.ui.panel, state.ui.modal, state.ui.histModal, state.ui.localModal];
        modals.forEach(m => {
            if (!m) return;
            m.style.setProperty("--bot-bg", settings.themeBg);
            m.style.setProperty("--bot-t", settings.themeText);
            m.style.setProperty("--bot-b", settings.themeBorder);
            m.style.setProperty("--bot-p", settings.themePrimary);
            m.style.color = settings.themeText;
            if (m === state.ui.panel) {
                m.style.opacity = settings.menuOpacity;
            } else {
                const overlayId = m.id === "modal" ? "modalOv" : m.id === "histModal" ? "histModalOv" : "localModalOv";
                const overlay = document.getElementById(overlayId);
                if (overlay) overlay.style.opacity = "1";
                m.style.opacity = settings.menuOpacity;
            }
        });
    }
    function applyMenuPosition() {
        const p = state.ui.panel;
        if (!p) return;
        const margin = "10px";
        p.style.transform = "none";
        p.style.top = ""; p.style.bottom = ""; p.style.left = ""; p.style.right = "";
        if (settings.menuPosition === "custom") {
            const savedX = GM_getValue("bot_pX", "auto");
            const savedY = GM_getValue("bot_pY", "0");
            if (savedX === "auto") { p.style.right = "0px"; p.style.left = "auto"; }
            else p.style.left = savedX + "px";
            p.style.top = savedY + "px";
            const rect = p.getBoundingClientRect();
            if (rect.left < 0) p.style.left = "0px";
            if (rect.top < 0) p.style.top = "0px";
            if (rect.right > window.innerWidth) p.style.left = (window.innerWidth - rect.width) + "px";
            if (rect.bottom > window.innerHeight) p.style.top = (window.innerHeight - rect.height) + "px";
        } else {
            switch (settings.menuPosition) {
                case "top-left": p.style.top = margin; p.style.left = margin; break;
                case "top-right": p.style.top = margin; p.style.right = margin; break;
                case "bottom-left": p.style.bottom = margin; p.style.left = margin; break;
                case "bottom-right": p.style.bottom = margin; p.style.right = margin; break;
            }
        }
    }

    // Sync all local settings input elements to current settings.localXxx values.
    // Called when the modal opens or when the model changes.
    function syncLocalSettingsInputs() {
        const byId = (id) => document.getElementById(id);
        const set  = (id, val) => { const el = byId(id); if (el) el.value = val; };
        const chk  = (id, val) => { const el = byId(id); if (el) el.checked = val; };
        set("localHashMB",        settings.localHashMB);
        set("localMoveOverhead",  settings.localMoveOverhead);
        set("localSkillLevel",    settings.localSkillLevel);
        set("localSkillLevelRange", settings.localSkillLevel);
        chk("localLimitStrength", settings.localLimitStrength);
        set("localElo",           settings.localElo);
        chk("localShowWDL",       settings.localShowWDL);
        set("localMinThinkingTime", settings.localMinThinkTime);
        set("localSlowMover",     settings.localSlowMover);
        set("localContempt",      settings.localContempt);
        // Show/hide elo row based on limit strength state
        const eloRow = byId("localEloRow");
        if (eloRow) eloRow.style.display = settings.localLimitStrength ? "flex" : "none";
    }

    function updateLocalSettingsUI() {
        const statusEl     = document.getElementById("localEngineStatus");
        const statusMsgEl  = document.getElementById("localEngineStatusMsg");
        const btnInstall   = document.getElementById("btnLocalInstall");
        const btnReinstall = document.getElementById("btnLocalReinstall");
        const btnUninstall = document.getElementById("btnLocalUninstall");
        if (!statusEl) return;

        const m = getEngineById(settings.localModelId || "sf18_05");

        // ── Status badge ──
        const statusMap = {
            not_installed: { text: "❌ Not Installed", color: "#ff5555" },
            loading:       { text: "⏳ Loading...",    color: "#ffaa00" },
            ready:         { text: "✅ Ready",          color: "#81b64c" },
            error:         { text: "⚠️ Error",          color: "#ff7777" },
        };
        const s = statusMap[state.engineStatus] || statusMap.not_installed;
        statusEl.textContent = s.text;
        statusEl.style.color = s.color;
        if (statusMsgEl) statusMsgEl.textContent = state.engineStatusMsg;

        const isLoading = state.engineStatus === "loading";
        const isReady   = state.engineStatus === "ready";
        if (btnInstall)   btnInstall.disabled   = isReady || isLoading;
        if (btnReinstall) btnReinstall.disabled  = isLoading;
        if (btnUninstall) btnUninstall.disabled  = !isReady && !isLoading;

        // ── Model caps → show/hide option rows ──
        const show = (id, visible) => {
            const el = document.getElementById(id);
            if (el) el.style.display = visible ? "" : "none";
        };
        show("rowMoveOverhead",  m.hasMoveOverhead);
        show("rowSkillLevel",    m.hasSkillLevel);
        show("rowLimitStrength", m.hasNNUE);
        show("rowWDL",           m.hasWDL);
        show("rowSlowMover",     m.hasSlowMover);
        show("rowContempt",      m.hasContempt);

        // ── Model info panel ──
        const infoEl = document.getElementById("localModelInfo");
        if (infoEl) {
            const fmtLabel = m.format === "asmjs" ? "asm.js — single JS file (no WASM)" : "WASM + JS (unpkg)";
            const caps = [
                m.hasNNUE         ? "NNUE" : "HCE (classical eval)",
                m.hasSkillLevel   ? "Skill Level" : null,
                m.hasNNUE         ? "Elo Limit" : null,
                m.hasWDL          ? "WDL" : null,
                m.hasContempt     ? "Contempt" : null,
                m.hasSlowMover    ? "Slow Mover" : null,
                m.hasMoveOverhead ? "Move Overhead" : null,
            ].filter(Boolean).join(" · ");
            infoEl.innerHTML =
                `<b>Format:</b> ${fmtLabel}<br>` +
                `<b>Max Depth:</b> ${m.maxDepth}<br>` +
                `<b>Options:</b> ${caps}<br>` +
                `<b>JS:</b> ${m.jsUrl || "(bundled @resource)"}<br>` +
                (m.wasmUrl ? `<b>WASM:</b> ${m.wasmUrl}` : "<b>WASM:</b> N/A");
        }

        // ── Source info box ──
        const srcEl = document.getElementById("localSrcInfo");
        if (srcEl) {
            srcEl.innerHTML =
                `<b>JS:</b> ${m.jsUrl || "(bundled @resource)"}<br>` +
                (m.wasmUrl ? `<b>WASM:</b> ${m.wasmUrl}` : "<b>WASM:</b> N/A — asm.js engine");
        }

        // ── Depth cap ──
        if (state.ui.inpDepth)    state.ui.inpDepth.max = m.maxDepth;
        if (state.ui.lblMaxDepth) state.ui.lblMaxDepth.innerText = m.maxDepth;
    }

    function createUI() {
        if (document.getElementById("enginePanel")) document.getElementById("enginePanel").remove();
        if (document.getElementById("modalOv")) document.getElementById("modalOv").remove();
        if (document.getElementById("histModalOv")) document.getElementById("histModalOv").remove();
        if (document.getElementById("localModalOv")) document.getElementById("localModalOv").remove();
        loadSettings();
        const initHsl = rgbToHsl(...Object.values(hexToRgb(settings.highlightColor)));
        state.h = initHsl.h; state.s = initHsl.s; state.l = initHsl.l;
        const savedW = GM_getValue("bot_panelW", "25vw");
        const savedH = GM_getValue("bot_panelH", "50vh");
        const isMini = GM_getValue("bot_isMini", false);
        const S  = "#enginePanel";
        const SM = "#modal";
        const SH = "#histModal";
        const SL = "#localModal";
        const SO = "#modalOv, #histModalOv, #localModalOv";

        // ─────────────────────────────────────────────────────────────────────
        // IMPROVED CSS — same variables/selectors, cleaner visual system
        // ─────────────────────────────────────────────────────────────────────
        const style = `
            /* ── CSS custom properties ── */
            ${S}  { --bot-bg:${settings.themeBg}; --bot-b:${settings.themeBorder}; --bot-p:${settings.themePrimary}; --bot-t:${settings.themeText}; --bot-primary:${settings.themePrimary}; }
            ${SM} { --bot-bg:${settings.themeBg}; --bot-b:${settings.themeBorder}; --bot-p:${settings.themePrimary}; --bot-t:${settings.themeText}; --bot-primary:${settings.themePrimary}; }
            ${SH} { --bot-bg:${settings.themeBg}; --bot-b:${settings.themeBorder}; --bot-p:${settings.themePrimary}; --bot-t:${settings.themeText}; --bot-primary:${settings.themePrimary}; }
            ${SL} { --bot-bg:${settings.themeBg}; --bot-b:${settings.themeBorder}; --bot-p:${settings.themePrimary}; --bot-t:${settings.themeText}; --bot-primary:${settings.themePrimary}; }
            ${S} *, ${SM} *, ${SH} *, ${SL} * { box-sizing: border-box; }

            /* ── Main panel ── */
            ${S} {
                position: fixed;
                width: ${savedW}; height: ${savedH};
                min-width: 300px; min-height: 300px;
                background: var(--bot-bg);
                border: 1px solid var(--bot-b);
                color: var(--bot-t);
                z-index: 9999;
                font-family: 'Segoe UI', system-ui, sans-serif;
                font-size: 13px;
                line-height: 1.4;
                box-shadow: -2px 0 20px rgba(0,0,0,0.6);
                display: flex;
                flex-direction: column;
                resize: both;
                overflow: hidden;
                opacity: ${settings.menuOpacity};
                border-radius: 6px;
            }

            /* ── Minified state ── */
            ${S}.minified {
                width: 36px !important; height: 36px !important;
                resize: none; min-height: 0 !important; min-width: 0 !important;
                overflow: hidden !important;
                background: var(--bot-p);
                border: 1px solid var(--bot-b);
                padding: 0;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                cursor: pointer;
                left: auto !important; top: 0 !important; right: 0 !important;
                border-radius: 6px;
            }
            ${S}.minified #panelContent,
            ${S}.minified #panelHeader > *:not(#minBtn) { display: none !important; }
            ${S}.minified #minBtn {
                width: 100% !important; height: 100% !important;
                display: flex !important; justify-content: center !important; align-items: center !important;
                padding: 0 !important; margin: 0 !important;
            }
            ${S}.minified #minBtn img { width: 26px !important; height: 26px !important; display: block; }

            /* ── Panel header ── */
            #panelHeader {
                background: var(--bot-p);
                color: #000;
                padding: 0 12px;
                font-weight: 700;
                font-size: 12px;
                letter-spacing: 0.05em;
                text-transform: uppercase;
                display: flex;
                justify-content: space-between;
                align-items: center;
                cursor: move;
                flex: none;
                user-select: none;
                height: 36px;
                flex-shrink: 0;
            }
            #panelHeader .header-left {
                display: flex;
                align-items: center;
                gap: 6px;
            }
            #minBtn {
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                width: 22px;
                height: 22px;
                background: rgba(0,0,0,0.15);
                border-radius: 4px;
                font-size: 11px;
                transition: background 0.15s;
            }
            #minBtn:hover { background: rgba(0,0,0,0.28); }

            /* ── Panel content ── */
            #panelContent {
                padding: 12px;
                display: flex;
                flex-direction: column;
                gap: 10px;
                overflow-y: auto;
                flex: 1;
                min-height: 0;
            }

            /* ── Sections ── */
            ${S} .sect, ${SM} .sect, ${SL} .sect {
                border-top: 1px solid var(--bot-b);
                padding-top: 10px;
                display: flex;
                flex-direction: column;
                gap: 7px;
            }
            ${S} .sect-title, ${SM} .sect-title, ${SL} .sect-title {
                font-size: 0.7em;
                color: #888;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.08em;
                margin-bottom: 2px;
            }

            /* ── Rows ── */
            ${S} .row, ${SM} .row, ${SL} .row {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 8px;
                margin-bottom: 2px;
            }
            ${S} .row label, ${SM} .row label, ${SL} .row label {
                font-size: 0.85em;
                color: var(--bot-t);
                opacity: 0.85;
                font-weight: 500;
            }

            /* ── Inputs ── */
            ${S} input, ${S} select,
            ${SM} input, ${SM} select,
            ${SH} input, ${SH} select,
            ${SL} input, ${SL} select {
                background: rgba(255,255,255,0.06);
                color: var(--bot-t);
                border: 1px solid var(--bot-b);
                padding: 4px 7px;
                border-radius: 4px;
                font-size: 12px;
                height: 26px;
                transition: border-color 0.15s;
            }
            ${S} select, ${SM} select, ${SH} select, ${SL} select {
                background-color: #2a2a2a;
            }
            ${S} select option, ${SM} select option, ${SH} select option, ${SL} select option {
                background-color: #2a2a2a;
                color: #eeeeee;
            }
            ${S} input:focus, ${S} select:focus,
            ${SM} input:focus, ${SM} select:focus,
            ${SL} input:focus, ${SL} select:focus {
                outline: none;
                border-color: var(--bot-p);
            }
            ${S} input[type="number"], ${SM} input[type="number"], ${SH} input[type="number"], ${SL} input[type="number"] { width: 60px; text-align: center; }
            ${S} select, ${SM} select, ${SH} select, ${SL} select { width: 120px; }
            ${S} input[type="text"], ${SM} input[type="text"], ${SL} input[type="text"] { flex: 1; }

            /* ── Checkboxes ── */
            ${S} input[type="checkbox"], ${SM} input[type="checkbox"], ${SL} input[type="checkbox"] {
                width: 15px; height: 15px;
                accent-color: var(--bot-p);
                cursor: pointer;
                border: none;
                background: transparent;
            }

            /* ── Range sliders ── */
            ${S} input[type=range], ${SM} input[type=range] {
                -webkit-appearance: none;
                width: 100%;
                background: transparent;
                padding: 0; margin: 0;
                border: none;
                height: 18px;
            }
            ${S} input[type=range]:focus, ${SM} input[type=range]:focus { outline: none; }
            ${S} input[type=range]::-webkit-slider-runnable-track,
            ${SM} input[type=range]::-webkit-slider-runnable-track {
                width: 100%; height: 4px; cursor: pointer;
                background: var(--bot-b); border-radius: 2px;
            }
            ${S} input[type=range]::-webkit-slider-thumb,
            ${SM} input[type=range]::-webkit-slider-thumb {
                height: 14px; width: 14px; border-radius: 50%;
                background: var(--bot-p); cursor: pointer;
                -webkit-appearance: none; margin-top: -5px;
                border: 2px solid rgba(0,0,0,0.2);
                box-shadow: 0 1px 3px rgba(0,0,0,0.4);
                transition: transform 0.1s;
            }
            ${S} input[type=range]::-webkit-slider-thumb:hover,
            ${SM} input[type=range]::-webkit-slider-thumb:hover { transform: scale(1.15); }
            #sliderH { background: linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00) !important; }
            #sliderH::-webkit-slider-thumb { background: #fff !important; border: 2px solid #000 !important; }

            /* ── Buttons ── */
            ${S} button, ${SM} button, ${SH} button, ${SL} button {
                background: var(--bot-p);
                border: none;
                padding: 0 12px;
                height: 30px;
                color: #000;
                font-weight: 700;
                font-size: 12px;
                cursor: pointer;
                border-radius: 4px;
                transition: filter 0.15s, transform 0.1s;
                letter-spacing: 0.02em;
                white-space: nowrap;
            }
            ${S} button:hover, ${SM} button:hover, ${SH} button:hover, ${SL} button:hover {
                filter: brightness(1.12);
            }
            ${S} button:active, ${SM} button:active { transform: scale(0.97); }
            ${S} button:disabled, ${SM} button:disabled, ${SL} button:disabled {
                opacity: 0.45; cursor: not-allowed; filter: none; transform: none;
            }

            /* ── Specific named buttons ── */
            #btnReset {
                padding: 0 8px;
                height: 24px;
                font-size: 11px;
                background: rgba(0,0,0,0.18) !important;
                color: rgba(0,0,0,0.8) !important;
                border-radius: 3px;
            }
            #custBtn  { background: #4fc3f7 !important; color: #000 !important; }
            #histBtn  { background: #b39ddb !important; color: #000 !important; }
            #localBtn { background: #ffcc80 !important; color: #000 !important; }
            #btnAnalyze {
                width: 100%;
                height: 34px;
                font-size: 13px;
                letter-spacing: 0.04em;
            }
            #custBtn, #histBtn, #localBtn { width: 100%; }

            /* ── Utility button row ── */
            .btn-row {
                display: flex;
                flex-direction: column;
                gap: 6px;
            }

            /* ── Log boxes ── */
            .log-box {
                background: rgba(0,0,0,0.4);
                padding: 7px 9px;
                font-family: 'Cascadia Code', 'Fira Mono', monospace;
                font-size: 0.72em;
                border-radius: 4px;
                overflow-y: auto;
                word-break: break-all;
                white-space: pre-wrap;
                border: 1px solid var(--bot-b);
                height: 90px;
                resize: vertical;
                user-select: text !important;
                -webkit-user-select: text !important;
                cursor: text;
                color: #ccc;
            }

            /* ── Status box ── */
            #statusBox {
                background: rgba(0,0,0,0.18);
                padding: 8px 10px;
                border: 1px solid rgba(0,188,212,0.35);
                border-radius: 5px;
                font-size: 0.88em;
                min-height: 42px;
                width: 100%;
                flex-shrink: 0;
                display: flex;
                flex-direction: column;
                gap: 4px;
            }

            /* ── Move result ── */
            #moveResult {
                background: rgba(0,0,0,0.18);
                padding: 5px 10px;
                border-radius: 4px;
                text-align: center;
                font-size: 0.88em;
                border: 1px solid var(--bot-b);
            }

            /* ── Delay display ── */
            #delayDisplay {
                font-size: 0.7em;
                color: #666;
                text-align: right;
                margin-top: -4px;
            }

            /* ── Overlays ── */
            ${SO} {
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0,0,0,0.75);
                z-index: 10000;
                display: none;
                justify-content: center;
                align-items: center;
                backdrop-filter: blur(2px);
            }

            /* ── Modals ── */
            ${SM}, ${SH}, ${SL} {
                background: var(--bot-bg);
                padding: 0;
                border-radius: 8px;
                width: 480px;
                border: 1px solid var(--bot-b);
                display: flex;
                flex-direction: column;
                max-height: 90vh;
                opacity: ${settings.menuOpacity};
                box-shadow: 0 8px 32px rgba(0,0,0,0.5);
            }
            ${SH} { width: 600px; height: 600px; }
            ${SM} *, ${SH} *, ${SL} * { color: var(--bot-t); }
            ${SM} label, ${SH} label, ${SL} label { opacity: 1 !important; font-weight: 600; font-size: 0.88em; }
            ${SM} input[type="color"], ${SH} input[type="color"] { height: 26px; padding: 0; width: 40px; cursor: pointer; border: none; }
            ${SM} select, ${SH} select, ${SL} select { height: 26px; padding: 0 6px; font-size: 0.88em; }

            /* ── Mode-dependent cloud rows ── */
            ${S} .show-cloud { display: none; }
            ${S} .show-local { display: none; }
            body.mode-cloud ${S} .show-cloud { display: flex; }
            body.mode-local ${S} .show-local { display: flex; }

            /* ── RGB inputs ── */
            ${SM} .rgb-inputs, ${S} .rgb-inputs { display: flex; gap: 5px; flex: 1; justify-content: flex-end; }
            ${SM} .rgb-inputs input, ${S} .rgb-inputs input { width: 46px; text-align: center; }

            /* ── Modal header ── */
            .modal-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 14px 16px;
                border-bottom: 1px solid var(--bot-b);
            }
            .modal-header h3 { margin: 0; font-size: 14px; font-weight: 700; letter-spacing: 0.03em; }
            .modal-header button {
                padding: 0 !important;
                width: 26px; height: 26px;
                background: rgba(255,255,255,0.08) !important;
                color: var(--bot-t) !important;
                border-radius: 4px;
                font-size: 16px;
                line-height: 1;
            }
            .modal-header button:hover { background: rgba(255,255,255,0.16) !important; }

            /* ── Modal tabs ── */
            .modal-tabs { display: flex; border-bottom: 1px solid var(--bot-b); }
            ${SM} .tab-btn {
                flex: 1;
                background: transparent !important;
                border: none !important;
                border-bottom: 2px solid transparent !important;
                padding: 10px;
                color: var(--bot-t) !important;
                cursor: pointer;
                opacity: 0.55;
                font-size: 12px;
                font-weight: 600;
                letter-spacing: 0.03em;
                transition: opacity 0.15s;
                height: auto;
            }
            ${SM} .tab-btn:hover { opacity: 0.85; }
            ${SM} .tab-btn.active { opacity: 1; border-bottom: 2px solid var(--bot-p) !important; }

            /* ── Modal content ── */
            .modal-content { padding: 14px 16px; overflow-y: auto; flex: 1; }
            ${SM} .modal-content .row, ${SH} .modal-content .row { display: flex; align-items: center; margin-bottom: 11px; }
            ${SM} .modal-content .row label, ${SH} .modal-content .row label { flex: 0 0 128px; text-align: left; font-weight: 600; }
            ${SM} .modal-content .row > input[type="text"],
            ${SM} .modal-content .row > input[type="color"],
            ${SM} .modal-content .row > select,
            ${SH} .modal-content .row > input[type="text"],
            ${SH} .modal-content .row > input[type="color"],
            ${SH} .modal-content .row > select { flex: 1; }

            /* ── Humanization modal specifics ── */
            #histModal .sect-note {
                font-size: 0.74em;
                color: #888;
                opacity: 0.95;
            }
            #histModal .hum-preview {
                font-family: 'Cascadia Code', 'Fira Mono', monospace;
                font-size: 0.74em;
                color: var(--bot-t);
                opacity: 0.75;
                border: 1px solid var(--bot-b);
                border-radius: 4px;
                padding: 8px;
                background: rgba(0,0,0,0.18);
                line-height: 1.5;
            }

            /* ── Slider groups ── */
            ${S} .slider-group, ${SM} .slider-group {
                display: flex; align-items: center; gap: 7px; flex: 1; justify-content: flex-end;
            }
            ${S} .slider-group input[type=range], ${SM} .slider-group input[type=range] { flex: 1; }
            ${S} .slider-group input[type=number], ${SM} .slider-group input[type=number] { width: 46px; text-align: center; }
            ${S} .slider-group span, ${SM} .slider-group span { font-size: 0.78em; color: #777; min-width: 14px; }

            /* ── Advanced toggles ── */
            .adv-toggle {
                cursor: pointer;
                font-size: 0.78em;
                color: var(--bot-p);
                text-decoration: none;
                margin-top: 4px;
                display: inline-flex;
                align-items: center;
                gap: 4px;
                opacity: 0.85;
                transition: opacity 0.15s;
            }
            .adv-toggle:hover { opacity: 1; }
            .adv-sect {
                margin-top: 8px;
                padding-left: 10px;
                border-left: 2px solid var(--bot-b);
                display: flex;
                flex-direction: column;
                gap: 7px;
            }

            /* ── Theme presets ── */
            .theme-presets { display: flex; gap: 8px; margin-bottom: 12px; }
            ${SM} .theme-btn {
                flex: 1;
                padding: 0 !important;
                height: 30px !important;
                border: 1px solid var(--bot-b) !important;
                background: rgba(255,255,255,0.05) !important;
                color: var(--bot-t) !important;
                font-size: 12px !important;
            }

            /* ── Local modal specifics ── */
            #localEngineStatus { font-weight: 700; font-size: 1em; }
            #localEngineStatusMsg { font-size: 0.78em; color: #888; margin-top: 3px; min-height: 14px; }
            .local-action-btn { padding: 0 14px !important; font-size: 0.83em !important; height: 30px !important; }
            .local-btn-install   { background: #27ae60 !important; color: #fff !important; }
            .local-btn-reinstall { background: #2980b9 !important; color: #fff !important; }
            .local-btn-uninstall { background: #c0392b !important; color: #fff !important; }
            ${SL} .info-box {
                background: rgba(0,0,0,0.25);
                border: 1px solid var(--bot-b);
                border-radius: 4px;
                padding: 7px 10px;
                font-size: 0.78em;
                font-family: 'Cascadia Code', 'Fira Mono', monospace;
                color: #999;
                word-break: break-all;
            }
            ${SL} input[type="text"] { width: 100%; font-size: 0.83em; }
            ${SL} select { width: 100%; }

            /* ── Automation checkboxes layout ── */
            .auto-checks {
                display: flex;
                gap: 14px;
                flex-wrap: wrap;
            }
            .auto-checks label {
                display: flex;
                align-items: center;
                gap: 5px;
                font-size: 0.83em;
                cursor: pointer;
                white-space: nowrap;
            }

            /* ── PV section header ── */
            .pv-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                width: 100%;
            }
        `;

        const fullHTML = `<style>${style}</style>` + `
            <div id="enginePanel" class="${isMini ? "minified" : ""}">
                <div id="panelHeader">
                    <div class="header-left">
                        <span>SF Engine</span>
                        <span id="minBtn">${isMini ? `<img src="${STOCKFISH_ICON}">` : "▼"}</span>
                    </div>
                    <button id="btnReset">Reset Defaults</button>
                </div>
                <div id="panelContent">
                    <div id="statusBox">${state.lastLiveResult}</div>
                    <div id="moveResult">${state.lastMoveResult}</div>

                    <div class="sect">
                        <div class="sect-title">Engine</div>
                        <div class="row">
                            <label>Model</label>
                            <select id="selMode" style="width:200px;">
                                <option value="cloud">SF 18.0.0 — Cloud (fast)</option>
                                <option value="sfonline">SF 17.1.0 — Cloud (variable)</option>
                                <option value="local">SF — Local (offline)</option>
                            </select>
                        </div>
                        <div class="row">
                            <label>Depth <span style="color:#666;">(max <span id="lblMaxDepth">18</span>)</span></label>
                            <input type="number" id="inpDepth" min="1" max="18" value="${settings.depth}">
                        </div>
                        <div id="depthHumanizedDisplay" style="font-size:0.7em; color:#666; text-align:right; margin-top:-7px;">Effective depth: ${settings.depth}</div>
                        <div class="row show-cloud">
                            <label>Max Time (ms)</label>
                            <input type="number" id="inpTime" value="${settings.maxThinkingTime}">
                        </div>
                        <div class="row show-cloud">
                            <label>Search Moves</label>
                            <input type="text" id="inpSearch" value="${settings.searchMoves}" placeholder="e.g. e2e4 d2d4">
                        </div>
                    </div>

                    <div class="sect">
                        <div class="pv-header">
                            <div class="sect-title" style="margin:0;">PV Arrows</div>
                            <input type="checkbox" id="chkPV" ${settings.showPVArrows ? "checked" : ""}>
                        </div>
                        <div id="pvSettings" style="display:none; display:flex; flex-direction:column; gap:7px;">
                            <div class="row">
                                <label>Depth (1–45)</label>
                                <div class="slider-group">
                                    <input type="range" id="inpPVDepth" min="1" max="45" step="1" value="${settings.pvDepth}">
                                    <input type="number" id="inpPVDepthNum" min="1" max="45" value="${settings.pvDepth}">
                                </div>
                            </div>
                            <div class="row">
                                <label>Show Numbers</label>
                                <input type="checkbox" id="chkPVNums" ${settings.pvShowNumbers ? "checked" : ""}>
                            </div>
                            <div class="row">
                                <label>Custom Gradient</label>
                                <input type="checkbox" id="chkPVGrad" ${settings.pvCustomGradient ? "checked" : ""}>
                            </div>
                            <div id="pvGradSettings" style="display:none; padding-left:10px; border-left:2px solid #333; margin-top:3px; display:flex; flex-direction:column; gap:6px;">
                                <div class="row"><label>Start Color</label><input type="color" id="inpPVStart" value="${settings.pvStartColor}"></div>
                                <div class="row"><label>End Color</label><input type="color" id="inpPVEnd" value="${settings.pvEndColor}"></div>
                            </div>
                        </div>
                    </div>

                    <div class="sect">
                        <div class="sect-title">Automation</div>
                        <div class="auto-checks">
                            <label><input type="checkbox" id="chkRun" ${settings.autoRun ? "checked" : ""}> Auto-Analyze</label>
                            <label><input type="checkbox" id="chkMove" ${settings.autoMove ? "checked" : ""}> Auto-Move</label>
                            <label><input type="checkbox" id="chkQueue" ${settings.autoQueue ? "checked" : ""}> Auto-Queue</label>
                        </div>

                        <div class="row" id="rowMoveKeybind" style="display:${settings.autoMove ? 'none' : 'flex'}; margin-top:4px;">
                            <label>Move Keybind</label>
                            <button id="btnMoveKeybind" style="width:80px; background:rgba(255,255,255,0.1) !important; color:var(--bot-t) !important;">${settings.moveKeybind || "None"}</button>
                        </div>

                        <div class="row" style="margin-top:4px;">
                            <label>Randomized Delay (s)</label>
                            <div style="display:flex; align-items:center; gap:6px;">
                                <input type="number" id="inpMin" style="width:52px;" value="${settings.minDelay}">
                                <span style="color:#555; font-size:0.8em;">to</span>
                                <input type="number" id="inpMax" style="width:52px;" value="${settings.maxDelay}">
                            </div>
                        </div>
                        <div id="delayDisplay">Next: N/A</div>
                        <div id="delayHumanizedDisplay" style="font-size:0.7em; color:#666; text-align:right; margin-top:-2px;">Effective range: ${settings.minDelay}s - ${settings.maxDelay}s</div>
                    </div>

                    <div class="btn-row">
                        <button id="btnAnalyze">▶ Analyze</button>
                        <button id="custBtn">🎨 Visuals &amp; Theme</button>
                        <button id="histBtn">🧠 Humanization</button>
                        <button id="localBtn">⚙ Local Engine Settings</button>
                    </div>

                    <div class="sect">
                        <div class="row">
                            <label style="cursor:pointer; display:flex; align-items:center; gap:5px;">
                                <input type="checkbox" id="chkDebug" ${settings.debugLogs ? "checked" : ""}> Debug Logs
                            </label>
                        </div>
                        <div id="debugArea" style="display:${settings.debugLogs ? "flex" : "none"}; flex-direction:column; gap:5px;">
                            <div class="log-box" id="sentCommandOutput"></div>
                            <div class="log-box" id="receivedMessageOutput"></div>
                        </div>
                    </div>
                </div>
            </div>

            <div id="modalOv">
                <div id="modal">
                    <div class="modal-header">
                        <h3 style="color:var(--bot-p);">Visuals &amp; Theme</h3>
                        <button id="modalClose">×</button>
                    </div>
                    <div class="modal-tabs">
                        <button class="tab-btn active" id="tabMove">Move Display</button>
                        <button class="tab-btn" id="tabTheme">Menu Theme</button>
                    </div>
                    <div class="modal-content" id="tabContentMove">
                        <div class="sect" style="border:none; padding:0;">
                            <div class="row">
                                <label>Visual Type</label>
                                <select id="visType" style="width:120px; height:26px;">
                                    <option value="boxes">Boxes</option>
                                    <option value="arrow">Arrow</option>
                                    <option value="outline">Outline</option>
                                    <option value="nativeArrow">Chess.com's Arrow</option>
                                </select>
                            </div>
                            <div class="row" id="rowDuration">
                                <label>Display Duration</label>
                                <div class="slider-group">
                                    <input type="range" id="visDuration" min="0" max="100" step="1" value="100">
                                    <span id="visDurationText" style="width:52px; text-align:right; font-size:0.85em; font-family:monospace;">Forever</span>
                                </div>
                            </div>
                            <div class="row" id="rowFadeOut" style="display:none;">
                                <label>Fade Out</label>
                                <input type="checkbox" id="chkFadeOut">
                            </div>
                            <div class="row">
                                <label>Hide After Move</label>
                                <input type="checkbox" id="chkHideAfterMove" ${settings.hideAfterMove ? "checked" : ""}>
                            </div>
                        </div>

                        <div class="sect" id="sectHighlightColor">
                            <div class="sect-title">Highlight Color</div>
                            <div style="display:flex; flex-direction:column; gap:9px;">
                                <div class="row">
                                    <div id="colorPreview" style="width:32px; height:32px; border-radius:50%; border:2px solid #555; background:${settings.highlightColor}; flex:0 0 32px;"></div>
                                    <div class="rgb-inputs">
                                        <input type="number" id="inpR" min="0" max="255" placeholder="R">
                                        <input type="number" id="inpG" min="0" max="255" placeholder="G">
                                        <input type="number" id="inpB" min="0" max="255" placeholder="B">
                                    </div>
                                </div>
                                <div class="row"><label>Hue</label><div class="slider-group"><input type="range" id="sliderH" min="0" max="360" value="${state.h}"><input type="number" id="sliderHNum" min="0" max="360" value="${Math.round(state.h)}"></div></div>
                                <div class="row"><label>Saturation</label><div class="slider-group"><input type="range" id="sliderS" min="0" max="100" value="${state.s}"><input type="number" id="sliderSNum" min="0" max="100" value="${Math.round(state.s)}"><span>%</span></div></div>
                                <div class="row"><label>Brightness</label><div class="slider-group"><input type="range" id="sliderL" min="0" max="100" value="${state.l}"><input type="number" id="sliderLNum" min="0" max="100" value="${Math.round(state.l)}"><span>%</span></div></div>
                                <div class="row"><label>Hex</label><input type="text" id="inpHex" style="text-transform:uppercase; text-align:center; font-family:monospace;"></div>
                            </div>
                        </div>

                        <div class="sect" id="sectAdvancedVis">
                            <div class="adv-toggle" id="advToggle">▼ Advanced Visual Settings</div>
                            <div class="adv-sect" id="advSect" style="display:none;">
                                <div id="visBoxSettings">
                                    <div class="row"><label>Inner Opacity</label><div class="slider-group"><input type="range" id="visInnerOp" min="0" max="1" step="0.01" value="${settings.innerOpacity}"><input type="number" id="visInnerOpNum" min="0" max="100" value="${Math.round(settings.innerOpacity*100)}"><span>%</span></div></div>
                                    <div class="row"><label>Outer Opacity</label><div class="slider-group"><input type="range" id="visOuterOp" min="0" max="1" step="0.01" value="${settings.outerOpacity}"><input type="number" id="visOuterOpNum" min="0" max="100" value="${Math.round(settings.outerOpacity*100)}"><span>%</span></div></div>
                                    <div class="row"><label>Gradient Bias</label><div class="slider-group"><input type="range" id="visBias" min="0" max="100" step="1" value="${settings.gradientBias}"><input type="number" id="visBiasNum" min="0" max="100" value="${settings.gradientBias}"><span>%</span></div></div>
                                </div>
                                <div id="visArrowSettings" style="display:none;">
                                    <div class="row"><label>Arrow Opacity</label><div class="slider-group"><input type="range" id="visArrowOp" min="0" max="1" step="0.01" value="${settings.arrowOpacity}"><input type="number" id="visArrowOpNum" min="0" max="100" value="${Math.round(settings.arrowOpacity*100)}"><span>%</span></div></div>
                                    <div class="row"><label>Arrow Width</label><div class="slider-group"><input type="range" id="visArrowWidth" min="5" max="50" step="1" value="${settings.arrowWidth}"><input type="number" id="visArrowWidthNum" min="5" max="50" value="${settings.arrowWidth}"><span>px</span></div></div>
                                </div>
                                <div id="visOutlineSettings" style="display:none;">
                                    <div class="row"><label>Line Opacity</label><div class="slider-group"><input type="range" id="visOutOp" min="0" max="1" step="0.01" value="${settings.visualOutlineOpacity}"><input type="number" id="visOutOpNum" min="0" max="100" value="${Math.round(settings.visualOutlineOpacity*100)}"><span>%</span></div></div>
                                    <div class="row"><label>Line Width</label><div class="slider-group"><input type="range" id="visOutWidth" min="1" max="10" step="1" value="${settings.visualOutlineWidth}"><input type="number" id="visOutWidthNum" min="1" max="10" value="${settings.visualOutlineWidth}"><span>px</span></div></div>
                                    <div class="row"><label>Glow Effect</label><input type="checkbox" id="visOutGlow" ${settings.visualOutlineGlow ? "checked" : ""}></div>
                                    <div class="row"><label>Glow Radius</label><div class="slider-group"><input type="range" id="visOutGlowRad" min="1" max="50" step="1" value="${settings.visualOutlineGlowRadius}"><input type="number" id="visOutGlowRadNum" min="1" max="50" value="${settings.visualOutlineGlowRadius}"><span>px</span></div></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="modal-content" id="tabContentTheme" style="display:none;">
                        <div class="theme-presets">
                            <button class="theme-btn" id="btnThemeDark">🌙 Dark</button>
                            <button class="theme-btn" id="btnThemeLight">☀ Light</button>
                        </div>
                        <div class="sect" style="border:none; padding:0; gap:10px;">
                            <div class="sect-title">Menu Position</div>
                            <div class="row">
                                <label>Panel Position</label>
                                <select id="selMenuPos">
                                    <option value="custom">Custom (Drag)</option>
                                    <option value="top-left">Top Left</option>
                                    <option value="top-right">Top Right</option>
                                    <option value="bottom-left">Bottom Left</option>
                                    <option value="bottom-right">Bottom Right</option>
                                </select>
                            </div>
                        </div>
                        <div class="sect">
                            <div class="sect-title">Opacity</div>
                            <div class="row">
                                <label>Menu Opacity</label>
                                <div class="slider-group">
                                    <input type="range" id="inpMenuOp" min="0.1" max="1" step="0.01" value="${settings.menuOpacity}">
                                    <input type="number" id="inpMenuOpNum" min="10" max="100" value="${Math.round(settings.menuOpacity*100)}">
                                    <span>%</span>
                                </div>
                            </div>
                        </div>
                        <div class="sect">
                            <div class="sect-title">Custom Colors</div>
                            <div class="row"><label>Background</label><input type="color" id="colBg" value="${settings.themeBg}"></div>
                            <div class="row"><label>Text</label><input type="color" id="colTxt" value="${settings.themeText}"></div>
                            <div class="row"><label>Border</label><input type="color" id="colBorder" value="${settings.themeBorder}"></div>
                            <div class="row"><label>Accent / Primary</label><input type="color" id="colPrim" value="${settings.themePrimary}"></div>
                        </div>
                    </div>
                </div>
            </div>

            <div id="histModalOv">
                <div id="histModal">
                    <div class="modal-header">
                        <h3 style="color:var(--bot-p);">Humanization</h3>
                        <button id="histModalClose">×</button>
                    </div>
                    <div class="modal-content" style="display:flex; flex-direction:column; gap:10px;">
                        <div class="sect">
                            <div class="row">
                                <label>Enable Humanization</label>
                                <input type="checkbox" id="chkHumanEnabled" ${settings.humanizationEnabled ? "checked" : ""}>
                            </div>
                            <div class="sect-note">Off by default. When enabled, it dynamically changes delay, depth, and occasionally uses a shallower move to avoid always playing top-engine choices.</div>
                        </div>
                        <div class="sect">
                            <div class="row">
                                <label>Play Style</label>
                                <select id="humProfile">
                                    <option value="balanced"${settings.humProfile==="balanced"?" selected":""}>Balanced (recommended)</option>
                                    <option value="cautious"${settings.humProfile==="cautious"?" selected":""}>Cautious</option>
                                    <option value="chaotic"${settings.humProfile==="chaotic"?" selected":""}>Chaotic</option>
                                    <option value="blitz"${settings.humProfile==="blitz"?" selected":""}>Blitz/Fast</option>
                                </select>
                            </div>
                            <div class="row"><label>Move Quality</label><input type="range" id="humMoveQuality" min="30" max="100" value="${settings.humMoveQuality || 88}"></div>
                            <div class="sect-note">Higher = stronger moves. Lower = more human inaccuracies and occasional shallower-choice moves.</div>
                            <div class="row"><label>Adaptive Timing</label><input type="range" id="humAdaptiveTiming" min="0" max="100" value="${settings.humAdaptiveTiming || 65}"></div>
                            <div class="sect-note">How much think time changes with position complexity.</div>
                        </div>
                        <div class="sect">
                            <div class="row"><label>Complexity Response</label><input type="range" id="humComplexitySense" min="0" max="100" value="${settings.humComplexitySense || 60}"></div>
                            <div class="sect-note">Higher = bigger depth/time changes in tactical positions.</div>
                            <div class="row"><label>Time Pressure Response</label><input type="range" id="humTimePressureSense" min="0" max="100" value="${settings.humTimePressureSense || 70}"></div>
                            <div class="sect-note">Higher = faster and shallower decisions when your clock is low.</div>
                            <div class="row"><label>Variance</label><input type="range" id="humVariance" min="0" max="100" value="${settings.humVariance || 30}"></div>
                            <div class="sect-note">Adds natural inconsistency so moves and timing are less robotic.</div>
                        </div>
                        <div id="humPreview" class="hum-preview">Preview: Humanization disabled.</div>
                    </div>
                </div>
            </div>

            <div id="localModalOv">
                <div id="localModal">
                    <div class="modal-header">
                        <h3 style="color:#e67e22;">Local Engine Settings</h3>
                        <button id="localModalClose">×</button>
                    </div>
                    <div class="modal-content" style="display:flex; flex-direction:column; gap:0;">

                        <!-- Model selector -->
                        <div class="sect" style="border:none; padding:10px 0 0 0;">
                            <div class="sect-title">Engine Model</div>
                            <select id="localModelSel" style="width:100%; height:28px; font-size:0.88em;">
                                ${LOCAL_ENGINES.map(e => `<option value="${e.id}"${(settings.localModelId||"sf18_05")===e.id?" selected":""}>${e.label}</option>`).join("")}
                            </select>
                            <div id="localModelInfo" style="margin-top:6px; font-size:0.71em; color:#888; font-family:monospace; word-break:break-all; background:rgba(0,0,0,0.18); border:1px solid var(--bot-b); border-radius:4px; padding:5px 8px; line-height:1.6;"></div>
                        </div>

                        <!-- Status + actions -->
                        <div class="sect">
                            <div class="sect-title">Status</div>
                            <div id="localEngineStatus">❌ Not Installed</div>
                            <div id="localEngineStatusMsg"></div>
                            <div style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap;">
                                <button id="btnLocalInstall"   class="local-action-btn local-btn-install">Install / Load</button>
                                <button id="btnLocalReinstall" class="local-action-btn local-btn-reinstall">Reinstall</button>
                                <button id="btnLocalUninstall" class="local-action-btn local-btn-uninstall">Uninstall</button>
                            </div>
                            <div style="font-size:0.7em; color:#666; margin-top:6px;">Each model is cached separately. Switching models requires Install / Load.</div>
                        </div>

                        <!-- Engine options — rows shown/hidden by model caps -->
                        <div class="sect">
                            <div class="sect-title">Engine Options</div>

                            <div class="row" id="rowHash">
                                <label>Hash Size (MB)</label>
                                <input type="number" id="localHashMB" min="1" max="2048" value="${settings.localHashMB}" style="width:70px;">
                            </div>

                            <div class="row" id="rowMoveOverhead">
                                <label>Move Overhead (ms)</label>
                                <input type="number" id="localMoveOverhead" min="0" max="5000" value="${settings.localMoveOverhead}" style="width:70px;">
                            </div>

                            <div id="rowSkillLevel" style="display:flex; flex-direction:column; gap:5px; margin-bottom:2px;">
                                <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                                    <label>Skill Level (0–20)</label>
                                    <input type="number" id="localSkillLevel" min="0" max="20" value="${settings.localSkillLevel}" style="width:55px;">
                                </div>
                                <input type="range" id="localSkillLevelRange" min="0" max="20" step="1" value="${settings.localSkillLevel}" style="width:100%; margin:0;">
                                <div style="font-size:0.72em; color:#666;">20 = full strength. Lower values intentionally weaken play.</div>
                            </div>

                            <div id="rowLimitStrength">
                                <div class="row" style="margin-top:4px;">
                                    <label>Limit to Elo</label>
                                    <input type="checkbox" id="localLimitStrength" ${settings.localLimitStrength ? "checked" : ""}>
                                </div>
                                <div class="row" id="localEloRow" style="${settings.localLimitStrength ? "" : "display:none;"}">
                                    <label>Target Elo (1320–3190)</label>
                                    <input type="number" id="localElo" min="1320" max="3190" value="${settings.localElo}" style="width:70px;">
                                </div>
                                <div style="font-size:0.72em; color:#666; margin-top:2px;">Elo limit overrides Skill Level when enabled.</div>
                            </div>
                        </div>

                        <div class="sect">
                            <div class="adv-toggle" id="localAdvToggle">▼ Advanced Options</div>
                            <div id="localAdvSect" style="display:none; flex-direction:column; gap:9px;">

                                <div id="rowWDL">
                                    <div class="row" style="margin-top:6px;">
                                        <label>Show WDL in output</label>
                                        <input type="checkbox" id="localShowWDL" ${settings.localShowWDL ? "checked" : ""}>
                                    </div>
                                    <div style="font-size:0.72em; color:#666;">Adds win/draw/loss % to each info line in debug logs.</div>
                                </div>

                                <div class="row">
                                    <label>Min Thinking Time (ms)</label>
                                    <input type="number" id="localMinThinkingTime" min="0" max="5000" value="${settings.localMinThinkTime}" style="width:70px;">
                                </div>
                                <div style="font-size:0.72em; color:#666;">Minimum ms engine spends per move regardless of time control.</div>

                                <div id="rowSlowMover">
                                    <div class="row">
                                        <label>Slow Mover (10–1000)</label>
                                        <input type="number" id="localSlowMover" min="10" max="1000" value="${settings.localSlowMover}" style="width:70px;">
                                    </div>
                                    <div style="font-size:0.72em; color:#666;">Lower = faster moves. Default 100.</div>
                                </div>

                                <div id="rowContempt">
                                    <div class="row">
                                        <label>Contempt (-100–100)</label>
                                        <input type="number" id="localContempt" min="-100" max="100" value="${settings.localContempt}" style="width:70px;">
                                    </div>
                                    <div style="font-size:0.72em; color:#666;">How much the engine avoids draws. 0 = neutral, higher = more aggressive. (SF 9–11 only)</div>
                                </div>
                            </div>
                        </div>

                        <!-- Source info — populated dynamically -->
                        <div class="sect">
                            <div class="sect-title">Source URLs</div>
                            <div class="info-box" id="localSrcInfo" style="font-size:0.71em; line-height:1.7;"></div>
                        </div>

                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML("beforeend", fullHTML);
        const panel = document.getElementById("enginePanel");
        const computed = window.getComputedStyle(panel);
        panel.style.width = computed.width;
        if (!isMini) panel.style.height = computed.height;
        state.ui = {
            panel: panel,
            header: document.getElementById("panelHeader"),
            minBtn: document.getElementById("minBtn"),
            moveResult: document.getElementById("moveResult"),
            liveOutput: document.getElementById("statusBox"),
            logSent: document.getElementById("sentCommandOutput"),
            logRec: document.getElementById("receivedMessageOutput"),
            delayDisplay: document.getElementById("delayDisplay"),
            btnAnalyze: document.getElementById("btnAnalyze"),
            selMode: document.getElementById("selMode"),
            inpDepth: document.getElementById("inpDepth"),
            inpTime: document.getElementById("inpTime"),
            inpSearch: document.getElementById("inpSearch"),
            chkRun: document.getElementById("chkRun"),
            chkMove: document.getElementById("chkMove"),
            chkQueue: document.getElementById("chkQueue"),
            rowMoveKeybind: document.getElementById("rowMoveKeybind"),
            btnMoveKeybind: document.getElementById("btnMoveKeybind"),
            chkHideAfterMove: document.getElementById("chkHideAfterMove"),
            chkPV: document.getElementById("chkPV"),
            inpPVDepth: document.getElementById("inpPVDepth"),
            inpPVDepthNum: document.getElementById("inpPVDepthNum"),
            chkPVNums: document.getElementById("chkPVNums"),
            chkPVGrad: document.getElementById("chkPVGrad"),
            inpPVStart: document.getElementById("inpPVStart"),
            inpPVEnd: document.getElementById("inpPVEnd"),
            pvSettings: document.getElementById("pvSettings"),
            pvGradSettings: document.getElementById("pvGradSettings"),
            inpMin: document.getElementById("inpMin"),
            inpMax: document.getElementById("inpMax"),
            depthHumanizedDisplay: document.getElementById("depthHumanizedDisplay"),
            delayHumanizedDisplay: document.getElementById("delayHumanizedDisplay"),
            chkDebug: document.getElementById("chkDebug"),
            debugArea: document.getElementById("debugArea"),
            btnReset: document.getElementById("btnReset"),
            lblMaxDepth: document.getElementById("lblMaxDepth"),
            custBtn: document.getElementById("custBtn"),
            histBtn: document.getElementById("histBtn"),
            localBtn: document.getElementById("localBtn"),
            modal: document.getElementById("modalOv"),
            modalClose: document.getElementById("modalClose"),
            histModal: document.getElementById("histModalOv"),
            histModalClose: document.getElementById("histModalClose"),
            chkHumanEnabled: document.getElementById("chkHumanEnabled"),
            humProfile: document.getElementById("humProfile"),
            humPreview: document.getElementById("humPreview"),
            localModal: document.getElementById("localModalOv"),
            localModalClose: document.getElementById("localModalClose"),
            visType: document.getElementById("visType"),
            visBoxSettings: document.getElementById("visBoxSettings"),
            visArrowSettings: document.getElementById("visArrowSettings"),
            visOutlineSettings: document.getElementById("visOutlineSettings"),
            sliderH: document.getElementById("sliderH"),
            sliderHNum: document.getElementById("sliderHNum"),
            sliderS: document.getElementById("sliderS"),
            sliderSNum: document.getElementById("sliderSNum"),
            sliderL: document.getElementById("sliderL"),
            sliderLNum: document.getElementById("sliderLNum"),
            colorPreview: document.getElementById("colorPreview"),
            inpR: document.getElementById("inpR"),
            inpG: document.getElementById("inpG"),
            inpB: document.getElementById("inpB"),
            inpHex: document.getElementById("inpHex"),
            tabMove: document.getElementById("tabMove"),
            tabTheme: document.getElementById("tabTheme"),
            tabContentMove: document.getElementById("tabContentMove"),
            tabContentTheme: document.getElementById("tabContentTheme"),
            advToggle: document.getElementById("advToggle"),
            advSect: document.getElementById("advSect"),
            visInnerOp: document.getElementById("visInnerOp"),
            visInnerOpNum: document.getElementById("visInnerOpNum"),
            visOuterOp: document.getElementById("visOuterOp"),
            visOuterOpNum: document.getElementById("visOuterOpNum"),
            visBias: document.getElementById("visBias"),
            visBiasNum: document.getElementById("visBiasNum"),
            visArrowOp: document.getElementById("visArrowOp"),
            visArrowOpNum: document.getElementById("visArrowOpNum"),
            visArrowWidth: document.getElementById("visArrowWidth"),
            visArrowWidthNum: document.getElementById("visArrowWidthNum"),
            visOutOp: document.getElementById("visOutOp"),
            visOutOpNum: document.getElementById("visOutOpNum"),
            visOutWidth: document.getElementById("visOutWidth"),
            visOutWidthNum: document.getElementById("visOutWidthNum"),
            visOutGlow: document.getElementById("visOutGlow"),
            visOutGlowRad: document.getElementById("visOutGlowRad"),
            visOutGlowRadNum: document.getElementById("visOutGlowRadNum"),
            btnThemeDark: document.getElementById("btnThemeDark"),
            btnThemeLight: document.getElementById("btnThemeLight"),
            inpMenuOp: document.getElementById("inpMenuOp"),
            inpMenuOpNum: document.getElementById("inpMenuOpNum"),
            colBg: document.getElementById("colBg"),
            colTxt: document.getElementById("colTxt"),
            colBorder: document.getElementById("colBorder"),
            colPrim: document.getElementById("colPrim"),
            selMenuPos: document.getElementById("selMenuPos")
        };
        applyMenuPosition();
        // Init engine status — if already loaded keep it, otherwise auto-load if in local mode
        if (state.localEngine) {
            setEngineStatus("ready", "");
        } else {
            updateLocalSettingsUI();
            if (settings.engineMode === "local" && !state.engineLoadingInProgress) {
                loadLocalEngine();
            }
        }
        // Bindings (all identical to original)
        state.ui.selMode.value = settings.engineMode;
        state.ui.selMenuPos.value = settings.menuPosition;
        state.ui.btnAnalyze.onclick = () => analyze();
        state.ui.btnReset.onclick = resetSettings;
        state.ui.custBtn.onclick = () => (state.ui.modal.style.display = "flex");
        state.ui.modalClose.onclick = () => (state.ui.modal.style.display = "none");
        state.ui.histBtn.onclick = () => { updateHumanizationPreviewUI(); state.ui.histModal.style.display = "flex"; };
        state.ui.histModalClose.onclick = () => (state.ui.histModal.style.display = "none");
        state.ui.localBtn.onclick = () => { loadModelSettings(settings.localModelId); syncLocalSettingsInputs(); updateLocalSettingsUI(); state.ui.localModal.style.display = "flex"; };
        state.ui.localModalClose.onclick = () => (state.ui.localModal.style.display = "none");

        document.getElementById("btnLocalInstall").onclick   = () => { loadLocalEngine(); updateLocalSettingsUI(); };
        document.getElementById("btnLocalReinstall").onclick = () => reinstallEngine();
        document.getElementById("btnLocalUninstall").onclick = () => { if (confirm("Uninstall local engine and clear cache?")) uninstallEngine(); };

        // ── Model selector ─────────────────────────────────────────────────
        const localModelSel = document.getElementById("localModelSel");
        localModelSel.onchange = (e) => {
            const newId = e.target.value;
            // Shut down any currently running engine
            if (state.localEngine) {
                try { state.localEngine.terminate(); } catch(_) {}
                state.localEngine = null;
            }
            state.engineLoadingInProgress = false;
            saveSetting("localModelId", newId);
            // Load this model's saved per-model settings into working state
            loadModelSettings(newId);
            // Clamp depth to new model's cap
            const m = getEngineById(newId);
            if (settings.depth > m.maxDepth) {
                settings.depth = m.maxDepth;
                saveSetting("depth", m.maxDepth);
                if (state.ui.inpDepth) state.ui.inpDepth.value = m.maxDepth;
            }
            // Refresh all input values in the modal to show this model's settings
            syncLocalSettingsInputs();
            setEngineStatus("not_installed", "");
            updateLocalSettingsUI();
            loadLocalEngine();
        };
        // Populate model info immediately on open
        syncLocalSettingsInputs();
        updateLocalSettingsUI();

        // ── Shared helpers ─────────────────────────────────────────────────
        const sendOpt = (name, val) => {
            if (state.localEngine) state.localEngine.postMessage(`setoption name ${name} value ${val}`);
        };
        // Save a setting scoped to the currently selected model
        const ms = (key, val) => saveModelSetting(key, val);

        // ── Hash ───────────────────────────────────────────────────────────
        document.getElementById("localHashMB").oninput = (e) => {
            const v = parseInt(e.target.value) || 64;
            ms("localHashMB", v); sendOpt("Hash", v);
        };

        // ── Move Overhead ──────────────────────────────────────────────────
        document.getElementById("localMoveOverhead").oninput = (e) => {
            const v = parseInt(e.target.value) || 100;
            ms("localMoveOverhead", v); sendOpt("Move Overhead", v);
        };

        // ── Skill Level (range + number synced) ───────────────────────────
        const skillNum   = document.getElementById("localSkillLevel");
        const skillRange = document.getElementById("localSkillLevelRange");
        const applySkill = (v) => { ms("localSkillLevel", v); sendOpt("Skill Level", v); };
        skillNum.oninput   = (e) => { const v = Math.min(20, Math.max(0, parseInt(e.target.value)||0)); skillRange.value = v; applySkill(v); };
        skillRange.oninput = (e) => { skillNum.value = e.target.value; applySkill(parseInt(e.target.value)); };

        // ── Elo Limit ──────────────────────────────────────────────────────
        const limitChk = document.getElementById("localLimitStrength");
        const eloRow   = document.getElementById("localEloRow");
        const eloInp   = document.getElementById("localElo");
        limitChk.onchange = (e) => {
            ms("localLimitStrength", e.target.checked);
            eloRow.style.display = e.target.checked ? "flex" : "none";
            sendOpt("UCI_LimitStrength", e.target.checked);
        };
        eloInp.oninput = (e) => {
            const v = Math.min(3190, Math.max(1320, parseInt(e.target.value)||1320));
            ms("localElo", v); sendOpt("UCI_Elo", v);
        };

        // ── Advanced toggle ────────────────────────────────────────────────
        const localAdvToggle = document.getElementById("localAdvToggle");
        const localAdvSect   = document.getElementById("localAdvSect");
        localAdvToggle.onclick = () => {
            const open = localAdvSect.style.display === "none" || localAdvSect.style.display === "";
            localAdvSect.style.display = open ? "flex" : "none";
            localAdvToggle.innerText   = open ? "▲ Advanced Options" : "▼ Advanced Options";
        };

        // ── WDL ────────────────────────────────────────────────────────────
        document.getElementById("localShowWDL").onchange = (e) => {
            ms("localShowWDL", e.target.checked); sendOpt("UCI_ShowWDL", e.target.checked);
        };

        // ── Min Thinking Time ──────────────────────────────────────────────
        document.getElementById("localMinThinkingTime").oninput = (e) => {
            const v = parseInt(e.target.value) || 20;
            ms("localMinThinkTime", v); sendOpt("Minimum Thinking Time", v);
        };

        // ── Slow Mover ─────────────────────────────────────────────────────
        document.getElementById("localSlowMover").oninput = (e) => {
            const v = Math.min(1000, Math.max(10, parseInt(e.target.value)||100));
            ms("localSlowMover", v); sendOpt("Slow Mover", v);
        };

        // ── Contempt ────────────────────────────────────────────────────────
        {
            const contemptInp = document.getElementById("localContempt");
            if (contemptInp) contemptInp.oninput = (e) => {
                const v = Math.min(100, Math.max(-100, parseInt(e.target.value) || 0));
                ms("localContempt", v); sendOpt("Contempt", v);
            };
        }

        const toggleMin = () => {
            const isMini = state.ui.panel.classList.toggle("minified");
            saveSetting("isMini", isMini);
            state.ui.minBtn.innerHTML = isMini ? `<img src="${STOCKFISH_ICON}">` : "▼";
        };
        state.ui.minBtn.onclick = (e) => { e.stopPropagation(); toggleMin(); };
        state.ui.panel.onclick = (e) => { if (state.ui.panel.classList.contains("minified")) toggleMin(); };
        if (isMini) state.ui.minBtn.innerHTML = `<img src="${STOCKFISH_ICON}">`;
        const bind = (el, key, type = "val") => {
            if (!el) return;
            el.addEventListener(type === "chk" ? "change" : "input", (e) => {
                const val = type === "chk" ? e.target.checked : type === "num" ? parseFloat(e.target.value) : e.target.value;
                saveSetting(key, val);
                if (key === "autoMove" && val === !0) triggerAutoMove();
                if (key === "autoQueue") toggleAutoQueue();
                if (key === "hideAfterMove" && val === !0) { Visuals.removeByType('history'); Visuals.removeByType('analysis'); PV.clear(); }
                if (["innerOpacity","outerOpacity","gradientBias","arrowOpacity","arrowWidth","visualOutlineWidth","visualOutlineOpacity","visualOutlineGlow","visualOutlineGlowRadius"].includes(key) && state.currentBestMove) {
                    Visuals.removeByType('history');
                    Visuals.add(state.currentBestMove, 'history');
                }
                if (["themeBg","themeText","themeBorder","themePrimary","menuOpacity"].includes(key)) applyTheme();
                updateUI();
            });
        };
        const bindSlider = (rangeEl, numEl, key, isPct = false) => {
            if (!rangeEl || !numEl) return;
            rangeEl.oninput = () => {
                let val = parseFloat(rangeEl.value);
                saveSetting(key, val);
                numEl.value = isPct ? Math.round(val * 100) : val;
                if (key === "menuOpacity") applyTheme();
                if (state.currentBestMove) { Visuals.removeByType('history'); Visuals.add(state.currentBestMove, 'history'); }
            };
            numEl.oninput = () => {
                let val = parseFloat(numEl.value);
                if (isPct) val /= 100;
                saveSetting(key, val);
                rangeEl.value = val;
                if (key === "menuOpacity") applyTheme();
                if (state.currentBestMove) { Visuals.removeByType('history'); Visuals.add(state.currentBestMove, 'history'); }
            };
        };
        state.ui.selMenuPos.onchange = (e) => { saveSetting("menuPosition", e.target.value); applyMenuPosition(); };
        state.ui.header.onmousedown = (e) => {
            if (e.target.id === "minBtn" || e.target.id === "btnReset") return;
            if (state.ui.panel.classList.contains("minified")) return;
            if (settings.menuPosition !== 'custom') { saveSetting("menuPosition", 'custom'); state.ui.selMenuPos.value = 'custom'; }
            e.preventDefault();
            const startX = e.clientX - state.ui.panel.offsetLeft;
            const startY = e.clientY - state.ui.panel.offsetTop;
            const onMove = (mv) => {
                let x = mv.clientX - startX, y = mv.clientY - startY;
                x = Math.max(0, Math.min(x, window.innerWidth - state.ui.panel.offsetWidth));
                y = Math.max(0, Math.min(y, window.innerHeight - state.ui.panel.offsetHeight));
                state.ui.panel.style.left = x + "px"; state.ui.panel.style.top = y + "px";
                state.ui.panel.style.right = "auto"; state.ui.panel.style.bottom = "auto";
                saveSetting("pX", x); saveSetting("pY", y);
            };
            document.addEventListener("mousemove", onMove);
            document.onmouseup = () => document.removeEventListener("mousemove", onMove);
        };
        new ResizeObserver(() => {
            if (!state.ui.panel.classList.contains("minified")) {
                saveSetting("panelW", state.ui.panel.style.width);
                saveSetting("panelH", state.ui.panel.style.height);
            }
        }).observe(state.ui.panel);
        state.ui.selMode.onchange = (e) => {
            saveSetting("engineMode", e.target.value);
            state.isThinking = false;
            if (settings.engineMode === "local") {
                // Auto-load immediately when switching to local
                if (!state.localEngine && !state.engineLoadingInProgress) {
                    loadLocalEngine();
                }
            } else {
                // Switching away from local — kill thinking but keep engine warm
                if (state.currentCloudRequest) {
                    try { state.currentCloudRequest.abort(); } catch(_) {}
                    state.currentCloudRequest = null;
                }
            }
            updateUI();
        };
        state.ui.chkDebug.onchange = (e) => { saveSetting("debugLogs", e.target.checked); updateUI(); };
        const durSlider = document.getElementById("visDuration");
        const durText = document.getElementById("visDurationText");
        const rowFade = document.getElementById("rowFadeOut");
        const chkFade = document.getElementById("chkFadeOut");
        const sliderToSeconds = (val) => { if (val <= 0) return -1; if (val >= 100) return 0; return Math.round((59.9 * Math.pow((val-1)/98,2)+0.1)*10)/10; };
        const secondsToSlider = (secs) => { if (secs === -1) return 0; if (secs === 0) return 100; return Math.round(Math.sqrt((secs-0.1)/59.9)*98)+1; };
        durSlider.value = secondsToSlider(settings.visualDuration);
        chkFade.checked = settings.visualFadeOut;
        const updateDurUI = () => {
            const val = parseInt(durSlider.value);
            const isNative = settings.visualType === "nativeArrow";
            if (val >= 100) { durText.innerText = "Forever"; if(rowFade) rowFade.style.display = "none"; saveSetting("visualDuration", 0); }
            else if (val <= 0) { durText.innerText = "Disabled"; if(rowFade) rowFade.style.display = "none"; saveSetting("visualDuration", -1); }
            else { const secs = sliderToSeconds(val); durText.innerText = secs.toFixed(1) + "s"; if(rowFade) rowFade.style.display = isNative ? "none" : "flex"; saveSetting("visualDuration", secs); }
        };
        durSlider.oninput = updateDurUI;
        chkFade.onchange = (e) => saveSetting("visualFadeOut", e.target.checked);
        updateDurUI();
        state.ui.visType.onchange = (e) => { saveSetting("visualType", e.target.value); toggleVisualInputs(); Visuals.removeByType('history'); if (state.currentBestMove) Visuals.add(state.currentBestMove, 'history'); };
        function toggleVisualInputs() {
            state.ui.visBoxSettings.style.display = "none";
            state.ui.visArrowSettings.style.display = "none";
            state.ui.visOutlineSettings.style.display = "none";

            const isNative = settings.visualType === "nativeArrow";
            const rowDur = document.getElementById("rowDuration");
            const sectColor = document.getElementById("sectHighlightColor");
            const sectAdv = document.getElementById("sectAdvancedVis");

            if (rowDur) rowDur.style.display = isNative ? "none" : "flex";
            if (sectColor) sectColor.style.display = isNative ? "none" : "flex";
            if (sectAdv) sectAdv.style.display = isNative ? "none" : "block";

            updateDurUI(); // Update fade out visibility based on the new logic

            if (!isNative) {
                if (settings.visualType === "arrow") state.ui.visArrowSettings.style.display = "block";
                else if (settings.visualType === "outline") state.ui.visOutlineSettings.style.display = "block";
                else state.ui.visBoxSettings.style.display = "block";
            }
        }
        state.ui.visType.value = settings.visualType;
        toggleVisualInputs();
        state.ui.tabMove.onclick = () => { state.ui.tabMove.classList.add("active"); state.ui.tabTheme.classList.remove("active"); state.ui.tabContentMove.style.display = "block"; state.ui.tabContentTheme.style.display = "none"; };
        state.ui.tabTheme.onclick = () => { state.ui.tabTheme.classList.add("active"); state.ui.tabMove.classList.remove("active"); state.ui.tabContentTheme.style.display = "block"; state.ui.tabContentMove.style.display = "none"; };
        state.ui.advToggle.onclick = () => { const isH = state.ui.advSect.style.display==="none"; state.ui.advSect.style.display = isH?"block":"none"; state.ui.advToggle.innerText = isH?"▲ Advanced Visual Settings":"▼ Advanced Visual Settings"; };
        state.ui.btnThemeDark.onclick = () => {
            state.ui.colBg.value="#222222"; state.ui.colTxt.value="#eeeeee"; state.ui.colBorder.value="#444444"; state.ui.colPrim.value="#81b64c";
            ["themeBg","themeText","themeBorder","themePrimary"].forEach(k => saveSetting(k, k==="themeBg"?"#222222":k==="themeText"?"#eeeeee":k==="themeBorder"?"#444444":"#81b64c"));
            applyTheme();
        };
        state.ui.btnThemeLight.onclick = () => {
            state.ui.colBg.value="#f0f0f0"; state.ui.colTxt.value="#222222"; state.ui.colBorder.value="#cccccc"; state.ui.colPrim.value="#81b64c";
            ["themeBg","themeText","themeBorder","themePrimary"].forEach(k => saveSetting(k, k==="themeBg"?"#f0f0f0":k==="themeText"?"#222222":k==="themeBorder"?"#cccccc":"#81b64c"));
            applyTheme();
        };
        bind(state.ui.inpDepth, "depth", "num"); bind(state.ui.inpTime, "maxThinkingTime", "num");
        bind(state.ui.inpSearch, "searchMoves"); bind(state.ui.chkRun, "autoRun", "chk");
        bind(state.ui.chkMove, "autoMove", "chk"); bind(state.ui.chkQueue, "autoQueue", "chk");
        // Toggle the visibility of the Keybind row when Auto-Move is checked/unchecked
        state.ui.chkMove.addEventListener("change", (e) => {
            state.ui.rowMoveKeybind.style.display = e.target.checked ? "none" : "flex";
        });

        // Handle recording the user's keystroke
        if (state.ui.btnMoveKeybind) {
            state.ui.btnMoveKeybind.onclick = (e) => {
                e.stopPropagation();
                state.ui.btnMoveKeybind.innerText = "Press key...";

                const keyHandler = (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    document.removeEventListener("keydown", keyHandler, true);

                    let keyName = ev.key;
                    if (keyName === " ") keyName = "Space"; // Format spacebar nicely

                    if (keyName === "Escape") {
                        settings.moveKeybind = "None";
                    } else {
                        settings.moveKeybind = keyName;
                    }

                    saveSetting("moveKeybind", settings.moveKeybind);
                    state.ui.btnMoveKeybind.innerText = settings.moveKeybind;
                };

                // Listen for the very next keydown event
                document.addEventListener("keydown", keyHandler, true);
            };
        }
        bind(state.ui.chkHideAfterMove, "hideAfterMove", "chk"); bind(state.ui.chkPV, "showPVArrows", "chk");
        bindSlider(state.ui.inpPVDepth, state.ui.inpPVDepthNum, "pvDepth", false);
        bind(state.ui.chkPVNums, "pvShowNumbers", "chk"); bind(state.ui.chkPVGrad, "pvCustomGradient", "chk");
        bind(state.ui.inpPVStart, "pvStartColor"); bind(state.ui.inpPVEnd, "pvEndColor");
        bind(state.ui.inpMin, "minDelay", "num"); bind(state.ui.inpMax, "maxDelay", "num");
        bindSlider(state.ui.visInnerOp, state.ui.visInnerOpNum, "innerOpacity", true);
        bindSlider(state.ui.visOuterOp, state.ui.visOuterOpNum, "outerOpacity", true);
        bindSlider(state.ui.visBias, state.ui.visBiasNum, "gradientBias", false);
        bindSlider(state.ui.visArrowOp, state.ui.visArrowOpNum, "arrowOpacity", true);
        bindSlider(state.ui.visArrowWidth, state.ui.visArrowWidthNum, "arrowWidth", false);
        bindSlider(state.ui.visOutOp, state.ui.visOutOpNum, "visualOutlineOpacity", true);
        bindSlider(state.ui.visOutWidth, state.ui.visOutWidthNum, "visualOutlineWidth", false);
        bind(state.ui.visOutGlow, "visualOutlineGlow", "chk");
        bindSlider(state.ui.visOutGlowRad, state.ui.visOutGlowRadNum, "visualOutlineGlowRadius", false);
        bindSlider(state.ui.inpMenuOp, state.ui.inpMenuOpNum, "menuOpacity", true);
        bind(state.ui.colBg, "themeBg"); bind(state.ui.colTxt, "themeText");
        bind(state.ui.colBorder, "themeBorder"); bind(state.ui.colPrim, "themePrimary");
        [state.ui.sliderH, state.ui.sliderS, state.ui.sliderL].forEach(el => {
            el.oninput = () => {
                state.h = parseFloat(state.ui.sliderH.value);
                state.s = parseFloat(state.ui.sliderS.value);
                state.l = parseFloat(state.ui.sliderL.value);
                syncColor();
            };
        });
        if (state.ui.sliderHNum) state.ui.sliderHNum.oninput = (e) => {
            state.h = Math.min(360, Math.max(0, parseFloat(e.target.value) || 0));
            state.ui.sliderH.value = state.h;
            syncColor();
        };
        if (state.ui.sliderSNum) state.ui.sliderSNum.oninput = (e) => {
            state.s = Math.min(100, Math.max(0, parseFloat(e.target.value) || 0));
            state.ui.sliderS.value = state.s;
            syncColor();
        };
        if (state.ui.sliderLNum) state.ui.sliderLNum.oninput = (e) => {
            state.l = Math.min(100, Math.max(0, parseFloat(e.target.value) || 0));
            state.ui.sliderL.value = state.l;
            syncColor();
        };
        const applyRgb = () => {
            const r = Math.min(255, Math.max(0, parseInt(state.ui.inpR.value) || 0));
            const g = Math.min(255, Math.max(0, parseInt(state.ui.inpG.value) || 0));
            const b = Math.min(255, Math.max(0, parseInt(state.ui.inpB.value) || 0));
            const hsl = rgbToHsl(r, g, b);
            state.h = hsl.h; state.s = hsl.s; state.l = hsl.l;
            syncColor();
        };
        if (state.ui.inpR) state.ui.inpR.oninput = applyRgb;
        if (state.ui.inpG) state.ui.inpG.oninput = applyRgb;
        if (state.ui.inpB) state.ui.inpB.oninput = applyRgb;
        state.ui.inpHex.oninput = (e) => {
            if (/^#?[0-9A-F]{6}$/i.test(e.target.value)) {
                const hex = e.target.value.startsWith("#") ? e.target.value : "#" + e.target.value;
                const rgb = hexToRgb(hex);
                const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
                state.h = hsl.h; state.s = hsl.s; state.l = hsl.l;
                syncColor();
            }
        };
        const updateHumanizationPreviewUI = () => {
            const p = getHumanizationPreview(state.lastSanitizedBoardFEN || sanitizeFEN(getRawBoardFEN()), settings.depth);
            if (state.ui.depthHumanizedDisplay) state.ui.depthHumanizedDisplay.innerText = p.enabled ? `Effective depth: ${p.depthFinal} (base ${p.depthBase})` : `Effective depth: ${p.depthBase}`;
            if (state.ui.delayHumanizedDisplay) state.ui.delayHumanizedDisplay.innerText = p.enabled ? `Effective range: ${p.delayMinFinal}s - ${p.delayMaxFinal}s` : `Effective range: ${p.delayMinBase}s - ${p.delayMaxBase}s`;
            if (state.ui.humPreview) state.ui.humPreview.innerText = p.enabled
                ? `Profile: ${settings.humProfile} | Move quality: ${p.moveQuality}% | Depth ${p.depthBase}→${p.depthFinal} | Delay ${p.delayMinBase}s-${p.delayMaxBase}s → ${p.delayMinFinal}s-${p.delayMaxFinal}s | Alt-move chance: ${Math.round((p.altMoveChance || 0) * 100)}%`
                : "Preview: Humanization disabled.";
        };
        [
            "chkHumanEnabled","humProfile","humMoveQuality","humAdaptiveTiming","humComplexitySense","humTimePressureSense","humVariance"
        ].forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            const key = id === "chkHumanEnabled" ? "humanizationEnabled" : id;
            el.addEventListener(el.type === "checkbox" || el.tagName === "SELECT" ? "change" : "input", (e) => {
                const val = el.type === "checkbox" ? e.target.checked : el.type === "number" || el.type === "range" ? parseFloat(e.target.value) : e.target.value;
                saveSetting(key, val);
                updateHumanizationPreviewUI();
            });
        });
        state.ui.inpMin.addEventListener("input", updateHumanizationPreviewUI);
        state.ui.inpMax.addEventListener("input", updateHumanizationPreviewUI);
        state.ui.inpDepth.addEventListener("input", updateHumanizationPreviewUI);
        state.updateHumanizationPreviewUI = updateHumanizationPreviewUI;
        updateHumanizationPreviewUI();
    }
    function enforceBounds() {
        if (state.ui.panel) {
            const rect = state.ui.panel.getBoundingClientRect();
            if (rect.right > window.innerWidth) state.ui.panel.style.width = window.innerWidth - rect.left + "px";
            if (rect.bottom > window.innerHeight) state.ui.panel.style.height = window.innerHeight - rect.top + "px";
            if (rect.left < 0) state.ui.panel.style.left = "0px";
            if (rect.top < 0) state.ui.panel.style.top = "0px";
        }
        requestAnimationFrame(enforceBounds);
    }
    requestAnimationFrame(enforceBounds);
    function updateUI() {
        if (!state.ui.panel) return;
        document.body.classList.remove("mode-cloud", "mode-local", "mode-sfonline");
        document.body.classList.add(`mode-${settings.engineMode}`);
        if (state.ui.debugArea) state.ui.debugArea.style.display = settings.debugLogs ? "flex" : "none";
        let maxD = 18;
        if (settings.engineMode === "local") maxD = getEngineById(settings.localModelId || "sf18_05").maxDepth;
        else if (settings.engineMode === "sfonline") maxD = 15;
        if (state.ui.lblMaxDepth) state.ui.lblMaxDepth.innerText = maxD;
        if (state.ui.inpDepth) state.ui.inpDepth.max = maxD;
        if (state.ui.inpPVDepth) state.ui.inpPVDepth.max = 45;
        if (state.ui.pvSettings) state.ui.pvSettings.style.display = settings.showPVArrows ? "flex" : "none";
        if (state.ui.pvGradSettings) state.ui.pvGradSettings.style.display = settings.pvCustomGradient ? "flex" : "none";
        if (state.ui.btnAnalyze) state.ui.btnAnalyze.disabled = state.isThinking;
        if (state.ui.moveResult) state.ui.moveResult.innerHTML = state.lastMoveResult;
        if (state.ui.liveOutput) state.ui.liveOutput.innerHTML = state.lastLiveResult;
        if (state.ui.delayDisplay) state.ui.delayDisplay.innerText = `Delay: ${state.calculatedDelay}s`;
        if (state.ui.logSent) state.ui.logSent.innerText = state.lastPayload;
        if (state.ui.logRec) state.ui.logRec.innerText = state.lastResponse;
        if (document.activeElement !== state.ui.inpDepth) state.ui.inpDepth.value = settings.depth;
        if (settings.humPreviewLive !== false && typeof state.updateHumanizationPreviewUI === "function") state.updateHumanizationPreviewUI();
    }
    function mainLoop() {
        state.board = document.querySelector(CONFIG.BOARD_SEL);
        EvalBar.create();
        EvalBar.updatePosition();
        if (state.board?.game && settings.autoRun) {
            const raw = getRawBoardFEN();
            if (raw) {
                const clean = sanitizeFEN(raw);
                if (settings.hideAfterMove && state.lastSeenFEN && clean !== state.lastSeenFEN) {
                    Visuals.removeByType('history'); Visuals.removeByType('analysis'); PV.clear();
                }
                state.lastSeenFEN = clean;
                const isTurn = state.board.game.getTurn() === state.board.game.getPlayingAs();
                if (isTurn && clean !== state.lastSanitizedBoardFEN) analyze(settings.depth);
            }
        }
        if (!state.ui.panel) createUI();
        if (state.board?.game?.getPlayingAs) {
            try { const pa = state.board.game.getPlayingAs(); if (pa === 1 || pa === 2) state.playingAs = pa; } catch (e) {}
        }
        if (state.board?.game && settings.autoRun) {
            const raw = getRawBoardFEN();
            if (raw) {
                const clean = sanitizeFEN(raw);
                const isTurn = state.board.game.getTurn() === state.board.game.getPlayingAs();
                if (isTurn && clean !== state.lastSanitizedBoardFEN) analyze(settings.depth);
            }
        }
        updateUI();
    }
    // --- GLOBAL KEYBIND LISTENER ---
    document.addEventListener("keydown", (e) => {
        // Stop if Auto-Move is ON, or if no keybind is set
        if (settings.autoMove || !settings.moveKeybind || settings.moveKeybind === "None") return;

        // Prevent triggering if the user is typing in chat or a text box
        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

        let keyName = e.key === " " ? "Space" : e.key;

        // If the pressed key matches the saved keybind
        if (keyName.toLowerCase() === settings.moveKeybind.toLowerCase()) {
            if (!state.board?.game || !state.currentBestMove) return;

            // Validate that it's actually our turn to avoid breaking the client
            const turn = state.board.game.getTurn();
            const playingAs = state.board.game.getPlayingAs();

            if (turn === playingAs) {
                e.preventDefault(); // Stop page scrolling if using Space/Arrows
                playMove(state.currentBestMove);
            }
        }
    });
    // --- END GLOBAL KEYBIND LISTENER ---

    setInterval(mainLoop, CONFIG.LOOP_MS);
})();
