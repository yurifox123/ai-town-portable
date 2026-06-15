/**
 * 游戏数值配置（统一管理，方便调试）
 * 支持按难度解析成运行时配置。
 */

const BASE_GAME_CONFIG = {
  // ========== 时间 ==========
  tickIntervalMs: 1000,
  timeScale: 5,

  // ========== 初始资源 ==========
  initialResources: {
    techTheory: 0,
    techProduction: 0,
    knowledgeReserve: 100,
    materialValue: 0,
    foodStock: 50,
  },
  initialPollution: 50,
  initialGreenPoints: 10,
  initialFullness: 80,

  // ========== 污染 ==========
  pollution: {
    goodEndingThreshold: 0,
    dailyIncrease: 1,
    dailyIncreaseMilestones: [
      { day: 10, value: 2 },
      { day: 20, value: 3 },
    ],
    gameOverThreshold: 100,
    warningHigh: 60,
    warningCritical: 80,
    finishCleanupThreshold: 15,
    foodStockWarning: 10,
    cleanupGraceHours: 1,
    factoryUnlockThreshold: 50,
    factoryCleanupEffect: -3,
  },

  // ========== 建筑等级 ==========
  buildingLevelThresholds: [10, 30, 50, 100],
  incomeMultipliers: [1, 1.3, 1.6, 2, 2.5],
  pollutionMultipliers: [0.8, 1, 1.3, 1.5, 0.5],
  effectMultipliers: [1, 1.2, 1.5, 1.8, 2],
  costMultipliers: [1, 1.2, 1.4, 1.6, 2],

  buildingResourceMap: {
    实验室: "techTheory",
    工厂: "techProduction",
    物资基地: "materialValue",
    田地: "materialValue",
    图书馆: "knowledgeReserve",
  },

  // ========== 生存属性 ==========
  survival: {
    healthMax: 100,
    fullnessBaseConsumption: 0.85,
    fullnessMoveExtra: 0.45,
    fullnessWorkExtra: 0.45,
    fullnessSleepRate: 0.2,
    hungerHealthLossThreshold: 35,
    healthStarvingLoss: 7,
    healthHungryLoss: 3,
    healthSleepGain: 10,
    healthRestGain: 1,
    healthRestThreshold: 80,
    sleepPenaltyDay1: 10,
    sleepPenaltyDay2: 50,
    sleepPenaltyDay3: "lethal",
    pollutionDamageThreshold: 70,
    pollutionDamageRate: 0.05,
    pollutionCriticalThreshold: 90,
    pollutionCriticalDamage: 2,
    autoUseHealthThreshold: 50,
    autoUseFullnessThreshold: 40,
    cheapestFoodPrice: 2,
  },

  // ========== 资源积累 ==========
  resourceAccumulation: {
    techTheoryPerTick: 1,
    techProductionPerTick: 1,
    foodStockPerTick: 0.6,
    foodStockMax: 200,
    materialValuePerInteraction: 1,
    materialValueMax: 200,
    knowledgeConversionChance: 0.5,
  },

  // ========== 清理 ==========
  cleanup: {
    pollutionEffectPerTick: -0.52,
  },

  // ========== 建筑语义预设 ==========
  buildingEffectPresets: {
    personalPoints: {
      serviceName: "个人工作",
      income: 8,
      cost: 0,
      collectiveImpact: "personal",
      description: "只给自己赚积分，不增加小镇集体资源。",
    },
    foodSupply: {
      serviceName: "领取补给",
      cost: 4,
      fullness: 20,
      collectiveImpact: "support",
      description: "领取可食用补给，主要解决个人饥饿。",
    },
    healing: {
      serviceName: "治疗恢复",
      cost: 4,
      health: 18,
      collectiveImpact: "support",
      description: "恢复健康，避免个人倒下。",
    },
    sleepRest: {
      serviceName: "睡觉",
      cost: 0,
      health: 10,
      collectiveImpact: "support",
      description: "休息恢复健康，夜间避免熬夜惩罚。",
    },
    pollutionCleanup: {
      serviceName: "净化污染",
      cost: 0,
      income: 0,
      pollutionEffect: -0.52,
      collectiveImpact: "collective",
      description: "直接降低污染，是集体救世行动。",
    },
    techTheory: {
      serviceName: "理论研究",
      cost: 0,
      income: 0,
      resourceEffects: { techTheory: 1 },
      collectiveImpact: "collective",
      description: "推进科技理论值。",
    },
    techProduction: {
      serviceName: "生产推进",
      cost: 0,
      income: 0,
      resourceEffects: { techProduction: 1 },
      collectiveImpact: "collective",
      description: "推进科技生产值。",
    },
    knowledgeReserve: {
      serviceName: "整理知识",
      cost: 0,
      income: 0,
      resourceEffects: { knowledgeReserve: 2 },
      collectiveImpact: "collective",
      description: "增加可被使用的知识储备。",
    },
    knowledgeConversion: {
      serviceName: "转化知识",
      cost: 0,
      income: 0,
      collectiveImpact: "collective",
      description: "消耗前人知识，转化为理论和生产进展。",
    },
    foodProduction: {
      serviceName: "生产粮食",
      cost: 0,
      income: 0,
      resourceEffects: { foodStock: 0.6 },
      collectiveImpact: "collective",
      description: "增加集体粮食库存。",
    },
    materialValue: {
      serviceName: "整理物资",
      cost: 0,
      income: 0,
      resourceEffects: { materialValue: 1 },
      collectiveImpact: "collective",
      description: "增加集体物资价值。",
    },
    socialPlace: {
      serviceName: "交流协作",
      cost: 0,
      collectiveImpact: "mixed",
      description: "适合居民交流和对齐信息。",
    },
  },

  // ========== 移动 ==========
  movement: {
    moveSpeed: 200,
    decisionInterval: 50,
    observationRange: 5,
    homeDistance: 1,
    maxSpawnAttempts: 100,
  },

  // ========== 时间 ==========
  time: {
    initialHour: 8,
    wakeHour: 6,
    nightStart: 22,
    sleepReminderHour: 22,
    nightEnd: 6,
    forceSleepStart: 2,
    forceSleepFallbackHour: 4,
    eveningStart: 20,
    maxDays: 30,
  },

  // ========== 决策阈值 ==========
  decision: {
    healthCritical: 30,
    healthWarning: 50,
    fullnessCritical: 20,
    fullnessWarning: 40,
    knowledgeWarning: 45,
    knowledgeEarlyFocusThreshold: 90,
    techRampTarget: 30,
    greenPointsLow: 30,
    greenPointsMin: 5,
    noSleepWarningDays: 2,
    defaultHourlyRate: 15,
    idleDecisionCooldownMinutes: 25,
    knowledgeSplitRatio: 0.5,
  },

  // ========== 社交 ==========
  social: {
    conversationChance: 0.2,
    conversationCooldown: 60000,
    conversationCooldownAgent: 300000,
    dialogueDelay: 2000,
  },

  // ========== 记忆系统 ==========
  memory: {
    reflectionThreshold: 24,
    importanceThreshold: 5,
    reflectionCheckInterval: 12,
    maxReflectionMemories: 20,
    minReflectionMemories: 3,
    reflectionImportance: 8,
    relevanceWeight: 0.6,
    recencyWeight: 0.2,
    importanceWeight: 0.2,
    recencyDecayHours: 24,
  },

  // ========== 人格默认值 ==========
  personality: {
    defaultTraits: { social: 0.5, energy: 0.5 },
    highThreshold: 0.7,
    lowThreshold: 0.3,
    defaultWakeTime: 7,
    defaultSleepTime: 23,
  },

  // ========== UI ==========
  ui: {
    dialogueBubbleTimeout: 3000,
    meetingTimeoutSeconds: 60,
    gameOverSequenceMs: 2600,
    maxEventHistory: 100,
    recentEventsCount: 20,
    healthCriticalPercent: 0.3,
    healthWarningPercent: 0.5,
    fullnessCriticalPercent: 0.35,
    fullnessWarningPercent: 0.55,
  },

  visual: {
    pollutionMap: {
      enabled: true,
      stages: [
        { min: 0, max: 25, image: "/assets/pollution-stages/stage-1.png" },
        { min: 25, max: 50, image: "/assets/pollution-stages/stage-2.png" },
        { min: 50, max: 75, image: "/assets/pollution-stages/stage-3.png" },
        { min: 75, max: 100, image: "/assets/pollution-stages/stage-3.png" },
      ],
    },
    dayNight: {
      enabled: true,
      dawnStart: 6,
      dayStart: 8,
      duskStart: 17.5,
      nightStart: 20,
      transitionMinutes: 90,
      presets: {
        dawn: {
          brightness: 0.9,
          contrast: 0.92,
          tintColor: "#8fa2b3",
          tintAlpha: 0.18,
          fogColor: "#6b7f8f",
          fogAlpha: 0.09,
          pollutionFogBoost: 0.12,
          agentShadowAlpha: 0.34,
          agentDimAlpha: 0.12,
          iconTintAlpha: 0.12,
          labelDimAlpha: 0.08,
          gridBoostAlpha: 0.14,
        },
        day: {
          brightness: 1.04,
          contrast: 1.02,
          tintColor: "#d7d1ba",
          tintAlpha: 0.06,
          fogColor: "#7f7460",
          fogAlpha: 0.03,
          pollutionFogBoost: 0.1,
          agentShadowAlpha: 0.24,
          agentDimAlpha: 0.02,
          iconTintAlpha: 0.02,
          labelDimAlpha: 0,
          gridBoostAlpha: 0.08,
        },
        dusk: {
          brightness: 0.82,
          contrast: 0.94,
          tintColor: "#b86a43",
          tintAlpha: 0.22,
          fogColor: "#7c4634",
          fogAlpha: 0.14,
          pollutionFogBoost: 0.18,
          agentShadowAlpha: 0.38,
          agentDimAlpha: 0.14,
          iconTintAlpha: 0.12,
          labelDimAlpha: 0.12,
          gridBoostAlpha: 0.16,
        },
        night: {
          brightness: 0.52,
          contrast: 0.88,
          tintColor: "#273843",
          tintAlpha: 0.36,
          fogColor: "#18262f",
          fogAlpha: 0.24,
          pollutionFogBoost: 0.28,
          agentShadowAlpha: 0.64,
          agentDimAlpha: 0.34,
          iconTintAlpha: 0.26,
          labelDimAlpha: 0.28,
          gridBoostAlpha: 0.28,
        },
      },
    },
  },

  randomEvents: {
    baseDailyChance: 0.1,
    dailyChanceStep: 0.1,
    maxDailyChance: 1,
  },

  // ========== LLM 超时保护 ==========
  llm: {
    requestTimeoutMs: 10000,
    overallTimeoutMs: 20000,
    decisionTimeoutMs: 12000,
    enableLocalFallback: true,
    fallbackActionGameMinutes: 5,
    fallbackMoveRecheckSteps: 5,
  },

  // ========== 资源上限 ==========
  resourceCap: {
    techTheory: 100,
    techProduction: 100,
    materialValueScaling: 200,
  },
};

const DIFFICULTY_MODES = {
  easy: {
    key: "easy",
    label: "简单",
    description: "个人更容易活下去，但仍需要学会逐步为集体兜底。",
    initialPollution: 34,
    initialGreenPoints: 16,
    initialFullness: 88,
    initialResources: {
      knowledgeReserve: 120,
      foodStock: 72,
    },
    pollution: {
      dailyIncrease: 0.8,
      warningHigh: 68,
      warningCritical: 86,
      factoryUnlockThreshold: 40,
      factoryCleanupEffect: -4.2,
    },
    survival: {
      fullnessBaseConsumption: 0.72,
      fullnessMoveExtra: 0.3,
      fullnessWorkExtra: 0.3,
      hungerHealthLossThreshold: 30,
      healthStarvingLoss: 4.5,
      healthHungryLoss: 1.8,
      healthSleepGain: 12,
      healthRestGain: 1.5,
      sleepPenaltyDay1: 6,
      sleepPenaltyDay2: 28,
      pollutionDamageThreshold: 80,
      pollutionDamageRate: 0.03,
      pollutionCriticalThreshold: 95,
      pollutionCriticalDamage: 1.2,
      autoUseHealthThreshold: 60,
      autoUseFullnessThreshold: 35,
      cheapestFoodPrice: 3,
    },
    resourceAccumulation: {
      techTheoryPerTick: 1.2,
      techProductionPerTick: 1.15,
      foodStockPerTick: 0.78,
      materialValuePerInteraction: 1.2,
      knowledgeConversionChance: 0.65,
    },
    cleanup: {
      pollutionEffectPerTick: -0.9,
    },
    decision: {
      defaultHourlyRate: 11,
      greenPointsLow: 22,
      greenPointsMin: 4,
      fullnessCritical: 26,
      fullnessWarning: 44,
    },
    randomEvents: {
      baseDailyChance: 0.1,
      dailyChanceStep: 0.14,
      maxDailyChance: 1,
    },
    time: {
      maxDays: 30,
    },
  },
  normal: {
    key: "normal",
    label: "普通",
    description: "个人苟活与集体救世开始明显冲突，必须频繁取舍。",
    initialPollution: 52,
    initialGreenPoints: 8,
    initialFullness: 76,
    initialResources: {
      knowledgeReserve: 88,
      foodStock: 42,
    },
    pollution: {
      dailyIncrease: 1.15,
      warningHigh: 58,
      warningCritical: 76,
      factoryUnlockThreshold: 52,
      factoryCleanupEffect: -3,
    },
    survival: {
      fullnessBaseConsumption: 1.26,
      fullnessMoveExtra: 0.78,
      fullnessWorkExtra: 0.82,
      fullnessSleepRate: 0.34,
      hungerHealthLossThreshold: 52,
      healthStarvingLoss: 14,
      healthHungryLoss: 6.5,
      healthSleepGain: 6.2,
      healthRestGain: 0.2,
      healthRestThreshold: 92,
      sleepPenaltyDay1: 18,
      sleepPenaltyDay2: 78,
      pollutionDamageThreshold: 55,
      pollutionDamageRate: 0.11,
      pollutionCriticalThreshold: 74,
      pollutionCriticalDamage: 4.4,
      autoUseHealthThreshold: 32,
      autoUseFullnessThreshold: 22,
      cheapestFoodPrice: 4,
    },
    resourceAccumulation: {
      techTheoryPerTick: 0.95,
      techProductionPerTick: 0.95,
      foodStockPerTick: 0.52,
      materialValuePerInteraction: 0.95,
      knowledgeConversionChance: 0.48,
    },
    cleanup: {
      pollutionEffectPerTick: -0.58,
    },
    decision: {
      defaultHourlyRate: 8,
      greenPointsLow: 26,
      greenPointsMin: 6,
      fullnessCritical: 32,
      fullnessWarning: 50,
    },
    randomEvents: {
      baseDailyChance: 0.1,
      dailyChanceStep: 0.18,
      maxDailyChance: 1,
    },
    time: {
      maxDays: 30,
    },
  },
  hard: {
    key: "hard",
    label: "困难",
    description: "末世压迫感最强，个人生存与集体救世几乎时时互相撕扯。",
    initialPollution: 66,
    initialGreenPoints: 4,
    initialFullness: 68,
    initialResources: {
      knowledgeReserve: 58,
      foodStock: 28,
    },
    pollution: {
      dailyIncrease: 1.55,
      warningHigh: 52,
      warningCritical: 70,
      factoryUnlockThreshold: 64,
      factoryCleanupEffect: -2.2,
    },
    survival: {
      fullnessBaseConsumption: 1.12,
      fullnessMoveExtra: 0.62,
      fullnessWorkExtra: 0.62,
      hungerHealthLossThreshold: 42,
      healthStarvingLoss: 9.5,
      healthHungryLoss: 4.4,
      healthSleepGain: 8,
      healthRestGain: 0.6,
      sleepPenaltyDay1: 15,
      sleepPenaltyDay2: 68,
      pollutionDamageThreshold: 60,
      pollutionDamageRate: 0.075,
      pollutionCriticalThreshold: 82,
      pollutionCriticalDamage: 3.2,
      autoUseHealthThreshold: 45,
      autoUseFullnessThreshold: 45,
      cheapestFoodPrice: 5,
    },
    resourceAccumulation: {
      techTheoryPerTick: 0.82,
      techProductionPerTick: 0.82,
      foodStockPerTick: 0.38,
      materialValuePerInteraction: 0.75,
      knowledgeConversionChance: 0.35,
    },
    cleanup: {
      pollutionEffectPerTick: -0.46,
    },
    decision: {
      defaultHourlyRate: 6,
      greenPointsLow: 30,
      greenPointsMin: 7,
      fullnessCritical: 34,
      fullnessWarning: 54,
    },
    randomEvents: {
      baseDailyChance: 0.1,
      dailyChanceStep: 0.22,
      maxDailyChance: 1,
    },
    time: {
      maxDays: 30,
    },
  },
};

const DIFFICULTY_ORDER = ["normal"];

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function deepMerge(base, override) {
  const result = Array.isArray(base) ? [...base] : { ...base };
  for (const [key, value] of Object.entries(override || {})) {
    if (isPlainObject(value) && isPlainObject(result[key])) {
      result[key] = deepMerge(result[key], value);
    } else if (Array.isArray(value)) {
      result[key] = [...value];
    } else {
      result[key] = value;
    }
  }
  return result;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const key of Object.keys(value)) {
    deepFreeze(value[key]);
  }
  return value;
}

function normalizeDifficultyKey(value) {
  return "normal";
}

function createGameConfig(mode = "normal", overrides = {}) {
  const difficulty = normalizeDifficultyKey(mode);
  const preset = DIFFICULTY_MODES.normal;
  const merged = deepMerge(BASE_GAME_CONFIG, preset);
  const withOverrides = deepMerge(merged, overrides || {});
  withOverrides.difficulty = {
    current: difficulty,
    label: preset.label,
    description: preset.description,
    options: DIFFICULTY_ORDER.map((key) => ({
      key,
      label: DIFFICULTY_MODES[key].label,
      description: DIFFICULTY_MODES[key].description,
    })),
  };
  return deepFreeze(withOverrides);
}

let activeGameConfig = createGameConfig("normal");

function setActiveGameConfig(mode = "normal", overrides = {}) {
  activeGameConfig = createGameConfig(mode, overrides);
  return activeGameConfig;
}

function getActiveGameConfig() {
  return activeGameConfig;
}

const GAME_CONFIG = new Proxy(
  {},
  {
    get(_target, prop) {
      return activeGameConfig[prop];
    },
    has(_target, prop) {
      return prop in activeGameConfig;
    },
    ownKeys() {
      return Reflect.ownKeys(activeGameConfig);
    },
    getOwnPropertyDescriptor(_target, prop) {
      const descriptor = Object.getOwnPropertyDescriptor(activeGameConfig, prop);
      if (!descriptor) return undefined;
      return {
        configurable: true,
        enumerable: descriptor.enumerable,
        value: descriptor.value,
        writable: false,
      };
    },
  },
);

export {
  BASE_GAME_CONFIG,
  DIFFICULTY_MODES,
  DIFFICULTY_ORDER,
  normalizeDifficultyKey,
  createGameConfig,
  setActiveGameConfig,
  getActiveGameConfig,
};

export default GAME_CONFIG;
