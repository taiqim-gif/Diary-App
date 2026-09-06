// 規格外さん日記 - アプリ本体
const SETTINGS_KEY = "shinkaronDiarySettings";

const CATEGORY_ORDER = [
  "1. 基本の振り返り",
  "2. 自己躾け",
  "3. 理想と現実のギャップ",
  "4. 言語化・構造化",
  "5. コミットメント",
];

const FIXED_QUESTIONS = {
  "1. 基本の振り返り": ["今日最も印象に残った出来事は？", "そこから得た気づきは？"],
  "2. 自己躾け": ["今日の自分に教えたいこと・言い聞かせたいことは？", "明日の自分への宣言は？"],
  "3. 理想と現実のギャップ": ["理想の自分との差はどこにあるか？", "その差を埋める明日の「微差の行動」は？"],
  "4. 言語化・構造化": ["今日の経験を「○○で大切なことは全て○○から教わった」で表現すると？"],
  "5. コミットメント": ["今日強まった決意・自己暗示は？"],
};

let questionCards = []; // { id, question: {cat, text} }
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
  document.getElementById("pathInput").value = s.path || "01_Daily";
  document.getElementById("settings-panel").classList.add("open");
  document.getElementById("main-panel").classList.add("hidden");
}

function closeSettings() {
  const s = {
    pat: document.getElementById("patInput").value.trim(),
    owner: document.getElementById("ownerInput").value.trim(),
    repo: document.getElementById("repoInput").value.trim(),
    branch: document.getElementById("branchInput").value.trim() || "main",
    path: document.getElementById("pathInput").value.trim() || "01_Daily",
  };
  saveSettingsToStorage(s);
  document.getElementById("settings-panel").classList.remove("open");
  document.getElementById("main-panel").classList.remove("hidden");
}

// ---------- 質問カードUI ----------

function addQuestionCard() {
  const id = ++cardSeq;
  const question = randomQuestion();
  questionCards.push({ id, question });
  renderQuestionCards();
}

function removeQuestionCard(id) {
  if (questionCards.length <= 1) return;
  questionCards = questionCards.filter((c) => c.id !== id);
  renderQuestionCards();
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
      <span class="cat-label">${c.question.cat}</span>
      <p class="question-text">${c.question.text}</p>
      <textarea data-card-id="${c.id}" class="answer-input" placeholder="ここに書く"></textarea>
      <div style="margin-top:8px; display:flex; gap:8px;">
        <button class="reroll reroll-single" data-card-id="${c.id}">🔄 別の質問</button>
        ${deleteBtnHtml}
      </div>
    `;
    container.appendChild(card);
  });

  container.querySelectorAll(".reroll-single").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = Number(btn.dataset.cardId);
      const card = questionCards.find((c) => c.id === id);
      if (card) {
        card.question = randomQuestion();
        renderQuestionCards();
      }
    });
  });
  container.querySelectorAll(".remove-card").forEach((btn) => {
    btn.addEventListener("click", () => {
      removeQuestionCard(Number(btn.dataset.cardId));
    });
  });
}

function getAnswerFor(cardId) {
  const el = document.querySelector(`.answer-input[data-card-id="${cardId}"]`);
  return el ? el.value.trim() : "";
}

// ---------- 本文組み立て ----------

function buildSkeleton(dateStr) {
  const year = dateStr.slice(0, 4);
  let out = `# ${dateStr} の日記\n\n`;
  for (const cat of CATEGORY_ORDER) {
    out += `## ${cat}\n`;
    for (const q of FIXED_QUESTIONS[cat]) {
      out += `- ${q}\n`;
    }
    out += `\n`;
  }
  out += `## 自由記述\n\n`;
  out += `---\nタグ: #日記 #${year} #自己分析\n`;
  return out;
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

function appendFreeText(content, freeText) {
  const block = `- (${timeStr()}) ${freeText}`;
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
    const filePath = `${settings.path}/${dateStr}.md`;

    const { content, sha } = await githubGetFile(settings, filePath);
    let newContent = content !== null ? content : buildSkeleton(dateStr);

    const condition = document.getElementById("conditionSelect").value;
    const sleep = document.getElementById("sleepInput").value;
    let hasAnyInput = false;

    if (condition || sleep) {
      const parts = [];
      if (condition) parts.push(`体調: ${condition}`);
      if (sleep) parts.push(`睡眠時間: ${sleep}時間`);
      parts.push(`(${timeStr()})`);
      newContent = insertConditionLine(newContent, parts.join("　"));
      hasAnyInput = true;
    }

    for (const c of questionCards) {
      const answer = getAnswerFor(c.id);
      if (answer) {
        const block = `- **Q:** ${c.question.text} (${timeStr()})\n  - ${answer}`;
        newContent = insertIntoSection(newContent, c.question.cat, block);
        hasAnyInput = true;
      }
    }

    const freeText = document.getElementById("freeText").value.trim();
    if (freeText) {
      newContent = appendFreeText(newContent, freeText);
      hasAnyInput = true;
    }

    if (!hasAnyInput) {
      setStatus("入力がありません");
      saveBtn.disabled = false;
      return;
    }

    await githubPutFile(
      settings,
      filePath,
      newContent,
      sha,
      `diary: ${dateStr} app update`
    );

    setStatus("保存しました ✓");
    document.getElementById("freeText").value = "";
    questionCards = [];
    addQuestionCard();
  } catch (e) {
    console.error(e);
    setStatus("エラー: " + e.message);
  } finally {
    saveBtn.disabled = false;
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
    const files = await githubListFolder(settings, settings.path);
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

// ---------- 初期化 ----------

document.getElementById("gearBtn").addEventListener("click", openSettings);
document.getElementById("saveSettingsBtn").addEventListener("click", closeSettings);
document.getElementById("addQuestionBtn").addEventListener("click", addQuestionCard);
document.getElementById("browseQuestionsBtn").addEventListener("click", openBrowseModal);
document.getElementById("closeBrowseBtn").addEventListener("click", closeBrowseModal);
document.getElementById("viewPastBtn").addEventListener("click", openViewModal);
document.getElementById("closeViewBtn").addEventListener("click", closeViewModal);
document.getElementById("saveBtn").addEventListener("click", handleSave);

addQuestionCard();
if (!loadSettings()) {
  openSettings();
}
