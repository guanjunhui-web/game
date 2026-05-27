const TEXT_OVERRIDES_KEY = "angel_vn_text_overrides_v1";
const ADDED_NODES_KEY = "angel_vn_added_nodes_v1";
const NODE_REWIRES_KEY = "angel_vn_node_rewires_v1";
const EDITOR_VERSION = "vn97";

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
let addedNodes = {};
let nodeRewires = {};
let baseNodeIds = [];

async function loadStory() {
  const [storyResponse, minigamesResponse, gachaResponse, resourcesResponse, charactersResponse] = await Promise.all([
    fetch("./data/story.json", { cache: "no-store" }),
    fetch("./data/minigames.json", { cache: "no-store" }),
    fetch("./data/gacha.json", { cache: "no-store" }),
    fetch("./data/resources.json", { cache: "no-store" }),
    fetch("./data/characters.json", { cache: "no-store" })
  ]);
  story = await storyResponse.json();
  baseNodeIds = Object.keys(story.nodes);
  minigames = await minigamesResponse.json();
  gacha = await gachaResponse.json();
  resources = await resourcesResponse.json();
  characters = await charactersResponse.json();
  applyStoryAdditions();
  const params = new URLSearchParams(window.location.search);
  const cleanupTestNode = params.get("cleanupTestNode");
  if (cleanupTestNode) {
    delete addedNodes[cleanupTestNode];
    Object.entries(nodeRewires).forEach(([id, next]) => {
      if (next === cleanupTestNode) delete nodeRewires[id];
    });
    localStorage.setItem(ADDED_NODES_KEY, JSON.stringify(addedNodes));
    localStorage.setItem(NODE_REWIRES_KEY, JSON.stringify(nodeRewires));
    window.location.href = `./editor.html?v=${EDITOR_VERSION}`;
    return;
  }
  const addAfter = params.get("addAfter");
  if (addAfter) {
    renderNewDialoguePage(addAfter);
    return;
  }
  renderEditor();
  applySavedOverrides();
  updateChangedState();
  els.status.textContent = "已读取剧情。修改后点“保存修改”，或直接点“测试这一段”查看效果。";
}

function readJsonStorage(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function applyStoryAdditions() {
  addedNodes = readJsonStorage(ADDED_NODES_KEY, {});
  nodeRewires = readJsonStorage(NODE_REWIRES_KEY, {});
  Object.entries(addedNodes).forEach(([id, node]) => {
    if (node && typeof node === "object") story.nodes[id] = node;
  });
  Object.entries(nodeRewires).forEach(([id, next]) => {
    if (story.nodes[id] && typeof next === "string") story.nodes[id].next = next;
  });
}

function renderEditor() {
  const storyCards = orderedStoryEntries().map(([nodeId, node]) => {
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
            ${canAddDialogueAfter(node) ? `<button class="add-dialogue-btn" data-add-after="${escapeAttr(nodeId)}" type="button" title="在这一段后面新增一段对话">＋ 新段落</button>` : ""}
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
  els.fields.querySelectorAll("[data-add-after]").forEach((button) => {
    button.addEventListener("click", () => openNewDialoguePage(button.dataset.addAfter));
  });
}

function orderedStoryEntries() {
  const visited = new Set();
  const entries = [];
  const pushNodeAndInsertedChildren = (nodeId) => {
    let currentId = nodeId;
    while (currentId && story.nodes[currentId] && !visited.has(currentId)) {
      visited.add(currentId);
      entries.push([currentId, story.nodes[currentId]]);
      const nextId = story.nodes[currentId].next;
      currentId = addedNodes[nextId] ? nextId : "";
    }
  };
  baseNodeIds.forEach(pushNodeAndInsertedChildren);
  Object.keys(story.nodes).forEach((nodeId) => {
    if (!visited.has(nodeId)) pushNodeAndInsertedChildren(nodeId);
  });
  return entries;
}

function canAddDialogueAfter(node) {
  return ["dialogue", "reward"].includes(node.type);
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

function openNewDialoguePage(nodeId) {
  saveOverrides();
  window.location.href = `./editor.html?v=${EDITOR_VERSION}&addAfter=${encodeURIComponent(nodeId)}`;
}

function renderNewDialoguePage(afterId) {
  const source = story.nodes[afterId];
  if (!source) {
    els.status.textContent = "没有找到要插入的位置。";
    return;
  }
  controls = [];
  els.search.closest("label").style.display = "none";
  els.save.style.display = "none";
  els.reset.style.display = "none";
  els.export.style.display = "none";
  const sourceNext = source.next || "";
  const defaultSpeaker = source.speaker || "narrator";
  const characterOptions = Object.entries(characters)
    .map(([id, character]) => `<option value="${escapeAttr(id)}" ${id === defaultSpeaker ? "selected" : ""}>${escapeHtml(character.displayName || id)}</option>`)
    .join("");
  const sourceSprite = source.sprite || {};
  els.status.textContent = `正在为 ${afterId} 后面添加新对话。保存后，原本的下一段会自动接到新对话后面。`;
  els.fields.innerHTML = `
    <article class="field-card new-dialogue-card">
      <div class="field-title">
        <div>
          <span class="field-kicker">NEW DIALOGUE</span>
          <h2>添加新一段对话</h2>
        </div>
        <div class="field-meta">
          <small>插入到 ${escapeHtml(afterId)} 后</small>
        </div>
      </div>
      <div class="new-dialogue-hint">
        <p>新段落会沿用上一段的背景、角色位置和表情。你只需要填写这一页要说的话。</p>
        <p>保存后流程会变成：当前段落 → 新段落 → 原本下一段。</p>
      </div>
      <div class="field-grid">
        <label class="field-row">
          <span>说话的人</span>
          <small>speaker</small>
          <select id="newSpeaker">${characterOptions}</select>
        </label>
        <label class="field-row">
          <span>新增对白/旁白</span>
          <small>text</small>
          <textarea id="newDialogueText" placeholder="在这里写新增的一页对白。"></textarea>
        </label>
        <label class="field-row">
          <span>节点编号</span>
          <small>自动生成，也可以改成容易记的英文编号</small>
          <input id="newNodeId" value="${escapeAttr(makeNewNodeId(afterId))}" />
        </label>
      </div>
      <div class="new-dialogue-actions">
        <button id="saveNewDialogueBtn" type="button">保存新段落</button>
        <button id="cancelNewDialogueBtn" type="button">返回编辑器</button>
      </div>
    </article>
  `;
  els.fields.querySelector("#newDialogueText").focus();
  els.fields.querySelector("#cancelNewDialogueBtn").addEventListener("click", () => {
    window.location.href = `./editor.html?v=${EDITOR_VERSION}`;
  });
  els.fields.querySelector("#saveNewDialogueBtn").addEventListener("click", () => {
    saveNewDialogue({
      afterId,
      source,
      sourceNext,
      sourceSprite
    });
  });
}

function makeNewNodeId(afterId) {
  const base = `${afterId}_extra`;
  let index = 1;
  while (story.nodes[`${base}_${String(index).padStart(2, "0")}`]) index += 1;
  return `${base}_${String(index).padStart(2, "0")}`;
}

function saveNewDialogue({ afterId, source, sourceNext, sourceSprite }) {
  const id = els.fields.querySelector("#newNodeId").value.trim();
  const text = els.fields.querySelector("#newDialogueText").value.trim();
  const speaker = els.fields.querySelector("#newSpeaker").value;
  if (!/^[A-Za-z0-9_]+$/.test(id)) {
    els.status.textContent = "节点编号只能用英文字母、数字和下划线。";
    return;
  }
  if (story.nodes[id] && !addedNodes[id]) {
    els.status.textContent = "这个节点编号已经存在，请换一个。";
    return;
  }
  if (!text) {
    els.status.textContent = "请先填写新增对白。";
    return;
  }
  const newNode = {
    type: "dialogue",
    background: source.background,
    speaker,
    text
  };
  if (sourceNext) newNode.next = sourceNext;
  if (sourceSprite?.character && speaker !== "narrator") {
    newNode.sprite = { ...sourceSprite, character: speaker };
  }
  addedNodes[id] = newNode;
  nodeRewires[afterId] = id;
  localStorage.setItem(ADDED_NODES_KEY, JSON.stringify(addedNodes));
  localStorage.setItem(NODE_REWIRES_KEY, JSON.stringify(nodeRewires));
  els.status.textContent = "新段落已保存。正在回到文字编辑器。";
  window.location.href = `./editor.html?v=${EDITOR_VERSION}`;
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
    answer: "正确答案 ID",
    label: "标签",
    name: "名称",
    displayName: "显示名",
    role: "角色说明",
    rarity: "卡片类型"
  };
  const base = labels[key] || key;
  const match = path.match(/\.(choices|homes|options|items|cards|answers|steps|lines|questions)\.(\d+)\./);
  if (!match) return base;
  const groupLabels = {
    choices: "选项",
    homes: "星球",
    options: "心愿星",
    items: "项目",
    cards: "卡片",
    answers: "答案",
    questions: "题目",
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
    if (typeof value === "string" && /^[?\s]+$/.test(value) && value.includes("?")) return;
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
    v: EDITOR_VERSION,
    testNode: nodeId,
    dust: "1"
  });
  if (lateStory) params.set("unlockHomes", "1");
  window.location.href = `./index.html?${params.toString()}`;
}

function resetOverrides() {
  if (!confirm("确定清空所有文字修改吗？")) return;
  localStorage.removeItem(TEXT_OVERRIDES_KEY);
  localStorage.removeItem(ADDED_NODES_KEY);
  localStorage.removeItem(NODE_REWIRES_KEY);
  controls.forEach((control) => {
    control.value = control.closest(".field-row").dataset.original;
  });
  updateChangedState();
  els.status.textContent = "已清空修改。刷新游戏后会恢复原始文字。";
}

function exportOverrides() {
  const payload = {
    textOverrides: buildOverrides(),
    addedNodes,
    nodeRewires
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
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
