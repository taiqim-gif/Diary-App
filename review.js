// ② 振り返りタブ(週1回)
// app.js の関数(loadSettings, githubGetFile, githubPutFile, loadDiary, parseDayBlocks など)を使う
const REVIEW_DRAFT_PREFIX = "sdlReviewDraft-"; // 書きかけ(週ごと・この端末だけ)
const REVIEW_FOLDER = "analysis/review"; // 振り返りの保存先
const FEEDBACK_FOLDER = "feedback"; // Claudeのチェックの置き場

let reviewWeek = null; // { key: "2026-W48", start, end }
let reviewDays = []; // その週の日記(1日1件)
let reviewPrevTrials = []; // 先週の「試すこと」
let reviewMarks = {}; // 日付 → "good"(動けた) / "bad"(動けなかった)
let reviewWordScope = "week"; // よく出る言葉の範囲 "week" / "all"
let reviewExistingSha = null; // その週の振り返りが保存済みなら、その版

// ---------- 週の計算 ----------

function dayAdd(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

// ISO週番号(月曜はじまり。年の最初の木曜を含む週が第1週)
function isoWeekKey(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dow = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dow);
  const y = t.getUTCFullYear();
  const w = Math.ceil(((t - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7);
  return `${y}-W${pad2(w)}`;
}

// offset: 0=今週、-1=先週
function weekInfo(offset) {
  const now = new Date();
  const dow = now.getDay() || 7; // 月=1 … 日=7
  const start = dayAdd(now, -dow + 1 + offset * 7);
  const end = dayAdd(start, 6);
  return { offset, key: isoWeekKey(start), start, end };
}

function md(dateStr) {
  // "2026-11-24" → "11/24(火)"
  const [y, m, d] = dateStr.split("-").map(Number);
  const w = "日月火水木金土"[new Date(y, m - 1, d).getDay()];
  return `${m}/${d}(${w})`;
}

// ---------- 日記から読み取る ----------

function dayInfo(block) {
  const text = block.lines.join("\n");
  const pick = (re) => {
    const x = text.match(re);
    return x ? x[1].trim() : "";
  };
  // 新しい形(## 21:30 タイトル)の見出し
  const titles = block.lines.filter((l) => /^## \d{1,2}:\d{2} /.test(l)).map((l) => l.slice(3));
  // 古い形は、自由記述の最初の1行を代わりに使う
  const free = pick(/^- \(\d{1,2}:\d{2}\)(?: \[タグ:[^\]]*\])? (.+)$/m);
  // 1日に何件も書いたときは、最後(一番新しい)の記録を使う
  const last = (re) => {
    const all = [...text.matchAll(re)];
    return all.length ? all[all.length - 1][1].trim() : "";
  };
  return {
    date: block.date,
    text,
    titles,
    free,
    cond: pick(/体調:\s*([^\s　]+)/),
    sleep: pick(/睡眠(?:時間)?:\s*([\d.]+)/),
    weather: pick(/^- 天気:\s*([^\s(（]+)/m),
    moon: pick(/^- 月齢:\s*([\d.]+ [^(（\s]+)/m),
    trials: [...text.matchAll(/^- \*\*試すこと:\*\*\s*(.+)$/gm)].map((x) => x[1].trim()),
    act: last(/行動:\s*(動けた|動けなかった)/g), // 日記の「今日は動けた？」
    trialResult: last(/^- \*\*試すことの結果:\*\*\s*(できた|できなかった)/gm), // 前の日の試すこと
    weekTrialResult: last(/^- \*\*今週試すことの結果:\*\*\s*(できた|できなかった)/gm),
    maxTemp: pick(/^- 天気:.*?最高(-?[\d.]+)℃/m),
  };
}

function daysInRange(content, start, end) {
  const from = dateKey(start);
  const to = dateKey(end);
  return parseDayBlocks(content)
    .blocks.filter((b) => b.date >= from && b.date <= to)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map(dayInfo);
}

function daySummary(d) {
  const parts = [];
  if (d.cond) parts.push(d.cond);
  if (d.sleep) parts.push(`睡眠${d.sleep}h`);
  if (d.weather) parts.push(d.weather);
  if (d.moon) parts.push(`月齢${d.moon}`);
  return parts.join("・");
}

// ---------- よく出る言葉 ----------

// 漢字・カタカナ・英字のまとまりを言葉として数える(ひらがなだけの言葉は数えない)
const STOP_WORDS = new Set([
  "今日", "明日", "昨日", "自分", "時間", "日記", "自己分析", "体調", "睡眠", "睡眠時間",
  "自由記述", "タグ", "天気", "月齢", "試", "基本", "振", "返", "質問", "感", "思",
  "良", "普通", "不調", "絶好調", "最高", "最低", "降水", "満月", "新月",
]);

// 36問の質問文(昔の日記では「- 質問文」の形で残っているので、数えない)
const QUESTION_TEXTS = new Set(typeof QUESTIONS !== "undefined" ? QUESTIONS.map((q) => q.text) : []);

function countWords(texts) {
  const counts = {};
  texts.forEach((t) => {
    // 書いた中身だけを数える(項目名・質問文・天気などの記録は除く)
    const body = t
      .split("\n")
      .filter((l) => !/^\s*(# |---|タグ:|date:|links:|tags:|condition:|sleep:|- 天気:|- 月齢:|- 体調:|- 睡眠:|- 行動:|体調:)/.test(l))
      .filter((l) => !l.includes("**Q:**") && !l.includes("**試すこと:**") && !l.includes("試すことの結果:**"))
      .filter((l) => !QUESTION_TEXTS.has(l.replace(/^\s*-\s*/, "").replace(/\s*\(\d{1,2}:\d{2}\)\s*$/, "").trim()))
      .map((l) => {
        if (!l.startsWith("## ")) return l;
        const m = l.match(/^## \d{1,2}:\d{2} (.*)$/); // 新しい形の見出しは、タイトルだけ使う
        return m ? m[1] : "";
      })
      .map((l) => l.replace(/\[タグ:[^\]]*\]/g, "").replace(/\{#[^}]*\}/g, ""))
      .join("\n");
    const seen = new Set();
    (body.match(/[一-龠々〆ヵヶ]{2,}|[ァ-ヴー]{2,}|[A-Za-z]{3,}/g) || []).forEach((w) => {
      // 同じ日に何度出ても1と数える(何日に出たか)
      if (STOP_WORDS.has(w) || /^ー+$/.test(w) || seen.has(w)) return;
      counts[w] = (counts[w] || 0) + 1;
      seen.add(w);
    });
  });
  return Object.entries(counts)
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, 20);
}

// ---------- 書きかけ(この端末だけ) ----------

const REVIEW_FIELDS = ["rvEvent", "rvA", "rvB", "rvC", "rvD", "rvDiff", "rvRules", "rvNextTrial"];

function reviewDraftKey() {
  return REVIEW_DRAFT_PREFIX + reviewWeek.key;
}

function saveReviewDraft() {
  if (!reviewWeek) return;
  const d = { marks: reviewMarks, trials: {} };
  REVIEW_FIELDS.forEach((id) => (d[id] = document.getElementById(id).value));
  document.querySelectorAll(".rv-trial-result").forEach((el) => (d.trials[el.dataset.key] = el.value));
  lsSet(reviewDraftKey(), JSON.stringify(d));
}

function loadReviewDraft() {
  let d = null;
  try {
    d = JSON.parse(lsGet(reviewDraftKey()) || "null");
  } catch (e) {
    d = null;
  }
  REVIEW_FIELDS.forEach((id) => (document.getElementById(id).value = (d && d[id]) || ""));
  reviewMarks = (d && d.marks) || {};
  return (d && d.trials) || {};
}

// ---------- 画面を作る ----------

async function openReviewTab(offset) {
  if (offset === undefined) {
    // 月・火は先週、それ以外は今週を出す(週末にふり返る前提)
    const dow = new Date().getDay();
    offset = reviewWeek ? reviewWeek.offset : dow === 1 || dow === 2 ? -1 : 0;
  }
  reviewWeek = weekInfo(offset);
  document.getElementById("rvWeekLabel").textContent =
    `${reviewWeek.key}　${md(dateKey(reviewWeek.start))}〜${md(dateKey(reviewWeek.end))}`;
  document.getElementById("rvPrevWeekBtn").classList.toggle("on", offset === -1);
  document.getElementById("rvThisWeekBtn").classList.toggle("on", offset === 0);
  document.getElementById("rvStatus").textContent = "";
  document.getElementById("rvNextWeekLabel").textContent =
    `${md(dateKey(dayAdd(reviewWeek.start, 7)))}〜${md(dateKey(dayAdd(reviewWeek.start, 13)))}`;

  const trialDraft = loadReviewDraft();
  const daysEl = document.getElementById("rvDays");

  if (!hasSettings(loadSettings())) {
    daysEl.textContent = "先に設定(「私の日記」を長押し)を入力してください";
    return;
  }
  daysEl.textContent = "読み込み中...";
  try {
    const content = await loadDiary(true);
    reviewDays = daysInRange(content, reviewWeek.start, reviewWeek.end);
    reviewPrevTrials = daysInRange(content, dayAdd(reviewWeek.start, -7), dayAdd(reviewWeek.start, -1));
    // 日記で「動けた/動けなかった」を押してある日は、最初からその印を付けておく
    reviewDays.forEach((d) => {
      if (!(d.date in reviewMarks) && d.act) reviewMarks[d.date] = d.act === "動けた" ? "good" : "bad";
    });
    renderReviewDays();
    renderMarks();
    renderWords();
    renderTrials(trialDraft);
    checkSavedReview();
    loadFeedbackList();
  } catch (e) {
    daysEl.textContent = "エラー: " + e.message;
  }
}

// 1. その週の日記(出来事を1つ選ぶ)
function renderReviewDays() {
  const el = document.getElementById("rvDays");
  el.innerHTML = "";
  if (!reviewDays.length) {
    el.textContent = "この週の日記はありません";
    return;
  }
  reviewDays.forEach((d) => {
    const row = document.createElement("div");
    row.className = "rv-day";
    const items = d.titles.length ? d.titles : [d.free || "(見出しなし)"];
    row.innerHTML =
      `<div class="rv-day-head"><strong>${escapeHtml(md(d.date))}</strong>` +
      `<span class="snippet">${escapeHtml(daySummary(d))}</span>` +
      `<button class="small-btn rv-read">読む</button></div>`;
    items.forEach((t) => {
      const b = document.createElement("button");
      b.className = "rv-pick";
      b.textContent = t;
      b.addEventListener("click", () => {
        document.getElementById("rvEvent").value = `${md(d.date)} ${t}`;
        saveReviewDraft();
      });
      row.appendChild(b);
    });
    row.querySelector(".rv-read").addEventListener("click", () => {
      openViewModalShell();
      showEntry(d.date);
    });
    el.appendChild(row);
  });
}

// 3. 動けた日・動けなかった日
function renderMarks() {
  const el = document.getElementById("rvMarks");
  el.innerHTML = "";
  if (!reviewDays.length) {
    el.textContent = "この週の日記はありません";
  }
  reviewDays.forEach((d) => {
    const row = document.createElement("div");
    row.className = "rv-mark-row";
    row.innerHTML = `<span class="rv-mark-date">${escapeHtml(md(d.date))}</span>`;
    [
      ["good", "◯ 動けた"],
      ["bad", "× 動けなかった"],
    ].forEach(([v, label]) => {
      const b = document.createElement("button");
      b.className = "rv-mark" + (reviewMarks[d.date] === v ? " on " + v : "");
      b.textContent = label;
      b.addEventListener("click", () => {
        reviewMarks[d.date] = reviewMarks[d.date] === v ? "" : v;
        saveReviewDraft();
        renderMarks();
      });
      row.appendChild(b);
    });
    el.appendChild(row);
  });

  // 見比べ(体調・睡眠・天気・月齢)
  const cmp = document.getElementById("rvCompare");
  const group = (v) => reviewDays.filter((d) => reviewMarks[d.date] === v);
  const list = (arr) =>
    arr.length
      ? arr.map((d) => `<li>${escapeHtml(md(d.date))} ${escapeHtml(daySummary(d) || "(記録なし)")}</li>`).join("")
      : "<li class='snippet'>まだ選んでいません</li>";
  cmp.innerHTML =
    `<div class="rv-cmp good"><div class="being-label">◯ 動けた日</div><ul>${list(group("good"))}</ul></div>` +
    `<div class="rv-cmp bad"><div class="being-label">× 動けなかった日</div><ul>${list(group("bad"))}</ul></div>`;
}

// 4. よく出る言葉
function renderWords() {
  const el = document.getElementById("rvWords");
  document.getElementById("rvWordWeekBtn").classList.toggle("on", reviewWordScope === "week");
  document.getElementById("rvWordAllBtn").classList.toggle("on", reviewWordScope === "all");
  const texts =
    reviewWordScope === "week"
      ? reviewDays.map((d) => d.text)
      : parseDayBlocks((viewCache && viewCache.content) || "").blocks.map((b) => b.lines.join("\n"));
  const words = countWords(texts);
  el.innerHTML = "";
  if (!words.length) {
    el.innerHTML = "<span class='snippet'>2日以上に出てくる言葉はまだありません</span>";
    return;
  }
  words.forEach(([w, n]) => {
    const b = document.createElement("button");
    b.className = "tag-pill";
    b.textContent = `${w} ${n}日`;
    b.addEventListener("click", () => {
      const area = document.getElementById("rvRules");
      area.value = (area.value ? area.value.replace(/\n*$/, "\n") : "") + `・${w}: `;
      area.focus();
      saveReviewDraft();
    });
    el.appendChild(b);
  });
}

// 5. 先週の「試すこと」の結果
function renderTrials(draft) {
  const el = document.getElementById("rvTrials");
  el.innerHTML = "";
  const all = [];
  reviewPrevTrials.forEach((d) => d.trials.forEach((t) => all.push({ date: d.date, text: t, when: "先週" })));
  reviewDays.forEach((d) => d.trials.forEach((t) => all.push({ date: d.date, text: t, when: "今週" })));
  if (!all.length) {
    el.innerHTML = "<span class='snippet'>この週と前の週に「試すこと」はありません</span>";
    return;
  }
  all.forEach((t, i) => {
    const key = `${t.date}#${i}`;
    const box = document.createElement("div");
    box.className = "rv-trial";
    box.innerHTML =
      `<div><span class="cat-label">${t.when} ${escapeHtml(md(t.date))}</span> ${escapeHtml(t.text)}</div>` +
      `<input type="text" class="rv-trial-result" placeholder="結果(どうだったか)">`;
    const input = box.querySelector("input");
    input.dataset.key = key;
    input.dataset.label = `${md(t.date)} ${t.text}`;
    input.value = (draft && draft[key]) || "";
    input.addEventListener("input", saveReviewDraft);
    el.appendChild(box);
  });
}

// ---------- 保存 ----------

function reviewPath() {
  return `${REVIEW_FOLDER}/${reviewWeek.key}.md`;
}

async function checkSavedReview() {
  const s = loadSettings();
  const info = document.getElementById("rvSavedInfo");
  info.textContent = "";
  reviewExistingSha = null;
  document.getElementById("rvSaveBtn").textContent = "振り返りを保存";
  try {
    const { content, sha } = await githubGetFile(s, reviewPath());
    if (content !== null) {
      reviewExistingSha = sha;
      info.textContent = "この週の振り返りは保存済みです(保存し直すと上書きします)";
      document.getElementById("rvSaveBtn").textContent = "振り返りを上書き保存";
      document.getElementById("rvSavedReadBtn").style.display = "inline-block";
      document.getElementById("rvSavedReadBtn").onclick = () => openDocModal(`${reviewWeek.key} の振り返り`, content);
    } else {
      document.getElementById("rvSavedReadBtn").style.display = "none";
    }
  } catch (e) {
    /* 読めなくても保存はできる */
  }
}

function buildReviewMarkdown() {
  const v = (id) => document.getElementById(id).value.trim();
  const line = (label, text) => `- ${label}: ${text ? text.replace(/\n/g, "\n  ") : "(なし)"}`;
  const group = (g) =>
    reviewDays
      .filter((d) => reviewMarks[d.date] === g)
      .map((d) => `${md(d.date)}(${daySummary(d) || "記録なし"})`)
      .join("、") || "(なし)";
  const words = countWords(reviewDays.map((d) => d.text))
    .map(([w, n]) => `${w}(${n}日)`)
    .join("、");
  const trials = [...document.querySelectorAll(".rv-trial-result")].map(
    (el) => `- ${el.dataset.label} → 結果: ${el.value.trim() || "(未記入)"}`
  );
  const now = new Date();
  return [
    `# ${reviewWeek.key} の振り返り`,
    "",
    `期間: ${dateKey(reviewWeek.start)} 〜 ${dateKey(reviewWeek.end)}　書いた日時: ${dateKey(now)} ${timeStr()}`,
    `日記: ${reviewDays.length}日分(${reviewDays.map((d) => md(d.date)).join("、") || "なし"})`,
    "",
    "## 1. 選んだ出来事",
    v("rvEvent") || "(なし)",
    "",
    "## 2. 具体→本質→応用→教訓",
    line("具体的な経験・出来事", v("rvA")),
    line("そこから抽出した本質・法則", v("rvB")),
    line("他の分野への応用", v("rvC")),
    line("自分への教訓・躾け", v("rvD")),
    "",
    "## 3. 動けた日・動けなかった日",
    `- 動けた日: ${group("good")}`,
    `- 動けなかった日: ${group("bad")}`,
    line("違い(誰に会い、何を読み、どんな予定だったか)", v("rvDiff")),
    "",
    "## 4. よく出た言葉と自分ルールの候補",
    `- 今週よく出た言葉: ${words || "(なし)"}`,
    "- 自分ルールの候補:",
    ...(v("rvRules") ? v("rvRules").split("\n").map((l) => "  " + l) : ["  (なし)"]),
    "",
    "## 5. 試すことの結果",
    ...(trials.length ? trials : ["(なし)"]),
    "",
    // 日記タブはこの見出しを探して「今週試すこと」を出す(見出しの文字は変えない)
    "## 6. 次の週で試すこと",
    v("rvNextTrial").replace(/\s*\n\s*/g, " ") || "(なし)",
    "",
  ].join("\n");
}

async function saveReview() {
  const s = loadSettings();
  const status = document.getElementById("rvStatus");
  if (!hasSettings(s)) {
    status.textContent = "先に設定(「私の日記」を長押し)を入力してください";
    return;
  }
  const filled = REVIEW_FIELDS.some((id) => document.getElementById(id).value.trim());
  if (!filled) {
    status.textContent = "入力がありません";
    return;
  }
  const btn = document.getElementById("rvSaveBtn");
  btn.disabled = true;
  status.textContent = "保存中...";
  try {
    const text = buildReviewMarkdown();
    // 保存の直前に最新の版を取り直す(ほかの端末で保存されていても上書きできるように)
    const { sha } = await githubGetFile(s, reviewPath());
    await githubPutFile(s, reviewPath(), text, sha, `review: ${reviewWeek.key}`);
    lsRemove(reviewDraftKey());
    status.textContent = "保存しました ✓(22時のClaudeのチェックで読まれます)";
    if (typeof playSaveSound === "function") playSaveSound(); // 保存の音(sound.js)
    if (typeof weekTrialCache !== "undefined") weekTrialCache = {}; // 日記タブの「今週試すこと」を読み直す
    if (typeof loadTrialChecks === "function") loadTrialChecks();
    if (typeof refreshNext === "function") refreshNext(); // 「次にやること」を出し直す(next.js)
    checkSavedReview();
  } catch (e) {
    status.textContent = "エラー: " + e.message + "(書いた内容は消えていません)";
  } finally {
    btn.disabled = false;
  }
}

// ---------- Claudeのチェック・過去の振り返りを読む ----------

async function loadFeedbackList() {
  const s = loadSettings();
  const el = document.getElementById("rvFeedback");
  el.textContent = "読み込み中...";
  try {
    const lists = await Promise.all(
      [FEEDBACK_FOLDER, REVIEW_FOLDER].map((f) =>
        githubListFolder(s, f).catch(() => [])
      )
    );
    const items = [];
    lists[0].forEach((f) => f.type === "file" && /\.md$/.test(f.name) && items.push({ kind: "Claudeのチェック", f }));
    lists[1].forEach((f) => f.type === "file" && /\.md$/.test(f.name) && items.push({ kind: "自分の振り返り", f }));
    items.sort((a, b) => (a.f.name < b.f.name ? 1 : a.f.name > b.f.name ? -1 : a.kind < b.kind ? -1 : 1));
    el.innerHTML = "";
    if (!items.length) {
      el.textContent = "まだありません";
      return;
    }
    items.slice(0, 12).forEach(({ kind, f }) => {
      const b = document.createElement("button");
      b.className = "browse-q-item";
      b.innerHTML = `<strong>${escapeHtml(f.name.replace(/\.md$/, ""))}</strong> <span class="snippet">${kind}</span>`;
      b.addEventListener("click", async () => {
        openDocModal(f.name, "読み込み中...");
        try {
          const { content } = await githubGetFile(s, f.path);
          openDocModal(f.name.replace(/\.md$/, "") + "(" + kind + ")", content || "(空)");
        } catch (e) {
          openDocModal(f.name, "エラー: " + e.message);
        }
      });
      el.appendChild(b);
    });
  } catch (e) {
    el.textContent = "エラー: " + e.message;
  }
}

function openDocModal(title, text) {
  document.getElementById("docModalTitle").textContent = title;
  document.getElementById("docContent").textContent = text;
  document.getElementById("doc-modal").classList.add("open");
}

function closeDocModal() {
  document.getElementById("doc-modal").classList.remove("open");
}

// ---------- 初期化 ----------

on("rvPrevWeekBtn", "click", () => openReviewTab(-1));
on("rvThisWeekBtn", "click", () => openReviewTab(0));
on("rvWordWeekBtn", "click", () => {
  reviewWordScope = "week";
  renderWords();
});
on("rvWordAllBtn", "click", () => {
  reviewWordScope = "all";
  renderWords();
});
on("rvSaveBtn", "click", saveReview);
on("closeDocBtn", "click", closeDocModal);
REVIEW_FIELDS.forEach((id) => on(id, "input", saveReviewDraft));
