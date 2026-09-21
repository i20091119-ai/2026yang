// 게임 본체: 캔버스 렌더링, 숫자 물리, 베기 판정, 스테이지/벌칙 규칙
(function () {
  const M = window.NumMath;

  // 난이도 설정
  const DIFFICULTIES = {
    uibyeong: { name: "의병",     maxNumber: 20,  spawnBase: 2000, spawnMin: 1200, onScreen: [2, 3], compositeRatio: 0.78, splitsPerStage: 12, fontScale: 1.0 },
    jangsu:   { name: "장수",     maxNumber: 60,  spawnBase: 1600, spawnMin: 900,  onScreen: [3, 4], compositeRatio: 0.72, splitsPerStage: 12, fontScale: 0.95 },
    baekho:   { name: "백호장군", maxNumber: 150, spawnBase: 1300, spawnMin: 700,  onScreen: [3, 5], compositeRatio: 0.66, splitsPerStage: 10, fontScale: 0.9 },
  };

  // 스테이지: 안이명 장군의 전투 경로. 소수를 베었을 때의 벌칙이 점점 강해진다.
  // bg: assets/bg/ 에 해당 파일이 있으면 그 그림을 배경으로 쓰고, 없으면 코드로 그린 배경을 쓴다.
  const STAGES = [
    { name: "양산", primePenalty: "none",  hint: "소수는 그냥 보내세요",           bg: "assets/bg/stage-1-yangsan.jpg" },
    { name: "밀양", primePenalty: "none",  hint: "소수를 잘 구분해 보세요",        bg: "assets/bg/stage-2-miryang.jpg" },
    { name: "청도", primePenalty: "score", hint: "소수를 베면 감점!",              bg: "assets/bg/stage-3-cheongdo.jpg" },
    { name: "울산", primePenalty: "score", hint: "소수를 베면 감점!",              bg: "assets/bg/stage-4-ulsan.jpg" },
    { name: "대구", primePenalty: "life",  hint: "소수를 베면 목숨을 잃습니다!",   bg: "assets/bg/stage-5-daegu.jpg" },
  ];

  const MAX_LIVES = 3;
  // 마지막 진(대구) 총공세: 도착 후 SURGE_DELAY 가 지나면 SURGE_RAMP 동안 점점 빨라진다
  const SURGE_DELAY = 30000;
  const SURGE_RAMP = 45000;
  const COLORS = {
    blade: "#ffffff",
    bladeGlow: "rgba(170, 220, 255, 0.9)",
    good: "#8fe36b",
    bad: "#ff5a5a",
    warn: "#ffb347",
    text: "#ffffff",
    stroke: "#1a1114",
  };

  // ---------- 유틸 ----------
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // 선분(ax,ay)-(bx,by) 와 원(cx,cy,r) 의 교차 여부
  function segmentHitsCircle(ax, ay, bx, by, cx, cy, r) {
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = 0;
    if (len2 > 0) t = clamp(((cx - ax) * dx + (cy - ay) * dy) / len2, 0, 1);
    const px = ax + t * dx, py = ay + t * dy;
    const ddx = cx - px, ddy = cy - py;
    return ddx * ddx + ddy * ddy <= r * r;
  }

  // ---------- 게임 상태 ----------
  class Game {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.dpr = 1;
      this.W = 0; this.H = 0;
      this.bg = null;
      this.running = false;
      this.paused = false;
      this.callbacks = {};
      this.numbers = [];
      this.particles = [];
      this.floaters = [];
      this.trail = [];
      this.pointerDown = false;
      this.lastPointer = null;
      this.stageImages = STAGES.map((st) => {
        const img = new Image();
        img.onload = () => { if (this.running) this.render(performance.now()); };
        img.src = st.bg;
        return img;
      });
      this.bindEvents();
      this.resize();
      this.drawIdle();
    }

    // ----- 크기/배경 -----
    resize() {
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.W = window.innerWidth;
      this.H = window.innerHeight;
      this.canvas.width = Math.floor(this.W * this.dpr);
      this.canvas.height = Math.floor(this.H * this.dpr);
      this.canvas.style.width = this.W + "px";
      this.canvas.style.height = this.H + "px";
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.unit = Math.min(this.W, this.H);
      this.buildBackground();
      if (!this.running) this.drawIdle();
    }

    buildBackground() {
      const W = this.W, H = this.H;
      const off = document.createElement("canvas");
      off.width = Math.floor(W * this.dpr); off.height = Math.floor(H * this.dpr);
      const c = off.getContext("2d");
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

      // 하늘: 새벽 전장의 먹빛 하늘
      const sky = c.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, "#0d0f1c");
      sky.addColorStop(0.55, "#2a1f33");
      sky.addColorStop(1, "#6b2a1f");
      c.fillStyle = sky; c.fillRect(0, 0, W, H);

      // 달
      const mx = W * 0.78, my = H * 0.18, mr = this.unit * 0.09;
      const glow = c.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * 3);
      glow.addColorStop(0, "rgba(255, 240, 200, 0.35)");
      glow.addColorStop(1, "rgba(255, 240, 200, 0)");
      c.fillStyle = glow; c.fillRect(0, 0, W, H);
      c.fillStyle = "#fff2cc"; c.beginPath(); c.arc(mx, my, mr, 0, Math.PI * 2); c.fill();

      // 산 능선 3겹 (양산 영축산 느낌의 산세)
      const layers = [
        { base: 0.55, amp: 0.10, color: "#1c1826", freq: 1.3, seed: 1.1 },
        { base: 0.66, amp: 0.09, color: "#241a24", freq: 2.1, seed: 2.7 },
        { base: 0.78, amp: 0.06, color: "#2e1c1e", freq: 3.2, seed: 4.3 },
      ];
      for (const L of layers) {
        c.fillStyle = L.color;
        c.beginPath(); c.moveTo(0, H);
        for (let x = 0; x <= W; x += 6) {
          const t = x / W;
          const y = H * (L.base
            - L.amp * (0.6 * Math.sin(t * Math.PI * L.freq + L.seed)
            + 0.3 * Math.sin(t * Math.PI * L.freq * 2.3 + L.seed * 2)
            + 0.1 * Math.sin(t * Math.PI * L.freq * 5.1 + L.seed * 3)));
          c.lineTo(x, y);
        }
        c.lineTo(W, H); c.closePath(); c.fill();
      }

      // 땅
      const ground = c.createLinearGradient(0, H * 0.86, 0, H);
      ground.addColorStop(0, "#1a1215");
      ground.addColorStop(1, "#0c0a0c");
      c.fillStyle = ground; c.fillRect(0, H * 0.86, W, H * 0.14);

      // 은은한 비네트
      const vig = c.createRadialGradient(W / 2, H / 2, this.unit * 0.3, W / 2, H / 2, Math.max(W, H) * 0.8);
      vig.addColorStop(0, "rgba(0,0,0,0)");
      vig.addColorStop(1, "rgba(0,0,0,0.55)");
      c.fillStyle = vig; c.fillRect(0, 0, W, H);

      this.bg = off;
    }

    // 스테이지 그림이 있으면 화면을 꽉 채우도록(cover) 그리고, 없으면 코드로 만든 배경을 쓴다.
    drawBackground(ctx, stageIndex) {
      const img = this.stageImages && this.stageImages[stageIndex];
      const ready = img && img.complete && img.naturalWidth > 0;
      if (ready) {
        const W = this.W, H = this.H;
        const s = Math.max(W / img.naturalWidth, H / img.naturalHeight);
        const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
        ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
        // 숫자가 잘 보이도록 살짝 어둡게
        ctx.fillStyle = "rgba(0, 0, 0, 0.28)"; ctx.fillRect(0, 0, W, H);
      } else if (this.bg) {
        ctx.drawImage(this.bg, 0, 0, this.W, this.H);
      }
    }

    drawIdle() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.W, this.H);
      this.drawBackground(ctx, 0);
    }

    // ----- 입력 -----
    bindEvents() {
      const cv = this.canvas;
      const getPos = (e) => ({ x: e.clientX, y: e.clientY });
      cv.addEventListener("pointerdown", (e) => {
        if (!this.running || this.paused) return;
        cv.setPointerCapture && cv.setPointerCapture(e.pointerId);
        this.pointerDown = true;
        this.strokeId = (this.strokeId || 0) + 1;
        const p = getPos(e);
        this.lastPointer = p;
        this.trail.push({ x: p.x, y: p.y, t: performance.now() });
        this.slice(p.x, p.y, p.x, p.y);
      });
      cv.addEventListener("pointermove", (e) => {
        if (!this.running || this.paused || !this.pointerDown) return;
        const p = getPos(e);
        const q = this.lastPointer || p;
        this.trail.push({ x: p.x, y: p.y, t: performance.now() });
        this.slice(q.x, q.y, p.x, p.y);
        this.lastPointer = p;
      });
      const end = () => { this.pointerDown = false; this.lastPointer = null; };
      cv.addEventListener("pointerup", end);
      cv.addEventListener("pointercancel", end);
      cv.addEventListener("pointerleave", end);
      window.addEventListener("resize", () => this.resize());
    }

    // ----- 시작/정지 -----
    start(diffKey, callbacks) {
      this.diffKey = diffKey;
      this.diff = DIFFICULTIES[diffKey];
      this.callbacks = callbacks || {};
      this.numbers = []; this.particles = []; this.floaters = []; this.trail = [];
      this.score = 0; this.lives = MAX_LIVES; this.streak = 0; this.multiplier = 1;
      this.stageIndex = 0; this.splits = 0; this.primeCuts = 0; this.misses = 0;
      this.stageStart = 0; this.surgeShown = false;
      this.elapsed = 0; this.spawnTimer = 600; this.stageBanner = { text: "", sub: "", until: 0 };
      this.running = true; this.paused = false; this.over = false;
      this.lastTs = performance.now();
      this.emit("score", this.score); this.emit("lives", this.lives);
      this.emit("combo", this.multiplier); this.emit("stage", this.stageInfo());
      this.showBanner(0);
      requestAnimationFrame((ts) => this.loop(ts));
    }

    pause() { if (this.running && !this.over) this.paused = true; }
    resume() {
      if (this.running && this.paused) { this.paused = false; this.lastTs = performance.now(); requestAnimationFrame((ts) => this.loop(ts)); }
    }
    stop() { this.running = false; this.paused = false; this.drawIdle(); }

    emit(name, payload) { const cb = this.callbacks["on" + name[0].toUpperCase() + name.slice(1)]; if (cb) cb(payload); }

    stageInfo() {
      const s = STAGES[this.stageIndex];
      return { index: this.stageIndex, number: this.stageIndex + 1, name: s.name, primePenalty: s.primePenalty, hint: s.hint };
    }

    showBanner(index) {
      const s = STAGES[index];
      this.stageBanner = { text: "제" + (index + 1) + "진 · " + s.name, sub: s.hint, until: performance.now() + 2200 };
    }

    showText(text, sub) {
      this.stageBanner = { text, sub, until: performance.now() + 2200 };
    }

    // 0(평소) ~ 1(최대 총공세). 마지막 진에서만 커진다.
    surge() {
      if (this.stageIndex !== STAGES.length - 1) return 0;
      const t = this.elapsed - this.stageStart - SURGE_DELAY;
      if (t <= 0) return 0;
      return Math.min(1, t / SURGE_RAMP);
    }

    // ----- 숫자 생성 -----
    spawnNumber() {
      const d = this.diff;
      const wantComposite = Math.random() < d.compositeRatio;
      let value;
      if (wantComposite) {
        value = pick(M.compositesUpTo(d.maxNumber));
      } else {
        value = pick(M.primesUpTo(d.maxNumber));
      }
      const W = this.W, H = this.H;
      const x = rand(W * 0.18, W * 0.82);
      const g = this.gravity();
      // 화면 위쪽 62~88% 높이까지 올라갔다 천천히 내려온다
      const h = rand(H * 0.62, H * 0.88) * (0.95 + 0.05 * Math.min(this.stageIndex, 3) / 3);
      const vy = -Math.sqrt(2 * g * h);
      const vx = (W / 2 - x) * rand(0.15, 0.45) + rand(-40, 40);
      this.numbers.push(this.makeNumber(value, x, H + 40, vx, vy));
    }

    makeNumber(value, x, y, vx, vy) {
      const size = this.fontSize(value);
      return {
        value, x, y, vx, vy,
        rot: rand(-0.2, 0.2), vrot: rand(-0.5, 0.5),
        r: size * 0.62 + String(value).length * size * 0.16,
        size, prime: M.isPrime(value), dead: false, born: this.elapsed,
      };
    }

    fontSize(value) {
      const base = this.unit * 0.12 * this.diff.fontScale;
      return clamp(base, 30, 76);
    }

    gravity() { return this.H * 0.7 * (1 + 0.7 * this.surge()); } // 총공세 때 최대 1.7배 빨리 떨어진다

    currentSpawnInterval() {
      const d = this.diff;
      const factor = Math.pow(0.86, this.stageIndex) * Math.pow(0.985, Math.floor(this.elapsed / 5000));
      const base = Math.max(d.spawnMin, d.spawnBase * factor);
      return base * (1 - 0.55 * this.surge()); // 총공세 때 간격이 절반 이하로
    }

    maxOnScreen() {
      const [lo, hi] = this.diff.onScreen;
      return Math.round(lo + (hi - lo) * Math.min(1, this.stageIndex / (STAGES.length - 1))) + Math.round(3 * this.surge());
    }

    // ----- 베기 판정 -----
    slice(ax, ay, bx, by) {
      for (const n of this.numbers) {
        if (n.dead || n.bounced) continue; // 이미 튕겨낸 소수는 다시 베이지 않는다
        if (n.bornStroke === this.strokeId) continue; // 같은 획으로 생긴 조각은 새 획으로만 벨 수 있다
        if (this.elapsed - n.born < 350) continue; // 생성 직후 잠깐은 보호
        if (segmentHitsCircle(ax, ay, bx, by, n.x, n.y, n.r)) {
          this.cut(n, ax, ay, bx, by);
        }
      }
    }

    cut(n, ax, ay, bx, by) {
      n.dead = true;
      const angle = (ax === bx && ay === by) ? rand(-0.6, 0.6) : Math.atan2(by - ay, bx - ax);
      if (n.prime) {
        this.onPrimeCut(n, angle);
      } else {
        this.onCompositeCut(n, angle);
      }
    }

    onCompositeCut(n, angle) {
      const pair = M.randomPair(n.value); // 약수 쌍은 무작위
      const [a, b] = pair;
      this.streak += 1;
      this.multiplier = Math.min(5, 1 + Math.floor(this.streak / 4));
      const bothPrime = M.isPrime(a) && M.isPrime(b);
      const gained = 1 * this.multiplier + (bothPrime ? 1 : 0);
      this.score += gained;
      this.splits += 1;

      // 조각 두 개: 베인 방향과 수직으로 튀어나감
      const push = this.unit * 0.55;
      const nx = -Math.sin(angle), ny = Math.cos(angle);
      const upward = Math.min(n.vy, 0) - this.unit * 0.35;
      const left = this.makeNumber(a, n.x - nx * 10, n.y - ny * 10, n.vx - nx * push * 0.5 + rand(-40, 40), upward);
      const right = this.makeNumber(b, n.x + nx * 10, n.y + ny * 10, n.vx + nx * push * 0.5 + rand(-40, 40), upward);
      // 화면 안으로 살짝 당기기
      const cx = this.W / 2;
      left.vx += (cx - left.x) * 0.2; right.vx += (cx - right.x) * 0.2;
      left.bornStroke = this.strokeId; right.bornStroke = this.strokeId;
      this.numbers.push(left, right);

      this.spawnSparks(n.x, n.y, COLORS.good, 14);
      this.addSlashMark(n.x, n.y, angle, n.r);
      if (window.Sound) Sound.play("slice");
      this.addFloater(n.x, n.y - n.r, a + " × " + b, COLORS.good, 1.0);
      this.addFloater(n.x, n.y - n.r - 30, "+" + gained + (bothPrime ? " 완전분해!" : ""), COLORS.text, 0.85);

      this.emit("score", this.score); this.emit("combo", this.multiplier);
      this.checkStageAdvance();
    }

    onPrimeCut(n, angle) {
      const stage = STAGES[this.stageIndex];
      this.primeCuts += 1;
      if (window.Sound) Sound.play("prime");
      this.spawnSparks(n.x, n.y, COLORS.warn, 8);
      this.addSlashMark(n.x, n.y, angle, n.r);
      if (stage.primePenalty === "none") {
        // 벌칙 없음: 배우는 단계. 숫자만 튕겨내고 계속 떨어지게 둔다.
        n.dead = false; n.vy = Math.max(-this.unit * 0.8, Math.min(n.vy, 0) - this.unit * 0.2); n.vrot = rand(-2, 2);
        n.bounced = true;
        this.addFloater(n.x, n.y - n.r, n.value + "은(는) 소수!", COLORS.warn, 1.0);
      } else if (stage.primePenalty === "score") {
        this.streak = 0; this.multiplier = 1;
        this.score = Math.max(0, this.score - 1);
        this.addFloater(n.x, n.y - n.r, "소수! -1", COLORS.bad, 1.0);
        this.emit("score", this.score); this.emit("combo", this.multiplier);
      } else {
        this.streak = 0; this.multiplier = 1;
        this.addFloater(n.x, n.y - n.r, "소수! 목숨 -1", COLORS.bad, 1.2);
        this.emit("combo", this.multiplier);
        this.loseLife();
      }
    }

    onMiss(n) {
      this.misses += 1;
      if (window.Sound) Sound.play("miss");
      this.streak = 0; this.multiplier = 1;
      this.addFloater(clamp(n.x, 60, this.W - 60), this.H - 80, n.value + " 놓쳤다!", COLORS.bad, 1.2);
      this.flash = { color: "rgba(255, 60, 60, 0.35)", until: performance.now() + 250 };
      this.emit("combo", this.multiplier);
      this.loseLife();
    }

    loseLife() {
      this.lives -= 1;
      this.emit("lives", this.lives);
      if (this.lives <= 0) this.endGame();
    }

    checkStageAdvance() {
      const next = this.stageIndex + 1;
      if (next < STAGES.length && this.splits >= this.diff.splitsPerStage * next) {
        this.stageIndex = next;
        this.stageStart = this.elapsed;
        if (window.Sound) Sound.play("stage");
        this.showBanner(next);
        this.emit("stage", this.stageInfo());
      }
    }

    endGame() {
      this.over = true;
      if (window.Sound) { Sound.stopBgm(); Sound.play("over"); }
      const stats = {
        difficulty: this.diffKey, difficultyName: this.diff.name,
        score: this.score, splits: this.splits, primeCuts: this.primeCuts, misses: this.misses,
        stage: this.stageInfo(), elapsedMs: this.elapsed,
      };
      setTimeout(() => { this.running = false; this.emit("gameOver", stats); }, 900);
    }

    // ----- 효과 -----
    spawnSparks(x, y, color, count) {
      for (let i = 0; i < count; i++) {
        const a = rand(0, Math.PI * 2), s = rand(80, 320);
        this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, life: rand(0.35, 0.7), age: 0, color, size: rand(2, 5) });
      }
    }

    addSlashMark(x, y, angle, r) {
      this.particles.push({ slash: true, x, y, angle, len: r * 2.2, life: 0.22, age: 0 });
    }

    addFloater(x, y, text, color, scale) {
      x = clamp(x, 70, this.W - 70); y = clamp(y, 50, this.H - 50);
      this.floaters.push({ x, y, text, color, scale: scale || 1, life: 1.1, age: 0 });
    }

    // ----- 루프 -----
    loop(ts) {
      if (!this.running || this.paused) return;
      const dt = Math.min(0.05, (ts - this.lastTs) / 1000);
      this.lastTs = ts;
      if (!this.over) this.update(dt, ts);
      this.render(ts);
      requestAnimationFrame((t) => this.loop(t));
    }

    update(dt, now) {
      this.elapsed += dt * 1000;

      if (!this.surgeShown && this.surge() > 0) {
        this.surgeShown = true;
        if (window.Sound) Sound.play("stage");
        this.showText("왜군 총공세!", "점점 빨라집니다. 버텨 보세요!");
      }

      // 생성
      this.spawnTimer -= dt * 1000;
      const alive = this.numbers.filter((n) => !n.dead).length;
      if (this.spawnTimer <= 0 && alive < this.maxOnScreen()) {
        this.spawnNumber();
        this.spawnTimer = this.currentSpawnInterval() * rand(0.8, 1.2);
      } else if (alive === 0 && this.spawnTimer > 400) {
        this.spawnTimer = 400; // 화면이 비면 빨리 채운다
      }

      // 물리
      const g = this.gravity();
      for (const n of this.numbers) {
        if (n.dead) continue;
        n.vy += g * dt;
        n.x += n.vx * dt; n.y += n.vy * dt;
        n.rot += n.vrot * dt;
        // 옆 벽에 살짝 튕김
        if (n.x < n.r * 0.6) { n.x = n.r * 0.6; n.vx = Math.abs(n.vx) * 0.6; }
        if (n.x > this.W - n.r * 0.6) { n.x = this.W - n.r * 0.6; n.vx = -Math.abs(n.vx) * 0.6; }
        if (n.y - n.r > this.H + 20 && n.vy > 0) {
          n.dead = true;
          if (!n.prime) this.onMiss(n);
        }
      }
      this.numbers = this.numbers.filter((n) => !n.dead);

      // 파티클
      for (const p of this.particles) {
        p.age += dt;
        if (!p.slash) { p.vy += g * 0.6 * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
      }
      this.particles = this.particles.filter((p) => p.age < p.life);
      for (const f of this.floaters) { f.age += dt; f.y -= 45 * dt; }
      this.floaters = this.floaters.filter((f) => f.age < f.life);
      this.trail = this.trail.filter((t) => now - t.t < 220);
    }

    render(now) {
      const ctx = this.ctx, W = this.W, H = this.H;
      ctx.clearRect(0, 0, W, H);
      this.drawBackground(ctx, this.stageIndex);

      // 숫자
      for (const n of this.numbers) {
        ctx.save();
        ctx.translate(n.x, n.y); ctx.rotate(n.rot);
        ctx.font = "bold " + n.size + "px 'Jua', 'Gowun Dodum', sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.lineJoin = "round";
        ctx.lineWidth = n.size * 0.16;
        ctx.strokeStyle = COLORS.stroke;
        ctx.strokeText(String(n.value), 0, 0);
        ctx.fillStyle = n.bounced ? "#ffe6b3" : COLORS.text;
        ctx.fillText(String(n.value), 0, 0);
        ctx.restore();
      }

      // 파티클 / 베기 자국
      for (const p of this.particles) {
        const k = 1 - p.age / p.life;
        if (p.slash) {
          ctx.save();
          ctx.translate(p.x, p.y); ctx.rotate(p.angle);
          ctx.globalAlpha = k;
          ctx.strokeStyle = COLORS.blade; ctx.lineWidth = 4 * k + 1; ctx.lineCap = "round";
          ctx.shadowColor = COLORS.bladeGlow; ctx.shadowBlur = 12;
          ctx.beginPath(); ctx.moveTo(-p.len / 2, 0); ctx.lineTo(p.len / 2, 0); ctx.stroke();
          ctx.restore();
        } else {
          ctx.globalAlpha = k;
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * k + 0.5, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
        }
      }

      // 떠오르는 글씨
      for (const f of this.floaters) {
        const k = 1 - f.age / f.life;
        ctx.save();
        ctx.globalAlpha = Math.min(1, k * 1.6);
        ctx.font = "bold " + Math.round(22 * f.scale) + "px 'Jua', sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.lineWidth = 5; ctx.strokeStyle = COLORS.stroke; ctx.lineJoin = "round";
        ctx.strokeText(f.text, f.x, f.y);
        ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
        ctx.restore();
      }

      // 칼날 궤적
      if (this.trail.length > 1) {
        ctx.save();
        ctx.lineCap = "round"; ctx.lineJoin = "round";
        for (let i = 1; i < this.trail.length; i++) {
          const a = this.trail[i - 1], b = this.trail[i];
          const age = (now - b.t) / 220;
          const k = 1 - age;
          ctx.globalAlpha = k;
          ctx.strokeStyle = COLORS.bladeGlow; ctx.lineWidth = 14 * k;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          ctx.strokeStyle = COLORS.blade; ctx.lineWidth = 5 * k;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
        ctx.restore();
      }

      // 화면 번쩍임 (실수)
      if (this.flash && now < this.flash.until) {
        ctx.fillStyle = this.flash.color; ctx.fillRect(0, 0, W, H);
      }

      // 스테이지 배너
      if (this.stageBanner && now < this.stageBanner.until) {
        const remain = (this.stageBanner.until - now) / 2200;
        const alpha = remain > 0.85 ? (1 - remain) / 0.15 : remain < 0.25 ? remain / 0.25 : 1;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.fillRect(0, H * 0.36, W, H * 0.2);
        ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
        ctx.font = "bold " + Math.round(this.unit * 0.09) + "px 'Jua', sans-serif";
        ctx.lineWidth = 6; ctx.strokeStyle = COLORS.stroke;
        ctx.strokeText(this.stageBanner.text, W / 2, H * 0.44);
        ctx.fillStyle = "#ffd166"; ctx.fillText(this.stageBanner.text, W / 2, H * 0.44);
        ctx.font = Math.round(this.unit * 0.045) + "px 'Gowun Dodum', sans-serif";
        ctx.lineWidth = 4; ctx.strokeText(this.stageBanner.sub, W / 2, H * 0.51);
        ctx.fillStyle = "#ffffff"; ctx.fillText(this.stageBanner.sub, W / 2, H * 0.51);
        ctx.restore();
      }

      if (this.over) {
        ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(0, 0, W, H);
      }
    }
  }

  window.Game = Game;
  window.GAME_DIFFICULTIES = DIFFICULTIES;
  window.GAME_STAGES = STAGES;
})();
