# 2Captcha Auto-Solver (Gemini Vision)

A Tampermonkey userscript that uses **Google Gemini AI** (free tier) to automatically read and solve captcha images on the [2captcha.com](https://2captcha.com) worker page.

## How It Works

1. When a captcha appears on the 2captcha worker page, press **Z**
2. The script captures the captcha image, sends it to Gemini 2.0 Flash for analysis
3. Gemini reads the image and returns the answer text
4. The answer is automatically filled into the input field
5. If the AI can't figure it out, `unsolvable` is placed as the answer

## Setup

### 1. Install Tampermonkey

Install the [Tampermonkey](https://www.tampermonkey.net/) browser extension.

### 2. Get a Free Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Sign in with your Google account
3. Click **Create API Key** — it's completely free
4. Copy the key

### 3. Install the Script

- Open Tampermonkey Dashboard → **+** (new script)
- Paste the contents of [`2captcha-solver.user.js`](./2captcha-solver.user.js)
- Save (**Ctrl+S**)

### 4. Set Your API Key

- Click the **Tampermonkey icon** in your browser toolbar
- Click **Set Gemini API Key**
- Paste your key and hit OK

## Usage

| Action | Key |
|--------|-----|
| Solve current captcha | **Z** |
| Set/change API key | Tampermonkey menu → **Set Gemini API Key** |

The status overlay in the top-right corner shows:
- **Cyan** — working (capturing / sending to AI)
- **Green** — answer filled successfully
- **Orange** — AI returned "unsolvable"
- **Red** — error occurred
- **Yellow** — setup needed

## Free Tier Limits

Google Gemini 2.0 Flash free tier provides:
- **15 requests/minute**
- **1,500 requests/day**
- **1 million tokens/minute**

This is more than enough for manual captcha solving on 2captcha.

## Why Gemini?

- **Best-in-class image understanding** — handles distorted text, math problems, and object identification
- **Extremely fast** — typical response in 1-2 seconds
- **Generous free tier** — 1,500 requests/day at no cost
- **No credit card required** — just a Google account

## Notes

- The **Z** key only triggers when you're **not** focused on an input field (so you can still type normally)
- The script works on both `2captcha.com` and `worker.2captcha.com`
- Your API key is stored locally in Tampermonkey's storage — it never leaves your browser except to call the Gemini API
