// ④ 分析タブ(よく出る言葉のランキング・動けた日と動けなかった日の比べ)
// app.js と review.js の関数(loadDiary, parseDayBlocks, dayInfo, countWords, md など)を使う
// 日記を読むだけで、GitHubには何も書かない

const AN_RANGE_DAYS = { "30": 30, "90": 90, all: 0 }; // 0 は全期間
let anRange = "30";
let anBasis = "act"; // 見分け方 "act"(動けた？) / "trial"(試すこと) / "week"(今週の試すこと)
let anDays = []; // 期間内の日記(1日1件)
let anWord = ""; // 押した言葉

// 見分け方ごとの名前
const AN_BASIS = {
  act: { good: "◯ 動けた", bad: "× 動けなかった", key: (d) => (d.act === "動けた" ? "good" : d.act === "動けなかった" ? "bad" : "") },
  trial: { good: "◯ できた", bad: "× できなかった", key: (d) => resultKey(d.trialResult) },
  week: { good: "◯ できた", bad: "× できなかった", key: (d) => resultKey(d.weekTrialResult) },
};

function resultKey(r) {
  return r === "できた" ? "good" : r === "できなかった" ? "bad" : "";
}

// ---------- 画面を開く ----------

async function openAnalysisTab() {
  document.querySelectorAll("[data-an-range]").forEach((b) => b.classList.toggle("on", b.dataset.anRange === anRange));
  document.querySelectorAll("[data-an-basis]").forEach((b) => b.classList.toggle("on", b.dataset.anBasis === anBasis));
  const info = document.getElementById("anInfo");
  if (!hasSettings(loadSettings())) {
    info.textContent = "先に設定(⚙️)を入力してください";
    return;
  }
  info.textContent = "読み込み中...";
  try {
    const content = await loadDiary(true);
    const all = parseDayBlocks(content).blocks.map(dayInfo).sort((a, b) => (a.date < b.date ? -1 : 1));
    const n = AN_RANGE_DAYS[anRange];
    const from = n ? addDays(todayStr(), -(n - 1)) : "";
    anDays = all.filter((d) => d.date >= from);
    info.textContent = anDays.length
      ? `日記 ${anDays.length}日分(${md(anDays[0].date)}〜${md(anDays[anDays.length - 1].date)})`
      : "この期間の日記はありません";
    renderAnWords();
    renderAnCompare();
  } catch (e) {
    info.textContent = "エラー: " + e.message;
  }
}

// ---------- 1. よく出る言葉 ----------

function renderAnWords() {
  const el = document.getElementById("anWords");
  const words = countWords(anDays.map((d) => d.text)); // 2日以上に出た言葉の上位20
  el.innerHTML = "";
  if (!words.length) {
    el.innerHTML = "<span class='snippet'>2日以上に出てくる言葉はまだありません</span>";
    document.getElementById("anWordDays").innerHTML = "";
    return;
  }
  const top = words[0][1];
  words.forEach(([w, n], i) => {
    const b = document.createElement("button");
    b.className = "an-word" + (w === anWord ? " on" : "");
    b.innerHTML =
      `<span class="an-rank">${i + 1}</span><span class="an-w">${escapeHtml(w)}</span>` +
      `<span class="an-bar"><i style="width:${Math.round((n / top) * 100)}%"></i></span>` +
      `<span class="an-n">${n}日</span>`;
    b.addEventListener("click", () => {
      anWord = anWord === w ? "" : w; // もう一度押すと閉じる
      renderAnWords();
    });
    el.appendChild(b);
  });
  renderAnWordDays();
}

// 押した言葉が出てくる日(新しい順)。押すとその日の日記を開く
function renderAnWordDays() {
  const el = document.getElementById("anWordDays");
  el.innerHTML = "";
  if (!anWord) {
    el.innerHTML = "<p class='hint' style='margin:8px 0 0;'>言葉を押すと、その言葉が出てくる日を出します</p>";
    return;
  }
  const head = document.createElement("div");
  head.className = "being-label";
  head.style.marginTop = "10px";
  head.textContent = `「${anWord}」が出てくる日`;
  el.appendChild(head);
  anDays
    .filter((d) => d.text.includes(anWord))
    .slice()
    .reverse()
    .forEach((d) => {
      const pos = d.text.indexOf(anWord);
      const flat = d.text.slice(Math.max(0, pos - 20), pos + 40).replace(/\s+/g, " ");
      const b = document.createElement("button");
      b.className = "browse-q-item";
      b.innerHTML = `<strong>${escapeHtml(md(d.date))}</strong><br><span class="snippet">…${escapeHtml(flat)}…</span>`;
      b.addEventListener("click", () => {
        openViewModalShell();
        showEntry(d.date);
      });
      el.appendChild(b);
    });
}

// ---------- 2. 動けた日と動けなかった日 ----------

// 天気の言葉を、晴れ・くもり・雨・雪の4つにまとめる(最初に出てくるもの)
function weatherKind(text) {
  if (!text) return "";
  const marks = [
    ["晴", "晴れ"],
    ["くもり", "くもり"],
    ["曇", "くもり"],
    ["雨", "雨"],
    ["雪", "雪"],
  ];
  let best = null;
  marks.forEach(([m, name]) => {
    const i = text.indexOf(m);
    if (i >= 0 && (!best || i < best.i)) best = { i, name };
  });
  return best ? best.name : "その他";
}

// 月齢を4つに分ける(新月0、上弦7.4、満月14.8、下弦22.1 のあたり)
function moonKind(moonText) {
  const age = parseFloat(moonText);
  if (!isFinite(age)) return "";
  if (age < 3.7 || age >= 25.9) return "新月ごろ";
  if (age < 11.1) return "満ちていく";
  if (age < 18.5) return "満月ごろ";
  return "欠けていく";
}

// 数の多い順に「良い3・普通1」の形にする
function tally(values) {
  const c = {};
  values.filter(Boolean).forEach((v) => (c[v] = (c[v] || 0) + 1));
  const s = Object.entries(c)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k}${n}`)
    .join("・");
  return s ? escapeHtml(s) : "<span class='snippet'>記録なし</span>";
}

// 平均(記録のある日だけ)
function average(values, unit) {
  const nums = values.map(parseFloat).filter((v) => isFinite(v));
  if (!nums.length) return "<span class='snippet'>記録なし</span>";
  const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
  return `${avg.toFixed(1)}${unit} <span class="snippet">(${nums.length}日分)</span>`;
}

// できた割合
function doneRate(values) {
  const ok = values.filter((v) => v === "できた").length;
  const ng = values.filter((v) => v === "できなかった").length;
  if (!ok && !ng) return "<span class='snippet'>記録なし</span>";
  return `${Math.round((ok / (ok + ng)) * 100)}% <span class="snippet">(${ok}/${ok + ng})</span>`;
}

function renderAnCompare() {
  const el = document.getElementById("anCompare");
  const basis = AN_BASIS[anBasis];
  const good = anDays.filter((d) => basis.key(d) === "good");
  const bad = anDays.filter((d) => basis.key(d) === "bad");
  const none = anDays.length - good.length - bad.length;
  if (!good.length && !bad.length) {
    const how =
      anBasis === "act"
        ? "日記タブの「今日は動けた？」を押して保存すると、ここで比べられます"
        : "日記タブで「試すことはできた？」を押して保存すると、ここで比べられます";
    el.innerHTML = `<p class="snippet" style="margin:0;">まだ記録がありません。${how}</p>`;
    return;
  }

  const rows = [
    ["日数", (g) => `${g.length}日`],
    ["睡眠(平均)", (g) => average(g.map((d) => d.sleep), "時間")],
    ["体調", (g) => tally(g.map((d) => d.cond))],
    ["天気", (g) => tally(g.map((d) => weatherKind(d.weather)))],
    ["最高気温(平均)", (g) => average(g.map((d) => d.maxTemp), "℃")],
    ["月", (g) => tally(g.map((d) => moonKind(d.moon)))],
  ];
  if (anBasis === "act") {
    // 動けた日に、試すことができていたか
    rows.push(["試すこと できた割合", (g) => doneRate(g.map((d) => d.trialResult))]);
    rows.push(["今週の試すこと できた割合", (g) => doneRate(g.map((d) => d.weekTrialResult))]);
  } else {
    // 試すことができた日に、動けていたか
    rows.push(["動けた日", (g) => tally(g.map((d) => d.act))]);
  }
  rows.push(["日ごと", (g) => dayList(g)]);

  el.innerHTML =
    `<table class="an-tbl"><thead><tr><th></th>` +
    `<th class="an-good">${basis.good}</th><th class="an-bad">${basis.bad}</th></tr></thead><tbody>` +
    rows.map(([label, f]) => `<tr><th>${escapeHtml(label)}</th><td>${f(good)}</td><td>${f(bad)}</td></tr>`).join("") +
    `</tbody></table>` +
    (none ? `<p class="hint" style="margin:6px 0 0;">記録のない日 ${none}日は入れていません</p>` : "");

  // 日ごとの日付を押すと、その日の日記を開く
  el.querySelectorAll("[data-an-date]").forEach((b) =>
    b.addEventListener("click", () => {
      openViewModalShell();
      showEntry(b.dataset.anDate);
    })
  );
}

// 日ごとの一覧(たたんでおき、押すと開く)
function dayList(g) {
  if (!g.length) return "<span class='snippet'>なし</span>";
  const items = g
    .slice()
    .reverse()
    .map(
      (d) =>
        `<div><button class="small-btn" data-an-date="${escapeHtml(d.date)}">${escapeHtml(md(d.date))}</button>` +
        `<span class="snippet">${escapeHtml(daySummary(d))}</span></div>`
    )
    .join("");
  return `<details><summary>${g.length}日を見る</summary>${items}</details>`;
}

// ---------- 初期化 ----------

document.querySelectorAll("[data-an-range]").forEach((b) =>
  b.addEventListener("click", () => {
    anRange = b.dataset.anRange;
    openAnalysisTab();
  })
);
document.querySelectorAll("[data-an-basis]").forEach((b) =>
  b.addEventListener("click", () => {
    anBasis = b.dataset.anBasis;
    document.querySelectorAll("[data-an-basis]").forEach((x) => x.classList.toggle("on", x === b));
    renderAnCompare();
  })
);
