# Education4All 🎮📚

**Type in any topic — rocket science, the 2008 crash, WW1, black holes, how a data
centre actually works — and play a retro arcade game that teaches it to you in
about 20 minutes.**

No fixed subjects. When you start a game, it asks an AI to write real, accurate
multiple-choice questions and a study cheat-sheet about *your exact topic*:
fundamentals first, then a boss round that ties everything together.

This is the evolution of [Data Centre Dilemma](https://datacentredillemma.netlify.app/) —
same two games, now able to teach *anything*.

## The two games

- **`quiz/` — Battle Quiz.** Turn-based boss battles. Answer correctly to attack,
  build streaks for combo bonuses. Calm and readable; works great on a phone.
- **`fps/` — Breach Protocol.** A 3D first-person shooter. The four answers walk
  toward you as enemies — shoot the correct one before it reaches you.

Both read the same data, so a topic works identically in either game. You can jump
straight in with a link like `quiz/?topic=black%20holes` or `fps/?topic=WW1`.

## How it works

```
  Landing page  ──►  quiz/ or fps/?topic=...  ──►  /.netlify/functions/generate
   (type topic)          (the game shell)              (calls the AI)
                                                             │
                        game plays  ◄──  { levels, questions, codex }  ◄─┘
```

The only backend is one serverless function, `netlify/functions/generate.js`. It
calls the AI, validates the result, and returns it in the exact shape the games
expect (each question is `{ q, c:[correctAnswer, ...wrong], why }` — the correct
answer is always first, and the games shuffle the options at runtime).

**The API key never touches the browser** — it lives only in the function, as a
Netlify environment variable. A public key would get scraped and drained.

## Setup — get it live (about 5 minutes)

The question generator uses **[TensorX](https://tensorx.ai)** — an
OpenAI-compatible AI API.

### 1. Get your API key

1. Go to **https://app.tensorx.ai/dashboard/keys**
2. Create an API key and copy it.

### 2. Add the key to Netlify

1. Deploy this repo to Netlify (New site → import from Git, or drag-and-drop).
   No build command is needed; the site is static and `netlify.toml` already
   points Netlify at the `netlify/functions` folder.
2. In Netlify: **Site settings → Environment variables → Add a variable**
   - Key: `TENSORX_API_KEY`
   - Value: *your key from step 1*
3. **Redeploy** the site (Deploys → Trigger deploy) so the function picks up the key.

That's it. Open the site, type a topic, and play.

### Optional environment variables

| Variable           | Default                        | What it does                                          |
| ------------------ | ------------------------------ | ----------------------------------------------------- |
| `TENSORX_API_KEY`  | *(required)*                   | Your TensorX API key.                                 |
| `TENSORX_MODEL`    | `deepseek/deepseek-chat-v3.1`  | Which model to use (e.g. `qwen/qwen3-235b-a22b-2507`, `z-ai/glm-5.1`). |
| `TENSORX_BASE_URL` | `https://api.tensorx.ai/v1`    | API base URL.                                         |

### Using a different provider later

TensorX is OpenAI-compatible, so the generator (`netlify/functions/generate.js`)
works with **any** OpenAI-compatible API. To switch to OpenAI, OpenRouter, a local
model, etc., just point the three env vars above at that provider (base URL, model
name, key) — no code changes needed. The rest of the site (both games, the data
shape) stays exactly the same.

## Run it locally

Local dev needs the function to run, so use the Netlify CLI:

```bash
npm install -g netlify-cli
export TENSORX_API_KEY=your_key_here   # or put it in a .env file
netlify dev
```

Then open the printed URL. (Opening the HTML files directly with `file://` won't
work, because the browser can't reach the serverless function that way.)

## Tuning the game length

At the top of `netlify/functions/generate.js`:

- `LEVEL_COUNT` — number of levels (the last one is the boss). Default `5`.
- `Q_PER_LEVEL` — questions per level. Default `6` (≈ 20 minutes of play).

## Repo layout

```
index.html                      Landing page — type a topic, pick a game
quiz/index.html                 Battle Quiz (dynamic)
fps/index.html                  Breach Protocol FPS (dynamic)
assets/topic-loader.js          Shared client helper (calls the function)
netlify/functions/generate.js   Serverless AI question generator
netlify.toml                    Netlify config
```
