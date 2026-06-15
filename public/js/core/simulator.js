/**
 * 世界模拟器（前端版本）
 * 管理所有Agent、世界状态和时间推进
 */
import Agent from "./agent.js";
import { normalizeTemplate } from "./personality.js";
import DEFAULT_GAME_CONFIG from "./game-config.js";
import {
  applyServiceResourceEffects,
  getAreaTags,
  getBestServiceForIntent,
  isWorkableArea,
  normalizeAreaSemantics,
  serviceHasTag,
} from "./building-semantics.js";

const GAME_CONFIG = DEFAULT_GAME_CONFIG;

const DEFAULT_AGENT_POSITIONS = {
  xiaoming: { x: 5, y: 5 },
  xiaohong: { x: 6, y: 5 },
  xiaomi: { x: 7, y: 5 },
  xiaodong: { x: 8, y: 5 },
};

const WORLD_EVENT_DIFFICULTY_PRESETS = {
  easy: {
    initialChance: 0.1,
    chanceStep: 0.14,
    minWaitDays: 1,
    globalScales: {
      pollutionDelta: 0.85,
      healthDelta: 0.9,
      foodStockDelta: 1.1,
      materialDelta: 1.1,
      techTheoryDelta: 1.1,
      techProductionDelta: 1.1,
      knowledgeReserveDelta: 1.15,
      greenPointsDelta: 1.15,
      forceWaitCount: 0.8,
    },
    categoryBias: {
      setback: 0.95,
      relief: 1.15,
    },
  },
  normal: {
    initialChance: 0.1,
    chanceStep: 0.18,
    minWaitDays: 1,
    globalScales: {
      pollutionDelta: 1,
      healthDelta: 1,
      foodStockDelta: 1,
      materialDelta: 1,
      techTheoryDelta: 1,
      techProductionDelta: 1,
      knowledgeReserveDelta: 1,
      greenPointsDelta: 1,
      forceWaitCount: 1,
    },
    categoryBias: {
      setback: 1,
      relief: 1,
    },
  },
  hard: {
    initialChance: 0.1,
    chanceStep: 0.22,
    minWaitDays: 1,
    globalScales: {
      pollutionDelta: 1.18,
      healthDelta: 1.15,
      foodStockDelta: 0.82,
      materialDelta: 0.88,
      techTheoryDelta: 0.88,
      techProductionDelta: 0.88,
      knowledgeReserveDelta: 0.88,
      greenPointsDelta: 0.82,
      forceWaitCount: 1.25,
    },
    categoryBias: {
      setback: 1.18,
      relief: 0.82,
    },
  },
};

const WORLD_EVENT_TEMPLATES = [
  {
    key: "falloutDust",
    category: "setback",
    weight: 1.2,
    minPollution: 45,
    title: "尘暴越境",
    description:
      "废土尘暴压向小镇，大家不得不先捂住口鼻保命，但净化进度也被拖慢了。",
    effects: {
      pollutionDelta: 9,
      healthDelta: -5,
      forceWaitCount: 2,
    },
  },
  {
    key: "supplyRaid",
    category: "setback",
    weight: 1.1,
    maxFoodStock: 60,
    title: "仓储哄抢",
    description:
      "仓储区爆发哄抢，大家都想先把物资抓在自己手里，集体库存和公共秩序一起受损。",
    effects: {
      foodStockDelta: -14,
      materialDelta: -8,
      greenPointsDelta: 3,
      forceWaitCount: 1,
    },
  },
  {
    key: "clinicOverflow",
    category: "setback",
    weight: 1,
    minDay: 3,
    title: "避难点透支",
    description:
      "临时避难点人满为患，大家更想先顾住自己，公共修复工作被迫让位给生存焦虑。",
    effects: {
      healthDelta: -7,
      greenPointsDelta: -4,
      forceWaitCount: 2,
    },
  },
  {
    key: "generatorFailure",
    category: "setback",
    weight: 1.05,
    minTechProduction: 15,
    title: "净化机停摆",
    description:
      "净化设备突然停摆，继续救急要消耗紧缺物资，不修则污染继续抬头。",
    effects: {
      pollutionDelta: 7,
      materialDelta: -10,
      techProductionDelta: -6,
    },
  },
  {
    key: "fieldBlight",
    category: "setback",
    weight: 1.15,
    minDay: 2,
    maxFoodStock: 90,
    title: "田地染病",
    description:
      "田地爆发病害，先保留下顿饭成了本能，留给长期建设的余力更少了。",
    effects: {
      foodStockDelta: -18,
      healthDelta: -3,
      materialDelta: -4,
    },
  },
  {
    key: "refugeesArrive",
    category: "setback",
    weight: 0.95,
    minDay: 4,
    title: "逃难者入镇",
    description:
      "新的逃难者抵达边缘地带，小镇要么分出资源接纳他们，要么承受更大的失序与污染。",
    effects: {
      pollutionDelta: 5,
      foodStockDelta: -10,
      knowledgeReserveDelta: -4,
      forceWaitCount: 1,
    },
  },
  {
    key: "mutualAidKitchen",
    category: "relief",
    weight: 1.05,
    maxFoodStock: 70,
    title: "互助灶台",
    description:
      "几户人家把私藏粮食拿出来共炊，大家勉强吃上一顿，也重新想起合作的意义。",
    effects: {
      foodStockDelta: 10,
      healthDelta: 4,
      greenPointsDelta: -2,
    },
  },
  {
    key: "oldWorldManual",
    category: "relief",
    weight: 0.9,
    maxKnowledgeReserve: 75,
    title: "旧时代手册",
    description:
      "废墟里翻出一批旧时代维护手册，短期不能当饭吃，却让救世的路线更清晰了一些。",
    effects: {
      knowledgeReserveDelta: 14,
      techTheoryDelta: 6,
    },
  },
  {
    key: "salvageWindow",
    category: "relief",
    weight: 0.95,
    minPollution: 35,
    title: "短暂回收窗",
    description:
      "风向短暂转好，回收队抢出一批还能用的零件，但也只是给大家多争来一点时间。",
    effects: {
      materialDelta: 14,
      techProductionDelta: 5,
      pollutionDelta: -4,
    },
  },
  {
    key: "wellspringEcho",
    category: "relief",
    weight: 0.85,
    minPollution: 55,
    title: "井水回响",
    description:
      "许愿池附近的净化回路意外共振，污染略有回落，愿意继续坚持的人也多了一口气。",
    effects: {
      pollutionDelta: -10,
      healthDelta: 3,
    },
  },
  {
    key: "nightSchool",
    category: "relief",
    weight: 0.8,
    minDay: 5,
    title: "夜校复开",
    description:
      "有人自发重开夜校，分享求生与修复经验。不能立刻救命，但能让集体行动更少走弯路。",
    effects: {
      knowledgeReserveDelta: 8,
      techTheoryDelta: 4,
      greenPointsDelta: -1,
    },
  },
  {
    key: "seedCache",
    category: "relief",
    weight: 0.85,
    maxFoodStock: 85,
    title: "种子暗仓",
    description:
      "一处被遗忘的种子暗仓被找到，短期给粮仓续命，也让田地还有未来可赌。",
    effects: {
      foodStockDelta: 16,
      materialDelta: 5,
    },
  },
];

const SUPPLY_BASE_NAME = "物资基地";
const SUPPLY_BASE_PRICE_OVERRIDES = Object.freeze({
  饮料: 20,
  面包: 50,
  营养品: 200,
  大餐: 150,
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

function normalizeSupplyBaseArea(area) {
  if (
    !area ||
    area.name !== SUPPLY_BASE_NAME ||
    !Array.isArray(area.services)
  ) {
    return area;
  }

  area.services = area.services.map((service) => {
    const overrideCost = SUPPLY_BASE_PRICE_OVERRIDES[service?.name];
    if (overrideCost == null || service?.cost === overrideCost) {
      return service;
    }

    return {
      ...service,
      cost: overrideCost,
    };
  });

  return area;
}

class WorldSimulator extends EventTarget {
  constructor(
    tileSize = 48,
    imageWidth = 1536,
    imageHeight = 1024,
    timeScale = DEFAULT_GAME_CONFIG.timeScale,
    llmClient,
    gameConfig = DEFAULT_GAME_CONFIG,
  ) {
    super();

    if (tileSize && typeof tileSize === "object" && !Array.isArray(tileSize)) {
      const options = tileSize;
      tileSize = options.tileSize ?? 48;
      imageWidth = options.imageWidth ?? 1536;
      imageHeight = options.imageHeight ?? 1024;
      timeScale = options.timeScale ?? DEFAULT_GAME_CONFIG.timeScale;
      llmClient = options.llmClient;
      gameConfig = options.gameConfig ?? DEFAULT_GAME_CONFIG;
    }

    this.gameConfig = gameConfig;

    this.agents = new Map();
    this.objects = new Map();
    this.events = [];

    this.tileSize = tileSize;
    this.imageWidth = imageWidth;
    this.imageHeight = imageHeight;
    this.gridCols = Math.floor(imageWidth / tileSize);
    this.gridRows = Math.floor(imageHeight / tileSize);
    this.timeScale = timeScale;

    this.gameTime = new Date();
    this.gameTime.setHours(this.gameConfig.time.initialHour, 0, 0, 0);
    this._lastGameTime = new Date(this.gameTime);

    this.tickIntervalMs = this.gameConfig.tickIntervalMs;

    this.llm = llmClient;

    this.townHealth = {
      current: this.gameConfig.survival.healthMax,
      max: this.gameConfig.survival.healthMax,
    };

    this.pollution = this.gameConfig.initialPollution;
    this._lastDay = null;
    this.dayCount = 1;
    this.isDreaming = false;
    this.isMeeting = false;
    this._meetingManualStopRequested = false;
    this.isGameOver = false;
    this.gameOverDetail = null;
    this.pendingCycleMessages = {};
    this.lastSleepReminderDateKey = null;

    // 世界资源池
    this.worldResources = { ...this.gameConfig.initialResources };

    this.tickCount = 0;
    this._ticking = false;
    this.tickInterval = null;
    this.lastRandomEventTick = 0;
    this.randomEventState = this.createRandomEventState();

    // Agent 占用表：追踪哪个格子被哪个 agent 占据
    this.occupancyMap = new Map(); // "x,y" -> agentId

    // 区域系统
    this.areas = [];
    this.passabilityGrid = null;
    this.initPassabilityGrid();

    this.initializeWorld();
  }

  applyGameConfig(gameConfig) {
    this.gameConfig = gameConfig || this.gameConfig;
    this.timeScale = this.gameConfig.timeScale;
    this.tickIntervalMs = this.gameConfig.tickIntervalMs;
    this.randomEventState = this.createRandomEventState(
      this.randomEventState || {},
    );
  }

  getDifficultyKey() {
    return (
      this.gameConfig?.difficulty?.current ||
      GAME_CONFIG?.difficulty?.current ||
      "normal"
    );
  }

  getRandomEventDifficultyConfig() {
    const difficultyKey = this.getDifficultyKey();
    return (
      WORLD_EVENT_DIFFICULTY_PRESETS[difficultyKey] ||
      WORLD_EVENT_DIFFICULTY_PRESETS.normal
    );
  }

  createRandomEventState(previousState = {}) {
    const difficultyConfig = this.getRandomEventDifficultyConfig();
    const gameEventConfig = this.gameConfig?.randomEvents || {};
    const maxChance = this._clampEventChance(
      gameEventConfig.maxDailyChance ?? previousState.maxChance ?? 1,
    );
    const initialChance = this._clampEventChance(
      gameEventConfig.baseDailyChance ??
        previousState.baseChance ??
        difficultyConfig.initialChance ??
        0.1,
      maxChance,
    );
    const baseChanceChanged =
      typeof previousState.baseChance === "number" &&
      Math.abs(previousState.baseChance - initialChance) > 0.0001;
    const currentChance = this._clampEventChance(
      baseChanceChanged ? initialChance : previousState.currentChance ?? initialChance,
      maxChance,
    );
    const lastResolvedDay =
      typeof previousState.lastResolvedDay === "number"
        ? previousState.lastResolvedDay
        : 0;
    const lastTriggeredDay =
      typeof previousState.lastTriggeredDay === "number"
        ? previousState.lastTriggeredDay
        : 0;
    const triggerCount =
      typeof previousState.triggerCount === "number"
        ? previousState.triggerCount
        : 0;
    const pendingDay =
      typeof previousState.pendingDay === "number"
        ? previousState.pendingDay
        : null;

    return {
      baseChance: initialChance,
      currentChance,
      maxChance,
      chanceStep: this._clampEventChance(
        gameEventConfig.dailyChanceStep ??
          difficultyConfig.chanceStep ??
          previousState.chanceStep ??
          0.18,
      ),
      lastResolvedDay,
      lastTriggeredDay,
      triggerCount,
      pendingDay,
    };
  }

  _clampEventChance(value, max = 1) {
    const number = Number(value);
    const safeValue = Number.isFinite(number) ? number : 0.1;
    const safeMax = Number.isFinite(Number(max)) ? Number(max) : 1;
    return Math.max(0, Math.min(Math.max(0, safeMax), safeValue));
  }

  getDailyPollutionIncrease(dayNumber = this.dayCount) {
    const pollutionConfig = this.gameConfig?.pollution || GAME_CONFIG.pollution;
    const baseIncrease = Number(pollutionConfig?.dailyIncrease ?? 1);
    let increase = Number.isFinite(baseIncrease) ? baseIncrease : 1;
    const milestones = Array.isArray(pollutionConfig?.dailyIncreaseMilestones)
      ? pollutionConfig.dailyIncreaseMilestones
      : [];

    for (const milestone of milestones) {
      if (!milestone || typeof milestone !== "object") continue;
      const milestoneDay = Number(milestone.day);
      const milestoneValue = Number(milestone.value);
      if (
        Number.isFinite(milestoneDay) &&
        Number.isFinite(milestoneValue) &&
        dayNumber >= milestoneDay
      ) {
        increase = milestoneValue;
      }
    }

    return Math.max(0, increase);
  }

  getLocalDateKey(date = this.gameTime) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  sanitizeConversationText(text, options = {}) {
    const raw = String(text || "").replace(/^["']|["']$/g, "").trim();
    if (!raw) return "";

    const allowedNames = new Set(["玩家", "大家"]);
    for (const agent of this.agents.values()) {
      allowedNames.add(agent.name);
    }
    for (const name of options.allowedNames || []) {
      if (name) allowedNames.add(String(name));
    }

    const replacement = options.replacement || "大家";
    const familyNames =
      "王李张刘陈杨黄吴周赵徐孙马朱胡郭何林高罗郑梁谢宋唐许韩冯邓曹彭曾肖田董潘袁于余叶蒋杜苏魏程吕丁沈任姚卢姜崔钟谭陆汪范金石廖贾夏韦付方白邹孟熊秦阎薛侯雷龙史陶黎贺顾毛郝龚邵万钱严武戴莫孔向汤";
    const nameRegex = new RegExp(
      `(^|[\\s“"'（(、【\\[])(老[\\u4e00-\\u9fa5]{1,2}|小[\\u4e00-\\u9fa5]{1,2}|[${familyNames}][\\u4e00-\\u9fa5]{1,2})([，,:：！？!?。.、\\s”"'）)】\\]]|$)`,
      "gu",
    );

    return raw
      .replace(nameRegex, (match, prefix, candidate, suffix) => {
        if (allowedNames.has(candidate)) {
          return `${prefix}${candidate}${suffix}`;
        }
        return `${prefix}${replacement}${suffix}`;
      })
      .replace(/\s+/g, " ")
      .trim();
  }

  maybeTriggerSleepReminder(previousTime) {
    const reminderHour =
      this.gameConfig?.time?.sleepReminderHour ??
      this.gameConfig?.time?.nightStart ??
      22;
    const currentDateKey = this.getLocalDateKey(this.gameTime);
    if (!currentDateKey || this.lastSleepReminderDateKey === currentDateKey) {
      return;
    }
    if (this.getLocalDateKey(previousTime) !== currentDateKey) {
      return;
    }

    const reminderMinutes = reminderHour * 60;
    const previousMinutes =
      previousTime.getHours() * 60 + previousTime.getMinutes();
    const currentMinutes =
      this.gameTime.getHours() * 60 + this.gameTime.getMinutes();
    if (
      previousMinutes >= reminderMinutes ||
      currentMinutes < reminderMinutes
    ) {
      return;
    }

    const nudgedAgents = [];
    for (const agent of this.agents.values()) {
      if (
        agent.status === "sleeping" ||
        agent.status === "unconscious" ||
        this.isAgentAtHome(agent) ||
        agent.currentAction?.type === "SLEEP"
      ) {
        continue;
      }

      if (agent.status === "working" && agent.workEndTime) {
        agent.workEndTime = new Date(this.gameTime);
        this._finalizeWork(agent);
      }

      if (agent.isMoving?.()) {
        agent.stopMoving?.();
      }

      agent.workTarget = null;
      agent.currentAction = null;
      agent.status = "idle";
      agent.lastFeedback = "22点了，先回宿舍睡觉，别再硬撑。";
      agent.nextDecisionAt = new Date(this.gameTime);
      agent._needsDecision = true;
      nudgedAgents.push(agent.name);
    }

    this.lastSleepReminderDateKey = currentDateKey;
    const description =
      nudgedAgents.length > 0
        ? `22点了，还在外面的居民该回宿舍休息了。${nudgedAgents.join("、")}开始准备回家。`
        : "22点了，小镇进入夜间休整时段。";
    this.triggerEvent("system", description, {
      forceAnnouncement: true,
      source: "schedule",
    });
  }

  _meetsWorldEventConditions(template, dayNumber) {
    if (!template) return false;
    if (template.minDay && dayNumber < template.minDay) return false;
    if (
      template.minPollution !== undefined &&
      this.pollution < template.minPollution
    ) {
      return false;
    }
    if (
      template.maxFoodStock !== undefined &&
      (this.worldResources.foodStock || 0) > template.maxFoodStock
    ) {
      return false;
    }
    if (
      template.maxKnowledgeReserve !== undefined &&
      (this.worldResources.knowledgeReserve || 0) > template.maxKnowledgeReserve
    ) {
      return false;
    }
    if (
      template.minTechProduction !== undefined &&
      (this.worldResources.techProduction || 0) < template.minTechProduction
    ) {
      return false;
    }
    return true;
  }

  _pickWorldEventTemplate(dayNumber) {
    const difficultyConfig = this.getRandomEventDifficultyConfig();
    const candidates = WORLD_EVENT_TEMPLATES.filter((template) =>
      this._meetsWorldEventConditions(template, dayNumber),
    );
    if (candidates.length === 0) return null;

    const weighted = candidates.map((template) => {
      const categoryMult =
        difficultyConfig.categoryBias?.[template.category] ?? 1;
      const weight = Math.max(0.01, (template.weight || 1) * categoryMult);
      return { template, weight };
    });

    const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
    let roll = Math.random() * totalWeight;
    for (const item of weighted) {
      roll -= item.weight;
      if (roll <= 0) return item.template;
    }
    return weighted[weighted.length - 1]?.template || null;
  }

  _scaleWorldEvent(template) {
    if (!template) return null;
    const difficultyConfig = this.getRandomEventDifficultyConfig();
    const scaledEffects = {};
    const sourceEffects = template.effects || {};

    for (const [key, value] of Object.entries(sourceEffects)) {
      if (typeof value !== "number") {
        scaledEffects[key] = value;
        continue;
      }
      const scale = difficultyConfig.globalScales?.[key] ?? 1;
      const scaledValue =
        key === "forceWaitCount"
          ? Math.max(0, Math.round(value * scale))
          : Math.round(value * scale * 10) / 10;
      scaledEffects[key] = scaledValue;
    }

    return {
      ...template,
      effects: scaledEffects,
    };
  }

  processDailyWorldEvent(dayNumber = this.dayCount) {
    if (!this.randomEventState) {
      this.randomEventState = this.createRandomEventState();
    }

    const state = this.randomEventState;
    if (state.lastResolvedDay >= dayNumber) {
      state.pendingDay = null;
      return false;
    }

    state.pendingDay = dayNumber;

    const chance = this._clampEventChance(state.currentChance, state.maxChance);
    const triggered = Math.random() <= chance;
    state.lastResolvedDay = dayNumber;
    state.pendingDay = null;
    this.lastRandomEventTick = this.tickCount;

    if (!triggered) {
      state.currentChance = this._clampEventChance(
        chance + state.chanceStep,
        state.maxChance,
      );
      return false;
    }

    const pickedTemplate = this._pickWorldEventTemplate(dayNumber);
    if (!pickedTemplate) {
      state.currentChance = this._clampEventChance(
        chance + state.chanceStep,
        state.maxChance,
      );
      return false;
    }

    const event = this._scaleWorldEvent(pickedTemplate);
    state.currentChance = state.baseChance;
    state.lastTriggeredDay = dayNumber;
    state.triggerCount += 1;
    this.applyRandomWorldEvent(event, chance);
    return true;
  }

  /**
   * 初始化世界对象（初始为空，由编辑器通过 setAreas 定义）
   */
  initializeWorld() {
    this.objects.clear();
  }

  /**
   * 初始化通行网格（全部可通行）
   */
  initPassabilityGrid() {
    this.passabilityGrid = Array.from({ length: this.gridRows }, () =>
      new Array(this.gridCols).fill(true),
    );
  }

  /**
   * 根据资源值计算建筑等级 (1-5)
   */
  getBuildingLevel(resourceValue) {
    const thresholds = GAME_CONFIG.buildingLevelThresholds;
    for (let i = thresholds.length - 1; i >= 0; i--) {
      if (resourceValue >= thresholds[i]) return i + 2;
    }
    return 1;
  }

  /**
   * 获取指定建筑类型对应的资源值
   */
  getResourceForBuilding(buildingType) {
    return GAME_CONFIG.buildingResourceMap[buildingType] || null;
  }

  /**
   * 获取建筑等级（按建筑类型）
   */
  getLevelForBuilding(buildingType) {
    const resource = this.getResourceForBuilding(buildingType);
    if (!resource) return 1;
    return this.getBuildingLevel(this.worldResources[resource]);
  }

  /**
   * 收入倍率（按建筑等级）
   */
  getIncomeMultiplier(buildingType) {
    const level = this.getLevelForBuilding(buildingType);
    return GAME_CONFIG.incomeMultipliers[level - 1];
  }

  /**
   * 污染系数（按建筑等级）
   */
  getPollutionMultiplier(buildingType) {
    const level = this.getLevelForBuilding(buildingType);
    return GAME_CONFIG.pollutionMultipliers[level - 1];
  }

  /**
   * 服务效果倍率（建筑等级 + 物资值）
   */
  getEffectMultiplier(buildingType) {
    const level = this.getLevelForBuilding(buildingType);
    const base = GAME_CONFIG.effectMultipliers[level - 1];
    return (
      base *
      (1 +
        this.worldResources.materialValue /
          GAME_CONFIG.resourceCap.materialValueScaling)
    );
  }

  /**
   * 成本倍率（建筑等级 + 物资值）
   */
  getCostMultiplier(buildingType) {
    const level = this.getLevelForBuilding(buildingType);
    const base = GAME_CONFIG.costMultipliers[level - 1];
    return (
      base /
      (1 +
        this.worldResources.materialValue /
          GAME_CONFIG.resourceCap.materialValueScaling)
    );
  }

  getAgentEnergyEfficiency(agent) {
    const rawEnergy = Number(agent?.personality?.energy);
    if (!Number.isFinite(rawEnergy)) return 1;
    return clamp(0.5 + rawEnergy, 0.5, 1.5);
  }

  /**
   * 从区域数组重建通行网格
   */
  rebuildPassabilityFromAreas() {
    this.initPassabilityGrid();
    for (const area of this.areas) {
      if (area.isBlocked && area.cells) {
        for (const c of area.cells) {
          if (
            c.x >= 0 &&
            c.x < this.gridCols &&
            c.y >= 0 &&
            c.y < this.gridRows
          ) {
            this.passabilityGrid[c.y][c.x] = false;
          }
        }
      }
    }
  }

  /**
   * 设置区域并重建通行网格
   */
  setAreas(areas) {
    this.areas = Array.isArray(areas) ? areas : [];
    for (const area of this.areas) {
      normalizeAreaSemantics(area);
      normalizeSupplyBaseArea(area);
    }
    this.rebuildPassabilityFromAreas();
  }

  /**
   * 更新格子大小并重建网格
   */
  updateGridSize(newTileSize) {
    this.tileSize = newTileSize;
    this.gridCols = Math.floor(this.imageWidth / newTileSize);
    this.gridRows = Math.floor(this.imageHeight / newTileSize);
    this.rebuildPassabilityFromAreas();
    for (const agent of this.agents.values()) {
      const pos = agent.getPosition();
      agent.setPosition({
        x: Math.max(0, Math.min(pos.x, this.gridCols - 1)),
        y: Math.max(0, Math.min(pos.y, this.gridRows - 1)),
      });
    }
  }

  /**
   * 获取所有区域
   */
  getAreas() {
    return this.areas;
  }

  /**
   * 检查位置是否可通行
   */
  isPassable(x, y) {
    if (x < 0 || x >= this.gridCols || y < 0 || y >= this.gridRows) {
      return false;
    }
    return this.passabilityGrid[y][x];
  }

  /**
   * 检查指定位置是否有其他 agent 占据
   */
  isAgentAt(x, y, excludeId = null) {
    const key = `${x},${y}`;
    const occupant = this.occupancyMap.get(key);
    return occupant !== undefined && occupant !== excludeId;
  }

  /**
   * 更新 agent 占用位置
   */
  setAgentOccupancy(agentId, oldPos, newPos) {
    if (oldPos) {
      this.occupancyMap.delete(`${oldPos.x},${oldPos.y}`);
    }
    if (newPos) {
      this.occupancyMap.set(`${newPos.x},${newPos.y}`, agentId);
    }
  }

  /**
   * 移除 agent 占用
   */
  removeAgentOccupancy(agentId) {
    for (const [key, id] of this.occupancyMap) {
      if (id === agentId) {
        this.occupancyMap.delete(key);
        break;
      }
    }
  }

  /**
   * 找到指定位置附近的空单元格
   */
  findNearbyEmptyCell(pos, maxRadius = GAME_CONFIG.movement.observationRange) {
    for (let r = 1; r <= maxRadius; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const x = pos.x + dx;
          const y = pos.y + dy;
          if (this.isPassable(x, y) && !this.isAgentAt(x, y)) {
            return { x, y };
          }
        }
      }
    }
    return null;
  }

  /**
   * 为指定区域挑选一个尽量不与其他 agent 重叠的格子
   */
  findAreaCell(areaName, origin = null, excludeId = null) {
    const area = this.areas.find(
      (candidate) =>
        candidate.name === areaName &&
        candidate.cells &&
        candidate.cells.length > 0,
    );
    if (!area) return null;

    const cells = [...area.cells]
      .filter((cell) => this.isPassable(cell.x, cell.y))
      .sort((a, b) => {
        if (!origin) return 0;
        const distA = Math.abs(a.x - origin.x) + Math.abs(a.y - origin.y);
        const distB = Math.abs(b.x - origin.x) + Math.abs(b.y - origin.y);
        return distA - distB;
      });

    const emptyCell = cells.find(
      (cell) => !this.isAgentAt(cell.x, cell.y, excludeId),
    );
    return emptyCell || cells[0] || null;
  }

  /**
   * 获取指定坐标的区域名称
   */
  getAreaNameAt(x, y) {
    return this.getAreaAt(x, y)?.name || null;
  }

  /**
   * 获取指定坐标所在区域
   */
  getAreaAt(x, y) {
    for (let i = this.areas.length - 1; i >= 0; i--) {
      const a = this.areas[i];
      if (a.cells && a.cells.some((c) => c.x === x && c.y === y)) {
        normalizeAreaSemantics(a);
        return a;
      }
    }
    return null;
  }

  /**
   * 获取指定坐标区域的服务列表
   */
  getAreaServicesAt(x, y) {
    return this.getAreaAt(x, y)?.services || [];
  }

  /**
   * 添加Agent
   */
  async addAgent(config, position = null) {
    config = normalizeTemplate(config);
    const agent = new Agent(config, this.llm);

    if (position) {
      // Clamp position to grid bounds
      const clamped = {
        x: Math.max(0, Math.min(position.x, this.gridCols - 1)),
        y: Math.max(0, Math.min(position.y, this.gridRows - 1)),
      };
      // 如果目标位置被占用，找附近空位
      if (this.isAgentAt(clamped.x, clamped.y)) {
        const nearby = this.findNearbyEmptyCell(clamped);
        if (nearby) ((clamped.x = nearby.x), (clamped.y = nearby.y));
      }
      agent.setPosition(clamped);
    } else {
      let validPosition = false;
      let attempts = 0;
      let newPos = { x: 0, y: 0 };

      while (
        !validPosition &&
        attempts < GAME_CONFIG.movement.maxSpawnAttempts
      ) {
        newPos = {
          x: Math.floor(Math.random() * this.gridCols),
          y: Math.floor(Math.random() * this.gridRows),
        };
        validPosition =
          this.isPassable(newPos.x, newPos.y) &&
          !this.isAgentAt(newPos.x, newPos.y);
        attempts++;
      }

      if (!validPosition) {
        // 默认中心位置
        newPos = {
          x: Math.floor(this.gridCols / 2),
          y: Math.floor(this.gridRows / 2),
        };
      }

      agent.setPosition(newPos);
    }

    // 非阻塞初始化 — LLM 不可用时不卡住加载流程
    agent.initialize().catch((err) => {
      console.error(`Agent ${agent.name} 初始化失败:`, err);
    });

    this.agents.set(agent.id, agent);
    // 注册占用
    const pos = agent.getPosition();
    this.setAgentOccupancy(agent.id, null, pos);

    this.dispatchEvent(
      new CustomEvent("agentJoined", {
        detail: this.getAgentState(agent),
      }),
    );

    return agent;
  }

  /**
   * 移除Agent
   */
  removeAgent(agentId) {
    const agent = this.agents.get(agentId);
    if (agent) {
      if (agent.moveInterval) {
        clearInterval(agent.moveInterval);
        agent.moveInterval = null;
      }
      this.removeAgentOccupancy(agentId);
      this.agents.delete(agentId);
      this.dispatchEvent(
        new CustomEvent("agentLeft", {
          detail: { agentId },
        }),
      );
    }
  }

  /**
   * 启动模拟
   */
  start(tickIntervalMs = GAME_CONFIG.tickIntervalMs) {
    if (this.isRunning || this.isGameOver) return;

    this.isRunning = true;
    this.tickIntervalMs = tickIntervalMs;
    this.tickInterval = setInterval(() => this.tick(), this.tickIntervalMs);

    this.dispatchEvent(new CustomEvent("started"));
  }

  /**
   * 停止模拟
   */
  stop(options = {}) {
    if (this.isMeeting && !options.internal) {
      this._meetingManualStopRequested = true;
    }
    this.isRunning = false;
    if (this._pendingTimeout) {
      clearTimeout(this._pendingTimeout);
      this._pendingTimeout = null;
    }
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    this.dispatchEvent(new CustomEvent("stopped"));
  }

  /**
   * 单步执行
   */
  async step() {
    if (this.isGameOver) return;
    const wasRunning = this.isRunning;
    this.isRunning = true;
    try {
      await this.tick();
    } finally {
      this.isRunning = wasRunning;
    }
  }

  /**
   * 检查是否所有agent都在睡觉（触发梦境阶段）
   */
  checkDreamPhase() {
    if (this.isDreaming) return false;
    if (this.agents.size === 0) return false;

    const hour = this.gameTime.getHours();
    const isNight =
      hour >= GAME_CONFIG.time.nightStart || hour < GAME_CONFIG.time.nightEnd;
    if (!isNight) return false;

    const agents = [...this.agents.values()];
    const allAtHomeReady = agents.every(
      (a) =>
        (a.status === "sleeping" || a.status === "idle") &&
        this.isAgentAtHome(a),
    );

    if (allAtHomeReady) return true;

    // 到次日6点前的最后一个tick，统一结算是否在宿舍。
    if (this.willReachWakeHourThisTick()) return true;

    // 凌晨后先强制进入回宿舍流程，最终到6点前再统一结算是否失眠。
    const wakeHour = GAME_CONFIG.time.wakeHour || 6;
    const forceSleepStart = GAME_CONFIG.time.forceSleepStart || 2;
    if (hour >= forceSleepStart && hour < wakeHour) {
      for (const a of agents) {
        if (a.status !== "sleeping" && a.status !== "idle") {
          const isReturningHome = a.currentAction?.type === "SLEEP";
          a.status = "sleeping";
          a.workEndTime = null;
          if (!isReturningHome) {
            a.stopMoving?.();
            a.workTarget = null;
            a.currentAction = null;
          }
          a._needsDecision = !isReturningHome;
        }
      }
    }

    return false;
  }

  getGameMinutesPerTick() {
    return (this.tickIntervalMs / 1000) * this.timeScale;
  }

  willReachWakeHourThisTick() {
    const wakeHour = GAME_CONFIG.time.wakeHour || 6;
    const currentMinutes =
      this.gameTime.getHours() * 60 + this.gameTime.getMinutes();
    if (currentMinutes >= wakeHour * 60) return false;
    const nextTime = new Date(
      this.gameTime.getTime() + this.getGameMinutesPerTick() * 60000,
    );
    const nextMinutes = nextTime.getHours() * 60 + nextTime.getMinutes();
    return nextMinutes >= wakeHour * 60;
  }

  collectDreamAttendance() {
    const attendance = new Map();
    for (const agent of this.agents.values()) {
      attendance.set(agent.id, {
        agentId: agent.id,
        agentName: agent.name,
        wasAtHome: this.isAgentAtHome(agent),
        position: { ...agent.position },
      });
    }
    return attendance;
  }

  freezeAgentMovementForNight() {
    for (const agent of this.agents.values()) {
      if (agent.moveInterval) {
        clearInterval(agent.moveInterval);
        agent.moveInterval = null;
      }
      agent.moveTarget = null;
      agent.currentPath = [];
    }
  }

  async buildDreamResults(attendance) {
    const results = await Promise.all(
      [...this.agents.values()].map(async (agent) => {
        const record = attendance.get(agent.id);
        if (!record?.wasAtHome) {
          return {
            agentId: agent.id,
            agentName: agent.name,
            type: "insomniaNightmare",
            success: true,
            narrative:
              "这一夜没有真正睡着。脚步声、污染警报和没能回到宿舍的懊恼在梦里反复纠缠，醒来时只剩疲惫。",
            insights: ["必须更早回宿舍", "夜间行动会带来失眠代价"],
          };
        }

        try {
          const dream = await this.withTimeout(
            agent.memory.dream(),
            GAME_CONFIG.llm?.dreamTimeoutMs ?? 12000,
            `${agent.name} dream`,
          );
          return {
            agentId: agent.id,
            agentName: agent.name,
            type: "normalDream",
            ...dream,
          };
        } catch (error) {
          console.warn(`[梦境] ${agent.name} 生成失败:`, error.message || error);
          return {
            agentId: agent.id,
            agentName: agent.name,
            type: "normalDream",
            success: false,
            narrative: "今晚没有留下清晰的梦。",
            insights: [],
          };
        }
      }),
    );
    return results;
  }

  async presentDreamResults(results) {
    if (!results?.length) return results;
    return new Promise((resolve) => {
      let done = false;
      const finish = (value) => {
        if (done) return;
        done = true;
        resolve(value || results);
      };
      const fallback = setTimeout(() => finish(results), 35000);
      this.dispatchEvent(
        new CustomEvent("dreamResults", {
          detail: {
            results,
            resolve: (value) => {
              clearTimeout(fallback);
              finish(value);
            },
          },
        }),
      );
    });
  }

  /**
   * 执行梦境阶段
   */
  async runDreamPhase() {
    const resumeAfterDream = this.isRunning;
    const attendance = this.collectDreamAttendance();
    this.freezeAgentMovementForNight();
    this.isDreaming = true;
    this.stop({ internal: true });

    this.dispatchEvent(
      new CustomEvent("dreamStart", {
        detail: { dayCount: this.dayCount, attendance },
      }),
    );

    console.log(`[夜晚] 第${this.dayCount}天夜晚，所有agent入睡，开始夜晚过渡`);

    // 等待4秒（配合UI暗下动画：3s淡入 + 1s保持 + 3s淡出 ≈ 7s，但4s时开始淡出）
    await new Promise((resolve) => setTimeout(resolve, 4000));

    const dreamResults = await this.buildDreamResults(attendance);
    const finalDreamResults = await this.presentDreamResults(dreamResults);
    for (const result of finalDreamResults || []) {
      const agent = this.agents.get(result.agentId);
      if (!agent || !result?.narrative) continue;
      await agent.memory.addMemory(
        `${result.type === "insomniaNightmare" ? "失眠噩梦" : "梦境"}：${result.narrative}`,
        "OBSERVATION",
        result.type === "insomniaNightmare" ? 8 : 5,
      );
    }

    // 跳到第二天早上6点
    const tomorrow = new Date(this.gameTime);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(GAME_CONFIG.time.wakeHour, 0, 0, 0);
    this.gameTime = tomorrow;
    this.dayCount++;
    this._lastGameTime = new Date(this.gameTime);
    this._lastDay = Math.floor(this.gameTime.getTime() / 86400000);

    // 每日污染增长
    this.pollution = Math.min(
      GAME_CONFIG.pollution.gameOverThreshold,
      this.pollution + this.getDailyPollutionIncrease(this.dayCount),
    );
    this.processDailyWorldEvent(this.dayCount);
    this.dispatchEvent(
      new CustomEvent("pollutionChange", {
        detail: { pollution: this.pollution },
      }),
    );

    // 重置所有agent状态
    for (const agent of this.agents.values()) {
      const sleptAtHome = attendance.get(agent.id)?.wasAtHome;
      agent.currentAction = null;
      agent.workTarget = null;
      agent.workEndTime = null;
      agent._workStartTime = null;
      if (sleptAtHome) {
        agent.status = "idle";
        agent.lastFeedback = null;
        agent.fullness = Math.min(100, agent.fullness + 30);
        agent.health.current = Math.min(
          agent.health.max,
          agent.health.current + 20,
        );
        agent.awakeHoursSinceSleep = 0;
        agent.consecutiveNoSleepDays = 0;
        agent._wakeMemory = true;
      } else {
        const penalty = await agent.applyInsomniaNightPenalty?.(this.dayCount);
        agent.status = agent.health.current <= 0 ? "unconscious" : "idle";
        agent._wakeMemory = false;
        if (!penalty) {
          agent.lastFeedback =
            "昨晚没能回到宿舍，几乎一夜没睡。今天必须把回宿舍睡觉当成重要事项。";
        }
      }
    }

    this.isDreaming = false;

    this.dispatchEvent(
      new CustomEvent("dreamEnd", {
        detail: {
          time: this.gameTime,
          dayCount: this.dayCount,
          dreamResults: finalDreamResults,
        },
      }),
    );

    // 立即通知UI更新时间显示
    this.dispatchEvent(
      new CustomEvent("timeUpdate", { detail: { time: this.gameTime } }),
    );

    await this.runMeetingPhase({ resumeAfter: resumeAfterDream });
  }

  /**
   * 晨会阶段：agent们讨论今天的计划
   * 在梦境结束后、模拟恢复前调用，每天仅一次
   */
  async runMeetingPhase(options = {}) {
    if (this.agents.size === 0) return;
    const resumeAfter =
      options.resumeAfter !== undefined ? options.resumeAfter : this.isRunning;
    this.isMeeting = true;
    this._meetingManualStopRequested = false;
    this.stop({ internal: true });

    // 构建小镇上下文
    const res = this.worldResources;
    const knowledgeWarning = GAME_CONFIG.decision.knowledgeWarning || 45;
    const techRampTarget = GAME_CONFIG.decision.techRampTarget || 30;
    const shouldFrontloadLibrary =
      (res.knowledgeReserve || 0) <
        (GAME_CONFIG.decision.knowledgeEarlyFocusThreshold ?? 90) &&
      ((res.techTheory || 0) < techRampTarget ||
        (res.techProduction || 0) < techRampTarget);
    const isFinishCleanup =
      this.pollution > GAME_CONFIG.pollution.goodEndingThreshold &&
      this.pollution <= GAME_CONFIG.pollution.finishCleanupThreshold;
    const pollutionStatus = this.pollution >= 80
      ? " 【危急】"
      : this.pollution >= 60
        ? " 【警告】"
        : isFinishCleanup
          ? " 【收尾】"
          : "";
    const townContext = `小镇状态（第${this.dayCount}天）:
- 污染指数: ${Math.round(this.pollution)}/100${pollutionStatus}
- 知识储备: ${Math.round(res.knowledgeReserve || 0)}
- 理论值: ${Math.round(res.techTheory || 0)}，生产值: ${Math.round(res.techProduction || 0)}
- 物资值: ${Math.round(res.materialValue || 0)}，粮食库存: ${Math.round(res.foodStock || 0)}
- 仓库只提供个人积分，不会增加集体资源
${isFinishCleanup ? "- 污染只剩一点，我们加加油，今天优先去许愿池完成最后净化\n" : ""}
${this.pollution >= 60 ? "- 小镇面临污染危机，需要有人去许愿池清理\n" : ""}
${(res.knowledgeReserve || 0) < knowledgeWarning ? "- 知识储备已经偏低，别再把图书馆当成补库存，更该尽快把剩余知识转成理论和生产\n" : ""}
${shouldFrontloadLibrary ? "- 前期要尽快有人去图书馆和实验室，把双科技底子垫起来\n" : ""}
${(res.foodStock || 0) < 20 ? "- 粮食库存紧张\n" : ""}`;

    // 1. 顺序收集初始发言，让后发言者知道前面的人说过什么。
    const messages = [];
    const chatHistory = messages;
    const meetingAgents = [...this.agents.values()];
    for (let index = 0; index < meetingAgents.length; index++) {
      const agent = meetingAgents[index];
      try {
        const msg = await agent.generateMeetingMessage(townContext, {
          chatHistory,
          speakerIndex: index,
          dayCount: this.dayCount,
        });
        messages.push({
          agentId: agent.id,
          agentName: agent.name,
          content: msg,
          type: "agent",
        });
      } catch (e) {
        console.warn(`[晨会] ${agent.name} 发言失败:`, e);
        messages.push({
          agentId: agent.id,
          agentName: agent.name,
          content: "我先听大家怎么安排，再补充自己的判断。",
          type: "agent",
        });
      }
    }

    // 2. 派发事件，UI控制聊天流程和结束
    const result = await new Promise((resolve) => {
      this.dispatchEvent(
        new CustomEvent("meetingStart", {
          detail: {
            messages,
            chatHistory,
            agents: [...this.agents.values()],
            townContext,
            resolve,
          },
        }),
      );
      const timeoutMs = GAME_CONFIG.ui.meetingTimeoutSeconds * 1000;
      setTimeout(() => resolve({ chatHistory, endedBy: "timeout" }), timeoutMs);
    });

    // 3. 晨会结束后直接散会，不再生成强制统一意见
    const finalHistory = [...(result.chatHistory || chatHistory)];
    const meetingSummary =
      result.endedBy === "player"
        ? "晨会被提前结束，大家带着各自判断开始今天的行动。"
        : result.endedBy === "agent"
          ? "晨会自然散会，大家各自按判断开工。"
          : "晨会到时结束，大家不再等待，转入各自行动。";
    finalHistory.push({
      agentName: "晨会记录",
      content: meetingSummary,
      type: "system",
    });
    this.dispatchEvent(
      new CustomEvent("event", {
        detail: {
          type: "world",
          description: meetingSummary,
          timestamp: new Date(),
        },
      }),
    );

    // 4. 写入记忆
    for (const agent of this.agents.values()) {
      const relevantMsgs = finalHistory
        .filter(
          (m) =>
            m.agentId === agent.id ||
            m.type === "player" ||
            m.type === "system",
        )
        .map((m) => m.content);
      if (relevantMsgs.length) {
        await agent.memory.addMemory(
          `晨会讨论：${relevantMsgs.join("；")}`,
          "OBSERVATION",
          6,
        );
      }
    }

    console.log(
      `[晨会] 结束，共${finalHistory.length}条消息，结束方式: ${result.endedBy}`,
    );

    this.isMeeting = false;
    this.dispatchEvent(
      new CustomEvent("meetingEnd", {
        detail: {
          endedBy: result.endedBy,
          manualStopRequested: this._meetingManualStopRequested,
        },
      }),
    );

    if (
      resumeAfter &&
      !this._meetingManualStopRequested &&
      !this.isGameOver
    ) {
      this.start();
    }
  }

  async buildMeetingConsensus(chatHistory, townContext) {
    try {
      const context = chatHistory
        .slice(-12)
        .map((m) => `${m.agentName || "玩家"}: ${m.content}`)
        .join("\n");
      const response = await this.llm.chat(
        [
          {
            role: "system",
            content:
              "你负责把晨会讨论压缩成一条可执行的统一意见。只输出一句中文，不要解释。",
          },
          {
            role: "user",
            content: `请根据这场晨会讨论，给出一条今天全体默认遵守的统一意见。\n\n小镇背景：\n${townContext}\n\n最近讨论：\n${context}\n\n要求：\n1. 必须是明确的行动共识。\n2. 如果污染高，优先写清谁都应先处理污染。\n3. 如果粮食紧张或知识不足，也要体现在共识里。\n4. 控制在一到两句话。\n\n只输出统一意见文本。`,
          },
        ],
        { timeout: 10000 },
      );
      const consensus = response.replace(/^["']|["']$/g, "").trim();
      if (consensus) return consensus;
    } catch (e) {
      console.warn("[晨会] 生成统一意见失败，回退规则总结：", e.message || e);
    }

    if (this.pollution >= GAME_CONFIG.pollution.warningHigh) {
      return "今天先统一处理污染，优先去许愿池清理，稳定后再分头补资源。";
    }
    if (
      this.pollution > GAME_CONFIG.pollution.goodEndingThreshold &&
      this.pollution <= GAME_CONFIG.pollution.finishCleanupThreshold
    ) {
      return "污染只剩一点，我们加加油，今天先集中去许愿池完成最后净化，不要在临门一脚时分散。";
    }
    if ((this.worldResources.foodStock || 0) < 20) {
      return "今天先统一补粮食库存，优先安排人去田地和物资相关建筑。";
    }
    if ((this.worldResources.knowledgeReserve || 0) < 20) {
      return "今天先统一把剩余知识尽快转成理论和生产，优先安排人去图书馆和实验室。";
    }
    return "今天先按各自分工推进，但遇到污染升高时所有人优先转去处理污染。";
  }

  /**
   * 执行tick
   */
  async tick() {
    if (this.isGameOver) return;
    if (!this.isRunning) return;
    if (this._ticking) return;
    this._ticking = true;

    try {
      // 检查梦境阶段
      if (this.checkDreamPhase()) {
        await this.runDreamPhase();
        return;
      }

      // 第一轮：同步处理（移动、到达判断，不含LLM调用）
      for (const agent of this.agents.values()) {
        agent._needsDecision = false;
        try {
          this.updateAgentSync(agent);
        } catch (e) {
          console.error(`更新Agent ${agent.name}失败:`, e);
        }
      }

      const decisionAgents = [...this.agents.values()].filter(
        (agent) => agent._needsDecision,
      );
      const worldState =
        decisionAgents.length > 0 ? this.getWorldState() : null;
      const decisionTimeoutMs = GAME_CONFIG.llm?.decisionTimeoutMs ?? 12000;
      const plannedActions = await Promise.all(
        decisionAgents.map(async (agent) => {
          try {
            const action = await this.withTimeout(
              this.planAgentDecision(agent, worldState),
              decisionTimeoutMs + 1000,
              `${agent.name} decision`,
            );
            return { agent, action };
          } catch (e) {
            console.error(`Agent ${agent.name}决策失败:`, e);
            if (GAME_CONFIG.llm?.enableLocalFallback === false) {
              const action = {
                type: agent.ActionType.WAIT,
                description: "LLM未接通，已停下等待下一次决策。",
                source: "llm-unavailable",
                timestamp: new Date(),
              };
              agent.lastFeedback = `思考受阻：${e?.message || e || "LLM未接通"}，本地兜底已关闭。`;
              return { agent, action };
            }
            const action = this.createFallbackDecisionAction(agent, worldState, e);
            agent.lastFeedback = `思考受阻，已改用本地规则：${action.description || "等待"}`;
            return { agent, action };
          }
        }),
      );

      for (const planned of plannedActions) {
        if (!planned?.action) continue;
        try {
          await this.executePlannedAction(planned.agent, planned.action);
        } catch (e) {
          console.error(`Agent ${planned.agent.name}执行行动失败:`, e);
        }
      }

      this.tickCount++;

      await this.runReflectionChecks();

      const gameMinutes = (this.tickIntervalMs / 1000) * this.timeScale;
      const elapsedHours = gameMinutes / 60;
      const previousTime = new Date(this.gameTime);

      // 记录本 tick 开始时的 agent 状态（用于生存/污染计算）
      const agentSnapshot = [];
      for (const agent of this.agents.values()) {
        const asleepAtHome =
          agent.status === "sleeping" && this.isAgentAtHome(agent);
        agentSnapshot.push({
          agent,
          isMoving: agent.isMoving && agent.isMoving(),
          isWorking:
            agent.status === "working" && agent.currentAction?.type === "WORK",
          isSleeping: asleepAtHome,
          position: { ...agent.position },
        });
      }

      this.gameTime = new Date(this.gameTime.getTime() + gameMinutes * 60000);

      // 处理工作结束（时间推进后检查）
      this._processWorkEnds();

      // 更新生存属性
      for (const { agent, isMoving, isWorking, isSleeping } of agentSnapshot) {
        agent.releaseConversationLock?.();
        agent.updateSurvivalAttributes(
          gameMinutes,
          isMoving,
          isWorking,
          isSleeping,
          this.pollution,
        );
      }

      // 跨天污染增长
      const currentRealDay = Math.floor(this._lastGameTime.getTime() / 86400000);
      const nextRealDay = Math.floor(this.gameTime.getTime() / 86400000);
      if (nextRealDay > currentRealDay) {
        const crossedDays = nextRealDay - currentRealDay;
        const startDayCount = this.dayCount;
        this.dayCount += crossedDays;
        for (let offset = 1; offset <= crossedDays; offset++) {
          const gameDayNumber = startDayCount + offset;
          this.pollution = Math.min(
            GAME_CONFIG.pollution.gameOverThreshold,
            this.pollution + this.getDailyPollutionIncrease(gameDayNumber),
          );
          this.processDailyWorldEvent(gameDayNumber);
        }
        this.dispatchEvent(
          new CustomEvent("pollutionChange", {
            detail: { pollution: this.pollution },
          }),
        );
      }
      this._lastGameTime = new Date(this.gameTime);
      this._lastDay = Math.floor(this.gameTime.getTime() / 86400000);
      this.maybeTriggerSleepReminder(previousTime);

      // 行为驱动污染
      let actionPollutionDelta = 0;
      const factoryUnlocked =
        this.worldResources.techTheory >=
          GAME_CONFIG.pollution.factoryUnlockThreshold &&
        this.worldResources.techProduction >=
          GAME_CONFIG.pollution.factoryUnlockThreshold;
      for (const { isWorking, position } of agentSnapshot) {
        if (isWorking) {
          const buildingType = this.getAreaNameAt(position.x, position.y);
          const area = this.getAreaAt(position.x, position.y);
          let pollEffect = 0;
          if (buildingType === "工厂" && factoryUnlocked) {
            pollEffect = GAME_CONFIG.pollution.factoryCleanupEffect;
          } else {
            const workService =
              area &&
              (getBestServiceForIntent(area, "cleanup") ||
                getBestServiceForIntent(area, "work"));
            if (workService?.pollutionEffect) {
              pollEffect = workService.pollutionEffect;
            }
          }
          if (pollEffect !== 0) {
            const pollMult = this.getPollutionMultiplier(buildingType);
            actionPollutionDelta += pollEffect * pollMult * elapsedHours;
          }
        }
      }
      if (actionPollutionDelta !== 0) {
        this.pollution = Math.max(
          0,
          Math.min(
            GAME_CONFIG.pollution.gameOverThreshold,
            this.pollution + actionPollutionDelta,
          ),
        );
      }

      // 时间更新事件
      this.dispatchEvent(
        new CustomEvent("timeUpdate", { detail: { time: this.gameTime } }),
      );

      if (this.pollution <= GAME_CONFIG.pollution.goodEndingThreshold) {
        this._triggerEnding({
          reason: "goodEnding",
          message: "污染被彻底清除，小镇迎来了新生。",
        });
        return;
      }

      // 污染满触发坏结局
      if (this.pollution >= GAME_CONFIG.pollution.gameOverThreshold) {
        this._triggerEnding({
          reason: "pollution",
          message: "污染值达到100，小镇毁灭...",
        });
        return;
      }

      if (this.dayCount >= GAME_CONFIG.time.maxDays) {
        this._triggerEnding({
          reason: "timeLimit",
          message: `第${GAME_CONFIG.time.maxDays}天结束时，污染仍未被清零，小镇走向了坏结局。`,
        });
        return;
      }

      const agentStates = [];
      for (const agent of this.agents.values()) {
        agentStates.push(this.getAgentState(agent));
      }

      this.dispatchEvent(
        new CustomEvent("tick", {
          detail: {
            time: this.gameTime,
            agents: agentStates,
            tickCount: this.tickCount,
            dayCount: this.dayCount,
            townHealth: this.townHealth,
            pollution: this.pollution,
            worldResources: this.worldResources,
          },
        }),
      );
    } finally {
      this._ticking = false;
    }
  }

  async runReflectionChecks() {
    const memoryConfig = GAME_CONFIG.memory;
    if (
      !memoryConfig?.reflectionCheckInterval ||
      this.tickCount % memoryConfig.reflectionCheckInterval !== 0
    ) {
      return;
    }

    const reflectionAgents = [...this.agents.values()].filter(
      (agent) =>
        agent?.memory &&
        agent.memory.memories.size >= memoryConfig.reflectionThreshold,
    );

    if (reflectionAgents.length === 0) return;

    await Promise.all(
      reflectionAgents.map(async (agent) => {
        try {
          const result = await agent.memory.consolidate();
          if ((result?.promoted ?? 0) > 0) {
            this.dispatchEvent(
              new CustomEvent("event", {
                detail: {
                  type: "system",
                  description: `${agent.name}进行了${result.promoted}次反思整理。`,
                  timestamp: new Date(),
                },
              }),
            );
          }
        } catch (error) {
          console.error(`Agent ${agent.name}反思整理失败:`, error);
        }
      }),
    );
  }

  /**
   * 处理单个 agent 的工作结束
   */
  _finalizeWork(agent) {
    if (agent.status !== "working" || !agent.workEndTime) return;

    const beforePoints = agent.greenPoints;
    const beforeResources = { ...this.worldResources };
    const workHours =
      (agent.workEndTime.getTime() -
        (agent._workStartTime?.getTime() ||
          agent.workEndTime.getTime() - 3600000)) /
      3600000;

    // 计算收入
    const buildingType = this.getAreaNameAt(agent.position.x, agent.position.y);
    const currentArea = this.getAreaAt(agent.position.x, agent.position.y);
    const workService =
      currentArea &&
      (getBestServiceForIntent(currentArea, "cleanup") ||
        getBestServiceForIntent(currentArea, "work"));
    const serviceHourlyRate = workService?.income ?? 0;
    const hourlyRate =
      agent.currentAction?.hourlyRate ??
      serviceHourlyRate ??
      GAME_CONFIG.decision.defaultHourlyRate;
    const incomeMult = this.getIncomeMultiplier(buildingType);
    const energyEfficiency = this.getAgentEnergyEfficiency(agent);
    agent.earnPoints(workHours * hourlyRate * incomeMult * energyEfficiency);

    // 资源积累
    this.accumulateResources(buildingType, workHours, agent, workService);

    // 记录反馈
    const changes = [];
    const pts = Math.round(agent.greenPoints - beforePoints);
    if (pts > 0) changes.push(`积分+${pts}`);
    for (const [key, label] of [
      ["techTheory", "理论值"],
      ["techProduction", "生产值"],
      ["materialValue", "物资值"],
      ["foodStock", "粮食"],
      ["knowledgeReserve", "知识"],
    ]) {
      const diff = Math.round(
        (this.worldResources[key] || 0) - (beforeResources[key] || 0),
      );
      if (diff > 0) changes.push(`${label}+${diff}`);
      else if (diff < 0) changes.push(`${label}${diff}`);
    }
    agent.lastFeedback = buildingType
      ? `在${buildingType}工作${Math.round(workHours * 10) / 10}小时: ${changes.join(", ") || "无变化"}`
      : `工作: ${changes.join(", ") || "无变化"}`;

    // 结束工作
    agent.workEndTime = null;
    agent._workStartTime = null;
    agent.status = "idle";
    agent.currentAction = null;
    agent.nextDecisionAt = new Date(this.gameTime);
    agent._needsDecision = true;
  }

  /**
   * 清理所有已过期的工作结束
   */
  _processWorkEnds() {
    for (const agent of this.agents.values()) {
      if (
        agent.status === "working" &&
        agent.workEndTime &&
        agent.workEndTime <= this.gameTime
      ) {
        this._finalizeWork(agent);
      }
    }
  }

  /**
   * 游戏结束重置：初始化所有数值并重新开始
   */
  _resetWorldState() {
    this.tickCount = 0;
    this.dayCount = 1;
    this.gameTime = new Date();
    this.gameTime.setHours(GAME_CONFIG.time.initialHour, 0, 0, 0);
    this._lastGameTime = new Date(this.gameTime);
    this.pollution = GAME_CONFIG.initialPollution;
    this._lastDay = null;
    this.worldResources = { ...GAME_CONFIG.initialResources };
    this.events = [];
    this.townHealth = {
      current: GAME_CONFIG.survival.healthMax,
      max: GAME_CONFIG.survival.healthMax,
    };
    this.occupancyMap.clear();
    this.isDreaming = false;
    this.isMeeting = false;
    this._meetingManualStopRequested = false;
    this.isGameOver = false;
    this.gameOverDetail = null;
    this.lastSleepReminderDateKey = null;
  }

  _triggerEnding({ reason, message }) {
    this.stop();
    this.isGameOver = true;
    this.gameOverDetail = {
      reason,
      message,
      dayCount: this.dayCount,
      pollution: this.pollution,
      survivors: this.agents.size,
    };
    this.dispatchEvent(
      new CustomEvent("gameOver", {
        detail: this.gameOverDetail,
      }),
    );
  }

  _collectAgentConfigs() {
    const agentConfigs = [];
    for (const agent of this.agents.values()) {
      agentConfigs.push({ ...agent.config });
    }
    return agentConfigs;
  }

  async generateCycleMessages() {
    const cycleMessages = {};
    const fallbackStrategies = [
      "先压污染，再补科技双高。",
      "别硬撑，先活下来再推进资源。",
      "晨会尽快统一分工，别空转。",
      "优先清污染，同时补理论和生产。",
      "快饿死就先赚钱吃饭，别拖。",
    ];

    for (const agent of this.agents.values()) {
      const recentMemories = agent.memory
        .getRecentMemories(12)
        .map((memory) => `- ${memory.content}`)
        .join("\n");
      const prompt = `你正在给下一个轮回中的自己留一句提醒。\n
你是${agent.name}。当前这一轮结束时，小镇状态如下：
- 第${this.dayCount}天
- 污染 ${Math.round(this.pollution)}/${GAME_CONFIG.pollution.gameOverThreshold}
- 科技理论 ${Math.round(this.worldResources.techTheory || 0)}
- 科技生产 ${Math.round(this.worldResources.techProduction || 0)}

最近经历：
${recentMemories || "- 暂无特别记忆"}

要求：
1. 只输出一句中文。
2. 50字以内。
3. 给下轮的自己一个明确方向，偏策略，不要空话。
4. 不要使用引号、编号、前缀。`;

      try {
        const raw = await this.llm.chat(
          [
            {
              role: "system",
              content: "你在生成轮回留言。输出必须简短、直接、可执行。",
            },
            { role: "user", content: prompt },
          ],
          { timeout: 12000 },
        );
        const compact = String(raw || "")
          .replace(/^["'\s]+|["'\s]+$/g, "")
          .replace(/\s+/g, "")
          .slice(0, 50);
        if (compact) {
          cycleMessages[agent.id] = compact;
          continue;
        }
      } catch (err) {
        console.warn(`[轮回留言] ${agent.name} 生成失败:`, err);
      }

      cycleMessages[agent.id] =
        fallbackStrategies[
          Math.floor(Math.random() * fallbackStrategies.length)
        ];
    }

    return cycleMessages;
  }

  async restartWithAgentConfigs(
    agentConfigs = [],
    mode = "cycle",
    cycleMessages = {},
  ) {
    this.stop();
    for (const agent of this.agents.values()) {
      if (agent.moveInterval) {
        clearInterval(agent.moveInterval);
        agent.moveInterval = null;
      }
    }
    this._resetWorldState();
    this.agents.clear();
    this.pendingCycleMessages = { ...cycleMessages };

    for (const cfg of agentConfigs) {
      const initialPos = DEFAULT_AGENT_POSITIONS[cfg.id] || null;
      const cycleMessage = this.pendingCycleMessages[cfg.id];
      if (cycleMessage) cfg.cycleGuidance = cycleMessage;
      const agent = await this.addAgent(cfg, initialPos);
      if (cycleMessage) agent.cycleGuidance = cycleMessage;
    }

    this.dispatchEvent(
      new CustomEvent("gameReset", {
        detail: {
          dayCount: this.dayCount,
          pollution: this.pollution,
          mode,
          cycleMessages: { ...this.pendingCycleMessages },
        },
      }),
    );

    this.pendingCycleMessages = {};
    this.start();
  }

  async handleGameOverReset() {
    console.log("[游戏结束] 小镇毁灭，正在重置...");
    const agentConfigs = this._collectAgentConfigs();
    const cycleMessages = await this.generateCycleMessages();
    await this.restartWithAgentConfigs(agentConfigs, "cycle", cycleMessages);
    console.log("[游戏结束] 重置完成，重新开始模拟");
  }

  /**
   * 根据建筑类型和工作时长积累资源
   */
  accumulateResources(buildingType, workHours, agent = null, service = null) {
    const cap = GAME_CONFIG.resourceCap;
    const acc = GAME_CONFIG.resourceAccumulation;
    const effectiveWorkHours =
      workHours * this.getAgentEnergyEfficiency(agent);

    if (!Number.isFinite(effectiveWorkHours) || effectiveWorkHours <= 0) {
      return;
    }

    const areaForResource = this.areas.find(
      (area) => area.name === buildingType,
    );
    const hasExplicitSemanticMetadata = Boolean(
      areaForResource?.metadata?.building &&
        !areaForResource.metadata.building.inferred,
    );
    if (
      hasExplicitSemanticMetadata &&
      (service?.resourceEffects || serviceHasTag(service, "knowledgeConversion"))
    ) {
      applyServiceResourceEffects(service, this, effectiveWorkHours, agent);
      return;
    }

    if (buildingType === "工厂") {
      this.worldResources.techProduction = Math.min(
        cap.techProduction,
        this.worldResources.techProduction +
          effectiveWorkHours * acc.techProductionPerTick,
      );
    }
    if (buildingType === "实验室") {
      this.worldResources.techTheory = Math.min(
        cap.techTheory,
        this.worldResources.techTheory +
          effectiveWorkHours * acc.techTheoryPerTick,
      );
    }
    if (buildingType === "物资基地" || buildingType === "田地") {
      const prodBonus =
        1 + this.worldResources.techProduction / cap.techProduction;
      this.worldResources.materialValue = Math.min(
        acc.materialValueMax,
        this.worldResources.materialValue +
          effectiveWorkHours * acc.materialValuePerInteraction * prodBonus,
      );
    }
    if (buildingType === "田地") {
      this.worldResources.foodStock = Math.min(
        acc.foodStockMax,
        (this.worldResources.foodStock || 0) +
          effectiveWorkHours * acc.foodStockPerTick,
      );
    }
    if (buildingType === "图书馆") {
      const knowledge = this.worldResources.knowledgeReserve || 0;
      if (knowledge > 0) {
        const consume = Math.min(knowledge, effectiveWorkHours * 2);
        this.worldResources.knowledgeReserve = Math.max(0, knowledge - consume);
        if (Math.random() < acc.knowledgeConversionChance) {
          const split = GAME_CONFIG.decision.knowledgeSplitRatio;
          this.worldResources.techTheory = Math.min(
            cap.techTheory,
            this.worldResources.techTheory + consume * split,
          );
          this.worldResources.techProduction = Math.min(
            cap.techProduction,
            this.worldResources.techProduction + consume * (1 - split),
          );
        }
      }
    }
  }

  /**
   * 更新单个Agent（同步部分：移动、到达判断，不含LLM调用）
   * 需要决策时设置 agent._needsDecision = true
   */
  updateAgentSync(agent) {
    const isMoving = agent.isMoving && agent.isMoving();
    const isWorking =
      agent.currentAction && agent.currentAction.type === "WORK";
    const isSleeping = agent.status === "sleeping";
    const isFinishCleanup =
      this.pollution > GAME_CONFIG.pollution.goodEndingThreshold &&
      this.pollution <= GAME_CONFIG.pollution.finishCleanupThreshold;
    const shouldInterruptForPollution =
      this.pollution >= GAME_CONFIG.pollution.warningHigh || isFinishCleanup;
    const pollutionDecisionFeedback = isFinishCleanup
      ? "污染只剩一点，我们加加油，停止当前任务，重新判断下一步行动。"
      : "污染升高，停止当前任务，重新判断下一步行动。";
    const currentArea = this.getAreaAt(agent.position.x, agent.position.y);
    const currentAreaName = currentArea?.name || null;
    const isCleanupWork =
      agent.currentAction?.type === "WORK" &&
      (currentAreaName === "许愿池" ||
        getAreaTags(currentArea).includes("pollutionCleanup") ||
        Boolean(getBestServiceForIntent(currentArea, "cleanup")));
    const isCleanupTargetName = (name) => {
      const area = this.areas.find((candidate) => candidate.name === name);
      if (!area) return name === "许愿池";
      return (
        name === "许愿池" ||
        getAreaTags(area).includes("pollutionCleanup") ||
        Boolean(getBestServiceForIntent(area, "cleanup"))
      );
    };

    const interruptForPollutionDecision = (feedback) => {
      if (isMoving) {
        agent.stopMoving?.();
      }
      if (isWorking) {
        this._finalizeWork(agent);
      }
      agent.workTarget = null;
      agent.currentAction = null;
      agent.cleanupOverrideUntil = null;
      agent.cleanupRetargetAt = null;
      agent.status = "idle";
      agent.nextDecisionAt = new Date(this.gameTime);
      agent._needsDecision = true;
      agent.lastFeedback = feedback;
    };

    // sleeping agent 处理
    if (isSleeping) {
      // 不在家 → 移动回家
      if (!this.isAgentAtHome(agent)) {
        const isReturningHome = agent.currentAction?.type === "SLEEP";
        if (!isReturningHome) {
          if (isMoving) {
            agent.stopMoving();
          }
          agent.workTarget = null;
          agent.currentAction = null;
          agent.nextDecisionAt = new Date(this.gameTime);
          agent._needsDecision = true;
        }
        return;
      }
      // 在家且夜晚sleeping → 等待梦境，不决策
      return;
    }

    // 工作中 → 保持状态（工作结束在tick()中处理）
    if (isWorking) {
      if (shouldInterruptForPollution && !isCleanupWork) {
        interruptForPollutionDecision(pollutionDecisionFeedback);
      }
      return;
    }

    // 移动中 → 继续移动
    if (isMoving && !agent.shouldMakeNewDecision()) {
      if (
        shouldInterruptForPollution &&
        !isCleanupTargetName(agent.workTarget?.building)
      ) {
        interruptForPollutionDecision(pollutionDecisionFeedback);
      }
      return;
    }

    // 有工作承诺且正在移动 → 直达目标
    if (agent.workTarget && isMoving) {
      if (
        shouldInterruptForPollution &&
        !isCleanupTargetName(agent.workTarget.building)
      ) {
        interruptForPollutionDecision(pollutionDecisionFeedback);
      }
      return;
    }

    // 到达工作目标 → 开始工作
    if (agent.workTarget && !isMoving) {
      const area = this.getAreaAt(agent.position.x, agent.position.y);
      const bt = area?.name || null;
      if (bt === agent.workTarget.building) {
        const requestedWorkHours = agent.workTarget.workHours || 2;
        const workHours =
          this.capWorkHoursBeforeNightStart(requestedWorkHours);
        const wasCapped = workHours < requestedWorkHours;
        agent.workTarget = null;
        agent.status = "working";
        const workService =
          area &&
          (getBestServiceForIntent(area, "cleanup") ||
            getBestServiceForIntent(area, "work"));
        const isCleanup =
          bt === "许愿池" ||
          getAreaTags(area).includes("pollutionCleanup") ||
          (workService?.pollutionEffect || 0) < 0;
        if (isCleanup) {
          agent.cleanupOverrideUntil = null;
          agent.cleanupRetargetAt = null;
        }
        agent.currentAction = {
          type: "WORK",
          description: wasCapped
            ? `在${bt}工作（到22点自动结束）`
            : `在${bt}工作`,
          hourlyRate: isCleanup
            ? 0
            : (workService?.income ?? GAME_CONFIG.decision.defaultHourlyRate),
          workHours,
          timestamp: new Date(),
        };
        const workEndGameTime = new Date(
          this.gameTime.getTime() + workHours * 3600000,
        );
        agent.workEndTime = workEndGameTime;
        agent._workStartTime = new Date(this.gameTime);
        return;
      }
      agent.workTarget = null;
    }

    // 空闲且没有移动目标：按游戏时间节奏思考，紧急状态则立即重算
    const decisionConfig = GAME_CONFIG.decision;
    const nextDecisionTime = agent.nextDecisionAt
      ? new Date(agent.nextDecisionAt).getTime()
      : 0;
    const urgentDecision =
      agent.health.current <= decisionConfig.healthWarning ||
      agent.fullness <= decisionConfig.fullnessWarning ||
      agent.greenPoints <= decisionConfig.greenPointsMin ||
      this.pollution >= GAME_CONFIG.pollution.warningHigh ||
      isFinishCleanup ||
      this.gameTime.getHours() >= GAME_CONFIG.time.nightStart ||
      this.gameTime.getHours() < GAME_CONFIG.time.nightEnd;
    agent._needsDecision =
      urgentDecision ||
      !nextDecisionTime ||
      nextDecisionTime <= this.gameTime.getTime();
  }

  /**
   * 检查agent是否在宿舍
   */
  isAgentAtHome(agent) {
    for (const area of this.areas) {
      normalizeAreaSemantics(area);
      const isSleepArea =
        area.name === "宿舍" ||
        getAreaTags(area).includes("sleepRest") ||
        Boolean(getBestServiceForIntent(area, "sleep"));
      if (isSleepArea && area.cells && area.cells.length > 0) {
        if (
          area.cells.some(
            (c) => c.x === agent.position.x && c.y === agent.position.y,
          )
        ) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * 规划Agent行动，允许多个Agent并发思考
   */
  async planAgentDecision(agent, worldState = null) {
    if (agent.status === "sleeping") {
      return { type: agent.ActionType.SLEEP, description: "回家睡觉" };
    }

    if (agent._wakeMemory) {
      agent._wakeMemory = false;
      await agent.memory.addMemory(
        "睡醒了，感觉精神饱满",
        agent.MemoryType.OBSERVATION,
        5,
      );
    }

    const observations = this.getObservationsForAgent(agent);
    await agent.perceive(observations);

    const effectiveWorldState = worldState || this.getWorldState();
    return agent.decide(effectiveWorldState);
  }

  /**
   * 执行已经规划好的行动，顺序落地到世界状态
   */
  async executePlannedAction(agent, action) {
    action = this.capWorkActionBeforeNightStart(agent, action);
    await agent.executeAction(action, this);

    agent.resetDecisionCounter();
    if (action?.isFallback && action?.type === agent.ActionType.MOVE) {
      const recheckSteps = Math.max(
        1,
        GAME_CONFIG.llm?.fallbackMoveRecheckSteps ?? 5,
      );
      agent.movesSinceLastDecision = Math.max(
        0,
        agent.decisionInterval - recheckSteps,
      );
      agent.nextDecisionAt = new Date(this.gameTime.getTime());
    }

    const idleCooldownMinutes =
      this.gameConfig?.decision?.idleDecisionCooldownMinutes ??
      GAME_CONFIG.decision.idleDecisionCooldownMinutes ??
      25;
    if (agent.status === "idle") {
      if (action?.type === agent.ActionType.MOVE || action?.type === agent.ActionType.WORK) {
        agent.nextDecisionAt = new Date(this.gameTime.getTime());
      } else if (action?.type) {
        const cooldownMinutes = action.type === agent.ActionType.BUY ? 5 : idleCooldownMinutes;
        agent.nextDecisionAt = new Date(
          this.gameTime.getTime() + cooldownMinutes * 60000,
        );
      }
    }
    if (action?.isFallback && agent.status === "idle") {
      const fallbackMinutes = Math.max(
        1,
        GAME_CONFIG.llm?.fallbackActionGameMinutes ?? 5,
      );
      agent.nextDecisionAt = new Date(
        this.gameTime.getTime() + fallbackMinutes * 60000,
      );
    }

    const startedConversation = await this.checkAgentInteractions(agent, {
      force: action?.type === agent.ActionType.TALK,
    });

    if (action?.type === agent.ActionType.TALK && !startedConversation) {
      agent.status = "idle";
      agent.currentAction = null;
      agent.lastFeedback = "想和对方聊天，但对方已经走开了。";
    }
  }

  getHoursUntilNightStart(referenceTime = this.gameTime) {
    const nightStart = GAME_CONFIG.time?.nightStart ?? 22;
    const currentMs =
      referenceTime.getHours() * 3600000 +
      referenceTime.getMinutes() * 60000 +
      referenceTime.getSeconds() * 1000 +
      referenceTime.getMilliseconds();
    const nightStartMs = nightStart * 3600000;
    if (currentMs >= nightStartMs) return null;
    return Math.max(0, (nightStartMs - currentMs) / 3600000);
  }

  capWorkHoursBeforeNightStart(workHours, referenceTime = this.gameTime) {
    const requested = Number(workHours);
    const safeRequested = Number.isFinite(requested) && requested > 0
      ? requested
      : 1;
    const hoursUntilNight = this.getHoursUntilNightStart(referenceTime);
    if (hoursUntilNight === null) return safeRequested;

    return Math.max(0, Math.min(safeRequested, hoursUntilNight));
  }

  capWorkActionBeforeNightStart(agent, action) {
    if (!action || typeof action !== "object") return action;

    if (action.type === agent.ActionType.WORK || action.type === "WORK") {
      const requestedWorkHours = Number(action.workHours) || 1;
      const cappedWorkHours =
        this.capWorkHoursBeforeNightStart(action.workHours);
      action = {
        ...action,
        workHours: cappedWorkHours,
      };
      if (cappedWorkHours < requestedWorkHours) {
        action.description = `${action.description || "工作"}（工作不会安排超过22点）`;
      }
    }

    if (agent.workTarget?.workHours) {
      agent.workTarget.workHours = this.capWorkHoursBeforeNightStart(
        agent.workTarget.workHours,
      );
    }

    return action;
  }

  withTimeout(promise, timeoutMs, label = "operation") {
    const safeTimeout = Math.max(1000, Number(timeoutMs) || 10000);
    let timer = null;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`${label} timed out after ${safeTimeout}ms`));
      }, safeTimeout);
    });

    return Promise.race([promise, timeoutPromise]).finally(() => {
      if (timer) clearTimeout(timer);
    });
  }

  getAreaCenter(area) {
    if (!area?.cells?.length) return null;
    const total = area.cells.reduce(
      (sum, cell) => ({ x: sum.x + cell.x, y: sum.y + cell.y }),
      { x: 0, y: 0 },
    );
    return {
      x: Math.round(total.x / area.cells.length),
      y: Math.round(total.y / area.cells.length),
    };
  }

  findNearestAreaByNames(names, origin, excludeId = null) {
    const nameSet = new Set(names);
    let best = null;
    let bestDistance = Infinity;

    for (const area of this.areas) {
      if (!nameSet.has(area.name) || !area.cells?.length) continue;
      const cell = this.findAreaCell(area.name, origin, excludeId);
      if (!cell) continue;
      const distance =
        Math.abs(cell.x - origin.x) + Math.abs(cell.y - origin.y);
      if (distance < bestDistance) {
        best = { area, cell };
        bestDistance = distance;
      }
    }

    return best;
  }

  findNearestAreaByIntent(intent, origin, excludeId = null) {
    let best = null;
    let bestDistance = Infinity;

    for (const area of this.areas) {
      normalizeAreaSemantics(area);
      if (area.isBlocked || !area.cells?.length) continue;
      if (intent === "work" ? !isWorkableArea(area) : !getBestServiceForIntent(area, intent)) {
        continue;
      }
      const cell = this.findAreaCell(area.name, origin, excludeId);
      if (!cell) continue;
      const distance =
        Math.abs(cell.x - origin.x) + Math.abs(cell.y - origin.y);
      if (distance < bestDistance) {
        best = { area, cell };
        bestDistance = distance;
      }
    }

    return best;
  }

  findNearestAreaByService(predicate, origin, excludeId = null) {
    let best = null;
    let bestDistance = Infinity;

    for (const area of this.areas) {
      normalizeAreaSemantics(area);
      if (area.isBlocked || !area.cells?.length || !area.services?.length) {
        continue;
      }
      if (!area.services.some(predicate)) continue;
      const cell = this.findAreaCell(area.name, origin, excludeId);
      if (!cell) continue;
      const distance =
        Math.abs(cell.x - origin.x) + Math.abs(cell.y - origin.y);
      if (distance < bestDistance) {
        best = { area, cell };
        bestDistance = distance;
      }
    }

    return best;
  }

  getFallbackWorkHours() {
    const minutes = Math.max(
      1,
      GAME_CONFIG.llm?.fallbackActionGameMinutes ?? 5,
    );
    return minutes / 60;
  }

  buildFallbackMoveOrWork(agent, target, workDescription, workHours = null) {
    const fallbackWorkHours = this.getFallbackWorkHours();
    const safeWorkHours = Math.min(
      Math.max(0.01, Number(workHours) || fallbackWorkHours),
      fallbackWorkHours,
    );
    const currentArea = this.getAreaNameAt(agent.position.x, agent.position.y);
    if (target?.area && currentArea === target.area.name) {
      const workService =
        getBestServiceForIntent(target.area, "cleanup") ||
        getBestServiceForIntent(target.area, "work");
      const isCleanup =
        getAreaTags(target.area).includes("pollutionCleanup") ||
        (workService?.pollutionEffect || 0) < 0 ||
        target.area.name === "许愿池";
      return {
        type: agent.ActionType.WORK,
        description: workDescription,
        workHours: safeWorkHours,
        hourlyRate: isCleanup
          ? 0
          : (workService?.income ?? GAME_CONFIG.decision.defaultHourlyRate),
        isFallback: true,
        timestamp: new Date(),
      };
    }

    if (target?.cell) {
      return {
        type: agent.ActionType.MOVE,
        description: `前往${target.area.name}：${workDescription}`,
        targetPosition: target.cell,
        isFallback: true,
        timestamp: new Date(),
      };
    }

    return {
      type: agent.ActionType.WAIT,
      description: "暂时找不到可执行地点，原地观察。",
      isFallback: true,
      timestamp: new Date(),
    };
  }

  createFallbackDecisionAction(agent, worldState = null, error = null) {
    const origin = agent.position || { x: 0, y: 0 };
    const decision = GAME_CONFIG.decision;
    const time = GAME_CONFIG.time;
    const hour = this.gameTime.getHours();
    const pollution = this.pollution;
    const resources = this.worldResources || {};
    const isNight = hour >= time.nightStart || hour < time.nightEnd;
    const canBuyFood =
      agent.greenPoints >= (GAME_CONFIG.survival.cheapestFoodPrice || 0);
    const errorText = error?.message ? `（${error.message}）` : "";

    if (
      isNight ||
      agent.health.current <= decision.healthCritical ||
      agent.consecutiveNoSleepDays >= decision.noSleepWarningDays
    ) {
      return {
        type: agent.ActionType.SLEEP,
        description: `LLM不可用${errorText}，按规则回宿舍睡觉。`,
        isFallback: true,
        timestamp: new Date(),
      };
    }

    if (
      pollution >= GAME_CONFIG.pollution.warningHigh ||
      (pollution > GAME_CONFIG.pollution.goodEndingThreshold &&
        pollution <= GAME_CONFIG.pollution.finishCleanupThreshold)
    ) {
      const cleanupTarget =
        this.findNearestAreaByIntent("cleanup", origin, agent.id) ||
        this.findNearestAreaByNames(["许愿池"], origin, agent.id);
      return this.buildFallbackMoveOrWork(
        agent,
        cleanupTarget,
        pollution >= GAME_CONFIG.pollution.warningHigh
          ? `LLM不可用${errorText}，污染过高，优先去污染净化建筑处理。`
          : `LLM不可用${errorText}，污染只剩一点，我们加加油，先去污染净化建筑完成最后净化。`,
        1,
      );
    }

    if (agent.fullness <= decision.fullnessCritical) {
      if (canBuyFood) {
        const foodTarget = this.findNearestAreaByService(
          (service) =>
            (service.fullness || 0) > 0 || (service.health || 0) > 0,
          origin,
          agent.id,
        );
        if (foodTarget?.cell) {
          return {
            type: agent.ActionType.MOVE,
            description: `LLM不可用${errorText}，饥饿优先，前往${foodTarget.area.name}买食物。`,
            targetPosition: foodTarget.cell,
            isFallback: true,
            timestamp: new Date(),
          };
        }
        return {
          type: agent.ActionType.BUY,
          description: `LLM不可用${errorText}，饥饿优先，尝试购买食物。`,
          isFallback: true,
          timestamp: new Date(),
        };
      }

      const workTarget =
        this.findNearestAreaByIntent("money", origin, agent.id) ||
        this.findNearestAreaByNames(["仓库"], origin, agent.id) ||
        this.findNearestAreaByService(
          (service) => (service.income || 0) > 0,
          origin,
          agent.id,
        );
      return this.buildFallbackMoveOrWork(
        agent,
        workTarget,
        `LLM不可用${errorText}，饥饿但积分不足，先赚取个人积分。`,
        1,
      );
    }

    if (
      (resources.knowledgeReserve || 0) <
      (decision.knowledgeEarlyFocusThreshold ?? 90)
    ) {
      const libraryTarget =
        this.findNearestAreaByIntent("knowledge", origin, agent.id) ||
        this.findNearestAreaByNames(["图书馆"], origin, agent.id);
      return this.buildFallbackMoveOrWork(
        agent,
        libraryTarget,
        `LLM不可用${errorText}，前期优先去知识/转化建筑把现有知识转成科技进展。`,
        1,
      );
    }

    if ((resources.techTheory || 0) < (decision.techRampTarget || 30)) {
      const labTarget =
        this.findNearestAreaByIntent("theory", origin, agent.id) ||
        this.findNearestAreaByNames(["实验室"], origin, agent.id);
      return this.buildFallbackMoveOrWork(
        agent,
        labTarget,
        `LLM不可用${errorText}，补科技理论。`,
        1,
      );
    }

    if ((resources.techProduction || 0) < (decision.techRampTarget || 30)) {
      const factoryTarget =
        this.findNearestAreaByIntent("production", origin, agent.id) ||
        this.findNearestAreaByNames(["工厂"], origin, agent.id);
      return this.buildFallbackMoveOrWork(
        agent,
        factoryTarget,
        `LLM不可用${errorText}，补科技生产。`,
        1,
      );
    }

    if (agent.greenPoints <= decision.greenPointsMin) {
      const warehouseTarget =
        this.findNearestAreaByIntent("money", origin, agent.id) ||
        this.findNearestAreaByNames(["仓库"], origin, agent.id) ||
        this.findNearestAreaByService(
          (service) => (service.income || 0) > 0,
          origin,
          agent.id,
        );
      return this.buildFallbackMoveOrWork(
        agent,
        warehouseTarget,
        `LLM不可用${errorText}，积分过低，先做个人生存工作。`,
        1,
      );
    }

    const fieldTarget =
      this.findNearestAreaByIntent("foodProduction", origin, agent.id) ||
      this.findNearestAreaByNames(["田地"], origin, agent.id);
    if (fieldTarget) {
      return this.buildFallbackMoveOrWork(
        agent,
        fieldTarget,
        `LLM不可用${errorText}，维持粮食和物资生产。`,
        1,
      );
    }

    return {
      type: agent.ActionType.WAIT,
      description: `LLM不可用${errorText}，暂无明确目标，短暂观察。`,
      isFallback: true,
      timestamp: new Date(),
    };
  }

  /**
   * 获取Agent的观察
   */
  getObservationsForAgent(agent) {
    const observations = [];
    const pos = agent.getPosition();

    for (const other of this.agents.values()) {
      if (other.id === agent.id) continue;

      const otherPos = other.getPosition();
      const distance = Math.sqrt(
        Math.pow(pos.x - otherPos.x, 2) + Math.pow(pos.y - otherPos.y, 2),
      );

        if (distance <= GAME_CONFIG.movement.observationRange) {
          observations.push({
            type: "agent",
            description: `看到${other.name}在附近`,
            position: otherPos,
            targetId: other.id,
            distance,
            importance: 3,
            lowSignal: true,
            signalCategory: "nearby-agent",
          });
          agent.nearbyAgents.add(other.id);
        } else {
          agent.nearbyAgents.delete(other.id);
        }
    }

    // 观察附近的区域
    const areaName = this.getAreaNameAt(pos.x, pos.y);
      if (areaName) {
        observations.push({
          type: "area",
          description: `在${areaName}区域`,
          position: pos,
          importance: 2,
          lowSignal: true,
          signalCategory: "area-presence",
        });
      }

    const hour = this.gameTime.getHours();
    if (
      hour >= GAME_CONFIG.time.nightStart ||
      hour < GAME_CONFIG.time.nightEnd
      ) {
        observations.push({
          type: "time",
          description: "现在是夜晚",
          position: pos,
          importance: 2,
          lowSignal: true,
          signalCategory: "time-presence",
        });
      }

    return observations;
  }

  /**
   * 检查Agent交互
   */
  getAgentDistance(agent1, agent2) {
    if (!agent1 || !agent2) return Infinity;
    return Math.sqrt(
      Math.pow(agent1.position.x - agent2.position.x, 2) +
        Math.pow(agent1.position.y - agent2.position.y, 2),
    );
  }

  canAgentsConverse(agent1, agent2) {
    if (!agent1 || !agent2 || agent1.id === agent2.id) return false;
    if (agent1.status === "sleeping" || agent2.status === "sleeping") {
      return false;
    }
    if (agent1.isConversationLocked?.() || agent2.isConversationLocked?.()) {
      return false;
    }
    if (agent1.isMoving?.() || agent2.isMoving?.()) {
      return false;
    }
    return (
      this.getAgentDistance(agent1, agent2) <=
      GAME_CONFIG.movement.observationRange
    );
  }

  getAgentSocialTendency(agent) {
    const value = Number(agent?.personality?.social);
    const fallback = GAME_CONFIG.personality?.defaultTraits?.social ?? 0.5;
    const normalized = Number.isFinite(value) ? value : fallback;
    return Math.max(0, Math.min(1, normalized));
  }

  getConversationAffinity(agent1, agent2) {
    const social1 = this.getAgentSocialTendency(agent1);
    const social2 = this.getAgentSocialTendency(agent2);
    return Math.sqrt(social1 * social2);
  }

  getConversationSuccessChance(agent1, agent2) {
    const baseChance = Math.max(
      0,
      Math.min(1, Number(GAME_CONFIG.social?.conversationChance) || 0),
    );
    const affinity = this.getConversationAffinity(agent1, agent2);
    return baseChance + (1 - baseChance) * affinity;
  }

  pickConversationCandidate(agent, candidates) {
    if (!agent || !Array.isArray(candidates) || candidates.length === 0) {
      return null;
    }

    const weighted = candidates
      .map((other) => ({
        other,
        weight: this.getConversationAffinity(agent, other),
      }))
      .filter((item) => item.weight > 0);

    if (weighted.length === 0) {
      return candidates[Math.floor(Math.random() * candidates.length)] || null;
    }

    const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
    let roll = Math.random() * totalWeight;
    for (const item of weighted) {
      roll -= item.weight;
      if (roll <= 0) {
        return item.other;
      }
    }

    return weighted[weighted.length - 1]?.other || null;
  }

  getConversationCandidates(agent) {
    if (!agent) return [];
    return [...this.agents.values()].filter((other) =>
      this.canAgentsConverse(agent, other),
    );
  }

  async checkAgentInteractions(agent, { force = false } = {}) {
    if (!force) return false;

    const candidates = this.getConversationCandidates(agent);
    if (candidates.length === 0) return false;

    const other = this.pickConversationCandidate(agent, candidates);
    if (!other) return false;
    if (Math.random() > this.getConversationSuccessChance(agent, other)) {
      return false;
    }

    return this.startConversation(agent.id, other.id);
  }

  /**
   * 开始对话
   */
  async startConversation(agentId1, agentId2) {
    const agent1 = this.agents.get(agentId1);
    const agent2 = this.agents.get(agentId2);

    if (!agent1 || !agent2) return;
    if (!this.canAgentsConverse(agent1, agent2)) return false;

    const now = Date.now();
    const lastTalk1 = agent1.lastConversation.get(agentId2) || 0;
    const lastTalk2 = agent2.lastConversation.get(agentId1) || 0;
    if (
      now - lastTalk1 < GAME_CONFIG.social.conversationCooldown ||
      now - lastTalk2 < GAME_CONFIG.social.conversationCooldown
    )
      return false;

    agent1.lastConversation.set(agentId2, now);
    agent2.lastConversation.set(agentId1, now);
    const lockDuration =
      (GAME_CONFIG.social.dialogueDelay || 0) +
      (GAME_CONFIG.ui.dialogueBubbleTimeout || 0) +
      300;
    agent1.lockForConversation?.(lockDuration);
    agent2.lockForConversation?.(lockDuration);

    const dialogue = await this.generateDialogue(agent1, agent2);
    if (!dialogue) {
      agent1.releaseConversationLock?.(Infinity);
      agent2.releaseConversationLock?.(Infinity);
      return false;
    }

    this.dispatchEvent(
      new CustomEvent("event", {
        detail: {
          type: "conversation",
          description: `${agent1.name}和${agent2.name}在交谈`,
          timestamp: new Date(),
          agentIds: [agentId1, agentId2],
          dialogue: dialogue,
        },
      }),
    );

    this.dispatchEvent(
      new CustomEvent("dialogue", {
        detail: {
          agentId: agentId1,
          message: dialogue.speaker1,
          timestamp: now,
        },
      }),
    );

    setTimeout(() => {
      this.dispatchEvent(
        new CustomEvent("dialogue", {
          detail: {
            agentId: agentId2,
            message: dialogue.speaker2,
            timestamp: Date.now(),
          },
        }),
      );
    }, GAME_CONFIG.social.dialogueDelay);

    return true;
  }

  /**
   * 生成对话内容
   */
  async generateDialogue(agent1, agent2) {
    try {
      const townContext = `当前时间：${this.gameTime.toLocaleString()}
污染：${Math.round(this.pollution)}/100
理论值：${Math.round(this.worldResources.techTheory || 0)}
生产值：${Math.round(this.worldResources.techProduction || 0)}
知识储备：${Math.round(this.worldResources.knowledgeReserve || 0)}
粮食库存：${Math.round(this.worldResources.foodStock || 0)}`;
      const setupNote = "补充设定：仓库只会给个人赚积分，不会增加任何集体资源。";
      const response = await this.llm.chat(
        [
          {
            role: "system",
            content:
              "你在生成两个小镇居民之间的简短自然对话。只输出JSON，不要解释。",
          },
          {
            role: "user",
            content: `请为以下两个人生成一次碰面时的双人短对话。

角色1：${agent1.name}，${agent1.occupation}，状态=${agent1.status}，健康=${Math.round(agent1.health.current)}/${agent1.health.max}，饱腹=${Math.round(agent1.fullness)}
角色2：${agent2.name}，${agent2.occupation}，状态=${agent2.status}，健康=${Math.round(agent2.health.current)}/${agent2.health.max}，饱腹=${Math.round(agent2.fullness)}

小镇背景：
${townContext}
${setupNote}

要求：
1. 每人只说一句，口语化、自然、带一点性格差异。
2. 内容可以围绕污染、工作、饥饿、休息、资源、当天见闻。
3. 只能提到当前对话中的角色、玩家或“大家”，不要编出不存在的新人物。
4. 不要太长，不要官话，不要旁白。

输出JSON：
{"speaker1":"角色1说的话","speaker2":"角色2说的话"}`,
          },
        ],
        { timeout: 10000 },
      );
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : response);
      if (parsed?.speaker1 && parsed?.speaker2) {
        return {
          speaker1: this.sanitizeConversationText(String(parsed.speaker1), {
            allowedNames: [agent1.name, agent2.name],
            replacement: agent2.name || "你",
          }),
          speaker2: this.sanitizeConversationText(String(parsed.speaker2), {
            allowedNames: [agent1.name, agent2.name],
            replacement: agent1.name || "你",
          }),
        };
      }
    } catch (e) {
      console.warn("[对话] LLM生成失败，跳过本次对话：", e.message || e);
    }

    return null;
  }

  /**
   * 触发世界事件
   */
  triggerEvent(type, description, options = {}) {
    const effects =
      options.effects && typeof options.effects === "object"
        ? Object.fromEntries(
            Object.entries(options.effects).filter(
              ([, value]) => value !== undefined && value !== null && value !== 0,
            ),
          )
        : {};
    const event = {
      type:
        options.forceAnnouncement || effects.forceAnnouncement
          ? "announcement"
          : type,
      description,
      timestamp: new Date(),
      tickCount: this.tickCount,
      source: options.source || "system",
      template: options.template || "",
      effects,
    };

    if (Object.keys(effects).length > 0) {
      const effectResult = this.applyEventEffects({
        ...effects,
        title: options.title || type,
      });
      if (effectResult?.interruptedAgents?.length) {
        const names = effectResult.interruptedAgents.join("、");
        event.description = `${event.description} 受事件影响，${names}的行动被打断，暂时停下脚步。`;
        event.effects = {
          ...event.effects,
          interruptedAgents: effectResult.interruptedAgents,
        };
      }
    }

    this.events.push(event);
    if (this.events.length > GAME_CONFIG.ui.maxEventHistory) {
      this.events.shift();
    }

    this.dispatchEvent(
      new CustomEvent("event", {
        detail: event,
      }),
    );

    return event;
  }

  maybeTriggerRandomEvent() {
    const pendingDay = this.randomEventState?.pendingDay;
    if (typeof pendingDay === "number") {
      this.processDailyWorldEvent(pendingDay);
    }
  }

  applyRandomWorldEvent(event, probability = null) {
    if (!event) return;
    this.triggerEvent(
      event.type || "world",
      `🎲 ${event.title}：${event.description}`,
      {
        source: "random",
        template: event.key || "",
        title: event.title,
        effects: {
          ...(event.effects || {}),
        },
        probability,
      },
    );
  }

  applyEventEffects(event) {
    const result = { interruptedAgents: [] };
    if (!event) return result;

    if (typeof event.pollutionDelta === "number") {
      this.pollution = Math.max(
        0,
        Math.min(
          GAME_CONFIG.pollution.gameOverThreshold,
          this.pollution + event.pollutionDelta,
        ),
      );
      this.dispatchEvent(
        new CustomEvent("pollutionChange", {
          detail: { pollution: this.pollution },
        }),
      );
    }

    if (typeof event.foodStockDelta === "number") {
      this.worldResources.foodStock = Math.max(
        0,
        Math.min(
          GAME_CONFIG.resourceAccumulation.foodStockMax,
          (this.worldResources.foodStock || 0) + event.foodStockDelta,
        ),
      );
    }

    if (typeof event.materialDelta === "number") {
      this.worldResources.materialValue = Math.max(
        0,
        Math.min(
          GAME_CONFIG.resourceAccumulation.materialValueMax,
          (this.worldResources.materialValue || 0) + event.materialDelta,
        ),
      );
    }

    if (typeof event.techTheoryDelta === "number") {
      this.worldResources.techTheory = Math.max(
        0,
        Math.min(
          GAME_CONFIG.resourceCap.techTheory,
          (this.worldResources.techTheory || 0) + event.techTheoryDelta,
        ),
      );
    }

    if (typeof event.techProductionDelta === "number") {
      this.worldResources.techProduction = Math.max(
        0,
        Math.min(
          GAME_CONFIG.resourceCap.techProduction,
          (this.worldResources.techProduction || 0) + event.techProductionDelta,
        ),
      );
    }

    if (typeof event.knowledgeReserveDelta === "number") {
      this.worldResources.knowledgeReserve = Math.max(
        0,
        Math.min(
          GAME_CONFIG.initialResources.knowledgeReserve * 2,
          (this.worldResources.knowledgeReserve || 0) +
            event.knowledgeReserveDelta,
        ),
      );
    }

    if (typeof event.healthDelta === "number") {
      for (const agent of this.agents.values()) {
        agent.health.current = Math.max(
          1,
          Math.min(agent.health.max, agent.health.current + event.healthDelta),
        );
      }
    }

    if (typeof event.greenPointsDelta === "number") {
      for (const agent of this.agents.values()) {
        agent.greenPoints += event.greenPointsDelta;
      }
    }

    if (typeof event.forceWaitCount === "number" && event.forceWaitCount > 0) {
      const shuffledAgents = [...this.agents.values()].sort(
        () => Math.random() - 0.5,
      );
      for (const agent of shuffledAgents.slice(0, event.forceWaitCount)) {
        if (agent.isMoving?.()) {
          agent.stopMoving?.();
        }
        agent.currentAction = {
          type: agent.ActionType.WAIT,
          description: `${event.title}带来的混乱让他停下脚步`,
          timestamp: new Date(),
        };
        agent.status = "idle";
        agent.workTarget = null;
        agent.workEndTime = null;
        agent._workStartTime = null;
        agent.moveTarget = null;
        agent.currentPath = [];
        agent.currentPathIndex = 0;
        result.interruptedAgents.push(agent.name);
      }
    }

    return result;
  }

  /**
   * 获取世界状态
   */
  getWorldState() {
    const agentStates = new Map();
    for (const [id, agent] of this.agents) {
      agentStates.set(id, this.getAgentState(agent));
    }

    return {
      time: this.gameTime,
      agents: agentStates,
      objects: this.objects,
      events: this.events.slice(-GAME_CONFIG.ui.recentEventsCount),
      tickCount: this.tickCount,
      lastRandomEventTick: this.lastRandomEventTick,
      dayCount: this.dayCount,
      isRunning: this.isRunning,
      isGameOver: this.isGameOver,
      townHealth: this.townHealth,
      pollution: this.pollution,
      worldResources: this.worldResources,
      gridSize: { cols: this.gridCols, rows: this.gridRows },
      tileSize: this.tileSize,
      isPassable: (x, y) => this.isPassable(x, y),
      getAreaNameAt: (x, y) => this.getAreaNameAt(x, y),
      getAreaAt: (x, y) => this.getAreaAt(x, y),
      getAreaServicesAt: (x, y) => this.getAreaServicesAt(x, y),
      getAreas: () => this.getAreas(),
    };
  }

  /**
   * 获取Agent状态
   */
  getAgentState(agent) {
    const state = agent.getState();
    return {
      agentId: agent.id,
      name: agent.name,
      position: state.position,
      status: state.status,
      facingDirection: agent.facingDirection || "down",
      currentAction: state.currentAction,
      health: agent.health,
      greenPoints: agent.greenPoints,
      fullness: agent.fullness,
      backpack: agent.backpack,
      decisionHistory: agent.decisionHistory || [],
      config: {
        age: agent.config.age,
        traits: agent.config.traits,
        background: agent.config.background,
        goals: agent.config.goals,
      },
    };
  }

  /**
   * 导出状态（用于保存）
   */
  exportState() {
    const agents = [];
    for (const agent of this.agents.values()) {
      agents.push(agent.serialize());
    }

    return {
      version: 2,
      timestamp: new Date().toISOString(),
      tickCount: this.tickCount,
      dayCount: this.dayCount,
      gameTime: this.gameTime.toISOString(),
      pollution: this.pollution,
      isGameOver: this.isGameOver,
      townHealth: { ...this.townHealth },
      timeScale: this.timeScale,
      randomEventState: { ...this.randomEventState },
      tileSize: this.tileSize,
      imageWidth: this.imageWidth,
      imageHeight: this.imageHeight,
      worldResources: { ...this.worldResources },
      lastSleepReminderDateKey: this.lastSleepReminderDateKey,
      agents,
      events: this.events,
      areas: this.areas,
    };
  }

  /**
   * 从保存数据加载
   */
  async loadFromSave(data) {
    this.stop();
    for (const agent of this.agents.values()) {
      if (agent.moveInterval) {
        clearInterval(agent.moveInterval);
        agent.moveInterval = null;
      }
    }
    this.tickCount = data.tickCount || 0;
    this.lastRandomEventTick = data.lastRandomEventTick || 0;
    this.randomEventState = this.createRandomEventState(data.randomEventState || {});
    this.dayCount = data.dayCount || 1;
    this.gameTime = new Date(data.gameTime);
    this._lastGameTime = new Date(this.gameTime);
    this.pollution = data.pollution ?? GAME_CONFIG.initialPollution;
    this.lastSleepReminderDateKey =
      typeof data.lastSleepReminderDateKey === "string"
        ? data.lastSleepReminderDateKey
        : null;
    this.isGameOver = Boolean(data.isGameOver);
    this.isMeeting = false;
    this._meetingManualStopRequested = false;
    this.gameOverDetail = this.isGameOver
      ? {
          reason: "loaded",
          message: "已加载一个结束中的世界。",
          dayCount: this.dayCount,
          pollution: this.pollution,
        }
      : null;
    this._lastDay = Math.floor(this.gameTime.getTime() / 86400000);
    if (data.worldResources) {
      Object.assign(this.worldResources, data.worldResources);
    }
    if (data.townHealth) {
      this.townHealth = {
        current: data.townHealth.current ?? GAME_CONFIG.survival.healthMax,
        max: data.townHealth.max ?? GAME_CONFIG.survival.healthMax,
      };
    }
    if (data.timeScale) {
      this.timeScale = data.timeScale;
    }
    if (data.tileSize) {
      this.tileSize = data.tileSize;
    }
    if (data.imageWidth) {
      this.imageWidth = data.imageWidth;
    }
    if (data.imageHeight) {
      this.imageHeight = data.imageHeight;
    }

    this.occupancyMap.clear();
    this.agents.clear();

    for (const agentData of data.agents) {
      const agent = Agent.deserialize(agentData, this.llm);
      agent.world = this;
      this.agents.set(agent.id, agent);
      this.setAgentOccupancy(agent.id, null, agent.getPosition());
    }

    if (data.events) {
      this.events = data.events;
    }

    if (data.areas) {
      this.setAreas(data.areas);
    }

    this.dispatchEvent(
      new CustomEvent("loaded", {
        detail: {
          tickCount: this.tickCount,
          dayCount: this.dayCount,
          agentCount: this.agents.size,
        },
      }),
    );
  }

  /**
   * 重置世界
   */
  async reset(clearAgents = false) {
    this.stop();
    for (const agent of this.agents.values()) {
      if (agent.moveInterval) {
        clearInterval(agent.moveInterval);
        agent.moveInterval = null;
      }
    }
    this.tickCount = 0;
    this.lastRandomEventTick = 0;
    this.randomEventState = this.createRandomEventState();
    this.dayCount = 1;
    this.gameTime = new Date();
    this.gameTime.setHours(GAME_CONFIG.time.initialHour, 0, 0, 0);
    this._lastGameTime = new Date(this.gameTime);
    this.pollution = GAME_CONFIG.initialPollution;
    this._lastDay = null;
    this.worldResources = { ...GAME_CONFIG.initialResources };
    this.events = [];
    this.townHealth = {
      current: GAME_CONFIG.survival.healthMax,
      max: GAME_CONFIG.survival.healthMax,
    };
    this.occupancyMap.clear();
    this.isDreaming = false;
    this.isMeeting = false;
    this._meetingManualStopRequested = false;
    this.isGameOver = false;
    this.gameOverDetail = null;

    const configs = [];
    if (!clearAgents) {
      for (const agent of this.agents.values()) {
        configs.push(agent.config);
      }
    }

    this.agents.clear();

    return configs;
  }
}

export default WorldSimulator;
