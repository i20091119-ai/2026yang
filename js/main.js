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
    if (id === "screen-howto" && window.__renderHowto) { howtoIndex = 0; window.__renderHowto(); }
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
    onCombo: (c) => {
      const el = $("#hud-combo");
      el.textContent = "x" + c.multiplier;
      el.classList.toggle("hot", c.multiplier >= 2);
      $("#hud-streak").textContent = c.streak >= 2 ? "연속 " + c.streak + "회" : "";
    },
    onProgress: (p) => {
      const box = $("#hud-progress");
      box.className = "hud-progress " + p.mode;
      $("#hud-bar-fill").style.width = Math.round(Math.max(0, Math.min(1, p.ratio)) * 100) + "%";
      $("#hud-progress-text").textContent = p.text;
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
      li.innerHTML = '<span class="rank-no">' + (i + 1) + '등</span><span class="rank-score">' + row.score + "</span>";
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

  // ----- 게임 방법 슬라이드 -----
  const howtoSlides = $$("#howto-slides .howto-slide");
  let howtoIndex = 0;
  function renderHowto() {
    howtoSlides.forEach((el, i) => el.classList.toggle("active", i === howtoIndex));
    $("#howto-count").textContent = (howtoIndex + 1) + " / " + howtoSlides.length;
    const dots = $("#howto-dots");
    dots.innerHTML = "";
    howtoSlides.forEach((_, i) => { const d = document.createElement("span"); if (i === howtoIndex) d.className = "active"; dots.appendChild(d); });
    $("#howto-prev").disabled = howtoIndex === 0;
    $("#howto-next").textContent = howtoIndex === howtoSlides.length - 1 ? "출진!" : "다음 ▶";
  }
  $("#howto-prev").addEventListener("click", () => { if (howtoIndex > 0) { howtoIndex -= 1; renderHowto(); } });
  $("#howto-next").addEventListener("click", () => {
    if (howtoIndex < howtoSlides.length - 1) { howtoIndex += 1; renderHowto(); }
    else { howtoIndex = 0; renderHowto(); show("screen-difficulty"); }
  });
  // 슬라이드 위에서 좌우로 밀어 넘기기
  let swipeX = null;
  $("#howto-slides").addEventListener("pointerdown", (e) => { swipeX = e.clientX; });
  $("#howto-slides").addEventListener("pointerup", (e) => {
    if (swipeX == null) return;
    const dx = e.clientX - swipeX; swipeX = null;
    if (dx < -40 && howtoIndex < howtoSlides.length - 1) { howtoIndex += 1; renderHowto(); }
    else if (dx > 40 && howtoIndex > 0) { howtoIndex -= 1; renderHowto(); }
  });
  window.__renderHowto = renderHowto;

  // ----- 소수와 합성수 배우기 -----
  const learnGrid = $("#learn-grid");
  const learnResult = $("#learn-result");
  let learnBack = "screen-title";
  let sieveRunning = false;
  let sieveTimer = null;

  function buildLearnGrid() {
    learnGrid.innerHTML = "";
    for (let n = 1; n <= 100; n++) {
      const b = document.createElement("button");
      b.textContent = n; b.dataset.n = n; b.type = "button";
      if (n === 1) b.classList.add("one");
      b.addEventListener("click", () => pickNumber(n));
      learnGrid.appendChild(b);
    }
  }

  function cellOf(n) { return learnGrid.querySelector('[data-n="' + n + '"]'); }

  function pickNumber(n) {
    if (sieveRunning) return;
    $$("#learn-grid .picked").forEach((el) => el.classList.remove("picked"));
    const cell = cellOf(n); cell.classList.add("picked");
    if (n === 1) {
      learnResult.innerHTML = '<span class="big">1</span>은 소수도 합성수도 아니에요.';
      return;
    }
    const pairs = NumMath.factorPairs(n);
    if (pairs.length === 0) {
      cell.classList.add("prime");
      learnResult.innerHTML = '<span class="big c-prime">' + n + '</span>은(는) <b class="c-prime">소수</b>!<br>1 × ' + n + ' 말고는 나눌 수 없어요. 게임에서는 그냥 보내세요.';
    } else {
      cell.classList.add("comp");
      const shown = pairs.map((p) => p[0] + " × " + p[1]).join(" = ");
      learnResult.innerHTML = '<span class="big c-comp">' + n + '</span>은(는) <b class="c-comp">합성수</b>!<br>' + n + " = " + shown + '<br>게임에서는 베면 두 조각으로 나뉘어요.';
    }
  }

  function resetLearn() {
    if (sieveTimer) { clearTimeout(sieveTimer); sieveTimer = null; }
    sieveRunning = false;
    $("#learn-sieve").disabled = false;
    buildLearnGrid();
    learnResult.textContent = "숫자를 눌러 보세요";
  }

  // 에라토스테네스의 체: 2부터 차례로 소수를 찾고 그 배수를 지운다
  function runSieve() {
    if (sieveRunning) return;
    resetLearn();
    sieveRunning = true; $("#learn-sieve").disabled = true;
    const crossed = new Set([1]);
    cellOf(1).classList.add("crossed");
    let p = 2;
    const stepPrime = () => {
      while (p <= 100 && crossed.has(p)) p++;
      if (p > 100) {
        sieveRunning = false; $("#learn-sieve").disabled = false;
        learnResult.innerHTML = '남은 <b class="c-prime">노란 칸</b>이 전부 소수예요. 1부터 100까지 소수는 <b class="c-prime">25개</b>!';
        return;
      }
      const cell = cellOf(p); cell.classList.add("prime", "marking");
      learnResult.innerHTML = '<span class="big c-prime">' + p + '</span>은(는) 소수! 이제 ' + p + '의 배수를 모두 지워요.';
      if (p > 10) { // 10 을 넘으면 배수가 이미 다 지워져 있으니 빠르게
        for (let m = p * 2; m <= 100; m += p) crossed.add(m);
        p++; sieveTimer = setTimeout(stepPrime, 180); return;
      }
      let m = p * 2;
      const crossNext = () => {
        while (m <= 100 && crossed.has(m)) m += p;
        if (m > 100) { p++; sieveTimer = setTimeout(stepPrime, 700); return; }
        crossed.add(m); const c = cellOf(m); c.classList.add("crossed", "marking");
        m += p; sieveTimer = setTimeout(crossNext, 55);
      };
      sieveTimer = setTimeout(crossNext, 600);
    };
    sieveTimer = setTimeout(stepPrime, 300);
  }

  $("#learn-sieve").addEventListener("click", runSieve);
  $("#learn-reset").addEventListener("click", resetLearn);
  $$('[data-go="screen-learn"]').forEach((el) => el.addEventListener("click", (e) => {
    e.preventDefault(); learnBack = el.getAttribute("data-back") || "screen-title"; resetLearn();
  }));
  $("#learn-back").addEventListener("click", () => {
    resetLearn(); show(learnBack);
    if (learnBack === "screen-howto") { howtoIndex = 3; renderHowto(); } // 4번 슬라이드로 복귀
  });
  buildLearnGrid();

  // ----- 시작 -----
  renderHowto();
  setLives(3);
  show("screen-title");
})();
