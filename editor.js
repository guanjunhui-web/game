const TEXT_OVERRIDES_KEY = "angel_vn_text_overrides_v1";

const els = {
  fields: document.querySelector("#fields"),
  status: document.querySelector("#status"),
  search: document.querySelector("#searchInput"),
  save: document.querySelector("#saveBtn"),
  reset: document.querySelector("#resetBtn"),
  export: document.querySelector("#exportBtn")
};

let story;
let minigames;
let gacha;
let resources;
let characters;
let controls = [];

async function loadStory() {
  const [storyResponse, minigamesResponse, gachaResponse, resourcesResponse, charactersResponse] = await Promise.all([
    fetch("./data/story.json", { cache: "no-store" }),
    fetch("./data/minigames.json", { cache: "no-store" }),
    fetch("./data/gacha.json", { cache: "no-store" }),
    fetch("./data/resources.json", { cache: "no-store" }),
    fetch("./data/characters.json", { cache: "no-store" })
  ]);
  story = await storyResponse.json();
  minigames = await minigamesResponse.json();
  gacha = await gachaResponse.json();
  resources = await resourcesResponse.json();
  characters = await charactersResponse.json();
  renderEditor();
  applySavedOverrides();
  updateChangedState();
  els.status.textContent = "已读取剧情。修改后点“保存修改”，或直接点“测试这一段”查看效果。";
}

function renderEditor() {
  const storyCards = Object.entries(story.nodes).map(([nodeId, node]) => {
    const rows = collectEditableStrings(node, `story.nodes.${nodeId}`)
      .map((item) => fieldMarkup(item.path, item.label, item.value, item.long));
    if (!rows.length) return "";
    const heading = node.chapter || node.title || node.text || node.prompt || node.type || nodeId;
    return `
      <article class="field-card" data-search="${escapeAttr(`${nodeId} ${heading}`)}">
        <div class="field-title">
          <div>
            <span class="field-kicker">${escapeHtml(node.type || "node")}</span>
            <h2>${escapeHtml(shortText(heading, 34))}</h2>
          </div>
          <div class="field-meta">
            <small>${escapeHtml(nodeId)}</small>
            <button class="test-node-btn" data-test-node="${escapeAttr(nodeId)}" type="button">测试这一段</button>
          </div>
        </div>
        <div class="field-grid">${rows.join("")}</div>
      </article>
    `;
  }).join("");

  const minigameCards = Object.entries(minigames).map(([gameId, config]) => {
    const rows = collectEditableStrings(config, `minigames.${gameId}`)
      .map((item) => fieldMarkup(item.path, item.label, item.value, item.long));
    if (!rows.length) return "";
    const heading = config.title || config.subtitle || gameId;
    const testNodeId = findTestNodeForGame(gameId);
    return `
      <article class="field-card" data-search="${escapeAttr(`${gameId} ${heading}`)}">
        <div class="field-title">
          <div>
            <span class="field-kicker">minigame</span>
            <h2>${escapeHtml(shortText(heading, 34))}</h2>
          </div>
          <div class="field-meta">
            <small>${escapeHtml(gameId)}</small>
            ${testNodeId ? `<button class="test-node-btn" data-test-node="${escapeAttr(testNodeId)}" type="button">测试小游戏</button>` : ""}
          </div>
        </div>
        <div class="field-grid">${rows.join("")}</div>
      </article>
    `;
  }).join("");

  const gachaCards = Object.entries(gacha).map(([poolId, pool]) => dataCardMarkup("gacha", poolId, pool, `gacha.${poolId}`)).join("");
  const resourceCards = Object.entries(resources).map(([resourceId, resource]) => dataCardMarkup("resource", resourceId, resource, `resources.${resourceId}`)).join("");
  const characterCards = Object.entries(characters).map(([characterId, character]) => dataCardMarkup("character", characterId, character, `characters.${characterId}`)).join("");

  els.fields.innerHTML = storyCards + minigameCards + gachaCards + resourceCards + characterCards;
  controls = [...els.fields.querySelectorAll("[data-edit-path]")];
  controls.forEach((control) => {
    control.addEventListener("input", updateChangedState);
  });
  els.fields.querySelectorAll("[data-test-node]").forEach((button) => {
    button.addEventListener("click", () => testNode(button.dataset.testNode));
  });
}

function dataCardMarkup(type, id, value, path) {
  const rows = collectEditableStrings(value, path)
    .map((item) => fieldMarkup(item.path, item.label, item.value, item.long));
  if (!rows.length) return "";
  const heading = value.title || value.displayName || value.name || id;
  return `
    <article class="field-card" data-search="${escapeAttr(`${id} ${heading}`)}">
      <div class="field-title">
        <div>
          <span class="field-kicker">${escapeHtml(type)}</span>
          <h2>${escapeHtml(shortText(heading, 34))}</h2>
        </div>
        <div class="field-meta">
          <small>${escapeHtml(id)}</small>
        </div>
      </div>
      <div class="field-grid">${rows.join("")}</div>
    </article>
  `;
}

function collectEditableStrings(value, path, rows = []) {
  if (!value || typeof value !== "object") return rows;
  Object.entries(value).forEach(([key, child]) => {
    const childPath = `${path}.${key}`;
    if (typeof child === "string") {
      if (isEditableTextKey(key, child)) {
        rows.push({
          path: childPath,
          label: labelForPath(childPath, key),
          value: child,
          long: isLongTextKey(key, child)
        });
      }
      return;
    }
    if (Array.isArray(child) && ["answer", "requires"].includes(key)) return;
    if (Array.isArray(child) && child.every((item) => typeof item !== "object")) return;
    if (child && typeof child === "object") collectEditableStrings(child, childPath, rows);
  });
  return rows;
}

function isEditableTextKey(key, value) {
  const technicalKeys = new Set([
    "type", "id", "node", "next", "startNext", "successNext", "background",
    "speaker", "character", "expression", "position", "pool", "game", "doneVar", "resource"
  ]);
  if (technicalKeys.has(key)) return false;
  if (/(Next|Var)$/.test(key)) return false;
  if (/\.(svg|png|jpg|jpeg|webp|mp3|wav)$/i.test(value)) return false;
  return true;
}

function isLongTextKey(key, value) {
  return ["text", "prompt", "subtitle", "description", "resultText", "hintText"].includes(key) || value.length > 38;
}

function labelForPath(path, key) {
  const labels = {
    chapter: "章节标题",
    title: "标题",
    subtitle: "副标题",
    text: "对白/旁白",
    prompt: "提示文字",
    description: "描述",
    resultTitle: "分支结局标题",
    resultText: "分支结局正文",
    hintText: "提示语",
    label: "标签",
    name: "名称",
    displayName: "显示名",
    role: "角色说明",
    rarity: "卡片类型"
  };
  const base = labels[key] || key;
  const match = path.match(/\.(choices|homes|options|items|cards|answers|steps|lines)\.(\d+)\./);
  if (!match) return base;
  const groupLabels = {
    choices: "选项",
    homes: "星球",
    options: "心愿星",
    items: "项目",
    cards: "卡片",
    answers: "答案",
    steps: "步骤",
    lines: "对白"
  };
  return `${groupLabels[match[1]] || match[1]} ${Number(match[2]) + 1} - ${base}`;
}

function findTestNodeForGame(gameId) {
  const entry = Object.entries(story.nodes).find(([, node]) => node.type === "minigame" && node.game === gameId);
  return entry?.[0] || "";
}

function fieldMarkup(path, label, value, long) {
  const valueAttr = long ? escapeHtml(value) : escapeAttr(value);
  return `
    <label class="field-row" data-original="${escapeAttr(value)}">
      <span>${escapeHtml(label)}</span>
      <small>${escapeHtml(path.replace(/^story\.nodes\.[^.]+\./, "").replace(/^minigames\.[^.]+\./, ""))}</small>
      ${long
        ? `<textarea data-edit-path="${escapeAttr(path)}">${valueAttr}</textarea>`
        : `<input data-edit-path="${escapeAttr(path)}" value="${valueAttr}" />`}
    </label>
  `;
}

function applySavedOverrides() {
  const raw = localStorage.getItem(TEXT_OVERRIDES_KEY);
  if (!raw) return;
  let saved;
  try {
    saved = JSON.parse(raw);
  } catch {
    return;
  }
  controls.forEach((control) => {
    const value = getByPath(saved, control.dataset.editPath);
    if (typeof value === "string") control.value = value;
  });
}

function buildOverrides() {
  const overrides = { story: { nodes: {} }, minigames: {}, gacha: {}, resources: {}, characters: {} };
  controls.forEach((control) => {
    const original = control.closest(".field-row").dataset.original;
    if (control.value === original) return;
    setByPath(overrides, control.dataset.editPath, control.value);
  });
  return overrides;
}

function saveOverrides() {
  localStorage.setItem(TEXT_OVERRIDES_KEY, JSON.stringify(buildOverrides()));
  els.status.textContent = "已保存。回到游戏页面刷新，新的文字就会生效。";
}

function testNode(nodeId) {
  saveOverrides();
  const lateStory = /^(gate_select|xingyu_|trial_|ending_|birthday_)/.test(nodeId);
  const params = new URLSearchParams({
    v: "vn34",
    testNode: nodeId,
    dust: "1"
  });
  if (lateStory) params.set("unlockHomes", "1");
  window.location.href = `./index.html?${params.toString()}`;
}

function resetOverrides() {
  if (!confirm("确定清空所有文字修改吗？")) return;
  localStorage.removeItem(TEXT_OVERRIDES_KEY);
  controls.forEach((control) => {
    control.value = control.closest(".field-row").dataset.original;
  });
  updateChangedState();
  els.status.textContent = "已清空修改。刷新游戏后会恢复原始文字。";
}

function exportOverrides() {
  const blob = new Blob([JSON.stringify(buildOverrides(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "angel-game-text-overrides.json";
  link.click();
  URL.revokeObjectURL(url);
}

function updateChangedState() {
  let changed = 0;
  controls.forEach((control) => {
    const row = control.closest(".field-row");
    const isChanged = control.value !== row.dataset.original;
    row.classList.toggle("changed", isChanged);
    if (isChanged) changed += 1;
  });
  els.status.textContent = changed ? `当前有 ${changed} 处文字修改尚未保存。` : "当前没有未保存的文字修改。";
}

function filterFields() {
  const term = els.search.value.trim().toLowerCase();
  document.querySelectorAll(".field-card").forEach((card) => {
    const text = card.textContent.toLowerCase();
    card.hidden = term && !text.includes(term);
  });
}

function getByPath(root, path) {
  return path.split(".").reduce((current, key) => current?.[key], root);
}

function setByPath(root, path, value) {
  const parts = path.split(".");
  let current = root;
  parts.forEach((part, index) => {
    if (index === parts.length - 1) {
      current[part] = value;
      return;
    }
    current[part] ||= {};
    current = current[part];
  });
}

function shortText(text, limit) {
  return String(text).length > limit ? `${String(text).slice(0, limit)}...` : String(text);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll('"', "&quot;");
}

els.save.addEventListener("click", saveOverrides);
els.reset.addEventListener("click", resetOverrides);
els.export.addEventListener("click", exportOverrides);
els.search.addEventListener("input", filterFields);

loadStory().catch((error) => {
  els.status.textContent = `读取失败：${error.message}`;
});
