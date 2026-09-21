const { chromium } = require('playwright');
const OUT = process.env.OUT;
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 2 });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://localhost:8080/', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.click('[data-go="screen-difficulty"]'); await page.click('[data-diff="uibyeong"]');
  await page.waitForTimeout(200);

  const freeze = async () => page.evaluate(() => { const g = window.__game; g.paused = true; g.stageBanner.until = 0; g.render(performance.now()); });
  const reset = async (opts = {}) => page.evaluate((opts) => {
    const g = window.__game; g.paused = true; g.numbers = []; g.particles = []; g.floaters = []; g.trail = [];
    g.stageBanner.until = 0; g.flash = null; g.spawnTimer = 99999; g.strokeId = (g.strokeId || 0) + 1;
    g.elapsed = 10000; g.score = opts.score || 0; g.lives = opts.lives || 3; g.streak = opts.streak || 0; g.multiplier = 1 + Math.floor(g.streak / 4);
    g.stageIndex = opts.stage || 0;
    g.emit('score', g.score); g.emit('lives', g.lives); g.emit('combo', g.multiplier); g.emit('stage', g.stageInfo());
  }, opts);
  const shot = (n) => page.screenshot({ path: `${OUT}/step-${n}.png` });
  // 베기 후 조각을 양옆으로 벌리고, 궤적은 숫자 중심까지만
  const spread = () => page.evaluate(() => { const g = window.__game; const L = g.numbers[g.numbers.length - 2], R = g.numbers[g.numbers.length - 1];
    L.x -= 62; L.y -= 26; L.rot = -0.25; R.x += 62; R.y -= 26; R.rot = 0.25; g.render(performance.now()); });

  // 1. 숫자가 튀어오름 + 칼 궤적
  await reset({ score: 0 });
  await page.evaluate(() => { const g = window.__game;
    const a = g.makeNumber(12, 150, 330, 0, -120); a.rot = -0.15; const b = g.makeNumber(7, 255, 470, 0, -300); b.rot = 0.2;
    g.numbers.push(a, b); const now = performance.now();
    for (let i = 0; i <= 8; i++) g.trail.push({ x: 60 + i * 12, y: 560 - i * 22, t: now - (8 - i) * 12 });
    g.render(now); });
  await shot(1);

  // 2. 18 → 3 × 6
  await reset({ score: 3, streak: 3 });
  await page.evaluate(() => { const g = window.__game; NumMath.randomPair = () => [3, 6];
    const n = g.makeNumber(18, 180, 300, 0, -80); g.numbers.push(n);
    g.strokeId += 1; g.cut(n, 100, 360, 260, 240);
    const now = performance.now(); for (let i = 0; i <= 8; i++) g.trail.push({ x: 60 + i * 15, y: 420 - i * 15, t: now - (8 - i) * 10 });
    g.render(now); });
  await spread(); await shot(2);

  // 3. 6 → 2 × 3 (3은 옆에 남아 있음)
  await reset({ score: 4, streak: 4 });
  await page.evaluate(() => { const g = window.__game; NumMath.randomPair = () => [2, 3];
    const left = g.makeNumber(3, 95, 380, 0, -60); left.rot = -0.2; g.numbers.push(left);
    const n = g.makeNumber(6, 230, 300, 0, -80); g.numbers.push(n);
    g.strokeId += 1; g.cut(n, 150, 360, 310, 240);
    const now = performance.now(); for (let i = 0; i <= 8; i++) g.trail.push({ x: 110 + i * 15, y: 420 - i * 15, t: now - (8 - i) * 10 });
    g.render(now); });
  await spread(); await shot(3);

  // 4. 소수 7 을 베면 "소수!" (양산: 벌칙 없음)
  await reset({ score: 6, streak: 5 });
  await page.evaluate(() => { const g = window.__game;
    const n = g.makeNumber(7, 180, 320, 0, -80); g.numbers.push(n);
    const other = g.makeNumber(10, 290, 470, 0, -200); g.numbers.push(other);
    g.strokeId += 1; g.cut(n, 100, 380, 260, 260);
    const now = performance.now(); for (let i = 0; i <= 8; i++) g.trail.push({ x: 60 + i * 15, y: 440 - i * 15, t: now - (8 - i) * 10 });
    g.render(now); });
  await shot(4);

  // 5. 14 를 놓침 → 목숨 -1
  await reset({ score: 9, streak: 2, lives: 3 });
  await page.evaluate(() => { const g = window.__game;
    const n = g.makeNumber(14, 200, 700, 0, 300); g.onMiss(n); g.flash.until = performance.now() + 100000;
    const other = g.makeNumber(9, 120, 330, 0, -120); g.numbers.push(other);
    g.render(performance.now()); });
  await shot(5);

  // 6. 제3진 청도 배너
  await reset({ score: 31, streak: 6, stage: 2 });
  await page.evaluate(() => { const g = window.__game; g.showBanner(2); g.stageBanner.until = performance.now() + 100000;
    const a = g.makeNumber(21, 120, 560, 0, -300); g.numbers.push(a);
    const b = g.makeNumber(35, 260, 600, 0, -320); g.numbers.push(b);
    g.render(performance.now()); });
  await page.evaluate(() => new Promise(r => setTimeout(r, 50)));
  await shot(6);

  // 7. 배수 x3 으로 +3
  await reset({ score: 40, streak: 7 });
  await page.evaluate(() => { const g = window.__game; NumMath.randomPair = () => [4, 5];
    const n = g.makeNumber(20, 180, 300, 0, -80); g.numbers.push(n);
    g.strokeId += 1; g.cut(n, 100, 360, 260, 240);
    const now = performance.now(); for (let i = 0; i <= 8; i++) g.trail.push({ x: 60 + i * 15, y: 420 - i * 15, t: now - (8 - i) * 10 });
    g.render(now); });
  await spread(); await shot(7);

  // 8. 게임 오버 + 순위표
  await page.setViewportSize({ width: 360, height: 800 });
  await page.evaluate(() => {
    ScoreStore.top = async () => ({ source: 'remote', list: [57, 48, 38, 32, 29, 27, 26, 21, 20, 18].map(s => ({ score: s })) });
    ScoreStore.submit = async () => ({ source: 'remote' });
  });
  await reset({ score: 21, lives: 1 });
  await page.evaluate(() => { const g = window.__game; g.splits = 17; g.misses = 3; g.primeCuts = 2; g.stageIndex = 1; g.paused = false; g.running = true; g.endGame(); });
  await page.waitForTimeout(1400);
  await shot(8);
  console.log('errors', JSON.stringify(errs));
  await browser.close();
})();
