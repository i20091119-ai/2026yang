// 화면 전환, HUD, 순위표, 게임 흐름
(function () {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const DIFF_NAMES = { uibyeong: "의병", jangsu: "장수", baekho: "백호장군" };

  const game = new Game($("#game"));
  window.__game = game; // 디버그/테스트용
  let currentDiff = "uibyeong";
  let lastStats = null;

  // ----- 화면 전환 -----
  function show(id) {
    $$(".screen").forEach((s) => s.classList.add("hidden"));
    const el = document.getElementById(id);
    if (el) el.classList.remove("hidden");
    $("#hud").classList.toggle("hidden", id !== "screen-play");
    if (id === "screen-ranking") renderRanking(currentDiff);
  }

  $$("[data-go]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-go");
      if (game.running) { game.stop(); Sound.stopBgm(); }
      show(target);
    });
  });

  // ----- HUD -----
  function setLives(n) {
    const box = $("#hud-lives");
    box.innerHTML = "";
    for (let i = 0; i < 3; i++) {
      const s = document.createElement("span");
      s.className = "life" + (i < n ? "" : " lost");
      s.textContent = "虎";
      box.appendChild(s);
    }
  }

  const callbacks = {
    onScore: (v) => { $("#hud-score").textContent = v; },
    onLives: (v) => setLives(v),
    onCombo: (m) => {
      const el = $("#hud-combo");
      el.textContent = "x" + m;
      el.classList.toggle("hot", m >= 2);
    },
    onStage: (s) => { $("#hud-diff").textContent = DIFF_NAMES[currentDiff] + " · " + s.number + "진 " + s.name; },
    onGameOver: (stats) => onGameOver(stats),
  };

  // ----- 난이도 선택 → 시작 -----
  $$(".diff-btn").forEach((btn) => {
    btn.addEventListener("click", () => startGame(btn.getAttribute("data-diff")));
  });

  function startGame(diff) {
    currentDiff = diff;
    show("screen-play");
    game.start(diff, callbacks);
    Sound.startBgm();
  }

  // ----- 일시정지 -----
  $("#btn-pause").addEventListener("click", () => {
    if (!game.running || game.over) return;
    game.pause(); Sound.pauseBgm();
    $("#screen-pause").classList.remove("hidden");
  });
  $("#btn-resume").addEventListener("click", () => {
    $("#screen-pause").classList.add("hidden");
    game.resume(); Sound.resumeBgm();
  });
  $("#btn-quit").addEventListener("click", () => {
    game.stop(); Sound.stopBgm();
    show("screen-title");
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && game.running && !game.paused && !game.over) {
      game.pause(); Sound.pauseBgm();
      $("#screen-pause").classList.remove("hidden");
    }
  });

  // ----- 소리 켜기/끄기 -----
  function renderMute() {
    const on = !Sound.isMuted();
    $$(".btn-mute").forEach((b) => { b.textContent = on ? "🔊 소리 켜짐" : "🔇 소리 꺼짐"; b.setAttribute("aria-pressed", String(!on)); });
  }
  $$(".btn-mute").forEach((b) => b.addEventListener("click", () => { Sound.setMuted(!Sound.isMuted()); renderMute(); if (!Sound.isMuted() && game.running && !game.paused) Sound.resumeBgm(); }));
  renderMute();

  // ----- 게임 오버 -----
  async function onGameOver(stats) {
    lastStats = stats;
    $("#gameover-diff").textContent = stats.difficultyName + " · " + stats.stage.number + "진 " + stats.stage.name + "까지";
    $("#final-score").textContent = stats.score;
    $("#final-stats").innerHTML =
      "나눈 횟수 <b>" + stats.splits + "</b> · 놓친 합성수 <b>" + stats.misses + "</b> · 소수 베기 <b>" + stats.primeCuts + "</b>";
    $("#gameover-list").innerHTML = '<li class="rank-loading">기록 중…</li>';
    $("#gameover-note").textContent = "";
    show("screen-gameover");
    $("#hud").classList.add("hidden");

    const sub = await ScoreStore.submit(stats.difficulty, stats.score);
    const top = await ScoreStore.top(stats.difficulty);
    fillRankList($("#gameover-list"), top.list, stats.score);
    $("#gameover-note").textContent = noteFor(top, sub);
  }

  $("#btn-retry").addEventListener("click", () => {
    startGame(lastStats ? lastStats.difficulty : currentDiff);
  });

  // ----- 순위표 -----
  function fillRankList(ol, list, highlightScore) {
    ol.innerHTML = "";
    if (!list || list.length === 0) {
      ol.innerHTML = '<li class="rank-empty">아직 기록이 없습니다. 첫 기록을 남겨 보세요!</li>';
      return;
    }
    let highlighted = false;
    list.forEach((row, i) => {
      const li = document.createElement("li");
      const isMine = !highlighted && highlightScore != null && row.score === highlightScore;
      if (isMine) { li.classList.add("mine"); highlighted = true; }
      li.innerHTML = '<span class="rank-no">' + (i + 1) + '</span><span class="rank-score">' + row.score + "</span>";
      ol.appendChild(li);
    });
  }

  function noteFor(top, sub) {
    if (top.source === "remote" && (!sub || sub.source === "remote")) return "전체 공용 순위표 · 이름은 기록하지 않습니다";
    if (!ScoreStore.configured()) return "이 기기의 기록만 보입니다 (공용 순위표 미설정)";
    return "연결에 실패해 이 기기의 기록만 보입니다";
  }

  async function renderRanking(diff) {
    currentDiff = diff;
    $$("#ranking-tabs .tab").forEach((t) => t.classList.toggle("active", t.getAttribute("data-diff") === diff));
    const ol = $("#ranking-list");
    ol.innerHTML = '<li class="rank-loading">불러오는 중…</li>';
    const top = await ScoreStore.top(diff);
    fillRankList(ol, top.list, null);
    $("#ranking-note").textContent = noteFor(top, null);
  }

  $$("#ranking-tabs .tab").forEach((t) => {
    t.addEventListener("click", () => renderRanking(t.getAttribute("data-diff")));
  });

  // ----- 시작 -----
  setLives(3);
  show("screen-title");
})();
