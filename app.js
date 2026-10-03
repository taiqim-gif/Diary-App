// 規格外さん日記 - アプリ本体(循環対応版)
// 変更点: ①frontmatter(date/sleep/condition/links/tags) ②分析シート由来の質問 ③保存先の既定を diary に
const SETTINGS_KEY = "shinkaronDiarySettings";
const DEFAULT_PATH = "diary";
// 分析シート由来の質問プール(同じリポジトリ内)。形式: [{ "cell": "41d736e1", "q": "質問文" }]
const ANALYSIS_QUESTIONS_PATH = "analysis/questions.json";
const ANALYSIS_CAT = "6. 分析シート由来";

const CATEGORY_ORDER = [
  "1. 基本の振り返り",
  "2. 自己躾け",
  "3. 理想と現実のギャップ",
  "4. 言語化・構造化",
  "5. コミットメント",
];

let questionCards = []; // { id, question: {cat, text, cell?}, answer }
let analysisQuestions = []; // { cat: ANALYSIS_CAT, text, cell }
let selectedFreeTags = [];
let cardSeq = 0;

// ---------- ユーティリティ ----------

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function timeStr() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
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

function setStatus(msg) {
  document.getElementById("status").textContent = msg;
}

// 質問プール: 分析シート由来が空なら通常プールを使う
function poolFor(cat) {
  if (cat === ANALYSIS_CAT) return analysisQuestions;
  return QUESTIONS.filter((q) => q.cat === cat);
}

function allCategories() {
  return analysisQuestions.length > 0 ? [...CATEGORY_ORDER, ANALYSIS_CAT] : CATEGORY_ORDER;
}

function randomQuestionInCategory(cat) {
  const list = poolFor(cat);
  if (list.length === 0) return QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
  return list[Math.floor(Math.random() * list.length)];
}

// ---------- 設定 ----------

function loadSettings() {
  const raw = localStorage.getItem(SETTINGS_KEY);
  return raw ? JSON.parse(raw) : null;
}

function saveSettingsToStorage(s) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

function openSettings() {
  const s = loadSettings() || {};
  document.getElementById("patInput").value = s.pat || "";
  document.getElementById("ownerInput").value = s.owner || "";
  document.getElementById("repoInput").value = s.repo || "";
  document.getElementById("branchInput").value = s.branch || "main";
  document.getElementById("pathInput").value = s.path || DEFAULT_PATH;
  document.getElementById("settings-panel").classList.add("open");
  document.getElementById("main-panel").classList.add("hidden");
}

function closeSettings() {
  const s = {
    pat: document.getElementById("patInput").value.trim(),
    owner: document.getElementById("ownerInput").value.trim(),
    repo: document.getElementById("repoInput").value.trim(),
    branch: document.getElementById("branchInput").value.trim() || "main",
    path: document.getElementById("pathInput").value.trim() || DEFAULT_PATH,
  };
  saveSettingsToStorage(s);
  document.getElementById("settings-panel").classList.remove("open");
  document.getElementById("main-panel").classList.remove("hidden");
  loadAnalysisQuestions(); // 設定変更後に質問プールを再取得
}

// ---------- 質問カードUI ----------

function addQuestionCard(cat) {
  const id = ++cardSeq;
  const question = randomQuestionInCategory(cat);
  questionCards.push({ id, question, answer: "" });
  renderQuestionCards();
}

function initDefaultCards() {
  questionCards = [];
  const cats = allCategories();
  const cat = cats[Math.floor(Math.random() * cats.length)];
  const id = ++cardSeq;
  questionCards.push({ id, question: randomQuestionInCategory(cat), answer: "" });
  renderQuestionCards();
}

function removeQuestionCard(id) {
  if (questionCards.length <= 1) return;
  questionCards = questionCards.filter((c) => c.id !== id);
  renderQuestionCards();
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderQuestionCards() {
  const container = document.getElementById("questionCards");
  container.innerHTML = "";
  questionCards.forEach((c) => {
    const card = document.createElement("div");
    card.className = "card";
    const deleteBtnHtml =
      questionCards.length > 1
        ? `<button class="reroll remove-card" data-card-id="${c.id}">✕ 削除</button>`
        : "";
    card.innerHTML = `
      <span class="cat-label cat-label-clickable" data-card-id="${c.id}">${c.question.cat} 🔀</span>
      <p class="question-text">${c.question.text}</p>
      <textarea data-card-id="${c.id}" class="answer-input" placeholder="ここに書く">${escapeHtml(c.answer || "")}</textarea>
      <div style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap;">
        <button class="reroll reroll-single" data-card-id="${c.id}">🔄 この項目で別の質問</button>
        <button class="reroll add-single" data-cat="${c.question.cat}">＋ この項目に追加</button>
        ${deleteBtnHtml}
      </div>
    `;
    container.appendChild(card);
  });

  container.querySelectorAll(".cat-label-clickable").forEach((el) => {
    el.addEventListener("click", () => {
      const id = Number(el.dataset.cardId);
      const card = questionCards.find((c) => c.id === id);
      if (card) {
        const others = allCategories().filter((c2) => c2 !== card.question.cat);
        const newCat = others[Math.floor(Math.random() * others.length)];
        card.question = randomQuestionInCategory(newCat);
        card.answer = "";
        renderQuestionCards();
      }
    });
  });

  container.querySelectorAll(".answer-input").forEach((el) => {
    el.addEventListener("input", () => {
      const id = Number(el.dataset.cardId);
      const card = questionCards.find((c) => c.id === id);
      if (card) card.answer = el.value;
    });
  });
  container.querySelectorAll(".reroll-single").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = Number(btn.dataset.cardId);
      const card = questionCards.find((c) => c.id === id);
      if (card) {
        card.question = randomQuestionInCategory(card.question.cat);
        card.answer = "";
        renderQuestionCards();
      }
    });
  });
  container.querySelectorAll(".add-single").forEach((btn) => {
    btn.addEventListener("click", () => {
      addQuestionCard(btn.dataset.cat);
    });
  });
  container.querySelectorAll(".remove-card").forEach((btn) => {
    btn.addEventListener("click", () => {
      removeQuestionCard(Number(btn.dataset.cardId));
    });
  });
}

function getAnswerFor(cardId) {
  const card = questionCards.find((c) => c.id === cardId);
  return card && card.answer ? card.answer.trim() : "";
}

// ---------- frontmatter ----------

// 先頭の --- ... --- を切り出す。無ければ fm は空配列(既存の旧形式の日記)
function splitFrontmatter(content) {
  if (content.startsWith("---\n")) {
    const end = content.indexOf("\n---\n", 4);
    if (end !== -1) {
      return {
        fm: content.slice(4, end).split("\n"),
        body: content.slice(end + 5).replace(/^\n+/, ""),
      };
    }
  }
  return { fm: [], body: content };
}

function joinFrontmatter(fm, body) {
  return `---\n${fm.join("\n")}\n---\n\n${body}`;
}

function setFmField(fm, key, value) {
  const i = fm.findIndex((l) => l.startsWith(key + ":"));
  const line = `${key}: ${value}`;
  if (i !== -1) fm[i] = line;
  else fm.push(line);
}

function ensureFmField(fm, key, value) {
  if (!fm.some((l) => l.startsWith(key + ":"))) fm.push(`${key}: ${value}`);
}

// links: [a, b] に新しいIDを重複なく追加
function mergeLinks(fm, newIds) {
  const i = fm.findIndex((l) => l.startsWith("links:"));
  let ids = [];
  if (i !== -1) {
    const m = fm[i].match(/\[(.*)\]/);
    if (m) ids = m[1].split(",").map((s) => s.trim()).filter(Boolean);
  }
  newIds.forEach((id) => {
    if (id && !ids.includes(id)) ids.push(id);
  });
  const line = `links: [${ids.join(", ")}]`;
  if (i !== -1) fm[i] = line;
  else fm.push(line);
}

// ---------- 本文組み立て ----------

function buildSkeleton(dateStr) {
  const year = dateStr.slice(0, 4);
  // 本文のみ(frontmatterは保存時に付与)。回答があったカテゴリのセクションだけ動的に追加される。
  return `# ${dateStr} の日記\n\n---\nタグ: #日記 #${year} #自己分析\n`;
}

function insertConditionLine(content, conditionText) {
  const lines = content.split("\n");
  const condIdx = lines.findIndex((l) => l.startsWith("体調:"));
  if (condIdx !== -1) {
    lines[condIdx] = conditionText;
    return lines.join("\n");
  }
  const titleIdx = lines.findIndex((l) => l.startsWith("# "));
  const insertAt = titleIdx !== -1 ? titleIdx + 1 : 0;
  lines.splice(insertAt, 0, "", conditionText);
  return lines.join("\n");
}

function insertIntoSection(content, categoryHeading, block) {
  const lines = content.split("\n");
  const headingLine = "## " + categoryHeading;
  let startIdx = lines.findIndex((l) => l.trim() === headingLine);

  if (startIdx === -1) {
    return appendSectionBeforeTags(content, categoryHeading, block);
  }

  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (lines[i].startsWith("## ") || lines[i].startsWith("---")) {
      endIdx = i;
      break;
    }
  }
  const before = lines.slice(0, endIdx);
  const after = lines.slice(endIdx);
  if (before[before.length - 1].trim() !== "") before.push("");
  before.push(block, "");
  return [...before, ...after].join("\n");
}

function appendSectionBeforeTags(content, heading, block) {
  const lines = content.split("\n");
  let tagIdx = lines.findIndex((l) => l.startsWith("---"));
  if (tagIdx === -1) tagIdx = lines.length;
  const before = lines.slice(0, tagIdx);
  const after = lines.slice(tagIdx);
  if (before[before.length - 1].trim() !== "") before.push("");
  before.push(`## ${heading}`, block, "");
  return [...before, ...after].join("\n");
}

function appendFreeText(content, freeText, tags) {
  const tagStr = tags && tags.length ? ` [タグ: ${tags.join(", ")}]` : "";
  const block = `- (${timeStr()})${tagStr} ${freeText}`;
  const lines = content.split("\n");
  const headingLine = "## 自由記述";
  let startIdx = lines.findIndex((l) => l.trim() === headingLine);

  if (startIdx === -1) {
    return appendSectionBeforeTags(content, "自由記述", block);
  }
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (lines[i].startsWith("## ") || lines[i].startsWith("---")) {
      endIdx = i;
      break;
    }
  }
  const before = lines.slice(0, endIdx);
  const after = lines.slice(endIdx);
  if (before[before.length - 1].trim() !== "") before.push("");
  before.push(block, "");
  return [...before, ...after].join("\n");
}

// ---------- GitHub API ----------

async function githubGetFile(settings, filePath) {
  const url = `https://api.github.com/repos/${settings.owner}/${settings.repo}/contents/${filePath}?ref=${settings.branch}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${settings.pat}`,
      Accept: "application/vnd.github+json",
    },
  });
  if (res.status === 404) return { content: null, sha: null };
  if (!res.ok) throw new Error(`GitHub取得エラー: ${res.status}`);
  const data = await res.json();
  return { content: b64DecodeUnicode(data.content), sha: data.sha };
}

async function githubPutFile(settings, filePath, content, sha, message) {
  const url = `https://api.github.com/repos/${settings.owner}/${settings.repo}/contents/${filePath}`;
  const body = {
    message,
    content: b64EncodeUnicode(content),
    branch: settings.branch,
  };
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

// ---------- 分析シート由来の質問 ----------

async function loadAnalysisQuestions() {
  const settings = loadSettings();
  if (!settings || !settings.pat || !settings.owner || !settings.repo) return;
  try {
    const { content } = await githubGetFile(settings, ANALYSIS_QUESTIONS_PATH);
    if (content === null) return; // まだ無ければ通常の質問だけで動く
    const list = JSON.parse(content);
    analysisQuestions = list
      .filter((x) => x && x.q && x.cell)
      .map((x) => ({ cat: ANALYSIS_CAT, text: x.q, cell: String(x.cell) }));
    // まだ何も入力していなければ、分析由来の質問も混ぜて引き直す
    if (questionCards.every((c) => !c.answer)) initDefaultCards();
  } catch (e) {
    console.error("分析質問の読み込み失敗:", e); // 失敗しても日記入力は止めない
  }
}

// ---------- 保存処理 ----------

async function handleSave() {
  const settings = loadSettings();
  if (!settings || !settings.pat || !settings.owner || !settings.repo) {
    setStatus("先に設定(⚙️)を入力してください");
    openSettings();
    return;
  }

  const saveBtn = document.getElementById("saveBtn");
  saveBtn.disabled = true;
  setStatus("保存中...");

  try {
    const dateStr = todayStr();
    const dir = settings.path || DEFAULT_PATH;
    const filePath = `${dir}/${dateStr}.md`;

    const { content, sha } = await githubGetFile(settings, filePath);
    const raw = content !== null ? content : buildSkeleton(dateStr);
    let { fm, body } = splitFrontmatter(raw);
    let newContent = body;

    const condition = document.getElementById("conditionSelect").value;
    const sleep = document.getElementById("sleepInput").value;
    let hasAnyInput = false;

    if (condition || sleep) {
      const parts = [];
      if (condition) parts.push(`体調: ${condition}`);
      if (sleep) parts.push(`睡眠時間: ${sleep}時間`);
      parts.push(`(${timeStr()})`);
      newContent = insertConditionLine(newContent, parts.join("　"));
      if (condition) setFmField(fm, "condition", condition);
      if (sleep) setFmField(fm, "sleep", sleep);
      hasAnyInput = true;
    }

    const newLinks = [];
    for (const c of questionCards) {
      const answer = getAnswerFor(c.id);
      if (answer) {
        const idMark = c.question.cell ? ` {#${c.question.cell}}` : "";
        const block = `- **Q:** ${c.question.text}${idMark} (${timeStr()})\n  - ${answer}`;
        newContent = insertIntoSection(newContent, c.question.cat, block);
        if (c.question.cell) newLinks.push(c.question.cell);
        hasAnyInput = true;
      }
    }

    const freeText = document.getElementById("freeText").value.trim();
    if (freeText) {
      newContent = appendFreeText(newContent, freeText, selectedFreeTags);
      hasAnyInput = true;
    }

    if (!hasAnyInput) {
      setStatus("入力がありません");
      saveBtn.disabled = false;
      return;
    }

    // frontmatter の仕上げ(旧形式の日記にも付与される)
    if (!fm.some((l) => l.startsWith("date:"))) fm.unshift(`date: ${dateStr}`); // dateを先頭に
    mergeLinks(fm, newLinks);
    ensureFmField(fm, "tags", "[]"); // 週次でClaudeが付ける
    const finalContent = joinFrontmatter(fm, newContent);

    await githubPutFile(
      settings,
      filePath,
      finalContent,
      sha,
      `diary: ${dateStr} app update`
    );

    setStatus("保存しました ✓");
    catCache = null; // カテゴリ別一覧は次回開くときに読み直す
    document.getElementById("freeText").value = "";
    selectedFreeTags = [];
    document.getElementById("tagPicker").classList.remove("open");
    questionCards = [];
    initDefaultCards();
  } catch (e) {
    console.error(e);
    setStatus("エラー: " + e.message);
  } finally {
    saveBtn.disabled = false;
  }
}

// ---------- 自由記述タグ ----------

function renderTagPicker() {
  const picker = document.getElementById("tagPicker");
  picker.innerHTML = "";
  CATEGORY_ORDER.forEach((cat) => {
    const pill = document.createElement("button");
    pill.className = "tag-pill" + (selectedFreeTags.includes(cat) ? " selected" : "");
    pill.textContent = cat;
    pill.addEventListener("click", () => {
      if (selectedFreeTags.includes(cat)) {
        selectedFreeTags = selectedFreeTags.filter((t) => t !== cat);
      } else {
        selectedFreeTags.push(cat);
      }
      renderTagPicker();
    });
    picker.appendChild(pill);
  });
}

function toggleTagPicker() {
  const picker = document.getElementById("tagPicker");
  if (picker.classList.contains("open")) {
    picker.classList.remove("open");
  } else {
    renderTagPicker();
    picker.classList.add("open");
  }
}

// ---------- 質問一覧モーダル ----------

function openBrowseModal() {
  const listEl = document.getElementById("browseList");
  listEl.innerHTML = "";
  allCategories().forEach((cat) => {
    const title = document.createElement("div");
    title.className = "browse-cat-title";
    title.textContent = cat;
    listEl.appendChild(title);

    poolFor(cat).forEach((q) => {
      const btn = document.createElement("button");
      btn.className = "browse-q-item";
      btn.textContent = q.text;
      btn.addEventListener("click", () => {
        const id = ++cardSeq;
        questionCards.push({ id, question: q });
        renderQuestionCards();
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

// ---------- 過去の日記を見る ----------

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

async function openViewModal() {
  const settings = loadSettings();
  if (!settings || !settings.pat) {
    setStatus("先に設定(⚙️)を入力してください");
    openSettings();
    return;
  }
  document.getElementById("viewModalTitle").textContent = "過去の日記";
  document.getElementById("viewContent").style.display = "none";
  const listEl = document.getElementById("viewDateList");
  listEl.innerHTML = "読み込み中...";
  document.getElementById("view-modal").classList.add("open");

  try {
    const files = await githubListFolder(settings, settings.path || DEFAULT_PATH);
    const mdFiles = files
      .filter((f) => f.name.endsWith(".md"))
      .sort((a, b) => (a.name < b.name ? 1 : -1));

    listEl.innerHTML = "";
    mdFiles.forEach((f) => {
      const btn = document.createElement("button");
      btn.className = "browse-q-item";
      btn.textContent = f.name.replace(".md", "");
      btn.addEventListener("click", () => showEntry(settings, f.path, f.name));
      listEl.appendChild(btn);
    });
    if (mdFiles.length === 0) listEl.textContent = "まだ日記がありません";
  } catch (e) {
    listEl.textContent = "エラー: " + e.message;
  }
}

async function showEntry(settings, filePath, fileName) {
  const listEl = document.getElementById("viewDateList");
  const contentEl = document.getElementById("viewContent");
  listEl.style.display = "none";
  contentEl.style.display = "block";
  contentEl.textContent = "読み込み中...";
  document.getElementById("viewModalTitle").textContent = fileName.replace(".md", "");
  try {
    const { content } = await githubGetFile(settings, filePath);
    contentEl.textContent = content || "(空)";
  } catch (e) {
    contentEl.textContent = "エラー: " + e.message;
  }
}

function closeViewModal() {
  document.getElementById("view-modal").classList.remove("open");
  document.getElementById("viewDateList").style.display = "block";
  document.getElementById("viewContent").style.display = "none";
}

// ---------- カテゴリ別に見る ----------

let catCache = null; // { all: [{cat,date,q,a}], fileCount, total }
const CAT_LOAD_LIMIT = 90; // 新しい順にこの日数分まで読む

// 日記ファイルを「見出し(カテゴリ)ごとの回答」に分解する
function parseDiary(content, dateStr) {
  const { body } = splitFrontmatter(content);
  const out = [];
  let cat = null;
  let cur = null;
  const flush = () => {
    if (cur && cat) out.push({ cat, date: dateStr, q: cur.q, a: cur.a.join("\n").trim() });
    cur = null;
  };
  body.split("\n").forEach((line) => {
    if (line.startsWith("## ")) { flush(); cat = line.slice(3).trim(); return; }
    if (line.startsWith("---")) { flush(); cat = null; return; }
    if (!cat) return;
    if (line.startsWith("- ")) {
      flush();
      const t = line.slice(2);
      const m = t.match(/^\*\*Q:\*\*\s*(.*)$/);
      if (m) {
        const q = m[1].replace(/\s*\(\d{2}:\d{2}\)\s*$/, "").replace(/\s*\{#[0-9a-f]+\}/, "").trim();
        cur = { q, a: [] };
      } else {
        cur = { q: "", a: [t.replace(/^\(\d{2}:\d{2}\)\s*/, "")] }; // 自由記述など
      }
      return;
    }
    if (cur) cur.a.push(line.replace(/^ {2}- /, ""));
  });
  flush();
  return out;
}

async function loadAllEntries(settings, onProgress) {
  const files = await githubListFolder(settings, settings.path || DEFAULT_PATH);
  const all = files.filter((f) => f.name.endsWith(".md")).sort((a, b) => (a.name < b.name ? 1 : -1));
  const target = all.slice(0, CAT_LOAD_LIMIT);
  const queue = target.slice();
  const entries = [];
  let done = 0;
  async function worker() {
    while (queue.length) {
      const f = queue.shift();
      try {
        const { content } = await githubGetFile(settings, f.path);
        if (content) entries.push(...parseDiary(content, f.name.replace(".md", "")));
      } catch (e) { console.error(e); }
      done++;
      onProgress(done, target.length);
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  return { all: entries, fileCount: target.length, total: all.length };
}

function groupByCat(all) {
  const m = new Map();
  all.forEach((e) => { if (!m.has(e.cat)) m.set(e.cat, []); m.get(e.cat).push(e); });
  m.forEach((list) => list.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)));
  return m;
}

function orderedCats(cats) {
  const known = [...CATEGORY_ORDER, ANALYSIS_CAT, "自由記述"];
  return [...known.filter((c) => cats.includes(c)), ...cats.filter((c) => !known.includes(c))];
}

function ensureCatModal() {
  let el = document.getElementById("cat-modal");
  if (el) return el;
  el = document.createElement("div");
  el.id = "cat-modal";
  el.className = "modal-overlay";
  el.innerHTML = `<div class="modal-box"><div class="modal-header"><strong id="catModalTitle">カテゴリ別に見る</strong><button id="closeCatBtn" class="modal-close-btn">✕</button></div><div id="catBody"></div></div>`;
  document.body.appendChild(el);
  document.getElementById("closeCatBtn").addEventListener("click", () => el.classList.remove("open"));
  return el;
}

function renderCatList() {
  const body = document.getElementById("catBody");
  document.getElementById("catModalTitle").textContent = "カテゴリ別に見る";
  body.innerHTML = "";
  const groups = groupByCat(catCache.all);

  const note = document.createElement("div");
  note.className = "hint";
  note.textContent = `新しい順に${catCache.fileCount}日分を集計` + (catCache.total > catCache.fileCount ? `(全${catCache.total}日のうち)` : "");
  body.appendChild(note);

  const cats = orderedCats([...groups.keys()]);
  if (cats.length === 0) body.appendChild(document.createTextNode("まだ日記がありません"));
  cats.forEach((cat) => {
    const btn = document.createElement("button");
    btn.className = "browse-q-item";
    btn.textContent = `${cat}(${groups.get(cat).length}件)`;
    btn.addEventListener("click", () => renderCatEntries(cat, groups.get(cat)));
    body.appendChild(btn);
  });

  const re = document.createElement("button");
  re.className = "reroll";
  re.style.marginTop = "10px";
  re.textContent = "🔄 読み直す";
  re.addEventListener("click", () => { catCache = null; openCatModal(); });
  body.appendChild(re);
}

function renderCatEntries(cat, list) {
  const body = document.getElementById("catBody");
  document.getElementById("catModalTitle").textContent = `${cat}(${list.length}件)`;
  body.innerHTML = "";
  const back = document.createElement("button");
  back.className = "reroll";
  back.textContent = "← カテゴリ一覧へ";
  back.addEventListener("click", renderCatList);
  body.appendChild(back);

  list.forEach((e) => {
    const card = document.createElement("div");
    card.style.cssText = "border:1px solid var(--border); border-radius:10px; padding:10px; margin-top:10px; background:#fcfcfb;";
    const d = document.createElement("div");
    d.style.cssText = "font-size:0.75rem; color:var(--muted);";
    d.textContent = e.date;
    card.appendChild(d);
    if (e.q) {
      const q = document.createElement("div");
      q.style.cssText = "font-size:0.85rem; font-weight:600; margin-top:4px;";
      q.textContent = e.q;
      card.appendChild(q);
    }
    const a = document.createElement("div");
    a.style.cssText = "font-size:0.92rem; margin-top:4px; white-space:pre-wrap;";
    a.textContent = e.a;
    card.appendChild(a);
    body.appendChild(card);
  });
}

async function openCatModal() {
  const settings = loadSettings();
  if (!settings || !settings.pat) {
    setStatus("先に設定(⚙️)を入力してください");
    openSettings();
    return;
  }
  ensureCatModal().classList.add("open");
  const body = document.getElementById("catBody");
  if (!catCache) {
    body.textContent = "読み込み中...";
    try {
      catCache = await loadAllEntries(settings, (d, t) => { body.textContent = `読み込み中... ${d}/${t}`; });
    } catch (e) {
      body.textContent = "エラー: " + e.message;
      return;
    }
  }
  renderCatList();
}

// ---------- 初期化 ----------

document.getElementById("gearBtn").addEventListener("click", openSettings);
document.getElementById("saveSettingsBtn").addEventListener("click", closeSettings);
document.getElementById("browseQuestionsBtn").addEventListener("click", openBrowseModal);
document.getElementById("tagToggleBtn").addEventListener("click", toggleTagPicker);
document.getElementById("closeBrowseBtn").addEventListener("click", closeBrowseModal);
document.getElementById("viewPastBtn").addEventListener("click", openViewModal);
document.getElementById("closeViewBtn").addEventListener("click", closeViewModal);
document.getElementById("saveBtn").addEventListener("click", handleSave);

{
  const viewBtn = document.getElementById("viewPastBtn");
  if (viewBtn && viewBtn.parentNode) {
    const catBtn = document.createElement("button");
    catBtn.id = "viewCatBtn";
    catBtn.className = "add-question-btn";
    catBtn.textContent = "🗂 カテゴリ別に見る";
    catBtn.addEventListener("click", openCatModal);
    viewBtn.parentNode.insertBefore(catBtn, viewBtn);
  }
}

initDefaultCards();
if (!loadSettings()) {
  openSettings();
} else {
  loadAnalysisQuestions();
}
