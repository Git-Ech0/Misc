# 2Captcha Auto-Solver (Puter AI)

A Tampermonkey userscript that uses **free, unlimited AI** via [Puter.js](https://puter.com) to automatically read and solve captcha images on the [2captcha.com](https://2captcha.com) worker page. No API key needed.

## How It Works

1. When a captcha appears on the 2captcha worker page, press **Z**
2. The script captures the captcha image and sends it to AI (GPT-4.1 Nano via Puter)
3. The AI reads the image and returns the answer text
4. The answer is automatically filled into the input field
5. If the AI can't figure it out, `unsolvable` is placed as the answer

## Setup

### 1. Install Tampermonkey

Install the [Tampermonkey](https://www.tampermonkey.net/) browser extension.

### 2. Install the Script

- Open Tampermonkey Dashboard → **+** (new script)
- Paste the contents of [`2captcha-solver.user.js`](./2captcha-solver.user.js)
- Save (**Ctrl+S**)

### 3. First Use — Puter Sign-In

The first time you press **Z**, Puter will open a sign-in popup. Create a free account (or sign in with Google). This is a **one-time** step — after that, solving is automatic.

**No API key, no billing, no credit card.** Puter's free tier covers AI usage.

## Usage

| Action | Key |
|--------|-----|
| Solve current captcha | **Z** |

The status overlay in the top-right corner shows:
- **Cyan** — working (capturing / sending to AI)
- **Green** — answer filled successfully
- **Orange** — AI returned "unsolvable"
- **Red** — error occurred
- **Yellow** — sign-in needed

## Why Puter.js?

- **No API key** — just sign in once with a free account
- **No rate limits** — effectively unlimited for personal use
- **No credit card** — completely free
- **Fast** — powered by GPT-4.1 Nano, responses in ~1-2 seconds
- **500+ models** — can easily swap to a different model by changing one line

## Notes

- The **Z** key only triggers when you're **not** focused on an input field (so you can still type normally)
- The script works on both `2captcha.com` and `worker.2captcha.com`
- Puter handles all authentication and API routing — your data stays between you and Puter's servers
