// ==UserScript==
// @name         2Captcha Auto-Solver (Puter AI)
// @namespace    https://github.com/Git-Ech0/Misc
// @version      2.0
// @description  Press Z to auto-solve captchas on 2captcha.com — free, unlimited AI via Puter.js (no API key)
// @author       Git-Ech0
// @match        https://2captcha.com/*
// @match        https://worker.2captcha.com/*
// @require      https://js.puter.com/v2/
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  /* ─── constants ─── */
  const AI_MODEL = "openai/gpt-4.1-nano";

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

  function findCaptchaImage() {
    const selectors = [
      'img[class*="captcha" i]',
      'img[class*="Captcha" i]',
      'img[class*="cap_img" i]',
      'img[class*="CapImg" i]',
      'img[id*="captcha" i]',
      '[class*="captcha" i] img',
      '[class*="Captcha" i] img',
      '[id*="captcha" i] img',
      'canvas[class*="captcha" i]',
      '[class*="captcha" i] canvas',
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }

    // Fallback: find the largest visible <img> that isn't an icon/avatar/logo
    const imgs = [...document.querySelectorAll("img")].filter((img) => {
      const w = img.naturalWidth || img.offsetWidth;
      const h = img.naturalHeight || img.offsetHeight;
      const src = (img.src || "").toLowerCase();
      if (w < 40 || h < 20) return false;
      if (src.includes("avatar") || src.includes("icon") || src.includes("logo"))
        return false;
      if (src.startsWith("data:image/svg")) return false;
      const rect = img.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });

    if (imgs.length) {
      imgs.sort((a, b) => {
        const areaA = a.offsetWidth * a.offsetHeight;
        const areaB = b.offsetWidth * b.offsetHeight;
        return areaB - areaA;
      });
      return imgs[0];
    }

    return null;
  }

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

    // Fallback: find visible text inputs
    const inputs = [
      ...document.querySelectorAll('input[type="text"], input:not([type])'),
    ];
    const visible = inputs.filter((inp) => {
      const rect = inp.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && inp.offsetParent !== null;
    });

    return visible.length ? visible[0] : null;
  }

  /* ─── image capture ─── */

  function elementToFile(el) {
    const canvas = document.createElement("canvas");

    if (el.tagName === "CANVAS") {
      canvas.width = el.width;
      canvas.height = el.height;
      canvas.getContext("2d").drawImage(el, 0, 0);
    } else {
      canvas.width = el.naturalWidth || el.offsetWidth;
      canvas.height = el.naturalHeight || el.offsetHeight;
      canvas.getContext("2d").drawImage(el, 0, 0);
    }

    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        resolve(new File([blob], "captcha.png", { type: "image/png" }));
      }, "image/png");
    });
  }

  /* ─── fill answer into React-controlled input ─── */

  function setInputValue(input, value) {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set;

    if (nativeSetter) {
      nativeSetter.call(input, value);
    } else {
      input.value = value;
    }

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

    if (typeof puter === "undefined") {
      showStatus("Puter.js not loaded — reload the page", "red");
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
      // Try passing the image URL directly first; fall back to File object
      let media;
      const src = imgEl.src || imgEl.currentSrc || "";
      if (src && src.startsWith("http")) {
        media = src;
      } else {
        media = await elementToFile(imgEl);
      }

      showStatus("Sending to AI...", "#0ff");

      const resp = await puter.ai.chat(PROMPT, media, {
        model: AI_MODEL,
        temperature: 0.1,
        max_tokens: 256,
      });

      const answer =
        (typeof resp === "string" ? resp : resp?.message?.content)?.trim() || "";

      if (!answer) {
        setInputValue(answerInput, "unsolvable");
        showStatus("AI returned empty -> unsolvable", "orange");
      } else {
        setInputValue(answerInput, answer);
        showStatus(`Answer: ${answer}`, "lime");
      }

      answerInput.focus();
    } catch (err) {
      console.error("[Z-Solver]", err);
      const msg = err?.message || String(err);
      if (msg.includes("auth") || msg.includes("sign")) {
        showStatus("Sign in to Puter when prompted, then press Z again", "yellow");
      } else {
        showStatus(`Error: ${msg}`, "red");
      }
    } finally {
      busy = false;
    }
  }

  /* ─── keyboard listener ─── */

  document.addEventListener(
    "keydown",
    (e) => {
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
  showStatus("Ready — press Z to solve (powered by Puter AI)", "lime");
  console.log(
    "[Z-Solver] 2Captcha Auto-Solver loaded. Press Z to solve. " +
      "First use will prompt Puter sign-in (free, no API key needed)."
  );
})();
