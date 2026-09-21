// 점수 저장소: Supabase(공용) 우선, 실패하거나 미설정 시 localStorage(기기별)
(function () {
  const LOCAL_KEY = "baekho-scores-v1";
  const DIFFS = ["uibyeong", "jangsu", "baekho"];

  function configured() {
    const c = window.CONFIG || {};
    return !!(c.SUPABASE_URL && c.SUPABASE_ANON_KEY && /^https:\/\//.test(c.SUPABASE_URL));
  }

  function headers() {
    const c = window.CONFIG;
    return {
      apikey: c.SUPABASE_ANON_KEY,
      Authorization: "Bearer " + c.SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
    };
  }

  function endpoint() {
    const c = window.CONFIG;
    return c.SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/" + (c.TABLE || "scores");
  }

  // ---- localStorage ----
  function loadLocal() {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      const data = raw ? JSON.parse(raw) : {};
      for (const d of DIFFS) if (!Array.isArray(data[d])) data[d] = [];
      return data;
    } catch (e) {
      const data = {};
      for (const d of DIFFS) data[d] = [];
      return data;
    }
  }

  function saveLocal(data) {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(data)); } catch (e) { /* 무시 */ }
  }

  function localSubmit(difficulty, score) {
    const data = loadLocal();
    data[difficulty].push({ score, created_at: new Date().toISOString() });
    data[difficulty].sort((a, b) => b.score - a.score);
    data[difficulty] = data[difficulty].slice(0, 50);
    saveLocal(data);
  }

  function localTop(difficulty, limit) {
    return loadLocal()[difficulty].slice(0, limit);
  }

  // ---- Supabase REST ----
  async function remoteSubmit(difficulty, score) {
    const res = await fetch(endpoint(), {
      method: "POST",
      headers: Object.assign({ Prefer: "return=minimal" }, headers()),
      body: JSON.stringify({ difficulty, score }),
    });
    if (!res.ok) throw new Error("submit failed: " + res.status);
  }

  async function remoteTop(difficulty, limit) {
    const url = endpoint() +
      "?select=score,created_at" +
      "&difficulty=eq." + encodeURIComponent(difficulty) +
      "&order=score.desc,created_at.asc" +
      "&limit=" + limit;
    const res = await fetch(url, { headers: headers() });
    if (!res.ok) throw new Error("fetch failed: " + res.status);
    return res.json();
  }

  // ---- 공개 API ----
  // 반환값: { source: "remote" | "local", error?: string }
  async function submit(difficulty, score) {
    if (!DIFFS.includes(difficulty)) throw new Error("bad difficulty");
    score = Math.max(0, Math.floor(Number(score) || 0));
    localSubmit(difficulty, score); // 항상 기기에도 남김
    if (!configured()) return { source: "local" };
    try {
      await remoteSubmit(difficulty, score);
      return { source: "remote" };
    } catch (e) {
      return { source: "local", error: String(e.message || e) };
    }
  }

  // 반환값: { source, list: [{score, created_at}], error? }
  async function top(difficulty, limit) {
    limit = limit || (window.CONFIG && window.CONFIG.TOP_N) || 10;
    if (!configured()) return { source: "local", list: localTop(difficulty, limit) };
    try {
      const list = await remoteTop(difficulty, limit);
      return { source: "remote", list };
    } catch (e) {
      return { source: "local", list: localTop(difficulty, limit), error: String(e.message || e) };
    }
  }

  window.ScoreStore = { configured, submit, top, DIFFS };
})();
