// 日記×自己分析 - アプリ本体
// ①日記タブ(天気・月齢つき)。振り返り・目標・分析タブはあとで作る
const SETTINGS_KEY = "shinkaronDiarySettings";
const BEING_KEY = "sdlBeing"; // ありたい姿(目標タブができるまで、この端末に保存)
const DRAFT_KEY = "sdlDraft"; // 書きかけの日記(この端末だけ)

const CATEGORY_ORDER = [
  "1. 基本の振り返り",
  "2. 自己躾け",
  "3. 理想と現実のギャップ",
  "4. 言語化・構造化",
  "5. コミットメント",
];

// 規格外さんの行動方針(Xの本人の投稿 2026-11-07～11-24 の68件から抜き出した10個)
const POLICIES = [
  "未来の自分に贈り物をする(波及効果の高いものから)",
  "小さく攻める(土台は守る)",
  "すぐに見返りを求めない",
  "くり返すことは仕組みにする・小さな作業を用意する",
  "失敗は、次に変える点だけを読み取る",
  "借り物の目標を持たない",
  "相手に誠実に(断りやすい頼み方・返事をする・褒める・けなさない)",
  "知っているより、やっている",
  "お金と正面から向き合う",
  "言葉にして残す",
];

let hint = null; // 今出している書き始めのヒント { cat, text }
let viewCache = null; // GitHubから読んだ日記ファイル { content }
let currentViewDate = null;
let wx = null; // 天気の部品
let timeTouched = false; // 日時を手で変えたか

// ---------- ユーティリティ ----------

function pad2(n) {
  return String(n).padStart(2, "0");
}

function dateKey(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function todayStr() {
  return dateKey(new Date());
}

function timeStr() {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

// datetime-local の入力欄に入れる形(2026-11-24T21:30)
function localDateTimeValue(d) {
  return `${dateKey(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function b64EncodeUnicode(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

function b64DecodeUnicode(b64) {
  const binary = atob(b64.replace(/\n/g, ""));
  const bytes = new Uint8Array([...binary].map((c) => c.charCodeAt(0)));
  return new TextDecoder("utf-8").decode(bytes);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setStatus(msg) {
  document.getElementById("status").textContent = msg;
}

// 端末への保存(使えないときも止まらないように)
function lsGet(key) {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

function lsSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    /* 保存できなくても続ける */
  }
}

function lsRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch (e) {
    /* 何もしない */
  }
}

// ---------- 設定 ----------

function loadSettings() {
  const raw = lsGet(SETTINGS_KEY);
  try {
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function saveSettingsToStorage(s) {
  lsSet(SETTINGS_KEY, JSON.stringify(s));
}

function hasSettings(s) {
  return !!(s && s.pat && s.owner && s.repo);
}

function openSettings() {
  const s = loadSettings() || {};
  document.getElementById("patInput").value = s.pat || "";
  document.getElementById("ownerInput").value = s.owner || "";
  document.getElementById("repoInput").value = s.repo || "";
  document.getElementById("branchInput").value = s.branch || "main";
  document.getElementById("pathInput").value = diaryFilePath(s);
  document.getElementById("settings-panel").classList.add("open");
  document.getElementById("main-panel").classList.add("hidden");
}

function settingsFromForm() {
  return {
    pat: document.getElementById("patInput").value.trim(),
    owner: document.getElementById("ownerInput").value.trim(),
    repo: document.getElementById("repoInput").value.trim(),
    branch: document.getElementById("branchInput").value.trim() || "main",
    path: document.getElementById("pathInput").value.trim() || "diary/日記.md",
  };
}

function closeSettings() {
  saveSettingsToStorage(settingsFromForm());
  document.getElementById("settings-panel").classList.remove("open");
  document.getElementById("main-panel").classList.remove("hidden");
  viewCache = null;
  loadLookback();
}

// ---------- タブ ----------

function showTab(name) {
  document.querySelectorAll(".tab-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === name);
  });
  document.querySelectorAll(".tab-panel").forEach((p) => {
    p.classList.toggle("active", p.id === "tab-" + name);
  });
}

// ---------- ありたい姿と今日の行動方針 ----------

function renderBeing() {
  const text = lsGet(BEING_KEY) || "";
  const el = document.getElementById("beingText");
  el.textContent = text || "(まだありません。✏️ を押して書く)";
  el.classList.toggle("empty", !text);
}

function startEditBeing() {
  document.getElementById("beingEdit").value = lsGet(BEING_KEY) || "";
  document.getElementById("beingView").style.display = "none";
  document.getElementById("beingForm").style.display = "block";
}

function saveBeing() {
  lsSet(BEING_KEY, document.getElementById("beingEdit").value.trim());
  document.getElementById("beingForm").style.display = "none";
  document.getElementById("beingView").style.display = "flex";
  renderBeing();
}

function cancelBeing() {
  document.getElementById("beingForm").style.display = "none";
  document.getElementById("beingView").style.display = "flex";
}

// 日付で決まるので、同じ日は同じ方針が出る
function todayPolicy() {
  const d = new Date();
  const dayNo = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
  return POLICIES[dayNo % POLICIES.length];
}

// ---------- 書き始めのヒント(質問を1つ) ----------

// 「基本の振り返り」を半分の確率で、残りはほかの4項目から出す
function pickHint() {
  const basic = QUESTIONS.filter((q) => q.cat === CATEGORY_ORDER[0]);
  const others = QUESTIONS.filter((q) => q.cat !== CATEGORY_ORDER[0]);
  for (let i = 0; i < 10; i++) {
    const pool = Math.random() < 0.5 ? basic : others;
    const q = pool[Math.floor(Math.random() * pool.length)];
    if (!hint || q.text !== hint.text) return q;
  }
  return QUESTIONS[0];
}

function renderHint() {
  document.getElementById("hintCat").textContent = hint.cat;
  document.getElementById("hintText").textContent = hint.text;
}

function nextHint() {
  hint = pickHint();
  document.getElementById("hintAnswer").value = "";
  renderHint();
  saveDraft();
}

function openBrowseModal() {
  const listEl = document.getElementById("browseList");
  listEl.innerHTML = "";
  CATEGORY_ORDER.forEach((cat) => {
    const title = document.createElement("div");
    title.className = "browse-cat-title";
    title.textContent = cat;
    listEl.appendChild(title);
    QUESTIONS.filter((q) => q.cat === cat).forEach((q) => {
      const btn = document.createElement("button");
      btn.className = "browse-q-item";
      btn.textContent = q.text;
      btn.addEventListener("click", () => {
        hint = q;
        document.getElementById("hintAnswer").value = "";
        renderHint();
        saveDraft();
        closeBrowseModal();
      });
      listEl.appendChild(btn);
    });
  });
  document.getElementById("browse-modal").classList.add("open");
}

function closeBrowseModal() {
  document.getElementById("browse-modal").classList.remove("open");
}

// ---------- 書きかけの保存(この端末だけ) ----------

function saveDraft() {
  const draft = {
    title: document.getElementById("titleInput").value,
    body: document.getElementById("bodyInput").value,
    answer: document.getElementById("hintAnswer").value,
    trial: document.getElementById("trialInput").value,
    condition: document.getElementById("conditionSelect").value,
    sleep: document.getElementById("sleepInput").value,
    hint,
  };
  lsSet(DRAFT_KEY, JSON.stringify(draft));
}

function restoreDraft() {
  let d = null;
  try {
    d = JSON.parse(lsGet(DRAFT_KEY) || "null");
  } catch (e) {
    d = null;
  }
  if (!d) return false;
  document.getElementById("titleInput").value = d.title || "";
  document.getElementById("bodyInput").value = d.body || "";
  document.getElementById("hintAnswer").value = d.answer || "";
  document.getElementById("trialInput").value = d.trial || "";
  document.getElementById("conditionSelect").value = d.condition || "";
  document.getElementById("sleepInput").value = d.sleep || "";
  if (d.hint && d.hint.text) hint = d.hint;
  return true;
}

function clearForm() {
  ["titleInput", "bodyInput", "hintAnswer", "trialInput", "sleepInput"].forEach((id) => {
    document.getElementById(id).value = "";
  });
  document.getElementById("conditionSelect").value = "";
  lsRemove(DRAFT_KEY);
  timeTouched = false;
  document.getElementById("whenInput").value = localDateTimeValue(new Date());
}

// ---------- 天気と月齢 ----------

function mountWeather() {
  if (!window.JmaWeather) return;
  try {
    wx = JmaWeather.mount({
      target: document.getElementById("wxHere"),
      storagePrefix: "sdlWx", // このアプリ用の保存の名前
      defaultPoint: "21323", // 現在地が取れないときは胆振地方(気温は室蘭)
    });
  } catch (e) {
    console.error(e);
    wx = null;
  }
}

// 保存する日記に書く「天気」と「月齢」の行を作る
function weatherLines(dateStr) {
  const lines = [];
  if (!window.JmaWeather) return lines;
  const now = Date.now();
  const isToday = dateStr === todayStr();

  // 天気は、今日の日記のときだけ記録する(予報なので、過去の日には使えない)
  if (isToday && wx) {
    try {
      const d = wx.data();
      if (d && d.weathers && d.weathers.length) {
        const t = JmaWeather.days(d, now)[0];
        const parts = [];
        if (t.text) parts.push(t.text);
        if (t.max != null) parts.push(`最高${t.max}℃`);
        if (t.min != null) parts.push(`最低${t.min}℃`);
        const pop = t.popsNow && t.popsNow[0] ? t.popsNow[0].v : null;
        if (pop !== null && pop !== "") parts.push(`降水${pop}%`);
        if (d.areaName) parts.push(`(${d.areaName})`);
        const old = now - Date.parse(d.fetchedAt) > 3 * 3600 * 1000;
        if (old) parts.push("※古い予報");
        if (parts.length) lines.push(`- 天気: ${parts.join(" ")}`);
      }
    } catch (e) {
      console.error(e);
    }
  }

  // 月齢は計算なので、いつでも出せる(その日の日時で計算)
  try {
    const when = new Date(document.getElementById("whenInput").value);
    const ms = isNaN(when.getTime()) ? now : when.getTime();
    const m = JmaWeather.moon(ms);
    lines.push(`- 月齢: ${m.age} ${m.name}(${m.trend}、光っている割合${m.illum}%)`);
  } catch (e) {
    console.error(e);
  }
  return lines;
}

// ---------- 日記ファイル(1ファイル運用) ----------

function buildSkeleton(dateStr) {
  const year = dateStr.slice(0, 4);
  return `# ${dateStr} の日記\n\n---\nタグ: #日記 #${year} #自己分析\n`;
}

// 設定のpathは「ファイルのパス」。旧設定(フォルダ名のみ)の場合は 日記.md を補う
function diaryFilePath(settings) {
  const p = ((settings && settings.path) || "diary").trim();
  return p.endsWith(".md") ? p : `${p.replace(/\/+$/, "")}/日記.md`;
}

// 「# YYYY-MM-DD の日記」から次の「# 」見出し(=次の日)の手前までを1日分とする
function getDayBlock(lines, dateStr) {
  const heading = `# ${dateStr} の日記`;
  const start = lines.findIndex((l) => l.trim() === heading);
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith("# ")) {
      end = i;
      break;
    }
  }
  return { start, end };
}

// 指定日のブロックだけを transformFn で書き換えて、ファイル全体を返す。
// その日のブロックが無ければ新しく作り、日付の新しい順になる位置に置く。
function updateDayBlock(fullContent, dateStr, transformFn) {
  const parsed = parseDayBlocks(fullContent || "");
  const idx = parsed.blocks.findIndex((b) => b.date === dateStr);
  if (idx === -1) {
    const text = transformFn(buildSkeleton(dateStr));
    parsed.blocks.push({ date: dateStr, lines: text.replace(/\n+$/, "").split("\n") });
  } else {
    const text = transformFn(parsed.blocks[idx].lines.join("\n").replace(/\n+$/, ""));
    parsed.blocks[idx].lines = text.replace(/\n+$/, "").split("\n");
  }
  return buildDiaryFile(parsed.preamble, parsed.blocks);
}

// 日記ファイルを「日付ブロックの配列」に分解する
function parseDayBlocks(content) {
  const lines =
    content.trim() === "" ? [] : content.replace(/\r\n/g, "\n").replace(/\n+$/, "").split("\n");
  const preamble = [];
  const blocks = [];
  let cur = null;
  for (const l of lines) {
    const m = l.match(/^# (\d{4}-\d{2}-\d{2}) の日記/);
    if (m) {
      cur = { date: m[1], lines: [l] };
      blocks.push(cur);
    } else if (cur) {
      cur.lines.push(l);
    } else {
      preamble.push(l);
    }
  }
  return { preamble, blocks };
}

// 新しい日が上になるよう並べ直して1つの文字列にする
function buildDiaryFile(preamble, blocks) {
  const parts = [];
  if (preamble.join("").trim()) parts.push(preamble.join("\n").replace(/\n+$/, ""));
  blocks
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .forEach((b) => parts.push(b.lines.join("\n").replace(/\n+$/, "")));
  return parts.join("\n\n") + "\n";
}

function listDiaryDates(content) {
  return parseDayBlocks(content)
    .blocks.map((b) => b.date)
    .sort()
    .reverse();
}

function extractDayText(content, dateStr) {
  const lines = content.split("\n");
  const block = getDayBlock(lines, dateStr);
  if (!block) return "";
  return lines.slice(block.start, block.end).join("\n").trim();
}

// その日のブロックの「---(タグの行)」の手前に、見出しと中身を足す
function appendSectionBeforeTags(content, heading, block) {
  const lines = content.split("\n");
  let tagIdx = lines.findIndex((l) => l.startsWith("---"));
  if (tagIdx === -1) tagIdx = lines.length;
  const before = lines.slice(0, tagIdx);
  const after = lines.slice(tagIdx);
  if (before.length && before[before.length - 1].trim() !== "") before.push("");
  before.push(`## ${heading}`, block, "");
  return [...before, ...after].join("\n");
}

// 本文の中の「# 」「---」で始まる行は、日の区切りやタグの行と間違えるので、形を少し変える
function safeText(text) {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => {
      if (/^#\s/.test(l)) return "＃" + l.slice(1);
      if (/^---/.test(l)) return "ー" + l.slice(1);
      return l;
    })
    .join("\n")
    .trim();
}

// 日記を開いたまま別の日へ移すときの、見出し合わせ(編集の保存で使う)
function normalizeImportedDay(date, raw) {
  const lines = raw.replace(/\r\n/g, "\n").replace(/\n+$/, "").split("\n");
  const heading = `# ${date} の日記`;
  if (lines[0] && lines[0].trim() === heading) {
    // そのまま
  } else if (lines[0] && lines[0].startsWith("# ")) {
    lines[0] = heading;
  } else {
    lines.unshift(heading, "");
  }
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].startsWith("# ")) lines[i] = "#" + lines[i];
  }
  return lines.join("\n");
}

// ---------- GitHub API ----------

async function githubGetFile(settings, filePath) {
  const url = `https://api.github.com/repos/${settings.owner}/${settings.repo}/contents/${filePath}?ref=${settings.branch}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${settings.pat}`,
      Accept: "application/vnd.github+json",
    },
    cache: "no-store",
  });
  if (res.status === 404) return { content: null, sha: null };
  if (!res.ok) throw new Error(`GitHub取得エラー: ${res.status}`);
  const data = await res.json();
  return { content: b64DecodeUnicode(data.content), sha: data.sha };
}

async function githubPutFile(settings, filePath, content, sha, message) {
  const url = `https://api.github.com/repos/${settings.owner}/${settings.repo}/contents/${filePath}`;
  const body = { message, content: b64EncodeUnicode(content), branch: settings.branch };
  if (sha) body.sha = sha;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${settings.pat}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GitHub保存エラー: ${res.status} ${errText}`);
  }
}

async function githubListFolder(settings, folderPath) {
  const url = `https://api.github.com/repos/${settings.owner}/${settings.repo}/contents/${folderPath}?ref=${settings.branch}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${settings.pat}`,
      Accept: "application/vnd.github+json",
    },
  });
  if (!res.ok) throw new Error(`一覧取得エラー: ${res.status}`);
  return res.json();
}

// 日記ファイルを読む(読んだものは覚えておき、検索や1年前の表示に使う)
async function loadDiary(force) {
  if (viewCache && !force) return viewCache.content;
  const settings = loadSettings();
  const { content } = await githubGetFile(settings, diaryFilePath(settings));
  viewCache = { content: content || "" };
  return viewCache.content;
}

// ---------- 保存 ----------

async function handleSave() {
  const settings = loadSettings();
  if (!hasSettings(settings)) {
    setStatus("先に設定(⚙️)を入力してください");
    openSettings();
    return;
  }

  const title = document.getElementById("titleInput").value.trim();
  const body = safeText(document.getElementById("bodyInput").value);
  const answer = safeText(document.getElementById("hintAnswer").value);
  const trial = document.getElementById("trialInput").value.trim().replace(/\s*\n\s*/g, " ");
  const condition = document.getElementById("conditionSelect").value;
  const sleep = document.getElementById("sleepInput").value;

  if (!title && !body && !answer && !trial) {
    setStatus("入力がありません");
    return;
  }

  // 日時(手で変えていなければ、保存した時刻)
  let when = new Date(document.getElementById("whenInput").value);
  if (!timeTouched || isNaN(when.getTime())) when = new Date();
  const dateStr = dateKey(when);
  const hm = `${pad2(when.getHours())}:${pad2(when.getMinutes())}`;

  const saveBtn = document.getElementById("saveBtn");
  saveBtn.disabled = true;
  setStatus("保存中...");

  try {
    // 1件分の中身を組み立てる
    const meta = weatherLines(dateStr);
    if (condition || sleep) {
      const parts = [];
      if (condition) parts.push(`体調: ${condition}`);
      if (sleep) parts.push(`睡眠: ${sleep}時間`);
      meta.push(`- ${parts.join("　")}`);
    }
    const chunks = [];
    if (meta.length) chunks.push(meta.join("\n"));
    if (body) chunks.push(body);
    if (answer && hint) {
      const a = answer.split("\n").join("\n    ");
      chunks.push(`- **Q:** ${hint.text}\n  - ${a}`);
    }
    if (trial) chunks.push(`- **試すこと:** ${trial}`);
    const heading = `${hm} ${title || "(タイトルなし)"}`;
    const entry = chunks.join("\n\n");

    // 保存の直前にGitHubの最新を読み、その日のブロックだけを書き換える
    const filePath = diaryFilePath(settings);
    const { content, sha } = await githubGetFile(settings, filePath);
    const newContent = updateDayBlock(content || "", dateStr, (b) =>
      appendSectionBeforeTags(b, heading, entry)
    );
    await githubPutFile(settings, filePath, newContent, sha, `diary: ${dateStr} ${hm}`);

    viewCache = { content: newContent };
    setStatus("保存しました ✓");
    clearForm();
    nextHint();
    loadLookback();
  } catch (e) {
    console.error(e);
    setStatus("エラー: " + e.message + "(書いた内容は消えていません)");
  } finally {
    saveBtn.disabled = false;
  }
}

// ---------- 1年前の今日 ----------

function oneYearAgo() {
  const d = new Date();
  const y = d.getFullYear() - 1;
  let m = d.getMonth();
  let day = d.getDate();
  if (m === 1 && day === 29) day = 28; // うるう日は2月28日にする
  return dateKey(new Date(y, m, day));
}

async function loadLookback() {
  const box = document.getElementById("lookbackBody");
  const btn = document.getElementById("lookbackOpenBtn");
  const target = oneYearAgo();
  document.getElementById("lookbackDate").textContent = target;
  btn.style.display = "none";
  if (!hasSettings(loadSettings())) {
    box.textContent = "設定(⚙️)を入れると表示します";
    return;
  }
  box.textContent = "読み込み中...";
  try {
    const content = await loadDiary(false);
    const text = extractDayText(content, target);
    if (!text) {
      box.textContent = "この日の日記はまだありません";
      return;
    }
    const lines = text.split("\n").slice(1).join("\n").replace(/---[\s\S]*$/, "").trim();
    box.textContent = lines.length > 160 ? lines.slice(0, 160) + "…" : lines || "(空)";
    btn.style.display = "inline-block";
  } catch (e) {
    box.textContent = "読めませんでした: " + e.message;
  }
}

// ---------- 検索 ----------

async function runSearch() {
  const q = document.getElementById("searchInput").value.trim();
  const out = document.getElementById("searchResults");
  out.innerHTML = "";
  if (!q) return;
  if (!hasSettings(loadSettings())) {
    out.textContent = "先に設定(⚙️)を入力してください";
    return;
  }
  out.textContent = "検索中...";
  try {
    const content = await loadDiary(true);
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const hits = parseDayBlocks(content).blocks.filter((b) => {
      const t = b.lines.join("\n").toLowerCase();
      return words.every((w) => t.includes(w)); // すべての言葉を含む日
    });
    out.innerHTML = "";
    const count = document.createElement("p");
    count.className = "hint";
    count.textContent = `${hits.length}日分 見つかりました`;
    out.appendChild(count);
    hits
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .forEach((b) => {
        const text = b.lines.slice(1).join(" ").replace(/\s+/g, " ");
        const pos = text.toLowerCase().indexOf(words[0]);
        const from = Math.max(0, pos - 20);
        const snippet = (from > 0 ? "…" : "") + text.slice(from, from + 60) + "…";
        const btn = document.createElement("button");
        btn.className = "browse-q-item";
        btn.innerHTML = `<strong>${escapeHtml(b.date)}</strong><br><span class="snippet">${escapeHtml(snippet)}</span>`;
        btn.addEventListener("click", () => {
          openViewModalShell();
          showEntry(b.date);
        });
        out.appendChild(btn);
      });
  } catch (e) {
    out.textContent = "エラー: " + e.message;
  }
}

// ---------- 過去の日記を見る・直す ----------

function openViewModalShell() {
  document.getElementById("viewModalTitle").textContent = "過去の日記";
  document.getElementById("viewStatus").textContent = "";
  document.getElementById("view-modal").classList.add("open");
}

async function openViewModal() {
  if (!hasSettings(loadSettings())) {
    setStatus("先に設定(⚙️)を入力してください");
    openSettings();
    return;
  }
  openViewModalShell();
  setViewMode("list");
  const listEl = document.getElementById("viewDateList");
  listEl.textContent = "読み込み中...";
  try {
    const content = await loadDiary(true);
    const dates = listDiaryDates(content);
    listEl.innerHTML = "";
    if (dates.length === 0) {
      listEl.textContent = "まだ日記がありません";
      return;
    }
    dates.forEach((d) => {
      const btn = document.createElement("button");
      btn.className = "browse-q-item";
      btn.textContent = d;
      btn.addEventListener("click", () => showEntry(d));
      listEl.appendChild(btn);
    });
  } catch (e) {
    listEl.textContent = "エラー: " + e.message;
  }
}

function setViewMode(mode) {
  // mode: "list"(日付一覧) / "read"(閲覧) / "edit"(編集)
  const $ = (id) => document.getElementById(id);
  $("viewDateList").style.display = mode === "list" ? "block" : "none";
  $("viewContent").style.display = mode === "read" ? "block" : "none";
  $("viewEditArea").style.display = mode === "edit" ? "block" : "none";
  $("viewActions").style.display = mode === "list" ? "none" : "flex";
  $("editEntryBtn").style.display = mode === "read" ? "inline-block" : "none";
  $("cancelEditBtn").style.display = mode === "edit" ? "inline-block" : "none";
  $("saveEditBtn").style.display = mode === "edit" ? "inline-block" : "none";
}

function showEntry(dateStr) {
  currentViewDate = dateStr;
  document.getElementById("viewModalTitle").textContent = dateStr;
  document.getElementById("viewStatus").textContent = "";
  document.getElementById("viewContent").textContent = viewCache
    ? extractDayText(viewCache.content, dateStr) || "(空)"
    : "(読み込みに失敗しました)";
  setViewMode("read");
}

// 編集開始:PC側で更新されている可能性があるので、必ず最新をGitHubから取り直す
async function startEditEntry() {
  const statusEl = document.getElementById("viewStatus");
  statusEl.textContent = "最新を取得中...";
  try {
    const content = await loadDiary(true);
    document.getElementById("viewEditArea").value = extractDayText(content, currentViewDate);
    statusEl.textContent = "";
    setViewMode("edit");
  } catch (e) {
    statusEl.textContent = "エラー: " + e.message;
  }
}

function cancelEditEntry() {
  document.getElementById("viewStatus").textContent = "";
  setViewMode("read");
}

// 保存:その日のブロックだけを差し替える(他の日は触らない)
async function saveEditEntry() {
  const settings = loadSettings();
  const statusEl = document.getElementById("viewStatus");
  const saveBtn = document.getElementById("saveEditBtn");
  const text = document.getElementById("viewEditArea").value;
  if (!text.trim()) {
    statusEl.textContent = "空にはできません";
    return;
  }
  saveBtn.disabled = true;
  statusEl.textContent = "保存中...";
  try {
    const filePath = diaryFilePath(settings);
    const { content, sha } = await githubGetFile(settings, filePath);
    const newContent = updateDayBlock(content || "", currentViewDate, () =>
      normalizeImportedDay(currentViewDate, text)
    );
    await githubPutFile(settings, filePath, newContent, sha, `diary: ${currentViewDate} edit`);
    viewCache = { content: newContent };
    document.getElementById("viewContent").textContent =
      extractDayText(newContent, currentViewDate) || "(空)";
    setViewMode("read");
    statusEl.textContent = "保存しました ✓";
  } catch (e) {
    statusEl.textContent = "エラー: " + e.message;
  } finally {
    saveBtn.disabled = false;
  }
}

function closeViewModal() {
  document.getElementById("view-modal").classList.remove("open");
  document.getElementById("viewStatus").textContent = "";
  setViewMode("list");
}

// ---------- 初期化 ----------

function on(id, ev, fn) {
  document.getElementById(id).addEventListener(ev, fn);
}

document.querySelectorAll(".tab-btn").forEach((b) => {
  b.addEventListener("click", () => showTab(b.dataset.tab));
});
on("gearBtn", "click", openSettings);
on("saveSettingsBtn", "click", closeSettings);
on("beingEditBtn", "click", startEditBeing);
on("beingSaveBtn", "click", saveBeing);
on("beingCancelBtn", "click", cancelBeing);
on("hintNextBtn", "click", nextHint);
on("browseQuestionsBtn", "click", openBrowseModal);
on("closeBrowseBtn", "click", closeBrowseModal);
on("saveBtn", "click", handleSave);
on("searchBtn", "click", runSearch);
on("searchInput", "keydown", (e) => {
  if (e.key === "Enter") runSearch();
});
on("lookbackOpenBtn", "click", () => {
  openViewModalShell();
  showEntry(oneYearAgo());
});
on("viewPastBtn", "click", openViewModal);
on("closeViewBtn", "click", closeViewModal);
on("editEntryBtn", "click", startEditEntry);
on("cancelEditBtn", "click", cancelEditEntry);
on("saveEditBtn", "click", saveEditEntry);
on("whenInput", "change", () => {
  timeTouched = true;
});
["titleInput", "bodyInput", "hintAnswer", "trialInput", "conditionSelect", "sleepInput"].forEach(
  (id) => on(id, "input", saveDraft)
);

// 日時は、手で変えていなければ1分ごとに今の時刻に合わせる
document.getElementById("whenInput").value = localDateTimeValue(new Date());
setInterval(() => {
  if (!timeTouched) document.getElementById("whenInput").value = localDateTimeValue(new Date());
}, 60000);

document.getElementById("policyText").textContent = todayPolicy();
renderBeing();
if (!restoreDraft() || !hint) hint = pickHint();
renderHint();
mountWeather();
showTab("diary");

if (!hasSettings(loadSettings())) {
  openSettings();
} else {
  loadLookback();
}
