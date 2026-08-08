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

### 1. Get a free AI key (Google Gemini)

1. Go to **https://aistudio.google.com/apikey**
2. Sign in with a Google account and click **Create API key**.
3. Copy the key. Gemini has a genuinely free tier — no credit card needed to start.

### 2. Add the key to Netlify

1. Deploy this repo to Netlify (New site → import from Git, or drag-and-drop).
   No build command is needed; the site is static and `netlify.toml` already
   points Netlify at the `netlify/functions` folder.
2. In Netlify: **Site settings → Environment variables → Add a variable**
   - Key: `GEMINI_API_KEY`
   - Value: *your key from step 1*
3. **Redeploy** the site (Deploys → Trigger deploy) so the function picks up the key.

That's it. Open the site, type a topic, and play.

### Optional environment variables

| Variable         | Default            | What it does                                    |
| ---------------- | ------------------ | ----------------------------------------------- |
| `GEMINI_API_KEY` | *(required)*       | Your free Google AI Studio key.                 |
| `GEMINI_MODEL`   | `gemini-2.5-flash` | Which Gemini model to use.                       |

### Want to use Claude or OpenAI instead later?

The generator is isolated in one file (`netlify/functions/generate.js`). Swapping
providers means changing the `callGemini` function to call that provider's API and
setting a different key — the rest of the site (both games, the data shape) stays
exactly the same.

## Run it locally

Local dev needs the function to run, so use the Netlify CLI:

```bash
npm install -g netlify-cli
export GEMINI_API_KEY=your_key_here   # or put it in a .env file
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
