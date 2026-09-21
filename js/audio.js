// 소리: assets/audio/ 에 파일이 있으면 재생하고, 없으면 조용히 넘어간다.
(function () {
  const FILES = {
    bgm:   "assets/audio/bgm.mp3",     // 게임 중 반복 재생
    slice: "assets/audio/slice.mp3",   // 합성수를 벴을 때
    prime: "assets/audio/prime.mp3",   // 소수를 벴을 때
    miss:  "assets/audio/miss.mp3",    // 합성수를 놓쳤을 때
    stage: "assets/audio/stage.mp3",   // 다음 진으로 넘어갈 때
    over:  "assets/audio/gameover.mp3" // 게임 오버
  };
  const MUTE_KEY = "baekho-muted";
  const sfx = {};
  let bgm = null;
  let muted = false;
  try { muted = localStorage.getItem(MUTE_KEY) === "1"; } catch (e) { /* 무시 */ }

  function make(src, loop) {
    const a = new Audio();
    a.preload = "auto"; a.loop = !!loop; a.volume = loop ? 0.35 : 0.7;
    a.addEventListener("error", () => { a.dataset.missing = "1"; });
    a.src = src;
    return a;
  }

  for (const k of Object.keys(FILES)) {
    if (k === "bgm") bgm = make(FILES[k], true);
    else sfx[k] = make(FILES[k], false);
  }

  function play(name) {
    if (muted) return;
    const a = sfx[name];
    if (!a || a.dataset.missing) return;
    try { const c = a.cloneNode(); c.volume = a.volume; c.play().catch(() => {}); } catch (e) { /* 무시 */ }
  }

  function startBgm() {
    if (muted || !bgm || bgm.dataset.missing) return;
    try { bgm.currentTime = 0; bgm.play().catch(() => {}); } catch (e) { /* 무시 */ }
  }
  function pauseBgm() { if (bgm) bgm.pause(); }
  function resumeBgm() { if (!muted && bgm && !bgm.dataset.missing) bgm.play().catch(() => {}); }
  function stopBgm() { if (bgm) { bgm.pause(); try { bgm.currentTime = 0; } catch (e) { /* 무시 */ } } }

  function setMuted(v) {
    muted = !!v;
    try { localStorage.setItem(MUTE_KEY, muted ? "1" : "0"); } catch (e) { /* 무시 */ }
    if (muted) pauseBgm();
  }

  window.Sound = { play, startBgm, pauseBgm, resumeBgm, stopBgm, setMuted, isMuted: () => muted };
})();
