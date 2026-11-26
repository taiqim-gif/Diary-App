// ③ 目標タブ(ありたい姿・年の目標・月の目標)
// app.js の関数(loadSettings, githubGetFile, githubPutFile, lsGet, lsSet など)を使う
const GOAL_PATH = "analysis/goals.json"; // 目標の保存先(1ファイル)
const GOAL_DRAFT_KEY = "sdlGoalDraft"; // 書きかけ(この端末だけ)
const GOAL_STATES = ["未着手", "途中", "達成", "やめた"];

let goalData = null; // GitHubから読んだ目標 { being, whys, years, months }
let goalSha = null; // 保存されている版
let goalYearOffset = 0; // 0=今年、1=来年
let goalMonthOffset = 0; // -1=先月、0=今月、1=来月
let goalDirty = false; // 保存していない変更があるか

// ---------- データの形 ----------

function emptyGoalData() {
  return { being: "", whys: ["", "", ""], beingUpdated: "", years: {}, months: {} };
}

function normalizeGoalData(d) {
  const g = Object.assign(emptyGoalData(), d || {});
  while (g.whys.length < 3) g.whys.push("");
  g.years = g.years || {};
  g.months = g.months || {};
  return g;
}

function goalYearKey() {
  return String(new Date().getFullYear() + goalYearOffset);
}

function goalMonthKey(offset) {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + (offset === undefined ? goalMonthOffset : offset), 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function prevMonthKey(key) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function yearOf(key) {
  if (!goalData.years[key]) goalData.years[key] = { goals: "", discard: "" };
  return goalData.years[key];
}

function monthOf(key) {
  if (!goalData.months[key]) goalData.months[key] = { goals: [], memo: "" };
  return goalData.months[key];
}

// ---------- 書きかけ(この端末だけ) ----------

function saveGoalDraft() {
  goalDirty = true;
  lsSet(GOAL_DRAFT_KEY, JSON.stringify({ sha: goalSha, data: goalData }));
  document.getElementById("glStatus").textContent = "まだ保存していません";
}

function loadGoalDraft() {
  try {
    return JSON.parse(lsGet(GOAL_DRAFT_KEY) || "null");
  } catch (e) {
    return null;
  }
}

// ---------- 読み込み ----------

// GitHubから目標を読む(ありたい姿は上のカードにも出す)
async function loadGoals() {
  const s = loadSettings();
  if (!hasSettings(s)) return false;
  const { content, sha } = await githubGetFile(s, GOAL_PATH);
  let data = null;
  try {
    data = content ? JSON.parse(content) : null;
  } catch (e) {
    throw new Error("goals.json の形が壊れています");
  }
  goalSha = sha;
  goalData = normalizeGoalData(data);
  // まだGitHubにない時は、この端末に保存していたありたい姿を引き継ぐ
  if (!goalData.being && lsGet(BEING_KEY)) goalData.being = lsGet(BEING_KEY);
  // 保存していない書きかけがあれば、そちらを使う(同じ版から書いたものだけ)
  const draft = loadGoalDraft();
  if (draft && draft.data && draft.sha === goalSha) {
    goalData = normalizeGoalData(draft.data);
    goalDirty = true;
  } else {
    goalDirty = false;
  }
  lsSet(BEING_KEY, goalData.being || "");
  renderBeing();
  renderGoalLinks();
  return true;
}

async function openGoalTab() {
  const status = document.getElementById("glStatus");
  status.textContent = "読み込み中...";
  try {
    if (!(await loadGoals())) {
      status.textContent = "先に設定(「私の日記」を長押し)を入力してください";
      return;
    }
    renderGoalTab();
    status.textContent = goalDirty ? "まだ保存していません" : "";
  } catch (e) {
    status.textContent = "エラー: " + e.message;
  }
}

// ---------- つながり(ひとつ上の目標を、決める欄の上に出す) ----------
// ありたい姿 → 年 → 月 → 週(次の週で試すこと) → 翌日(試すこと)

function linkRow(label, text, emptyMsg) {
  const body = text
    ? `<span>${escapeHtml(text)}</span>`
    : `<span class="gl-empty">${escapeHtml(emptyMsg)} <button type="button" data-open-goal="1">目標タブで決める</button></span>`;
  return `<div class="gl-row"><span class="gl-k">${label}</span>${body}</div>`;
}

function monthGoalsText(key) {
  const m = goalData && goalData.months[key];
  const list = ((m && m.goals) || []).map((x) => String(x.text || "").trim()).filter(Boolean);
  return list.join(" ／ ");
}

function yearGoalsText(key) {
  const y = goalData && goalData.years[key];
  return String((y && y.goals) || "").split("\n").map((x) => x.trim()).filter(Boolean).join(" ／ ");
}

function setLink(id, html) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = html;
  el.querySelectorAll("[data-open-goal]").forEach((b) => b.addEventListener("click", () => showTab("goal")));
}

function renderGoalLinks() {
  if (!goalData) return;
  const nowKey = goalMonthKey(0);
  const monthText = monthGoalsText(nowKey);
  const head = (t) => `<div class="gl-h">${t}</div>`;

  // 日記「明日へ」: 今月の目標と、今週試すこと
  const week = (typeof trialItems !== "undefined" ? trialItems : []).find((x) => x.kind === "week");
  let html = head("つながり(ここから決める)") + linkRow("今月", monthText, "今月の目標がまだありません。");
  if (week) html += linkRow("今週", week.text, "");
  setLink("linkDiary", html);

  // 振り返り「次へ」: 今月の目標
  setLink("linkReview", head("つながり(ここから決める)") + linkRow("今月", monthText, "今月の目標がまだありません。"));

  // 目標「決める」: 選んでいる月の年の目標
  const mKey = goalMonthKey();
  const yKey = String(yearOf(mKey));
  setLink("linkMonth", head("つながり(ここから決める)") + linkRow(`${yKey}年`, yearGoalsText(yKey), "年の目標がまだありません(下の「大きな目標」で決める)。").replace(/ <button[^>]*>目標タブで決める<\/button>/, ""));

  // 目標「大きな目標」: ありたい姿
  const being = String(goalData.being || "").trim();
  setLink("linkYear", head("つながり(ここから決める)") + linkRow("ありたい姿", being, "ありたい姿がまだありません(下の「土台」で書く)。").replace(/ <button[^>]*>目標タブで決める<\/button>/, ""));
}

// ---------- 画面を作る ----------

function renderGoalTab() {
  if (!goalData) return;
  // ありたい姿となぜ
  document.getElementById("glBeing").value = goalData.being || "";
  ["glWhy1", "glWhy2", "glWhy3"].forEach((id, i) => (document.getElementById(id).value = goalData.whys[i] || ""));
  document.getElementById("glBeingUpdated").textContent = goalData.beingUpdated
    ? `最後に書き直した日: ${goalData.beingUpdated}`
    : "";
  renderGoalYear();
  renderGoalMonth();
  renderGoalLinks();
}

function renderGoalYear() {
  if (!goalData) return;
  const key = goalYearKey();
  document.getElementById("glThisYearBtn").classList.toggle("on", goalYearOffset === 0);
  document.getElementById("glNextYearBtn").classList.toggle("on", goalYearOffset === 1);
  document.getElementById("glYearLabel").textContent = `${key}年`;
  const y = goalData.years[key] || { goals: "", discard: "" };
  document.getElementById("glYearGoals").value = y.goals || "";
  document.getElementById("glYearDiscard").value = y.discard || "";
}

function renderGoalMonth() {
  if (!goalData) return;
  queueMicrotask(renderGoalLinks); // 月を切り替えたら、上の「つながり」(その年の目標)も直す
  const key = goalMonthKey();
  [-1, 0, 1].forEach((o, i) =>
    document.getElementById(["glPrevMonthBtn", "glThisMonthBtn", "glNextMonthBtn"][i]).classList.toggle("on", goalMonthOffset === o)
  );
  const [yy, mm] = key.split("-").map(Number);
  document.getElementById("glMonthLabel").textContent = `${yy}年${mm}月`;

  // その月が入る年の目標を、見える所に出す(月の目標を決める手がかり)
  const yg = (goalData.years[String(yy)] || {}).goals || "";
  document.getElementById("glMonthYearRef").textContent = yg ? `${yy}年の目標: ${yg.replace(/\n/g, " ／ ")}` : "";

  const m = goalData.months[key] || { goals: [], memo: "" };
  const list = document.getElementById("glMonthGoals");
  list.innerHTML = "";
  if (!m.goals.length) {
    list.innerHTML = "<p class='snippet' style='margin:0 0 8px;'>まだありません。下の「＋ 目標を足す」で追加</p>";
  }
  m.goals.forEach((g, i) => {
    const row = document.createElement("div");
    row.className = "gl-goal";
    const input = document.createElement("input");
    input.type = "text";
    input.value = g.text || "";
    input.placeholder = "月の目標(1つ)";
    input.addEventListener("input", () => {
      monthOf(key).goals[i].text = input.value;
      saveGoalDraft();
    });
    const states = document.createElement("div");
    states.className = "gl-states";
    GOAL_STATES.forEach((st) => {
      const b = document.createElement("button");
      b.className = "gl-state" + (g.state === st ? " on s" + GOAL_STATES.indexOf(st) : "");
      b.textContent = st;
      b.addEventListener("click", () => {
        monthOf(key).goals[i].state = st;
        saveGoalDraft();
        renderGoalMonth();
      });
      states.appendChild(b);
    });
    const del = document.createElement("button");
    del.className = "small-btn gl-del";
    del.textContent = "✕";
    del.setAttribute("aria-label", "この目標を消す");
    del.addEventListener("click", () => {
      monthOf(key).goals.splice(i, 1);
      saveGoalDraft();
      renderGoalMonth();
    });
    states.appendChild(del);
    row.appendChild(input);
    row.appendChild(states);
    list.appendChild(row);
  });

  // 前の月で「未着手・途中」のものがあれば、持ち越しボタンを出す
  const prev = goalData.months[prevMonthKey(key)];
  const left = prev ? prev.goals.filter((g) => g.text && (g.state === "未着手" || g.state === "途中" || !g.state)) : [];
  const carry = document.getElementById("glCarryBtn");
  carry.style.display = left.length ? "inline-block" : "none";
  carry.textContent = `前の月の残り(${left.length}件)を持ち越す`;

  document.getElementById("glMonthMemo").value = m.memo || "";
  renderGoalSummary(key, m);
}

// 進み具合(達成の数)
function renderGoalSummary(key, m) {
  const goals = m.goals.filter((g) => g.text);
  const done = goals.filter((g) => g.state === "達成").length;
  document.getElementById("glMonthSummary").textContent = goals.length
    ? `達成 ${done} / ${goals.length}件`
    : "";
}

// ---------- 操作 ----------

function addMonthGoal() {
  monthOf(goalMonthKey()).goals.push({ text: "", state: "未着手" });
  saveGoalDraft();
  renderGoalMonth();
  const inputs = document.querySelectorAll("#glMonthGoals input");
  if (inputs.length) inputs[inputs.length - 1].focus();
}

function carryOverGoals() {
  const key = goalMonthKey();
  const prev = goalData.months[prevMonthKey(key)];
  if (!prev) return;
  const now = monthOf(key);
  prev.goals
    .filter((g) => g.text && (g.state === "未着手" || g.state === "途中" || !g.state))
    .forEach((g) => {
      // 同じ目標がすでにあれば足さない
      if (!now.goals.some((x) => x.text === g.text)) now.goals.push({ text: g.text, state: "途中" });
    });
  saveGoalDraft();
  renderGoalMonth();
}

// 入力欄の内容を goalData に入れる
function bindGoalInputs() {
  on("glBeing", "input", (e) => {
    goalData.being = e.target.value;
    saveGoalDraft();
  });
  ["glWhy1", "glWhy2", "glWhy3"].forEach((id, i) =>
    on(id, "input", (e) => {
      goalData.whys[i] = e.target.value;
      saveGoalDraft();
    })
  );
  on("glYearGoals", "input", (e) => {
    yearOf(goalYearKey()).goals = e.target.value;
    saveGoalDraft();
  });
  on("glYearDiscard", "input", (e) => {
    yearOf(goalYearKey()).discard = e.target.value;
    saveGoalDraft();
  });
  on("glMonthMemo", "input", (e) => {
    monthOf(goalMonthKey()).memo = e.target.value;
    saveGoalDraft();
  });
}

// ---------- 保存 ----------

async function saveGoals() {
  const s = loadSettings();
  const status = document.getElementById("glStatus");
  if (!hasSettings(s) || !goalData) {
    status.textContent = "先に設定(「私の日記」を長押し)を入力してください";
    return;
  }
  const btn = document.getElementById("glSaveBtn");
  btn.disabled = true;
  status.textContent = "保存中...";
  try {
    // ありたい姿が変わっていたら、書き直した日を残す
    const { content, sha } = await githubGetFile(s, GOAL_PATH);
    let old = null;
    try {
      old = content ? JSON.parse(content) : null;
    } catch (e) {
      old = null;
    }
    if (!old || (old.being || "") !== (goalData.being || "")) goalData.beingUpdated = todayStr();
    // 空の月・年は残さない(ファイルを見やすくするため)
    Object.keys(goalData.months).forEach((k) => {
      const m = goalData.months[k];
      m.goals = m.goals.filter((g) => (g.text || "").trim());
      if (!m.goals.length && !(m.memo || "").trim()) delete goalData.months[k];
    });
    Object.keys(goalData.years).forEach((k) => {
      const y = goalData.years[k];
      if (!(y.goals || "").trim() && !(y.discard || "").trim()) delete goalData.years[k];
    });
    const text = JSON.stringify(goalData, null, 2) + "\n";
    await githubPutFile(s, GOAL_PATH, text, sha, `goal: ${todayStr()}`);
    lsRemove(GOAL_DRAFT_KEY);
    goalDirty = false;
    lsSet(BEING_KEY, goalData.being || "");
    renderBeing();
    await loadGoals();
    renderGoalTab();
    status.textContent = "保存しました ✓";
    if (typeof playSaveSound === "function") playSaveSound(); // 保存の音(sound.js)
    if (typeof refreshNext === "function") refreshNext(); // 「次にやること」を出し直す(next.js)
  } catch (e) {
    status.textContent = "エラー: " + e.message + "(書いた内容は消えていません)";
  } finally {
    btn.disabled = false;
  }
}

// ---------- 初期化 ----------

bindGoalInputs();
on("glThisYearBtn", "click", () => {
  goalYearOffset = 0;
  renderGoalYear();
});
on("glNextYearBtn", "click", () => {
  goalYearOffset = 1;
  renderGoalYear();
});
on("glPrevMonthBtn", "click", () => {
  goalMonthOffset = -1;
  renderGoalMonth();
});
on("glThisMonthBtn", "click", () => {
  goalMonthOffset = 0;
  renderGoalMonth();
});
on("glNextMonthBtn", "click", () => {
  goalMonthOffset = 1;
  renderGoalMonth();
});
on("glAddGoalBtn", "click", addMonthGoal);
on("glCarryBtn", "click", carryOverGoals);
on("glSaveBtn", "click", saveGoals);

// 起動時に読んで、上のカードのありたい姿をGitHubの内容に合わせる(失敗しても止めない)
if (hasSettings(loadSettings())) loadGoals().catch(() => {});
