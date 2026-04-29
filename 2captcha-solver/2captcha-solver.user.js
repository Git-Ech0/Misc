// ==UserScript==
// @name         2Captcha Auto-Solver (Gemini Vision)
// @namespace    https://github.com/Git-Ech0/Misc
// @version      1.0
// @description  Press Z to auto-solve captchas on 2captcha.com using Google Gemini AI (free tier)
// @author       Git-Ech0
// @match        https://2captcha.com/*
// @match        https://worker.2captcha.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @connect      generativelanguage.googleapis.com
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  /* ─── constants ─── */
  const GEMINI_MODEL = "gemini-2.0-flash";
  const GEMINI_ENDPOINT = (key) =>
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;

  const PROMPT =
    "You are solving a CAPTCHA image. Look at the image and provide ONLY the text/answer shown in it. " +
    "Rules:\n" +
    "- Output ONLY the answer characters, nothing else. No quotes, no explanation.\n" +
    "- If the image contains distorted text, type exactly what you read.\n" +
    "- If it asks you to identify objects, type the answer (e.g. 'cat').\n" +
    "- If it asks a math question, compute the answer and output only the number.\n" +
    "- If it asks you to click or select something and you cannot, output: unsolvable\n" +
    "- If the image is blank, corrupted, or you truly cannot determine an answer, output: unsolvable\n" +
    "- Be case-sensitive. Preserve the exact casing you see.\n" +
    "- Do NOT add any extra text, punctuation, or formatting around your answer.";

  /* ─── state ─── */
  let busy = false;

  /* ─── settings helpers ─── */
  function getApiKey() {
    return GM_getValue("gemini_api_key", "");
  }

  function setApiKey(key) {
    GM_setValue("gemini_api_key", key.trim());
  }

  function promptForApiKey() {
    const current = getApiKey();
    const msg =
      "Enter your free Google Gemini API key.\n" +
      "Get one at: https://aistudio.google.com/apikey\n\n" +
      (current ? `Current key: ${current.slice(0, 8)}...` : "No key set yet.");
    const key = prompt(msg, current);
    if (key !== null) {
      setApiKey(key);
      showStatus("API key saved!", "lime");
    }
  }

  GM_registerMenuCommand("Set Gemini API Key", promptForApiKey);

  /* ─── status overlay ─── */
  const overlay = document.createElement("div");
  Object.assign(overlay.style, {
    position: "fixed",
    top: "8px",
    right: "8px",
    zIndex: "999999",
    padding: "8px 14px",
    borderRadius: "6px",
    fontFamily: "monospace",
    fontSize: "13px",
    color: "#fff",
    background: "rgba(0,0,0,0.75)",
    pointerEvents: "none",
    transition: "opacity 0.3s",
    opacity: "0",
  });
  document.body.appendChild(overlay);

  let hideTimeout;
  function showStatus(text, color = "#0ff") {
    overlay.textContent = `[Z-Solver] ${text}`;
    overlay.style.color = color;
    overlay.style.opacity = "1";
    clearTimeout(hideTimeout);
    hideTimeout = setTimeout(() => {
      overlay.style.opacity = "0";
    }, 4000);
  }

  /* ─── DOM finders ─── */

  /**
   * Find the captcha image element on the page.
   * Uses several selector strategies ordered from most-specific to generic.
   */
  function findCaptchaImage() {
    const selectors = [
      // Known 2captcha worker selectors (React class-based)
      'img[class*="captcha" i]',
      'img[class*="Captcha" i]',
      'img[class*="cap_img" i]',
      'img[class*="CapImg" i]',
      'img[id*="captcha" i]',
      // Image inside a captcha container
      '[class*="captcha" i] img',
      '[class*="Captcha" i] img',
      '[id*="captcha" i] img',
      // Canvas-based captchas
      'canvas[class*="captcha" i]',
      '[class*="captcha" i] canvas',
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }

    // Fallback: find the largest visible <img> that looks like a captcha
    // (not an icon, avatar, or logo)
    const imgs = [...document.querySelectorAll("img")].filter((img) => {
      const w = img.naturalWidth || img.offsetWidth;
      const h = img.naturalHeight || img.offsetHeight;
      const src = (img.src || "").toLowerCase();
      if (w < 40 || h < 20) return false;
      if (src.includes("avatar") || src.includes("icon") || src.includes("logo"))
        return false;
      if (src.startsWith("data:image/svg")) return false;
      // Must be visible
      const rect = img.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });

    if (imgs.length) {
      // Sort by area descending and pick the best candidate
      imgs.sort((a, b) => {
        const areaA = a.offsetWidth * a.offsetHeight;
        const areaB = b.offsetWidth * b.offsetHeight;
        return areaB - areaA;
      });
      return imgs[0];
    }

    return null;
  }

  /**
   * Find the answer input field.
   */
  function findAnswerInput() {
    const selectors = [
      'input[class*="captcha" i]',
      'input[class*="Captcha" i]',
      'input[id*="captcha" i]',
      'input[name*="captcha" i]',
      'input[name*="answer" i]',
      'input[id*="answer" i]',
      'input[class*="answer" i]',
      '[class*="captcha" i] input[type="text"]',
      '[class*="Captcha" i] input[type="text"]',
      '[id*="captcha" i] input[type="text"]',
      'input[placeholder*="type" i]',
      'input[placeholder*="enter" i]',
      'input[placeholder*="answer" i]',
      'input[placeholder*="captcha" i]',
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null) return el;
    }

    // Fallback: find visible text inputs near the captcha image
    const inputs = [...document.querySelectorAll('input[type="text"], input:not([type])')];
    const visible = inputs.filter((inp) => {
      const rect = inp.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && inp.offsetParent !== null;
    });

    return visible.length ? visible[0] : null;
  }

  /* ─── image capture ─── */

  /**
   * Convert an image or canvas element to a base64 data string (without the prefix).
   */
  async function elementToBase64(el) {
    if (el.tagName === "CANVAS") {
      return el.toDataURL("image/png").split(",")[1];
    }

    // For <img>, draw onto a canvas to get base64
    // First try fetching the image directly for best quality
    const src = el.src || el.currentSrc;
    if (src) {
      try {
        // Try fetching as blob via GM_xmlhttpRequest to bypass CORS
        const b64 = await new Promise((resolve, reject) => {
          GM_xmlhttpRequest({
            method: "GET",
            url: src,
            responseType: "blob",
            onload: (resp) => {
              const reader = new FileReader();
              reader.onloadend = () => {
                const result = reader.result;
                resolve(result.split(",")[1]);
              };
              reader.onerror = reject;
              reader.readAsDataURL(resp.response);
            },
            onerror: reject,
          });
        });
        if (b64) return b64;
      } catch {
        // Fall through to canvas method
      }
    }

    // Canvas fallback
    const canvas = document.createElement("canvas");
    canvas.width = el.naturalWidth || el.offsetWidth;
    canvas.height = el.naturalHeight || el.offsetHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(el, 0, 0);
    return canvas.toDataURL("image/png").split(",")[1];
  }

  /* ─── Gemini API call ─── */

  function callGemini(apiKey, base64Image) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "POST",
        url: GEMINI_ENDPOINT(apiKey),
        headers: { "Content-Type": "application/json" },
        data: JSON.stringify({
          contents: [
            {
              parts: [
                { text: PROMPT },
                {
                  inline_data: {
                    mime_type: "image/png",
                    data: base64Image,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 256,
          },
        }),
        onload: (resp) => {
          try {
            const json = JSON.parse(resp.responseText);
            if (json.error) {
              reject(new Error(json.error.message || JSON.stringify(json.error)));
              return;
            }
            const text =
              json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
            resolve(text);
          } catch (e) {
            reject(new Error(`Parse error: ${resp.responseText.slice(0, 200)}`));
          }
        },
        onerror: (err) =>
          reject(new Error(`Network error: ${err.statusText || "unknown"}`)),
        ontimeout: () => reject(new Error("Request timed out")),
        timeout: 30000,
      });
    });
  }

  /* ─── fill answer into React-controlled input ─── */

  function setInputValue(input, value) {
    // React overrides the native setter, so we need to use the native descriptor
    const nativeSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set;

    if (nativeSetter) {
      nativeSetter.call(input, value);
    } else {
      input.value = value;
    }

    // Fire events so React picks up the change
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
  }

  /* ─── main solve flow ─── */

  async function solve() {
    if (busy) {
      showStatus("Already solving...", "yellow");
      return;
    }

    const apiKey = getApiKey();
    if (!apiKey) {
      showStatus("No API key! Click Tampermonkey > Set Gemini API Key", "red");
      promptForApiKey();
      return;
    }

    const imgEl = findCaptchaImage();
    if (!imgEl) {
      showStatus("No captcha image found on page", "red");
      return;
    }

    const answerInput = findAnswerInput();
    if (!answerInput) {
      showStatus("No answer input field found", "red");
      return;
    }

    busy = true;
    showStatus("Capturing image...", "#0ff");

    try {
      const b64 = await elementToBase64(imgEl);
      if (!b64) throw new Error("Failed to capture image");

      showStatus("Sending to Gemini AI...", "#0ff");
      const answer = await callGemini(apiKey, b64);

      if (!answer) {
        setInputValue(answerInput, "unsolvable");
        showStatus("AI returned empty response -> unsolvable", "orange");
      } else {
        setInputValue(answerInput, answer);
        showStatus(`Answer: ${answer}`, "lime");
      }

      answerInput.focus();
    } catch (err) {
      showStatus(`Error: ${err.message}`, "red");
      console.error("[Z-Solver]", err);
    } finally {
      busy = false;
    }
  }

  /* ─── keyboard listener ─── */

  document.addEventListener(
    "keydown",
    (e) => {
      // Only trigger on Z key when not typing in an input
      if (e.key.toLowerCase() !== "z") return;
      const tag = (e.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || e.target.isContentEditable)
        return;

      e.preventDefault();
      e.stopPropagation();
      solve();
    },
    true
  );

  /* ─── init ─── */
  showStatus("Ready — press Z to solve", "lime");
  console.log("[Z-Solver] 2Captcha Auto-Solver loaded. Press Z to solve captcha.");

  if (!getApiKey()) {
    showStatus("Set your Gemini API key first! (Tampermonkey menu)", "yellow");
  }
})();
