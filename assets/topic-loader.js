/* Education4All — shared client helper.
   Talks to the serverless generator and hands back game-ready data.
   Used by both quiz/ and fps/. Exposes a tiny global: window.Edu4All */
(function () {
  const ENDPOINT = '/.netlify/functions/generate';

  function getTopicFromURL() {
    try { return (new URLSearchParams(location.search).get('topic') || '').trim(); }
    catch (e) { return ''; }
  }

  function slug(topic) {
    return String(topic || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'topic';
  }

  async function fetchTopic(topic) {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic })
    });
    let data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok || !data) {
      throw new Error((data && data.error) || ('Something went wrong (' + res.status + '). Please try again.'));
    }
    if (!data.levels || !data.levels.length) {
      throw new Error('No questions came back for that topic. Try rephrasing it.');
    }
    return data; // { topic, levels, codex }
  }

  window.Edu4All = { getTopicFromURL, slug, fetchTopic };
})();
