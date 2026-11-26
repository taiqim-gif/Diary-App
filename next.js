// 「次にやること」欄(いつも上に1つだけ出す)
// app.js / review.js / goal.js の関数(loadSettings, githubGetFile, githubListFolder, loadDiary,
// listDiaryDates, isoWeekKey, weekInfo, showTab など)を使う
const NEXT_KEY = "sdlNext"; // 手順の進み具合と、終わった作業(この端末だけ)

let nextTasks = []; // 今やるべき作業(古い順)
let nextOpen = false; // 手順を開いているか

// ---------- 進み具合の保存(この端末だけ) ----------

function nextState() {
  try {
    const s = JSON.parse(lsGet(NEXT_KEY) || "null") || {};
    s.step = s.step || {}; // 作業ID → 終わった手順の数
    s.done = s.done || {}; // 作業ID → 終わった日
    return s;
  } catch (e) {
    return { step: {}, done: {} };
  }
}

function saveNextState(s) {
  // 古い記録は60日でけずる(端末の保存がふくらまないように)
  const limit = addDays(todayStr(), -60);
  Object.keys(s.done).forEach((k) => s.done[k] < limit && delete s.done[k]);
  lsSet(NEXT_KEY, JSON.stringify(s));
}

// ---------- 作業の手順 ----------

// act: 手順に付けるボタン [表示, 押したときの動き]
function diarySteps(dateStr) {
  const steps = [];
  const today = dateStr === todayStr();
  steps.push({ text: "「日記」タブを開く", act: ["日記を開く", () => openTabTop("diary")] });
  if (!today) steps.push({ text: `日付を ${dateStr} に変える(翌朝に前日分を書いてよい)` });
  if (trialItems.length) steps.push({ text: "前の日の「試すこと」に「できた/できなかった」を付ける" });
  steps.push({ text: "「今日は動けた？」を選ぶ" });
  steps.push({ text: "タイトルと本文を書く(書き始めのヒントの質問を使ってもよい)" });
  steps.push({ text: "「試すこと」を1行書く(人に試すこと)" });
  steps.push({ text: "「保存」を押す" });
  return steps;
}

function reviewSteps(offset) {
  return [
    { text: `「振り返り」タブを開く(${offset < 0 ? "先週" : "今週"})`, act: ["振り返りを開く", () => openReviewAt(offset)] },
    { text: "動けた日・動けなかった日の印を確かめる" },
    { text: "出来事を1つ選び「具体→本質→別の分野への応用→自分への教訓」の順に書く" },
    { text: "動けた日と動けなかった日の違い(誰に会い、何を読み、どんな予定だったか)を書く" },
    { text: "よく出る言葉を見て、自分ルールの候補を書く" },
    { text: "先週の「試すこと」の結果を書く" },
    { text: "「次の週で試すこと」を書く" },
    { text: "「保存」を押す(22時のClaudeのチェックで読まれる)" },
  ];
}

function monthSteps(offset) {
  return [
    { text: "「分析」タブで、動けた日と動けなかった日の違いを見る", act: ["分析を開く", () => openTabTop("analysis")] },
    { text: "「目標」タブを開く", act: ["目標を開く", () => openGoalAt(0, 0)] },
    { text: "今月の目標の状態(未着手・途中・達成・やめた)を付ける" },
    { text: "取り組んでいることを「伸ばす/維持/捨てる/今ではない」に分ける(ありたい姿に照らす)" },
    { text: `${offset > 0 ? "来月" : "今月"}の目標を書く`, act: [offset > 0 ? "来月を開く" : "今月を開く", () => openGoalAt(offset, 0)] },
    { text: "「保存」を押す" },
  ];
}

function yearSteps(offset) {
  return [
    { text: "「目標」タブを開く", act: ["目標を開く", () => openGoalAt(0, offset)] },
    { text: "ありたい姿(5年後)を書き直す。どこで、誰と、どのように働き、何を大切に暮らすか" },
    { text: "「なぜそうなりたいか」を3回掘り下げる(借り物の目標にしないため)" },
    { text: "その年に捨てるものを書く" },
    { text: "年の目標を書く" },
    { text: "「保存」を押す" },
  ];
}

function patrolSteps() {
  return [
    { text: "PCで Claude を起動する(Chrome付き: claude --chrome)" },
    { text: "「規格外さん巡回」と頼む(noteとXの新しい投稿を読み、要点集を足す)" },
    { text: "要点集が更新されたのを確かめる" },
  ];
}

// ---------- 画面の移動 ----------

function openTabTop(name) {
  showTab(name);
  document.getElementById("tab-" + name).scrollIntoView({ behavior: "smooth" });
}

function openReviewAt(offset) {
  openTabTop("review");
  if (typeof openReviewTab === "function") openReviewTab(offset);
}

function openGoalAt(monthOffset, yearOffset) {
  if (typeof goalMonthOffset !== "undefined") goalMonthOffset = monthOffset;
  if (typeof goalYearOffset !== "undefined") goalYearOffset = yearOffset;
  openTabTop("goal");
}

// ---------- 今やるべき作業を集める ----------

function monthKeyOf(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function goalsFilled(list) {
  return (list || []).some((g) => g && String(g.text || "").trim());
}

async function collectNextTasks() {
  const s = loadSettings();
  if (!hasSettings(s)) return [];
  const st = nextState();
  const now = new Date();
  const today = todayStr();
  const tasks = [];
  // due: その作業をやる日(古いものから出す)  prio: 同じ日のときの順番
  const add = (t) => {
    if (!st.done[t.id]) tasks.push(t);
  };

  // GitHubの記録をまとめて読む(読めないものは「ない」として扱う)
  const thisWeek = weekInfo(0);
  const lastWeek = weekInfo(-1);
  const [diary, goalsRaw, rvThis, rvLast, feedback] = await Promise.all([
    loadDiary(true).catch(() => null),
    githubGetFile(s, "analysis/goals.json").catch(() => ({ content: null })),
    githubGetFile(s, `analysis/review/${thisWeek.key}.md`).catch(() => ({ content: "x" })),
    githubGetFile(s, `analysis/review/${lastWeek.key}.md`).catch(() => ({ content: "x" })),
    githubListFolder(s, "feedback").catch(() => []),
  ]);

  // 1. 日記(昨日と今日。書いていない日)
  if (diary !== null) {
    const dates = listDiaryDates(diary);
    const yest = addDays(today, -1);
    // 昨日の分は、日記を書きはじめた後だけ出す(はじめて使う日に出さない)
    if (dates.length && !dates.includes(yest) && dates.some((d) => d < yest)) {
      add({ id: "diary-" + yest, due: yest, prio: 3, when: "毎日", title: "昨日の日記を書く", steps: diarySteps(yest) });
    }
    if (!dates.includes(today)) {
      add({ id: "diary-" + today, due: today, prio: 3, when: "毎日", title: "今日の日記を書く", steps: diarySteps(today) });
    }
  }

  // 2. 週の振り返り(先週の分がない／今週は土日から)
  if (!rvLast.content) {
    add({ id: "review-" + lastWeek.key, due: dateKey(addDaysDate(lastWeek.end, -1)), prio: 2, when: "毎週 土日", title: `先週の振り返り(${lastWeek.key})`, steps: reviewSteps(-1) });
  }
  const dow = now.getDay(); // 0=日 6=土
  if (!rvThis.content && (dow === 6 || dow === 0)) {
    add({ id: "review-" + thisWeek.key, due: dateKey(addDaysDate(thisWeek.end, -1)), prio: 2, when: "毎週 土日", title: "今週の振り返り", steps: reviewSteps(0) });
  }

  // 3. 月の見直し・4. 年の書き直し(目標が読めたときだけ)
  let goals = null;
  try {
    goals = goalsRaw.content ? JSON.parse(goalsRaw.content) : {};
  } catch (e) {
    goals = null;
  }
  if (goals) {
    const months = goals.months || {};
    const years = goals.years || {};
    const y = now.getFullYear();
    const m = now.getMonth();
    const day = now.getDate();
    const thisM = monthKeyOf(now);
    const nextM = monthKeyOf(new Date(y, m + 1, 1));
    if (day >= 25 && !goalsFilled((months[nextM] || {}).goals)) {
      add({ id: "month-" + nextM, due: `${thisM}-25`, prio: 1, when: "毎月 25日〜", title: "今月の見直し(来月の目標を決める)", steps: monthSteps(1) });
    } else if (day <= 7 && !goalsFilled((months[thisM] || {}).goals)) {
      add({ id: "month-" + thisM, due: `${thisM}-01`, prio: 1, when: "毎月 1〜7日", title: "今月の目標を決める", steps: monthSteps(0) });
    }
    const hasYear = (k) => years[k] && String(years[k].goals || "").trim();
    if (m === 11 && day >= 20 && !hasYear(String(y + 1))) {
      add({ id: "year-" + (y + 1), due: `${y}-12-20`, prio: 0, when: "毎年 12/20〜", title: "ありたい姿の書き直し(来年の目標)", steps: yearSteps(1) });
    } else if (m === 0 && !hasYear(String(y))) {
      add({ id: "year-" + y, due: `${y}-01-01`, prio: 0, when: "毎年 1月", title: "ありたい姿の書き直し(今年の目標)", steps: yearSteps(0) });
    }
  }

  // 5. 規格外さん巡回(毎月1日から7日まで)
  if (now.getDate() <= 7) {
    const k = monthKeyOf(now);
    add({ id: "patrol-" + k, due: `${k}-01`, prio: 4, when: "毎月 1〜7日", title: "規格外さん巡回", steps: patrolSteps() });
  }

  // 6. Claudeのチェックが届いた(まだ読んでいないもの)
  const fbFiles = (feedback || []).filter((f) => f.type === "file" && /\.md$/.test(f.name));
  fbFiles.sort((a, b) => (a.name < b.name ? 1 : -1));
  const unread = fbFiles.find((f) => !st.done["fb-" + f.name]);
  if (unread) {
    const m = unread.name.match(/\d{4}-\d{2}-\d{2}/);
    add({
      id: "fb-" + unread.name,
      due: m ? m[0] : today,
      prio: 5,
      when: "毎晩 22時",
      title: "Claudeのチェックが届きました",
      steps: [
        { text: `「${unread.name.replace(/\.md$/, "")}」を読む`, act: ["読む", () => openFeedback(unread)] },
        { text: "次に試すことを、日記の「試すこと」に書くか決める" },
      ],
    });
  }

  tasks.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.prio - b.prio));
  return tasks;
}

function addDaysDate(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

async function openFeedback(f) {
  const s = loadSettings();
  openDocModal(f.name, "読み込み中...");
  try {
    const { content } = await githubGetFile(s, f.path);
    openDocModal(f.name.replace(/\.md$/, "") + "(Claudeのチェック)", content || "(空)");
  } catch (e) {
    openDocModal(f.name, "エラー: " + e.message);
  }
}

// ---------- 次の予定(定期作業のうち、一番近いもの) ----------

const WEEK_JA = ["日", "月", "火", "水", "木", "金", "土"];

// 明日以降で、一番近い定期作業を1つ返す { date, title }
function nextScheduled(now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const list = [];
  // 振り返り: 次の土曜日(今日が土曜なら来週の土曜)
  const toSat = ((6 - now.getDay() + 7) % 7) || 7;
  list.push({ date: new Date(y, m, d + toSat), title: "週の振り返り", prio: 2 });
  // 月の見直し: 25日(今日が25日以降なら来月の25日)
  list.push({ date: d < 25 ? new Date(y, m, 25) : new Date(y, m + 1, 25), title: "月の見直し", prio: 1 });
  // 規格外さん巡回: 来月の1日
  list.push({ date: new Date(y, m + 1, 1), title: "規格外さん巡回", prio: 4 });
  // ありたい姿の書き直し: 12/20(過ぎていれば来年の12/20)
  list.push({ date: m === 11 && d >= 20 ? new Date(y + 1, 11, 20) : new Date(y, 11, 20), title: "ありたい姿の書き直し", prio: 0 });
  list.sort((a, b) => a.date - b.date || a.prio - b.prio);
  return list[0];
}

// 「次は 11/28(土) 週の振り返り」の文字を作る
function nextScheduleText() {
  const n = nextScheduled();
  const md = `${n.date.getMonth() + 1}/${n.date.getDate()}(${WEEK_JA[n.date.getDay()]})`;
  return `次の予定: ${md} ${n.title}`;
}

// ---------- 画面 ----------

function renderNext() {
  const box = document.getElementById("nextCard");
  if (!box) return;
  const t = nextTasks[0];
  if (!t) {
    box.className = "card next-card none";
    box.innerHTML =
      `<div class="next-label">次にやること</div><div class="next-none">今はありません ✓</div>` +
      `<div class="next-sched">${escapeHtml(nextScheduleText())}</div>`;
    return;
  }
  const st = nextState();
  const doneCount = Math.min(st.step[t.id] || 0, t.steps.length);
  const rest = nextTasks.length - 1;
  let html =
    `<button class="next-head" id="nextHeadBtn" aria-expanded="${nextOpen}">` +
    `<span class="next-label">次にやること${rest ? `<span class="next-rest">次の次にやること(${rest}つ)</span>` : ""}</span>` +
    `<span class="next-title">${t.when ? `<span class="next-when">${escapeHtml(t.when)}</span>` : ""}${escapeHtml(t.title)}</span>` +
    `<span class="next-prog">手順 ${doneCount}/${t.steps.length}　${nextOpen ? "▲ とじる" : "▼ タップで手順"}</span>` +
    `</button>`;
  if (nextOpen) {
    html += `<ol class="next-steps">`;
    t.steps.forEach((step, i) => {
      if (i < doneCount) {
        html += `<li class="done">✓ ${escapeHtml(step.text)}</li>`;
      } else if (i === doneCount) {
        html += `<li class="cur"><div>${escapeHtml(step.text)}</div><div class="next-btns">`;
        if (step.act) html += `<button class="next-act" id="nextActBtn">${escapeHtml(step.act[0])}</button>`;
        html += `<button class="next-ok" id="nextOkBtn">できた ✓</button></div></li>`;
      }
    });
    const left = t.steps.length - doneCount - 1;
    html += `</ol>`;
    if (left > 0) html += `<div class="next-left">このあと ${left} 手順</div>`;
    if (doneCount > 0) html += `<button class="next-back" id="nextBackBtn">1つ戻す</button>`;
    // 次の次にやること(待っている作業の一覧)
    if (rest) {
      html += `<div class="next-queue"><div class="next-queue-h">次の次にやること(${rest}つ)</div><ul>`;
      nextTasks.slice(1).forEach((q) => {
        html += `<li>${q.when ? `<span class="next-when">${escapeHtml(q.when)}</span>` : ""}${escapeHtml(q.title)}</li>`;
      });
      html += `</ul></div>`;
    }
  }
  html += nextOpen
    ? `<button type="button" class="next-sched next-sched-in next-sched-btn" id="nextSchedBtn"><span>${escapeHtml(nextScheduleText())}</span><span class="next-close">▲ 閉じる</span></button>`
    : `<div class="next-sched next-sched-in">${escapeHtml(nextScheduleText())}</div>`;
  box.className = "card next-card";
  box.innerHTML = html;

  document.getElementById("nextHeadBtn").addEventListener("click", () => {
    nextOpen = !nextOpen;
    renderNext();
  });
  // 一番下の「次の予定」を押しても閉じられる(上まで戻らなくてよい)
  const schedBtn = document.getElementById("nextSchedBtn");
  if (schedBtn) schedBtn.addEventListener("click", () => {
    nextOpen = false;
    renderNext();
  });
  const cur = t.steps[doneCount];
  const actBtn = document.getElementById("nextActBtn");
  if (actBtn && cur && cur.act) actBtn.addEventListener("click", cur.act[1]);
  const okBtn = document.getElementById("nextOkBtn");
  if (okBtn) okBtn.addEventListener("click", () => stepDone(t));
  const backBtn = document.getElementById("nextBackBtn");
  if (backBtn) backBtn.addEventListener("click", () => {
    const s = nextState();
    s.step[t.id] = Math.max(0, (s.step[t.id] || 0) - 1);
    saveNextState(s);
    renderNext();
  });
}

// 手順を1つ終えた。全部終えたら、その作業を「終わった」にして次の作業へ
function stepDone(t) {
  const s = nextState();
  const n = (s.step[t.id] || 0) + 1;
  if (n >= t.steps.length) {
    s.done[t.id] = todayStr();
    delete s.step[t.id];
    nextTasks = nextTasks.filter((x) => x.id !== t.id);
    nextOpen = false;
  } else {
    s.step[t.id] = n;
  }
  saveNextState(s);
  renderNext();
}

// GitHubを読み直して出し直す(保存のあとにも呼ぶ)
async function refreshNext() {
  try {
    nextTasks = await collectNextTasks();
  } catch (e) {
    console.error(e);
  }
  renderNext();
}

// 開いたとき・アプリに戻ってきたときに読み直す
window.addEventListener("load", refreshNext);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") refreshNext();
});
