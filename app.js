const STORAGE_KEY = "angel_vn_save_v1";
const READ_KEY = "angel_vn_read_v1";
const TEXT_OVERRIDES_KEY = "angel_vn_text_overrides_v1";
const ASSET_ROOT = "./assets";
const ASSET_VERSION = "vn35";

const els = {
  screen: document.querySelector("#screen"),
  background: document.querySelector("#background"),
  stage: document.querySelector("#stage"),
  chapterCard: document.querySelector("#chapterCard"),
  speakerName: document.querySelector("#speakerName"),
  dialogueText: document.querySelector("#dialogueText"),
  dialogueBox: document.querySelector("#dialogueBox"),
  choiceLayer: document.querySelector("#choiceLayer"),
  advanceBtn: document.querySelector("#advanceBtn"),
  titleMenu: document.querySelector("#titleMenu"),
  modal: document.querySelector("#modal"),
  resourceBar: document.querySelector("#resourceBar"),
  menuBtn: document.querySelector("#menuBtn"),
  musicBtn: document.querySelector("#musicBtn"),
  historyBtn: document.querySelector("#historyBtn"),
  autoBtn: document.querySelector("#autoBtn"),
  skipBtn: document.querySelector("#skipBtn")
};

const game = {
  story: null,
  characters: null,
  resources: null,
  gacha: null,
  minigames: null,
  nodeId: null,
  currentNode: null,
  vars: {},
  inventory: { stardust: 0 },
  history: [],
  read: new Set(JSON.parse(localStorage.getItem(READ_KEY) || "[]")),
  typing: false,
  fullText: "",
  typeTimer: null,
  auto: false,
  skip: false,
  music: false,
  audio: null,
  gachaCounters: {},
  miniCleanup: null
};

function isTruthyFlag(key) {
  return (game.vars[key] || 0) > 0;
}

function asset(path) {
  return `${ASSET_ROOT}/${path}?v=${ASSET_VERSION}`;
}

async function loadJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`Cannot load ${path}`);
  return response.json();
}

async function boot() {
  [game.story, game.characters, game.resources, game.gacha, game.minigames] = await Promise.all([
    loadJson("./data/story.json"),
    loadJson("./data/characters.json"),
    loadJson("./data/resources.json"),
    loadJson("./data/gacha.json"),
    loadJson("./data/minigames.json")
  ]);
  applyTextOverrides();
  renderResourceBar();
  const params = new URLSearchParams(window.location.search);
  const testNode = params.get("testNode");
  if (testNode && game.story.nodes[testNode]) {
    applyTestState({
      unlockHomes: params.get("unlockHomes") === "1",
      stardust: params.get("dust") === "1" ? 120 : game.inventory.stardust
    });
    showNode(testNode);
    return;
  }
  showNode(game.story.start);
}

function applyTextOverrides() {
  const raw = localStorage.getItem(TEXT_OVERRIDES_KEY);
  if (!raw) return;
  let overrides;
  try {
    overrides = JSON.parse(raw);
  } catch {
    return;
  }
  mergeStringOverrides(game.story, overrides?.story);
  mergeStringOverrides(game.minigames, overrides?.minigames);
  mergeStringOverrides(game.gacha, overrides?.gacha);
  mergeStringOverrides(game.resources, overrides?.resources);
  mergeStringOverrides(game.characters, overrides?.characters);
}

function mergeStringOverrides(target, source) {
  if (!target || !source || typeof source !== "object") return;
  Object.entries(source).forEach(([key, value]) => {
    if (typeof value === "string") {
      if (key in target) target[key] = value;
      return;
    }
    if (Array.isArray(value)) {
      if (!Array.isArray(target[key])) return;
      value.forEach((item, index) => mergeStringOverrides(target[key][index], item));
      return;
    }
    if (value && typeof value === "object") {
      mergeStringOverrides(target[key], value);
    }
  });
}

function saveGame() {
  if (!game.nodeId || game.currentNode?.type === "title") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    nodeId: game.nodeId,
    vars: game.vars,
    inventory: game.inventory,
    history: game.history.slice(-60),
    gachaCounters: game.gachaCounters
  }));
  localStorage.setItem(READ_KEY, JSON.stringify([...game.read]));
}

function loadGame() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return false;
  const save = JSON.parse(raw);
  game.vars = save.vars || {};
  game.inventory = { stardust: save.inventory?.stardust || 0 };
  game.history = save.history || [];
  game.gachaCounters = save.gachaCounters || {};
  renderResourceBar();
  showNode(save.nodeId);
  return true;
}

function setBackground(name) {
  if (!name) return;
  const url = asset(`images/${name}`);
  els.background.style.backgroundImage = `url("${url}")`;
}

function showChapter(title) {
  if (!title) return;
  els.chapterCard.textContent = title;
  els.chapterCard.classList.remove("hidden");
  window.clearTimeout(showChapter.timer);
  showChapter.timer = window.setTimeout(() => els.chapterCard.classList.add("hidden"), 1800);
}

function characterName(id) {
  return game.characters[id]?.displayName || id || "";
}

function addHistory(speaker, text) {
  if (!text) return;
  game.history.push({ speaker: characterName(speaker), text });
  if (game.history.length > 80) game.history.shift();
}

function showNode(id) {
  const node = game.story.nodes[id];
  if (!node) throw new Error(`Missing story node: ${id}`);
  window.clearTimeout(game.typeTimer);
  game.nodeId = id;
  game.currentNode = node;
  game.read.add(id);
  setBackground(node.background);
  renderResourceBar();
  clearTransientUi();
  if (node.chapter) showChapter(node.chapter);

  switch (node.type) {
    case "title":
      renderTitle(node);
      break;
    case "dialogue":
      renderDialogue(node);
      break;
    case "choice":
      renderChoice(node);
      break;
    case "reward":
      renderReward(node);
      break;
    case "gacha":
      renderGacha(node);
      break;
    case "minigame":
      renderMinigame(node);
      break;
    case "home_map":
      renderHomeMap(node);
      break;
    case "wish_gate":
      renderWishGate(node);
      break;
    default:
      throw new Error(`Unknown node type: ${node.type}`);
  }
  saveGame();
}

function goNext(node) {
  applyVars(node.set);
  showNode(node.next);
}

function clearTransientUi() {
  if (game.miniCleanup) {
    game.miniCleanup();
    game.miniCleanup = null;
  }
  els.screen.classList.remove("map-screen");
  els.titleMenu.classList.add("hidden");
  els.titleMenu.classList.remove("map-mode");
  els.modal.classList.add("hidden");
  els.modal.innerHTML = "";
  els.choiceLayer.innerHTML = "";
  els.choiceLayer.classList.remove("active");
  els.advanceBtn.classList.remove("hidden");
  els.dialogueBox.classList.remove("hidden");
}

function renderTitle(node) {
  els.stage.innerHTML = "";
  els.dialogueBox.classList.add("hidden");
  els.titleMenu.classList.remove("hidden");
  const hasSave = Boolean(localStorage.getItem(STORAGE_KEY));
  els.titleMenu.innerHTML = `
    <div class="title-panel">
      <span class="title-kicker">BIRTHDAY VISUAL NOVEL</span>
      <h1>${node.title}</h1>
      <p>${node.subtitle}</p>
      <div class="title-actions">
        <button data-action="start" type="button">开始游戏</button>
        <button data-action="continue" type="button" ${hasSave ? "" : "disabled"}>继续游戏</button>
        <button data-action="settings" type="button">设置</button>
      </div>
    </div>
  `;
  els.titleMenu.querySelector('[data-action="start"]').addEventListener("click", () => {
    resetRun();
    startMusic();
    showNode(node.startNext);
  });
  els.titleMenu.querySelector('[data-action="continue"]').addEventListener("click", () => {
    startMusic();
    loadGame();
  });
  els.titleMenu.querySelector('[data-action="settings"]').addEventListener("click", showSettings);
}

function resetRun() {
  game.vars = {};
  game.inventory = { stardust: 0 };
  game.history = [];
  game.gachaCounters = {};
  localStorage.removeItem(STORAGE_KEY);
}

function renderDialogue(node) {
  renderSprites(node.sprite ? [node.sprite] : []);
  els.speakerName.textContent = characterName(node.speaker);
  typeText(node.text);
  addHistory(node.speaker, node.text);
}

function renderChoice(node) {
  renderSprites(node.sprite ? [node.sprite] : []);
  els.speakerName.textContent = characterName(node.speaker);
  typeText(node.text || node.prompt || "");
  addHistory(node.speaker, node.text || node.prompt || "");
  els.advanceBtn.classList.add("hidden");
  els.choiceLayer.classList.add("active");
  els.choiceLayer.innerHTML = node.choices.map((choice, index) => {
    const affordable = canPay(choice.cost);
    return `
      <button class="choice-btn" data-index="${index}" type="button" ${affordable ? "" : "disabled"}>
        <span>${choice.text}</span>
        ${choice.cost ? `<em>${costLabel(choice.cost)}</em>` : ""}
      </button>
    `;
  }).join("");
  els.choiceLayer.querySelectorAll(".choice-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const choice = node.choices[Number(button.dataset.index)];
      if (!canPay(choice.cost)) return;
      pay(choice.cost);
      applyVars(choice.set);
      addHistory(node.choiceSpeaker || node.speaker, choice.text);
      showNode(choice.next);
    });
  });
}

function renderReward(node) {
  renderSprites(node.sprite ? [node.sprite] : []);
  gain(node.gain);
  els.speakerName.textContent = characterName(node.speaker);
  typeText(node.text);
  addHistory(node.speaker, node.text);
}

function renderGacha(node) {
  const pool = game.gacha[node.pool];
  if (!pool) throw new Error(`Missing gacha pool: ${node.pool}`);
  renderSprites([]);
  els.speakerName.textContent = "星愿仪";
  els.dialogueText.textContent = "星愿仪把星尘藏进了三个小礼物盒。选一个打开吧。";
  els.advanceBtn.classList.add("hidden");
  els.modal.classList.remove("hidden");
  const canDraw = (game.inventory.stardust || 0) >= pool.cost;
  els.modal.innerHTML = `
    <div class="gacha-machine">
      <span class="modal-kicker">STAR WISH</span>
      <h2>${pool.title}</h2>
      <p>${pool.cost > 0 ? `消耗 ${pool.cost} 点星尘。` : "这一次不用消耗星尘。"}三份礼物里，只有星星知道哪一份星尘会来到你手里。</p>
      <div class="gift-grid">
        <button class="gift-box gift-rose" data-gift="0" type="button" ${canDraw ? "" : "disabled"}><span></span><em>星粉礼物</em></button>
        <button class="gift-box gift-gold" data-gift="1" type="button" ${canDraw ? "" : "disabled"}><span></span><em>金色礼物</em></button>
        <button class="gift-box gift-blue" data-gift="2" type="button" ${canDraw ? "" : "disabled"}><span></span><em>月蓝礼物</em></button>
      </div>
      ${canDraw ? "<p class=\"gift-hint\">选择一个礼物盒打开。</p>" : "<p class=\"gift-hint\">星尘不足，稍后再回来打开礼物。</p>"}
      <button id="skipGachaBtn" type="button">稍后再抽</button>
    </div>
  `;
  els.modal.querySelectorAll(".gift-box").forEach((button) => {
    button.addEventListener("click", () => drawGift(node, pool, button));
  });
  els.modal.querySelector("#skipGachaBtn").addEventListener("click", () => goNext(node));
}

function drawGift(node, pool, button) {
  if ((game.inventory.stardust || 0) < pool.cost) return;
  if (pool.cost > 0) pay({ stardust: pool.cost });
  const card = pickCard(node.pool, pool);
  const tier = cardTier(card);
  const tierLabel = cardTierLabel(tier);
  gain({ [card.resource]: card.amount });
  renderResourceBar();
  els.modal.querySelectorAll(".gift-box").forEach((gift) => {
    gift.disabled = true;
    gift.classList.toggle("opened", gift === button);
  });
  els.modal.innerHTML = `
    <div class="card-reveal rarity-${tier}">
      <span class="modal-kicker">${tierLabel}</span>
      <div class="drawn-card" aria-label="${tierLabel}卡片">
        <div class="card-stars">${Array.from({ length: Math.min(12, Math.max(3, card.amount)) }, (_, index) => `<span style="--i:${index}">✦</span>`).join("")}</div>
        <div class="card-medal">${card.amount >= 10 ? "SSR" : card.amount >= 8 ? "SR" : card.amount >= 5 ? "R" : "N"}</div>
        <div class="card-icon">✦</div>
        <strong>${game.resources[card.resource].name} x${card.amount}</strong>
      </div>
      <h2>${card.name}</h2>
      <p>${cardRevealText(tier, card)}</p>
      <button id="takeCardBtn" type="button">收下</button>
    </div>
  `;
  els.modal.querySelector("#takeCardBtn").addEventListener("click", () => goNext(node));
}

function cardTier(card) {
  const amount = card.amount || 0;
  if (amount >= 10) return "legend";
  if (amount >= 8) return "epic";
  if (amount >= 5) return "rare";
  return "common";
}

function cardTierLabel(tier) {
  return {
    common: "普通星尘",
    rare: "温暖星尘",
    epic: "闪耀星尘",
    legend: "满天星尘"
  }[tier] || "星尘";
}

function cardRevealText(tier, card) {
  const resourceName = game.resources[card.resource].name;
  if (tier === "legend") return `礼物盒像小夜空一样打开了。获得 ${resourceName} x${card.amount}，星光多得像一场温柔的流星雨。`;
  if (tier === "epic") return `礼物盒里亮起一圈金色星轨。获得 ${resourceName} x${card.amount}，这是很珍贵的一把星尘。`;
  if (tier === "rare") return `礼物盒发出暖暖的光。获得 ${resourceName} x${card.amount}。`;
  return `礼物盒轻轻打开了。获得 ${resourceName} x${card.amount}。`;
}

function pickCard(poolId, pool) {
  const count = game.gachaCounters[poolId] || 0;
  game.gachaCounters[poolId] = count + 1;
  if (pool.guaranteeAfter && game.gachaCounters[poolId] >= pool.guaranteeAfter) {
    game.gachaCounters[poolId] = 0;
    const guaranteed = [...pool.cards].sort((a, b) => rarityScore(b.rarity) - rarityScore(a.rarity))[0];
    return guaranteed;
  }
  const total = pool.cards.reduce((sum, card) => sum + card.weight, 0);
  let roll = Math.random() * total;
  for (const card of pool.cards) {
    roll -= card.weight;
    if (roll <= 0) return card;
  }
  return pool.cards[0];
}

function rarityScore(rarity) {
  return { N: 1, R: 2, SR: 3, SSR: 4 }[rarity] || 1;
}

function renderMinigame(node) {
  const config = game.minigames[node.game];
  if (!config) throw new Error(`Missing minigame: ${node.game}`);
  renderSprites([]);
  els.speakerName.textContent = "星愿观测";
  els.dialogueText.textContent = config.subtitle;
  els.advanceBtn.classList.add("hidden");
  if (config.type === "voice_bubbles") {
    renderVoiceBubbles(node, config);
    return;
  }
  if (config.type === "select_cards") {
    renderSelectCards(node, config);
    return;
  }
  if (config.type === "dino_memory") {
    renderDinoMemory(node, config);
    return;
  }
  if (config.type === "stardust_sort") {
    renderStardustSort(node, config);
    return;
  }
  if (config.type === "poop_dodge") {
    renderPoopDodge(node, config);
    return;
  }
  if (config.type === "busy_home") {
    renderBusyHome(node, config);
    return;
  }
  if (config.type === "rich_runner") {
    renderRichRunner(node, config);
    return;
  }
  if (config.type === "rule_stopwatch") {
    renderRuleStopwatch(node, config);
  }
}

function renderHomeMap(node) {
  renderSprites([]);
  setBackground(node.background || "bg-archive.svg");
  els.screen.classList.add("map-screen");
  els.dialogueBox.classList.add("hidden");
  els.titleMenu.classList.remove("hidden");
  els.titleMenu.classList.add("map-mode");
  const homes = node.homes || [];
  els.titleMenu.innerHTML = `
    <div class="starmap-scene">
      <div class="ambient-stars" aria-hidden="true">
        ${Array.from({ length: 28 }, (_, index) => `<span style="--i:${index}"></span>`).join("")}
      </div>
      <div class="star-field" aria-label="观察星星">
        ${homes.map((home, index) => renderHomeStar(home, index)).join("")}
      </div>
      <div id="starInfo" class="star-info hidden"></div>
    </div>
  `;
  els.titleMenu.querySelectorAll(".star-node").forEach((button) => {
    button.addEventListener("click", () => {
      const home = homes.find((item) => item.id === button.dataset.home);
      if (!home) return;
      showStarInfo(home, node);
    });
  });
  showStarInfo(homes.find((home) => !home.doneVar || !isTruthyFlag(home.doneVar)) || homes[0], node);
}

function renderHomeStar(home, index) {
  const done = home.doneVar && isTruthyFlag(home.doneVar);
  const lockedByStory = !requirementsMet(home.requires);
  const cost = home.cost || 0;
  const current = game.inventory.stardust || 0;
  const affordable = current >= cost;
  let status = `消耗 ${cost} 星尘`;
  if (done) status = "已探索";
  else if (lockedByStory) status = "暂未出现";
  else if (!affordable) status = `还差 ${cost - current} 星尘`;
  else status = `可以探索 · 消耗 ${cost}`;
  const marker = done ? "✓" : lockedByStory ? "…" : affordable ? "✦" : "⌁";
  const title = `${home.title}，${status}`;
  return `
    <button class="star-node star-${home.id} ${done ? "explored" : ""} ${lockedByStory ? "story-locked" : ""} ${!lockedByStory && !affordable ? "dust-locked" : ""}"
      style="--star-index:${index}" data-home="${home.id}" type="button" aria-label="${title}" title="${title}">
      <span class="star-glow"></span>
      <span class="star-sketch-ring ring-a"></span>
      <span class="star-sketch-ring ring-b"></span>
      <span class="star-core">
        <span class="star-texture"></span>
        <span class="star-window"></span>
        <span class="star-spark spark-a"></span>
        <span class="star-spark spark-b"></span>
        <span class="star-spark spark-c"></span>
      </span>
      <span class="star-status" aria-hidden="true">${marker}</span>
    </button>
  `;
}

function showStarInfo(home, node) {
  if (!home) return;
  const info = els.titleMenu.querySelector("#starInfo");
  const selected = els.titleMenu.querySelector(`.star-node[data-home="${home.id}"]`);
  els.titleMenu.querySelectorAll(".star-node").forEach((star) => star.classList.remove("selected"));
  selected?.classList.add("selected");
  const done = home.doneVar && isTruthyFlag(home.doneVar);
  const lockedByStory = !requirementsMet(home.requires);
  const cost = home.cost || 0;
  const current = game.inventory.stardust || 0;
  const affordable = current >= cost;
  let stateText = `需要 ${cost} 星尘`;
  if (done) stateText = "已经观察过";
  else if (lockedByStory) stateText = "还需要先观察前面的星星";
  else if (!affordable) stateText = `还差 ${cost - current} 星尘`;
  else stateText = "可以靠近观察";
  const canEnter = !done && !lockedByStory && affordable;
  info.classList.remove("hidden");
  info.innerHTML = `
    <div class="star-info-card">
      <span class="modal-kicker">OBSERVATION STAR</span>
      <h2>${home.title}</h2>
      <p>${home.description}</p>
      <div class="star-requirement"><span>${stateText}</span><strong>✦ ${cost}</strong></div>
      <div class="star-info-actions">
        <button data-action="confirm-star" type="button" ${canEnter ? "" : "disabled"}>${canEnter ? "确认观察" : done ? "已完成" : "星尘不足"}</button>
      </div>
    </div>
  `;
  const confirm = info.querySelector('[data-action="confirm-star"]');
  confirm.addEventListener("click", () => {
    if (!homeAvailable(home) || done) return;
    pay({ stardust: home.cost || 0 });
    showNode(home.node);
  });
}

function requirementsMet(requires = []) {
  return requires.every((key) => isTruthyFlag(key));
}

function homeAvailable(home) {
  return requirementsMet(home.requires) && (game.inventory.stardust || 0) >= (home.cost || 0);
}

function renderWishGate(node) {
  renderSprites([]);
  setBackground(node.background || "bg-gate.svg");
  els.screen.classList.add("map-screen");
  els.dialogueBox.classList.add("hidden");
  els.titleMenu.classList.remove("hidden");
  els.titleMenu.classList.add("map-mode");
  const options = node.options || [];
  els.titleMenu.innerHTML = `
    <div class="starmap-scene wish-gate-scene">
      <div class="wish-gate-title">
        <span class="title-kicker">WISH GATE</span>
        <h1>${node.title || "心愿之门"}</h1>
        <p>${node.subtitle || "选择真正想去的那颗星。"}</p>
      </div>
      <div class="ambient-stars" aria-hidden="true">
        ${Array.from({ length: 28 }, (_, index) => `<span style="--i:${index}"></span>`).join("")}
      </div>
      <div class="star-field wish-field" aria-label="心愿之门星球">
        ${options.map((option, index) => renderWishStar(option, index)).join("")}
      </div>
      <div id="wishInfo" class="star-info hidden"></div>
    </div>
  `;
  els.titleMenu.querySelectorAll(".star-node").forEach((button) => {
    button.addEventListener("click", () => {
      const option = options.find((item) => item.id === button.dataset.option);
      if (!option) return;
      showWishInfo(option);
    });
  });
  showWishInfo(options[0]);
}

function renderWishStar(option, index) {
  return `
    <button class="star-node wish-option star-${option.id} ${option.correct ? "true-home" : ""}"
      style="--star-index:${index}" data-option="${option.id}" type="button" aria-label="${option.title}" title="${option.title}">
      <span class="star-glow"></span>
      <span class="star-core"><span>${option.correct ? "灯" : "星"}</span></span>
    </button>
  `;
}

function showWishInfo(option) {
  if (!option) return;
  const info = els.titleMenu.querySelector("#wishInfo");
  const selected = els.titleMenu.querySelector(`.star-node[data-option="${option.id}"]`);
  els.titleMenu.querySelectorAll(".star-node").forEach((star) => star.classList.remove("selected"));
  selected?.classList.add("selected");
  info.classList.remove("hidden");
  info.innerHTML = `
    <div class="star-info-card">
      <span class="modal-kicker">FINAL CHOICE</span>
      <h2>${option.title}</h2>
      <p>${option.description}</p>
      <div class="star-info-actions">
        <button data-action="confirm-wish" type="button">选择这颗星</button>
      </div>
    </div>
  `;
  info.querySelector('[data-action="confirm-wish"]').addEventListener("click", () => {
    if (option.next) {
      showNode(option.next);
      return;
    }
    showWishResult(option);
  });
}

function showWishResult(option) {
  els.modal.classList.remove("hidden");
  els.modal.innerHTML = `
    <div class="card-reveal wish-result">
      <span class="modal-kicker">ANOTHER ENDING</span>
      <h2>${option.resultTitle || "另一颗星的结局"}</h2>
      <p>${option.resultText || "这也是一束温柔的光，但它没有叫出小天使真正的名字。"}</p>
      <button data-action="choose-again" type="button">重新选择</button>
    </div>
  `;
  els.modal.querySelector('[data-action="choose-again"]').addEventListener("click", () => {
    els.modal.classList.add("hidden");
  });
}

function renderStardustSort(node, config) {
  const state = { round: 0, score: 0, mistakes: 0 };
  els.modal.classList.remove("hidden");
  const draw = () => {
    const round = config.rounds[state.round];
    els.speakerName.textContent = "星尘练习";
    els.dialogueText.textContent = round.prompt;
    els.modal.innerHTML = `
      <div class="minigame-panel stardust-practice">
        <span class="modal-kicker">STARDUST PRACTICE</span>
        <h2>${config.title}</h2>
        <p>${config.subtitle}</p>
        <div class="star-sort-field">
          ${round.options.map((option) => `
            <button class="star-chip ${option.kind}" data-kind="${option.kind}" type="button">
              <span>${option.icon}</span>
              <em>${option.text}</em>
            </button>
          `).join("")}
        </div>
        <div class="mini-meter">第 ${state.round + 1} / ${config.rounds.length} 轮，已收集 ${state.score} 点光</div>
      </div>
    `;
    els.modal.querySelectorAll(".star-chip").forEach((button) => {
      button.addEventListener("click", () => {
        if (button.dataset.kind === "true") {
          state.score += 1;
          button.classList.add("correct");
          state.round += 1;
          if (state.round >= config.rounds.length) finishPractice();
          else window.setTimeout(draw, 420);
        } else {
          state.mistakes += 1;
          button.classList.add("wrong");
          els.dialogueText.textContent = round.hint || "这颗光还不够稳定，再选一颗真正的星尘。";
        }
      });
    });
  };
  const finishPractice = () => {
    const reward = resolveReward(config);
    gain(reward);
    els.dialogueText.textContent = "星尘轻轻落进掌心。现在可以回到星图，靠近新的观察窗。";
    els.modal.innerHTML = `
      <div class="minigame-panel complete">
        <span class="modal-kicker">COMPLETE</span>
        <h2>星尘收集完成</h2>
        <p>真正的星尘会在认真分辨之后留下来。</p>
        <div class="reward-list">${rewardLabel(reward)}</div>
        <button id="finishMiniBtn" type="button">回到星图</button>
      </div>
    `;
    els.modal.querySelector("#finishMiniBtn").addEventListener("click", () => showNode(node.successNext));
  };
  draw();
}

function renderPoopDodge(node, config) {
  const duration = Number(config.duration || 24);
  const maxHits = Number(config.maxHits || 5);
  const spawnEvery = Number(config.spawnEvery || 560);
  const state = {
    running: true,
    start: performance.now(),
    lastSpawn: 0,
    player: { x: 50, y: 82, size: 9 },
    poops: [],
    hits: 0,
    keys: new Set(),
    dragging: false,
    raf: 0
  };
  const bounds = { left: 8, right: 92, top: 16, bottom: 90 };
  els.modal.classList.remove("hidden");
  els.speakerName.textContent = "星愿观测";
  els.dialogueText.textContent = config.subtitle;
  els.modal.innerHTML = `
    <div class="minigame-panel poop-dodge-panel">
      <span class="modal-kicker">DANMAKU DODGE</span>
      <h2>${config.title}</h2>
      <p>${config.subtitle}</p>
      <div id="poopArena" class="poop-arena" tabindex="0" aria-label="便便流星雨躲避小游戏">
        <div class="poop-sky"></div>
        <div id="poopPlayer" class="poop-player">ʚ★ɞ</div>
      </div>
      <div class="poop-touch-controls" aria-label="触屏方向键">
        <button data-dir="up" type="button">↑</button>
        <button data-dir="left" type="button">←</button>
        <button data-dir="down" type="button">↓</button>
        <button data-dir="right" type="button">→</button>
      </div>
      <div class="mini-meter" id="poopMeter">剩余 ${duration} 秒 · 碰到 0 / ${maxHits} 次</div>
    </div>
  `;
  const arena = els.modal.querySelector("#poopArena");
  const player = els.modal.querySelector("#poopPlayer");
  const meter = els.modal.querySelector("#poopMeter");
  arena.focus();

  const keyMap = {
    ArrowLeft: "left",
    KeyA: "left",
    ArrowRight: "right",
    KeyD: "right",
    ArrowUp: "up",
    KeyW: "up",
    ArrowDown: "down",
    KeyS: "down"
  };
  const onKeyDown = (event) => {
    const key = keyMap[event.code];
    if (!key) return;
    event.preventDefault();
    state.keys.add(key);
  };
  const onKeyUp = (event) => {
    const key = keyMap[event.code];
    if (key) state.keys.delete(key);
  };
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  const movePlayerToPointer = (event) => {
    const rect = arena.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    state.player.x = clamp(x, bounds.left, bounds.right);
    state.player.y = clamp(y, bounds.top, bounds.bottom);
  };
  const onArenaPointerDown = (event) => {
    event.preventDefault();
    state.dragging = true;
    arena.setPointerCapture?.(event.pointerId);
    movePlayerToPointer(event);
  };
  const onArenaPointerMove = (event) => {
    if (!state.dragging) return;
    event.preventDefault();
    movePlayerToPointer(event);
  };
  const onArenaPointerUp = (event) => {
    state.dragging = false;
    arena.releasePointerCapture?.(event.pointerId);
  };
  arena.addEventListener("pointerdown", onArenaPointerDown);
  arena.addEventListener("pointermove", onArenaPointerMove);
  arena.addEventListener("pointerup", onArenaPointerUp);
  arena.addEventListener("pointercancel", onArenaPointerUp);

  els.modal.querySelectorAll("[data-dir]").forEach((button) => {
    const dir = button.dataset.dir;
    const press = (event) => {
      event.preventDefault();
      state.keys.add(dir);
    };
    const release = (event) => {
      event.preventDefault();
      state.keys.delete(dir);
    };
    button.addEventListener("pointerdown", press);
    button.addEventListener("pointerup", release);
    button.addEventListener("pointerleave", release);
    button.addEventListener("pointercancel", release);
  });

  const cleanup = () => {
    state.running = false;
    window.cancelAnimationFrame(state.raf);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    arena.removeEventListener("pointerdown", onArenaPointerDown);
    arena.removeEventListener("pointermove", onArenaPointerMove);
    arena.removeEventListener("pointerup", onArenaPointerUp);
    arena.removeEventListener("pointercancel", onArenaPointerUp);
  };
  game.miniCleanup = cleanup;
  const spawn = (now, elapsed) => {
    const speedBoost = Math.min(1.8, 1 + elapsed / 18000);
    const count = elapsed > 15000 ? 2 : 1;
    for (let i = 0; i < count; i += 1) {
      state.poops.push({
        x: 10 + Math.random() * 80,
        y: -8 - Math.random() * 18,
        size: 6 + Math.random() * 3,
        speed: (0.16 + Math.random() * 0.12) * speedBoost,
        drift: -0.045 + Math.random() * 0.09,
        hit: false,
        id: `${Math.round(now)}-${Math.random()}`
      });
    }
  };
  const tick = (now) => {
    if (!state.running) return;
    const elapsed = now - state.start;
    const remaining = Math.max(0, Math.ceil(duration - elapsed / 1000));
    const move = 0.75;
    if (state.keys.has("left")) state.player.x -= move;
    if (state.keys.has("right")) state.player.x += move;
    if (state.keys.has("up")) state.player.y -= move;
    if (state.keys.has("down")) state.player.y += move;
    state.player.x = clamp(state.player.x, bounds.left, bounds.right);
    state.player.y = clamp(state.player.y, bounds.top, bounds.bottom);

    if (!state.lastSpawn || now - state.lastSpawn >= Math.max(260, spawnEvery - elapsed / 80)) {
      spawn(now, elapsed);
      state.lastSpawn = now;
    }

    state.poops.forEach((poop) => {
      poop.y += poop.speed;
      poop.x += poop.drift;
      if (!poop.hit && distance(state.player.x, state.player.y, poop.x, poop.y) < (state.player.size + poop.size) * 0.55) {
        poop.hit = true;
        state.hits += 1;
        arena.classList.add("hit-flash");
        player.classList.remove("is-hit");
        void player.offsetWidth;
        player.classList.add("is-hit");
        els.dialogueText.textContent = config.hitText || "小心，继续躲开掉下来的东西！";
        window.setTimeout(() => arena.classList.remove("hit-flash"), 180);
        if (state.hits >= maxHits) {
          gameOverPoopDodge(cleanup, node, config, state.hits);
        }
      }
    });
    if (!state.running) return;
    state.poops = state.poops.filter((poop) => poop.y < 108);
    player.style.left = `${state.player.x}%`;
    player.style.top = `${state.player.y}%`;
    arena.querySelectorAll(".poop-drop").forEach((item) => item.remove());
    state.poops.forEach((poop) => {
      const drop = document.createElement("span");
      drop.className = `poop-drop ${poop.hit ? "splatted" : ""}`;
      drop.textContent = "💩";
      drop.style.left = `${poop.x}%`;
      drop.style.top = `${poop.y}%`;
      drop.style.fontSize = `${poop.size * 2.2}px`;
      arena.appendChild(drop);
    });
    meter.textContent = `剩余 ${remaining} 秒 · 碰到 ${state.hits} / ${maxHits} 次`;
    if (elapsed >= duration * 1000) {
      finishPoopDodge(cleanup, node, config, state.hits);
      return;
    }
    state.raf = window.requestAnimationFrame(tick);
  };
  state.raf = window.requestAnimationFrame(tick);
}

function finishPoopDodge(cleanup, node, config, hits) {
  cleanup();
  game.miniCleanup = null;
  const reward = { ...resolveReward(config) };
  if (hits === 0) reward.stardust = (reward.stardust || 0) + 2;
  gain(reward);
  els.dialogueText.textContent = config.successText || "小天使成功穿过了奇怪的流星雨。";
  els.modal.innerHTML = `
    <div class="minigame-panel complete poop-complete">
      <span class="modal-kicker">COMPLETE</span>
      <h2>躲避完成</h2>
      <p>${config.successText || "小天使成功穿过了奇怪的流星雨。"}${hits === 0 ? " 完美躲避，额外获得星尘。" : ` 一共碰到 ${hits} 次，但还是坚持到了最后。`}</p>
      <div class="reward-list">${rewardLabel(reward)}</div>
      <button id="finishMiniBtn" type="button">继续剧情</button>
    </div>
  `;
  els.modal.querySelector("#finishMiniBtn").addEventListener("click", () => showNode(node.successNext));
}

function gameOverPoopDodge(cleanup, node, config, hits) {
  cleanup();
  game.miniCleanup = null;
  els.dialogueText.textContent = "被碰到 5 次了，星愿观测失败。调整一下位置，再试一次。";
  els.modal.innerHTML = `
    <div class="minigame-panel complete poop-complete">
      <span class="modal-kicker">GAME OVER</span>
      <h2>观测失败</h2>
      <p>小天使被便便碰到了 ${hits} 次。重新来一次，撑过 ${config.duration || 15} 秒就能继续剧情。</p>
      <button id="retryPoopBtn" type="button">重新开始</button>
    </div>
  `;
  els.modal.querySelector("#retryPoopBtn").addEventListener("click", () => renderPoopDodge(node, config));
}

function renderBusyHome(node, config) {
  const rounds = config.rounds || [];
  const state = { round: 0, hits: 0, keys: new Set(), dragging: false, raf: 0, running: false };
  els.modal.classList.remove("hidden");
  els.advanceBtn.classList.add("hidden");
  els.speakerName.textContent = "星愿观测";

  const drawRound = () => {
    const round = rounds[state.round];
    state.running = true;
    state.start = performance.now();
    state.player = { x: 14, y: 76, size: 8 };
    state.target = { x: 80 + Math.random() * 8, y: 24 + Math.random() * 18, size: 12 };
    state.blockers = Array.from({ length: round.blockers || 3 }, (_, index) => ({
      x: 26 + Math.random() * 52,
      y: 20 + Math.random() * 58,
      size: 7 + Math.random() * 2,
      vx: (index % 2 ? -0.12 : 0.12) * (1 + index * 0.12),
      vy: (index % 3 ? 0.1 : -0.1) * (1 + index * 0.08),
      icon: ["☎", "💻", "📅", "✉"][index % 4]
    }));
    els.dialogueText.textContent = round.narration;
    els.modal.innerHTML = `
      <div class="minigame-panel busy-home-panel">
        <span class="modal-kicker">TIME & COMPANY</span>
        <h2>${config.title}</h2>
        <p>${config.subtitle}</p>
        <div id="busyArena" class="busy-arena" tabindex="0" aria-label="把陪伴星光送到孩子身边">
          <div class="busy-room"><span class="room-window"></span><span class="room-table"></span><span class="room-lamp"></span></div>
          <div id="busyTarget" class="busy-target"><span>孩子</span><em>${round.targetLabel || "陪伴位置"}</em></div>
          <div id="busyPlayer" class="busy-player">★</div>
        </div>
        <div class="poop-touch-controls busy-controls" aria-label="触屏方向键">
          <button data-dir="up" type="button">↑</button>
          <button data-dir="left" type="button">←</button>
          <button data-dir="down" type="button">↓</button>
          <button data-dir="right" type="button">→</button>
        </div>
        <div id="busyMeter" class="mini-meter">第 ${state.round + 1} / ${rounds.length} 局 · 把星光送过去</div>
      </div>
    `;
    setupBusyHomeControls(state, drawRound);
    state.raf = window.requestAnimationFrame(tick);
  };

  const cleanup = () => {
    state.running = false;
    window.cancelAnimationFrame(state.raf);
    window.removeEventListener("keydown", state.onKeyDown);
    window.removeEventListener("keyup", state.onKeyUp);
  };
  game.miniCleanup = cleanup;

  const finish = () => {
    cleanup();
    game.miniCleanup = null;
    const reward = resolveReward(config);
    gain(reward);
    els.dialogueText.textContent = config.successText || "陪伴星光被送到了孩子身边。";
    els.modal.innerHTML = `
      <div class="minigame-panel complete busy-complete">
        <span class="modal-kicker">COMPLETE</span>
        <h2>陪伴送达</h2>
        <p>${config.successText || "陪伴星光被送到了孩子身边。"}${state.hits ? ` 中途被工作提醒打断了 ${state.hits} 次。` : " 没有被任何提醒打断。"}</p>
        <div class="reward-list">${rewardLabel(reward)}</div>
        <button id="finishMiniBtn" type="button">继续剧情</button>
      </div>
    `;
    els.modal.querySelector("#finishMiniBtn").addEventListener("click", () => showNode(node.successNext));
  };

  const tick = (now) => {
    if (!state.running) return;
    const round = rounds[state.round];
    const arena = els.modal.querySelector("#busyArena");
    const player = els.modal.querySelector("#busyPlayer");
    const target = els.modal.querySelector("#busyTarget");
    const meter = els.modal.querySelector("#busyMeter");
    const elapsed = (now - state.start) / 1000;
    const remaining = Math.max(0, Math.ceil((round.duration || 18) - elapsed));
    const move = 0.62;
    if (state.keys.has("left")) state.player.x -= move;
    if (state.keys.has("right")) state.player.x += move;
    if (state.keys.has("up")) state.player.y -= move;
    if (state.keys.has("down")) state.player.y += move;
    state.player.x = clamp(state.player.x, 8, 92);
    state.player.y = clamp(state.player.y, 12, 88);

    state.blockers.forEach((blocker) => {
      blocker.x += blocker.vx;
      blocker.y += blocker.vy;
      if (blocker.x < 12 || blocker.x > 88) blocker.vx *= -1;
      if (blocker.y < 14 || blocker.y > 84) blocker.vy *= -1;
      if (distance(state.player.x, state.player.y, blocker.x, blocker.y) < state.player.size + blocker.size) {
        state.hits += 1;
        state.player.x = clamp(state.player.x - blocker.vx * 45, 8, 92);
        state.player.y = clamp(state.player.y - blocker.vy * 45, 12, 88);
        player?.classList.remove("is-hit");
        if (player) {
          void player.offsetWidth;
          player.classList.add("is-hit");
        }
        els.dialogueText.textContent = config.hitText || "工作提醒把星光挤开了。";
      }
    });

    player.style.left = `${state.player.x}%`;
    player.style.top = `${state.player.y}%`;
    target.style.left = `${state.target.x}%`;
    target.style.top = `${state.target.y}%`;
    arena.querySelectorAll(".busy-blocker").forEach((item) => item.remove());
    state.blockers.forEach((blocker) => {
      const item = document.createElement("span");
      item.className = "busy-blocker";
      item.textContent = blocker.icon;
      item.style.left = `${blocker.x}%`;
      item.style.top = `${blocker.y}%`;
      arena.appendChild(item);
    });
    meter.textContent = `第 ${state.round + 1} / ${rounds.length} 局 · 剩余 ${remaining} 秒 · 被打断 ${state.hits} 次`;

    if (distance(state.player.x, state.player.y, state.target.x, state.target.y) < state.player.size + state.target.size) {
      cleanup();
      state.round += 1;
      if (state.round >= rounds.length) finish();
      else window.setTimeout(drawRound, 420);
      return;
    }
    if (elapsed >= (round.duration || 18)) {
      state.player.x = 14;
      state.player.y = 76;
      state.start = performance.now();
      els.dialogueText.textContent = "时间又被工作挤走了。小天使把星光捡回来，再试一次。";
    }
    state.raf = window.requestAnimationFrame(tick);
  };

  drawRound();
}

function setupBusyHomeControls(state) {
  const arena = els.modal.querySelector("#busyArena");
  const keyMap = { ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right", ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down" };
  state.onKeyDown = (event) => {
    const key = keyMap[event.code];
    if (!key) return;
    event.preventDefault();
    state.keys.add(key);
  };
  state.onKeyUp = (event) => {
    const key = keyMap[event.code];
    if (key) state.keys.delete(key);
  };
  const moveToPointer = (event) => {
    const rect = arena.getBoundingClientRect();
    state.player.x = clamp(((event.clientX - rect.left) / rect.width) * 100, 8, 92);
    state.player.y = clamp(((event.clientY - rect.top) / rect.height) * 100, 12, 88);
  };
  arena.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    state.dragging = true;
    arena.setPointerCapture?.(event.pointerId);
    moveToPointer(event);
  });
  arena.addEventListener("pointermove", (event) => {
    if (!state.dragging) return;
    event.preventDefault();
    moveToPointer(event);
  });
  arena.addEventListener("pointerup", () => { state.dragging = false; });
  arena.addEventListener("pointercancel", () => { state.dragging = false; });
  window.addEventListener("keydown", state.onKeyDown);
  window.addEventListener("keyup", state.onKeyUp);
  els.modal.querySelectorAll("[data-dir]").forEach((button) => {
    const dir = button.dataset.dir;
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      state.keys.add(dir);
    });
    ["pointerup", "pointerleave", "pointercancel"].forEach((name) => {
      button.addEventListener(name, () => state.keys.delete(dir));
    });
  });
  arena.focus();
}

function renderRichRunner(node, config) {
  const rounds = config.rounds || [];
  const state = {
    round: 0,
    score: 0,
    hits: 0,
    running: true,
    raf: 0,
    start: performance.now(),
    lastObstacle: 0,
    lastCollect: 0,
    ducking: false,
    keys: new Set(),
    player: { x: 22, y: 0, vy: 0, grounded: true },
    items: []
  };
  const ground = 74;
  const maxHits = Number(config.maxHits || 3);
  els.modal.classList.remove("hidden");
  els.advanceBtn.classList.add("hidden");
  els.speakerName.textContent = "星愿观察";

  const cleanup = () => {
    state.running = false;
    window.cancelAnimationFrame(state.raf);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
  };
  game.miniCleanup = cleanup;

  const jump = () => {
    if (!state.running || !state.player.grounded) return;
    state.player.vy = -2.25;
    state.player.grounded = false;
  };
  const setDuck = (value) => {
    state.ducking = value;
  };
  const onKeyDown = (event) => {
    if (["Space", "ArrowUp", "KeyW"].includes(event.code)) {
      event.preventDefault();
      jump();
    }
    if (["ArrowDown", "KeyS"].includes(event.code)) {
      event.preventDefault();
      setDuck(true);
    }
    if (["ArrowLeft", "KeyA"].includes(event.code)) {
      event.preventDefault();
      state.keys.add("left");
    }
    if (["ArrowRight", "KeyD"].includes(event.code)) {
      event.preventDefault();
      state.keys.add("right");
    }
  };
  const onKeyUp = (event) => {
    if (["ArrowDown", "KeyS"].includes(event.code)) {
      event.preventDefault();
      setDuck(false);
    }
    if (["ArrowLeft", "KeyA"].includes(event.code)) {
      event.preventDefault();
      state.keys.delete("left");
    }
    if (["ArrowRight", "KeyD"].includes(event.code)) {
      event.preventDefault();
      state.keys.delete("right");
    }
  };
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  const drawRound = () => {
    const round = rounds[state.round];
    state.score = 0;
    state.hits = 0;
    state.items = [];
    state.keys.clear();
    state.player = { x: 22, y: 0, vy: 0, grounded: true };
    state.ducking = false;
    state.start = performance.now();
    state.lastObstacle = 0;
    state.lastCollect = 0;
    state.running = true;
    els.dialogueText.textContent = round.narration;
    els.modal.innerHTML = `
      <div class="minigame-panel rich-runner-panel">
        <span class="modal-kicker">SIDE SCROLL</span>
        <h2>${config.title}</h2>
        <p>${config.subtitle}</p>
        <div id="richRunnerArena" class="rich-runner-arena" tabindex="0" aria-label="富有之家横版动作小游戏">
          <div class="rich-hall-bg" aria-hidden="true">
            <span class="hall-window"></span>
            <span class="hall-gift gift-a"></span>
            <span class="hall-gift gift-b"></span>
            <span class="hall-table"></span>
          </div>
          <div class="runner-ground"></div>
          <div id="richRunnerPlayer" class="rich-runner-player">小天使</div>
        </div>
        <div class="runner-controls">
          <button data-runner-dir="left" type="button">左移</button>
          <button id="runnerJumpBtn" type="button">跳跃</button>
          <button id="runnerDuckBtn" type="button">低头</button>
          <button data-runner-dir="right" type="button">右移</button>
        </div>
        <div id="richRunnerMeter" class="mini-meter">目标：坚持 ${round.duration || 15} 秒 · 碰撞 0 / ${maxHits}</div>
      </div>
    `;
    const arena = els.modal.querySelector("#richRunnerArena");
    const jumpButton = els.modal.querySelector("#runnerJumpBtn");
    const duckButton = els.modal.querySelector("#runnerDuckBtn");
    arena.focus();
    arena.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      jump();
    });
    jumpButton.addEventListener("click", jump);
    els.modal.querySelectorAll("[data-runner-dir]").forEach((button) => {
      const dir = button.dataset.runnerDir;
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        state.keys.add(dir);
      });
      ["pointerup", "pointerleave", "pointercancel"].forEach((name) => {
        button.addEventListener(name, () => state.keys.delete(dir));
      });
    });
    duckButton.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      setDuck(true);
    });
    ["pointerup", "pointerleave", "pointercancel"].forEach((name) => {
      duckButton.addEventListener(name, () => setDuck(false));
    });
    state.raf = window.requestAnimationFrame(tick);
  };

  const spawnObstacle = (now, speed) => {
    const high = Math.random() > 0.55;
    state.items.push({
      type: "obstacle",
      kind: high ? "call" : "case",
      x: 112,
      y: high ? 46 : ground,
      w: high ? 12 : 10,
      h: high ? 15 : 17,
      speed,
      hit: false,
      label: high ? "电话" : "会议"
    });
    state.lastObstacle = now;
  };

  const spawnCollect = (now, speed) => {
    state.items.push({
      type: "collect",
      x: 112,
      y: Math.random() > 0.5 ? 48 : 64,
      w: 9,
      h: 9,
      speed,
      hit: false,
      label: "陪伴"
    });
    state.lastCollect = now;
  };

  const tick = (now) => {
    if (!state.running) return;
    const round = rounds[state.round];
    const arena = els.modal.querySelector("#richRunnerArena");
    const player = els.modal.querySelector("#richRunnerPlayer");
    const meter = els.modal.querySelector("#richRunnerMeter");
    const elapsed = (now - state.start) / 1000;
    const duration = round.duration || 18;
    const speed = Number(round.speed || 1.1);

    if (state.keys.has("left")) state.player.x -= 0.5;
    if (state.keys.has("right")) state.player.x += 0.5;
    state.player.x = clamp(state.player.x, 14, 42);

    state.player.vy += 0.078;
    state.player.y += state.player.vy;
    if (state.player.y >= 0) {
      state.player.y = 0;
      state.player.vy = 0;
      state.player.grounded = true;
    }

    if (now - state.lastObstacle > 3800 / speed) spawnObstacle(now, 0.28 * speed);
    if (now - state.lastCollect > 1900 / speed) spawnCollect(now, 0.3 * speed);

    const playerBox = {
      x: state.player.x,
      y: ground + state.player.y + (state.ducking ? 6 : 0),
      w: state.ducking ? 14 : 12,
      h: state.ducking ? 10 : 18
    };

    state.items.forEach((item) => {
      item.x -= item.speed;
      if (!item.hit && intersects(playerBox, item)) {
        item.hit = true;
        if (item.type === "collect") {
          state.score += 1;
          els.dialogueText.textContent = "小天使捡到了一小段真正能陪孩子的时间。";
        } else {
          state.hits += 1;
          player?.classList.remove("is-hit");
          if (player) {
            void player.offsetWidth;
            player.classList.add("is-hit");
          }
          els.dialogueText.textContent = config.hitText || "忙碌的提醒擦过翅膀。";
          if (state.hits >= maxHits) {
            gameOver();
            return;
          }
        }
      }
    });
    if (!state.running) return;
    state.items = state.items.filter((item) => item.x > -16 && !(item.type === "collect" && item.hit));

    player.style.left = `${state.player.x}%`;
    player.style.top = `${ground + state.player.y}%`;
    player.classList.toggle("ducking", state.ducking);
    arena.querySelectorAll(".runner-item").forEach((item) => item.remove());
    state.items.forEach((item) => {
      const el = document.createElement("span");
      el.className = `runner-item ${item.type} ${item.kind || ""} ${item.hit ? "hit" : ""}`;
      el.textContent = item.type === "collect" ? "陪伴" : item.label;
      el.style.left = `${item.x}%`;
      el.style.top = `${item.y}%`;
      arena.appendChild(el);
    });
    const remaining = Math.max(0, Math.ceil(duration - elapsed));
    meter.textContent = `目标：坚持 ${duration} 秒 · 剩余 ${remaining} 秒 · 碰撞 ${state.hits} / ${maxHits} · 陪伴 ${state.score}`;

    if (elapsed >= duration) {
      state.round += 1;
      if (state.round >= rounds.length) {
        finish();
      } else {
        state.running = false;
        window.cancelAnimationFrame(state.raf);
        window.setTimeout(drawRound, 520);
      }
      return;
    }
    state.raf = window.requestAnimationFrame(tick);
  };

  function gameOver() {
    state.running = false;
    window.cancelAnimationFrame(state.raf);
    els.dialogueText.textContent = config.failText || "陪伴时间还不够，再试一次。";
    els.modal.innerHTML = `
      <div class="minigame-panel complete rich-runner-panel">
        <span class="modal-kicker">GAME OVER</span>
        <h2>忙碌太多了</h2>
        <p>${config.failText || "被忙碌提醒撞到 3 次了。重新来一次。"}</p>
        <button id="retryRichRunnerBtn" type="button">重新开始</button>
      </div>
    `;
    els.modal.querySelector("#retryRichRunnerBtn").addEventListener("click", () => {
      state.round = 0;
      drawRound();
    });
  }

  function finish() {
    cleanup();
    game.miniCleanup = null;
    const reward = resolveReward(config);
    gain(reward);
    els.dialogueText.textContent = config.successText;
    els.modal.innerHTML = `
      <div class="minigame-panel complete rich-runner-panel">
        <span class="modal-kicker">COMPLETE</span>
        <h2>陪伴时间收集完成</h2>
        <p>${config.successText}${state.hits ? ` 中途被忙碌提醒打断了 ${state.hits} 次。` : " 这一次，小天使没有被提醒声追上。"}</p>
        <div class="reward-list">${rewardLabel(reward)}</div>
        <button id="finishMiniBtn" type="button">继续剧情</button>
      </div>
    `;
    els.modal.querySelector("#finishMiniBtn").addEventListener("click", () => showNode(node.successNext));
  }

  drawRound();
}

function intersects(a, b) {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function distance(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function renderRuleStopwatch(node, config) {
  const duration = Number(config.duration || 20);
  const targetMin = Number(config.targetMin || 10);
  const targetMax = Number(config.targetMax || 10.2);
  const state = {
    running: false,
    start: 0,
    elapsed: 0,
    raf: 0,
    attempt: 1
  };
  els.modal.classList.remove("hidden");
  els.speakerName.textContent = "星愿观察";
  els.dialogueText.textContent = config.subtitle;

  const formatTime = (seconds) => seconds.toFixed(2).padStart(5, "0");
  const render = (message = "准备好后按开始。请让秒表停在 10.00 到 10.20。", tone = "") => {
    const progress = Math.min(100, (state.elapsed / duration) * 100);
    els.modal.innerHTML = `
      <div class="minigame-panel stopwatch-panel ${tone}">
        <span class="modal-kicker">RULE WATCH</span>
        <h2>${config.title}</h2>
        <p>${config.subtitle}</p>
        <div class="stopwatch-face" aria-live="polite">
          <div class="stopwatch-rim"></div>
          <div class="stopwatch-time">${formatTime(state.elapsed)}</div>
          <div class="stopwatch-target">目标 10.00 - 10.20</div>
          <div class="stopwatch-hand" style="--turn:${progress / 100}turn"></div>
        </div>
        <div class="stopwatch-track" aria-hidden="true">
          <span class="target-zone"></span>
          <i style="--progress:${progress}%"></i>
        </div>
        <div class="stopwatch-actions">
          <button id="startStopwatchBtn" type="button">${state.running ? "重新开始" : "开始"}</button>
          <button id="pauseStopwatchBtn" type="button" ${state.running ? "" : "disabled"}>暂停</button>
        </div>
        <div class="mini-meter">${message}</div>
      </div>
    `;
    els.modal.querySelector("#startStopwatchBtn").addEventListener("click", start);
    els.modal.querySelector("#pauseStopwatchBtn").addEventListener("click", pause);
  };

  const tick = (now) => {
    if (!state.running) return;
    state.elapsed = Math.min(duration, (now - state.start) / 1000);
    const timeEl = els.modal.querySelector(".stopwatch-time");
    const hand = els.modal.querySelector(".stopwatch-hand");
    const track = els.modal.querySelector(".stopwatch-track i");
    const progress = Math.min(100, (state.elapsed / duration) * 100);
    if (timeEl) timeEl.textContent = formatTime(state.elapsed);
    if (hand) hand.style.setProperty("--turn", `${progress / 100}turn`);
    if (track) track.style.setProperty("--progress", `${progress}%`);
    if (state.elapsed >= duration) {
      fail(config.lateText || config.failText || "时间已经超过了。再试一次。", "late");
      return;
    }
    state.raf = window.requestAnimationFrame(tick);
  };

  const cleanup = () => {
    state.running = false;
    window.cancelAnimationFrame(state.raf);
  };
  game.miniCleanup = cleanup;

  function start() {
    cleanup();
    state.elapsed = 0;
    state.running = true;
    state.start = performance.now();
    render(`第 ${state.attempt} 次尝试。钟声开始走了。`, "running");
    state.raf = window.requestAnimationFrame(tick);
  }

  function pause() {
    if (!state.running) return;
    cleanup();
    const stoppedAt = state.elapsed;
    if (stoppedAt >= targetMin && stoppedAt <= targetMax) {
      finish(stoppedAt);
      return;
    }
    const message = stoppedAt < targetMin
      ? config.earlyText || config.failText || "停得太早了。"
      : config.lateText || config.failText || "停得太晚了。";
    fail(`${message} 这次停在 ${formatTime(stoppedAt)}。`, stoppedAt < targetMin ? "early" : "late");
  }

  function fail(message, tone) {
    state.running = false;
    state.attempt += 1;
    els.dialogueText.textContent = config.failText || message;
    render(`${message} 请重新开始。`, tone);
  }

  function finish(stoppedAt) {
    const reward = resolveReward(config);
    gain(reward);
    game.miniCleanup = null;
    els.dialogueText.textContent = config.successText;
    els.modal.innerHTML = `
      <div class="minigame-panel complete stopwatch-panel success">
        <span class="modal-kicker">PERFECT TIME</span>
        <h2>挑战成功</h2>
        <div class="stopwatch-face compact">
          <div class="stopwatch-time">${formatTime(stoppedAt)}</div>
          <div class="stopwatch-target">10.00 - 10.20</div>
        </div>
        <p>${config.successText}</p>
        <div class="reward-list">${rewardLabel(reward)}</div>
        <button id="finishMiniBtn" type="button">继续剧情</button>
      </div>
    `;
    els.modal.querySelector("#finishMiniBtn").addEventListener("click", () => showNode(node.successNext));
  }

  render();
}

function renderVoiceBubbles(node, config) {
  const state = { round: 0, mistakes: 0 };
  els.modal.classList.remove("hidden");
  const drawRound = () => {
    const round = config.rounds[state.round];
    els.modal.innerHTML = `
      <div class="minigame-panel">
        <span class="modal-kicker">STAR OBSERVATION</span>
        <h2>${config.title}</h2>
        <p>${config.subtitle}</p>
        <div class="bubble-field">
          ${round.bubbles.map((bubble, index) => `
            <button class="voice-bubble ${bubble.kind}" data-kind="${bubble.kind}" data-index="${index}" type="button">${bubble.text}</button>
          `).join("")}
        </div>
        <div class="mini-meter">第 ${state.round + 1} / ${config.rounds.length} 轮</div>
      </div>
    `;
    els.modal.querySelectorAll(".voice-bubble").forEach((button) => {
      button.addEventListener("click", () => {
        if (button.dataset.kind === "care") {
          button.classList.add("correct");
          state.round += 1;
          if (state.round >= config.rounds.length) finish();
          else window.setTimeout(drawRound, 500);
        } else {
          state.mistakes += 1;
          button.classList.add("wrong");
          els.dialogueText.textContent = "那是一阵热闹的声音。再听听，哪一句更像真正的关心？";
        }
      });
    });
  };
  const finish = () => {
    const reward = state.mistakes === 0 ? resolveReward(config, "perfectReward") : resolveReward(config);
    gain(reward);
    els.modal.innerHTML = `
      <div class="minigame-panel complete">
        <span class="modal-kicker">COMPLETE</span>
        <h2>观测完成</h2>
        <p>你在热闹里找到了真正关心孩子的声音。</p>
        <div class="reward-list">${rewardLabel(reward)}</div>
        <button id="finishMiniBtn" type="button">继续剧情</button>
      </div>
    `;
    els.modal.querySelector("#finishMiniBtn").addEventListener("click", () => showNode(node.successNext));
  };
  drawRound();
}

function renderSelectCards(node, config) {
  const selected = [];
  let mistakes = 0;
  els.modal.classList.remove("hidden");
  const answer = config.answer || [];
  const isComplete = () => {
    if (config.mode === "single") return selected.length === 1 && selected[0] === answer[0];
    if (config.mode === "order") return selected.length === answer.length && selected.every((id, index) => id === answer[index]);
    return answer.every((id) => selected.includes(id));
  };
  const render = (message = "") => {
    els.modal.innerHTML = `
      <div class="minigame-panel">
        <span class="modal-kicker">STAR OBSERVATION</span>
        <h2>${config.title}</h2>
        <p>${config.subtitle}</p>
        <div class="card-field mode-${config.mode}">
          ${config.items.map((item) => `
            <button class="memory-card ${selected.includes(item.id) ? "picked" : ""}" data-id="${item.id}" type="button">
              ${item.text}
            </button>
          `).join("")}
        </div>
        <div class="mini-meter">${message || progressText(config, selected)}</div>
      </div>
    `;
    els.modal.querySelectorAll(".memory-card").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.id;
        if (selected.includes(id)) return;
        if (config.mode === "single") {
          if (id !== answer[0]) {
            mistakes += 1;
            els.dialogueText.textContent = config.hintText || "再认真看一看。";
            render(config.hintText || "再认真看一看。");
            return;
          }
          selected.push(id);
          finish();
          return;
        }
        if (config.mode === "order") {
          const expected = answer[selected.length];
          if (id !== expected) {
            mistakes += 1;
            selected.length = 0;
            els.dialogueText.textContent = config.hintText || "顺序好像不对，再试一次。";
            render(config.hintText || "顺序好像不对，再试一次。");
            return;
          }
          selected.push(id);
        } else {
          if (!answer.includes(id)) {
            mistakes += 1;
            els.dialogueText.textContent = config.hintText || "这个细节很好，但不是现在要找的线索。";
            render(config.hintText || "这个细节很好，但不是现在要找的线索。");
            return;
          }
          selected.push(id);
        }
        if (isComplete()) finish();
        else render();
      });
    });
  };
  const finish = () => {
    const reward = resolveReward(config);
    gain(reward);
    els.dialogueText.textContent = config.successText || "星愿观测完成了。";
    els.modal.innerHTML = `
      <div class="minigame-panel complete">
        <span class="modal-kicker">COMPLETE</span>
        <h2>观测完成</h2>
        <p>${config.successText || "星愿观测完成了。"}</p>
        <div class="reward-list">${rewardLabel(reward)}</div>
        <button id="finishMiniBtn" type="button">继续剧情</button>
      </div>
    `;
    els.modal.querySelector("#finishMiniBtn").addEventListener("click", () => showNode(node.successNext));
  };
  render();
}

function renderDinoMemory(node, config) {
  const cards = shuffleArray((config.pairs || []).flatMap((dino) => [
    { ...dino, uid: `${dino.id}-a` },
    { ...dino, uid: `${dino.id}-b` }
  ]));
  const state = {
    revealed: new Set(),
    matched: new Set(),
    locked: false,
    moves: 0
  };
  els.modal.classList.remove("hidden");
  els.speakerName.textContent = "星愿观察";
  els.dialogueText.textContent = config.introText || config.subtitle;

  const draw = (message = "每次翻开两颗蛋，找出一样的小恐龙。") => {
    els.modal.innerHTML = `
      <div class="minigame-panel dino-memory-panel">
        <span class="modal-kicker">DINO HOME</span>
        <h2>${config.title}</h2>
        <p>${config.subtitle}</p>
        <div class="dino-egg-grid" aria-label="恐龙蛋记忆配对">
          ${cards.map((card, index) => {
            const open = state.revealed.has(index) || state.matched.has(index);
            return `
              <button class="dino-egg ${open ? "open" : ""} ${state.matched.has(index) ? "matched" : ""}"
                data-index="${index}" type="button" ${state.locked || state.matched.has(index) ? "disabled" : ""}
                aria-label="${open ? card.name : "恐龙蛋"}">
                <span class="egg-shell"></span>
                <span class="dino-baby">
                  <strong>${card.icon}</strong>
                  <em>${card.name}</em>
                </span>
              </button>
            `;
          }).join("")}
        </div>
        <div class="mini-meter">${message} 已配对 ${state.matched.size / 2} / ${cards.length / 2} 组 · 翻蛋 ${state.moves} 次</div>
      </div>
    `;
    els.modal.querySelectorAll(".dino-egg").forEach((button) => {
      button.addEventListener("click", () => reveal(Number(button.dataset.index)));
    });
  };

  const reveal = (index) => {
    if (state.locked || state.revealed.has(index) || state.matched.has(index)) return;
    state.revealed.add(index);
    const open = [...state.revealed];
    if (open.length < 2) {
      draw("第一颗蛋打开了，记住里面的小恐龙。");
      return;
    }
    state.moves += 1;
    const [first, second] = open;
    if (cards[first].id === cards[second].id) {
      state.matched.add(first);
      state.matched.add(second);
      state.revealed.clear();
      els.dialogueText.textContent = `找到一组${cards[first].name}。它们高兴得差点把蛋壳当帽子戴。`;
      if (state.matched.size === cards.length) {
        finish();
      } else {
        draw(`配对成功：${cards[first].name}。`);
      }
      return;
    }
    state.locked = true;
    els.dialogueText.textContent = config.mismatchText || "这两只不一样，又钻回蛋里了。";
    draw(config.mismatchText || "这两只不一样，又钻回蛋里了。");
    window.setTimeout(() => {
      state.revealed.clear();
      state.locked = false;
      draw("蛋壳合上了。想一想刚才的位置，再试一次。");
    }, 780);
  };

  const finish = () => {
    const reward = resolveReward(config);
    gain(reward);
    els.dialogueText.textContent = config.successText;
    els.modal.innerHTML = `
      <div class="minigame-panel complete dino-memory-panel">
        <span class="modal-kicker">COMPLETE</span>
        <h2>恐龙蛋全部配对</h2>
        <p>${config.successText}</p>
        <div class="reward-list">${rewardLabel(reward)}</div>
        <button id="finishMiniBtn" type="button">继续剧情</button>
      </div>
    `;
    els.modal.querySelector("#finishMiniBtn").addEventListener("click", () => showNode(node.successNext));
  };

  draw();
}

function shuffleArray(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function progressText(config, selected) {
  if (config.mode === "single") return "选择你认为最重要的一项。";
  if (config.mode === "order") return `已选择 ${selected.length} / ${(config.answer || []).length}。`;
  return `已找到 ${selected.length} / ${(config.answer || []).length} 个线索。`;
}

function renderSprites(sprites) {
  els.stage.innerHTML = sprites.map((spriteData) => {
    const character = game.characters[spriteData.character];
    if (!character?.sprite) return "";
    return `
      <img class="sprite sprite-${spriteData.position || "center"} expression-${spriteData.expression || "normal"}"
        src="${asset(`sprites/${character.sprite}`)}"
        alt="${character.displayName}" />
    `;
  }).join("");
}

function typeText(text) {
  window.clearTimeout(game.typeTimer);
  game.fullText = text || "";
  game.typing = true;
  els.dialogueText.textContent = "";
  const speed = game.skip ? 2 : 24;
  let index = 0;
  const tick = () => {
    index += 1;
    els.dialogueText.textContent = game.fullText.slice(0, index);
    if (index < game.fullText.length) {
      game.typeTimer = window.setTimeout(tick, speed);
    } else {
      game.typing = false;
      if (game.auto && game.currentNode?.next) {
        game.typeTimer = window.setTimeout(() => showNode(game.currentNode.next), 1100);
      }
    }
  };
  tick();
}

function advance() {
  const node = game.currentNode;
  if (!node) return;
  if (game.typing) {
    window.clearTimeout(game.typeTimer);
    els.dialogueText.textContent = game.fullText;
    game.typing = false;
    return;
  }
  if (node.next) showNode(node.next);
}

function applyVars(vars = {}) {
  for (const [key, value] of Object.entries(vars)) {
    game.vars[key] = (game.vars[key] || 0) + value;
  }
}

function gain(items = {}) {
  for (const [key, value] of Object.entries(items)) {
    game.inventory[key] = (game.inventory[key] || 0) + value;
  }
  renderResourceBar();
}

function canPay(cost) {
  if (!cost) return true;
  return Object.entries(cost).every(([key, value]) => (game.inventory[key] || 0) >= value);
}

function pay(cost = {}) {
  for (const [key, value] of Object.entries(cost)) {
    game.inventory[key] = Math.max(0, (game.inventory[key] || 0) - value);
  }
  renderResourceBar();
}

function costLabel(cost = {}) {
  return Object.entries(cost).map(([key, value]) => `${game.resources[key]?.name || key} x${value}`).join(" / ");
}

function rewardLabel(reward = {}) {
  return Object.entries(reward).map(([key, value]) => `<span>${game.resources[key]?.name || key} x${value}</span>`).join("");
}

function resolveReward(config, preferredKey = "reward") {
  const direct = config[preferredKey] || config.reward;
  if (direct) return direct;
  if (config.randomReward) {
    const key = config.randomReward.resource || "stardust";
    const min = config.randomReward.min || 1;
    const max = config.randomReward.max || min;
    return { [key]: min + Math.floor(Math.random() * (max - min + 1)) };
  }
  return { stardust: 1 };
}

function renderResourceBar() {
  if (!game.resources) return;
  const visible = Object.entries(game.inventory).filter(([, value]) => value > 0);
  els.resourceBar.innerHTML = visible.length
    ? visible.map(([key, value]) => `<span><i>✦</i>${game.resources[key].name} ${value}</span>`).join("")
    : `<span><i>✦</i>星尘 0</span>`;
  const canPractice = game.currentNode?.type === "home_map";
  els.resourceBar.classList.toggle("can-practice", canPractice);
  els.resourceBar.title = canPractice ? "点击收集星尘" : "";
  els.resourceBar.tabIndex = canPractice ? 0 : -1;
  els.resourceBar.setAttribute("role", canPractice ? "button" : "status");
  els.resourceBar.setAttribute("aria-label", canPractice ? "点击收集星尘" : "星尘数量");
}

function showHistory() {
  els.modal.classList.remove("hidden");
  els.modal.innerHTML = `
    <div class="history-panel">
      <span class="modal-kicker">BACKLOG</span>
      <h2>对话回想</h2>
      <div class="history-list">
        ${game.history.slice(-30).map((item) => `<p><strong>${item.speaker}</strong>${item.text}</p>`).join("") || "<p>还没有可回看的对白。</p>"}
      </div>
      <button id="closeHistoryBtn" type="button">关闭</button>
    </div>
  `;
  els.modal.querySelector("#closeHistoryBtn").addEventListener("click", () => els.modal.classList.add("hidden"));
}

function showSettings() {
  els.modal.classList.remove("hidden");
  els.modal.innerHTML = `
    <div class="settings-panel">
      <span class="modal-kicker">SETTINGS</span>
      <h2>设置</h2>
      <p>当前样片已支持音乐开关、自动播放、快进和对话回想。后续会加入文字速度和音量滑杆。</p>
      <button id="openEditorBtn" type="button">打开文字编辑器</button>
      <button id="closeSettingsBtn" type="button">关闭</button>
    </div>
  `;
  els.modal.querySelector("#openEditorBtn").addEventListener("click", () => {
    window.open("./editor.html", "_blank");
  });
  const quickTestBtn = document.createElement("button");
  quickTestBtn.id = "openQuickTestBtn";
  quickTestBtn.type = "button";
  quickTestBtn.textContent = "快速测试";
  quickTestBtn.addEventListener("click", showQuickTest);
  els.modal.querySelector("#closeSettingsBtn").before(quickTestBtn);
  els.modal.querySelector("#closeSettingsBtn").addEventListener("click", () => els.modal.classList.add("hidden"));
}

function getNodeLabel(id, node) {
  const source = node.chapter || node.title || node.subtitle || node.text || node.prompt || id;
  const clean = String(source).replace(/\s+/g, " ").trim();
  return `${id} - ${clean.slice(0, 24)}${clean.length > 24 ? "..." : ""}`;
}

function applyTestState({ unlockHomes = false, stardust = 120 } = {}) {
  game.inventory.stardust = Math.max(game.inventory.stardust || 0, stardust);
  if (unlockHomes) {
    ["family01_done", "family02_done", "family03_done", "family04_done", "warm_done"].forEach((key) => {
      game.vars[key] = 1;
    });
  }
  renderResourceBar();
}

function jumpForTest(nodeId, options = {}) {
  startMusic();
  applyTestState(options);
  els.modal.classList.add("hidden");
  showNode(nodeId);
}

function showQuickTest() {
  const nodes = Object.entries(game.story.nodes)
    .filter(([, node]) => node.type !== "title")
    .map(([id, node]) => ({ id, label: getNodeLabel(id, node) }));
  els.modal.classList.remove("hidden");
  els.modal.innerHTML = `
    <div class="quick-test-panel">
      <span class="modal-kicker">TEST JUMP</span>
      <h2>快速测试</h2>
      <p>改完文字后，可以直接跳到后面的段落看效果。这里给的星尘和解锁状态只用于本机测试，不会改剧情文件。</p>
      <div class="quick-test-actions">
        <button data-jump="home_map" data-dust="true" type="button">直接看星图</button>
        <button data-jump="gate_select" data-unlock="true" data-dust="true" type="button">看心愿之门</button>
        <button data-jump="xingyu_001" data-unlock="true" data-dust="true" type="button">看最终剧情</button>
      </div>
      <label class="test-toggle">
        <input id="testDust" type="checkbox" checked>
        <span>跳转时给 120 星尘</span>
      </label>
      <label class="test-toggle">
        <input id="testUnlock" type="checkbox">
        <span>标记前 5 个星球已看完</span>
      </label>
      <label class="test-select-label" for="testNodeSelect">选择任意剧情段</label>
      <select id="testNodeSelect">
        ${nodes.map((item) => `<option value="${item.id}">${item.label}</option>`).join("")}
      </select>
      <div class="quick-test-actions">
        <button id="jumpSelectedNodeBtn" type="button">跳到这一段</button>
        <button id="resetTestSaveBtn" type="button">清空进度</button>
      </div>
      <button id="backSettingsBtn" type="button">返回设置</button>
    </div>
  `;
  els.modal.querySelectorAll("[data-jump]").forEach((button) => {
    button.addEventListener("click", () => {
      jumpForTest(button.dataset.jump, {
        unlockHomes: button.dataset.unlock === "true",
        stardust: button.dataset.dust === "true" ? 120 : game.inventory.stardust
      });
    });
  });
  els.modal.querySelector("#jumpSelectedNodeBtn").addEventListener("click", () => {
    const selected = els.modal.querySelector("#testNodeSelect").value;
    jumpForTest(selected, {
      unlockHomes: els.modal.querySelector("#testUnlock").checked,
      stardust: els.modal.querySelector("#testDust").checked ? 120 : game.inventory.stardust
    });
  });
  els.modal.querySelector("#resetTestSaveBtn").addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    resetRun();
    renderResourceBar();
    showQuickTest();
  });
  els.modal.querySelector("#backSettingsBtn").addEventListener("click", showSettings);
}

function startMusic() {
  if (game.music) return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  const audio = new AudioContext();
  const gain = audio.createGain();
  gain.gain.value = 0.035;
  gain.connect(audio.destination);
  const notes = [523.25, 659.25, 783.99, 987.77, 880, 783.99, 659.25, 587.33];
  let index = 0;
  const play = () => {
    const now = audio.currentTime;
    const osc = audio.createOscillator();
    const env = audio.createGain();
    osc.type = "sine";
    osc.frequency.value = notes[index % notes.length];
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(0.9, now + 0.05);
    env.gain.exponentialRampToValueAtTime(0.001, now + 1.6);
    osc.connect(env);
    env.connect(gain);
    osc.start(now);
    osc.stop(now + 1.65);
    index += 1;
  };
  game.audio = { audio, timer: window.setInterval(play, 900) };
  game.music = true;
  play();
}

function stopMusic() {
  if (!game.music) return;
  window.clearInterval(game.audio.timer);
  game.audio.audio.close();
  game.audio = null;
  game.music = false;
}

els.advanceBtn.addEventListener("click", advance);
els.screen.addEventListener("click", (event) => {
  if (event.target.closest("button") || event.target.closest(".modal")) return;
  if (!els.dialogueBox.classList.contains("hidden") && !els.choiceLayer.classList.contains("active")) advance();
});
els.historyBtn.addEventListener("click", showHistory);
els.autoBtn.addEventListener("click", () => {
  game.auto = !game.auto;
  els.autoBtn.classList.toggle("active", game.auto);
});
els.skipBtn.addEventListener("click", () => {
  game.skip = !game.skip;
  els.skipBtn.classList.toggle("active", game.skip);
});
els.menuBtn.addEventListener("click", () => showNode(game.story.start));
els.musicBtn.addEventListener("click", () => game.music ? stopMusic() : startMusic());
els.resourceBar.addEventListener("click", () => {
  if (game.currentNode?.type !== "home_map") return;
  showNode(game.currentNode.practiceNext || "practice_star_game");
});
els.resourceBar.addEventListener("keydown", (event) => {
  if (game.currentNode?.type !== "home_map" || !["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  showNode(game.currentNode.practiceNext || "practice_star_game");
});

boot().catch((error) => {
  console.error(error);
  els.stage.innerHTML = `<div class="error">加载失败：${error.message}</div>`;
});
