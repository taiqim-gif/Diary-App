// 規格外さん日記 - アプリ本体
const SETTINGS_KEY = "shinkaronDiarySettings";

const CATEGORY_ORDER = [
  "1. 基本の振り返り",
  "2. 自己躾け",
  "3. 理想と現実のギャップ",
  "4. 言語化・構造化",
  "5. コミットメント",
];

let questionCards = []; // { id, question: {cat, text}, answer }
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

function randomQuestion() {
  return QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
}

function randomQuestionInCategory(cat) {
  const list = QUESTIONS.filter((q) => q.cat === cat);
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
    path: document.getElementById("pathInput").value.trim() || "01_Daily/日記.md",
  };
}

function closeSettings() {
  const s = settingsFromForm();
  saveSettingsToStorage(s);
  document.getElementById("settings-panel").classList.remove("open");
  document.getElementById("main-panel").classList.remove("hidden");
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
  const cat = CATEGORY_ORDER[Math.floor(Math.random() * CATEGORY_ORDER.length)];
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
        const others = CATEGORY_ORDER.filter((c2) => c2 !== card.question.cat);
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

// ---------- 本文組み立て ----------

function buildSkeleton(dateStr) {
  const year = dateStr.slice(0, 4);
  // 未回答の質問や空のセクション見出しは含めない。
  // 回答があったカテゴリのセクションだけ、保存時に insertIntoSection が動的に追加する。
  return `# ${dateStr} の日記\n\n---\nタグ: #日記 #${year} #自己分析\n`;
}

// ---------- 1ファイル運用:日付ブロックの操作 ----------

// 設定のpathは「ファイルのパス」。旧設定(フォルダ名のみ)の場合は 日記.md を補う
function diaryFilePath(settings) {
  const p = ((settings && settings.path) || "01_Daily").trim();
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
// その日のブロックが無ければ新規作成し、ファイルの先頭(新しい日が上)に置く。
function updateDayBlock(fullContent, dateStr, transformFn) {
  const lines =
    fullContent.trim() === "" ? [] : fullContent.replace(/\n+$/, "").split("\n");
  const block = getDayBlock(lines, dateStr);

  if (!block) {
    const newBlock = transformFn(buildSkeleton(dateStr)).replace(/\n+$/, "");
    const out = [newBlock];
    if (lines.length) out.push("", ...lines);
    return out.join("\n") + "\n";
  }

  const dayContent = lines.slice(block.start, block.end).join("\n");
  const newDay = transformFn(dayContent).replace(/\n+$/, "");
  const before = lines.slice(0, block.start);
  const after = lines.slice(block.end);
  const out = [...before, ...newDay.split("\n")];
  if (after.length) out.push("", ...after);
  return out.join("\n") + "\n";
}

// ファイル内の日付一覧(新しい順)
function listDiaryDates(content) {
  const dates = [];
  content.split("\n").forEach((l) => {
    const m = l.match(/^# (\d{4}-\d{2}-\d{2}) の日記/);
    if (m) dates.push(m[1]);
  });
  return dates.sort().reverse();
}

function extractDayText(content, dateStr) {
  const lines = content.split("\n");
  const block = getDayBlock(lines, dateStr);
  if (!block) return "";
  return lines.slice(block.start, block.end).join("\n").trim();
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

// セクション末尾(最後の中身の行の直後)に block を挿入する。余計な空行は増やさない
function insertAtSectionEnd(lines, startIdx, block) {
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (lines[i].startsWith("## ") || lines[i].startsWith("---")) {
      endIdx = i;
      break;
    }
  }
  let last = endIdx - 1;
  while (last > startIdx && lines[last].trim() === "") last--;
  const before = lines.slice(0, last + 1);
  const after = lines.slice(endIdx);
  before.push(block);
  if (after.length) before.push("");
  return [...before, ...after].join("\n");
}

function insertIntoSection(content, categoryHeading, block) {
  const lines = content.split("\n");
  const headingLine = "## " + categoryHeading;
  let startIdx = lines.findIndex((l) => l.trim() === headingLine);

  if (startIdx === -1) {
    return appendSectionBeforeTags(content, categoryHeading, block);
  }

  return insertAtSectionEnd(lines, startIdx, block);
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
  return insertAtSectionEnd(lines, startIdx, block);
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
    const filePath = diaryFilePath(settings);

    // その日のブロックに対して行う変更を集める
    const transforms = [];

    const condition = document.getElementById("conditionSelect").value;
    const sleep = document.getElementById("sleepInput").value;

    if (condition || sleep) {
      const parts = [];
      if (condition) parts.push(`体調: ${condition}`);
      if (sleep) parts.push(`睡眠時間: ${sleep}時間`);
      parts.push(`(${timeStr()})`);
      const condLine = parts.join("　");
      transforms.push((b) => insertConditionLine(b, condLine));
    }

    for (const c of questionCards) {
      const answer = getAnswerFor(c.id);
      if (answer) {
        const qBlock = `- **Q:** ${c.question.text} (${timeStr()})\n  - ${answer}`;
        const cat = c.question.cat;
        transforms.push((b) => insertIntoSection(b, cat, qBlock));
      }
    }

    const freeText = document.getElementById("freeText").value.trim();
    if (freeText) {
      const tags = selectedFreeTags.slice();
      transforms.push((b) => appendFreeText(b, freeText, tags));
    }

    if (transforms.length === 0) {
      setStatus("入力がありません");
      saveBtn.disabled = false;
      return;
    }

    // 保存直前にGitHubの最新を取得してから、今日のブロックだけを書き換える
    const { content, sha } = await githubGetFile(settings, filePath);
    const newContent = updateDayBlock(content || "", dateStr, (block) =>
      transforms.reduce((acc, fn) => fn(acc), block)
    );

    await githubPutFile(
      settings,
      filePath,
      newContent,
      sha,
      `diary: ${dateStr} app update`
    );

    setStatus("保存しました ✓");
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

// ---------- 日付別ファイル → 日記.md への統合 ----------

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

// 日付別ファイルの中身を、1ファイル運用の1日ブロックとして使える形に整える
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
  // 2行目以降の「# 」は日の区切りと誤認されないよう「## 」に下げる
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].startsWith("# ")) lines[i] = "#" + lines[i];
  }
  return lines.join("\n");
}

async function migrateDailyFiles() {
  const out = document.getElementById("migrateStatus");
  const s = settingsFromForm();
  if (!s.pat || !s.owner || !s.repo) {
    out.textContent = "先にトークン・オーナー・リポジトリ名を入力してください";
    return;
  }
  if (!window.confirm("日付ごとのファイルを日記.mdに統合します。元のファイルは削除しません。よろしいですか?")) {
    return;
  }
  out.textContent = "確認中...";
  try {
    const filePath = diaryFilePath(s);
    const folder = filePath.includes("/") ? filePath.slice(0, filePath.lastIndexOf("/")) : "";
    const list = await githubListFolder(s, folder);
    const dayFiles = list
      .filter((f) => f.type === "file" && /^\d{4}-\d{2}-\d{2}\.md$/.test(f.name))
      .sort((a, b) => (a.name < b.name ? -1 : 1));
    if (dayFiles.length === 0) {
      out.textContent = "統合する日付別ファイルはありません";
      return;
    }

    const { content: existing, sha } = await githubGetFile(s, filePath);
    const parsed = parseDayBlocks(existing || "");
    const have = new Set(parsed.blocks.map((b) => b.date));
    let added = 0;
    let skipped = 0;
    for (const f of dayFiles) {
      const date = f.name.slice(0, 10);
      if (have.has(date)) {
        skipped++;
        continue;
      }
      const { content } = await githubGetFile(s, f.path);
      if (content === null || content.trim() === "") {
        skipped++;
        continue;
      }
      parsed.blocks.push({ date, lines: normalizeImportedDay(date, content).split("\n") });
      have.add(date);
      added++;
    }
    if (added === 0) {
      out.textContent = `追加する日記はありませんでした(統合済み・空ファイル: ${skipped}件)`;
      return;
    }
    await githubPutFile(
      s,
      filePath,
      buildDiaryFile(parsed.preamble, parsed.blocks),
      sha,
      `diary: merge ${added} daily files`
    );
    out.textContent = `${added}日分を ${filePath} に統合しました。元の日付別ファイルは残してあります(確認後にPCで削除してください)`;
  } catch (e) {
    out.textContent = "エラー: " + e.message;
  }
}

let viewCache = null; // { content }

async function openViewModal() {
  const settings = loadSettings();
  if (!settings || !settings.pat) {
    setStatus("先に設定(⚙️)を入力してください");
    openSettings();
    return;
  }
  document.getElementById("viewModalTitle").textContent = "過去の日記";
  document.getElementById("viewStatus").textContent = "";
  setViewMode("list");
  const listEl = document.getElementById("viewDateList");
  listEl.innerHTML = "読み込み中...";
  document.getElementById("view-modal").classList.add("open");

  try {
    const { content } = await githubGetFile(settings, diaryFilePath(settings));
    if (content === null) {
      listEl.textContent = "まだ日記がありません";
      return;
    }
    viewCache = { content };
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

let currentViewDate = null;

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
  const settings = loadSettings();
  const statusEl = document.getElementById("viewStatus");
  statusEl.textContent = "最新を取得中...";
  try {
    const { content } = await githubGetFile(settings, diaryFilePath(settings));
    viewCache = { content: content || "" };
    document.getElementById("viewEditArea").value = extractDayText(viewCache.content, currentViewDate);
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

document.getElementById("gearBtn").addEventListener("click", openSettings);
document.getElementById("saveSettingsBtn").addEventListener("click", closeSettings);
document.getElementById("browseQuestionsBtn").addEventListener("click", openBrowseModal);
document.getElementById("tagToggleBtn").addEventListener("click", toggleTagPicker);
document.getElementById("closeBrowseBtn").addEventListener("click", closeBrowseModal);
document.getElementById("viewPastBtn").addEventListener("click", openViewModal);
document.getElementById("closeViewBtn").addEventListener("click", closeViewModal);
document.getElementById("editEntryBtn").addEventListener("click", startEditEntry);
document.getElementById("cancelEditBtn").addEventListener("click", cancelEditEntry);
document.getElementById("saveEditBtn").addEventListener("click", saveEditEntry);
document.getElementById("saveBtn").addEventListener("click", handleSave);
document.getElementById("migrateBtn").addEventListener("click", migrateDailyFiles);

initDefaultCards();
if (!loadSettings()) {
  openSettings();
}
