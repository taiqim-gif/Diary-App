// 効果音(音声ファイルは使わず、ブラウザの音を作る機能 Web Audio で鳴らす)
// ・ボタンを押すと「ポン」
// ・保存できたときは「ピロン」(playSaveSound() を呼ぶ)
// ・設定画面の「効果音 ON/OFF」で切り替え。localStorage の sdlSound に "off" を保存
// ・iPhone はマナーモード中は鳴らない(端末の仕様)

let soundCtx = null;

// 効果音がONかどうか(最初はON)
function soundOn() {
  try { return localStorage.getItem("sdlSound") !== "off"; } catch (e) { return true; }
}

// 音を作る道具を用意する(iPhone はボタンを押したときでないと用意できない)
function getSoundCtx() {
  try {
    if (!soundCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      soundCtx = new AC();
    }
    if (soundCtx.state === "suspended") soundCtx.resume();
    return soundCtx;
  } catch (e) { return null; }
}

// 1つの音を鳴らす(高さ hz、開始 start 秒後、長さ len 秒、音量 vol)
function playTone(ctx, hz, start, len, vol) {
  const t = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(hz, t);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.01); // すっと立ち上げる
  gain.gain.exponentialRampToValueAtTime(0.0001, t + len); // すっと消す
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + len + 0.02);
}

// ボタンの「ポン」
function playTapSound() {
  if (!soundOn()) return;
  const ctx = getSoundCtx();
  if (!ctx) return;
  playTone(ctx, 880, 0, 0.09, 0.12);
}

// 保存できたときの「ピロン」(2つの音を続けて鳴らす)
function playSaveSound() {
  if (!soundOn()) return;
  const ctx = getSoundCtx();
  if (!ctx) return;
  playTone(ctx, 1047, 0.05, 0.14, 0.15);
  playTone(ctx, 1568, 0.17, 0.28, 0.15);
}

// 画面のどのボタンを押しても「ポン」を鳴らす
document.addEventListener("click", (ev) => {
  const btn = ev.target.closest && ev.target.closest("button");
  if (btn && !btn.disabled) playTapSound();
}, true);

// 設定画面の ON/OFF ボタン
function renderSoundSeg() {
  const on = soundOn();
  document.querySelectorAll("#soundSeg .seg-btn").forEach((b) => {
    b.classList.toggle("on", (b.dataset.sound === "on") === on);
  });
}
document.querySelectorAll("#soundSeg .seg-btn").forEach((b) => {
  b.addEventListener("click", () => {
    try { localStorage.setItem("sdlSound", b.dataset.sound); } catch (e) {}
    renderSoundSeg();
    if (b.dataset.sound === "on") playSaveSound(); // ONにしたら試しに鳴らす
  });
});
renderSoundSeg();
