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
    { name: "양산", primePenalty: "none",  hint: "소수는 그냥 보내세요",           bg: "assets/bg/stage-1-yangsan.jpg",  done: "양산성을 지켜냈다!" },
    { name: "밀양", primePenalty: "none",  hint: "소수를 잘 구분해 보세요",        bg: "assets/bg/stage-2-miryang.jpg",  done: "밀양의 왜군을 물리쳤다!" },
    { name: "청도", primePenalty: "score", hint: "소수를 베면 감점!",              bg: "assets/bg/stage-3-cheongdo.jpg", done: "청도 골짜기를 돌파했다!" },
    { name: "울산", primePenalty: "score", hint: "소수를 베면 감점!",              bg: "assets/bg/stage-4-ulsan.jpg",    done: "울산 왜성을 무찔렀다!" },
    { name: "대구", primePenalty: "life",  hint: "소수를 베면 목숨을 잃습니다!",   bg: "assets/bg/stage-5-daegu.jpg",    done: "대구 들판을 지켜냈다!" },
  ];

  // 칼 등급: 진(스테이지)이 오를 때마다 한 단계씩. assets/ui/sword-N.png 가 있으면 그 그림을 쓴다.
  const SWORDS = [
    { name: "목검",     blade: "#c9a46b", edge: "#eedbb4", guard: "#6b4a2a", grip: "#4a3320", pommel: "#6b4a2a" },
    { name: "철검",     blade: "#b9c0c8", edge: "#ffffff", guard: "#4b515a", grip: "#2b2b2b", pommel: "#4b515a" },
    { name: "환도",     blade: "#d3d9e0", edge: "#ffffff", guard: "#c9a227", grip: "#7a1f1f", pommel: "#c9a227", tassel: "#d7263d" },
    { name: "백호검",   blade: "#eef2f6", edge: "#ffffff", guard: "#c9a227", grip: "#1a1a1a", pommel: "#c9a227", stripes: "#2b2b2b", glow: "rgba(170, 220, 255, 0.75)" },
    { name: "백호장군검", blade: "#fff6d8", edge: "#ffffff", guard: "#ffd166", grip: "#7a1f1f", pommel: "#ffd166", stripes: "#3a2a10", tassel: "#ffd166", glow: "rgba(255, 209, 102, 0.9)" },
  ];

  const MAX_LIVES = 3;
  // 마지막 진(대구) 총공세: 도착 후 SURGE_DELAY 가 지나면 SURGE_RAMP 동안 점점 빨라진다
  const SURGE_DELAY = 30000;
  // 진 전환 연출(ms): 완료 메시지 → 어두워짐 → 새 배경 밝아짐(배너와 함께)
  const TRANS_HOLD = 1700, TRANS_OUT = 600, TRANS_IN = 700;
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
      this.swordImages = SWORDS.map((_, i) => { const img = new Image(); img.src = "assets/ui/sword-" + (i + 1) + ".png"; return img; });
      this.sword = { x: 0, y: 0, angle: -0.6, lastMove: 0 };
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
        this.sword.x = p.x; this.sword.y = p.y; this.sword.lastMove = performance.now();
        this.slice(p.x, p.y, p.x, p.y);
      });
      cv.addEventListener("pointermove", (e) => {
        if (!this.running || this.paused || !this.pointerDown) return;
        const p = getPos(e);
        const q = this.lastPointer || p;
        this.trail.push({ x: p.x, y: p.y, t: performance.now() });
        const dx = p.x - q.x, dy = p.y - q.y;
        if (dx * dx + dy * dy > 4) this.sword.angle = Math.atan2(dy, dx);
        this.sword.x = p.x; this.sword.y = p.y; this.sword.lastMove = performance.now();
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
      this.stageStart = 0; this.surgeShown = false; this.transition = null;
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
      const sub = index > 0 ? s.hint + " · 새 칼: " + SWORDS[this.swordTier()].name : s.hint;
      this.stageBanner = { text: "제" + (index + 1) + "진 · " + s.name, sub, until: performance.now() + 2600, dur: 2600 };
    }

    swordTier() { return Math.min(this.stageIndex, SWORDS.length - 1); }

    // 칼 그리기: (x, y) 는 칼자루 끝쪽 기준점, angle 방향으로 칼끝이 향한다
    drawSword(ctx, x, y, angle, tier, L, alpha) {
      const img = this.swordImages[tier];
      ctx.save();
      ctx.translate(x, y); ctx.rotate(angle); ctx.globalAlpha = alpha;
      if (img && img.complete && img.naturalWidth > 0) {
        // 그림 파일: 가로로 눕힌 칼, 칼끝이 오른쪽을 향한 그림을 기대
        const h = L * img.naturalHeight / img.naturalWidth;
        ctx.drawImage(img, -L * 0.35, -h / 2, L, h);
        ctx.restore(); return;
      }
      const S = SWORDS[tier];
      const w = L * 0.075;
      ctx.lineJoin = "round"; ctx.lineCap = "round";
      if (S.glow) { ctx.shadowColor = S.glow; ctx.shadowBlur = L * 0.18; }
      // 칼날 (환도처럼 살짝 휜 외날)
      ctx.beginPath();
      ctx.moveTo(-0.12 * L, -w * 0.45);
      ctx.quadraticCurveTo(0.3 * L, -w * 1.0, 0.64 * L, -w * 0.1);
      ctx.quadraticCurveTo(0.3 * L, w * 0.6, -0.12 * L, w * 0.45);
      ctx.closePath();
      ctx.fillStyle = S.blade; ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(20, 15, 20, 0.7)"; ctx.lineWidth = Math.max(1, L * 0.012); ctx.stroke();
      // 날 선 부분 하이라이트
      ctx.beginPath(); ctx.moveTo(-0.08 * L, w * 0.15); ctx.quadraticCurveTo(0.3 * L, w * 0.35, 0.6 * L, -w * 0.05);
      ctx.strokeStyle = S.edge; ctx.lineWidth = Math.max(1, L * 0.014); ctx.stroke();
      // 호랑이 줄무늬
      if (S.stripes) {
        ctx.strokeStyle = S.stripes; ctx.lineWidth = Math.max(1.5, L * 0.02);
        for (let i = 0; i < 4; i++) {
          const bx = 0.02 * L + i * 0.13 * L;
          ctx.beginPath(); ctx.moveTo(bx, -w * 0.7); ctx.quadraticCurveTo(bx + w * 0.4, 0, bx - w * 0.1, w * 0.45); ctx.stroke();
        }
      }
      // 코등이(가드)
      ctx.beginPath(); ctx.ellipse(-0.13 * L, 0, w * 0.55, w * 1.25, 0, 0, Math.PI * 2);
      ctx.fillStyle = S.guard; ctx.fill(); ctx.strokeStyle = "rgba(20,15,20,0.7)"; ctx.lineWidth = Math.max(1, L * 0.012); ctx.stroke();
      // 손잡이
      ctx.fillStyle = S.grip;
      ctx.beginPath(); ctx.roundRect(-0.35 * L, -w * 0.42, 0.22 * L, w * 0.84, w * 0.2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.18)"; ctx.lineWidth = Math.max(1, L * 0.01);
      for (let i = 1; i < 5; i++) { const gx = -0.35 * L + i * 0.044 * L; ctx.beginPath(); ctx.moveTo(gx, -w * 0.42); ctx.lineTo(gx - w * 0.3, w * 0.42); ctx.stroke(); }
      // 칼자루 끝
      ctx.beginPath(); ctx.arc(-0.36 * L, 0, w * 0.5, 0, Math.PI * 2); ctx.fillStyle = S.pommel; ctx.fill();
      ctx.strokeStyle = "rgba(20,15,20,0.7)"; ctx.lineWidth = Math.max(1, L * 0.012); ctx.stroke();
      // 술
      if (S.tassel) {
        ctx.strokeStyle = S.tassel; ctx.lineWidth = Math.max(1.5, L * 0.02);
        ctx.beginPath(); ctx.moveTo(-0.38 * L, 0); ctx.quadraticCurveTo(-0.44 * L, w * 0.6, -0.42 * L, w * 1.6); ctx.stroke();
        for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(-0.42 * L, w * 1.6); ctx.lineTo(-0.42 * L + i * w * 0.35, w * 2.4); ctx.stroke(); }
      }
      ctx.restore();
    }

    showText(text, sub) {
      this.stageBanner = { text, sub, until: performance.now() + 2200, dur: 2200 };
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
      if (this.transition) return;
      for (const n of this.numbers) {
        if (n.dead || n.bounced) continue; // 이미 튕겨낸 소수는 다시 베이지 않는다
        if (n.bornStroke === this.strokeId) continue; // 같은 획으로 생긴 조각은 새 획으로만 벨 수 있다
        if (this.elapsed - n.born < 500) continue; // 생성 직후 0.5초는 보호
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

      // 조각 두 개: 좌우로 확실히 갈라지고, 위로 뜨는 힘도 서로 다르게 해서 겹치지 않게 한다
      const side = this.unit * 0.6;                       // 수평 분리 속도
      const nx = -Math.sin(angle), ny = Math.cos(angle);  // 베인 방향의 수직 성분 (약간만 섞음)
      const baseUp = Math.min(n.vy, 0);
      const left = this.makeNumber(a, n.x - 28, n.y - 10, -side + nx * this.unit * 0.15 + rand(-30, 30), baseUp - this.unit * 0.42);
      const right = this.makeNumber(b, n.x + 28, n.y - 10, side - nx * this.unit * 0.15 + rand(-30, 30), baseUp - this.unit * 0.26 + ny * this.unit * 0.05);
      // 화면 밖으로 나가지 않게만 살짝 당기기
      const cx = this.W / 2;
      if (left.x < this.W * 0.3) left.vx += (cx - left.x) * 0.5;
      if (right.x > this.W * 0.7) right.vx += (cx - right.x) * 0.5;
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
      if (this.transition || next >= STAGES.length) return;
      if (this.splits >= this.diff.splitsPerStage * next) this.beginTransition(next);
    }

    // 진 완료 연출 시작: 남은 숫자는 벌칙 없이 흩어지고, 완료 메시지 뒤 화면이 어두워졌다가 새 배경으로 밝아진다
    beginTransition(next) {
      this.transition = { to: next, t: 0 };
      this.stageBanner.until = 0;
      for (const n of this.numbers) {
        if (n.dead) continue;
        n.dead = true;
        this.spawnSparks(n.x, n.y, "#ffd166", 10);
      }
      if (window.Sound) Sound.play("stage");
    }

    updateTransition(dt) {
      const tr = this.transition;
      const before = tr.t;
      tr.t += dt * 1000;
      // 어두워진 순간에 배경/진 교체
      if (before < TRANS_HOLD + TRANS_OUT && tr.t >= TRANS_HOLD + TRANS_OUT) {
        this.stageIndex = tr.to;
        this.stageStart = this.elapsed;
        this.numbers = [];
        this.showBanner(tr.to);
        this.emit("stage", this.stageInfo());
      }
      if (tr.t >= TRANS_HOLD + TRANS_OUT + TRANS_IN) {
        this.transition = null;
        this.spawnTimer = 500;
      }
    }

    // 전환 중 화면 덮개 진하기 0~1
    transitionDim() {
      const tr = this.transition; if (!tr) return 0;
      if (tr.t < TRANS_HOLD) return 0;
      if (tr.t < TRANS_HOLD + TRANS_OUT) return (tr.t - TRANS_HOLD) / TRANS_OUT;
      return 1 - (tr.t - TRANS_HOLD - TRANS_OUT) / TRANS_IN;
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

      if (this.transition) this.updateTransition(dt);

      // 생성 (전환 중에는 쉼)
      this.spawnTimer -= dt * 1000;
      const alive = this.numbers.filter((n) => !n.dead).length;
      if (!this.transition && this.spawnTimer <= 0 && alive < this.maxOnScreen()) {
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

      // 손끝을 따라가는 칼 (긋는 동안, 손을 뗀 뒤 0.35초까지 서서히 사라짐)
      {
        const age = now - this.sword.lastMove;
        if (this.pointerDown || age < 350) {
          const alpha = this.pointerDown ? 1 : 1 - age / 350;
          this.drawSword(ctx, this.sword.x, this.sword.y, this.sword.angle, this.swordTier(), this.unit * 0.34, alpha);
        }
      }

      // 현재 칼 표시 (상단 중앙)
      {
        const tier = this.swordTier();
        const L = Math.min(96, this.unit * 0.26);
        this.drawSword(ctx, W / 2 - L * 0.12, 42, -0.5, tier, L, 0.95);
        ctx.save();
        ctx.font = "bold 13px 'Jua', sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "top";
        ctx.lineWidth = 3; ctx.strokeStyle = COLORS.stroke; ctx.lineJoin = "round";
        ctx.strokeText(SWORDS[tier].name, W / 2, 62);
        ctx.fillStyle = "#ffd166"; ctx.fillText(SWORDS[tier].name, W / 2, 62);
        ctx.restore();
      }

      // 화면 번쩍임 (실수)
      if (this.flash && now < this.flash.until) {
        ctx.fillStyle = this.flash.color; ctx.fillRect(0, 0, W, H);
      }

      // 스테이지 배너
      if (this.stageBanner && now < this.stageBanner.until) {
        const remain = (this.stageBanner.until - now) / (this.stageBanner.dur || 2200);
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

      // 진 완료 연출
      if (this.transition) {
        const tr = this.transition;
        const dim = this.transitionDim();
        if (dim > 0) { ctx.fillStyle = "rgba(8, 5, 10," + dim + ")"; ctx.fillRect(0, 0, W, H); }
        if (tr.t < TRANS_HOLD + TRANS_OUT) {
          const done = STAGES[tr.to - 1];
          const k = Math.min(1, tr.t / 250);                 // 튀어나오는 느낌
          const scale = 0.8 + 0.2 * k;
          ctx.save();
          ctx.globalAlpha = tr.t > TRANS_HOLD ? 1 - (tr.t - TRANS_HOLD) / TRANS_OUT : k;
          ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(0, H * 0.34, W, H * 0.24);
          ctx.translate(W / 2, H * 0.46); ctx.scale(scale, scale);
          ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
          ctx.font = "bold " + Math.round(this.unit * 0.075) + "px 'Jua', sans-serif";
          ctx.lineWidth = 6; ctx.strokeStyle = COLORS.stroke;
          ctx.strokeText(done.done, 0, -this.unit * 0.05);
          ctx.fillStyle = "#8fe36b"; ctx.fillText(done.done, 0, -this.unit * 0.05);
          ctx.font = Math.round(this.unit * 0.045) + "px 'Gowun Dodum', sans-serif";
          ctx.lineWidth = 4;
          const sub = "제" + tr.to + "진 완료 · 다음 전장으로 출발!";
          ctx.strokeText(sub, 0, this.unit * 0.04);
          ctx.fillStyle = "#ffffff"; ctx.fillText(sub, 0, this.unit * 0.04);
          ctx.restore();
        }
      }

      if (this.over) {
        ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(0, 0, W, H);
      }
    }
  }

  window.Game = Game;
  window.GAME_DIFFICULTIES = DIFFICULTIES;
  window.GAME_STAGES = STAGES;
  window.GAME_SWORDS = SWORDS;
})();
