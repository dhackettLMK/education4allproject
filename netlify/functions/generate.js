/* =========================================================================
   Education4All — dynamic question generator
   -------------------------------------------------------------------------
   Takes any topic the player types and returns a full game's worth of
   levels, boss enemies, questions and a codex "cheat sheet", in the exact
   shape both games already understand:

     { topic, levels:[ {name,emoji,desc,enemy,questions:[{q,c,why}]} ], codex }

   The correct answer is ALWAYS c[0]; both games shuffle options at runtime.

   Engine: TensorX (https://tensorx.ai) — an OpenAI-compatible API.
   The API key lives ONLY here on the server, never in the browser.
   To swap providers, change BASE_URL / MODEL / the API key env var below;
   any OpenAI-compatible endpoint works with no other changes.
   ========================================================================= */

// ---- knobs (safe to tweak) ------------------------------------------------
const LEVEL_COUNT = 5;   // number of levels, last one is the boss
const Q_PER_LEVEL = 6;   // questions per level  (5 x 6 = 30 ≈ 20 min)

const BASE_URL = process.env.TENSORX_BASE_URL || 'https://api.tensorx.ai/v1';
const MODEL    = process.env.TENSORX_MODEL    || 'deepseek/deepseek-chat-v3.1';
const API_KEY  = process.env.TENSORX_API_KEY;

// ---- the prompt -----------------------------------------------------------
function buildPrompt(topic) {
  return `You are an expert teacher and game designer. Build a complete retro
arcade study-game about this topic, written so an ordinary adult with no
background can genuinely understand it in about 20 minutes of play:

TOPIC: "${topic}"

Respond with ONLY a single valid JSON object (no markdown, no code fences, no
commentary) with exactly this structure:

{
  "levels": [
    {
      "name": "SHORT ALL-CAPS LEVEL NAME",
      "emoji": "one emoji",
      "desc": "one short sentence describing what this level teaches",
      "enemy": {
        "name": "ALL CAPS VILLAIN NAME",
        "emoji": "one emoji",
        "intro": "a line the villain says before the fight",
        "taunts": ["taunt 1", "taunt 2", "taunt 3", "taunt 4"]
      },
      "questions": [
        {
          "question": "a clear, standalone multiple-choice question",
          "options": ["CORRECT answer", "wrong 1", "wrong 2", "wrong 3"],
          "explanation": "1-2 sentences on why the correct answer is right (<240 chars)"
        }
      ]
    }
  ],
  "codex": [
    { "heading": "emoji + SHORT HEADING", "items": ["bullet 1", "bullet 2", "bullet 3"] }
  ]
}

Requirements:
- Return EXACTLY ${LEVEL_COUNT} levels forming a difficulty ramp: level 1 is an
  approachable "boot camp" on the fundamentals; middle levels build the key
  facts, mechanisms, numbers and debates; the FINAL level is the hardest
  "boss" that makes the player connect everything.
- Each level has EXACTLY ${Q_PER_LEVEL} questions.
- Each question has EXACTLY 4 options. The FIRST option (index 0) MUST be the
  correct answer; the other 3 are plausible but wrong. Do NOT prefix options
  with letters or numbers.
- Each enemy has EXACTLY 4 taunts.
- codex: 4 to 7 sections summarising the most important takeaways (a revision
  cheat-sheet). Each section has 3-6 concise bullet strings. You may wrap key
  terms or numbers in <b>...</b> tags for emphasis.
- Be factually accurate. If a fact is genuinely contested, phrase the question
  around what is well established.
- Keep language plain and concrete; explain unavoidable jargon in the option
  or explanation. Be engaging and a little witty, never at the cost of accuracy.
- Output raw JSON only.`;
}

// ---- provider call (OpenAI-compatible) ------------------------------------
async function callModel(topic) {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.8,
      max_tokens: 16000,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You are a precise assistant that always replies with a single valid JSON object and nothing else.' },
        { role: 'user', content: buildPrompt(topic) }
      ]
    })
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`AI API ${res.status}: ${detail.slice(0, 400)}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content || '';
  if (!text) throw new Error('The model returned nothing. Try a simpler topic.');
  return parseJson(text);
}

// Robustly pull a JSON object out of the model's reply.
function parseJson(text) {
  let t = String(text).trim();
  // strip ```json ... ``` fences if present
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  try { return JSON.parse(t); } catch (e) {}
  // fall back to the first { ... last } span
  const s = t.indexOf('{'), e = t.lastIndexOf('}');
  if (s !== -1 && e > s) {
    return JSON.parse(t.slice(s, e + 1));
  }
  throw new Error('The AI response was not valid JSON. Please try again.');
}

// ---- normalise the model output into the exact game shape -----------------
function clampStr(s, max) {
  return String(s == null ? '' : s).trim().slice(0, max);
}

function shapeForGame(raw, topic) {
  const rawLevels = Array.isArray(raw.levels) ? raw.levels : [];
  const levels = rawLevels.map((L, i) => {
    const isBoss = i === rawLevels.length - 1;
    const questions = (Array.isArray(L.questions) ? L.questions : [])
      .map(q => {
        let opts = (Array.isArray(q.options) ? q.options : []).map(o => clampStr(o, 200)).filter(Boolean);
        if (opts.length < 2) return null;                       // unusable
        while (opts.length < 4) opts.push('None of the above'); // pad
        opts = opts.slice(0, 4);                                // trim to 4
        return { q: clampStr(q.question, 400), c: opts, why: clampStr(q.explanation, 300) };
      })
      .filter(Boolean);

    const enemy = L.enemy || {};
    let taunts = (Array.isArray(enemy.taunts) ? enemy.taunts : []).map(t => clampStr(t, 120)).filter(Boolean);
    if (!taunts.length) taunts = ['You will not pass.', 'Is that your final answer?', 'Recalculating your credibility…', 'Try again, student.'];

    return {
      id: i,
      boss: isBoss || undefined,
      name: clampStr(L.name, 40) || (isBoss ? 'FINAL BOSS' : 'LEVEL ' + (i + 1)),
      emoji: clampStr(L.emoji, 8) || (isBoss ? '👑' : '🎯'),
      desc: clampStr(L.desc, 160),
      enemy: {
        name: clampStr(enemy.name, 40) || 'THE EXAMINER',
        emoji: clampStr(enemy.emoji, 8) || (isBoss ? '🦈' : '🤖'),
        intro: clampStr(enemy.intro, 240) || 'Prove you understand this.',
        taunts
      },
      questions
    };
  }).filter(L => L.questions.length > 0);

  const codex = (Array.isArray(raw.codex) ? raw.codex : []).map(s => ({
    h: clampStr(s.heading, 80),
    items: (Array.isArray(s.items) ? s.items : []).map(it => clampStr(it, 400)).filter(Boolean)
  })).filter(s => s.h && s.items.length);

  return { topic, levels, codex };
}

// ---- Netlify handler ------------------------------------------------------
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Use POST.' }) };
  }

  if (!API_KEY) {
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({
        error: 'The site is not configured yet. The owner needs to add TENSORX_API_KEY in Netlify → Site settings → Environment variables. See README.'
      })
    };
  }

  let topic = '';
  try { topic = (JSON.parse(event.body || '{}').topic || '').trim(); } catch (e) {}
  if (!topic) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Please type a topic.' }) };
  if (topic.length > 120) topic = topic.slice(0, 120);

  try {
    const raw = await callModel(topic);
    const shaped = shapeForGame(raw, topic);
    if (!shaped.levels.length) throw new Error('Could not build questions for that topic. Try rephrasing it.');
    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify(shaped)
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: CORS,
      body: JSON.stringify({ error: err.message || 'Question generation failed. Please try again.' })
    };
  }
};
