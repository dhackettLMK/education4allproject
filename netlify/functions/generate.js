/* =========================================================================
   Education4All — dynamic question generator
   -------------------------------------------------------------------------
   Takes any topic the player types and returns a full game's worth of
   levels, boss enemies, questions and a codex "cheat sheet", in the exact
   shape both games already understand:

     { topic, levels:[ {name,emoji,desc,enemy,questions:[{q,c,why}]} ], codex }

   The correct answer is ALWAYS c[0]; both games shuffle options at runtime.

   The API key lives ONLY here on the server, never in the browser.
   Default engine is Google Gemini (generous free tier). You can point it at
   another provider later by changing env vars — see README.
   ========================================================================= */

// ---- knobs (safe to tweak) ------------------------------------------------
const LEVEL_COUNT = 5;          // number of levels, last one is the boss
const Q_PER_LEVEL = 6;          // questions per level  (5 x 6 = 30 ≈ 20 min)
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

// ---- response schema Gemini must fill -------------------------------------
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    levels: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name:  { type: 'STRING' },
          emoji: { type: 'STRING' },
          desc:  { type: 'STRING' },
          enemy: {
            type: 'OBJECT',
            properties: {
              name:   { type: 'STRING' },
              emoji:  { type: 'STRING' },
              intro:  { type: 'STRING' },
              taunts: { type: 'ARRAY', items: { type: 'STRING' } }
            },
            required: ['name', 'emoji', 'intro', 'taunts']
          },
          questions: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                question:    { type: 'STRING' },
                options:     { type: 'ARRAY', items: { type: 'STRING' } },
                explanation: { type: 'STRING' }
              },
              required: ['question', 'options', 'explanation']
            }
          }
        },
        required: ['name', 'emoji', 'desc', 'enemy', 'questions']
      }
    },
    codex: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          heading: { type: 'STRING' },
          items:   { type: 'ARRAY', items: { type: 'STRING' } }
        },
        required: ['heading', 'items']
      }
    }
  },
  required: ['levels', 'codex']
};

// ---- the prompt -----------------------------------------------------------
function buildPrompt(topic) {
  return `You are an expert teacher and game designer. Build a complete retro
arcade study-game about this topic, written so an ordinary adult with no
background can genuinely understand it in about 20 minutes of play:

TOPIC: "${topic}"

Return EXACTLY ${LEVEL_COUNT} levels. The levels must form a learning journey
that ramps in difficulty:
- Level 1 is an approachable "boot camp" covering the absolute fundamentals.
- Middle levels build up the key facts, mechanisms, numbers and debates.
- The FINAL level is a "boss" — the hardest, most synthesising questions that
  make the player connect everything they learned.

For EACH level provide:
- name: a short punchy ALL-CAPS level name themed to the topic (2-4 words).
- emoji: one emoji that fits the level.
- desc: one short sentence describing what this level teaches.
- enemy: a memorable villain the player battles, themed to the topic, with:
    - name (ALL CAPS), emoji, an intro line spoken before the fight, and
    - taunts: an array of exactly 4 short taunts.
- questions: exactly ${Q_PER_LEVEL} multiple-choice questions. For each:
    - question: a clear, standalone question a beginner can follow.
    - options: an array of EXACTLY 4 answer strings. The FIRST option
      (index 0) MUST be the correct answer. The other 3 must be plausible but
      wrong. Do NOT prefix options with letters or numbers.
    - explanation: 1-2 sentences that teach WHY the correct answer is right,
      so the player learns something even when they get it wrong. Keep it
      under 240 characters.

Also return codex: 4 to 7 sections summarising the most important takeaways
(a revision cheat-sheet). Each section has a heading (with a leading emoji)
and an array of 3-6 concise bullet strings. You may wrap key terms/numbers in
<b>...</b> tags for emphasis.

Rules:
- Be factually accurate. If a fact is genuinely uncertain or contested, phrase
  the question around what is well established.
- Keep language plain and concrete. Avoid jargon; when a technical term is
  unavoidable, explain it in the option or explanation.
- Make it engaging and a little witty, but never at the cost of accuracy.
- Every question must have exactly 4 options with the correct one first.`;
}

// ---- Gemini call ----------------------------------------------------------
async function callGemini(topic, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: buildPrompt(topic) }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.8,
      maxOutputTokens: 32768
    }
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Gemini API ${res.status}: ${detail.slice(0, 400)}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
  if (!text) {
    const reason = data?.candidates?.[0]?.finishReason || 'no content';
    throw new Error(`Model returned nothing (${reason}). Try a simpler topic.`);
  }
  return JSON.parse(text);
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
        if (opts.length < 2) return null;                 // unusable
        while (opts.length < 4) opts.push('None of the above'); // pad
        opts = opts.slice(0, 4);                           // trim
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

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({
        error: 'The site is not configured yet. The owner needs to add a free GEMINI_API_KEY in Netlify → Site settings → Environment variables. See README.'
      })
    };
  }

  let topic = '';
  try { topic = (JSON.parse(event.body || '{}').topic || '').trim(); } catch (e) {}
  if (!topic) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Please type a topic.' }) };
  if (topic.length > 120) topic = topic.slice(0, 120);

  try {
    const raw = await callGemini(topic, apiKey);
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
