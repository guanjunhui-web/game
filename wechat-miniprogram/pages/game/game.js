const story = require("../../data/story.json");
const characters = require("../../data/characters.json");
const gacha = require("../../data/gacha.json");
const minigames = require("../../data/minigames.json");

const SAVE_KEY = "angel_native_save_v1";
const READ_KEY = "angel_native_read_v1";
const COMPLETE_BY_ENTRY = {
  family01_001: "family01_done",
  family03_001: "family03_done",
  family04_001: "family04_done",
  dino_001: "dino_done",
  warm_001: "warm_done"
};

function asset(path) {
  return `/assets/${path}`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function pick(array) {
  return array[Math.floor(Math.random() * array.length)];
}

Page({
  data: {
    mode: "title",
    titleNode: story.nodes[story.start],
    backgroundSrc: asset("images/bg-heaven.svg"),
    inventory: { stardust: 0 },
    homes: [],
    wishOptions: [],
    selectedHome: null,
    selectedWish: null,
    speakerName: "",
    displayText: "",
    choices: [],
    nextNode: "",
    spriteSrc: "",
    spritePosition: "left",
    photoScene: "",
    showDialogue: false,
    chapterShowing: false,
    chapterTitle: "",
    historyOpen: false,
    history: [],
    gifts: [],
    giftOpened: false,
    mini: {},
    finalCard: {},
    birthPhase: "opening"
  },

  onLoad() {
    this.vars = {};
    this.read = new Set(wx.getStorageSync(READ_KEY) || []);
    this.shownChapters = new Set();
    this.currentNode = null;
    this.currentNodeId = story.start;
    this.nextAfterMini = "";
    this.timers = [];
    this.moveDir = "";
    this.audio = null;
    this.bgm = null;
    this.loadSave();
    this.showNode(story.start, { noSave: true });
  },

  onUnload() {
    this.clearTimers();
    this.stopAudio();
    this.stopBgm();
  },

  clearTimers() {
    (this.timers || []).forEach((timer) => clearInterval(timer));
    this.timers = [];
  },

  setTimer(timer) {
    this.timers.push(timer);
    return timer;
  },

  loadSave() {
    const save = wx.getStorageSync(SAVE_KEY);
    if (!save) return;
    this.vars = save.vars || {};
    this.setData({
      inventory: save.inventory || { stardust: 0 },
      history: save.history || []
    });
    this.currentNodeId = save.nodeId || story.start;
  },

  saveGame() {
    if (this.currentNodeId === story.start) return;
    wx.setStorageSync(SAVE_KEY, {
      nodeId: this.currentNodeId,
      vars: this.vars,
      inventory: this.data.inventory,
      history: this.data.history.slice(-80)
    });
    wx.setStorageSync(READ_KEY, Array.from(this.read));
  },

  resetGame() {
    this.vars = {};
    this.read = new Set();
    this.shownChapters = new Set();
    this.setData({ inventory: { stardust: 0 }, history: [] });
    wx.removeStorageSync(SAVE_KEY);
    wx.removeStorageSync(READ_KEY);
  },

  showNode(id, options = {}) {
    const node = story.nodes[id];
    if (!node) {
      wx.showModal({ title: "缺少剧情", content: id, showCancel: false });
      return;
    }
    this.clearTimers();
    this.currentNode = node;
    this.currentNodeId = id;
    this.read.add(id);
    const completeKey = COMPLETE_BY_ENTRY[id];
    if (completeKey) this.vars[completeKey] = 1;

    const chapter = node.chapter && !this.shownChapters.has(node.chapter) ? node.chapter : "";
    if (chapter) this.shownChapters.add(chapter);

    this.setData({
      mode: node.type || "dialogue",
      backgroundSrc: asset(`images/${node.background || "bg-heaven.svg"}`),
      photoScene: node.photoScene || "",
      selectedHome: null,
      selectedWish: null,
      choices: [],
      nextNode: "",
      spriteSrc: "",
      showDialogue: false,
      chapterShowing: !!chapter,
      chapterTitle: chapter || "",
      birthPhase: "opening"
    });

    if (chapter) return;
    this.renderNode(node);
    if (!options.noSave) this.saveGame();
  },

  dismissChapter() {
    this.setData({ chapterShowing: false });
    this.renderNode(this.currentNode);
    this.saveGame();
  },

  renderNode(node) {
    switch (node.type) {
      case "title":
        this.setData({ mode: "title", titleNode: node, showDialogue: false });
        return;
      case "home_map":
        this.renderHomeMap(node);
        return;
      case "wish_gate":
        this.renderWishGate(node);
        return;
      case "gacha":
        this.renderGacha(node);
        return;
      case "reward":
        this.addInventory(node.gain || {});
        this.renderDialogue(node);
        return;
      case "minigame":
        this.renderMinigame(node);
        return;
      case "choice":
        this.renderDialogue(node, true);
        return;
      case "final_card":
        this.setData({ mode: "final_card", finalCard: node, showDialogue: false });
        return;
      default:
        this.renderDialogue(node);
    }
  },

  renderDialogue(node, asChoice = false) {
    const speaker = characters[node.speaker]?.displayName || node.speaker || "旁白";
    const sprite = node.sprite?.character ? characters[node.sprite.character]?.sprite : "";
    this.addHistory(speaker, node.text || "");
    this.setData({
      mode: "dialogue",
      speakerName: speaker,
      displayText: node.text || "",
      choices: asChoice ? (node.choices || []) : [],
      nextNode: asChoice ? "" : (node.next || ""),
      spriteSrc: sprite ? asset(`sprites/${sprite}`) : "",
      spritePosition: node.sprite?.position || "left",
      showDialogue: node.photoScene === "birth_gate_transition" ? false : true
    });
    if (node.photoScene === "birth_gate_transition") this.setupBirthGate();
  },

  setupBirthGate() {
    this.setData({ birthPhase: "opening", showDialogue: false });
    this.setTimer(setTimeout(() => {
      this.setData({ birthPhase: "ready" });
    }, 1800));
  },

  continueDialogue() {
    if (this.data.chapterShowing || this.data.choices.length) return;
    if (this.currentNode?.photoScene === "birth_gate_transition") {
      this.advanceBirthGate();
      return;
    }
    if (this.data.nextNode) this.showNode(this.data.nextNode);
  },

  advanceBirthGate() {
    const phase = this.data.birthPhase;
    if (phase === "opening") return;
    if (phase === "ready") {
      this.playBabyCry();
      this.setData({ birthPhase: "cry" });
      return;
    }
    if (phase === "cry") {
      this.setData({ birthPhase: "photo" });
      return;
    }
    if (phase === "photo") {
      this.setData({ birthPhase: "done" });
      this.setTimer(setTimeout(() => this.showNode(this.currentNode.next), 700));
    }
  },

  chooseOption(event) {
    const choice = this.data.choices[Number(event.currentTarget.dataset.index)];
    if (!choice) return;
    Object.assign(this.vars, choice.set || {});
    this.addHistory("选择", choice.text);
    this.showNode(choice.next);
  },

  renderHomeMap(node) {
    const homes = (node.homes || []).map((home) => {
      const done = !!this.vars[home.doneVar];
      const lockedByStory = !this.requirementsMet(home.requires);
      const affordable = (this.data.inventory.stardust || 0) >= (home.cost || 0);
      const locked = !done && (lockedByStory || !affordable);
      let stateText = done ? "已经观察过" : `需要星尘 ${home.cost || 0}`;
      if (lockedByStory) stateText = "还没有出现";
      if (!lockedByStory && !affordable) stateText = `还差 ${Math.max(0, (home.cost || 0) - this.data.inventory.stardust)} 点星尘`;
      return { ...home, done, locked, stateText, actionText: done ? "再看一次" : locked ? "先收集星尘" : "靠近这颗星" };
    });
    this.setData({ mode: "home_map", homes, showDialogue: false, photoScene: "" });
  },

  selectHome(event) {
    const home = this.data.homes.find((item) => item.id === event.currentTarget.dataset.id);
    this.setData({ selectedHome: home || null });
  },

  enterSelectedHome() {
    const home = this.data.selectedHome;
    if (!home) return;
    if (home.locked && !home.done) {
      this.openPractice();
      return;
    }
    this.showNode(home.node);
  },

  renderWishGate(node) {
    this.setData({
      mode: "wish_gate",
      wishOptions: node.options || [],
      selectedWish: (node.options || [])[0] || null,
      showDialogue: false,
      photoScene: ""
    });
  },

  selectWish(event) {
    const selected = this.data.wishOptions.find((item) => item.id === event.currentTarget.dataset.id);
    this.setData({ selectedWish: selected || null });
  },

  confirmWish() {
    const option = this.data.selectedWish;
    if (!option) return;
    if (option.correct) {
      this.showNode(option.next);
      return;
    }
    wx.showModal({
      title: option.resultTitle || option.title,
      content: option.resultText || option.description,
      showCancel: false
    });
  },

  renderGacha(node) {
    const pool = gacha[node.pool] || {};
    const cards = pool.cards || [{ resource: "stardust", amount: 6, tier: "rare" }];
    const gifts = [0, 1, 2].map((_, index) => {
      const card = pick(cards);
      return { ...card, opened: false, label: `星尘 +${card.amount}`, tier: card.tier || (index === 1 ? "rare" : "normal") };
    });
    this.gachaNext = node.next;
    this.setData({ mode: "gacha", gifts, giftOpened: false, showDialogue: false });
  },

  openGift(event) {
    if (this.data.giftOpened) return;
    const index = Number(event.currentTarget.dataset.index);
    const gifts = this.data.gifts.map((gift, i) => ({ ...gift, opened: i === index }));
    const card = gifts[index];
    this.addInventory({ [card.resource || "stardust"]: card.amount || 1 });
    this.setData({ gifts, giftOpened: true });
  },

  finishGacha() {
    this.showNode(this.gachaNext || "home_map");
  },

  renderMinigame(node) {
    const config = minigames[node.game] || {};
    this.nextAfterMini = node.successNext || "home_map";
    if (config.type === "brain_teaser") return this.startBrainTeaser(config);
    if (config.type === "rule_stopwatch") return this.startStopwatch(config);
    if (config.type === "dino_memory") return this.startDinoMemory(config);
    if (config.type === "family_quiz") return this.startQuiz(config);
    if (config.type === "poop_dodge") return this.startAction(config, "poop");
    return this.startAction(config, "rich");
  },

  openPractice() {
    if (this.data.mode === "title") return;
    this.showNode("practice_star_game");
  },

  startBrainTeaser(config) {
    const question = pick(config.questions || []);
    this.brainAnswer = question.answer;
    this.setData({
      mode: "brain_teaser",
      showDialogue: false,
      mini: { question: question.question, options: question.options || [], message: "答对可以得到星尘。", done: false }
    });
  },

  answerBrain(event) {
    if (this.data.mini.done) return;
    const correct = event.currentTarget.dataset.id === this.brainAnswer;
    if (correct) this.addInventory({ stardust: 8 });
    this.setData({ mini: { ...this.data.mini, message: correct ? "答对了，星尘 +8。" : "这次没有收集到星尘。", done: true } });
  },

  startStopwatch(config) {
    this.stopwatchStart = Date.now();
    const mini = { running: true, time: 0, timeText: "0.00", message: "停在 10.00 到 10.20 秒之间。", done: false };
    this.setData({ mode: "stopwatch", showDialogue: false, mini });
    this.setTimer(setInterval(() => {
      if (!this.data.mini.running) return;
      const time = (Date.now() - this.stopwatchStart) / 1000;
      this.setData({ mini: { ...this.data.mini, time, timeText: time.toFixed(2) } });
    }, 40));
  },

  toggleStopwatch() {
    const mini = this.data.mini;
    if (mini.done) return;
    if (!mini.running) {
      this.stopwatchStart = Date.now() - (mini.time || 0) * 1000;
      this.setData({ mini: { ...mini, running: true } });
      return;
    }
    const ok = mini.time >= 10 && mini.time <= 10.2;
    this.setData({ mini: { ...mini, running: false, done: ok, message: ok ? "刚刚好，规矩也露出了笑脸。" : "没有停在规定时间，重新开始试试。" } });
    if (!ok) setTimeout(() => this.startStopwatch(minigames.rule_stopwatch), 900);
  },

  startDinoMemory() {
    const dinos = [
      { key: "triceratops", icon: "🦕" },
      { key: "trex", icon: "🦖" },
      { key: "raptor", icon: "🐲" },
      { key: "stego", icon: "🐉" },
      { key: "baby", icon: "🌋" }
    ];
    const cards = dinos.flatMap((dino) => [0, 1].map((n) => ({ id: `${dino.key}-${n}`, key: dino.key, icon: dino.icon, open: false, matched: false })))
      .sort(() => Math.random() - 0.5);
    this.openEggs = [];
    this.setData({ mode: "dino_memory", showDialogue: false, mini: { cards, message: "每次翻开两颗蛋，找到一样的小恐龙。", done: false } });
  },

  flipEgg(event) {
    const id = event.currentTarget.dataset.id;
    const mini = this.data.mini;
    if (mini.done || this.openEggs.length >= 2) return;
    const cards = mini.cards.map((card) => card.id === id && !card.matched ? { ...card, open: true } : card);
    const card = cards.find((item) => item.id === id);
    if (!card || card.matched) return;
    this.openEggs.push(card);
    this.setData({ mini: { ...mini, cards } });
    if (this.openEggs.length === 2) {
      setTimeout(() => {
        const [a, b] = this.openEggs;
        const matched = a.key === b.key;
        const nextCards = this.data.mini.cards.map((item) => {
          if (item.id === a.id || item.id === b.id) return matched ? { ...item, matched: true } : { ...item, open: false };
          return item;
        });
        const done = nextCards.every((item) => item.matched);
        this.openEggs = [];
        this.setData({ mini: { ...this.data.mini, cards: nextCards, message: matched ? "找到了同一组小恐龙。" : "它们不是同一窝，再记一次。", done } });
      }, 700);
    }
  },

  startQuiz(config) {
    this.quizQuestions = config.questions || [];
    this.quizIndex = 0;
    this.quizScore = 0;
    this.renderQuizQuestion();
  },

  renderQuizQuestion(message = "选择一个答案。") {
    const q = this.quizQuestions[this.quizIndex];
    if (!q) {
      this.setData({ mode: "quiz", mini: { question: "问题答完了。", options: [], message: "小天使把答案轻轻交给了心愿之门。", done: true } });
      return;
    }
    this.setData({ mode: "quiz", showDialogue: false, mini: { question: q.question, options: q.options || [], message, done: false } });
  },

  answerQuiz(event) {
    const q = this.quizQuestions[this.quizIndex];
    if (event.currentTarget.dataset.id === q.answer) this.quizScore += 1;
    this.quizIndex += 1;
    this.renderQuizQuestion(`第 ${this.quizIndex + 1} 题。`);
  },

  startAction(config, kind) {
    const duration = kind === "poop" ? 15 : 15;
    const maxHits = kind === "poop" ? 5 : 3;
    const title = kind === "poop" ? "躲开诚实的便便" : "把陪伴送过忙碌的房间";
    const mini = {
      kind, title, done: false, over: false, timeLeft: duration, hits: 0,
      player: { x: 50, y: 78 },
      items: [],
      message: `剩余 ${duration} 秒，碰到 0 / ${maxHits}`
    };
    this.actionStart = Date.now();
    this.actionMaxHits = maxHits;
    this.setData({ mode: "action", showDialogue: false, mini });
    this.setTimer(setInterval(() => this.tickAction(kind, duration), 120));
  },

  tickAction(kind, duration) {
    const mini = this.data.mini;
    if (mini.done || mini.over) return;
    const elapsed = (Date.now() - this.actionStart) / 1000;
    const timeLeft = Math.max(0, Math.ceil(duration - elapsed));
    let items = (mini.items || []).map((item) => ({ ...item, y: item.y + item.speed })).filter((item) => item.y < 102);
    const spawnChance = kind === "poop" ? 0.28 : 0.2;
    if (Math.random() < spawnChance) {
      items.push({
        id: `${Date.now()}-${Math.random()}`,
        x: 8 + Math.random() * 84,
        y: -6,
        speed: kind === "poop" ? 4.6 : 3.2,
        icon: kind === "poop" ? "💩" : pick(["📅", "💼", "⏰"]),
        kind
      });
    }
    let hits = mini.hits;
    items = items.filter((item) => {
      const hit = Math.abs(item.x - mini.player.x) < 10 && Math.abs(item.y - mini.player.y) < 10;
      if (hit) hits += 1;
      return !hit;
    });
    if (hits >= this.actionMaxHits) {
      this.setData({ mini: { ...mini, hits, items, over: true, done: true, message: "GAME OVER，重新试一次。" } });
      setTimeout(() => this.startAction({}, kind), 1000);
      return;
    }
    if (timeLeft <= 0) {
      this.setData({ mini: { ...mini, timeLeft, hits, items, done: true, message: "挑战成功。" } });
      return;
    }
    this.setData({ mini: { ...mini, timeLeft, hits, items, message: `剩余 ${timeLeft} 秒，碰到 ${hits} / ${this.actionMaxHits}` } });
  },

  holdMove(event) {
    this.moveDir = event.currentTarget.dataset.dir;
    if (this.moveTimer) clearInterval(this.moveTimer);
    this.moveTimer = setInterval(() => this.movePlayer(this.moveDir), 60);
    this.movePlayer(this.moveDir);
  },

  stopMove() {
    this.moveDir = "";
    if (this.moveTimer) clearInterval(this.moveTimer);
  },

  movePlayer(dir) {
    const mini = this.data.mini;
    if (!mini?.player) return;
    const step = 5;
    const player = { ...mini.player };
    if (dir === "left") player.x -= step;
    if (dir === "right") player.x += step;
    if (dir === "up") player.y -= step;
    if (dir === "down") player.y += step;
    player.x = clamp(player.x, 8, 92);
    player.y = clamp(player.y, 18, 88);
    this.setData({ mini: { ...mini, player } });
  },

  finishMini() {
    this.showNode(this.nextAfterMini || "home_map");
  },

  addInventory(gain) {
    const inventory = { ...this.data.inventory };
    Object.entries(gain).forEach(([key, value]) => {
      inventory[key] = (inventory[key] || 0) + value;
    });
    this.setData({ inventory });
  },

  requirementsMet(requirements = []) {
    return requirements.every((key) => !!this.vars[key]);
  },

  addHistory(speaker, text) {
    if (!text) return;
    this.setData({ history: [...this.data.history, { speaker, text }].slice(-80) });
  },

  startGame() {
    this.resetGame();
    this.startBgm();
    this.showNode(story.nodes[story.start].startNext || "world_001");
  },

  continueGame() {
    const save = wx.getStorageSync(SAVE_KEY);
    this.startBgm();
    this.showNode(save?.nodeId || story.nodes[story.start].startNext || "world_001");
  },

  goTitle() {
    this.showNode(story.start);
  },

  showSettings() {
    wx.showModal({ title: "设置", content: "原生小程序版会把主要内容放在小程序里，打开更快。", showCancel: false });
  },

  toggleHistory() {
    this.setData({ historyOpen: !this.data.historyOpen });
  },

  playBabyCry() {
    this.stopAudio();
    this.audio = wx.createInnerAudioContext();
    this.audio.src = "/assets/audio/baby-crying-01.mp3";
    this.audio.play();
  },

  stopAudio() {
    if (!this.audio) return;
    this.audio.stop();
    this.audio.destroy();
    this.audio = null;
  },

  startBgm() {
    if (this.bgm) return;
    this.bgm = wx.createInnerAudioContext();
    this.bgm.src = "/assets/audio/bgm-small.mp3";
    this.bgm.loop = true;
    this.bgm.volume = 0.42;
    this.bgm.play();
  },

  stopBgm() {
    if (!this.bgm) return;
    this.bgm.stop();
    this.bgm.destroy();
    this.bgm = null;
  },

  onShareAppMessage() {
    return { title: "小天使的选择", path: "/pages/game/game" };
  }
});
