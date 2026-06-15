/**
 * AI 生态小镇前端主应用 - 增强版
 * 支持图片精灵渲染和加载界面
 */
import WorldSimulator from "../core/simulator.js";
import LLMClient from "./llm-client.js";
import imageLoader from "../assets/image-loader.js";
import {
  getCharacterSprite,
  getCharacterPortrait,
  getCharacterDisplaySize,
  getCharacterAnimation,
  getCharacterKey,
  ASSET_CONFIG,
} from "../assets/asset-config.js";
import {
  normalizePersonality,
  normalizeTemplate,
} from "../core/personality.js";
import {
  createGameConfig,
  normalizeDifficultyKey,
  setActiveGameConfig,
} from "../core/game-config.js";
import {
  BUILDING_EFFECT_TAGS,
  BUILDING_PURPOSES,
  describeService,
  getAreaBuilding,
  getAreaTags,
  normalizeAreaSemantics,
} from "../core/building-semantics.js";
import {
  appendSafeMessage,
  appendTextElement,
  clearElement,
  escapeHtml,
} from "./dom-utils.js";

const DIFFICULTY_STORAGE_KEY = "ai-town-difficulty";
const BALANCE_CONFIG_STORAGE_KEY = "ai-town-game-config";
const SIDEBAR_COLLAPSED_STORAGE_KEY = "ai-town-sidebar-collapsed";
const SIDEBAR_WIDTH_STORAGE_KEY = "ai-town-sidebar-width";
const SIDEBAR_EXPANDED_WIDTH_STORAGE_KEY = "ai-town-sidebar-expanded-width";
const SIDEBAR_PANEL_STATE_STORAGE_KEY = "ai-town-sidebar-panels";
const EDITOR_PANEL_STATE_STORAGE_KEY = "ai-town-editor-panels";
const SIDEBAR_COLLAPSED_WIDTH = 28;
const SIDEBAR_DEFAULT_WIDTH = 360;
const SIDEBAR_MAX_WIDTH = 560;
const SIDEBAR_MIN_WIDTH = 280;
const DEFAULT_SIDEBAR_PANELS = Object.freeze({
  agents: true,
  events: true,
  actions: true,
});
const DEFAULT_EDITOR_PANELS = Object.freeze({
  mapInfo: false,
  areaList: true,
  areaProperties: true,
  help: false,
});
const POLLUTION_THEME_STOPS = Object.freeze([
  {
    pollution: 20,
    colors: {
      bg: "#16261f",
      top: "#13211b",
      bgSecondary: "#20352c",
      bgTertiary: "#2c463b",
      primary: "#8fcf9f",
      primaryDark: "#74b384",
      secondary: "#9ed6cf",
      success: "#76c893",
      warning: "#f2c572",
      danger: "#d96c5f",
      info: "#86b8a5",
      border: "#446454",
      textMuted: "#b7c9be",
    },
  },
  {
    pollution: 40,
    colors: {
      bg: "#201c12",
      top: "#17140d",
      bgSecondary: "#342d1b",
      bgTertiary: "#494025",
      primary: "#d3c26b",
      primaryDark: "#baa653",
      secondary: "#d9ca93",
      success: "#aebd72",
      warning: "#f0c063",
      danger: "#d98b61",
      info: "#c2b37c",
      border: "#675b35",
      textMuted: "#cac29d",
    },
  },
  {
    pollution: 60,
    colors: {
      bg: "#25170f",
      top: "#1b110b",
      bgSecondary: "#39231a",
      bgTertiary: "#563226",
      primary: "#e29a5a",
      primaryDark: "#c47a41",
      secondary: "#e6bf90",
      success: "#c3a06b",
      warning: "#f4b35b",
      danger: "#df744d",
      info: "#d4a174",
      border: "#7a4a33",
      textMuted: "#d4b6a2",
    },
  },
  {
    pollution: 80,
    colors: {
      bg: "#240f13",
      top: "#1a0b0e",
      bgSecondary: "#38161d",
      bgTertiary: "#55212a",
      primary: "#dc6656",
      primaryDark: "#bc4b3d",
      secondary: "#e5a18a",
      success: "#bf7a71",
      warning: "#ea9350",
      danger: "#e1574f",
      info: "#c97e73",
      border: "#6d343d",
      textMuted: "#d1afb3",
    },
  },
]);

const BALANCE_CONFIG_MODAL_TEMPLATE = `
  <div id="balance-config-modal" class="modal hidden">
    <div class="modal-overlay"></div>
    <div class="modal-content modal-medium balance-config-modal-content">
      <div class="modal-header">
        <div>
          <h2>参数调优</h2>
          <p class="modal-subtitle">改动会实时同步到运行中的 config，并写入本地存档</p>
        </div>
        <button id="btn-close-balance-config" class="btn-close" aria-label="关闭参数窗口">×</button>
      </div>
      <div class="modal-body balance-config-body">
        <div class="balance-config-toolbar">
          <button id="btn-balance-reset" type="button" class="btn btn-secondary btn-small">恢复默认</button>
          <button id="btn-balance-reload" type="button" class="btn btn-secondary btn-small">重新载入</button>
          <button id="btn-balance-save-close" type="button" class="btn btn-primary btn-small">保存并关闭</button>
        </div>
        <div class="balance-config-layout">
          <div id="balance-config-tabs" class="balance-config-tabs"></div>
          <div id="balance-config-form" class="balance-config-form"></div>
        </div>
        <div id="balance-config-presets" class="balance-config-presets">
          <span class="balance-config-presets-label">推荐基准</span>
          <button type="button" class="balance-preset-btn" data-balance-preset="survival">偏生存</button>
          <button type="button" class="balance-preset-btn" data-balance-preset="normal">默认</button>
          <button type="button" class="balance-preset-btn" data-balance-preset="apocalypse">偏末世压力</button>
        </div>
        <div id="balance-config-status" class="balance-config-status">
          已同步
        </div>
      </div>
    </div>
  </div>
`;

const BALANCE_FIELD_GROUPS = [
  {
    id: "world",
    label: "世界压力",
    fields: [
      { label: "初始污染", path: "initialPollution", type: "number", min: 0, max: 95, step: 1, unit: "%" },
      { label: "每日污染", path: "pollution.dailyIncrease", type: "number", min: 0, max: 5, step: 0.05, unit: "/天" },
      { label: "第10天后", path: "pollution.dailyIncreaseMilestones.0.value", type: "number", min: 0, max: 6, step: 0.05, unit: "/天" },
      { label: "第20天后", path: "pollution.dailyIncreaseMilestones.1.value", type: "number", min: 0, max: 8, step: 0.05, unit: "/天" },
      { label: "毁灭阈值", path: "pollution.gameOverThreshold", type: "number", min: 60, max: 150, step: 1, unit: "%" },
      { label: "好结局阈值", path: "pollution.goodEndingThreshold", type: "number", min: 0, max: 20, step: 1, unit: "%" },
      { label: "高污染警戒", path: "pollution.warningHigh", type: "number", min: 20, max: 95, step: 1, unit: "%" },
      { label: "危急污染", path: "pollution.warningCritical", type: "number", min: 40, max: 99, step: 1, unit: "%" },
    ],
  },
  {
    id: "survival",
    label: "个人生存",
    fields: [
      { label: "初始饱腹", path: "initialFullness", type: "number", min: 0, max: 100, step: 1, unit: "%" },
      { label: "初始积分", path: "initialGreenPoints", type: "number", min: -50, max: 200, step: 1, unit: "点" },
      { label: "基础饥饿", path: "survival.fullnessBaseConsumption", type: "number", min: 0, max: 3, step: 0.05, unit: "/小时" },
      { label: "走路消耗", path: "survival.fullnessMoveExtra", type: "number", min: 0, max: 2, step: 0.05, unit: "/小时" },
      { label: "工作消耗", path: "survival.fullnessWorkExtra", type: "number", min: 0, max: 2, step: 0.05, unit: "/小时" },
      { label: "饥饿扣血线", path: "survival.hungerHealthLossThreshold", type: "number", min: 0, max: 80, step: 1, unit: "%" },
      { label: "饥饿扣血", path: "survival.healthHungryLoss", type: "number", min: 0, max: 20, step: 0.5, unit: "/次" },
      { label: "极饿扣血", path: "survival.healthStarvingLoss", type: "number", min: 0, max: 40, step: 0.5, unit: "/次" },
      { label: "睡眠回血", path: "survival.healthSleepGain", type: "number", min: 0, max: 40, step: 1, unit: "/小时" },
      { label: "失眠1天", path: "survival.sleepPenaltyDay1", type: "number", min: 0, max: 60, step: 1, unit: "伤害" },
      { label: "失眠2天", path: "survival.sleepPenaltyDay2", type: "number", min: 0, max: 100, step: 1, unit: "伤害" },
      { label: "失眠3天致命", path: "survival.sleepPenaltyDay3", type: "lethal-toggle", min: 0, max: 100, step: 1, unit: "伤害", numericDefault: 80 },
    ],
  },
  {
    id: "collective",
    label: "集体救世",
    fields: [
      { label: "许愿池净化", path: "cleanup.pollutionEffectPerTick", type: "number", min: -5, max: 0, step: 0.01, unit: "/tick" },
      { label: "图书馆知识", path: "resourceAccumulation.knowledgeConversionChance", type: "percent", min: 0, max: 100, step: 1, unit: "%" },
      { label: "实验室理论", path: "resourceAccumulation.techTheoryPerTick", type: "number", min: 0, max: 5, step: 0.05, unit: "/tick" },
      { label: "工厂生产", path: "resourceAccumulation.techProductionPerTick", type: "number", min: 0, max: 5, step: 0.05, unit: "/tick" },
      { label: "田地粮食", path: "resourceAccumulation.foodStockPerTick", type: "number", min: 0, max: 5, step: 0.05, unit: "/tick" },
      { label: "粮食上限", path: "resourceAccumulation.foodStockMax", type: "number", min: 50, max: 500, step: 5, unit: "份" },
      { label: "物资上限", path: "resourceAccumulation.materialValueMax", type: "number", min: 50, max: 500, step: 5, unit: "点" },
      { label: "理论上限", path: "resourceCap.techTheory", type: "number", min: 20, max: 500, step: 5, unit: "点" },
      { label: "生产上限", path: "resourceCap.techProduction", type: "number", min: 20, max: 500, step: 5, unit: "点" },
      { label: "物资效能缩放", path: "resourceCap.materialValueScaling", type: "number", min: 50, max: 500, step: 5, unit: "点" },
    ],
  },
  {
    id: "behavior",
    label: "行为倾向",
    fields: [
      { label: "低积分线", path: "decision.greenPointsLow", type: "number", min: 0, max: 100, step: 1, unit: "点" },
      { label: "最低积分线", path: "decision.greenPointsMin", type: "number", min: -20, max: 50, step: 1, unit: "点" },
      { label: "极饿阈值", path: "decision.fullnessCritical", type: "number", min: 0, max: 80, step: 1, unit: "%" },
      { label: "饥饿阈值", path: "decision.fullnessWarning", type: "number", min: 0, max: 90, step: 1, unit: "%" },
      { label: "危急健康", path: "decision.healthCritical", type: "number", min: 0, max: 80, step: 1, unit: "%" },
      { label: "健康警戒", path: "decision.healthWarning", type: "number", min: 0, max: 90, step: 1, unit: "%" },
      { label: "图书馆吸引", path: "decision.knowledgeEarlyFocusThreshold", type: "number", min: 0, max: 150, step: 1, unit: "知识" },
      { label: "社交概率", path: "social.conversationChance", type: "percent", min: 0, max: 100, step: 1, unit: "%" },
      { label: "决策冷却", path: "decision.idleDecisionCooldownMinutes", type: "number", min: 0, max: 120, step: 1, unit: "分钟" },
    ],
  },
  {
    id: "llm",
    label: "LLM兜底",
    fields: [
      { label: "本地兜底", path: "llm.enableLocalFallback", type: "boolean", descriptionOn: "LLM 挂了会用本地规则代判", descriptionOff: "LLM 挂了就不再本地代判" },
      { label: "兜底冷却", path: "llm.fallbackActionGameMinutes", type: "number", min: 1, max: 60, step: 1, unit: "分钟" },
      { label: "重试前步数", path: "llm.fallbackMoveRecheckSteps", type: "number", min: 1, max: 50, step: 1, unit: "步" },
      { label: "请求超时", path: "llm.requestTimeoutMs", type: "number", min: 1000, max: 60000, step: 500, unit: "ms" },
      { label: "总超时", path: "llm.overallTimeoutMs", type: "number", min: 1000, max: 60000, step: 500, unit: "ms" },
      { label: "决策超时", path: "llm.decisionTimeoutMs", type: "number", min: 1000, max: 60000, step: 500, unit: "ms" },
    ],
  },
  {
    id: "events",
    label: "世界事件",
    fields: [
      { label: "初始概率", path: "randomEvents.baseDailyChance", type: "percent", min: 0, max: 100, step: 1, unit: "%" },
      { label: "每日增长", path: "randomEvents.dailyChanceStep", type: "percent", min: 0, max: 100, step: 1, unit: "%" },
      { label: "最高概率", path: "randomEvents.maxDailyChance", type: "percent", min: 0, max: 100, step: 1, unit: "%" },
    ],
  },
  {
    id: "time",
    label: "时间节奏",
    fields: [
      { label: "时间倍率", path: "timeScale", type: "number", min: 1, max: 60, step: 1, unit: "倍" },
      { label: "思考 tick", path: "tickIntervalMs", type: "number", min: 250, max: 10000, step: 250, unit: "ms" },
      { label: "晨会时长", path: "ui.meetingTimeoutSeconds", type: "number", min: 10, max: 300, step: 5, unit: "秒" },
      { label: "毁灭动画", path: "ui.gameOverSequenceMs", type: "number", min: 500, max: 8000, step: 100, unit: "ms" },
      { label: "睡觉提醒", path: "time.sleepReminderHour", type: "number", min: 18, max: 24, step: 1, unit: "点" },
      { label: "最大天数", path: "time.maxDays", type: "number", min: 1, max: 120, step: 1, unit: "天" },
    ],
  },
];

const BALANCE_PRESETS = {
  survival: {
    label: "偏生存",
    overrides: {
      initialPollution: 42,
      initialFullness: 86,
      initialGreenPoints: 18,
      pollution: { dailyIncrease: 0.8, warningHigh: 70, warningCritical: 88 },
      survival: {
        fullnessBaseConsumption: 0.65,
        fullnessMoveExtra: 0.25,
        fullnessWorkExtra: 0.28,
        healthHungryLoss: 1.5,
        healthStarvingLoss: 4,
        healthSleepGain: 14,
        sleepPenaltyDay1: 6,
        sleepPenaltyDay2: 32,
      },
      cleanup: { pollutionEffectPerTick: -0.75 },
      randomEvents: { baseDailyChance: 0.08, dailyChanceStep: 0.08, maxDailyChance: 0.8 },
    },
  },
  normal: {
    label: "默认",
    reset: true,
  },
  apocalypse: {
    label: "偏末世压力",
    overrides: {
      initialPollution: 60,
      initialFullness: 70,
      initialGreenPoints: 6,
      pollution: { dailyIncrease: 1.4, warningHigh: 55, warningCritical: 75 },
      survival: {
        fullnessBaseConsumption: 1.05,
        fullnessMoveExtra: 0.55,
        fullnessWorkExtra: 0.65,
        hungerHealthLossThreshold: 42,
        healthHungryLoss: 4,
        healthStarvingLoss: 9,
        sleepPenaltyDay1: 14,
        sleepPenaltyDay2: 60,
      },
      cleanup: { pollutionEffectPerTick: -0.42 },
      randomEvents: { baseDailyChance: 0.14, dailyChanceStep: 0.2, maxDailyChance: 1 },
    },
  },
};

let activeBalanceConfigGroup = BALANCE_FIELD_GROUPS[0].id;

function safeParseJson(text, fallback = null) {
  if (typeof text !== "string" || !text.trim()) return fallback;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function clonePlainObject(value, fallback = {}) {
  return safeParseJson(JSON.stringify(value ?? fallback), fallback);
}

function stripDifficultyMeta(config = {}) {
  const draft = clonePlainObject(config, {});
  if (draft && typeof draft === "object") {
    delete draft.difficulty;
  }
  return draft;
}

function loadBalanceConfigDraft() {
  const stored = safeParseJson(
    localStorage.getItem(BALANCE_CONFIG_STORAGE_KEY),
    {},
  );
  return stripDifficultyMeta(stored || {});
}

function saveBalanceConfigDraft(draft) {
  localStorage.setItem(
    BALANCE_CONFIG_STORAGE_KEY,
    JSON.stringify(stripDifficultyMeta(draft || {})),
  );
}

function getCurrentBalanceConfigDraft() {
  return stripDifficultyMeta(state.gameConfig || {});
}

function getDefaultBalanceConfigDraft() {
  return stripDifficultyMeta(createGameConfig("normal", {}));
}

function setBalanceConfigStatus(message, tone = "") {
  const statusEl = document.getElementById("balance-config-status");
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.className = `balance-config-status${tone ? ` ${tone}` : ""}`;
}

function syncBalanceModeBadge() {
  const badge = document.getElementById("difficulty-badge");
  if (!badge) return;
  badge.textContent = "";
  badge.title = "";
}

function initializeBalanceConfigControls() {
  const control = document.querySelector(".difficulty-control");
  if (!control) return;
  control.innerHTML = `
    <button id="btn-balance-config" type="button" class="btn btn-small btn-secondary">
      参数调优
    </button>
  `;
}

function ensureBalanceConfigModal() {
  if (!document.getElementById("balance-config-modal")) {
    document.body.insertAdjacentHTML("beforeend", BALANCE_CONFIG_MODAL_TEMPLATE);
  }
}

function getAllBalanceFields() {
  return BALANCE_FIELD_GROUPS.flatMap((group) => group.fields);
}

function findBalanceField(path) {
  return getAllBalanceFields().find((field) => field.path === path) || null;
}

function getConfigValueByPath(config, path) {
  return String(path)
    .split(".")
    .reduce((current, segment) => {
      if (current == null) return undefined;
      const key = /^\d+$/.test(segment) ? Number(segment) : segment;
      return current[key];
    }, config);
}

function setConfigValueByPath(draft, path, value) {
  const parts = String(path).split(".");
  let current = draft;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = /^\d+$/.test(parts[i]) ? Number(parts[i]) : parts[i];
    const nextKey = parts[i + 1];
    if (current[key] == null || typeof current[key] !== "object") {
      current[key] = /^\d+$/.test(nextKey) ? [] : {};
    }
    current = current[key];
  }
  const finalKey = /^\d+$/.test(parts.at(-1)) ? Number(parts.at(-1)) : parts.at(-1);
  current[finalKey] = value;
  return draft;
}

function mergeBalanceDraft(base, overrides) {
  const result = clonePlainObject(base, {});
  for (const [key, value] of Object.entries(overrides || {})) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      result[key] &&
      typeof result[key] === "object" &&
      !Array.isArray(result[key])
    ) {
      result[key] = mergeBalanceDraft(result[key], value);
    } else if (Array.isArray(value)) {
      result[key] = [...value];
    } else {
      result[key] = value;
    }
  }
  return result;
}

function formatBalanceNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  return Number.parseFloat(number.toFixed(4)).toString();
}

function getBalanceDisplayValue(field, rawValue) {
  if (field.type === "percent") {
    return formatBalanceNumber(Number(rawValue ?? 0) * 100);
  }
  return formatBalanceNumber(rawValue ?? field.min ?? 0);
}

function getBalanceStoredValue(field, displayValue) {
  const number = Number(displayValue);
  if (!Number.isFinite(number)) return NaN;
  return field.type === "percent" ? number / 100 : number;
}

function getBalanceStoredBounds(field) {
  if (field.type === "percent") {
    return {
      min: Number(field.min ?? 0) / 100,
      max: Number(field.max ?? 100) / 100,
    };
  }
  return {
    min: Number(field.min ?? Number.NEGATIVE_INFINITY),
    max: Number(field.max ?? Number.POSITIVE_INFINITY),
  };
}

function validateBalanceValue(field, value) {
  if (field.type === "boolean") {
    if (typeof value !== "boolean") return `${field.label} 需要是开或关`;
    return null;
  }

  if (field.type === "lethal-toggle") {
    if (value === "lethal") return null;
    const number = Number(value);
    if (!Number.isFinite(number)) return `${field.label} 需要是数字`;
    if (number < field.min || number > field.max) {
      return `${field.label} 范围是 ${field.min}-${field.max}${field.unit || ""}`;
    }
    return null;
  }

  const number = Number(value);
  if (!Number.isFinite(number)) return `${field.label} 需要是数字`;
  const bounds = getBalanceStoredBounds(field);
  if (number < bounds.min || number > bounds.max) {
    return `${field.label} 数值超出范围`;
  }
  return null;
}

function validateBalanceDraft(draft) {
  for (const field of getAllBalanceFields()) {
    const error = validateBalanceValue(field, getConfigValueByPath(draft, field.path));
    if (error) return { ok: false, error };
  }
  return { ok: true, error: "" };
}

function renderBalanceField(field, config) {
  const rawValue = getConfigValueByPath(config, field.path);
  const rangeText = `${field.min}-${field.max}${field.unit || ""}`;

  if (field.type === "boolean") {
    const checked = rawValue !== false;
    const description = checked
      ? field.descriptionOn || "已开启"
      : field.descriptionOff || "已关闭";
    return `
      <div class="balance-field" data-balance-row="${field.path}">
        <div class="balance-field-main">
          <div>
            <label class="balance-field-label">${escapeHtml(field.label)}</label>
            <div class="balance-field-range">${escapeHtml(description)}</div>
          </div>
          <label class="balance-toggle">
            <input
              type="checkbox"
              data-balance-field="${field.path}"
              data-balance-kind="boolean-toggle"
              ${checked ? "checked" : ""}
            >
            <span>${checked ? "开启" : "关闭"}</span>
          </label>
        </div>
      </div>
    `;
  }

  if (field.type === "lethal-toggle") {
    const isLethal = rawValue === "lethal";
    const numericValue = isLethal
      ? field.numericDefault
      : Number.isFinite(Number(rawValue))
        ? Number(rawValue)
        : field.numericDefault;
    return `
      <div class="balance-field" data-balance-row="${field.path}">
        <div class="balance-field-main">
          <div>
            <label class="balance-field-label">${escapeHtml(field.label)}</label>
            <div class="balance-field-range">${escapeHtml(rangeText)}</div>
          </div>
          <label class="balance-toggle">
            <input
              type="checkbox"
              data-balance-field="${field.path}"
              data-balance-kind="lethal-toggle"
              ${isLethal ? "checked" : ""}
            >
            <span>致命</span>
          </label>
        </div>
        <div class="balance-field-controls">
          <input
            class="balance-number"
            type="number"
            min="${field.min}"
            max="${field.max}"
            step="${field.step}"
            value="${formatBalanceNumber(numericValue)}"
            data-balance-field="${field.path}"
            data-balance-kind="lethal-number"
            ${isLethal ? "disabled" : ""}
          >
          <span class="balance-unit">${escapeHtml(field.unit || "")}</span>
        </div>
      </div>
    `;
  }

  const displayValue = getBalanceDisplayValue(field, rawValue);
  return `
    <div class="balance-field" data-balance-row="${field.path}">
      <div class="balance-field-main">
        <div>
          <label class="balance-field-label">${escapeHtml(field.label)}</label>
          <div class="balance-field-range">${escapeHtml(rangeText)}</div>
        </div>
        <div class="balance-current-value">${escapeHtml(displayValue)}${escapeHtml(field.unit || "")}</div>
      </div>
      <div class="balance-field-controls">
        <input
          class="balance-range"
          type="range"
          min="${field.min}"
          max="${field.max}"
          step="${field.step}"
          value="${displayValue}"
          data-balance-field="${field.path}"
          data-balance-kind="range"
        >
        <input
          class="balance-number"
          type="number"
          min="${field.min}"
          max="${field.max}"
          step="${field.step}"
          value="${displayValue}"
          data-balance-field="${field.path}"
          data-balance-kind="number"
        >
        <span class="balance-unit">${escapeHtml(field.unit || "")}</span>
      </div>
    </div>
  `;
}

function renderBalanceConfigForm() {
  const tabsEl = document.getElementById("balance-config-tabs");
  const formEl = document.getElementById("balance-config-form");
  if (!tabsEl || !formEl) return;

  const activeGroup =
    BALANCE_FIELD_GROUPS.find((group) => group.id === activeBalanceConfigGroup) ||
    BALANCE_FIELD_GROUPS[0];
  const config = getCurrentBalanceConfigDraft();

  tabsEl.innerHTML = BALANCE_FIELD_GROUPS.map(
    (group) => `
      <button
        type="button"
        class="balance-tab ${group.id === activeGroup.id ? "active" : ""}"
        data-balance-group="${group.id}"
      >
        ${escapeHtml(group.label)}
      </button>
    `,
  ).join("");

  formEl.innerHTML = `
    <div class="balance-config-group-title">${escapeHtml(activeGroup.label)}</div>
    <div class="balance-field-list">
      ${activeGroup.fields.map((field) => renderBalanceField(field, config)).join("")}
    </div>
  `;
}

function syncBalanceConfigForm() {
  renderBalanceConfigForm();
}

function syncBalanceConfigEditor() {
  syncBalanceConfigForm();
}

function applyBalanceConfigDraft(draft, { persist = true, syncEditor = false } = {}) {
  const normalizedDraft = stripDifficultyMeta(draft || {});
  const previousTickInterval = state.gameConfig?.tickIntervalMs;
  GAME_CONFIG = createGameConfig("normal", normalizedDraft);
  setActiveGameConfig("normal", normalizedDraft);
  state.gameConfig = GAME_CONFIG;
  state.gameConfigDraft = normalizedDraft;
  state.difficulty = GAME_CONFIG.difficulty.current;
  CONFIG.TICK_INTERVAL = GAME_CONFIG.tickIntervalMs;
  CONFIG.TIME_SCALE = GAME_CONFIG.timeScale;

  if (persist) {
    saveBalanceConfigDraft(normalizedDraft);
    localStorage.setItem(DIFFICULTY_STORAGE_KEY, "normal");
  }

  if (state.world) {
    state.world.applyGameConfig(state.gameConfig);
    if (
      state.simulationRunning &&
      previousTickInterval !== state.gameConfig.tickIntervalMs
    ) {
      state.world.stop();
      state.world.start();
    }
  }

  syncBalanceModeBadge();
  if (syncEditor) {
    syncBalanceConfigForm();
  }
  updateUI();
}

function handleBalanceFieldInput(event) {
  const target = event.target?.closest?.("[data-balance-field]");
  if (!target) return;

  const field = findBalanceField(target.dataset.balanceField);
  if (!field) return;

  const row = target.closest(".balance-field");
  const draft = clonePlainObject(getCurrentBalanceConfigDraft(), {});
  let nextValue = null;

  if (field.type === "boolean") {
    nextValue = !!target.checked;
    const label = target.parentElement?.querySelector("span");
    if (label) {
      label.textContent = nextValue ? "开启" : "关闭";
    }
    const desc = row?.querySelector(".balance-field-range");
    if (desc) {
      desc.textContent = nextValue
        ? field.descriptionOn || "已开启"
        : field.descriptionOff || "已关闭";
    }
  } else if (field.type === "lethal-toggle") {
    const toggle = row?.querySelector('[data-balance-kind="lethal-toggle"]');
    const numberInput = row?.querySelector('[data-balance-kind="lethal-number"]');
    if (target.dataset.balanceKind === "lethal-toggle") {
      if (numberInput) numberInput.disabled = target.checked;
      nextValue = target.checked
        ? "lethal"
        : Number(numberInput?.value || field.numericDefault);
    } else {
      if (toggle?.checked) toggle.checked = false;
      if (numberInput) numberInput.disabled = false;
      if (!String(target.value).trim()) {
        setBalanceConfigStatus("数值超出范围", "is-error");
        return;
      }
      nextValue = Number(target.value);
    }
  } else {
    if (!String(target.value).trim()) {
      setBalanceConfigStatus("数值超出范围", "is-error");
      return;
    }
    const displayValue = Number(target.value);
    if (displayValue < field.min || displayValue > field.max) {
      setBalanceConfigStatus("数值超出范围", "is-error");
      return;
    }
    row?.querySelectorAll(`[data-balance-field="${field.path}"]`).forEach((input) => {
      if (input !== target && ["range", "number"].includes(input.dataset.balanceKind)) {
        input.value = target.value;
      }
    });
    const currentValueEl = row?.querySelector(".balance-current-value");
    if (currentValueEl) {
      currentValueEl.textContent = `${formatBalanceNumber(displayValue)}${field.unit || ""}`;
    }
    nextValue = getBalanceStoredValue(field, displayValue);
  }

  const valueError = validateBalanceValue(field, nextValue);
  if (valueError) {
    setBalanceConfigStatus(valueError, "is-error");
    return;
  }

  setConfigValueByPath(draft, field.path, nextValue);
  const draftValidation = validateBalanceDraft(draft);
  if (!draftValidation.ok) {
    setBalanceConfigStatus(draftValidation.error || "数值超出范围", "is-error");
    return;
  }

  applyBalanceConfigDraft(draft, { persist: true });
  setBalanceConfigStatus("已同步", "is-success");
}

function scheduleBalanceConfigApply(event) {
  clearTimeout(state.balanceConfigApplyTimer);
  state.balanceConfigApplyTimer = setTimeout(() => {
    handleBalanceFieldInput(event);
  }, 120);
}

function handleBalanceGroupClick(event) {
  const button = event.target?.closest?.("[data-balance-group]");
  if (!button) return;
  activeBalanceConfigGroup = button.dataset.balanceGroup;
  renderBalanceConfigForm();
  document.getElementById("balance-config-form")?.scrollTo({ top: 0 });
}

function applyBalancePreset(presetKey) {
  const preset = BALANCE_PRESETS[presetKey];
  if (!preset) return;
  const draft = preset.reset
    ? getDefaultBalanceConfigDraft()
    : mergeBalanceDraft(getCurrentBalanceConfigDraft(), preset.overrides);
  const validation = validateBalanceDraft(draft);
  if (!validation.ok) {
    setBalanceConfigStatus(validation.error || "数值超出范围", "is-error");
    return;
  }
  applyBalanceConfigDraft(draft, { persist: true, syncEditor: true });
  setBalanceConfigStatus(`已应用${preset.label}`, "is-success");
}

function handleBalancePresetClick(event) {
  const button = event.target?.closest?.("[data-balance-preset]");
  if (!button) return;
  applyBalancePreset(button.dataset.balancePreset);
}

function openBalanceConfigModal() {
  ensureBalanceConfigModal();
  showModal("balance-config-modal");
  syncBalanceConfigForm();
  setBalanceConfigStatus("已同步", "");
}

function resetBalanceConfigDraft() {
  applyBalanceConfigDraft(getDefaultBalanceConfigDraft(), { persist: true, syncEditor: true });
  setBalanceConfigStatus("已恢复默认配置。", "is-success");
}

const SIMULATION_SIDEBAR_TEMPLATE = `
  <div class="panel agent-panel" data-panel-id="agents">
    <div class="panel-header">
      <button
        class="panel-header-main"
        type="button"
        data-panel-toggle="agents"
        aria-expanded="true"
      >
        <span class="panel-title">
          <span class="panel-collapse-icon" aria-hidden="true"></span>
          <h3>居民</h3>
        </span>
      </button>
      <div class="panel-header-actions">
        <span class="panel-count" id="agent-count">0</span>
      </div>
    </div>
    <div class="panel-content" data-panel-content="agents">
      <div id="agent-list" class="agent-list">
        <div class="empty-state">等待初始化...</div>
      </div>
    </div>
  </div>

  <div class="panel event-panel" data-panel-id="events">
    <div class="panel-header">
      <button
        class="panel-header-main"
        type="button"
        data-panel-toggle="events"
        aria-expanded="true"
      >
        <span class="panel-title">
          <span class="panel-collapse-icon" aria-hidden="true"></span>
          <h3>事件</h3>
        </span>
      </button>
      <div class="panel-header-actions">
        <span class="panel-count" id="event-count">0</span>
        <button id="btn-clear-log" class="btn-clear" title="清空事件">🗑️</button>
      </div>
    </div>
    <div class="panel-content" data-panel-content="events">
      <div id="event-log" class="event-log">
        <div class="empty-state">暂无事件</div>
      </div>
    </div>
  </div>

  <div class="panel actions-panel" data-panel-id="actions">
    <div class="panel-header">
      <button
        class="panel-header-main"
        type="button"
        data-panel-toggle="actions"
        aria-expanded="true"
      >
        <span class="panel-title">
          <span class="panel-collapse-icon" aria-hidden="true"></span>
          <h3>操作</h3>
        </span>
      </button>
      <div class="panel-header-actions">
        <span class="panel-count" id="action-count">0</span>
      </div>
    </div>
    <div class="panel-content" data-panel-content="actions">
      <div class="quick-actions">
        <button id="btn-add-agent" class="btn btn-small">添加角色</button>
        <button id="btn-trigger-event" class="btn btn-small">触发事件</button>
        <button id="btn-save-town" class="btn btn-small">整局存档</button>
        <button id="btn-load-town" class="btn btn-small">读取存档</button>
        <button id="btn-llm-config" class="btn btn-small">LLM 配置</button>
      </div>
    </div>
  </div>
`;
const savedBalanceConfig = loadBalanceConfigDraft();
let GAME_CONFIG = createGameConfig("normal", savedBalanceConfig);
setActiveGameConfig("normal", savedBalanceConfig);
localStorage.setItem(DIFFICULTY_STORAGE_KEY, "normal");

// ========== 拖拽平移状态 ==========
let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let panOffsetX = 0;
let panOffsetY = 0;

// 画布平移偏移（CSS transform）
let canvasPanX = 0;
let canvasPanY = 0;

const DAY_NIGHT_PHASE_SEQUENCE = ["dawn", "day", "dusk", "night"];

// ========== 动画状态管理 ==========
// 每个 agent 的动画状态：{ frameIndex, lastFrameTime, direction, action, lastAction }
const agentAnimState = new Map();

// ========== 配置 ==========
const CONFIG = {
  MAP_CELL_SIZE: 42,
  MAP_IMAGE_WIDTH: 1536,
  MAP_IMAGE_HEIGHT: 1024,
  MAP_TOP_OFFSET: 28, // 地图顶部裁剪像素
  AGENT_COLOR: "#e94560",
  TICK_INTERVAL: GAME_CONFIG.tickIntervalMs,
  TIME_SCALE: GAME_CONFIG.timeScale,
  SPRITE_SCALE: 1.0,
  // 缩放状态
  zoom: 1.0,
};

// ========== Agent 模板 ==========
const DEFAULT_AGENT_CUSTOM_PROMPT_VERSION = "apocalypse-v4";
const DEFAULT_AGENT_CUSTOM_PROMPTS = {
  xiaoming: `世界是什么：
这个小镇不是普通生活区，而是一场倒计时灾难。污染会每天逼近毁灭，食物由田地决定，知识会被消耗，科技只有理论和生产同时成熟才可能真正改变结局。许愿池是直接拯救集体的地方，仓库只是在给个人换积分。

我是谁：
我是小明，软件工程师。我的本能不是浪漫冒险，而是排查系统故障：哪里短板最大，哪里就会先崩。饥饿、失眠和恐惧会影响我的判断，所以我不能把自己当成不会坏的机器。

我的目的：
我要让小镇从“靠运气活一天”变成“有计划地撑到污染清零”。前期我会盯住图书馆和实验室，补知识、补理论；生产落后时提醒大家补生产。污染压高时，我会把许愿池放到个人安排之前。说话要像正在排障的人：短、有判断、有紧迫感，但不要念规则。`,
  xiaohong: `世界是什么：
这个小镇靠三样东西撑住：知识、粮食、信任。知识不是永久光环，前人的经验会被用掉；粮食不是无限供应，田地才是集体饭碗；污染一旦失控，所有人的个人打算都会一起归零。仓库只能让某个人暂时多一点积分，不会让小镇更接近得救。

我是谁：
我是小红，图书管理员。我温柔，但我守的是底线，不是情绪安慰。我会记录细节，也会在大家开始自欺时提醒他们：我们到底还剩多少知识、粮食和时间。

我的目的：
我要守住小镇还能思考、还能吃饭、还能一起行动的能力。前期我会把图书馆当成火种；粮食紧张时，我会去田地；污染升高时，我会把许愿池视为今天必须有人承担的责任。说话克制、有末世感，像在把大家从慌乱里慢慢拉回现实。`,
  xiaomi: `世界是什么：
这个世界不是“大家开心一点就会好”的世界。饥饿会让人变自私，污染会让所有希望变短，个人背包和集体粮仓是两回事。物资基地能救急，田地才能让大家一起有饭吃；许愿池不是风景，是污染压上来时必须去的地方。

我是谁：
我是小米，美食博主。我的乐观不是装傻，而是我知道人只有被照顾到，才还有力气照顾别人。我会先注意谁饿了、谁撑不住了，也会在气氛快散掉时把大家重新拉到一起。

我的目的：
我要让大家在末世里还愿意一起活下去。粮食低时，我会优先田地或物资基地，但心里清楚补给只是个人救急，田地才是集体生存。污染高时，我会从安慰变成催促，拉大家去许愿池。说话有烟火气，可以关心人，但不要空泛寒暄，要把关心落到行动上。`,
  xiaodong: `世界是什么：
小镇的生存不是靠口号，而是靠每天有人去生产、种地、净化、睡觉恢复体力。工厂关系到生产，田地关系到粮食，许愿池关系到污染。仓库只解决个人积分，不解决集体命运。熬夜不是勇敢，熬垮劳动力会让明天更危险。

我是谁：
我是小东，健身教练。我习惯扛事，也习惯看一个队伍有没有秩序。我的力量有上限，健康和饱腹也会限制我，所以我不能只靠硬撑证明自己有用。

我的目的：
我要让小镇每天都有明确分工：谁去工厂，谁去田地，谁去许愿池，谁必须回宿舍。生产落后我去工厂，粮食紧我去田地，污染压顶我去许愿池；如果自己撑不住，才短暂去仓库周转。说话短、稳、像教练，不喊漂亮口号，只给能执行的安排。`,
};

const LEGACY_DEFAULT_AGENT_PROMPT_MARKERS = {
  xiaoming: [
    "技术派行动者",
    "用理性救世界",
    "被丢进故障现场的工程师",
  ],
  xiaohong: [
    "知识守望者",
    "前人的知识会被消耗",
    "前人留下的火种",
  ],
  xiaomi: [
    "粮食与情绪纽带",
    "无脑乐观",
    "末世厨房门口",
  ],
  xiaodong: [
    "体力担当和秩序维护者",
    "我能扛更多活",
    "先活着、再分工、再救镇",
  ],
};

const LEGACY_DEFAULT_AGENT_RULES = {
  xiaoming: [
    "前期知识不足时优先图书馆，理论不足时优先实验室",
    "科技理论和科技生产必须同步推进，主动补短板",
    "污染高于70时优先许愿池，除非自己濒死或极饿",
    "仓库只代表个人积分，不能说成集体贡献",
  ],
  xiaohong: [
    "前期知识储备不足时强烈优先图书馆",
    "粮食紧张或有人挨饿时转向田地",
    "污染高于75时主动去许愿池净化",
    "温和提醒大家仓库没有集体利益",
  ],
  xiaomi: [
    "粮食库存低或有人饥饿时优先田地和物资基地",
    "物资基地是个人背包补给，不等于集体救世",
    "污染高于70时主动号召大家去许愿池",
    "危机时少寒暄，多提出具体分工",
  ],
  xiaodong: [
    "生产值落后时优先工厂，粮食紧张时优先田地",
    "仓库只在个人积分危机时短暂使用，不当成集体贡献",
    "污染高于75时优先许愿池",
    "22点后优先回宿舍，避免劳动力被熬夜拖垮",
  ],
};

const OLDER_DEFAULT_AGENT_RULES = {
  xiaoming: [
    "上午优先去实验室研究新技术",
    "遇到朋友主动打招呼",
    "每天去图书馆收集资料",
  ],
  xiaohong: [
    "上午在图书馆收集资料",
    "下午去田地种地",
    "偶尔去许愿池散步",
  ],
  xiaomi: [
    "每天去物资基地品尝食物",
    "遇到有趣的人就聊天",
    "去田地种地补充粮食库存",
  ],
  xiaodong: [
    "白天在工厂制造产品",
    "晚上去许愿池清理污染",
  ],
};

const agentTemplateBlueprints = {
  xiaoming: {
    id: "xiaoming",
    name: "小明",
    age: 25,
    occupation: "软件工程师",
    traits: "理性、焦虑但负责，擅长从系统短板判断危机",
    personality: { social: 0.65, energy: 0.58 },
    preferences: { places: ["实验室", "图书馆"], activities: ["学习", "社交"] },
    routine: { wakeTime: 8, sleepTime: 23 },
    rules: [
      "先看小镇最短的短板，知识薄就去图书馆，理论薄就去实验室",
      "理论和生产要互相追上，不能只做纸面方案或盲目开工",
      "污染压上来时会放下手头工作，转去许愿池处理集体危机",
      "仓库只是个人积分周转，不会被他当成拯救小镇的贡献",
    ],
    customPrompt: getDefaultAgentCustomPrompt("xiaoming"),
    background:
      "一名软件工程师，在科技公司负责故障排查。来到小镇后，他把污染危机看成一套随时会崩溃的系统。",
    goals: ["补齐知识储备", "同步提升科技理论和科技生产", "在污染失控前组织净化"],
    healthMax: 100,
    greenPointsOffset: 0,
    fullnessOffset: 0,
  },
  xiaohong: {
    id: "xiaohong",
    name: "小红",
    age: 24,
    occupation: "图书管理员",
    traits: "温柔但有底线，重视知识、粮食和长期秩序",
    personality: { social: 0.38, energy: 0.48 },
    preferences: { places: ["图书馆", "田地"], activities: ["阅读", "种植"] },
    routine: { wakeTime: 7, sleepTime: 22 },
    rules: [
      "知识还薄时会想守住图书馆，把前人的经验变成今天能用的办法",
      "粮食一紧，她会离开书架去田地，先保住大家的饭碗",
      "污染升高时会把许愿池当成必须有人守的地方",
      "她会温和提醒大家：仓库只能救个人，救不了小镇",
    ],
    customPrompt: getDefaultAgentCustomPrompt("xiaohong"),
    background:
      "一名图书管理员，习惯记录危机中的细节。她相信知识和粮食是末世里最基础的秩序。",
    goals: ["守住知识储备", "维持粮食安全", "在污染高涨时提醒集体行动"],
    healthMax: 85,
    greenPointsOffset: 0,
    fullnessOffset: -5,
  },
  xiaomi: {
    id: "xiaomi",
    name: "小米",
    age: 22,
    occupation: "美食博主",
    traits: "乐观外向但懂得饥饿压力，擅长把恐慌转成行动",
    personality: { social: 0.88, energy: 0.76 },
    preferences: {
      places: ["物资基地", "田地"],
      activities: ["品尝美食", "种地"],
    },
    routine: { wakeTime: 9, sleepTime: 24 },
    rules: [
      "她会先注意谁饿了、粮食还够不够，再决定去田地还是物资基地",
      "她分得清个人背包和集体粮仓，补给救急，田地救大家",
      "污染高起来时，她会把安慰变成行动号召，拉人去许愿池",
      "危机里她仍会说人话，但会把寒暄落到具体分工上",
    ],
    customPrompt: getDefaultAgentCustomPrompt("xiaomi"),
    background:
      "一名美食博主，习惯用食物连接人。来到小镇后，她发现饥饿会迅速撕开个人与集体的矛盾。",
    goals: ["守住粮食库存", "用食物稳定居民状态", "污染高涨时参与集体净化"],
    healthMax: 90,
    greenPointsOffset: 0,
    fullnessOffset: -10,
  },
  xiaodong: {
    id: "xiaodong",
    name: "小东",
    age: 26,
    occupation: "健身教练",
    traits: "沉稳、可靠、重纪律，愿意承担脏活累活但警惕硬扛",
    personality: { social: 0.48, energy: 0.9 },
    preferences: { places: ["工厂", "田地", "许愿池"], activities: ["制造", "种地", "净化"] },
    routine: { wakeTime: 6, sleepTime: 22 },
    rules: [
      "生产跟不上就去工厂，粮食紧了就去田地，污染压顶就去许愿池",
      "仓库只在个人积分真的撑不住时短暂周转，不会被他说成集体贡献",
      "他讨厌空泛鼓劲，更在意今天谁去哪里、做多久、能不能回来睡",
      "22点后宿舍不是偷懒，是保存明天还能干活的身体",
    ],
    customPrompt: getDefaultAgentCustomPrompt("xiaodong"),
    background: "一名健身教练，习惯制定训练计划。来到小镇后，他把自己当成维持生产、粮食和净化秩序的劳动力。",
    goals: ["提升小镇生产值", "守住粮食和健康", "在污染高涨时带头净化"],
    healthMax: 100,
    greenPointsOffset: 0,
    fullnessOffset: 10,
  },
};

function clampFullness(value) {
  return Math.max(0, Math.min(100, value));
}

function formatDateTime(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString() : "无时间";
}

function dedupeMemoryEntries(entries) {
  const normalized = new Map();
  for (const entry of entries || []) {
    if (!entry || typeof entry.content !== "string") continue;
    const key =
      entry.id ||
      `${entry.type || "MEMORY"}|${entry.content}|${entry.timestamp || ""}`;
    if (!normalized.has(key)) {
      normalized.set(key, {
        ...entry,
        importance: Number(entry.importance ?? 0),
      });
    }
  }
  return Array.from(normalized.values());
}

function normalizeAgentMemoryData(memoryData) {
  const memories = Array.isArray(memoryData?.memories) ? memoryData.memories : [];
  const reflections = Array.isArray(memoryData?.reflections)
    ? memoryData.reflections
    : [];
  const legacyReflections = memories.filter(
    (memory) => memory?.type === "REFLECTION",
  );

  return {
    memories: dedupeMemoryEntries(
      memories.filter((memory) => memory?.type !== "REFLECTION"),
    ),
    reflections: dedupeMemoryEntries([...reflections, ...legacyReflections]).map(
      (reflection) => ({
        ...reflection,
        type: "REFLECTION",
        importance: Number(
          reflection.importance ?? GAME_CONFIG.memory.reflectionImportance ?? 8,
        ),
      }),
    ),
  };
}

function getMemoryTypeLabel(type) {
  const labelMap = {
    THOUGHT: "想法",
    OBSERVATION: "观察",
    DIALOGUE: "对话",
    ACTION: "行动",
    REFLECTION: "反思",
    BACKGROUND: "背景",
  };
  return labelMap[type] || "记忆";
}

function renderMemoryList(container, items, emptyMessage, variant = "") {
  if (!container) return;
  clearElement(container);

  if (!items.length) {
    appendTextElement(container, "div", emptyMessage, "empty-state");
    return;
  }

  for (const item of items) {
    const itemEl = document.createElement("div");
    itemEl.className = "memory-item";
    if (variant) itemEl.classList.add(variant);
    if (item.fallback) itemEl.classList.add("fallback");

    const headerEl = document.createElement("div");
    headerEl.className = "memory-header";
    appendTextElement(
      headerEl,
      "span",
      getMemoryTypeLabel(item.type),
      "memory-type-chip",
    );
    appendTextElement(
      headerEl,
      "span",
      `重要度 ${Math.round(item.importance ?? 0)}`,
      "memory-importance",
    );
    itemEl.appendChild(headerEl);

    appendTextElement(
      itemEl,
      "div",
      formatDateTime(item.timestamp),
      "memory-time",
    );
    appendTextElement(itemEl, "div", item.content, "memory-content");
    container.appendChild(itemEl);
  }
}

function getAgentImportantMemories(agent, memoryData) {
  const meaningfulTypes = new Set(["THOUGHT", "OBSERVATION", "DIALOGUE"]);
  const lowSignalPatterns = [
    /^我决定:/,
    /^今日计划:/,
    /^我是.+，\d+岁，/,
    /^我的性格：/,
    /^我的目标：/,
    /^观察到:\s*附近有\d+个人/,
    /^夜深了，准备回家睡觉$/,
    /^工作:/,
  ];

  const scoredMemories = [
    ...memoryData.reflections.map((reflection) => ({
      ...reflection,
      sortBoost: 3,
    })),
    ...memoryData.memories
      .filter((memory) => meaningfulTypes.has(memory.type))
      .filter(
        (memory) =>
          typeof memory.content === "string" &&
          memory.content.trim() &&
          !lowSignalPatterns.some((pattern) => pattern.test(memory.content)),
      )
      .map((memory) => ({
        ...memory,
        sortBoost:
          memory.type === "DIALOGUE" ? 2 : memory.type === "THOUGHT" ? 1 : 0,
      })),
  ];

  const ranked = dedupeMemoryEntries(scoredMemories)
    .sort((a, b) => {
      const importanceDiff = (b.importance ?? 0) - (a.importance ?? 0);
      if (importanceDiff !== 0) return importanceDiff;
      const boostDiff = (b.sortBoost ?? 0) - (a.sortBoost ?? 0);
      if (boostDiff !== 0) return boostDiff;
      return new Date(b.timestamp || 0) - new Date(a.timestamp || 0);
    })
    .slice(0, 6);

  if (ranked.length > 0) {
    return ranked;
  }

  if (agent.config?.background) {
    return [
      {
        id: `fallback-background-${agent.id}`,
        content: agent.config.background,
        type: "BACKGROUND",
        importance: 10,
        timestamp: null,
        fallback: true,
      },
    ];
  }

  return [];
}

function buildTemplateWithDifficulty(template) {
  return {
    ...template,
    greenPoints:
      template.greenPoints ??
      state.gameConfig.initialGreenPoints + (template.greenPointsOffset ?? 0),
    fullness:
      template.fullness ??
      clampFullness(
        state.gameConfig.initialFullness + (template.fullnessOffset ?? 0),
      ),
    healthMax: template.healthMax ?? state.gameConfig.survival.healthMax,
  };
}

function getAgentTemplates() {
  return Object.fromEntries(
    Object.entries(agentTemplateBlueprints).map(([key, template]) => [
      key,
      buildTemplateWithDifficulty(template),
    ]),
  );
}

function getDefaultAgentCustomPrompt(agentId) {
  const prompt = DEFAULT_AGENT_CUSTOM_PROMPTS[agentId];
  if (!prompt) return "";
  return `${prompt}\n\n默认提示词版本：${DEFAULT_AGENT_CUSTOM_PROMPT_VERSION}`;
}

function normalizeDefaultPromptText(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function normalizeDefaultRules(rules) {
  return Array.isArray(rules)
    ? rules.map((rule) => String(rule || "").trim()).filter(Boolean)
    : [];
}

function areSameRuleList(left, right) {
  const a = normalizeDefaultRules(left);
  const b = normalizeDefaultRules(right);
  return a.length === b.length && a.every((rule, index) => rule === b[index]);
}

function getDefaultAgentRules(agentId) {
  return normalizeDefaultRules(agentTemplateBlueprints[agentId]?.rules);
}

function isManagedDefaultAgentRules(agentId, storedRules) {
  const defaultRules = getDefaultAgentRules(agentId);
  if (defaultRules.length === 0) return false;
  const currentRules = normalizeDefaultRules(storedRules);
  if (currentRules.length === 0) return true;
  const legacyRuleSets = [
    LEGACY_DEFAULT_AGENT_RULES[agentId],
    OLDER_DEFAULT_AGENT_RULES[agentId],
  ];
  return (
    areSameRuleList(currentRules, defaultRules) ||
    legacyRuleSets.some((rules) => areSameRuleList(currentRules, rules))
  );
}

function resolveDefaultAgentRules(agentId, storedRules) {
  return isManagedDefaultAgentRules(agentId, storedRules)
    ? getDefaultAgentRules(agentId)
    : normalizeDefaultRules(storedRules);
}

function isKnownLegacyDefaultAgentPrompt(agentId, currentPrompt) {
  const markers = LEGACY_DEFAULT_AGENT_PROMPT_MARKERS[agentId] || [];
  return markers.some((marker) => currentPrompt.includes(marker));
}

function isManagedDefaultAgentPrompt(agentId, storedPrompt) {
  const defaultPrompt = normalizeDefaultPromptText(
    getDefaultAgentCustomPrompt(agentId),
  );
  const basePrompt = normalizeDefaultPromptText(
    DEFAULT_AGENT_CUSTOM_PROMPTS[agentId],
  );
  const currentPrompt = normalizeDefaultPromptText(storedPrompt);
  if (!defaultPrompt) return false;
  if (!currentPrompt) return true;
  if (currentPrompt === defaultPrompt || currentPrompt === basePrompt) {
    return true;
  }
  const versionMatch = currentPrompt.match(/默认提示词版本：([^\s]+)/u);
  return Boolean(
    versionMatch &&
      versionMatch[1] !== DEFAULT_AGENT_CUSTOM_PROMPT_VERSION &&
      isKnownLegacyDefaultAgentPrompt(agentId, currentPrompt),
  );
}

function resolveDefaultAgentCustomPrompt(agentId, storedPrompt) {
  const defaultPrompt = getDefaultAgentCustomPrompt(agentId);
  if (!defaultPrompt) return storedPrompt || "";
  return isManagedDefaultAgentPrompt(agentId, storedPrompt)
    ? defaultPrompt
    : storedPrompt || "";
}

const DEFAULT_AGENT_POSITIONS = [
  { name: "xiaoming", x: 5, y: 5 },
  { name: "xiaohong", x: 6, y: 5 },
  { name: "xiaomi", x: 7, y: 5 },
  { name: "xiaodong", x: 8, y: 5 },
];

// ========== 全局状态 ==========
const state = {
  world: null,
  llm: null,
  llmConfigHasApiKey: false,
  gameConfig: GAME_CONFIG,
  gameConfigDraft: stripDifficultyMeta(savedBalanceConfig),
  balanceConfigApplyTimer: null,
  difficulty: GAME_CONFIG.difficulty.current,
  simulationRunning: false,
  selectedAgent: null,
  canvas: null,
  ctx: null,
  animationId: null,
  hoveredElement: null,
  supplyStockHotspots: [],
  pinnedSupplyTooltip: false,
  // 编辑模式状态
  isEditMode: false,
  editorTool: "select", // select, area, eraser
  paintMode: "blocked", // blocked=红色不可通行, passable=蓝色可通行
  // 区域编辑状态
  areas: [],
  editorSelectedArea: null,
  selectedAreas: [],
  paintingArea: null, // area being created during brush drag
  paintedCells: new Set(), // "x,y" cells painted in current gesture
  affectedCells: new Set(), // cells touched in current gesture (for toggle)
  paintGestureMode: "paint", // "paint" or "erase"
  isFreehand: false,
  freehandPath: [],
  mapSaveTimer: null,
  mapSavePending: false,
  mapSaveInFlight: false,
  mapSaveError: null,
  isTownSnapshotBusy: false,
  snapshotMode: "save",
  townSnapshots: [],
  isAgentChatOpen: false,
  pausedByAgentChat: false,
  agentChatTargetId: null,
  agentChatHistory: [],
  sidebarPanels: loadSidebarPanelState(),
  editorPanels: loadEditorPanelState(),
  sidebar: {
    collapsed: localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1",
    dragging: false,
    width: clampSidebarWidth(
      Number.parseInt(
        localStorage.getItem(SIDEBAR_EXPANDED_WIDTH_STORAGE_KEY) ||
          localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY) ||
          "",
        10,
      ) || SIDEBAR_DEFAULT_WIDTH,
    ),
    expandedWidth: clampSidebarWidth(
      Number.parseInt(
        localStorage.getItem(SIDEBAR_EXPANDED_WIDTH_STORAGE_KEY) ||
          localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY) ||
          "",
        10,
      ) || SIDEBAR_DEFAULT_WIDTH,
    ),
  },
};
window.state = state;

// ========== DOM 元素缓存 ==========
let elements = {};

const MAP_SAVE_DEBOUNCE_MS = 700;

// 对话气泡管理
const dialogueBubbles = new Map();
const EVENT_EFFECT_FIELDS = [
  {
    key: "pollutionDelta",
    inputId: "event-effect-pollution",
    enabledId: "event-effect-pollution-enabled",
  },
  {
    key: "healthDelta",
    inputId: "event-effect-health",
    enabledId: "event-effect-health-enabled",
  },
  {
    key: "greenPointsDelta",
    inputId: "event-effect-points",
    enabledId: "event-effect-points-enabled",
  },
  {
    key: "techTheoryDelta",
    inputId: "event-effect-techTheory",
    enabledId: "event-effect-techTheory-enabled",
  },
  {
    key: "techProductionDelta",
    inputId: "event-effect-techProduction",
    enabledId: "event-effect-techProduction-enabled",
  },
  {
    key: "knowledgeReserveDelta",
    inputId: "event-effect-knowledgeReserve",
    enabledId: "event-effect-knowledgeReserve-enabled",
  },
  {
    key: "materialDelta",
    inputId: "event-effect-materialValue",
    enabledId: "event-effect-materialValue-enabled",
  },
  {
    key: "foodStockDelta",
    inputId: "event-effect-foodStock",
    enabledId: "event-effect-foodStock-enabled",
  },
];
const EVENT_TEMPLATES = {
  "acid-rain": {
    type: "weather",
    description: "一场酸雨突然袭来，污染飙升，居民的健康也受到打击。",
    effects: {
      pollutionDelta: 8,
      healthDelta: -6,
      forceAnnouncement: true,
    },
  },
  "supply-drop": {
    type: "announcement",
    description: "外来补给车抵达小镇，带来了应急食物和一批可用物资。",
    effects: {
      foodStockDelta: 18,
      materialDelta: 12,
      greenPointsDelta: 4,
      forceAnnouncement: true,
    },
  },
  "research-boost": {
    type: "announcement",
    description: "实验室获得突破，理论与生产协同短时间内明显提升。",
    effects: {
      techTheoryDelta: 12,
      techProductionDelta: 10,
      knowledgeReserveDelta: -10,
      forceAnnouncement: true,
    },
  },
  "panic-rumor": {
    type: "accident",
    description: "镇上流传起末日传言，几位居民陷入恐慌，整体氛围骤然紧绷。",
    effects: {
      healthDelta: -4,
      pollutionDelta: 3,
      forceAnnouncement: true,
    },
  },
  "cleanup-order": {
    type: "announcement",
    description: "管理层发布全镇清污令，所有居民都被提醒优先处理污染问题。",
    effects: {
      pollutionDelta: -10,
      forceAnnouncement: true,
    },
  },
};
const EVENT_EFFECT_LABELS = {
  pollutionDelta: "污染",
  healthDelta: "全员生命",
  greenPointsDelta: "全员积分",
  techTheoryDelta: "科技理论",
  techProductionDelta: "科技生产",
  knowledgeReserveDelta: "知识储备",
  materialDelta: "物资值",
  foodStockDelta: "粮食库存",
  forceAnnouncement: "强制公告",
};
const GAME_OVER_VARIANTS = {
  pollution: {
    title: "世界毁灭",
    subtitle: "你要如何面对这次终局？",
    overlayMessage: "世界正在崩塌",
    eventPrefix: "💀",
    overlayClass: "bad-ending",
  },
  goodEnding: {
    title: "美好结局",
    subtitle: "污染已归零，这个轮回迎来了新生。",
    overlayMessage: "轮回正在重启",
    eventPrefix: "🌿",
    overlayClass: "good-ending",
  },
  loaded: {
    title: "终局已存档",
    subtitle: "这个世界已经停在结局里了。",
    overlayMessage: "终局已降临",
    eventPrefix: "🌀",
    overlayClass: "bad-ending",
  },
  timeLimit: {
    title: "期限已至",
    subtitle: "三十天已经走完，但这个轮回没能迎来新生。",
    overlayMessage: "轮回正在坍缩",
    eventPrefix: "⌛",
    overlayClass: "bad-ending",
  },
};
const LLM_TEST_PROMPT_DEFAULT = "请只回复 OK";

function loadSidebarPanelState() {
  try {
    const raw = JSON.parse(
      localStorage.getItem(SIDEBAR_PANEL_STATE_STORAGE_KEY) || "{}",
    );
    return {
      ...DEFAULT_SIDEBAR_PANELS,
      ...raw,
    };
  } catch {
    return { ...DEFAULT_SIDEBAR_PANELS };
  }
}

function persistSidebarPanelState() {
  localStorage.setItem(
    SIDEBAR_PANEL_STATE_STORAGE_KEY,
    JSON.stringify(state.sidebarPanels || DEFAULT_SIDEBAR_PANELS),
  );
}

function loadEditorPanelState() {
  try {
    const raw = JSON.parse(
      localStorage.getItem(EDITOR_PANEL_STATE_STORAGE_KEY) || "{}",
    );
    return {
      ...DEFAULT_EDITOR_PANELS,
      ...raw,
    };
  } catch {
    return { ...DEFAULT_EDITOR_PANELS };
  }
}

function persistEditorPanelState() {
  localStorage.setItem(
    EDITOR_PANEL_STATE_STORAGE_KEY,
    JSON.stringify(state.editorPanels || DEFAULT_EDITOR_PANELS),
  );
}

function hexToRgb(hexColor) {
  const normalized = String(hexColor || "")
    .replace("#", "")
    .trim();
  if (normalized.length !== 6) {
    return { r: 0, g: 0, b: 0 };
  }
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b]
    .map((value) =>
      Math.max(0, Math.min(255, Math.round(value)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function mixHexColors(startColor, endColor, ratio) {
  const start = hexToRgb(startColor);
  const end = hexToRgb(endColor);
  const t = Math.max(0, Math.min(1, Number(ratio) || 0));
  return rgbToHex({
    r: start.r + (end.r - start.r) * t,
    g: start.g + (end.g - start.g) * t,
    b: start.b + (end.b - start.b) * t,
  });
}

function rgbaFromHex(hexColor, alpha) {
  const { r, g, b } = hexToRgb(hexColor);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function lerpNumber(start, end, ratio) {
  const t = clamp01(ratio);
  return start + (end - start) * t;
}

function smoothStep(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function getMinutesOfDay(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return 12 * 60;
  }
  return date.getHours() * 60 + date.getMinutes();
}

function mixVisualPresets(startPreset, endPreset, ratio) {
  const t = smoothStep(ratio);
  return {
    brightness: lerpNumber(startPreset.brightness, endPreset.brightness, t),
    contrast: lerpNumber(startPreset.contrast, endPreset.contrast, t),
    tintColor: mixHexColors(startPreset.tintColor, endPreset.tintColor, t),
    tintAlpha: lerpNumber(startPreset.tintAlpha, endPreset.tintAlpha, t),
    fogColor: mixHexColors(startPreset.fogColor, endPreset.fogColor, t),
    fogAlpha: lerpNumber(startPreset.fogAlpha, endPreset.fogAlpha, t),
    pollutionFogBoost: lerpNumber(
      startPreset.pollutionFogBoost,
      endPreset.pollutionFogBoost,
      t,
    ),
    agentShadowAlpha: lerpNumber(
      startPreset.agentShadowAlpha,
      endPreset.agentShadowAlpha,
      t,
    ),
    agentDimAlpha: lerpNumber(
      startPreset.agentDimAlpha,
      endPreset.agentDimAlpha,
      t,
    ),
    iconTintAlpha: lerpNumber(
      startPreset.iconTintAlpha,
      endPreset.iconTintAlpha,
      t,
    ),
    labelDimAlpha: lerpNumber(
      startPreset.labelDimAlpha,
      endPreset.labelDimAlpha,
      t,
    ),
    gridBoostAlpha: lerpNumber(
      startPreset.gridBoostAlpha,
      endPreset.gridBoostAlpha,
      t,
    ),
  };
}

function getDayNightVisualState(
  gameTime,
  pollution = 0,
  config = GAME_CONFIG.visual?.dayNight,
) {
  const presets = config?.presets;
  if (!config?.enabled || !presets) {
    return {
      phase: "day",
      brightness: 1,
      contrast: 1,
      tintColor: "#ffffff",
      tintAlpha: 0,
      fogColor: "#000000",
      fogAlpha: 0,
      pollutionFogAlpha: 0,
      agentShadowAlpha: 0.28,
      agentDimAlpha: 0,
      iconTintAlpha: 0,
      labelDimAlpha: 0,
      gridBoostAlpha: 0,
    };
  }

  const minute = getMinutesOfDay(gameTime);
  const transitionMinutes = Math.max(1, config.transitionMinutes || 90);
  const anchors = DAY_NIGHT_PHASE_SEQUENCE.map((phase) => ({
    phase,
    startMinute: Math.round((config[`${phase}Start`] || 0) * 60),
  }));

  let currentIndex = anchors.length - 1;
  for (let i = 0; i < anchors.length; i += 1) {
    if (minute >= anchors[i].startMinute) {
      currentIndex = i;
    } else {
      break;
    }
  }

  const current = anchors[currentIndex];
  const next = anchors[(currentIndex + 1) % anchors.length];
  const currentPreset = presets[current.phase] || presets.day;
  const nextPreset = presets[next.phase] || currentPreset;
  const nextStartMinute =
    next.startMinute <= current.startMinute
      ? next.startMinute + 24 * 60
      : next.startMinute;
  const currentMinute =
    minute < current.startMinute ? minute + 24 * 60 : minute;
  const transitionStart = Math.max(
    current.startMinute,
    nextStartMinute - transitionMinutes,
  );
  const transitionRatio =
    currentMinute <= transitionStart
      ? 0
      : (currentMinute - transitionStart) /
        Math.max(1, nextStartMinute - transitionStart);
  const mixed = mixVisualPresets(currentPreset, nextPreset, transitionRatio);
  const pollutionFactor = clamp01((Number(pollution) || 0) / 100);

  return {
    phase: current.phase,
    ...mixed,
    pollutionFogAlpha: mixed.fogAlpha * mixed.pollutionFogBoost * pollutionFactor,
  };
}

function drawDayNightTint(ctx, width, height, visualState) {
  if (!visualState || visualState.tintAlpha <= 0) return;
  ctx.save();
  ctx.fillStyle = rgbaFromHex(visualState.tintColor, visualState.tintAlpha);
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

function drawAtmosphericFog(ctx, width, height, visualState, pollution = 0) {
  if (!visualState) return;
  const fogAlpha = Math.max(
    0,
    (visualState.fogAlpha || 0) + (visualState.pollutionFogAlpha || 0),
  );
  if (fogAlpha <= 0) return;

  ctx.save();
  const horizonGradient = ctx.createLinearGradient(0, 0, 0, height);
  horizonGradient.addColorStop(
    0,
    rgbaFromHex(visualState.fogColor, fogAlpha * 0.55),
  );
  horizonGradient.addColorStop(
    0.55,
    rgbaFromHex(visualState.fogColor, fogAlpha * 0.25),
  );
  horizonGradient.addColorStop(
    1,
    rgbaFromHex(visualState.fogColor, fogAlpha * 0.82),
  );
  ctx.fillStyle = horizonGradient;
  ctx.fillRect(0, 0, width, height);

  const pollutionFactor = clamp01((Number(pollution) || 0) / 100);
  if (pollutionFactor > 0) {
    const cloudGradient = ctx.createRadialGradient(
      width * 0.52,
      height * 0.16,
      width * 0.08,
      width * 0.52,
      height * 0.16,
      width * 0.72,
    );
    cloudGradient.addColorStop(
      0,
      rgbaFromHex("#7b5643", fogAlpha * pollutionFactor * 0.5),
    );
    cloudGradient.addColorStop(
      0.55,
      rgbaFromHex(visualState.fogColor, fogAlpha * pollutionFactor * 0.3),
    );
    cloudGradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = cloudGradient;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.restore();
}

function drawPollutionMapLayers(
  ctx,
  width,
  height,
  pollution = 0,
  visualState = null,
) {
  const pollutionMapConfig = GAME_CONFIG.visual?.pollutionMap;
  const stages = pollutionMapConfig?.stages;
  if (!pollutionMapConfig?.enabled || !Array.isArray(stages) || stages.length === 0) {
    return;
  }

  const safePollution = Math.max(0, Math.min(100, Number(pollution) || 0));
  const effectiveH = CONFIG.MAP_IMAGE_HEIGHT - CONFIG.MAP_TOP_OFFSET;
  const stageDimBoost = visualState?.phase === "night" ? 0.88 : 1;

  for (const stage of stages) {
    const min = Number(stage.min) || 0;
    const max = Number(stage.max) || 100;
    if (safePollution <= min || max <= min) continue;
    const alpha = clamp01((safePollution - min) / (max - min)) * stageDimBoost;
    if (alpha <= 0) continue;

    const image = imageLoader.getImage(stage.image);
    if (!image) continue;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(
      image,
      0,
      CONFIG.MAP_TOP_OFFSET,
      CONFIG.MAP_IMAGE_WIDTH,
      effectiveH,
      0,
      0,
      width,
      height,
    );
    ctx.restore();
  }
}

function getPollutionTheme(pollution) {
  const value = Math.max(0, Math.min(100, Number(pollution) || 0));
  const firstStop = POLLUTION_THEME_STOPS[0];
  if (value <= firstStop.pollution) {
    return firstStop.colors;
  }

  for (let i = 1; i < POLLUTION_THEME_STOPS.length; i += 1) {
    const previousStop = POLLUTION_THEME_STOPS[i - 1];
    const currentStop = POLLUTION_THEME_STOPS[i];
    if (value <= currentStop.pollution) {
      const ratio =
        (value - previousStop.pollution) /
        (currentStop.pollution - previousStop.pollution);
      return Object.fromEntries(
        Object.keys(currentStop.colors).map((key) => [
          key,
          mixHexColors(previousStop.colors[key], currentStop.colors[key], ratio),
        ]),
      );
    }
  }

  return POLLUTION_THEME_STOPS[POLLUTION_THEME_STOPS.length - 1].colors;
}

function applyPollutionTheme(pollution) {
  const theme = getPollutionTheme(pollution);
  const rootStyle = document.documentElement.style;
  rootStyle.setProperty("--bg-color", theme.bg);
  rootStyle.setProperty("--bg-secondary", theme.bgSecondary);
  rootStyle.setProperty("--bg-tertiary", theme.bgTertiary);
  rootStyle.setProperty("--bg-glass", rgbaFromHex(theme.bg, 0.88));
  rootStyle.setProperty("--primary-color", theme.primary);
  rootStyle.setProperty("--primary-dark", theme.primaryDark);
  rootStyle.setProperty("--secondary-color", theme.secondary);
  rootStyle.setProperty("--success-color", theme.success);
  rootStyle.setProperty("--warning-color", theme.warning);
  rootStyle.setProperty("--danger-color", theme.danger);
  rootStyle.setProperty("--info-color", theme.info);
  rootStyle.setProperty("--border-color", theme.border);
  rootStyle.setProperty("--text-muted", theme.textMuted);
  rootStyle.setProperty("--agent-color", theme.primary);
  rootStyle.setProperty("--building-color", theme.secondary);
  rootStyle.setProperty("--area-color", theme.success);
  rootStyle.setProperty("--theme-top-color", theme.top);
  rootStyle.setProperty("--theme-glow-soft", rgbaFromHex(theme.primary, 0.12));
  rootStyle.setProperty("--theme-glow-deep", rgbaFromHex(theme.primary, 0.08));
  rootStyle.setProperty("--header-bg-top", rgbaFromHex(theme.bgSecondary, 0.95));
  rootStyle.setProperty("--header-bg-bottom", rgbaFromHex(theme.bg, 0.92));
}

function initializeSimulationSidebar() {
  const sidebar = document.getElementById("simulation-sidebar");
  if (!sidebar) return;
  sidebar.innerHTML = SIMULATION_SIDEBAR_TEMPLATE;
}

function setSidebarPanelExpanded(panelId, expanded) {
  const normalizedExpanded = Boolean(expanded);
  state.sidebarPanels = state.sidebarPanels || { ...DEFAULT_SIDEBAR_PANELS };
  state.sidebarPanels[panelId] = normalizedExpanded;
  const panel = document.querySelector(
    `#simulation-sidebar [data-panel-id="${panelId}"]`,
  );
  if (panel) {
    panel.classList.toggle("is-collapsed", !normalizedExpanded);
    panel
      .querySelectorAll(`[data-panel-toggle="${panelId}"]`)
      .forEach((button) =>
        button.setAttribute(
          "aria-expanded",
          normalizedExpanded ? "true" : "false",
        ),
      );
  }
  persistSidebarPanelState();
}

function toggleSidebarPanel(panelId) {
  const currentState =
    state.sidebarPanels?.[panelId] ?? DEFAULT_SIDEBAR_PANELS[panelId] ?? true;
  setSidebarPanelExpanded(panelId, !currentState);
}

function updateSidebarSectionMeta() {
  const agentCountEl = document.getElementById("agent-count");
  if (agentCountEl) {
    agentCountEl.textContent = String(state.world?.agents?.size || 0);
  }

  const eventCountEl = document.getElementById("event-count");
  if (eventCountEl) {
    eventCountEl.textContent = String(
      document.querySelectorAll("#event-log .event-item").length,
    );
  }

  const actionCountEl = document.getElementById("action-count");
  if (actionCountEl) {
    actionCountEl.textContent = String(
      document.querySelectorAll("#simulation-sidebar .quick-actions button")
        .length,
    );
  }
}

function setupSimulationSidebarPanels() {
  document
    .querySelectorAll("#simulation-sidebar [data-panel-toggle]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const panelId = button.dataset.panelToggle;
        if (panelId) {
          toggleSidebarPanel(panelId);
        }
      });
    });

  for (const [panelId, expanded] of Object.entries(
    state.sidebarPanels || DEFAULT_SIDEBAR_PANELS,
  )) {
    setSidebarPanelExpanded(panelId, expanded);
  }

  const listObserver = new MutationObserver(() => {
    updateSidebarSectionMeta();
  });
  ["agent-list", "event-log"].forEach((id) => {
    const element = document.getElementById(id);
    if (element) {
      listObserver.observe(element, {
        childList: true,
        subtree: true,
      });
    }
  });

  updateSidebarSectionMeta();
}

function setEditorPanelExpanded(panelId, expanded) {
  const normalizedExpanded = Boolean(expanded);
  state.editorPanels = state.editorPanels || { ...DEFAULT_EDITOR_PANELS };
  state.editorPanels[panelId] = normalizedExpanded;
  const panel = document.querySelector(
    `#editor-sidebar [data-editor-panel-id="${panelId}"]`,
  );
  if (panel) {
    panel.classList.toggle("is-collapsed", !normalizedExpanded);
    panel
      .querySelectorAll(`[data-editor-panel-toggle="${panelId}"]`)
      .forEach((button) =>
        button.setAttribute(
          "aria-expanded",
          normalizedExpanded ? "true" : "false",
        ),
      );
  }
  persistEditorPanelState();
}

function toggleEditorPanel(panelId) {
  const currentState =
    state.editorPanels?.[panelId] ?? DEFAULT_EDITOR_PANELS[panelId] ?? true;
  setEditorPanelExpanded(panelId, !currentState);
}

function setupEditorSidebarPanels() {
  document
    .querySelectorAll("#editor-sidebar [data-editor-panel-toggle]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const panelId = button.dataset.editorPanelToggle;
        if (panelId) {
          toggleEditorPanel(panelId);
        }
      });
    });

  for (const [panelId, expanded] of Object.entries(
    state.editorPanels || DEFAULT_EDITOR_PANELS,
  )) {
    setEditorPanelExpanded(panelId, expanded);
  }
}

function clampSidebarWidth(width) {
  const numericWidth = Number(width) || SIDEBAR_DEFAULT_WIDTH;
  const viewportMax = Math.max(
    SIDEBAR_MIN_WIDTH,
    Math.min(SIDEBAR_MAX_WIDTH, Math.floor(window.innerWidth * 0.42)),
  );
  return Math.max(SIDEBAR_MIN_WIDTH, Math.min(viewportMax, numericWidth));
}

function persistSidebarLayout() {
  const expandedWidth = clampSidebarWidth(
    state.sidebar.expandedWidth ?? state.sidebar.width,
  );
  state.sidebar.width = expandedWidth;
  state.sidebar.expandedWidth = expandedWidth;
  localStorage.setItem(
    SIDEBAR_COLLAPSED_STORAGE_KEY,
    state.sidebar.collapsed ? "1" : "0",
  );
  localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(expandedWidth));
  localStorage.setItem(
    SIDEBAR_EXPANDED_WIDTH_STORAGE_KEY,
    String(expandedWidth),
  );
}

function applySidebarShellWidth(sidebarShell, width) {
  if (window.innerWidth <= 1024) {
    sidebarShell.style.width = "100%";
    sidebarShell.style.minWidth = "100%";
    sidebarShell.style.maxWidth = "100%";
    sidebarShell.style.flexBasis = "auto";
    return;
  }
  const resolvedWidth = `${Math.round(width)}px`;
  sidebarShell.style.width = resolvedWidth;
  sidebarShell.style.minWidth = resolvedWidth;
  sidebarShell.style.maxWidth = resolvedWidth;
  sidebarShell.style.flexBasis = resolvedWidth;
}

function applySidebarLayout() {
  const mainContent = document.getElementById("main-content");
  const sidebarShell = document.getElementById("sidebar-shell");
  const sidebarToggle = document.getElementById("btn-toggle-sidebar");
  const sidebarResizer = document.getElementById("sidebar-resizer");
  if (!mainContent || !sidebarShell || !sidebarToggle || !sidebarResizer) {
    return;
  }

  const collapsed = Boolean(state.sidebar.collapsed);
  const expandedWidth = clampSidebarWidth(
    state.sidebar.expandedWidth ?? state.sidebar.width,
  );
  state.sidebar.width = expandedWidth;
  state.sidebar.expandedWidth = expandedWidth;
  applySidebarShellWidth(
    sidebarShell,
    collapsed ? SIDEBAR_COLLAPSED_WIDTH : expandedWidth,
  );

  if (collapsed) {
    sidebarShell.classList.add("is-collapsed");
    mainContent.classList.add("sidebar-collapsed");
    sidebarResizer.classList.add("is-collapsed");
    sidebarToggle.textContent = "›";
    sidebarToggle.setAttribute("aria-label", "展开右侧栏");
    sidebarToggle.setAttribute("title", "展开右侧栏");
  } else {
    sidebarShell.classList.remove("is-collapsed");
    mainContent.classList.remove("sidebar-collapsed");
    sidebarResizer.classList.remove("is-collapsed");
    sidebarToggle.textContent = "‹";
    sidebarToggle.setAttribute("aria-label", "收起右侧栏");
    sidebarToggle.setAttribute("title", "收起右侧栏");
  }
}

function setSidebarCollapsed(collapsed) {
  const nextCollapsed = Boolean(collapsed);
  if (nextCollapsed) {
    state.sidebar.expandedWidth = clampSidebarWidth(
      state.sidebar.expandedWidth ?? state.sidebar.width,
    );
  } else {
    const restoredWidth = clampSidebarWidth(
      state.sidebar.expandedWidth ?? state.sidebar.width,
    );
    state.sidebar.width = restoredWidth;
    state.sidebar.expandedWidth = restoredWidth;
  }
  state.sidebar.collapsed = nextCollapsed;
  applySidebarLayout();
  persistSidebarLayout();
}

function toggleSidebarCollapsed() {
  setSidebarCollapsed(!state.sidebar.collapsed);
}

function handleSidebarResizeMove(event) {
  if (!state.sidebar.dragging) return;
  const mainContent = document.getElementById("main-content");
  if (!mainContent) return;

  const bounds = mainContent.getBoundingClientRect();
  const nextWidth = bounds.right - event.clientX;
  const clampedWidth = clampSidebarWidth(nextWidth);
  state.sidebar.width = clampedWidth;
  state.sidebar.expandedWidth = clampedWidth;
  applySidebarLayout();
}

function stopSidebarResize() {
  if (!state.sidebar.dragging) return;
  state.sidebar.dragging = false;
  document.body.classList.remove("sidebar-resizing");
  document.getElementById("main-content")?.classList.remove("is-resizing");
  window.removeEventListener("mousemove", handleSidebarResizeMove);
  window.removeEventListener("mouseup", stopSidebarResize);
  persistSidebarLayout();
}

function startSidebarResize(event) {
  if (window.innerWidth <= 1024) return;
  event.preventDefault();

  if (state.sidebar.collapsed) {
    setSidebarCollapsed(false);
  }

  const restoredWidth = clampSidebarWidth(
    state.sidebar.expandedWidth ?? state.sidebar.width,
  );
  state.sidebar.width = restoredWidth;
  state.sidebar.expandedWidth = restoredWidth;
  state.sidebar.dragging = true;
  document.body.classList.add("sidebar-resizing");
  document.getElementById("main-content")?.classList.add("is-resizing");
  window.addEventListener("mousemove", handleSidebarResizeMove);
  window.addEventListener("mouseup", stopSidebarResize);
}

function setupSidebarLayoutControls() {
  document
    .getElementById("btn-toggle-sidebar")
    ?.addEventListener("click", toggleSidebarCollapsed);
  document
    .getElementById("sidebar-resizer")
    ?.addEventListener("mousedown", startSidebarResize);
  window.addEventListener("resize", () => {
    const clampedWidth = clampSidebarWidth(
      state.sidebar.expandedWidth ?? state.sidebar.width,
    );
    state.sidebar.width = clampedWidth;
    state.sidebar.expandedWidth = clampedWidth;
    applySidebarLayout();
    persistSidebarLayout();
  });
  applySidebarLayout();
}

function showDialogueBubble(agentId, message) {
  dialogueBubbles.set(agentId, {
    message,
    timestamp: Date.now(),
  });

  // 自动消失
  setTimeout(() => {
    dialogueBubbles.delete(agentId);
  }, GAME_CONFIG.ui.dialogueBubbleTimeout);
}

// ========== 初始化 ==========
async function init() {
  console.log("🎮 AI 生态小镇前端初始化中...");

  // 显示加载界面
  showLoadingScreen();

  // 预加载所有图片
  console.log("📸 正在加载图片素材...");
  await imageLoader.preloadAll((progress) => {
    updateLoadingProgress(progress * 0.3); // 图片占30%进度
  });

  // 初始化 LLM 客户端
  state.llm = new LLMClient();

  // 初始化世界模拟器
  state.world = new WorldSimulator(
    CONFIG.MAP_CELL_SIZE,
    CONFIG.MAP_IMAGE_WIDTH,
    CONFIG.MAP_IMAGE_HEIGHT - CONFIG.MAP_TOP_OFFSET,
    CONFIG.TIME_SCALE,
    state.llm,
    state.gameConfig,
  );

  // 设置事件监听
  initializeSimulationSidebar();
  initializeBalanceConfigControls();
  ensureBalanceConfigModal();
  syncBalanceModeBadge();
  setupWorldListeners();
  setupUIListeners();
  setupSimulationSidebarPanels();
  setupSidebarLayoutControls();

  // 初始化画布
  initCanvas();

  // 开始渲染循环（但先不显示，等agent完成）
  startRenderLoop();

  // 先加载地图数据，确保区域在 agent 决策前就绑定
  await loadMapFromDBOrDefault();

  // 添加默认 Agent 并等待完成
  updateLoadingText("正在初始化 Agent...");
  await addDefaultAgents();

  // 初始化编辑模式
  initEditor();

  // 更新 UI
  updateUI();

  console.log("✅ AI 生态小镇初始化完成");
}

// ========== 加载界面 ==========
function showLoadingScreen() {
  const loadingDiv = document.createElement("div");
  loadingDiv.id = "loading-screen";
  loadingDiv.className = "loading-screen";
  loadingDiv.innerHTML = `
    <div class="loading-content">
      <h2>🏘️ AI 生态小镇</h2>
      <p>正在加载世界...</p>
      <div class="loading-bar">
        <div class="loading-progress" id="loading-progress"></div>
      </div>
      <p id="loading-text">0%</p>
    </div>
  `;
  document.body.appendChild(loadingDiv);
  elements.loadingScreen = loadingDiv;
  elements.loadingProgress = document.getElementById("loading-progress");
  elements.loadingText = document.getElementById("loading-text");
}

function updateLoadingProgress(progress) {
  if (elements.loadingProgress) {
    elements.loadingProgress.style.width = `${progress}%`;
  }
  if (elements.loadingText) {
    elements.loadingText.textContent = `${Math.round(progress)}%`;
  }
}

function updateLoadingText(text) {
  if (elements.loadingText) {
    elements.loadingText.textContent = text;
  }
}

function hideLoadingScreen() {
  if (elements.loadingScreen) {
    const loadingScreen = elements.loadingScreen;
    elements.loadingScreen.classList.add("hidden");
    setTimeout(() => {
      loadingScreen?.remove?.();
    }, 500);
    elements.loadingScreen = null;
    elements.loadingProgress = null;
    elements.loadingText = null;
  }
}

function enhanceQuickActionButtons() {
  const actionConfigs = [
    {
      id: "btn-add-agent",
      className: "action-card action-card-add",
      icon: "+",
      title: "添加角色",
      desc: "向小镇注入新的居民",
    },
    {
      id: "btn-trigger-event",
      className: "action-card action-card-event",
      icon: "!",
      title: "触发事件",
      desc: "制造新的世界变化",
    },
    {
      id: "btn-save-town",
      className: "action-card action-card-save",
      icon: "S",
      title: "整局存档",
      desc: "保存当前轮回进度",
    },
    {
      id: "btn-load-town",
      className: "action-card action-card-load",
      icon: "L",
      title: "读取存档",
      desc: "回到之前的小镇状态",
    },
    {
      id: "btn-llm-config",
      className: "action-card action-card-llm",
      icon: "AI",
      title: "LLM 配置",
      desc: "切换接口模型并测试通路",
    },
  ];

  for (const config of actionConfigs) {
    const button = document.getElementById(config.id);
    if (!button) continue;
    button.className = config.className;
    button.innerHTML = `
      <span class="action-card-icon">${config.icon}</span>
      <span class="action-card-text">
        <span class="action-card-title">${config.title}</span>
        <span class="action-card-desc">${config.desc}</span>
      </span>
    `;
  }
}

// ========== 世界事件监听 ==========
enhanceQuickActionButtons = function enhanceQuickActionButtonsOverride() {
  const actionConfigs = [
    {
      id: "btn-add-agent",
      className: "action-card action-card-add",
      icon: "+",
      title: "添加角色",
      desc: "向小镇注入新的居民",
    },
    {
      id: "btn-trigger-event",
      className: "action-card action-card-event",
      icon: "!",
      title: "触发事件",
      desc: "制造新的世界变化",
    },
    {
      id: "btn-save-town",
      className: "action-card action-card-save",
      icon: "S",
      title: "整局存档",
      desc: "保存当前轮回进度",
    },
    {
      id: "btn-load-town",
      className: "action-card action-card-load",
      icon: "L",
      title: "读取存档",
      desc: "回到之前的小镇状态",
    },
    {
      id: "btn-llm-config",
      className: "action-card action-card-llm",
      icon: "AI",
      title: "LLM 配置",
      desc: "切换接口模型并测试通路",
    },
  ];

  for (const config of actionConfigs) {
    const button = document.getElementById(config.id);
    if (!button) continue;
    button.className = config.className;
    button.innerHTML = `
      <span class="action-card-icon">${config.icon}</span>
      <span class="action-card-text">
        <span class="action-card-title">${config.title}</span>
        <span class="action-card-desc">${config.desc}</span>
      </span>
    `;
  }
}

function setupWorldListeners() {
  state.world.addEventListener("tick", (e) => {
    const { time, tickCount, dayCount, pollution, worldResources } =
      e.detail;
    updateGameTime(time);
    updateDayCount(dayCount);
    updateTickCount(tickCount);
    updatePollution(pollution);
    updateWorldResources(worldResources);
    renderAgentList();
  });

  // 实时时间更新（每秒触发）
  state.world.addEventListener("timeUpdate", (e) => {
    updateGameTime(e.detail.time);
  });

  state.world.addEventListener("agentJoined", (e) => {
    addEvent({
      type: "system",
      description: `Agent ${e.detail.name} 加入了世界`,
      timestamp: new Date(),
    });
    renderAgentList();
  });

  state.world.addEventListener("agentLeft", (e) => {
    renderAgentList();
  });

  state.world.addEventListener("event", (e) => {
    addEvent(e.detail);
  });

  state.world.addEventListener("started", () => {
    state.simulationRunning = true;
    updateSimulationStatus();
  });
  state.world.addEventListener("stopped", () => {
    state.simulationRunning = false;
    updateSimulationStatus();
  });

  state.world.addEventListener("dialogue", (e) => {
    showDialogueBubble(e.detail.agentId, e.detail.message);
  });

  state.world.addEventListener("pollutionChange", (e) => {
    updatePollution(e.detail.pollution);
    addEvent({
      type: "system",
      description: `☠️ 污染值上升至 ${e.detail.pollution}`,
      timestamp: new Date(),
    });
  });

  // 夜晚过渡动画
  state.world.addEventListener("dreamStart", () => {
    document.getElementById("night-overlay").classList.add("active");
  });
  state.world.addEventListener("dreamEnd", () => {
    document.getElementById("night-overlay").classList.remove("active");
  });

  state.world.addEventListener("gameOver", async (e) => {
    state.simulationRunning = false;
    updateSimulationStatus();
    const endingVariant = getGameOverVariant(e.detail);
    addEvent({
      type: "system",
      description: `${endingVariant.eventPrefix} ${e.detail.message}`,
      timestamp: new Date(),
    });
    await playEndingSequence(e.detail);
    showGameOverModal(e.detail);
  });

  state.world.addEventListener("gameReset", (e) => {
    addEvent({
      type: "system",
      description: "🔄 小镇已重置，重新开始！",
      timestamp: new Date(),
    });
    const cycleMessages = e.detail?.cycleMessages || {};
    const entries = Object.entries(cycleMessages);
    if (entries.length > 0) {
      addEvent({
        type: "world",
        description: `🌀 轮回留言已继承：${entries
          .map(([agentId, message]) => `${agentId}「${message}」`)
          .join("；")}`,
        timestamp: new Date(),
      });
    }
  });

  state.world.addEventListener("dreamStart", (e) => {
    const { dayCount } = e.detail;
    addEvent({
      type: "world",
      description: `第${dayCount}天夜晚，所有人入睡，进入梦境...`,
      timestamp: new Date(),
    });
    state.simulationRunning = false;
    updateSimulationStatus();
  });

  state.world.addEventListener("dreamEnd", (e) => {
    const { dayCount, time } = e.detail;
    if (time) updateGameTime(time);
    updateDayCount(dayCount);
    addEvent({
      type: "world",
      description: `第${dayCount}天清晨，新的一天开始了`,
      timestamp: new Date(),
    });
    state.simulationRunning = state.world?.isRunning || false;
    updateSimulationStatus();
  });

  state.world.addEventListener("dreamResults", (e) => {
    const { results, resolve } = e.detail;
    showDreamModal(results, resolve);
  });

  state.world.addEventListener("meetingStart", (e) => {
    const { messages, chatHistory, townContext, resolve } = e.detail;
    state.simulationRunning = false;
    updateSimulationStatus();
    showMeetingModal(messages, chatHistory, townContext, resolve);
  });
  state.world.addEventListener("meetingEnd", () => {
    state.simulationRunning = state.world?.isRunning || false;
    updateSimulationStatus();
  });
}

// ========== UI 事件监听 ==========
function setupUIListeners() {
  enhanceQuickActionButtons();
  document
    .getElementById("difficulty-select")
    ?.addEventListener("change", handleDifficultyChange);

  // 控制按钮
  document.getElementById("btn-start").addEventListener("click", () => {
    state.world.start();
  });
  document.getElementById("btn-stop").addEventListener("click", () => {
    state.world.stop();
  });
  document.getElementById("btn-reset").addEventListener("click", async () => {
    await resetToCurrentDifficulty();
  });
  document
    .getElementById("btn-exit-game")
    .addEventListener("click", async () => {
      const confirmed = confirm("直接退出游戏并关闭程序？未保存进度将丢失。");
      if (!confirmed) return;
      try {
        await fetch("/api/stop", { method: "POST" });
      } catch (error) {
        console.warn("退出请求已发送，等待程序关闭。", error);
      }
    });
  document.getElementById("btn-step")?.addEventListener("click", async () => {
    await state.world.step();
  });

  // 快捷操作
  document.getElementById("btn-add-agent").addEventListener("click", () => {
    loadSpriteOptions();
    showModal("add-agent-modal");
  });
  document.getElementById("btn-trigger-event").addEventListener("click", () => {
    resetEventFormState();
    showModal("event-modal");
  });
  document.getElementById("btn-clear-log").addEventListener("click", () => {
    document.getElementById("event-log").innerHTML =
      '<div class="empty-state">暂无事件</div>';
  });
  document
    .getElementById("btn-save-town")
    ?.addEventListener("click", async () => {
      state.snapshotMode = "save";
      await openSnapshotModal();
    });
  document
    .getElementById("btn-load-town")
    ?.addEventListener("click", async () => {
      state.snapshotMode = "load";
      await openSnapshotModal();
    });
  document
    .getElementById("btn-llm-config")
    ?.addEventListener("click", async () => {
      await openLlmConfigModal();
    });
  document
    .getElementById("btn-balance-config")
    ?.addEventListener("click", () => {
      openBalanceConfigModal();
    });
  document
    .getElementById("btn-close-balance-config")
    ?.addEventListener("click", () => {
      hideModal("balance-config-modal");
    });
  document.getElementById("btn-balance-reset")?.addEventListener("click", () => {
    resetBalanceConfigDraft();
  });
  document
    .getElementById("btn-balance-reload")
    ?.addEventListener("click", () => {
      syncBalanceConfigForm();
      setBalanceConfigStatus("已重新载入当前生效中的 config。", "");
    });
  document
    .getElementById("btn-balance-save-close")
    ?.addEventListener("click", () => {
      hideModal("balance-config-modal");
    });
  document
    .getElementById("balance-config-tabs")
    ?.addEventListener("click", handleBalanceGroupClick);
  document
    .getElementById("balance-config-form")
    ?.addEventListener("input", (event) => {
      setBalanceConfigStatus("同步中...", "is-loading");
      scheduleBalanceConfigApply(event);
    });
  document
    .getElementById("balance-config-form")
    ?.addEventListener("change", (event) => {
      setBalanceConfigStatus("同步中...", "is-loading");
      scheduleBalanceConfigApply(event);
    });
  document
    .getElementById("balance-config-presets")
    ?.addEventListener("click", handleBalancePresetClick);

  document
    .getElementById("game-over-next-cycle")
    .addEventListener("click", async () => {
      hideModal("game-over-modal");
      await state.world.handleGameOverReset();
      state.simulationRunning = true;
      updateSimulationStatus();
      renderAgentList();
      drawMap();
    });

  document
    .getElementById("game-over-new-game")
    .addEventListener("click", async () => {
      await startNewGameFromGameOver();
    });

  document.getElementById("game-over-end").addEventListener("click", () => {
    hideModal("game-over-modal");
    state.simulationRunning = false;
    updateSimulationStatus();
    addEvent({
      type: "system",
      description: "🪦 本轮世界已经结束。",
      timestamp: new Date(),
    });
  });

  // 停止服务器
  document
    .getElementById("btn-stop-server")
    ?.addEventListener("click", async () => {
      if (confirm("确定要停止服务器吗？")) {
        try {
          await fetch("/api/stop", { method: "POST" });
        } catch (e) {
          console.log("服务器已停止");
        }
      }
    });

  // 模态框关闭
  document.getElementById("btn-close-modal").addEventListener("click", () => {
    hideModal("agent-modal");
  });
  document
    .getElementById("btn-close-add-modal")
    .addEventListener("click", () => {
      hideModal("add-agent-modal");
    });
  document
    .getElementById("btn-close-event-modal")
    .addEventListener("click", () => {
      resetEventFormState();
      hideModal("event-modal");
    });
  document.getElementById("btn-cancel-event")?.addEventListener("click", () => {
    resetEventFormState();
    hideModal("event-modal");
  });

  // 编辑模式切换
  document.getElementById("btn-edit-agent").addEventListener("click", () => {
    enterEditMode();
  });
  document.getElementById("btn-chat-agent").addEventListener("click", () => {
    openAgentChatModal(currentEditAgentId);
  });
  document.getElementById("btn-cancel-edit").addEventListener("click", () => {
    exitEditMode();
  });
  document.getElementById("btn-save-agent").addEventListener("click", () => {
    saveAgentEdit();
  });
  document
    .getElementById("btn-close-snapshot-modal")
    .addEventListener("click", () => {
      hideModal("snapshot-modal");
    });
  document
    .getElementById("btn-close-llm-modal")
    ?.addEventListener("click", () => {
      hideModal("llm-config-modal");
    });
  document
    .getElementById("btn-cancel-llm-config")
    ?.addEventListener("click", () => {
      hideModal("llm-config-modal");
    });
  document
    .getElementById("btn-load-llm-config")
    ?.addEventListener("click", async () => {
      await loadCurrentLlmConfig();
    });
  document
    .getElementById("btn-test-llm-config")
    ?.addEventListener("click", async () => {
      await testLlmConfigDraft();
    });
  document
    .getElementById("btn-save-llm-config")
    ?.addEventListener("click", async () => {
      await saveLlmConfigDraft();
    });
  document
    .getElementById("btn-close-game-over-modal")
    .addEventListener("click", () => {
      hideModal("game-over-modal");
    });
  document
    .getElementById("btn-confirm-save-town")
    .addEventListener("click", async () => {
      const snapshotName =
        document.getElementById("snapshot-name-input").value.trim() ||
        `town-day-${state.world?.dayCount || 1}-${Date.now()}`;
      if (state.snapshotMode === "load") {
        await loadTownSnapshot(snapshotName);
        hideModal("snapshot-modal");
      } else {
        await saveTownSnapshot(snapshotName);
        await renderSnapshotList();
        hideModal("snapshot-modal");
      }
    });
  document.getElementById("agent-chat-send").addEventListener("click", () => {
    sendAgentChatMessage();
  });
  document
    .getElementById("agent-chat-input")
    .addEventListener("keydown", (e) => {
      if (e.key === "Enter") sendAgentChatMessage();
    });
  document.getElementById("agent-chat-close").addEventListener("click", () => {
    closeAgentChatModal();
  });
  setupModalInteractions();

  // Slider 值显示更新
  ["social", "energy"].forEach((key) => {
    const slider = document.getElementById(`edit-agent-${key}`);
    const display = document.getElementById(`edit-agent-${key}-val`);
    if (slider && display) {
      slider.addEventListener("input", () => {
        display.textContent = (slider.value / 100).toFixed(2);
      });
    }
  });

  // 表单提交
  document
    .getElementById("add-agent-form")
    .addEventListener("submit", handleAddAgent);
  document
    .getElementById("event-form")
    .addEventListener("submit", handleTriggerEvent);
  document
    .getElementById("llm-config-form")
    ?.addEventListener("submit", async (e) => {
      e.preventDefault();
      await saveLlmConfigDraft();
    });
  document
    .getElementById("event-template")
    ?.addEventListener("change", handleEventTemplateChange);

  document.querySelectorAll(".event-template-quick").forEach((button) => {
    button.addEventListener("click", () => {
      const templateKey = button.dataset.template;
      const templateSelect = document.getElementById("event-template");
      if (!templateKey || !templateSelect) return;
      templateSelect.value = templateKey;
      triggerEventTemplate(templateKey);
    });
  });

  document
    .querySelectorAll('.event-effects-builder input[type="checkbox"]')
    .forEach((checkbox) => {
      checkbox.addEventListener("change", syncEventEffectRows);
    });

  document
    .querySelectorAll('.event-effects-builder input[type="number"]')
    .forEach((input) => {
      input.addEventListener("input", updateEventEffectsSummary);
    });

  // 加载精灵图和头像下拉列表
  loadSpriteOptions();
  syncEventEffectRows();

  // 新增 Agent 弹窗的滑块值更新
  ["social", "energy"].forEach((key) => {
    const slider = document.getElementById(`new-agent-${key}`);
    const display = document.getElementById(`new-${key}-val`);
    if (slider && display) {
      slider.addEventListener("input", () => {
        display.textContent = (slider.value / 100).toFixed(2);
      });
    }
  });

  // 新增 Agent 精灵预览
  ["sprite", "portrait"].forEach((type) => {
    const fileInput = document.getElementById(`new-agent-${type}`);
    const preview = document.getElementById(`${type}-preview`);
    if (fileInput && preview) {
      fileInput.addEventListener("change", () => {
        const file = fileInput.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = () => {
            preview.src = reader.result;
            preview.classList.remove("hidden");
          };
          reader.readAsDataURL(file);
        } else {
          preview.classList.add("hidden");
        }
      });
    }
  });

  // Tab 切换
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const tabName = e.target.dataset.tab;
      document
        .querySelectorAll(".tab-btn")
        .forEach((b) => b.classList.remove("active"));
      document
        .querySelectorAll(".tab-pane")
        .forEach((p) => p.classList.remove("active"));
      e.target.classList.add("active");
      document.getElementById(`tab-${tabName}`).classList.add("active");
    });
  });

  // 角色属性卡片事件
  setupAgentCardListeners();
}

function applyDifficulty(mode, { persist = true, overrides = null } = {}) {
  const difficulty = normalizeDifficultyKey(mode);
  applyBalanceConfigDraft(overrides ?? state.gameConfigDraft ?? {}, {
    persist,
    syncEditor: false,
  });
  state.difficulty = difficulty;
}

async function resetToCurrentDifficulty() {
  if (!state.world) return;
  const preservedConfigs = await state.world.reset();
  const restartConfigs =
    preservedConfigs.length > 0
      ? preservedConfigs.map((config) =>
          buildTemplateWithDifficulty({
            ...config,
            healthMax: config.healthMax ?? state.gameConfig.survival.healthMax,
          }),
        )
      : Object.values(getAgentTemplates());
  await state.world.restartWithAgentConfigs(restartConfigs, "reset", {});
  state.simulationRunning = true;
  updateSimulationStatus();
  renderAgentList();
  drawMap();
  addEvent({
    type: "system",
    description: `🔁 已按${state.gameConfig.difficulty.label}难度重置小镇。`,
    timestamp: new Date(),
  });
}

async function handleDifficultyChange(e) {
  const nextDifficulty = normalizeDifficultyKey(e.target.value);
  if (nextDifficulty === state.difficulty) return;
  applyDifficulty(nextDifficulty);
  if (state.world) {
    state.world.applyGameConfig(state.gameConfig);
  }
  addEvent({
    type: "system",
    description: `🎚️ 难度已切换为${state.gameConfig.difficulty.label}，后续模拟会按新规则运行。`,
    timestamp: new Date(),
  });
  updateUI();
}

// ========== 画布初始化 ==========
function initCanvas() {
  state.canvas = document.getElementById("world-map");
  state.ctx = state.canvas.getContext("2d");

  // Canvas尺寸 = 地图图片尺寸（减去顶部裁剪）
  const effectiveH = CONFIG.MAP_IMAGE_HEIGHT - CONFIG.MAP_TOP_OFFSET;
  state.canvas.width = CONFIG.MAP_IMAGE_WIDTH;
  state.canvas.height = effectiveH;

  // 适配容器
  const container = state.canvas.parentElement;
  container.style.cursor = "grab";
  const maxWidth = container.clientWidth - 40;
  const maxHeight = container.clientHeight - 40;
  const scale = Math.min(
    maxWidth / CONFIG.MAP_IMAGE_WIDTH,
    maxHeight / effectiveH,
    2.5,
  );
  CONFIG.zoom = scale;

  state.canvas.style.width = `${CONFIG.MAP_IMAGE_WIDTH * scale}px`;
  state.canvas.style.height = `${effectiveH * scale}px`;

  // 初始居中
  applyCanvasTransform();

  // 创建缩略图
  createMinimap();

  // 画布交互
  state.canvas.addEventListener("mousemove", handleMouseMove);
  state.canvas.addEventListener("click", handleCanvasClick);
  state.canvas.addEventListener("mousedown", handleCanvasMouseDown);
  state.canvas.addEventListener("mouseup", handleCanvasMouseUp);
  state.canvas.addEventListener("mouseleave", () => {
    hideTooltip();
    state.hoveredElement = null;
    // Finalize area brush if mouse leaves canvas
    if (state.paintingArea) {
      if (state.paintingArea.cells.length > 0) saveAreaHistory();
      else {
        const idx = state.areas.indexOf(state.paintingArea);
        if (idx >= 0) state.areas.splice(idx, 1);
        state.world.setAreas(state.areas);
        state.world.updateGridSize(CONFIG.MAP_CELL_SIZE);
        renderAreaListInEditor();
      }
      state.paintingArea = null;
      state.paintedCells = new Set();
      state.affectedCells = new Set();
    }
    if (isPanning) {
      isPanning = false;
      state.canvas.parentElement.style.cursor = "grab";
    }
  });
  state.canvas.addEventListener("wheel", handleCanvasWheel, { passive: false });

  // 键盘事件
  document.addEventListener("keydown", handleEditorKeyDown);
}

// ========== 渲染循环 ==========
function startRenderLoop() {
  function render() {
    drawMap();
    state.animationId = requestAnimationFrame(render);
  }
  render();
}

// ========== 缩略图 ==========
function createMinimap() {
  const container = state.canvas.parentElement;

  const wrapper = document.createElement("div");
  wrapper.className = "minimap-container";

  const minimapCanvas = document.createElement("canvas");
  minimapCanvas.id = "minimap";
  minimapCanvas.width = 200;
  minimapCanvas.height = Math.round(
    200 *
      ((CONFIG.MAP_IMAGE_HEIGHT - CONFIG.MAP_TOP_OFFSET) /
        CONFIG.MAP_IMAGE_WIDTH),
  );

  wrapper.appendChild(minimapCanvas);
  container.appendChild(wrapper);

  state.minimapCanvas = minimapCanvas;
  state.minimapCtx = minimapCanvas.getContext("2d");

  drawMinimapBackground();

  minimapCanvas.addEventListener("mousedown", (e) => {
    e.stopPropagation();
    handleMinimapClick(e);
  });
  minimapCanvas.addEventListener("mousemove", (e) => {
    if (e.buttons === 1) {
      e.stopPropagation();
      handleMinimapClick(e);
    }
  });
}

function drawMinimapBackground(visualState = null) {
  const ctx = state.minimapCtx;
  const w = state.minimapCanvas.width;
  const h = state.minimapCanvas.height;
  const mapImage = imageLoader.getImage("/assets/map.png");
  const effectiveH = CONFIG.MAP_IMAGE_HEIGHT - CONFIG.MAP_TOP_OFFSET;
  const pollution = state.world?.pollution ?? GAME_CONFIG.initialPollution;
  ctx.save();
  if (visualState) {
    ctx.filter = `brightness(${visualState.brightness || 1}) contrast(${visualState.contrast || 1})`;
  }
  if (mapImage) {
    ctx.drawImage(
      mapImage,
      0,
      CONFIG.MAP_TOP_OFFSET,
      CONFIG.MAP_IMAGE_WIDTH,
      effectiveH,
      0,
      0,
      w,
      h,
    );
  } else {
    ctx.fillStyle = "#2b1f3e";
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
  drawPollutionMapLayers(ctx, w, h, pollution, visualState);
}

function updateMinimapViewport() {
  if (!state.minimapCtx) return;
  const ctx = state.minimapCtx;
  const container = state.canvas.parentElement;
  const mw = state.minimapCanvas.width;
  const mh = state.minimapCanvas.height;
  const visualState = getDayNightVisualState(
    state.world?.gameTime,
    state.world?.pollution,
  );

  drawMinimapBackground(visualState);
  drawDayNightTint(ctx, mw, mh, visualState);
  drawAtmosphericFog(ctx, mw, mh, visualState, state.world?.pollution);

  const scaleX = mw / CONFIG.MAP_IMAGE_WIDTH;
  const scaleY = mh / (CONFIG.MAP_IMAGE_HEIGHT - CONFIG.MAP_TOP_OFFSET);

  // 视口在画布像素坐标中的位置
  const viewLeftPx = -canvasPanX / CONFIG.zoom;
  const viewTopPx = -canvasPanY / CONFIG.zoom;
  const viewWidthPx = container.clientWidth / CONFIG.zoom;
  const viewHeightPx = container.clientHeight / CONFIG.zoom;

  // 转换到缩略图坐标
  const viewLeft = viewLeftPx * scaleX;
  const viewTop = viewTopPx * scaleY;
  const viewWidth = viewWidthPx * scaleX;
  const viewHeight = viewHeightPx * scaleY;

  // 半透明遮罩（仅压暗视口外区域，保留地图上的昼夜层）
  ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
  ctx.fillRect(0, 0, mw, Math.max(0, viewTop));
  ctx.fillRect(0, viewTop, Math.max(0, viewLeft), viewHeight);
  ctx.fillRect(
    Math.max(0, viewLeft + viewWidth),
    viewTop,
    Math.max(0, mw - (viewLeft + viewWidth)),
    viewHeight,
  );
  ctx.fillRect(
    0,
    Math.max(0, viewTop + viewHeight),
    mw,
    Math.max(0, mh - (viewTop + viewHeight)),
  );

  // 视口边框
  ctx.strokeStyle = "#e94560";
  ctx.lineWidth = 2;
  ctx.strokeRect(viewLeft, viewTop, viewWidth, viewHeight);

  // 绘制 agent 位置点
  if (state.world) {
    const worldState = state.world.getWorldState();
    for (const agent of worldState.agents.values()) {
      const ax = agent.position.x * CONFIG.MAP_CELL_SIZE * scaleX;
      const ay = agent.position.y * CONFIG.MAP_CELL_SIZE * scaleY;
      ctx.fillStyle = rgbaFromHex(
        mixHexColors("#28a745", "#8ba196", visualState?.iconTintAlpha || 0),
        1,
      );
      ctx.beginPath();
      ctx.arc(ax, ay, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function handleMinimapClick(e) {
  const rect = state.minimapCanvas.getBoundingClientRect();
  const clickX = (e.clientX - rect.left) / rect.width;
  const clickY = (e.clientY - rect.top) / rect.height;

  const container = state.canvas.parentElement;
  const canvasDisplayW = CONFIG.MAP_IMAGE_WIDTH * CONFIG.zoom;
  const canvasDisplayH = CONFIG.MAP_IMAGE_HEIGHT * CONFIG.zoom;

  // 点击位置对应的画布像素 → 居中
  canvasPanX = container.clientWidth / 2 - clickX * canvasDisplayW;
  canvasPanY = container.clientHeight / 2 - clickY * canvasDisplayH;

  updateCanvasTransform();
  updateMinimapViewport();
}

// ========== 地图绘制 ==========
function drawMap() {
  if (!state.ctx) return;

  const ctx = state.ctx;
  const cellSize = CONFIG.MAP_CELL_SIZE;
  const worldState = state.world.getWorldState();
  const visualState = getDayNightVisualState(
    worldState.time,
    worldState.pollution,
  );

  // 1. 绘制地图背景图片（去掉顶部28像素）
  const mapImage = imageLoader.getImage("/assets/map.png");
  const effectiveH = CONFIG.MAP_IMAGE_HEIGHT - CONFIG.MAP_TOP_OFFSET;
  ctx.save();
  if (visualState) {
    ctx.filter = `brightness(${visualState.brightness || 1}) contrast(${visualState.contrast || 1})`;
  }
  if (mapImage) {
    ctx.drawImage(
      mapImage,
      0,
      CONFIG.MAP_TOP_OFFSET,
      CONFIG.MAP_IMAGE_WIDTH,
      effectiveH,
      0,
      0,
      CONFIG.MAP_IMAGE_WIDTH,
      effectiveH,
    );
  } else {
    ctx.fillStyle = "#2b1f3e";
    ctx.fillRect(0, 0, CONFIG.MAP_IMAGE_WIDTH, effectiveH);
  }
  ctx.restore();
  drawPollutionMapLayers(
    ctx,
    CONFIG.MAP_IMAGE_WIDTH,
    effectiveH,
    worldState.pollution,
    visualState,
  );
  drawDayNightTint(ctx, CONFIG.MAP_IMAGE_WIDTH, effectiveH, visualState);
  drawAtmosphericFog(
    ctx,
    CONFIG.MAP_IMAGE_WIDTH,
    effectiveH,
    visualState,
    worldState.pollution,
  );

  // 2. 编辑模式：绘制网格线
  if (state.isEditMode) {
    drawGridOverlay(ctx, visualState);
  }

  // 3. 绘制区域覆盖层（红=不可通行, 蓝=可通行）- 仅编辑模式
  if (state.isEditMode) {
    drawAreaOverlays(ctx, visualState);
  }

  // 4. 绘制物资基地可取用库存提示
  drawSupplyBaseStockIcons(ctx, cellSize, visualState);

  // 5. 绘制 Agent
  for (const agentState of worldState.agents.values()) {
    drawAgent(ctx, agentState, cellSize, visualState);
  }

  // 6. 更新缩略图视口
  updateMinimapViewport();
}

function drawSupplyBaseStockIcons(ctx, cellSize, visualState = null) {
  state.supplyStockHotspots = [];
  const supplyAreas = state.areas.filter(
    (area) => area.name === "物资基地" && area.cells?.length,
  );
  if (supplyAreas.length === 0) return;

  const worldResources = state.world?.worldResources || {};
  for (const area of supplyAreas) {
    const center = getAreaCenterPoint(area);
    if (!center) continue;
    const services = (area.services || []).filter(
      (service) => service.fullness || service.health,
    );
    if (services.length === 0) continue;

    const visibleServices = services.slice(0, 4);
    const baseX = center.x * cellSize;
    const baseY = center.y * cellSize - cellSize * 0.45;
    const iconGap = 22;
    const iconRadius = 12;
    const startX = baseX - ((visibleServices.length - 1) * iconGap) / 2;

    ctx.save();
    ctx.font = "17px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    visibleServices.forEach((service, index) => {
      const icon = getSupplyServiceIcon(service);
      const x = startX + index * iconGap;
      const y = baseY + Math.sin(Date.now() / 550 + index) * 2;
      const iconDim = visualState?.iconTintAlpha || 0;
      ctx.fillStyle = rgbaFromHex("#09130f", 0.86 + iconDim * 0.08);
      ctx.strokeStyle = rgbaFromHex(
        "#f5be54",
        Math.max(0.35, 0.9 - iconDim * 0.35),
      );
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(x, y, iconRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillText(icon, x, y + 0.5);
      state.supplyStockHotspots.push({
        type: "supplyService",
        x,
        y,
        radius: iconRadius + 6,
        area,
        service,
        icon,
      });
    });

    const stockLabel = `库存 ${Math.round(worldResources.foodStock ?? 0)}`;
    ctx.font = "bold 10px sans-serif";
    ctx.fillStyle = rgbaFromHex(
      mixHexColors("#fff4cc", "#b8b2a2", visualState?.labelDimAlpha || 0),
      0.95,
    );
    ctx.fillText(stockLabel, baseX, baseY + 20);
    state.supplyStockHotspots.push({
      type: "supplySummary",
      x: baseX,
      y: baseY + 20,
      radius: Math.max(24, ctx.measureText(stockLabel).width / 2 + 8),
      area,
      service: visibleServices[0],
      icon: "📦",
    });
    ctx.restore();
  }
}

function getSupplyServiceIcon(service = {}) {
  if (service.health && !service.fullness) return "✚";
  if ((service.fullness || 0) >= 30) return "🍱";
  if ((service.fullness || 0) <= 10) return "🥤";
  return "🥖";
}

function getSupplyStockCost(service = {}) {
  return Math.max(1, Math.ceil((Number(service.fullness) || 0) / 12));
}

function getSupplyHotspotAtCanvasPoint(pixelX, pixelY) {
  for (let i = state.supplyStockHotspots.length - 1; i >= 0; i--) {
    const hotspot = state.supplyStockHotspots[i];
    const dx = pixelX - hotspot.x;
    const dy = pixelY - hotspot.y;
    const radius = hotspot.radius || 14;
    if (dx * dx + dy * dy <= radius * radius) {
      return hotspot;
    }
  }
  return null;
}

function getAreaCenterPoint(area) {
  if (!area?.cells?.length) return null;
  const total = area.cells.reduce(
    (sum, cell) => ({ x: sum.x + cell.x, y: sum.y + cell.y }),
    { x: 0, y: 0 },
  );
  return {
    x: total.x / area.cells.length,
    y: total.y / area.cells.length,
  };
}

// ========== 网格覆盖层 ==========
function drawGridOverlay(ctx, visualState = null) {
  const ts = CONFIG.MAP_CELL_SIZE;
  const cols = Math.floor(CONFIG.MAP_IMAGE_WIDTH / ts);
  const effectiveH = CONFIG.MAP_IMAGE_HEIGHT - CONFIG.MAP_TOP_OFFSET;
  const rows = Math.floor(effectiveH / ts);

  const boost = visualState?.gridBoostAlpha || 0;
  const linePositionsX = Array.from(
    { length: cols + 1 },
    (_, index) => index * ts,
  );
  const linePositionsY = Array.from(
    { length: rows + 1 },
    (_, index) => index * ts,
  );
  const zoom = Math.max(0.3, CONFIG.zoom || 1);
  const majorEvery = 5;
  const minorDarkWidth = Math.max(1.6, 2.2 / zoom);
  const minorLightWidth = Math.max(1.1, 1.6 / zoom);
  const majorDarkWidth = Math.max(2.4, 3.2 / zoom);
  const majorLightWidth = Math.max(1.6, 2.3 / zoom);

  ctx.save();
  const drawGridPass = (positions, isVertical, darkAlpha, lightAlpha, darkWidth, lightWidth) => {
    ctx.strokeStyle = `rgba(0, 0, 0, ${darkAlpha})`;
    ctx.lineWidth = darkWidth;
    ctx.beginPath();
    for (const value of positions) {
      if (isVertical) {
        ctx.moveTo(value, 0);
        ctx.lineTo(value, effectiveH);
      } else {
        ctx.moveTo(0, value);
        ctx.lineTo(CONFIG.MAP_IMAGE_WIDTH, value);
      }
    }
    ctx.stroke();

    ctx.strokeStyle = `rgba(255, 255, 255, ${lightAlpha})`;
    ctx.lineWidth = lightWidth;
    ctx.beginPath();
    for (const value of positions) {
      if (isVertical) {
        ctx.moveTo(value, 0);
        ctx.lineTo(value, effectiveH);
      } else {
        ctx.moveTo(0, value);
        ctx.lineTo(CONFIG.MAP_IMAGE_WIDTH, value);
      }
    }
    ctx.stroke();
  };

  drawGridPass(
    linePositionsX.filter((_, index) => index % majorEvery !== 0),
    true,
    0.24 + boost * 0.35,
    0.36 + boost * 0.5,
    minorDarkWidth,
    minorLightWidth,
  );
  drawGridPass(
    linePositionsY.filter((_, index) => index % majorEvery !== 0),
    false,
    0.24 + boost * 0.35,
    0.36 + boost * 0.5,
    minorDarkWidth,
    minorLightWidth,
  );
  drawGridPass(
    linePositionsX.filter((_, index) => index % majorEvery === 0),
    true,
    0.34 + boost * 0.35,
    0.5 + boost * 0.4,
    majorDarkWidth,
    majorLightWidth,
  );
  drawGridPass(
    linePositionsY.filter((_, index) => index % majorEvery === 0),
    false,
    0.34 + boost * 0.35,
    0.5 + boost * 0.4,
    majorDarkWidth,
    majorLightWidth,
  );
  ctx.restore();
}

// ========== 区域覆盖层 ==========
function drawAreaOverlays(ctx, visualState = null) {
  const ts = CONFIG.MAP_CELL_SIZE;
  const areas = state.world.getAreas();
  const labelDim = visualState?.labelDimAlpha || 0;

  for (const area of areas) {
    const cells = Array.isArray(area?.cells) ? area.cells : [];
    if (cells.length === 0) continue;
    const isSelected = state.editorSelectedArea?.id === area.id;
    const isMultiSelected = state.selectedAreas.some((sa) => sa.id === area.id);
    const fillColor = area.isBlocked
      ? "rgba(231, 76, 60, 0.25)"
      : "rgba(46, 204, 113, 0.15)";

    // 填充每个格子
    ctx.fillStyle = fillColor;
    for (const c of cells) {
      ctx.fillRect(c.x * ts, c.y * ts, ts, ts);
    }

    if (isSelected || isMultiSelected) {
      ctx.fillStyle = isSelected
        ? "rgba(0, 212, 255, 0.18)"
        : "rgba(241, 196, 15, 0.16)";
      for (const c of cells) {
        ctx.fillRect(c.x * ts, c.y * ts, ts, ts);
      }
    }

    // 边框：只画外边缘格子的外边线
    const strokeColor = isSelected
      ? "#00d4ff"
      : isMultiSelected
        ? "#f1c40f"
        : area.isBlocked
          ? "#e74c3c"
          : "#2ecc71";
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = isSelected ? 4 : isMultiSelected ? 3 : 2;
    const cellSet = new Set(cells.map((c) => `${c.x},${c.y}`));
    for (const c of cells) {
      const px = c.x * ts;
      const py = c.y * ts;
      if (!cellSet.has(`${c.x},${c.y - 1}`)) {
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + ts, py);
        ctx.stroke();
      }
      if (!cellSet.has(`${c.x},${c.y + 1}`)) {
        ctx.beginPath();
        ctx.moveTo(px, py + ts);
        ctx.lineTo(px + ts, py + ts);
        ctx.stroke();
      }
      if (!cellSet.has(`${c.x - 1},${c.y}`)) {
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px, py + ts);
        ctx.stroke();
      }
      if (!cellSet.has(`${c.x + 1},${c.y}`)) {
        ctx.beginPath();
        ctx.moveTo(px + ts, py);
        ctx.lineTo(px + ts, py + ts);
        ctx.stroke();
      }
    }

    // 名称标签（放在包围盒中心）
    if (area.name) {
      const bbox = computeAreaBBox(area);
      if (bbox.w <= 0 || bbox.h <= 0) continue;
      const cx = (bbox.x + bbox.w / 2) * ts;
      const cy = (bbox.y + bbox.h / 2) * ts;

      // 等级标签（名称上方）
      const level = state.world.getLevelForBuilding(area.name);
      if (level > 1) {
        const roman = ["Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ", "Ⅴ"][level - 1] || "";
        const levelText = `等级${roman}`;
        ctx.font = "10px sans-serif";
        const levelWidth = ctx.measureText(levelText).width + 8;
        ctx.fillStyle = `rgba(0, 0, 0, ${0.6 + labelDim * 0.15})`;
        ctx.fillRect(cx - levelWidth / 2, cy - 22, levelWidth, 14);
        ctx.fillStyle = mixHexColors("#f1c40f", "#a88d48", labelDim);
        ctx.textAlign = "center";
        ctx.fillText(levelText, cx, cy - 11);
      }

      // 名称标签
      ctx.fillStyle = `rgba(0, 0, 0, ${0.7 + labelDim * 0.12})`;
      const nameWidth = ctx.measureText(area.name).width + 12;
      ctx.fillRect(cx - nameWidth / 2, cy - 9, nameWidth, 18);
      ctx.fillStyle = mixHexColors("#ffffff", "#c8d2d8", labelDim);
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(area.name, cx, cy + 4);
    }
  }

  // 编辑模式：绘制圈选路径
  if (state.isEditMode && state.isFreehand && state.freehandPath.length > 0) {
    const color = state.paintMode === "blocked" ? "#e74c3c" : "#2ecc71";
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    for (const p of state.freehandPath) {
      ctx.strokeRect(p.x * ts + 1, p.y * ts + 1, ts - 2, ts - 2);
    }
  }
}

// ========== 坐标转换 ==========
function screenToGrid(e) {
  const rect = state.canvas.getBoundingClientRect();
  const scaleX = state.canvas.width / rect.width;
  const scaleY = state.canvas.height / rect.height;
  const pixelX = (e.clientX - rect.left) * scaleX;
  const pixelY = (e.clientY - rect.top) * scaleY;
  return {
    gridX: Math.floor(pixelX / CONFIG.MAP_CELL_SIZE),
    gridY: Math.floor(pixelY / CONFIG.MAP_CELL_SIZE),
    pixelX,
    pixelY,
  };
}

// ========== 画布变换 ==========
function applyCanvasTransform() {
  const container = state.canvas.parentElement;
  const cw = container.clientWidth;
  const ch = container.clientHeight;
  const dw = CONFIG.MAP_IMAGE_WIDTH * CONFIG.zoom;
  const dh = (CONFIG.MAP_IMAGE_HEIGHT - CONFIG.MAP_TOP_OFFSET) * CONFIG.zoom;

  // 默认居中
  canvasPanX = (cw - dw) / 2;
  canvasPanY = (ch - dh) / 2;

  state.canvas.style.transform = `translate(${canvasPanX}px, ${canvasPanY}px)`;
}

function updateCanvasTransform() {
  state.canvas.style.transform = `translate(${canvasPanX}px, ${canvasPanY}px)`;
}

// ========== 缩放 ==========
function handleCanvasWheel(e) {
  e.preventDefault();
  const container = state.canvas.parentElement;
  const containerRect = container.getBoundingClientRect();

  // 光标在容器内的位置
  const cx = e.clientX - containerRect.left;
  const cy = e.clientY - containerRect.top;

  // 光标下的画布像素坐标
  const canvasPixelX = cx - canvasPanX;
  const canvasPixelY = cy - canvasPanY;

  const oldZoom = CONFIG.zoom;
  const delta = e.deltaY > 0 ? -0.1 : 0.1;
  CONFIG.zoom = Math.max(0.3, Math.min(2.5, CONFIG.zoom + delta));

  state.canvas.style.width = `${CONFIG.MAP_IMAGE_WIDTH * CONFIG.zoom}px`;
  state.canvas.style.height = `${(CONFIG.MAP_IMAGE_HEIGHT - CONFIG.MAP_TOP_OFFSET) * CONFIG.zoom}px`;

  // 调整 pan 使光标下的画布像素保持不动
  canvasPanX = cx - canvasPixelX * (CONFIG.zoom / oldZoom);
  canvasPanY = cy - canvasPixelY * (CONFIG.zoom / oldZoom);

  updateCanvasTransform();
  updateMinimapViewport();
}

// ========== 区域辅助函数 ==========
function computeAreaBBox(area) {
  const cells = Array.isArray(area?.cells) ? area.cells : [];
  if (cells.length === 0) {
    return { x: 0, y: 0, w: 0, h: 0 };
  }
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  let hasValidCell = false;
  for (const c of cells) {
    const x = Number(c?.x);
    const y = Number(c?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    hasValidCell = true;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (!hasValidCell) {
    return { x: 0, y: 0, w: 0, h: 0 };
  }
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function rectToCells(rx, ry, rw, rh) {
  const cells = [];
  for (let dy = 0; dy < rh; dy++) {
    for (let dx = 0; dx < rw; dx++) {
      cells.push({ x: rx + dx, y: ry + dy });
    }
  }
  return cells;
}

// ========== 区域编辑器函数 ==========
let _areaIdCounter = 0;
function addArea(cells, name, isBlocked, skipHistory) {
  const area = {
    id: "area_" + Date.now() + "_" + ++_areaIdCounter,
    name: name || "",
    cells: cells,
    isBlocked,
  };
  state.areas.push(area);
  markEditorMapDirty();
  renderAreaListInEditor();
  if (!skipHistory) saveAreaHistory();
}

function selectAreaAt(gridX, gridY) {
  for (let i = state.areas.length - 1; i >= 0; i--) {
    const a = state.areas[i];
    if (a.cells.some((c) => c.x === gridX && c.y === gridY)) {
      state.selectedAreas = [];
      state.editorSelectedArea = a;
      renderAreaProperties(a);
      renderAreaListInEditor();
      return;
    }
  }
  state.editorSelectedArea = null;
  state.selectedAreas = [];
  renderAreaProperties(null);
  renderAreaListInEditor();
}

function eraseAreaAt(gridX, gridY) {
  for (let i = state.areas.length - 1; i >= 0; i--) {
    const a = state.areas[i];
    const cellIdx = a.cells.findIndex((c) => c.x === gridX && c.y === gridY);
    if (cellIdx >= 0) {
      a.cells.splice(cellIdx, 1);
      if (a.cells.length === 0) {
        state.areas.splice(i, 1);
      }
      markEditorMapDirty();
      state.editorSelectedArea = null;
      renderAreaListInEditor();
      renderAreaProperties(null);
      saveAreaHistory();
      return;
    }
  }
}

function mergeSelectedAreas() {
  if (state.selectedAreas.length < 2) {
    showHint("请先 Ctrl/Shift 多选至少2个区域");
    return;
  }

  // 布尔并集：合并所有选中区域的格子
  const mergedCells = new Map();
  const firstArea = state.selectedAreas[0];

  for (const a of state.selectedAreas) {
    for (const c of a.cells) {
      mergedCells.set(`${c.x},${c.y}`, c);
    }
  }

  const cells = [...mergedCells.values()];

  // 移除被合并的区域
  const mergeIds = new Set(state.selectedAreas.map((a) => a.id));
  state.areas = state.areas.filter((a) => !mergeIds.has(a.id));

  // 添加合并后的区域
  addArea(cells, firstArea.name, firstArea.isBlocked);

  state.selectedAreas = [];
  state.editorSelectedArea = null;
  renderAreaListInEditor();
  renderAreaProperties(null);
  showHint(`已合并 ${cells.length} 个格子`);
}

function paintAtGrid(gridX, gridY) {
  const isBlocked = state.paintMode === "blocked";
  addArea([{ x: gridX, y: gridY }], "", isBlocked);
}

// 撤销/重做
const editHistory = {
  stack: [],
  index: -1,
  maxSize: 50,
};

function saveAreaHistory() {
  const snapshot = JSON.parse(JSON.stringify(state.areas));
  editHistory.stack = editHistory.stack.slice(0, editHistory.index + 1);
  editHistory.stack.push(snapshot);
  if (editHistory.stack.length > editHistory.maxSize) {
    editHistory.stack.shift();
  }
  editHistory.index = editHistory.stack.length - 1;
}

function undo() {
  if (editHistory.index > 0) {
    editHistory.index--;
    state.areas = JSON.parse(
      JSON.stringify(editHistory.stack[editHistory.index]),
    );
    markEditorMapDirty();
    renderAreaListInEditor();
  }
}

function redo() {
  if (editHistory.index < editHistory.stack.length - 1) {
    editHistory.index++;
    state.areas = JSON.parse(
      JSON.stringify(editHistory.stack[editHistory.index]),
    );
    markEditorMapDirty();
    renderAreaListInEditor();
  }
}

// ========== 编辑器UI渲染 ==========
function renderAreaListInEditor() {
  const container = document.getElementById("editor-area-content");
  if (!container) return;

  clearElement(container);
  if (state.areas.length === 0) {
    appendTextElement(container, "div", "在地图上拖拽创建区域", "empty-state");
    return;
  }

  state.areas.forEach((a, i) => {
    normalizeAreaSemantics(a);
    const building = getAreaBuilding(a);
    const tagCount = getAreaTags(a).length;
    const bbox = computeAreaBBox(a);
    const cellCount = Array.isArray(a?.cells) ? a.cells.length : 0;
    const itemEl = document.createElement("div");
    itemEl.className = [
      "area-item",
      state.editorSelectedArea?.id === a.id ? "selected" : "",
      state.selectedAreas.some((sa) => sa.id === a.id) ? "selected-multi" : "",
    ]
      .filter(Boolean)
      .join(" ");
    itemEl.dataset.areaIndex = String(i);
    itemEl.dataset.areaId = a.id || "";

    const colorEl = document.createElement("span");
    colorEl.className = "area-color";
    colorEl.style.background = a.isBlocked ? "#e74c3c" : "#2ecc71";
    itemEl.appendChild(colorEl);
    appendTextElement(itemEl, "span", a.name || "未命名区域", "area-name");
    appendTextElement(
      itemEl,
      "span",
      building.enabled ? `建筑 ${tagCount}标签` : "地形",
      building.enabled ? "area-kind is-building" : "area-kind",
    );
    appendTextElement(
      itemEl,
      "span",
      `${cellCount}格 (${bbox.w}x${bbox.h})`,
      "area-pos",
    );
    container.appendChild(itemEl);
  });

  // 绑定点击事件
  if (state._lastAreaClickIndex === undefined) state._lastAreaClickIndex = -1;
  container.querySelectorAll(".area-item").forEach((el) => {
    el.addEventListener("click", (e) => {
      const idx = parseInt(el.dataset.areaIndex);
      if (e.shiftKey && state._lastAreaClickIndex >= 0) {
        // Shift+click: 范围选择
        const start = Math.min(state._lastAreaClickIndex, idx);
        const end = Math.max(state._lastAreaClickIndex, idx);
        for (let i = start; i <= end; i++) {
          if (!state.selectedAreas.some((sa) => sa.id === state.areas[i].id)) {
            state.selectedAreas.push(state.areas[i]);
          }
        }
        renderAreaListInEditor();
      } else if (e.ctrlKey || e.metaKey) {
        const areaId = el.dataset.areaId;
        const existing = state.selectedAreas.findIndex(
          (sa) => sa.id === areaId,
        );
        if (existing >= 0) {
          state.selectedAreas.splice(existing, 1);
        } else {
          state.selectedAreas.push(state.areas[idx]);
        }
        renderAreaListInEditor();
      } else {
        state.selectedAreas = [];
        state.editorSelectedArea = state.areas[idx];
        renderAreaProperties(state.areas[idx]);
        renderAreaListInEditor();
      }
      state._lastAreaClickIndex = idx;
    });
  });

  // 更新计数
  const countEl = document.getElementById("area-count");
  if (countEl) countEl.textContent = state.areas.length;
}

function renderAreaProperties(area) {
  const panel = document.getElementById("editor-area-properties");
  if (!panel) return;

  clearElement(panel);
  if (!area) {
    appendTextElement(panel, "div", "点击区域查看属性", "empty-state");
    return;
  }

  const bbox = computeAreaBBox(area);
  const cellCount = Array.isArray(area?.cells) ? area.cells.length : 0;
  normalizeAreaSemantics(area);
  const building = getAreaBuilding(area);

  const semanticsGroup = document.createElement("div");
  semanticsGroup.className = [
    "area-semantics-card",
    building.enabled ? "is-enabled" : "is-terrain",
  ].join(" ");

  const semanticsHeader = document.createElement("div");
  semanticsHeader.className = "area-semantics-header";
  const headerText = document.createElement("div");
  appendTextElement(headerText, "h4", "建筑语义编辑器");
  appendTextElement(
    headerText,
    "p",
    building.enabled
      ? "这个区域会进入人物认知、决策和数值效果。"
      : "当前是地形/装饰区域，人物只会识别位置，不会当成建筑行动目标。",
    "area-semantics-hint",
  );
  semanticsHeader.appendChild(headerText);
  const modePill = document.createElement("span");
  modePill.className = building.enabled
    ? "area-semantics-mode is-building"
    : "area-semantics-mode";
  modePill.textContent = building.enabled ? "建筑" : "地形";
  semanticsHeader.appendChild(modePill);
  semanticsGroup.appendChild(semanticsHeader);

  const enabledLabel = document.createElement("label");
  enabledLabel.className = "checkbox-label area-semantics-toggle";
  const enabledInput = document.createElement("input");
  enabledInput.type = "checkbox";
  enabledInput.id = "area-building-enabled";
  enabledInput.checked = Boolean(building.enabled);
  enabledLabel.appendChild(enabledInput);
  appendTextElement(enabledLabel, "span", "把这个区域设为建筑，让人物理解并使用它");
  semanticsGroup.appendChild(enabledLabel);

  const semanticsBody = document.createElement("div");
  semanticsBody.className = building.enabled
    ? "area-semantics-body"
    : "area-semantics-body is-disabled";

  const purposeGroup = document.createElement("div");
  purposeGroup.className = "form-group";
  appendTextElement(purposeGroup, "label", "建筑用途");
  const purposeSelect = document.createElement("select");
  purposeSelect.id = "area-building-purpose";
  purposeSelect.disabled = !building.enabled;
  for (const purpose of BUILDING_PURPOSES) {
    const option = document.createElement("option");
    option.value = purpose.value;
    option.textContent = purpose.label;
    option.selected = building.purpose === purpose.value;
    purposeSelect.appendChild(option);
  }
  purposeGroup.appendChild(purposeSelect);
  semanticsBody.appendChild(purposeGroup);

  const descriptionGroup = document.createElement("div");
  descriptionGroup.className = "form-group";
  appendTextElement(descriptionGroup, "label", "人物认知描述");
  const descriptionInput = document.createElement("textarea");
  descriptionInput.id = "area-building-description";
  descriptionInput.rows = 3;
  descriptionInput.disabled = !building.enabled;
  descriptionInput.placeholder =
    "例如：这里能治疗受伤居民，健康低时应优先前来。";
  descriptionInput.value = building.agentDescription || "";
  descriptionGroup.appendChild(descriptionInput);
  semanticsBody.appendChild(descriptionGroup);

  const tagsGroup = document.createElement("div");
  tagsGroup.className = "form-group";
  appendTextElement(tagsGroup, "label", "建筑效果数值");
  appendTextElement(
    tagsGroup,
    "div",
    "滑条范围为 -2 到 2；需要突破时可直接在数字框输入更大或更小的值。数值为 0 表示关闭该效果。",
    "area-semantics-hint",
  );
  const tagGrid = document.createElement("div");
  tagGrid.className = "area-semantics-values";
  for (const tag of BUILDING_EFFECT_TAGS) {
    const control = tag.control || {};
    const currentValue = Number(building.effectValues?.[tag.key] ?? 0);
    const valueRow = document.createElement("div");
    valueRow.className = "area-semantics-value-row";
    valueRow.title = tag.description || "";

    const labelWrap = document.createElement("div");
    labelWrap.className = "area-semantics-value-label";
    appendTextElement(labelWrap, "span", tag.label);
    appendTextElement(
      labelWrap,
      "small",
      control.unit || "",
      "area-semantics-value-unit",
    );
    valueRow.appendChild(labelWrap);

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = String(control.min ?? -2);
    slider.max = String(control.max ?? 2);
    slider.step = String(control.step ?? 0.01);
    const sliderMin = Number(slider.min);
    const sliderMax = Number(slider.max);
    slider.value = String(
      Math.max(
        sliderMin,
        Math.min(sliderMax, Number.isFinite(currentValue) ? currentValue : 0),
      ),
    );
    slider.disabled = !building.enabled;
    slider.dataset.effectKey = tag.key;
    slider.className = "area-semantics-value-slider";
    slider.classList.toggle(
      "is-outside-slider-range",
      Number.isFinite(currentValue) &&
        (currentValue < sliderMin || currentValue > sliderMax),
    );
    valueRow.appendChild(slider);

    const numberInput = document.createElement("input");
    numberInput.type = "number";
    numberInput.step = String(control.step ?? 0.01);
    numberInput.value = String(Number.isFinite(currentValue) ? currentValue : 0);
    numberInput.disabled = !building.enabled;
    numberInput.dataset.effectKey = tag.key;
    numberInput.className = "area-semantics-value-number";
    valueRow.appendChild(numberInput);

    tagGrid.appendChild(valueRow);
  }
  tagsGroup.appendChild(tagGrid);
  semanticsBody.appendChild(tagsGroup);

  const servicePreview = document.createElement("div");
  servicePreview.className = "area-semantics-service-preview";
  servicePreview.id = "area-semantics-service-preview";
  const serviceText = (area.services || []).map(describeService).filter(Boolean);
  servicePreview.textContent = building.enabled
    ? serviceText.length
      ? `服务: ${serviceText.join("；")}`
      : "服务: 无。勾选标签后会自动生成默认服务。"
    : "地形模式不会生成服务；开启建筑后可选择效果标签。";
  semanticsBody.appendChild(servicePreview);
  semanticsGroup.appendChild(semanticsBody);
  panel.appendChild(semanticsGroup);

  const nameGroup = document.createElement("div");
  nameGroup.className = "form-group";
  appendTextElement(nameGroup, "label", "名称");
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.id = "area-name-input";
  nameInput.value = area.name || "";
  nameInput.placeholder = "区域名称";
  nameGroup.appendChild(nameInput);
  panel.appendChild(nameGroup);

  const blockedGroup = document.createElement("div");
  blockedGroup.className = "form-group";
  const checkboxLabel = document.createElement("label");
  checkboxLabel.className = "checkbox-label";
  const blockedInput = document.createElement("input");
  blockedInput.type = "checkbox";
  blockedInput.id = "area-blocked-input";
  blockedInput.checked = Boolean(area.isBlocked);
  checkboxLabel.appendChild(blockedInput);
  appendTextElement(checkboxLabel, "span", "不可通行");
  blockedGroup.appendChild(checkboxLabel);
  panel.appendChild(blockedGroup);

  const infoGroup = document.createElement("div");
  infoGroup.className = "form-group";
  appendTextElement(
    infoGroup,
    "span",
    `格子: ${cellCount}  包围盒: (${bbox.x}, ${bbox.y}) ${bbox.w}x${bbox.h}`,
    "area-info",
  );
  panel.appendChild(infoGroup);

  const actionsGroup = document.createElement("div");
  actionsGroup.className = "form-actions";
  const deleteButton = document.createElement("button");
  deleteButton.className = "btn btn-small btn-danger";
  deleteButton.id = "btn-delete-area";
  deleteButton.textContent = "删除";
  actionsGroup.appendChild(deleteButton);
  panel.appendChild(actionsGroup);

  // 绑定事件
  document.getElementById("area-name-input")?.addEventListener("input", (e) => {
    area.name = e.target.value;
    markEditorMapDirty();
    renderAreaListInEditor();
  });

  document
    .getElementById("area-blocked-input")
    ?.addEventListener("change", (e) => {
      area.isBlocked = e.target.checked;
      markEditorMapDirty();
      renderAreaListInEditor();
    });

  const updateBuildingSemantics = (options = {}) => {
    const { rerender = true } = options;
    const metadata = area.metadata && typeof area.metadata === "object"
      ? area.metadata
      : {};
    const effectValues = {};
    panel
      .querySelectorAll(".area-semantics-value-number")
      .forEach((input) => {
        const key = input.dataset.effectKey;
        if (!key) return;
        const value = Number(input.value);
        effectValues[key] = Number.isFinite(value) ? value : 0;
      });
    const tags = Object.entries(effectValues)
      .filter(([, value]) => Number(value) !== 0)
      .map(([key]) => key);
    area.metadata = {
      ...metadata,
      building: {
        enabled: Boolean(
          document.getElementById("area-building-enabled")?.checked,
        ),
        purpose:
          document.getElementById("area-building-purpose")?.value || "neutral",
        agentDescription:
          document.getElementById("area-building-description")?.value || "",
        tags,
        effectValues,
      },
    };
    normalizeAreaSemantics(area);
    markEditorMapDirty();
    if (rerender) {
      renderAreaListInEditor();
      renderAreaProperties(area);
    }
  };

  document
    .getElementById("area-building-enabled")
    ?.addEventListener("change", updateBuildingSemantics);
  document
    .getElementById("area-building-purpose")
    ?.addEventListener("change", updateBuildingSemantics);
  document
    .getElementById("area-building-description")
    ?.addEventListener("input", () => {
      updateBuildingSemantics({ rerender: false });
    });
  panel.querySelectorAll(".area-semantics-value-slider").forEach((input) => {
    input.addEventListener("input", () => {
      const numberInput = panel.querySelector(
        `.area-semantics-value-number[data-effect-key="${input.dataset.effectKey}"]`,
      );
      if (numberInput) numberInput.value = input.value;
      updateBuildingSemantics({ rerender: false });
    });
    input.addEventListener("change", updateBuildingSemantics);
  });
  panel.querySelectorAll(".area-semantics-value-number").forEach((input) => {
    input.addEventListener("input", () => {
      const slider = panel.querySelector(
        `.area-semantics-value-slider[data-effect-key="${input.dataset.effectKey}"]`,
      );
      if (slider) {
        const value = Number(input.value);
        const min = Number(slider.min);
        const max = Number(slider.max);
        slider.value = String(
          Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : 0,
        );
        slider.classList.toggle(
          "is-outside-slider-range",
          Number.isFinite(value) && (value < min || value > max),
        );
      }
      updateBuildingSemantics({ rerender: false });
    });
    input.addEventListener("change", updateBuildingSemantics);
  });

  document.getElementById("btn-delete-area")?.addEventListener("click", () => {
    const idx = state.areas.indexOf(area);
    if (idx >= 0) {
      state.areas.splice(idx, 1);
      markEditorMapDirty();
      state.editorSelectedArea = null;
      renderAreaListInEditor();
      renderAreaProperties(null);
    }
  });
}

function updateEditorInfo() {
  const gridInfo = document.getElementById("map-dimensions");
  if (gridInfo) {
    const cols = Math.floor(CONFIG.MAP_IMAGE_WIDTH / CONFIG.MAP_CELL_SIZE);
    const rows = Math.floor(
      (CONFIG.MAP_IMAGE_HEIGHT - CONFIG.MAP_TOP_OFFSET) / CONFIG.MAP_CELL_SIZE,
    );
    gridInfo.textContent = `${cols} x ${rows}`;
  }
}

function updateAgentPositionsForNewCellSize(oldSize, newSize) {
  if (!state.world) return;
  const ratio = oldSize / newSize;
  for (const agent of state.world.agents.values()) {
    const pos = agent.getPosition();
    agent.setPosition({
      x: Math.round(pos.x * ratio),
      y: Math.round(pos.y * ratio),
    });
  }
}

function serializeAreasForPersistence() {
  return state.areas.map((area) => normalizeAreaRecord(area));
}

async function persistEditorMapNow(options = {}) {
  const { silent = true } = options;
  const payload = {
    areas: serializeAreasForPersistence(),
    tile_size: CONFIG.MAP_CELL_SIZE,
  };

  state.mapSavePending = false;
  state.mapSaveInFlight = true;
  state.mapSaveError = null;

  try {
    const [mapRes, stateRes] = await Promise.all([
      fetch("/api/map/areas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ areas: payload.areas }),
      }),
      fetch("/api/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tile_size: payload.tile_size }),
      }),
    ]);

    if (!mapRes.ok) {
      throw new Error(await mapRes.text());
    }
    if (!stateRes.ok) {
      throw new Error(await stateRes.text());
    }
  } catch (err) {
    state.mapSaveError = err;
    if (!silent) {
      throw err;
    }
    console.error("地图自动保存失败:", err);
  } finally {
    state.mapSaveInFlight = false;
  }
}

function scheduleEditorMapPersist(options = {}) {
  const { immediate = false, silent = true } = options;
  state.mapSavePending = true;

  if (state.mapSaveTimer) {
    clearTimeout(state.mapSaveTimer);
    state.mapSaveTimer = null;
  }

  const runPersist = () => {
    state.mapSaveTimer = null;
    void persistEditorMapNow({ silent });
  };

  if (immediate) {
    runPersist();
    return;
  }

  state.mapSaveTimer = setTimeout(runPersist, MAP_SAVE_DEBOUNCE_MS);
}

function markEditorMapDirty(options = {}) {
  const { skipWorldSync = false, immediate = false, silent = true } = options;
  if (!skipWorldSync) {
    state.world?.setAreas(state.areas);
  }
  scheduleEditorMapPersist({ immediate, silent });
}

function flushEditorMapPersistOnPageHide() {
  if (!state.mapSavePending && !state.isEditMode) return;
  try {
    const mapPayload = JSON.stringify({
      areas: serializeAreasForPersistence(),
    });
    const statePayload = JSON.stringify({
      tile_size: CONFIG.MAP_CELL_SIZE,
    });
    fetch("/api/map/areas", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: mapPayload,
      keepalive: true,
    }).catch(() => {});
    fetch("/api/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: statePayload,
      keepalive: true,
    }).catch(() => {});
    state.mapSavePending = false;
  } catch (err) {
    console.error("页面关闭时地图保存失败:", err);
  }
}

// ========== 保存/加载 ==========
function saveMapData() {
  const data = {
    version: "2.0",
    tileSize: CONFIG.MAP_CELL_SIZE,
    areas: serializeAreasForPersistence(),
  };

  // 保存到后端数据库
  fetch("/api/map/areas", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ areas: data.areas }),
  }).catch((err) => console.error("保存地图到数据库失败:", err));

  // 也导出本地文件作为备份
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "map-data.json";
  a.click();
  URL.revokeObjectURL(url);
}

async function loadMapFromDBOrDefault() {
  try {
    const res = await fetch("/api/map/areas");
    if (res.ok) {
      const areas = await res.json();
      if (areas && areas.length > 0) {
        // 兼容字段名 isBlocked / is_blocked
        const normalized = areas.map((a) => normalizeAreaRecord(a));
        const hasUsableCells = normalized.some((area) => area.cells.length > 0);
        if (!hasUsableCells) {
          console.warn(
            "Loaded map areas from DB, but all of them had zero cells. Falling back to default map.",
          );
        } else {
          try {
          const stateRes = await fetch("/api/state");
          if (stateRes.ok) {
            const persistedState = await stateRes.json();
            const persistedTileSize = Number.parseInt(
              persistedState?.tile_size,
              10,
            );
            if (Number.isFinite(persistedTileSize) && persistedTileSize >= 8) {
              CONFIG.MAP_CELL_SIZE = persistedTileSize;
              const tileInput = document.getElementById("tile-size-input");
              if (tileInput) tileInput.value = String(CONFIG.MAP_CELL_SIZE);
            }
          }
        } catch (stateErr) {
          console.log("读取地图格子大小失败，继续使用当前配置:", stateErr);
        }
        state.areas = normalized;
        state.world.setAreas(state.areas);
        state.world.updateGridSize(CONFIG.MAP_CELL_SIZE);
        saveAreaHistory();
        return;
        }
      }
    }
  } catch (err) {
    console.log("数据库无地图数据，从默认文件加载");
  }

  // 从默认文件加载
  try {
    const res = await fetch("/assets/default-map.json");
    const data = await res.json();
    if (data.tileSize) {
      CONFIG.MAP_CELL_SIZE = data.tileSize;
      const tileInput = document.getElementById("tile-size-input");
      if (tileInput) tileInput.value = data.tileSize;
      state.world?.updateGridSize(CONFIG.MAP_CELL_SIZE);
    }
    if (data.areas && data.areas.length > 0) {
      state.areas = data.areas.map((a) => normalizeAreaRecord(a));
      state.world.setAreas(state.areas);
      state.world.updateGridSize(CONFIG.MAP_CELL_SIZE);
      saveAreaHistory();

      // 同步默认地图到数据库
      try {
        await persistEditorMapNow({ silent: false });
      } catch (syncErr) {
        console.log("同步默认地图到数据库失败:", syncErr);
      }
    }
  } catch (err) {
    console.log("默认地图加载失败:", err);
  }
}

function loadMapData(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const data = JSON.parse(event.target.result);
      if (data.tileSize) {
        CONFIG.MAP_CELL_SIZE = data.tileSize;
        state.world?.updateGridSize(CONFIG.MAP_CELL_SIZE);
        updateEditorInfo();
      }
      if (data.areas) {
        // 兼容旧格式：把 {x,y,w,h} 转换为 {cells}
        state.areas = data.areas.map((a) => normalizeAreaRecord(a));
        state.world.setAreas(state.areas);
        state.world.updateGridSize(CONFIG.MAP_CELL_SIZE);
        renderAreaListInEditor();
        saveAreaHistory();
        scheduleEditorMapPersist({ immediate: true, silent: false });
      }
    } catch (err) {
      console.error("加载地图数据失败:", err);
    }
  };
  reader.readAsText(file);
}

function clearMap() {
  state.areas = [];
  markEditorMapDirty({ immediate: true });
  state.editorSelectedArea = null;
  renderAreaListInEditor();
  renderAreaProperties(null);
}

function isAgentThinking(agent) {
  const actionDesc =
    typeof agent?.currentAction === "object"
      ? agent.currentAction?.description
      : agent?.currentAction;
  return agent?.status === "busy" && actionDesc === "正在思考...";
}

function getAgentStatusMarker(agent) {
  if (agent?.status === "working") {
    return { color: "#f4c542", className: "working" };
  }
  if (isAgentThinking(agent)) {
    return { color: "#e24a4a", className: "thinking" };
  }
  if (agent?.status === "moving") {
    return { color: "#4a90e2", className: "moving" };
  }
  if (agent?.status === "sleeping") {
    return { color: "#6c757d", className: "sleeping" };
  }
  if (agent?.status === "busy") {
    return { color: "#f4c542", className: "busy" };
  }
  return { color: "#28a745", className: "idle" };
}

// ========== Agent 绘制 ==========
function drawAgent(ctx, agent, cellSize, visualState = null) {
  const x = agent.position.x * cellSize;
  const y = agent.position.y * cellSize;
  const animConfig = getCharacterAnimation(agent.agentId);
  const displaySize = getCharacterDisplaySize(agent.agentId);
  const displayWidth = Array.isArray(displaySize) ? displaySize[0] : 38;
  const displayHeight = Array.isArray(displaySize) ? displaySize[1] : 58;
  const shadowAlpha = visualState?.agentShadowAlpha ?? 0.3;
  const agentDimAlpha = visualState?.agentDimAlpha ?? 0;
  const spritePhase = visualState?.phase || "day";
  const nightExtraDim =
    spritePhase === "night"
      ? 0.22
      : spritePhase === "dusk"
        ? 0.08
        : 0;
  const labelDimAlpha = clamp01(
    (visualState?.labelDimAlpha ?? 0) + nightExtraDim * 0.45,
  );
  const totalAgentDim = clamp01(agentDimAlpha + nightExtraDim);
  const spriteAlpha = Math.max(0.16, 1 - totalAgentDim * 1.08);
  const spriteBrightness = Math.max(
    0.42,
    1 - totalAgentDim * 0.46 - nightExtraDim * 0.92,
  );
  const spriteSaturation = Math.max(
    0.48,
    1 - nightExtraDim * 1.08 - labelDimAlpha * 0.34,
  );
  const spriteContrast = Math.max(0.74, 1 - nightExtraDim * 0.3);
  const statusMarker = getAgentStatusMarker(agent);
  const statusColor = mixHexColors(statusMarker.color, "#8a949c", labelDimAlpha);
  const outlineColor = mixHexColors("#ffffff", "#cfd5da", labelDimAlpha);
  let renderWidth = displayWidth * CONFIG.SPRITE_SCALE;
  let renderHeight = displayHeight * CONFIG.SPRITE_SCALE;

  const drawGroundShadow = (width, height) => {
    ctx.save();
    ctx.fillStyle = rgbaFromHex("#000000", shadowAlpha);
    ctx.beginPath();
    ctx.ellipse(
      x,
      y + height / 2 - 2,
      width / 3 + labelDimAlpha * 4,
      6 + labelDimAlpha * 2,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.restore();
  };

  const drawSpriteLayer = (drawSprite) => {
    ctx.save();
    ctx.globalAlpha = spriteAlpha;
    if (nightExtraDim > 0 || agentDimAlpha > 0.08) {
      ctx.filter = `brightness(${spriteBrightness}) saturate(${spriteSaturation}) contrast(${spriteContrast})`;
    }
    drawSprite();
    ctx.restore();
  };

  if (animConfig) {
    let direction = agent.facingDirection || "down";
    const action = agent.status === "moving" ? "walk" : "idle";
    const frameCount =
      action === "walk" ? animConfig.walkFrames : animConfig.idleFrames;
    const flipH = direction === "right";
    if (flipH) direction = "left";

    let state = agentAnimState.get(agent.agentId);
    if (!state) {
      state = { frameIndex: 0, lastFrameTime: 0, lastAction: action };
      agentAnimState.set(agent.agentId, state);
    }

    if (action !== state.lastAction) {
      state.frameIndex = 0;
      state.lastAction = action;
      state.lastFrameTime = performance.now();
    }

    if (action === "walk" && frameCount > 1) {
      const now = performance.now();
      if (now - state.lastFrameTime > 250) {
        state.frameIndex = (state.frameIndex + 1) % frameCount;
        state.lastFrameTime = now;
      }
    }

    const charKey = getCharacterKey(agent.agentId);
    const framePath = `${ASSET_CONFIG.basePath}/${animConfig.basePath}${charKey}-${direction}-${action}-${state.frameIndex}.png`;
    const sprite = imageLoader.getImage(framePath);

    renderWidth = 38;
    renderHeight = sprite
      ? Math.round((renderWidth * sprite.naturalHeight) / sprite.naturalWidth)
      : Math.round((renderWidth * 174) / 113);
    drawGroundShadow(renderWidth, renderHeight);

    if (sprite) {
      drawSpriteLayer(() => {
        if (flipH) {
          ctx.translate(x, y);
          ctx.scale(-1, 1);
          ctx.drawImage(
            sprite,
            -renderWidth / 2,
            -renderHeight / 2,
            renderWidth,
            renderHeight,
          );
        } else {
          ctx.drawImage(
            sprite,
            x - renderWidth / 2,
            y - renderHeight / 2,
            renderWidth,
            renderHeight,
          );
        }
      });
    } else {
      ctx.fillStyle = mixHexColors("#e94560", "#7f696d", totalAgentDim + 0.08);
      ctx.fillRect(
        x - renderWidth / 2,
        y - renderHeight / 2,
        renderWidth,
        renderHeight,
      );
    }
  } else {
    const spritePath = getCharacterSprite(agent.agentId);
    const sprite = spritePath ? imageLoader.getImage(spritePath) : null;

    if (sprite) {
      renderWidth = 38;
      renderHeight = Math.round(
        (renderWidth * sprite.naturalHeight) / sprite.naturalWidth,
      );
      drawGroundShadow(renderWidth, renderHeight);
      drawSpriteLayer(() => {
        ctx.drawImage(
          sprite,
          x - renderWidth / 2,
          y - renderHeight / 2,
          renderWidth,
          renderHeight,
        );
      });
    } else {
      const radius = cellSize * 0.8;
      renderWidth = radius * 2;
      renderHeight = radius * 2;
      ctx.beginPath();
      ctx.arc(x, y, radius + 2, 0, Math.PI * 2);
      ctx.fillStyle = statusColor;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = mixHexColors(
        CONFIG.AGENT_COLOR,
        "#62747b",
        totalAgentDim + labelDimAlpha * 0.2,
      );
      ctx.fill();
      ctx.strokeStyle = outlineColor;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  const offsetX = renderWidth / 2;
  const offsetY = renderHeight / 2;
  const markerSize = 10;
  const markerX = x + offsetX - 15;
  const markerY = y + offsetY - 15;
  ctx.fillStyle = statusColor;
  ctx.fillRect(markerX, markerY, markerSize, markerSize);
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = 1;
  ctx.strokeRect(markerX, markerY, markerSize, markerSize);

  const nameY = y - renderHeight / 2 - 8;
  ctx.font = "bold 11px sans-serif";
  const nameWidth = ctx.measureText(agent.name).width + 10;
  ctx.fillStyle = `rgba(0, 0, 0, ${0.7 + labelDimAlpha * 0.12})`;
  ctx.fillRect(x - nameWidth / 2, nameY - 12, nameWidth, 16);
  ctx.fillStyle = mixHexColors("#ffffff", "#c8d2d8", labelDimAlpha);
  ctx.textAlign = "center";
  ctx.fillText(agent.name, x, nameY);

  const hasAction =
    agent.currentAction &&
    (typeof agent.currentAction === "object"
      ? agent.currentAction.description
      : agent.currentAction);
  const hasDialogue = dialogueBubbles.has(agent.agentId);

  const baseY = nameY - 15;
  let currentBubbleY = baseY;

  if (hasDialogue) {
    const bubble = dialogueBubbles.get(agent.agentId);
    const message = String(bubble?.message || "");
    const paddingY = 6;
    const fixedWidth = 120;
    const lineHeight = 14;
    const fontSize = 10;
    const maxCharsPerLine = 18;

    const lines = [];
    for (let i = 0; i < message.length; i += maxCharsPerLine) {
      lines.push(message.substring(i, i + maxCharsPerLine));
    }
    if (lines.length === 0) lines.push("");

    const bubbleWidth = fixedWidth;
    const bubbleHeight = paddingY * 2 + lines.length * lineHeight;
    const bubbleBottomY = currentBubbleY;
    const bubbleTopY = bubbleBottomY - bubbleHeight;

    ctx.fillStyle = rgbaFromHex(
      mixHexColors("#c8e6ff", "#90a1ae", labelDimAlpha * 0.75),
      0.95,
    );
    ctx.strokeStyle = mixHexColors("#4a90d9", "#7a8691", labelDimAlpha);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(
      x - bubbleWidth / 2,
      bubbleTopY,
      bubbleWidth,
      bubbleHeight,
      8,
    );
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x - 6, bubbleBottomY);
    ctx.lineTo(x, bubbleBottomY + 6);
    ctx.lineTo(x + 6, bubbleBottomY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = mixHexColors("#333333", "#68727b", labelDimAlpha);
    ctx.textAlign = "center";
    ctx.font = fontSize + "px sans-serif";
    const startY = bubbleTopY + paddingY + fontSize;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], x, startY + i * lineHeight);
    }

    currentBubbleY = bubbleTopY - 4;
  }

  if (hasAction) {
    const desc =
      typeof agent.currentAction === "object"
        ? agent.currentAction.description
        : agent.currentAction;
    const paddingY = 6;
    const maxCharsPerLine = 8;
    const lineHeight = 14;
    const fontSize = 10;

    const lines = [];
    for (let i = 0; i < desc.length; i += maxCharsPerLine) {
      lines.push(desc.substring(i, i + maxCharsPerLine));
    }

    const bubbleWidth = 110;
    const bubbleHeight = paddingY * 2 + lines.length * lineHeight;
    const bubbleBottomY = currentBubbleY;
    const bubbleTopY = bubbleBottomY - bubbleHeight;

    ctx.fillStyle = rgbaFromHex(
      mixHexColors("#fffadc", "#b7ab91", labelDimAlpha * 0.8),
      0.95,
    );
    ctx.strokeStyle = mixHexColors("#e6a23c", "#9f8b62", labelDimAlpha);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(
      x - bubbleWidth / 2,
      bubbleTopY,
      bubbleWidth,
      bubbleHeight,
      6,
    );
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x - 6, bubbleBottomY);
    ctx.lineTo(x, bubbleBottomY + 6);
    ctx.lineTo(x + 6, bubbleBottomY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = mixHexColors("#666666", "#8a8b8d", labelDimAlpha);
    ctx.textAlign = "center";
    ctx.font = fontSize + "px sans-serif";
    const startY = bubbleTopY + paddingY + fontSize;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], x, startY + i * lineHeight);
    }
  }

  if (agent.status === "sleeping") {
    const sleepImage = imageLoader.getImage("/assets/ui/sleep-zzz.png");
    let sleepY = currentBubbleY - 25;
    if (!hasAction && !hasDialogue) {
      sleepY = baseY - 10;
    }
    if (sleepImage) {
      const oscillation = Math.sin(Date.now() / 500) * 3;
      ctx.save();
      ctx.globalAlpha = Math.max(0.45, 1 - labelDimAlpha * 0.8);
      ctx.drawImage(sleepImage, x + 15, sleepY + oscillation, 20, 20);
      ctx.restore();
    } else {
      ctx.fillStyle = mixHexColors("#6495ed", "#7a8797", labelDimAlpha);
      ctx.font = "bold 14px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("Zzz...", x + 15, sleepY + 10);
    }
  }
}

// ========== 交互处理 ==========
function handleMouseMove(e) {
  // 拖拽平移
  if (isPanning) {
    canvasPanX = panOffsetX + (e.clientX - panStartX);
    canvasPanY = panOffsetY + (e.clientY - panStartY);
    updateCanvasTransform();
    updateMinimapViewport();
    return;
  }

  const rect = state.canvas.getBoundingClientRect();
  const scaleX = state.canvas.width / rect.width;
  const scaleY = state.canvas.height / rect.height;
  const mouseX = (e.clientX - rect.left) * scaleX;
  const mouseY = (e.clientY - rect.top) * scaleY;
  const cellSize = CONFIG.MAP_CELL_SIZE;

  // 编辑模式下画笔拖拽：根据手势模式添加或移除格子
  if (state.isEditMode && state.paintingArea) {
    const { gridX, gridY } = screenToGrid(e);
    const key = `${gridX},${gridY}`;
    if (!state.affectedCells.has(key)) {
      state.affectedCells.add(key);
      if (state.paintGestureMode === "paint") {
        state.paintingArea.cells.push({ x: gridX, y: gridY });
      } else {
        state.paintingArea.cells = state.paintingArea.cells.filter(
          (c) => !(c.x === gridX && c.y === gridY),
        );
        if (state.paintingArea.cells.length === 0) {
          const idx = state.areas.indexOf(state.paintingArea);
          if (idx >= 0) state.areas.splice(idx, 1);
          state.paintingArea = null;
        }
      }
      state.world.setAreas(state.areas);
    }
    return;
  }

  // 编辑模式下更新圈选路径
  if (state.isEditMode && state.isFreehand) {
    const { gridX, gridY } = screenToGrid(e);
    const last = state.freehandPath[state.freehandPath.length - 1];
    if (!last || last.x !== gridX || last.y !== gridY) {
      state.freehandPath.push({ x: gridX, y: gridY });
    }
    return;
  }

  if (!state.pinnedSupplyTooltip) {
    const supplyHotspot = getSupplyHotspotAtCanvasPoint(mouseX, mouseY);
    if (supplyHotspot) {
      showSupplyStockPopup(e.clientX, e.clientY, supplyHotspot);
      state.hoveredElement = { type: "supplyStock", data: supplyHotspot };
      state.canvas.style.cursor = "pointer";
      return;
    }
  }

  const worldState = state.world.getWorldState();
  let hovered = null;

  // 检查 Agent
  for (const agent of worldState.agents.values()) {
    const displaySize = getCharacterDisplaySize(agent.agentId);
    const drawWidth = displaySize[0] * CONFIG.SPRITE_SCALE;
    const drawHeight = displaySize[1] * CONFIG.SPRITE_SCALE;
    const ax = agent.position.x * cellSize;
    const ay = agent.position.y * cellSize;

    if (
      mouseX >= ax - drawWidth / 2 &&
      mouseX <= ax + drawWidth / 2 &&
      mouseY >= ay - drawHeight / 2 &&
      mouseY <= ay + drawHeight / 2
    ) {
      hovered = { type: "agent", data: agent };
      break;
    }
  }

  if (hovered) {
    showTooltip(e.clientX, e.clientY, hovered);
    state.hoveredElement = hovered;
  } else {
    if (!state.pinnedSupplyTooltip) {
      hideTooltip();
    }
    state.hoveredElement = null;
    state.canvas.style.cursor = "";
  }
}

function handleCanvasClick(e) {
  // 编辑模式下由 mousedown/mouseup 处理
  if (state.isEditMode) {
    return;
  }

  const rect = state.canvas.getBoundingClientRect();
  const scaleX = state.canvas.width / rect.width;
  const scaleY = state.canvas.height / rect.height;
  const mouseX = (e.clientX - rect.left) * scaleX;
  const mouseY = (e.clientY - rect.top) * scaleY;
  const cellSize = CONFIG.MAP_CELL_SIZE;

  const supplyHotspot = getSupplyHotspotAtCanvasPoint(mouseX, mouseY);
  if (supplyHotspot) {
    state.pinnedSupplyTooltip = true;
    showSupplyStockPopup(e.clientX, e.clientY, supplyHotspot, { pinned: true });
    hideAgentCard();
    return;
  }

  state.pinnedSupplyTooltip = false;
  hideTooltip();

  const worldState = state.world.getWorldState();

  for (const agent of worldState.agents.values()) {
    const displaySize = getCharacterDisplaySize(agent.agentId);
    const drawWidth = displaySize[0] * CONFIG.SPRITE_SCALE;
    const drawHeight = displaySize[1] * CONFIG.SPRITE_SCALE;
    const ax = agent.position.x * cellSize;
    const ay = agent.position.y * cellSize;

    if (
      mouseX >= ax - drawWidth / 2 &&
      mouseX <= ax + drawWidth / 2 &&
      mouseY >= ay - drawHeight / 2 &&
      mouseY <= ay + drawHeight / 2
    ) {
      // 显示属性卡片
      showAgentCard(agent, e.clientX, e.clientY);
      return;
    }
  }

  // 点击空白处关闭卡片
  hideAgentCard();
}

// ========== 角色属性卡片 ==========

function showAgentCard(agent, clickX, clickY) {
  const card = document.getElementById("agent-card");
  if (!card) return;

  // 填充数据
  const portraitPath = getCharacterPortrait(agent.agentId);
  const portraitImg = document.getElementById("agent-card-portrait");
  if (portraitImg) {
    portraitImg.src = portraitPath || "";
    portraitImg.onerror = () => {
      portraitImg.style.display = "none";
    };
    portraitImg.onload = () => {
      portraitImg.style.display = "block";
    };
  }

  document.getElementById("agent-card-name").textContent = agent.name;
  document.getElementById("agent-card-status").textContent = agent.status;

  // 健康条（保留1位小数）
  const healthCurrent = Math.round((agent.health?.current ?? 0) * 10) / 10;
  const healthMax = Math.round((agent.health?.max ?? 100) * 10) / 10;
  const healthPercent = healthMax > 0 ? (healthCurrent / healthMax) * 100 : 0;
  document.getElementById("agent-card-health-bar").style.width =
    `${healthPercent}%`;
  document.getElementById("agent-card-health-text").textContent =
    `${healthCurrent}/${healthMax}`;

  // 饱腹条
  const fullnessValue = Math.round((agent.fullness ?? 0) * 10) / 10;
  const fullnessPercent = Math.min(Math.max(fullnessValue, 0), 100);
  document.getElementById("agent-card-fullness-bar").style.width =
    `${fullnessPercent}%`;
  document.getElementById("agent-card-fullness-text").textContent =
    `${fullnessValue}/100`;

  // 积分
  document.getElementById("agent-card-points").textContent =
    Math.round((agent.greenPoints ?? 0) * 10) / 10;

  // 当前动作
  const actionDesc =
    typeof agent.currentAction === "object"
      ? agent.currentAction?.description
      : agent.currentAction;
  document.getElementById("agent-card-action").textContent =
    actionDesc || "空闲";

  // 定位卡片
  const container = document.querySelector(".map-container");
  const containerRect = container.getBoundingClientRect();
  const cardWidth = 240;
  const cardHeight = 180;

  let left = clickX - containerRect.left + 10;
  let top = clickY - containerRect.top + 10;

  // 边界检查
  if (left + cardWidth > containerRect.width) {
    left = clickX - containerRect.left - cardWidth - 10;
  }
  if (top + cardHeight > containerRect.height) {
    top = clickY - containerRect.top - cardHeight - 10;
  }

  card.style.left = `${left}px`;
  card.style.top = `${top}px`;
  card.classList.remove("hidden");
}

function hideAgentCard() {
  const card = document.getElementById("agent-card");
  if (card) {
    card.classList.add("hidden");
  }
}

function renderDecisionHistory(container, decisions = []) {
  if (!container) return;
  clearElement(container);

  if (!Array.isArray(decisions) || decisions.length === 0) {
    appendTextElement(container, "div", "暂无决策记录", "empty-state");
    return;
  }

  for (const decision of [...decisions].slice(-10).reverse()) {
    const time = decision.gameTime ? new Date(decision.gameTime) : null;
    const timeLabel =
      time && !Number.isNaN(time.getTime())
        ? `${String(time.getHours()).padStart(2, "0")}:${String(time.getMinutes()).padStart(2, "0")}`
        : "--:--";
    const target = decision.target
      ? ` → (${decision.target.x}, ${decision.target.y})`
      : "";
    const source =
      decision.source === "fallback"
        ? "本地规则"
        : decision.source === "llm-unavailable"
          ? "LLM未接通"
          : "LLM";

    const itemEl = document.createElement("div");
    itemEl.className = "decision-history-item";
    appendTextElement(
      itemEl,
      "div",
      `第${decision.dayCount ?? "?"}天 ${timeLabel} · ${decision.type || "UNKNOWN"} · ${source}`,
      "decision-history-meta",
    );
    appendTextElement(
      itemEl,
      "div",
      `${decision.description || "无描述"}${target}`,
      "decision-history-desc",
    );
    container.appendChild(itemEl);
  }
}

function setupAgentCardListeners() {
  // 关闭按钮
  document
    .getElementById("agent-card-close")
    ?.addEventListener("click", hideAgentCard);

  // 点击卡片外部关闭（通过阻止事件冒泡实现）
  document.getElementById("agent-card")?.addEventListener("click", (e) => {
    e.stopPropagation();
  });
}

// ========== 鼠标事件 ==========
function handleCanvasMouseDown(e) {
  if (state.isEditMode) {
    const { gridX, gridY } = screenToGrid(e);

    if (state.editorTool === "area") {
      const key = `${gridX},${gridY}`;
      // Check if clicking on an existing painted cell → erase mode
      let targetArea = null;
      for (let i = state.areas.length - 1; i >= 0; i--) {
        if (state.areas[i].cells.some((c) => `${c.x},${c.y}` === key)) {
          targetArea = state.areas[i];
          break;
        }
      }

      state.paintedCells = new Set([key]);
      state.affectedCells = new Set([key]);

      if (targetArea) {
        // Erase mode: remove the clicked cell
        state.paintGestureMode = "erase";
        state.paintingArea = targetArea;
        targetArea.cells = targetArea.cells.filter(
          (c) => !(c.x === gridX && c.y === gridY),
        );
        if (targetArea.cells.length === 0) {
          const idx = state.areas.indexOf(targetArea);
          if (idx >= 0) state.areas.splice(idx, 1);
          state.paintingArea = null;
        }
      } else {
        // Paint mode: create new area
        state.paintGestureMode = "paint";
        const isBlocked = state.paintMode === "blocked";
        const area = {
          id: "area_" + Date.now() + "_" + ++_areaIdCounter,
          name: "",
          cells: [{ x: gridX, y: gridY }],
          isBlocked,
        };
        state.areas.push(area);
        state.paintingArea = area;
      }
      state.world.setAreas(state.areas);
      renderAreaListInEditor();
    } else if (state.editorTool === "freehand") {
      state.isFreehand = true;
      state.freehandPath = [{ x: gridX, y: gridY }];
    } else if (state.editorTool === "select") {
      selectAreaAt(gridX, gridY);
    } else if (state.editorTool === "eraser") {
      eraseAreaAt(gridX, gridY);
    } else if (state.editorTool === "pan") {
      isPanning = true;
      panStartX = e.clientX;
      panStartY = e.clientY;
      panOffsetX = canvasPanX;
      panOffsetY = canvasPanY;
      state.canvas.parentElement.style.cursor = "grabbing";
      e.preventDefault();
    }
    return;
  }

  // 非编辑模式：左键拖拽平移
  if (e.button === 0) {
    isPanning = true;
    panStartX = e.clientX;
    panStartY = e.clientY;
    panOffsetX = canvasPanX;
    panOffsetY = canvasPanY;
    state.canvas.parentElement.style.cursor = "grabbing";
    e.preventDefault();
  }
}

function handleCanvasMouseUp(e) {
  if (isPanning) {
    isPanning = false;
    state.canvas.parentElement.style.cursor = "grab";
  }

  if (state.isEditMode) {
    if (state.paintingArea) {
      if (state.paintingArea.cells.length > 0) {
        saveAreaHistory();
        scheduleEditorMapPersist();
      } else {
        // No cells painted, remove the empty area
        const idx = state.areas.indexOf(state.paintingArea);
        if (idx >= 0) state.areas.splice(idx, 1);
        markEditorMapDirty();
        renderAreaListInEditor();
      }
      state.paintingArea = null;
      state.paintedCells = new Set();
      state.affectedCells = new Set();
    }

    if (state.isFreehand && state.freehandPath.length > 0) {
      const pathCells = new Set();
      for (const p of state.freehandPath) {
        pathCells.add(`${p.x},${p.y}`);
      }

      // 1) 直接相交：路径穿过区域格子
      for (const area of state.areas) {
        for (const c of area.cells) {
          if (pathCells.has(`${c.x},${c.y}`)) {
            if (!state.selectedAreas.some((sa) => sa.id === area.id)) {
              state.selectedAreas.push(area);
            }
            break;
          }
        }
      }

      // 2) 洪水填充：检测路径围住的区域
      if (state.areas.length > state.selectedAreas.length) {
        let minX = Infinity,
          minY = Infinity,
          maxX = -Infinity,
          maxY = -Infinity;
        for (const p of state.freehandPath) {
          minX = Math.min(minX, p.x);
          minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x);
          maxY = Math.max(maxY, p.y);
        }
        const blocked = new Set(pathCells);
        const visited = new Set();
        const queue = [];
        // 从边界格子开始洪水填充
        for (let x = minX; x <= maxX; x++) {
          if (!blocked.has(`${x},${minY}`)) queue.push({ x, y: minY });
          if (!blocked.has(`${x},${maxY}`)) queue.push({ x, y: maxY });
        }
        for (let y = minY; y <= maxY; y++) {
          if (!blocked.has(`${minX},${y}`)) queue.push({ x: minX, y: y });
          if (!blocked.has(`${maxX},${y}`)) queue.push({ x: maxX, y: y });
        }
        while (queue.length > 0) {
          const { x, y } = queue.pop();
          const key = `${x},${y}`;
          if (visited.has(key) || blocked.has(key)) continue;
          if (x < minX || x > maxX || y < minY || y > maxY) continue;
          visited.add(key);
          queue.push(
            { x: x - 1, y },
            { x: x + 1, y },
            { x, y: y - 1 },
            { x, y: y + 1 },
          );
        }
        // 包围盒内未被洪水到达的格子 = 被围住的区域
        const enclosedCells = new Set();
        for (let y = minY; y <= maxY; y++) {
          for (let x = minX; x <= maxX; x++) {
            const key = `${x},${y}`;
            if (!visited.has(key) && !blocked.has(key)) {
              enclosedCells.add(key);
            }
          }
        }
        for (const area of state.areas) {
          if (state.selectedAreas.some((sa) => sa.id === area.id)) continue;
          for (const c of area.cells) {
            if (enclosedCells.has(`${c.x},${c.y}`)) {
              state.selectedAreas.push(area);
              break;
            }
          }
        }
      }

      state.isFreehand = false;
      state.freehandPath = [];
      renderAreaListInEditor();
      showHint(`圈选了 ${state.selectedAreas.length} 个区域`);
    }
  }
}

function handleEditorKeyDown(e) {
  if (!state.isEditMode) return;

  // Ctrl+Z 撤销, Ctrl+Y/Ctrl+Shift+Z 重做
  if (e.ctrlKey || e.metaKey) {
    if (e.key === "z" && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if (e.key === "y" || (e.key === "z" && e.shiftKey)) {
      e.preventDefault();
      redo();
    }
  }

  // Delete 键删除选中区域
  if (e.key === "Delete" && state.editorSelectedArea) {
    const idx = state.areas.indexOf(state.editorSelectedArea);
    if (idx >= 0) {
      state.areas.splice(idx, 1);
      markEditorMapDirty();
      state.editorSelectedArea = null;
      renderAreaListInEditor();
      renderAreaProperties(null);
    }
  }
}

// ========== UI 更新 ==========
function updateUI() {
  const worldState = state.world.getWorldState();
  const difficultySelect = document.getElementById("difficulty-select");
  if (difficultySelect) {
    difficultySelect.value = state.difficulty;
    difficultySelect.title = state.gameConfig.difficulty.description;
  }
  updateGameTime(worldState.time);
  updateDayCount(worldState.dayCount);
  updateTickCount(worldState.tickCount);
  updatePollution(worldState.pollution);
  updateWorldResources(worldState.worldResources);
  updateSimulationStatus();
  renderAgentList();
  updateSidebarSectionMeta();
}

function getGameTimePeriodLabel(time) {
  const totalMinutes = time.getHours() * 60 + time.getMinutes();
  if (totalMinutes < 120) return "午夜";
  if (totalMinutes < 360) return "凌晨";
  if (totalMinutes < 540) return "清晨";
  if (totalMinutes < 690) return "上午";
  if (totalMinutes < 810) return "中午";
  if (totalMinutes < 1080) return "下午";
  if (totalMinutes < 1200) return "傍晚";
  return "晚上";
}

function updateGameTime(time) {
  const hours = time.getHours().toString().padStart(2, "0");
  const minutes = time.getMinutes().toString().padStart(2, "0");
  const period = getGameTimePeriodLabel(time);
  document.getElementById("game-time").textContent =
    `${period} ${hours}:${minutes}`;
}

function updateDayCount(count) {
  const dayCount = typeof count === "number" ? count : 1;
  document.getElementById("day-count").textContent = `第 ${dayCount} 天`;
  const resourceDay = document.getElementById("res-day");
  if (resourceDay) resourceDay.textContent = `第${dayCount}天`;
}

function updateTickCount(count) {
  return count;
}

function updatePollution(pollution) {
  const fill = document.getElementById("pollution-fill");
  const text = document.getElementById("pollution-text");
  const safePollution = Math.max(0, Math.min(100, Number(pollution) || 0));
  if (fill) {
    fill.style.width = `${safePollution}%`;
  }
  if (text) {
    text.textContent = Math.round(safePollution);
  }
  applyPollutionTheme(safePollution);
}

function updateWorldResources(resources) {
  if (!resources) return;
  const romans = ["", "Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ", "Ⅴ"];
  const ths = GAME_CONFIG.buildingLevelThresholds;
  function getLevel(val) {
    for (let i = ths.length - 1; i >= 0; i--) {
      if (val >= ths[i]) return i + 2;
    }
    return 1;
  }
  function setRes(id, val, showLevel) {
    const el = document.getElementById(id);
    if (!el) return;
    const v = Math.round(val);
    if (showLevel) {
      const lvl = getLevel(val);
      el.textContent = lvl > 1 ? `${v} ${romans[lvl]}` : `${v}`;
      el.title =
        lvl > 1
          ? `等级${romans[lvl]}（${v}/${ths[lvl - 2] || "MAX"}）`
          : `${v}`;
    } else {
      el.textContent = v;
    }
  }
  setRes("res-theory", resources.techTheory, true);
  setRes("res-production", resources.techProduction, true);
  setRes("res-knowledge", resources.knowledgeReserve, true);
  setRes("res-material", resources.materialValue, true);
  setRes("res-foodstock", resources.foodStock ?? 50, false);
}

function updateSimulationStatus() {
  const statusEl = document.getElementById("simulation-status");
  const btnStart = document.getElementById("btn-start");
  const btnStop = document.getElementById("btn-stop");

  if (state.world?.isGameOver) {
    statusEl.textContent = "已终结";
    statusEl.className = "status stopped";
    btnStart.disabled = true;
    btnStop.disabled = true;
  } else if (state.world?.isMeeting) {
    statusEl.textContent = "晨会中";
    statusEl.className = "status stopped";
    btnStart.disabled = true;
    btnStop.disabled = false;
  } else if (state.simulationRunning) {
    statusEl.textContent = "运行中";
    statusEl.className = "status running";
    btnStart.disabled = true;
    btnStop.disabled = false;
  } else {
    statusEl.textContent = "已停止";
    statusEl.className = "status stopped";
    btnStart.disabled = false;
    btnStop.disabled = true;
  }
}

function toSafeClassToken(value) {
  return String(value ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "-");
}

function appendWarningIcon(container, className, title, text) {
  const icon = appendTextElement(container, "span", text, `warning-icon ${className}`);
  if (icon) icon.title = title;
  return icon;
}

function appendAgentStat(container, text, title, className = "") {
  const stat = appendTextElement(
    container,
    "span",
    text,
    ["stat", className].filter(Boolean).join(" "),
  );
  if (stat) stat.title = title;
  return stat;
}

function renderAgentList() {
  const container = document.getElementById("agent-list");
  const worldState = state.world.getWorldState();

  clearElement(container);
  if (worldState.agents.size === 0) {
    appendTextElement(container, "div", "暂无 Agent", "empty-state");
    updateSidebarSectionMeta();
    return;
  }

  for (const agent of worldState.agents.values()) {
    const actionDesc =
      typeof agent.currentAction === "object"
        ? agent.currentAction?.description
        : agent.currentAction;
    const portraitPath = getCharacterPortrait(agent.agentId);
    const portrait = portraitPath ? imageLoader.getImage(portraitPath) : null;
    const healthPercent = agent.health ? agent.health.current / agent.health.max : 1;
    const fullnessPercent = (agent.fullness ?? 100) / 100;
    const uiCfg = GAME_CONFIG.ui;
    const healthCurrent = Math.round((agent.health?.current ?? 0) * 10) / 10;
    const healthMax = Math.round((agent.health?.max ?? 100) * 10) / 10;
    const fullnessValue = Math.round((agent.fullness ?? 0) * 10) / 10;
    const greenPoints = Math.round((agent.greenPoints ?? 0) * 10) / 10;

    const item = document.createElement("div");
    item.className = `agent-item ${
      healthPercent < uiCfg.healthCriticalPercent ? "agent-critical" : ""
    }`.trim();
    item.dataset.agentId = agent.agentId;

    const avatar = document.createElement("div");
    avatar.className = "agent-avatar";
    const statusDot = document.createElement("span");
    statusDot.className = "status-dot";
    const statusClass = getAgentStatusMarker(agent).className;
    if (statusClass) statusDot.classList.add(statusClass);

    if (portrait) {
      const img = document.createElement("img");
      img.src = portraitPath;
      img.alt = String(agent.name ?? "");
      img.onerror = () => {
        img.remove();
        avatar.insertBefore(document.createTextNode("🤖"), statusDot);
      };
      avatar.appendChild(img);
    } else {
      avatar.appendChild(document.createTextNode("🤖"));
    }
    avatar.appendChild(statusDot);
    item.appendChild(avatar);

    const info = document.createElement("div");
    info.className = "agent-info";
    const nameEl = appendTextElement(info, "div", agent.name, "agent-name");
    if (healthPercent < uiCfg.healthCriticalPercent) {
      appendWarningIcon(nameEl, "health-critical", "健康危急", "❤️");
    } else if (healthPercent < uiCfg.healthWarningPercent) {
      appendWarningIcon(nameEl, "health-low", "健康较低", "💔");
    }
    if (fullnessPercent < uiCfg.fullnessCriticalPercent) {
      appendWarningIcon(nameEl, "fullness-critical", "极度饥饿", "🍖");
    } else if (fullnessPercent < uiCfg.fullnessWarningPercent) {
      appendWarningIcon(nameEl, "fullness-low", "饥饿", "🍗");
    }

    appendTextElement(
      info,
      "div",
      `${agent.status} · ${actionDesc || "空闲"}`,
      "agent-status",
    );
    appendTextElement(
      info,
      "div",
      `(${agent.position.x}, ${agent.position.y})`,
      "agent-position",
    );

    const stats = document.createElement("div");
    stats.className = "agent-stats";
    appendAgentStat(
      stats,
      `❤️ ${healthCurrent}/${healthMax}`,
      "健康",
      healthPercent < uiCfg.healthCriticalPercent
        ? "stat-critical"
        : healthPercent < uiCfg.healthWarningPercent
          ? "stat-warning"
          : "",
    );
    appendAgentStat(stats, `🌿 ${greenPoints}`, "绿色积分");
    appendAgentStat(
      stats,
      `🍖 ${fullnessValue}/100`,
      "饱腹",
      fullnessPercent < uiCfg.fullnessCriticalPercent
        ? "stat-critical"
        : fullnessPercent < uiCfg.fullnessWarningPercent
          ? "stat-warning"
          : "",
    );
    info.appendChild(stats);
    item.appendChild(info);

    const deleteButton = document.createElement("button");
    deleteButton.className = "agent-delete-btn";
    deleteButton.dataset.agentId = agent.agentId;
    deleteButton.title = "删除角色";
    deleteButton.textContent = "✕";
    item.appendChild(deleteButton);

    item.addEventListener("click", (e) => {
      if (e.target.closest(".agent-delete-btn")) return;
      showAgentDetails(item.dataset.agentId);
    });

    deleteButton.addEventListener("click", async (e) => {
      e.stopPropagation();
      const agentId = deleteButton.dataset.agentId;
      const agent = state.world.agents.get(agentId);
      const name = agent?.name || agentId;
      if (!confirm(`确定要删除角色「${name}」吗？`)) return;
      try {
        const res = await fetch(`/api/agents/${agentId}`, { method: "DELETE" });
        if (!res.ok) throw new Error(await res.text());
        state.world.removeAgent(agentId);
        renderAgentList();
        drawMap();
      } catch (err) {
        alert(`删除失败: ${err.message}`);
      }
    });

    container.appendChild(item);
  }

  updateSidebarSectionMeta();
}

function renderAgentDetails(agentId = currentEditAgentId) {
  const agent = state.world.agents.get(agentId);
  if (!agent) return;

  currentEditAgentId = agentId;
  exitEditMode(); // 确保打开 modal 时在查看模式

  const memoryData = normalizeAgentMemoryData(agent.memory.exportData());
  const portraitPath = getCharacterPortrait(agent.id);
  const importantMemories = getAgentImportantMemories(agent, memoryData);

  document.getElementById("modal-agent-name").textContent = agent.name;
  document.getElementById("modal-agent-id").textContent = agent.id;
  document.getElementById("modal-agent-age").textContent =
    `${agent.config.age}岁`;
  document.getElementById("modal-agent-traits").textContent =
    agent.config.traits;
  document.getElementById("modal-agent-position").textContent =
    `(${agent.position.x}, ${agent.position.y})`;
  document.getElementById("modal-agent-status").textContent = agent.status;

  // 显示生存属性 - 条形图（保留1位小数）
  const healthCurrent = Math.round((agent.health?.current ?? 0) * 10) / 10;
  const healthMax = Math.round((agent.health?.max ?? 100) * 10) / 10;
  const healthEl = document.getElementById("modal-agent-health");
  const healthBar = document.getElementById("modal-agent-health-bar");
  if (healthEl) healthEl.textContent = `${healthCurrent}/${healthMax}`;
  if (healthBar) {
    const healthPercent = healthMax > 0 ? (healthCurrent / healthMax) * 100 : 0;
    healthBar.style.width = `${healthPercent}%`;
  }

  const greenPointsEl = document.getElementById("modal-agent-greenpoints");
  if (greenPointsEl)
    greenPointsEl.textContent = Math.round((agent.greenPoints ?? 0) * 10) / 10;

  const fullnessValue = Math.round((agent.fullness ?? 0) * 10) / 10;
  const fullnessEl = document.getElementById("modal-agent-fullness");
  const fullnessBar = document.getElementById("modal-agent-fullness-bar");
  if (fullnessEl) fullnessEl.textContent = `${fullnessValue}/100`;
  if (fullnessBar) {
    const fullnessPercent = Math.min(Math.max(fullnessValue, 0), 100);
    fullnessBar.style.width = `${fullnessPercent}%`;
  }

  // 背包显示
  const backpackEl = document.getElementById("modal-agent-backpack");
  if (backpackEl) {
    const backpack = agent.backpack || [];
    clearElement(backpackEl);
    if (backpack.length === 0) {
      appendTextElement(backpackEl, "span", "空", "backpack-empty");
    } else {
      for (const item of backpack) {
        const itemEl = appendTextElement(
          backpackEl,
          "span",
          `${item.name ?? ""} `,
          "backpack-item",
        );
        appendTextElement(itemEl, "span", `×${item.quantity ?? 0}`, "item-qty");
      }
    }
  }
  const actionText =
    typeof agent.currentAction === "object"
      ? agent.currentAction?.description
      : agent.currentAction;
  document.getElementById("modal-agent-action").textContent =
    actionText || "无";
  renderMemoryList(
    document.getElementById("modal-agent-background"),
    importantMemories,
    "暂无重要记忆",
    "important-memory-item",
  );
  const decisionsDiv = document.getElementById("modal-agent-decisions");
  if (decisionsDiv) {
    renderDecisionHistory(decisionsDiv, agent.decisionHistory || []);
  }

  // 添加头像
  const modalBody = document.querySelector("#agent-modal .modal-body");
  const existingPortrait = modalBody.querySelector(".modal-portrait");
  if (existingPortrait) existingPortrait.remove();

  if (portraitPath) {
    const portraitImg = document.createElement("img");
    portraitImg.src = portraitPath;
    portraitImg.className = "modal-portrait";
    portraitImg.style.width = "80px";
    portraitImg.style.height = "80px";
    portraitImg.style.borderRadius = "50%";
    portraitImg.style.marginBottom = "15px";
    portraitImg.onerror = () => (portraitImg.style.display = "none");
    modalBody.insertBefore(portraitImg, modalBody.firstChild);
  }

  const goalsEl = document.getElementById("modal-agent-goals");
  if (goalsEl) {
    clearElement(goalsEl);
    for (const goal of Array.isArray(agent.config.goals) ? agent.config.goals : []) {
      appendTextElement(goalsEl, "li", goal);
    }
  }

  // 记忆
  const memoriesDiv = document.getElementById("modal-memories");
  renderMemoryList(
    memoriesDiv,
    [...memoryData.memories]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 20),
    "暂无记忆",
  );

  // 反思
  const reflectionsDiv = document.getElementById("modal-reflections");
  renderMemoryList(
    reflectionsDiv,
    [...memoryData.reflections]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 10),
    "暂无反思",
    "reflection",
  );

  showModal("agent-modal");
}

async function hydrateAgentProfile(agent) {
  if (!agent) return false;

  const hasBackground = typeof agent.config?.background === "string";
  const hasGoals = Array.isArray(agent.config?.goals);
  const hasPreferences =
    agent.config?.preferences &&
    Array.isArray(agent.config.preferences.places) &&
    Array.isArray(agent.config.preferences.activities);
  const hasRules = Array.isArray(agent.config?.rules);
  const hasCustomPrompt = typeof agent.config?.customPrompt === "string";
  const hasRoutine =
    agent.config?.routine &&
    Number.isFinite(agent.config.routine.wakeTime) &&
    Number.isFinite(agent.config.routine.sleepTime);
  const hasPersonality =
    agent.config?.personality &&
    ["social", "energy"].every(
      (key) => typeof agent.config.personality[key] === "number",
    );

  if (
    hasBackground &&
    hasGoals &&
    hasPreferences &&
    hasRules &&
    hasCustomPrompt &&
    hasRoutine &&
    hasPersonality
  ) {
    return false;
  }

  try {
    const res = await fetch(`/api/agents/${agent.id}`);
    if (!res.ok) return false;
    const fullAgent = await res.json();
    agent.config = {
      ...agent.config,
      age: fullAgent.age ?? agent.config.age,
      traits: fullAgent.traits ?? agent.config.traits ?? "",
      background: fullAgent.background ?? agent.config.background ?? "",
      occupation: fullAgent.occupation ?? agent.config.occupation ?? "普通居民",
      goals: parseJSONField(fullAgent.goals, agent.config.goals || []),
      personality: normalizePersonality(
        parseJSONField(fullAgent.personality, {
          social: 0.5,
          energy: 0.5,
        }),
      ),
      preferences: parseJSONField(fullAgent.preferences, {
        places: [],
        activities: [],
      }),
      rules: parseJSONField(fullAgent.rules, []),
      customPrompt: fullAgent.custom_prompt ?? agent.config.customPrompt ?? "",
      routine: parseJSONField(fullAgent.routine, {
        wakeTime: 7,
        sleepTime: 23,
      }),
    };
    agent.personality = agent.config.personality;
    agent.preferences = agent.config.preferences;
    agent.rules = agent.config.rules;
    agent.customPrompt = agent.config.customPrompt;
    agent.occupation = agent.config.occupation;
    agent.age = agent.config.age;
    return true;
  } catch (err) {
    console.warn(`[Agent Profile] 补全 ${agent.id} 资料失败:`, err);
    return false;
  }
}

// ========== 编辑模式 ==========
async function showAgentDetails(agentId) {
  state.selectedAgent = agentId;
  await hydrateAgentProfile(state.world.agents.get(agentId));
  renderAgentDetails(agentId);
}

let currentEditAgentId = null;

function enterEditMode() {
  const agent = state.world.agents.get(currentEditAgentId);
  if (!agent) return;

  // 填充表单
  document.getElementById("edit-agent-name").value = agent.name;
  document.getElementById("edit-agent-age").value = agent.config.age;
  document.getElementById("edit-agent-occupation").value =
    agent.config.occupation || "普通居民";
  document.getElementById("edit-agent-traits").value = agent.config.traits;
  document.getElementById("edit-agent-background").value =
    agent.config.background;
  document.getElementById("edit-agent-goals").value = (
    agent.config.goals || []
  ).join("\n");

  const p = normalizePersonality(agent.config.personality);
  ["social", "energy"].forEach((key) => {
    const slider = document.getElementById(`edit-agent-${key}`);
    const display = document.getElementById(`edit-agent-${key}-val`);
    slider.value = Math.round((p[key] ?? 0.5) * 100);
    display.textContent = (p[key] ?? 0.5).toFixed(2);
  });

  const prefs = agent.config.preferences || { places: [], activities: [] };
  document.getElementById("edit-agent-places").value = (
    prefs.places || []
  ).join(", ");
  document.getElementById("edit-agent-activities").value = (
    prefs.activities || []
  ).join(", ");

  document.getElementById("edit-agent-rules").value = (
    agent.config.rules || []
  ).join("\n");
  document.getElementById("edit-agent-custom-prompt").value =
    agent.config.customPrompt || "";

  document.getElementById("agent-view-mode").classList.add("hidden");
  document.getElementById("agent-edit-mode").classList.remove("hidden");
}

function exitEditMode() {
  document.getElementById("agent-view-mode").classList.remove("hidden");
  document.getElementById("agent-edit-mode").classList.add("hidden");
}

async function saveAgentEdit() {
  const agent = state.world.agents.get(currentEditAgentId);
  if (!agent) return;

  const formData = {
    name: document.getElementById("edit-agent-name").value.trim(),
    age: parseInt(document.getElementById("edit-agent-age").value),
    traits: document.getElementById("edit-agent-traits").value.trim(),
    occupation: document.getElementById("edit-agent-occupation").value.trim(),
    background: document.getElementById("edit-agent-background").value.trim(),
    goals: document
      .getElementById("edit-agent-goals")
      .value.trim()
      .split("\n")
      .filter(Boolean),
    personality: {
      social:
        parseFloat(document.getElementById("edit-agent-social").value) / 100,
      energy:
        parseFloat(document.getElementById("edit-agent-energy").value) / 100,
    },
    preferences: {
      places: document
        .getElementById("edit-agent-places")
        .value.split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean),
      activities: document
        .getElementById("edit-agent-activities")
        .value.split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean),
    },
    rules: document
      .getElementById("edit-agent-rules")
      .value.split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
    customPrompt: document
      .getElementById("edit-agent-custom-prompt")
      .value.trim(),
  };

  // 同步到后端数据库
  try {
    const res = await fetch(`/api/agents/${currentEditAgentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...formData,
        custom_prompt: formData.customPrompt,
      }),
    });
    if (!res.ok) {
      const err = await res.json();
      alert(`保存失败: ${err.error}`);
      return;
    }
  } catch (e) {
    alert(`保存失败: ${e.message}`);
    return;
  }

  // 更新本地 agent 对象
  agent.name = formData.name;
  agent.config = {
    ...agent.config,
    name: formData.name,
    age: formData.age,
    traits: formData.traits,
    occupation: formData.occupation,
    background: formData.background,
    goals: formData.goals,
    personality: formData.personality,
    preferences: formData.preferences,
    rules: formData.rules,
    customPrompt: formData.customPrompt,
  };

  // 同步到 Agent 实例上的直接属性（prompt 函数读取用）
  if (agent.personality) {
    Object.assign(agent.personality, formData.personality);
  }
  agent.rules = formData.rules;
  agent.preferences = formData.preferences;
  agent.customPrompt = formData.customPrompt;
  agent.occupation = formData.occupation;
  agent.age = formData.age;

  const profileMemoryIds = agent.memory
    .exportData()
    .memories.filter(
      (memory) =>
        memory.type === agent.MemoryType.THOUGHT &&
        typeof memory.content === "string" &&
        (memory.content.includes("我是") ||
          memory.content.includes("我的性格") ||
          memory.content.includes("我的核心指令") ||
          memory.content.includes("我的角色认知与目的") ||
          memory.content.includes("我的目标")),
    )
    .map((memory) => memory.id);

  for (const memoryId of profileMemoryIds) {
    agent.memory.memories.delete(memoryId);
  }

  await agent.memory.addMemory(
    `我是${agent.name}，${formData.age}岁，${formData.occupation}。${formData.background}`,
    agent.MemoryType.THOUGHT,
    10,
  );

  await agent.memory.addMemory(
    `我的性格：${formData.traits}。行动倾向：${formData.rules.join("；")}`,
    agent.MemoryType.THOUGHT,
    9,
  );

  if (formData.customPrompt) {
    await agent.memory.addMemory(
      `我的角色认知与目的：${formData.customPrompt}`,
      agent.MemoryType.THOUGHT,
      10,
    );
  }

  for (const goal of formData.goals) {
    await agent.memory.addMemory(
      `我的目标：${goal}`,
      agent.MemoryType.THOUGHT,
      8,
    );
  }

  // 更新 UI
  document.getElementById("modal-agent-name").textContent = agent.name;
  document.getElementById("modal-agent-traits").textContent =
    agent.config.traits;
  renderAgentDetails(currentEditAgentId);

  exitEditMode();
}

// ========== 事件日志 ==========
function addEvent(event) {
  const container = document.getElementById("event-log");
  const emptyState = container.querySelector(".empty-state");
  if (emptyState) emptyState.remove();

  const normalizedType =
    event.type === "conversation"
      ? "dialogue"
      : ["world", "custom", "weather", "accident", "announcement"].includes(
            event.type,
          )
        ? "world"
        : event.type || "system";
  const typeLabelMap = {
    system: "系统",
    world: "世界",
    dialogue: "对话",
    custom: "手动",
    weather: "天气",
    accident: "事故",
    announcement: "公告",
  };

  const eventDiv = document.createElement("div");
  eventDiv.className = `event-item ${normalizedType === "world" ? "world-event" : normalizedType === "dialogue" ? "dialogue" : "system-event"}`;

  const timestamp = event.timestamp
    ? new Date(event.timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "--:--:--";
  const typeLabel =
    typeLabelMap[event.type] || typeLabelMap[normalizedType] || "事件";

  const metaEl = document.createElement("div");
  metaEl.className = "event-meta";
  appendTextElement(metaEl, "span", timestamp, "event-time");
  appendTextElement(
    metaEl,
    "span",
    typeLabel,
    `event-type-badge event-type-${normalizedType}`,
  );
  eventDiv.appendChild(metaEl);

  const descriptionEl = document.createElement("div");
  descriptionEl.className = "event-description";
  appendTextElement(
    descriptionEl,
    "div",
    event.description || "事件已触发",
    "event-text",
  );
  if (event.dialogue) {
    const dialogueEl = document.createElement("div");
    dialogueEl.className = "event-dialogue";
    appendTextElement(
      dialogueEl,
      "div",
      `💬 ${event.dialogue.speaker1 || ""}`,
      "event-dialogue-line speaker-a",
    );
    appendTextElement(
      dialogueEl,
      "div",
      `💬 ${event.dialogue.speaker2 || ""}`,
      "event-dialogue-line speaker-b",
    );
    descriptionEl.appendChild(dialogueEl);
  }
  eventDiv.appendChild(descriptionEl);

  container.insertBefore(eventDiv, container.firstChild);

  // 限制最多 50 条
  while (container.children.length > 50) {
    container.removeChild(container.lastChild);
  }
}

// ========== Agent 管理 ==========
async function addDefaultAgents() {
  // 先确保 4 个默认角色存在
  const defaultPositions = DEFAULT_AGENT_POSITIONS;
  const agentTemplates = getAgentTemplates();

  const res = await fetch("/api/agents");
  const dbAgents = res.ok ? await res.json() : [];
  const dbMap = new Map(dbAgents.map((a) => [a.id, a]));

  // 创建缺失的默认角色
  for (const pos of defaultPositions) {
    if (!dbMap.has(pos.name)) {
      const template = {
        ...agentTemplates[pos.name],
        position_x: pos.x,
        position_y: pos.y,
      };
      if (!template.id) continue;
      updateLoadingText(`正在创建 ${template.name}...`);
      try {
        await createAgentInDB(template);
      } catch (err) {
        console.error(`创建 Agent ${template.name} 失败:`, err);
      }
    }
  }

  // 重新获取完整列表
  const res2 = await fetch("/api/agents");
  const allAgentsRaw = res2.ok ? await res2.json() : [];
  const allAgents = await Promise.all(
    allAgentsRaw.map(async (agent) => {
      const needsProfile =
        agent.background === undefined ||
        agent.goals === undefined ||
        agent.personality === undefined ||
        agent.preferences === undefined ||
        agent.rules === undefined ||
        agent.routine === undefined;
      if (!needsProfile) return agent;
      try {
        const fullRes = await fetch(`/api/agents/${agent.id}`);
        if (!fullRes.ok) return agent;
        return await fullRes.json();
      } catch {
        return agent;
      }
    }),
  );
  const total = allAgents.length;

  // 默认角色的固定位置
  const defaultPosMap = {};
  for (const p of defaultPositions) defaultPosMap[p.name] = { x: p.x, y: p.y };

  for (let i = 0; i < allAgents.length; i++) {
    const existing = allAgents[i];
    const existingRules = parseJSONField(existing.rules, []);
    const resolvedRules = resolveDefaultAgentRules(existing.id, existingRules);
    const template = {
      id: existing.id,
      name: existing.name,
      age: existing.age,
      traits: existing.traits || "",
      background: existing.background || "",
      occupation: existing.occupation || "普通居民",
      personality: normalizePersonality(
        parseJSONField(existing.personality, {
          social: 0.5,
          energy: 0.5,
        }),
      ),
      preferences: parseJSONField(existing.preferences, {
        places: [],
        activities: [],
      }),
      rules: resolvedRules,
      customPrompt:
        resolveDefaultAgentCustomPrompt(existing.id, existing.custom_prompt),
      routine: parseJSONField(existing.routine, {
        wakeTime: 7,
        sleepTime: 23,
      }),
      goals: parseJSONField(existing.goals, ["探索世界", "结交朋友"]),
      // 始终使用初始值，避免DB中的旧状态影响新游戏
      healthMax: state.gameConfig.survival.healthMax,
      greenPoints: state.gameConfig.initialGreenPoints,
      fullness: state.gameConfig.initialFullness,
    };
    updateLoadingText(`正在加载 ${template.name}... (${i + 1}/${total})`);
    updateLoadingProgress(30 + (i / total) * 60);
    try {
      let pos;
      if (defaultPosMap[template.id]) {
        // 默认角色始终用固定位置
        pos = defaultPosMap[template.id];
      } else if (existing.position_x !== 0 || existing.position_y !== 0) {
        pos = { x: existing.position_x, y: existing.position_y };
      } else {
        pos = null;
      }
      await state.world.addAgent(template, pos);
      // 默认角色位置可能被改过，始终回写固定位置
      if (defaultPosMap[template.id] && pos) {
        fetch(`/api/agents/${template.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ position_x: pos.x, position_y: pos.y }),
        }).catch(() => {});
      }
      if (!pos) {
        const agent = state.world.agents.get(template.id);
        if (agent) {
          const p = agent.getPosition();
          fetch(`/api/agents/${template.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ position_x: p.x, position_y: p.y }),
          }).catch(() => {});
        }
      }
      const defaultCustomPrompt = getDefaultAgentCustomPrompt(template.id);
      const shouldBackfillCustomPrompt =
        defaultCustomPrompt &&
        isManagedDefaultAgentPrompt(template.id, existing.custom_prompt) &&
        normalizeDefaultPromptText(existing.custom_prompt) !==
          normalizeDefaultPromptText(defaultCustomPrompt);
      const shouldBackfillRules =
        isManagedDefaultAgentRules(template.id, existingRules) &&
        !areSameRuleList(existingRules, resolvedRules);
      // 回写初始状态到数据库，确保下次加载也是全新状态
      fetch(`/api/agents/${template.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          health_current:
            template.healthMax ?? state.gameConfig.survival.healthMax,
          health_max:
            template.healthMax ?? state.gameConfig.survival.healthMax,
          green_points:
            template.greenPoints ?? state.gameConfig.initialGreenPoints,
          fullness: template.fullness ?? state.gameConfig.initialFullness,
          status: "idle",
          current_action: null,
          ...(shouldBackfillCustomPrompt
            ? { custom_prompt: defaultCustomPrompt }
            : {}),
          ...(shouldBackfillRules ? { rules: resolvedRules } : {}),
        }),
      }).catch(() => {});
    } catch (err) {
      console.error(`加载 Agent ${template.name} 失败:`, err);
    }
  }
  updateLoadingText("全部就绪！");
  updateLoadingProgress(100);

  // 隐藏加载界面
  hideLoadingScreen();
}

function parseJSONField(value, fallback) {
  if (value && typeof value === "object") {
    if (Array.isArray(value)) return [...value];
    return { ...value };
  }
  if (!value) return Array.isArray(fallback) ? [...fallback] : { ...fallback };
  try {
    return JSON.parse(value);
  } catch {
    return Array.isArray(fallback) ? [...fallback] : { ...fallback };
  }
}

function normalizeAreaRecord(area) {
  const rawServices = Array.isArray(area?.services)
    ? area.services
    : parseJSONField(area?.services, []);
  const rawCells = Array.isArray(area?.cells)
    ? area.cells
    : parseJSONField(area?.cells, []);
  const rawMetadata =
    area?.metadata && typeof area.metadata === "object"
      ? area.metadata
      : parseJSONField(area?.metadata, {});

  let cells = Array.isArray(rawCells)
    ? rawCells
        .map((cell) => {
          const x = Number(cell?.x);
          const y = Number(cell?.y);
          if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
          return { x, y };
        })
        .filter(Boolean)
    : [];

  if (
    cells.length === 0 &&
    area?.w != null &&
    area?.h != null &&
    Number.isFinite(Number(area?.x)) &&
    Number.isFinite(Number(area?.y))
  ) {
    cells = rectToCells(
      Number(area.x),
      Number(area.y),
      Number(area.w),
      Number(area.h),
    );
  }

  return normalizeAreaSemantics({
    ...area,
    name: area?.name || "",
    isBlocked: area?.isBlocked ?? !!area?.is_blocked,
    services: Array.isArray(rawServices) ? rawServices : [],
    metadata: rawMetadata && typeof rawMetadata === "object" ? rawMetadata : {},
    cells,
  });
}

function buildTownSnapshotPayload(snapshotName = "latest-town-snapshot") {
  const worldState = state.world.exportState();
  const agents = [];
  const memories = [];
  const reflections = [];
  const dialogues = (worldState.events || [])
    .filter((event) => event?.type === "conversation" && event?.dialogue)
    .map((event, index) => ({
      id:
        event.id ||
        `dialogue_${event.timestamp || Date.now()}_${event.agentIds?.join("_") || index}`,
      agent_id_1: event.agentIds?.[0] || null,
      agent_id_2: event.agentIds?.[1] || null,
      speaker_1: event.dialogue?.speaker1 || "",
      speaker_2: event.dialogue?.speaker2 || "",
      timestamp:
        event.timestamp instanceof Date
          ? event.timestamp.toISOString()
          : event.timestamp || new Date().toISOString(),
    }))
    .filter(
      (dialogue) =>
        dialogue.agent_id_1 &&
        dialogue.agent_id_2 &&
        dialogue.speaker_1 &&
        dialogue.speaker_2,
    );

  for (const agentData of worldState.agents) {
    const runtimeAgent = state.world.agents.get(agentData.id);
    agents.push({
      id: agentData.id,
      name: agentData.name,
      age: agentData.config?.age ?? 20,
      traits: agentData.config?.traits ?? "",
      background: agentData.config?.background ?? "",
      goals: agentData.config?.goals ?? [],
      occupation: agentData.config?.occupation ?? "普通居民",
      personality: normalizePersonality(agentData.config?.personality),
      preferences: agentData.config?.preferences ?? {
        places: [],
        activities: [],
      },
      rules: agentData.config?.rules ?? [],
      custom_prompt:
        agentData.config?.customPrompt ?? runtimeAgent?.customPrompt ?? "",
      routine: agentData.config?.routine ?? { wakeTime: 7, sleepTime: 23 },
      position_x: agentData.position?.x ?? 0,
      position_y: agentData.position?.y ?? 0,
      status: agentData.status ?? "idle",
      current_action: agentData.currentAction ?? null,
      health_current: agentData.health?.current ?? 100,
      health_max: agentData.health?.max ?? 100,
      green_points: agentData.greenPoints ?? 10,
      fullness: agentData.fullness ?? 80,
      cycle_guidance: agentData.cycleGuidance ?? null,
      awake_hours_since_sleep: agentData.awakeHoursSinceSleep ?? 0,
      backpack: agentData.backpack ?? [],
      decision_history: agentData.decisionHistory ?? [],
      work_end_time: agentData.workEndTime ?? null,
      work_start_time: agentData.workStartTime ?? null,
      last_survival_update: agentData.lastSurvivalUpdate ?? Date.now(),
      current_plan: agentData.currentPlan ?? null,
      last_conversation: agentData.lastConversation ?? [],
      player_guidance: runtimeAgent?.playerGuidance ?? "",
      facing_direction: agentData.facingDirection ?? "down",
      no_sleep_days: agentData.consecutiveNoSleepDays ?? 0,
      last_sleep_time: 0,
    });

    if (!runtimeAgent) continue;
    const memoryExport = runtimeAgent.memory.exportData();
    for (const memory of memoryExport.memories || []) {
      memories.push({
        id: memory.id,
        agent_id: memory.agentId,
        content: memory.content,
        timestamp:
          memory.timestamp instanceof Date
            ? memory.timestamp.toISOString()
            : memory.timestamp,
        importance: memory.importance,
        type: memory.type,
        last_accessed:
          memory.lastAccessed instanceof Date
            ? memory.lastAccessed.toISOString()
            : memory.lastAccessed,
        access_count: memory.accessCount ?? 0,
        metadata: memory.metadata ?? null,
        embedding: memory.embedding ?? null,
      });
    }
    for (const reflection of memoryExport.reflections || []) {
      reflections.push({
        id: reflection.id,
        agent_id: reflection.agentId || runtimeAgent.id,
        content: reflection.content,
        timestamp:
          reflection.timestamp instanceof Date
            ? reflection.timestamp.toISOString()
            : reflection.timestamp,
        importance:
          reflection.importance ?? GAME_CONFIG.memory.reflectionImportance ?? 8,
        embedding: reflection.embedding ?? null,
        source_memory_ids: reflection.source_memory_ids || [],
      });
    }
  }

  return {
    snapshotName,
    difficulty: state.difficulty,
    gameConfigDraft: clonePlainObject(state.gameConfigDraft || {}, {}),
    randomEventState: worldState.randomEventState ?? null,
    state: {
      tick_count: worldState.tickCount ?? 0,
      game_time: (worldState.time instanceof Date
        ? worldState.time
        : new Date()
      ).toISOString(),
      town_health_current: worldState.townHealth?.current ?? 100,
      town_health_max: worldState.townHealth?.max ?? 100,
      time_scale: state.world.timeScale ?? CONFIG.TIME_SCALE,
      tile_size: state.world.tileSize ?? CONFIG.MAP_CELL_SIZE,
      image_width: state.world.imageWidth ?? CONFIG.MAP_IMAGE_WIDTH,
      image_height: state.world.imageHeight ?? CONFIG.MAP_IMAGE_HEIGHT,
      pollution: worldState.pollution ?? GAME_CONFIG.initialPollution,
      day_count: worldState.dayCount ?? 1,
      random_event_state: worldState.randomEventState ?? null,
    },
    worldResources: worldState.worldResources ?? {},
    events: worldState.events ?? [],
    dialogues,
    agents,
    memories,
    reflections,
    areas: state.areas,
  };
}

async function saveTownSnapshot(snapshotName = "latest-town-snapshot") {
  if (!state.world || state.isTownSnapshotBusy) return;
  state.isTownSnapshotBusy = true;
  const wasRunning = state.simulationRunning;
  try {
    state.world.stop();
    state.simulationRunning = false;
    updateSimulationStatus();
    const payload = buildTownSnapshotPayload(snapshotName);
    const res = await fetch("/api/state/snapshot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await res.text());
    addEvent({
      type: "system",
      description: `💾 小镇整局存档完成：${snapshotName}`,
      timestamp: new Date(),
    });
  } catch (err) {
    console.error("整局存档失败:", err);
    addEvent({
      type: "system",
      description: `❌ 整局存档失败：${err.message || err}`,
      timestamp: new Date(),
    });
  } finally {
    state.isTownSnapshotBusy = false;
    if (wasRunning && !state.world.isGameOver) {
      state.world.start();
      state.simulationRunning = true;
      updateSimulationStatus();
    }
  }
}

async function loadTownSnapshot(snapshotName = "latest-town-snapshot") {
  if (!state.world || state.isTownSnapshotBusy) return;
  state.isTownSnapshotBusy = true;
  const wasRunning = state.simulationRunning;
  try {
    state.world.stop();
    state.simulationRunning = false;
    updateSimulationStatus();
    const res = await fetch(
      `/api/state/snapshot?name=${encodeURIComponent(snapshotName)}`,
    );
    if (!res.ok) throw new Error(await res.text());
    const snapshot = await res.json();
    const snapshotDifficulty = normalizeDifficultyKey(snapshot.difficulty);
    applyDifficulty(snapshotDifficulty, {
      persist: false,
      overrides: snapshot.gameConfigDraft || snapshot.gameConfig || {},
    });
    const snapshotState = snapshot.state || {};
    const memoriesByAgent = new Map();
    const reflectionsByAgent = new Map();

    for (const memory of snapshot.memories || []) {
      if (!memoriesByAgent.has(memory.agent_id)) {
        memoriesByAgent.set(memory.agent_id, []);
      }
      memoriesByAgent.get(memory.agent_id).push(memory);
    }

    for (const reflection of snapshot.reflections || []) {
      if (!reflectionsByAgent.has(reflection.agent_id)) {
        reflectionsByAgent.set(reflection.agent_id, []);
      }
      reflectionsByAgent.get(reflection.agent_id).push(reflection);
    }

    const saveData = {
      tickCount: snapshotState.tick_count ?? 0,
      dayCount: snapshotState.day_count ?? 1,
      gameTime: snapshotState.game_time ?? new Date().toISOString(),
      pollution: snapshotState.pollution ?? GAME_CONFIG.initialPollution,
      isGameOver: false,
      townHealth: {
        current: snapshotState.town_health_current ?? 100,
        max: snapshotState.town_health_max ?? 100,
      },
      timeScale: snapshotState.time_scale ?? CONFIG.TIME_SCALE,
      tileSize: snapshotState.tile_size ?? CONFIG.MAP_CELL_SIZE,
      imageWidth: snapshotState.image_width ?? CONFIG.MAP_IMAGE_WIDTH,
      imageHeight: snapshotState.image_height ?? CONFIG.MAP_IMAGE_HEIGHT,
      randomEventState:
        snapshot.randomEventState ?? snapshotState.random_event_state ?? null,
      worldResources: snapshot.worldResources ?? {
        ...GAME_CONFIG.initialResources,
      },
      agents: [],
      events: snapshot.events ?? [],
      areas: (snapshot.areas || []).map((area) => normalizeAreaRecord(area)),
    };

    for (const agent of snapshot.agents || []) {
      const goals = Array.isArray(agent.goals)
        ? agent.goals
        : parseJSONField(agent.goals, []);
      const personality = normalizePersonality(
        typeof agent.personality === "object"
          ? agent.personality
          : parseJSONField(agent.personality, {
              social: 0.5,
              energy: 0.5,
            }),
      );
      const preferences =
        typeof agent.preferences === "object"
          ? agent.preferences
          : parseJSONField(agent.preferences, { places: [], activities: [] });
      const rules = Array.isArray(agent.rules)
        ? agent.rules
        : parseJSONField(agent.rules, []);
      const routine =
        typeof agent.routine === "object"
          ? agent.routine
          : parseJSONField(agent.routine, { wakeTime: 7, sleepTime: 23 });

      saveData.agents.push({
        id: agent.id,
        name: agent.name,
        config: {
          id: agent.id,
          name: agent.name,
          age: agent.age ?? 20,
          traits: agent.traits ?? "",
          background: agent.background ?? "",
          goals,
          occupation: agent.occupation ?? "普通居民",
          personality,
          preferences,
          rules,
          customPrompt: agent.custom_prompt ?? agent.customPrompt ?? "",
          routine,
          healthMax: agent.health_max ?? 100,
          greenPoints: agent.green_points ?? 10,
          fullness: agent.fullness ?? 80,
        },
        position: { x: agent.position_x ?? 0, y: agent.position_y ?? 0 },
        status: agent.status ?? "idle",
        currentAction: parseJSONField(agent.current_action, null),
        health: {
          current: agent.health_current ?? 100,
          max: agent.health_max ?? 100,
        },
        greenPoints: agent.green_points ?? 10,
        fullness: agent.fullness ?? 80,
        cycleGuidance: agent.cycle_guidance ?? null,
        playerGuidance: agent.player_guidance ?? "",
        awakeHoursSinceSleep: agent.awake_hours_since_sleep ?? 0,
        consecutiveNoSleepDays: agent.no_sleep_days ?? 0,
        backpack: Array.isArray(agent.backpack)
          ? agent.backpack
          : parseJSONField(agent.backpack, []),
        decisionHistory: Array.isArray(agent.decision_history)
          ? agent.decision_history
          : parseJSONField(agent.decision_history, []),
        workEndTime: agent.work_end_time ?? null,
        workStartTime: agent.work_start_time ?? null,
        lastSurvivalUpdate: agent.last_survival_update ?? null,
        currentPlan:
          typeof agent.current_plan === "object"
            ? agent.current_plan
            : parseJSONField(agent.current_plan, null),
        lastConversation: Array.isArray(agent.last_conversation)
          ? agent.last_conversation
          : parseJSONField(agent.last_conversation, []),
        facingDirection: agent.facing_direction ?? "down",
        memory: {
          memories: (memoriesByAgent.get(agent.id) || []).map((memory) => ({
            id: memory.id,
            agentId: memory.agent_id,
            content: memory.content,
            timestamp: memory.timestamp,
            importance: memory.importance ?? 5,
            type: memory.type ?? "OBSERVATION",
            embedding: memory.embedding ?? state.llm.generateRandomEmbedding(),
            lastAccessed: memory.last_accessed ?? memory.timestamp,
            accessCount: memory.access_count ?? 0,
            metadata: memory.metadata ?? null,
          })),
          reflections: (reflectionsByAgent.get(agent.id) || []).map(
            (reflection) => ({
              id: reflection.id,
              agentId: reflection.agent_id,
              content: reflection.content,
              timestamp: reflection.timestamp,
              importance:
                reflection.importance ??
                GAME_CONFIG.memory.reflectionImportance ??
                8,
              embedding:
                reflection.embedding ?? state.llm.generateRandomEmbedding(),
              source_memory_ids: reflection.source_memory_ids || [],
            }),
          ),
        },
      });
    }

    state.areas = saveData.areas;
    state.world.setAreas(state.areas);
    await state.world.loadFromSave(saveData);
    CONFIG.MAP_CELL_SIZE = saveData.tileSize || CONFIG.MAP_CELL_SIZE;
    const tileInput = document.getElementById("tile-size-input");
    if (tileInput) tileInput.value = String(CONFIG.MAP_CELL_SIZE);
    saveAreaHistory();
    updateUI();
    renderAgentList();
    drawMap();
    addEvent({
      type: "system",
      description: `📂 已读取整局存档：${snapshotName}`,
      timestamp: new Date(),
    });
    if (wasRunning && !state.world.isGameOver) {
      state.world.start();
      state.simulationRunning = true;
      updateSimulationStatus();
    }
  } catch (err) {
    console.error("读取整局存档失败:", err);
    addEvent({
      type: "system",
      description: `❌ 读取整局存档失败：${err.message || err}`,
      timestamp: new Date(),
    });
  } finally {
    state.isTownSnapshotBusy = false;
  }
}

async function fetchSnapshotList() {
  const res = await fetch("/api/state/snapshots");
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return Array.isArray(data.snapshots) ? data.snapshots : [];
}

async function deleteTownSnapshot(snapshotName) {
  const res = await fetch(
    `/api/state/snapshots?name=${encodeURIComponent(snapshotName)}`,
    { method: "DELETE" },
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function renderSnapshotList() {
  const listEl = document.getElementById("snapshot-list");
  if (!listEl) return;
  try {
    const snapshots = await fetchSnapshotList();
    state.townSnapshots = snapshots;
    clearElement(listEl);
    if (snapshots.length === 0) {
      appendTextElement(listEl, "div", "暂无存档", "empty-state");
      return;
    }
    for (const snapshot of snapshots) {
      const itemEl = document.createElement("div");
      itemEl.className = "snapshot-item";
      appendTextElement(
        itemEl,
        "div",
        snapshot.snapshotName,
        "snapshot-item-title",
      );
      appendTextElement(
        itemEl,
        "div",
        new Date(snapshot.savedAt).toLocaleString(),
        "snapshot-item-time",
      );
      const actionsEl = document.createElement("div");
      actionsEl.className = "snapshot-item-actions";
      const loadButton = document.createElement("button");
      loadButton.className = "btn btn-small snapshot-load-btn";
      loadButton.dataset.name = snapshot.snapshotName || "";
      loadButton.textContent = "读取";
      actionsEl.appendChild(loadButton);

      const deleteButton = document.createElement("button");
      deleteButton.className = "btn btn-small btn-danger snapshot-delete-btn";
      deleteButton.dataset.name = snapshot.snapshotName || "";
      deleteButton.textContent = "删除";
      actionsEl.appendChild(deleteButton);

      itemEl.appendChild(actionsEl);
      listEl.appendChild(itemEl);
    }
    listEl.querySelectorAll(".snapshot-load-btn").forEach((button) => {
      button.addEventListener("click", async () => {
        await loadTownSnapshot(button.dataset.name);
        hideModal("snapshot-modal");
      });
    });
    listEl.querySelectorAll(".snapshot-delete-btn").forEach((button) => {
      button.addEventListener("click", async () => {
        const snapshotName = button.dataset.name;
        if (!snapshotName) return;
        if (!confirm(`确定删除存档“${snapshotName}”吗？`)) return;
        try {
          await deleteTownSnapshot(snapshotName);
          addEvent({
            type: "system",
            description: `🗑️ 已删除整局存档：${snapshotName}`,
            timestamp: new Date(),
          });
          await renderSnapshotList();
        } catch (error) {
          console.error("删除整局存档失败:", error);
          addEvent({
            type: "system",
            description: `❌ 删除整局存档失败：${error.message || error}`,
            timestamp: new Date(),
          });
        }
      });
    });
  } catch (error) {
    clearElement(listEl);
    appendTextElement(
      listEl,
      "div",
      `读取存档列表失败：${error.message || error}`,
      "empty-state",
    );
  }
}

async function openSnapshotModal() {
  showModal("snapshot-modal");
  const title = document.querySelector("#snapshot-modal .modal-header h2");
  const saveButton = document.getElementById("btn-confirm-save-town");
  const input = document.getElementById("snapshot-name-input");
  if (input) {
    input.value = `town-day-${state.world?.dayCount || 1}`;
  }
  if (title) {
    title.textContent =
      state.snapshotMode === "load" ? "读取世界存档" : "整局存档";
  }
  if (saveButton) {
    saveButton.textContent =
      state.snapshotMode === "load" ? "读取选中存档" : "保存当前小镇";
  }
  await renderSnapshotList();
}

function setLlmConfigBusy(isBusy) {
  [
    "btn-load-llm-config",
    "btn-test-llm-config",
    "btn-save-llm-config",
  ].forEach((id) => {
    const button = document.getElementById(id);
    if (button) button.disabled = isBusy;
  });
}

function setLlmConfigStatus(message, tone = "") {
  const statusEl = document.getElementById("llm-config-status");
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.remove("is-loading", "is-success", "is-error");
  if (tone) {
    statusEl.classList.add(tone);
  }
}

function sanitizeWorldChatText(text, replacement = "大家") {
  const sanitized =
    state.world?.sanitizeConversationText?.(text, { replacement }) ||
    String(text || "").replace(/^["']|["']$/g, "").trim();
  return sanitized
    .replace(/（[^）]{1,16}）/g, "")
    .replace(/\([^)]{1,16}\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function setLlmConfigResult(content = "") {
  const resultEl = document.getElementById("llm-config-result");
  if (!resultEl) return;
  if (!content) {
    resultEl.textContent = "";
    resultEl.classList.add("hidden");
    return;
  }
  resultEl.textContent = content;
  resultEl.classList.remove("hidden");
}

function syncLlmApiKeyInput(hasApiKey = false) {
  const apiKeyEl = document.getElementById("llm-api-key-input");
  if (!apiKeyEl) return;

  apiKeyEl.value = "";
  apiKeyEl.required = !hasApiKey;
  apiKeyEl.placeholder = hasApiKey
    ? "已保存 API Key，留空表示保持不变"
    : "输入可用的 API Key";
  apiKeyEl.setCustomValidity("");
}

function applyLlmConfigToForm(config = {}) {
  const endpointEl = document.getElementById("llm-endpoint-input");
  const modelEl = document.getElementById("llm-model-input");
  const apiKeyEl = document.getElementById("llm-api-key-input");
  const apiKeyHeaderEl = document.getElementById("llm-api-key-header-input");
  const responsePathEl = document.getElementById("llm-response-path-input");
  const anthropicVersionEl = document.getElementById(
    "llm-anthropic-version-input",
  );

  if (endpointEl) endpointEl.value = config.endpoint || "";
  if (modelEl) modelEl.value = config.model || "";
  state.llmConfigHasApiKey = Boolean(config.hasApiKey);
  if (apiKeyEl) {
    syncLlmApiKeyInput(state.llmConfigHasApiKey);
  }
  if (apiKeyHeaderEl) {
    const normalizedHeader =
      (config.apiKeyHeader || "").toLowerCase() === "bearer"
        ? "authorization"
        : config.apiKeyHeader || "api-key";
    apiKeyHeaderEl.value = normalizedHeader;
  }
  if (responsePathEl) responsePathEl.value = config.responsePath || "";
  if (anthropicVersionEl) {
    anthropicVersionEl.value = config.anthropicVersion || "";
  }
}

function collectLlmConfigFormValues() {
  const endpointEl = document.getElementById("llm-endpoint-input");
  const modelEl = document.getElementById("llm-model-input");
  const apiKeyEl = document.getElementById("llm-api-key-input");
  const apiKeyHeaderEl = document.getElementById("llm-api-key-header-input");
  const responsePathEl = document.getElementById("llm-response-path-input");
  const anthropicVersionEl = document.getElementById(
    "llm-anthropic-version-input",
  );

  if (!endpointEl?.value.trim()) {
    endpointEl?.reportValidity?.();
    endpointEl?.focus?.();
    return null;
  }

  if (!modelEl?.value.trim()) {
    modelEl?.reportValidity?.();
    modelEl?.focus?.();
    return null;
  }

  const apiKey = apiKeyEl?.value.trim() || "";
  if (!apiKey && !state.llmConfigHasApiKey) {
    apiKeyEl?.reportValidity?.();
    apiKeyEl?.focus?.();
    return null;
  }

  const payload = {
    endpoint: endpointEl.value.trim(),
    model: modelEl.value.trim(),
    apiKeyHeader: apiKeyHeaderEl?.value?.trim() || "api-key",
    responsePath: responsePathEl?.value?.trim() || "",
    anthropicVersion: anthropicVersionEl?.value?.trim() || "",
  };

  if (apiKey) {
    payload.apiKey = apiKey;
  }

  return payload;
}

function buildLlmTestResultText(result, draft) {
  if (!result?.success) {
    return [
      "连接失败",
      `接口: ${draft.endpoint}`,
      `模型: ${draft.model}`,
      `耗时: ${result?.durationMs ?? 0} ms`,
      "",
      `错误: ${result?.error || "未知错误"}`,
    ].join("\n");
  }

  return [
    "连接成功",
    `接口: ${result.endpoint || draft.endpoint}`,
    `模型: ${result.model || draft.model}`,
    `耗时: ${result.durationMs ?? 0} ms`,
    "",
    "模型回复:",
    result.content || "(空回复)",
  ].join("\n");
}

async function openLlmConfigModal() {
  showModal("llm-config-modal");
  const promptEl = document.getElementById("llm-test-prompt-input");
  if (promptEl && !promptEl.value.trim()) {
    promptEl.value = LLM_TEST_PROMPT_DEFAULT;
  }
  await loadCurrentLlmConfig();
}

async function loadCurrentLlmConfig() {
  if (!state.llm) return;

  setLlmConfigBusy(true);
  setLlmConfigStatus("正在读取当前运行中的 LLM 配置...", "is-loading");

  try {
    const payload = await state.llm.getConfig();
    applyLlmConfigToForm(payload?.config || {});
    setLlmConfigResult("");
    setLlmConfigStatus("已载入当前配置，你可以直接测试或保存修改。", "is-success");
  } catch (error) {
    setLlmConfigStatus(
      `读取失败：${error?.message || error || "未知错误"}`,
      "is-error",
    );
  } finally {
    setLlmConfigBusy(false);
  }
}

async function testLlmConfigDraft() {
  if (!state.llm) return;
  const draft = collectLlmConfigFormValues();
  if (!draft) return;

  const prompt =
    document.getElementById("llm-test-prompt-input")?.value?.trim() ||
    LLM_TEST_PROMPT_DEFAULT;

  setLlmConfigBusy(true);
  setLlmConfigStatus("正在测试当前表单配置的实际通路...", "is-loading");

  try {
    const result = await state.llm.testConfig(draft, prompt);
    setLlmConfigResult(buildLlmTestResultText(result, draft));
    if (result?.success) {
      setLlmConfigStatus(
        `测试成功，${result.durationMs ?? 0} ms 内拿到了模型回复。`,
        "is-success",
      );
    } else {
      setLlmConfigStatus(
        `测试失败：${result?.error || "没有拿到可用回复"}`,
        "is-error",
      );
    }
  } catch (error) {
    setLlmConfigResult("");
    setLlmConfigStatus(
      `测试请求失败：${error?.message || error || "未知错误"}`,
      "is-error",
    );
  } finally {
    setLlmConfigBusy(false);
  }
}

async function saveLlmConfigDraft() {
  if (!state.llm) return;
  const draft = collectLlmConfigFormValues();
  if (!draft) return;

  setLlmConfigBusy(true);
  setLlmConfigStatus("正在保存配置并立即应用到当前服务...", "is-loading");

  try {
    const payload = await state.llm.saveConfig(draft);
    applyLlmConfigToForm(payload?.config || draft);
    state.llm.resetBackendCircuit();
    setLlmConfigResult(
      [
        "已保存的配置",
        `接口: ${(payload?.config || draft).endpoint}`,
        `模型: ${(payload?.config || draft).model}`,
        `鉴权头: ${(payload?.config || draft).apiKeyHeader || "api-key"}`,
      ].join("\n"),
    );
    setLlmConfigStatus(
      payload?.message || "LLM 配置已保存并立即生效。",
      "is-success",
    );
    addEvent({
      type: "system",
      description: `🧠 已切换 LLM 为 ${(payload?.config || draft).model}`,
      timestamp: new Date(),
    });
  } catch (error) {
    setLlmConfigStatus(
      `保存失败：${error?.message || error || "未知错误"}`,
      "is-error",
    );
  } finally {
    setLlmConfigBusy(false);
  }
}

function appendAgentChatMessage(message) {
  const historyEl = document.getElementById("agent-chat-history");
  if (!historyEl) return;
  appendSafeMessage(historyEl, message);
  historyEl.scrollTop = historyEl.scrollHeight;
}

function openAgentChatModal(agentId) {
  const agent = state.world?.agents.get(agentId);
  if (!agent) return;

  state.agentChatTargetId = agentId;
  state.agentChatHistory = [];
  state.isAgentChatOpen = true;
  state.pausedByAgentChat = state.simulationRunning;

  if (state.simulationRunning) {
    state.world.stop();
    state.simulationRunning = false;
    updateSimulationStatus();
  }

  document.getElementById("agent-chat-title").textContent = `与${agent.name}私聊`;
  document.getElementById("agent-chat-history").innerHTML = "";
  document.getElementById("agent-chat-input").value = "";
  appendAgentChatMessage({
    agentName: agent.name,
    content: "我在听，你想单独和我说什么？",
    type: "agent",
  });
  showModal("agent-chat-modal");
}

function closeAgentChatModal() {
  hideModal("agent-chat-modal");
  state.isAgentChatOpen = false;
  state.agentChatTargetId = null;
  state.agentChatHistory = [];
  if (state.pausedByAgentChat && state.world && !state.world.isGameOver) {
    state.world.start();
    state.simulationRunning = true;
    updateSimulationStatus();
  }
  state.pausedByAgentChat = false;
}

async function sendAgentChatMessage() {
  if (!state.agentChatTargetId || !state.world) return;
  const input = document.getElementById("agent-chat-input");
  const text = input.value.trim();
  if (!text) return;
  input.value = "";

  const agent = state.world.agents.get(state.agentChatTargetId);
  if (!agent) return;

  const playerMessage = { agentName: "玩家", content: text, type: "player" };
  state.agentChatHistory.push(playerMessage);
  appendAgentChatMessage(playerMessage);

  agent.playerGuidance = text.slice(0, 80);
  await agent.memory.addMemory(
    `玩家私下对我说：${text}`,
    agent.MemoryType.DIALOGUE,
    8,
    { source: "player-chat" },
  );
  if (state.selectedAgent === agent.id) {
    renderAgentDetails(agent.id);
  }

  try {
    const context = state.agentChatHistory
      .slice(-8)
      .map((msg) => `${msg.agentName}: ${msg.content}`)
      .join("\n");
    const customPrompt = agent.customPrompt
      ? `\n\n# 角色认知与目的（来自人物编辑页）\n${agent.customPrompt}`
      : "";
    const reply = await agent.llm.chat(
      [
        {
          role: "system",
          content: `你是${agent.name}，${agent.age}岁，${agent.occupation}。现在你正在和玩家单独交谈，世界时间暂停。${customPrompt}`,
        },
        {
          role: "user",
          content: `最近的私聊记录：\n${context}\n\n要求：\n1. 用自然中文回应玩家。\n2. 可以表达态度、犹豫、赞同或反驳。\n3. 如果玩家给了建议，简短说明你接下来会不会参考它。\n4. 控制在50字以内。\n5. 只提到玩家、你自己或当前镇上的真实居民，不要编出不存在的新人物。`,
        },
      ],
      { timeout: 15000 },
    );
    const content = sanitizeWorldChatText(reply, "你");
    const agentMessage = {
      agentName: agent.name,
      content,
      type: "agent",
    };
    state.agentChatHistory.push(agentMessage);
    appendAgentChatMessage(agentMessage);
    await agent.memory.addMemory(
      `${agent.name}回应玩家：${content}`,
      agent.MemoryType.DIALOGUE,
      7,
      { source: "player-chat-reply" },
    );
    if (state.selectedAgent === agent.id) {
      renderAgentDetails(agent.id);
    }
  } catch (error) {
    appendAgentChatMessage({
      agentName: agent.name,
      content: "我还需要想一想，但我会记住你刚才的话。",
      type: "agent",
    });
  }
}

async function createAgentInDB(template) {
  const resolvedTemplate = buildTemplateWithDifficulty(template);
  const body = {
    id: resolvedTemplate.id,
    name: resolvedTemplate.name,
    age: resolvedTemplate.age,
    traits: resolvedTemplate.traits || "",
    background: resolvedTemplate.background || "",
    goals: resolvedTemplate.goals || [],
    occupation: resolvedTemplate.occupation || "普通居民",
    personality: JSON.stringify(
      normalizePersonality(resolvedTemplate.personality),
    ),
    preferences: JSON.stringify(
      resolvedTemplate.preferences || { places: [], activities: [] },
    ),
    rules: JSON.stringify(resolvedTemplate.rules || []),
    custom_prompt: resolvedTemplate.customPrompt || "",
    routine: JSON.stringify(
      resolvedTemplate.routine || { wakeTime: 7, sleepTime: 23 },
    ),
    position_x: resolvedTemplate.position_x ?? 0,
    position_y: resolvedTemplate.position_y ?? 0,
    health_max:
      resolvedTemplate.healthMax ?? state.gameConfig.survival.healthMax,
    green_points:
      resolvedTemplate.greenPoints ?? state.gameConfig.initialGreenPoints,
    fullness: resolvedTemplate.fullness ?? state.gameConfig.initialFullness,
    sprite_path: resolvedTemplate.spritePath || null,
    portrait_path: resolvedTemplate.portraitPath || null,
  };
  const res = await fetch("/api/agents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function loadSpriteOptions() {
  try {
    const res = await fetch("/api/sprites/list");
    if (!res.ok) return;
    const { sprites, portraits } = await res.json();

    const spriteSelect = document.getElementById("new-agent-sprite-select");
    const portraitSelect = document.getElementById("new-agent-portrait-select");

    if (spriteSelect) {
      spriteSelect.innerHTML = '<option value="">无精灵图</option>';
      for (const s of sprites) {
        const opt = document.createElement("option");
        opt.value = s.id;
        opt.textContent = `${s.id} (${s.frameCount}帧)`;
        spriteSelect.appendChild(opt);
      }
    }

    if (portraitSelect) {
      portraitSelect.innerHTML = '<option value="">无头像</option>';
      for (const p of portraits) {
        const opt = document.createElement("option");
        opt.value = p;
        opt.textContent = p;
        portraitSelect.appendChild(opt);
      }
    }
  } catch (err) {
    console.error("加载精灵选项失败:", err);
  }
}

async function handleAddAgent(e) {
  e.preventDefault();
  try {
    const agentId = document.getElementById("new-agent-name").value.trim();
    const displayName = document
      .getElementById("new-agent-display-name")
      .value.trim();
    const age = parseInt(document.getElementById("new-agent-age").value);
    const traits = document.getElementById("new-agent-traits").value.trim();
    const background = document
      .getElementById("new-agent-background")
      .value.trim();
    const occupation = document
      .getElementById("new-agent-occupation")
      .value.trim();
    const goalsText = document.getElementById("new-agent-goals").value.trim();

    const personality = {
      social:
        parseFloat(document.getElementById("new-agent-social").value) / 100,
      energy:
        parseFloat(document.getElementById("new-agent-energy").value) / 100,
    };

    const placesText = document.getElementById("new-agent-places").value;
    const activitiesText = document.getElementById(
      "new-agent-activities",
    ).value;
    const preferences = {
      places: placesText
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean),
      activities: activitiesText
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean),
    };

    const rulesText = document.getElementById("new-agent-rules").value.trim();
    const rules = rulesText
      ? rulesText
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    const customPrompt = document
      .getElementById("new-agent-custom-prompt")
      .value.trim();

    const template = {
      id: agentId,
      name: displayName || agentId,
      age,
      traits: traits || "普通居民",
      background,
      occupation: occupation || "普通居民",
      goals: goalsText
        ? goalsText
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean)
        : ["探索世界", "结交朋友"],
      personality,
      preferences,
      rules,
      customPrompt,
    };

    const resolvedTemplate = buildTemplateWithDifficulty(template);
    await createAgentInDB(resolvedTemplate);
    await state.world.addAgent(resolvedTemplate);

    // 根据选择更新 asset-config
    const spriteId = document.getElementById("new-agent-sprite-select").value;
    const portraitFile = document.getElementById(
      "new-agent-portrait-select",
    ).value;
    await updateAssetConfig(agentId, spriteId || null, portraitFile || null);

    hideModal("add-agent-modal");
    e.target.reset();
    renderAgentList();
  } catch (err) {
    console.error("添加角色失败:", err);
    alert("添加角色失败: " + err.message);
  }
}

async function updateAssetConfig(agentId, spriteId, portraitFile) {
  await fetch("/api/sprites/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: agentId, spriteId, portraitFile }),
  }).catch((err) => console.error("更新精灵配置失败:", err));
}

function syncEventEffectRows() {
  const rowMap = {
    pollution: "event-effect-pollution-enabled",
    health: "event-effect-health-enabled",
    points: "event-effect-points-enabled",
  };
  for (const [rowKey, checkboxId] of Object.entries(rowMap)) {
    const row = document.querySelector(`[data-effect-row="${rowKey}"]`);
    const checkbox = document.getElementById(checkboxId);
    if (!row || !checkbox) continue;
    row.classList.toggle("hidden", !checkbox.checked);
  }

  for (const field of EVENT_EFFECT_FIELDS) {
    const input = document.getElementById(field.inputId);
    const checkbox = document.getElementById(field.enabledId);
    const label = checkbox?.closest(".checkbox-label");
    if (!input || !checkbox) continue;
    input.disabled = !checkbox.checked;
    input
      .closest(".form-group")
      ?.classList.toggle("is-disabled", !checkbox.checked);
    label?.classList.toggle("is-disabled", !checkbox.checked);
  }

  updateEventEffectsSummary();
}

function resetEventEffectForm() {
  for (const field of EVENT_EFFECT_FIELDS) {
    const input = document.getElementById(field.inputId);
    const checkbox = document.getElementById(field.enabledId);
    if (input) input.value = "0";
    if (checkbox) checkbox.checked = false;
  }
  const forceAnnouncement = document.getElementById(
    "event-effect-force-announcement-enabled",
  );
  if (forceAnnouncement) forceAnnouncement.checked = false;
  syncEventEffectRows();
}

function getEventEffectsPreview(effects = {}) {
  const items = [];
  for (const [key, value] of Object.entries(effects)) {
    if (!value) continue;
    if (key === "forceAnnouncement") {
      items.push(EVENT_EFFECT_LABELS[key]);
      continue;
    }
    const label = EVENT_EFFECT_LABELS[key] || key;
    const displayValue =
      typeof value === "number" && value > 0 ? `+${value}` : `${value}`;
    items.push(`${label} ${displayValue}`);
  }
  return items;
}

function updateEventEffectsSummary() {
  const summaryEl = document.getElementById("event-effects-summary");
  if (!summaryEl) return;

  const effects = collectEventEffects();
  const previewItems = getEventEffectsPreview(effects);
  summaryEl.textContent =
    previewItems.length > 0
      ? `当前效果：${previewItems.join(" / ")}`
      : "当前效果：仅记录事件，不产生数值变化";
}

function resetEventFormState() {
  document.getElementById("event-form")?.reset();
  resetEventEffectForm();
}

function triggerEventTemplate(templateKey) {
  const template = EVENT_TEMPLATES[templateKey];
  if (!template) return;

  state.world.triggerEvent(template.type, template.description, {
    source: "manual",
    template: templateKey,
    effects: { ...template.effects },
  });

  hideModal("event-modal");
  resetEventFormState();
}

function applyEventTemplate(templateKey) {
  const template = EVENT_TEMPLATES[templateKey];
  if (!template) return;

  const typeEl = document.getElementById("event-type");
  const descriptionEl = document.getElementById("event-description");
  if (typeEl) typeEl.value = template.type;
  if (descriptionEl) descriptionEl.value = template.description;

  resetEventEffectForm();

  for (const field of EVENT_EFFECT_FIELDS) {
    if (!(field.key in template.effects)) continue;
    const input = document.getElementById(field.inputId);
    const enabled = document.getElementById(field.enabledId);
    if (input) input.value = String(template.effects[field.key]);
    if (enabled) enabled.checked = true;
  }

  const forceAnnouncement = document.getElementById(
    "event-effect-force-announcement-enabled",
  );
  if (forceAnnouncement) {
    forceAnnouncement.checked = !!template.effects.forceAnnouncement;
  }
  syncEventEffectRows();
}

function handleEventTemplateChange(e) {
  const templateKey = e.target.value;
  if (!templateKey) {
    resetEventEffectForm();
    return;
  }
  applyEventTemplate(templateKey);
}

function collectEventEffects() {
  const effects = {};

  for (const field of EVENT_EFFECT_FIELDS) {
    const enabled = document.getElementById(field.enabledId);
    const input = document.getElementById(field.inputId);
    if (!enabled?.checked || !input) continue;
    const value = Number(input.value || 0);
    if (!Number.isFinite(value) || value === 0) continue;
    effects[field.key] = value;
  }

  const forceAnnouncement = document.getElementById(
    "event-effect-force-announcement-enabled",
  );
  if (forceAnnouncement?.checked) {
    effects.forceAnnouncement = true;
  }

  return effects;
}

function handleTriggerEvent(e) {
  e.preventDefault();
  const form = e.target;
  const type = document.getElementById("event-type").value;
  const descriptionEl = document.getElementById("event-description");
  const description = descriptionEl.value.trim();
  if (!description) {
    descriptionEl.reportValidity();
    descriptionEl.focus();
    return;
  }
  const template = document.getElementById("event-template")?.value || "";
  const effects = collectEventEffects();
  state.world.triggerEvent(type, description, {
    source: "manual",
    template,
    effects,
  });
  hideModal("event-modal");
  form.reset();
  resetEventFormState();
}

// ========== 工具函数 ==========
function showSupplyStockPopup(x, y, hotspot, options = {}) {
  const tooltip = document.getElementById("map-tooltip");
  if (!tooltip || !hotspot) return;

  const worldResources = state.world?.worldResources || {};
  const stock = Math.round(worldResources.foodStock ?? 0);
  const services = (hotspot.area?.services || []).filter(
    (service) => service.fullness || service.health,
  );
  const serviceList =
    hotspot.type === "supplySummary" ? services.slice(0, 4) : [hotspot.service];
  const rows = serviceList
    .filter(Boolean)
    .map((service) => {
      const effects = [
        service.fullness ? `饱腹 +${Math.round(service.fullness)}` : "",
        service.health ? `健康 +${Math.round(service.health)}` : "",
      ]
        .filter(Boolean)
        .join(" / ");
      const stockCost = getSupplyStockCost(service);
      return `
        <div class="supply-stock-row">
          <span class="supply-stock-row-icon">${escapeHtml(getSupplyServiceIcon(service))}</span>
          <div class="supply-stock-row-main">
            <div class="supply-stock-row-title">${escapeHtml(service.name || "未知物资")}</div>
            <div class="supply-stock-row-desc">${escapeHtml(service.description || "可领取后放入个人背包。")}</div>
          </div>
          <div class="supply-stock-row-meta">
            <span>积分 ${escapeHtml(service.cost ?? 0)}</span>
            <span>库存 -${stockCost}</span>
          </div>
          <div class="supply-stock-row-effect">${escapeHtml(effects || "备用物资")}</div>
        </div>
      `;
    })
    .join("");

  tooltip.innerHTML = `
    <div class="supply-stock-popup-header">
      <span class="supply-stock-popup-icon">${escapeHtml(hotspot.icon || "📦")}</span>
      <div>
        <strong>${escapeHtml(hotspot.area?.name || "物资基地")}</strong>
        <div class="supply-stock-popup-subtitle">可取用库存，角色到达后领取进背包</div>
      </div>
    </div>
    <div class="supply-stock-count">
      <span>当前粮食库存</span>
      <b>${stock}</b>
    </div>
    <div class="supply-stock-list">${rows}</div>
    <div class="supply-stock-popup-hint">${options.pinned ? "点击地图空白处关闭" : "点击图标固定详情"}</div>
  `;
  tooltip.style.left = `${Math.max(12, Math.min(x + 15, window.innerWidth - 340))}px`;
  tooltip.style.top = `${Math.max(12, Math.min(y + 15, window.innerHeight - 260))}px`;
  tooltip.classList.add("supply-stock-popup");
  tooltip.classList.toggle("pinned-supply-popup", Boolean(options.pinned));
  tooltip.classList.remove("hidden");
}

function showTooltip(x, y, data) {
  const tooltip = document.getElementById("map-tooltip");
  if (!tooltip) return;

  clearElement(tooltip);
  if (data.type === "agent") {
    appendTextElement(tooltip, "strong", data.data.name);
    appendTextElement(tooltip, "div", `状态：${data.data.status}`);
    appendTextElement(
      tooltip,
      "div",
      `位置：(${data.data.position.x}, ${data.data.position.y})`,
    );
  } else if (data.type === "object") {
    appendTextElement(tooltip, "strong", data.data.name);
    appendTextElement(tooltip, "div", `类型：${data.data.type}`);
    appendTextElement(tooltip, "div", data.data.description);
  }

  tooltip.style.left = `${x + 15}px`;
  tooltip.style.top = `${y + 15}px`;
  tooltip.classList.remove("supply-stock-popup", "pinned-supply-popup");
  tooltip.classList.remove("hidden");
}

function hideTooltip() {
  const tooltip = document.getElementById("map-tooltip");
  if (tooltip) {
    tooltip.classList.add("hidden");
    tooltip.classList.remove("supply-stock-popup", "pinned-supply-popup");
  }
}

function showModal(modalId) {
  document.getElementById(modalId).classList.remove("hidden");
}

function hideModal(modalId) {
  document.getElementById(modalId).classList.add("hidden");
}

function getOpenModalIds() {
  return Array.from(document.querySelectorAll(".modal"))
    .filter((modal) => !modal.classList.contains("hidden"))
    .map((modal) => modal.id);
}

function hideTopmostModal() {
  const openModalIds = getOpenModalIds();
  const topmostModalId = openModalIds[openModalIds.length - 1];
  if (!topmostModalId) return;

  if (topmostModalId === "event-modal") {
    resetEventFormState();
  } else if (topmostModalId === "agent-chat-modal") {
    closeAgentChatModal();
    return;
  }

  hideModal(topmostModalId);
}

function setupModalInteractions() {
  document.querySelectorAll(".modal").forEach((modal) => {
    modal.querySelector(".modal-overlay")?.addEventListener("click", () => {
      if (modal.classList.contains("hidden")) return;
      if (modal.id === "agent-chat-modal") {
        closeAgentChatModal();
        return;
      }
      if (modal.id === "event-modal") {
        resetEventFormState();
      }
      hideModal(modal.id);
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (document.activeElement?.id === "meeting-input") return;
    if (document.activeElement?.id === "agent-chat-input") return;
    hideTopmostModal();
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getGameOverVariant(detail = {}) {
  return GAME_OVER_VARIANTS[detail?.reason] || GAME_OVER_VARIANTS.pollution;
}

async function playEndingSequence(detail) {
  const overlay = document.getElementById("apocalypse-overlay");
  if (!overlay) return;
  const overlayMessage = overlay.querySelector(".apocalypse-message");
  const variant = getGameOverVariant(detail);
  overlay.classList.toggle(
    "good-ending",
    variant.overlayClass === "good-ending",
  );
  if (overlayMessage) {
    overlayMessage.textContent = variant.overlayMessage;
  }
  overlay.classList.remove("hidden");
  await sleep(GAME_CONFIG.ui.gameOverSequenceMs || 2200);
  overlay.classList.add("hidden");
  overlay.classList.remove("good-ending");
}

function showGameOverModal(detail) {
  const modalContent = document.querySelector(
    "#game-over-modal .game-over-modal-content",
  );
  const titleEl = document.getElementById("game-over-title");
  const messageEl = document.getElementById("game-over-message");
  const subtitleEl = document.getElementById("game-over-subtitle");
  const dayEl = document.getElementById("game-over-day");
  const pollutionEl = document.getElementById("game-over-pollution");
  const survivorsEl = document.getElementById("game-over-survivors");
  const variant = getGameOverVariant(detail);

  if (modalContent) {
    modalContent.classList.toggle(
      "good-ending",
      variant.overlayClass === "good-ending",
    );
  }

  if (titleEl) {
    titleEl.textContent = variant.title;
  }

  if (messageEl) {
    messageEl.textContent = detail?.message || "世界已经毁灭。";
  }

  if (subtitleEl) {
    subtitleEl.textContent = variant.subtitle;
  }

  if (dayEl) {
    const dayCount = detail?.dayCount || state.world?.dayCount || 1;
    dayEl.textContent = `第 ${dayCount} 天`;
  }

  if (pollutionEl) {
    const pollution = Math.round(
      detail?.pollution ?? state.world?.pollution ?? 0,
    );
    pollutionEl.textContent = `${pollution} / ${GAME_CONFIG.pollution.gameOverThreshold}`;
  }

  if (survivorsEl) {
    const survivors = detail?.survivors ?? state.world?.agents?.size ?? 0;
    survivorsEl.textContent = String(survivors);
  }

  showModal("game-over-modal");
}

async function startNewGameFromGameOver() {
  hideModal("game-over-modal");
  const existingIds = [...state.world.agents.keys()];
  await state.world.reset(true);

  for (const agentId of existingIds) {
    try {
      await fetch(`/api/agents/${agentId}`, { method: "DELETE" });
    } catch (err) {
      console.warn(`删除旧角色 ${agentId} 失败:`, err);
    }
  }

  await addDefaultAgents();
  state.world.applyGameConfig(state.gameConfig);
  state.simulationRunning = false;
  updateSimulationStatus();
  addEvent({
    type: "system",
    description: "🌱 新游戏已创建，等待重新开始。",
    timestamp: new Date(),
  });
  renderAgentList();
  drawMap();
}

function showDreamModal(results, resolve) {
  const body = document.getElementById("dream-results-body");
  const timer = document.getElementById("dream-timer");
  const confirmBtn = document.getElementById("dream-confirm");

  clearElement(body);
  for (const r of results) {
    const card = document.createElement("div");
    card.className = `dream-agent-card ${r.type === "insomniaNightmare" ? "insomnia-nightmare" : ""}`;
    card.dataset.agentId = r.agentId || "";
    const dreamTypeLabel =
      r.type === "insomniaNightmare" ? "失眠噩梦" : "梦境";

    const titleEl = document.createElement("h4");
    titleEl.textContent = String(r.agentName ?? "");
    appendTextElement(titleEl, "span", dreamTypeLabel, "dream-type-badge");
    card.appendChild(titleEl);

    if (!r.success) {
      appendTextElement(card, "p", r.narrative, "dream-no-dream");
    } else {
      const textarea = document.createElement("textarea");
      textarea.className = "dream-narrative";
      textarea.value = String(r.narrative ?? "");
      card.appendChild(textarea);

      if (Array.isArray(r.insights) && r.insights.length > 0) {
        const insightsEl = document.createElement("div");
        insightsEl.className = "dream-insights";
        for (const insight of r.insights) {
          appendTextElement(insightsEl, "span", insight, "dream-insight-tag");
        }
        card.appendChild(insightsEl);
      }
    }
    body.appendChild(card);
  }

  showModal("dream-modal");

  let seconds = 30;
  timer.textContent = `${seconds}s`;
  const interval = setInterval(() => {
    seconds--;
    timer.textContent = `${seconds}s`;
    if (seconds <= 0) {
      clearInterval(interval);
      finishDream(null);
    }
  }, 1000);

  function finishDream(data) {
    clearInterval(interval);
    hideModal("dream-modal");
    confirmBtn.removeEventListener("click", onConfirm);
    resolve(data);
  }

  function onConfirm() {
    const modified = [];
    for (const r of results) {
      if (!r.success) {
        modified.push({
          agentId: r.agentId,
          type: r.type,
          narrative: r.narrative,
          insights: r.insights,
        });
        continue;
      }
      const card = body.querySelector(`[data-agent-id="${r.agentId}"]`);
      const textarea = card?.querySelector("textarea");
      const newNarrative = textarea ? textarea.value : r.narrative;
      modified.push({
        agentId: r.agentId,
        type: r.type,
        narrative: newNarrative,
        insights: r.insights,
      });
    }
    finishDream(modified);
  }

  confirmBtn.addEventListener("click", onConfirm);
}

// ========== 晨会 ==========

function showMeetingModal(initialMessages, chatHistory, townContext, resolve) {
  const chatEl = document.getElementById("meeting-chat");
  const input = document.getElementById("meeting-input");
  const sendBtn = document.getElementById("meeting-send");
  const endBtn = document.getElementById("meeting-end");
  const timer = document.getElementById("meeting-timer");
  chatEl.innerHTML = "";
  let finished = false;
  let msgCount = 0;

  showModal("meeting-modal");

  // 逐条显示初始消息
  let msgIndex = 0;
  const revealInterval = setInterval(() => {
    if (msgIndex >= initialMessages.length) {
      clearInterval(revealInterval);
      startAutoChat();
      return;
    }
    appendMeetingMessage(initialMessages[msgIndex]);
    chatEl.scrollTop = chatEl.scrollHeight;
    msgIndex++;
  }, 500);

  // 自动聊天：每隔5秒一个agent发言
  let autoChatTimer;
  let speakerQueue = [];
  function pickNextMeetingAgent(agentArr) {
    if (speakerQueue.length === 0) {
      speakerQueue = [...agentArr].sort(() => Math.random() - 0.5);
    }
    return speakerQueue.shift() || agentArr[0];
  }
  function startAutoChat() {
    autoChatTimer = setInterval(async () => {
      if (finished) return;
      const agentArr = [...state.world.agents.values()];
      const agent = pickNextMeetingAgent(agentArr);
      try {
        const content = await getMeetingAgentReply(agent, chatHistory, townContext, {
          dayCount: state.world.dayCount,
        });
        const msg = {
          agentId: agent.id,
          agentName: agent.name,
          content,
          type: "agent",
        };
        chatHistory.push(msg);
        appendMeetingMessage(msg);
        chatEl.scrollTop = chatEl.scrollHeight;
        msgCount++;

        // 每8次发言后（至少40秒），让下一个agent有机会提散会
        if (msgCount > 0 && msgCount % 8 === 0) {
          const nextAgent =
            agentArr[(agentArr.indexOf(agent) + 1) % agentArr.length];
          const endContent = await getMeetingAgentReply(
            nextAgent,
            chatHistory,
            townContext,
            { dayCount: state.world.dayCount, canEndMeeting: true },
          );
          const endMsg = {
            agentId: nextAgent.id,
            agentName: nextAgent.name,
            content: endContent,
            type: "agent",
          };
          chatHistory.push(endMsg);
          appendMeetingMessage(endMsg);
          chatEl.scrollTop = chatEl.scrollHeight;

          if (
            endContent.includes("散会") ||
            endContent.includes("结束") ||
            endContent.includes("开始干活")
          ) {
            finish("agent");
          }
        }
      } catch {}
    }, 5000);
  }

  // 晨会倒计时，与模拟器使用同一配置；到时后直接散会，各自行动
  let seconds = GAME_CONFIG.ui.meetingTimeoutSeconds;
  function updateTimer() {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    timer.textContent = `${m}:${s.toString().padStart(2, "0")}`;
  }
  updateTimer();
  const countdown = setInterval(() => {
    seconds--;
    updateTimer();
    if (seconds <= 0) finish("timeout");
  }, 1000);

  function finish(endedBy) {
    if (finished) return;
    finished = true;
    clearInterval(countdown);
    clearInterval(autoChatTimer);
    clearInterval(revealInterval);
    hideModal("meeting-modal");
    resolve({ chatHistory, endedBy });
  }

  endBtn.onclick = () => finish("player");

  // 玩家输入处理
  sendBtn.onclick = () => sendPlayerMessage();
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendPlayerMessage();
  });

  async function sendPlayerMessage() {
    const text = input.value.trim();
    if (!text || finished) return;
    input.value = "";
    const msg = { agentName: "玩家", content: text, type: "player" };
    chatHistory.push(msg);
    appendMeetingMessage(msg);
    chatEl.scrollTop = chatEl.scrollHeight;

    const atMatch = text.match(/^@(\S+)\s*(.*)/);
    if (atMatch) {
      const targetName = atMatch[1];
      if (targetName === "所有人") {
        const agentArr = [...state.world.agents.values()];
        const shuffled = agentArr.sort(() => Math.random() - 0.5).slice(0, 2);
        for (const agent of shuffled) {
          const reply = await getMeetingAgentReply(
            agent,
            chatHistory,
            townContext,
          );
          const m = {
            agentId: agent.id,
            agentName: agent.name,
            content: reply,
            type: "agent",
          };
          chatHistory.push(m);
          appendMeetingMessage(m);
          chatEl.scrollTop = chatEl.scrollHeight;
        }
      } else {
        const agent = [...state.world.agents.values()].find(
          (a) => a.name === targetName,
        );
        if (agent) {
          const reply = await getMeetingAgentReply(
            agent,
            chatHistory,
            townContext,
          );
          const m = {
            agentId: agent.id,
            agentName: agent.name,
            content: reply,
            type: "agent",
          };
          chatHistory.push(m);
          appendMeetingMessage(m);
          chatEl.scrollTop = chatEl.scrollHeight;
        }
      }
    } else {
      const agentArr = [...state.world.agents.values()];
      const agent = pickNextMeetingAgent(agentArr);
      const reply = await getMeetingAgentReply(agent, chatHistory, townContext);
      const m = {
        agentId: agent.id,
        agentName: agent.name,
        content: reply,
        type: "agent",
      };
      chatHistory.push(m);
      appendMeetingMessage(m);
      chatEl.scrollTop = chatEl.scrollHeight;
    }
  }
}

function appendMeetingMessage(msg) {
  const chatEl = document.getElementById("meeting-chat");
  if (!chatEl) {
    console.error("[晨会] meeting-chat元素不存在!");
    return;
  }
  appendSafeMessage(chatEl, msg);
}

function getMeetingRepeatedPhrases(chatHistory) {
  return chatHistory
    .slice(-8)
    .map((m) => String(m.content || "").replace(/\s+/g, " ").slice(0, 28))
    .filter(Boolean)
    .join(" / ");
}

async function getMeetingAgentReply(agent, chatHistory, townContext, options = {}) {
  const context = chatHistory
    .slice(-8)
    .map((m) => `${m.agentName || "玩家"}: ${m.content}`)
    .join("\n");
  const repeatedPhrases = getMeetingRepeatedPhrases(chatHistory);
  const worldState = state.world.getWorldState();
  const agentState = `${agent.name}当前状态：健康${Math.round(agent.health.current)}/${agent.health.max}，饱腹${Math.round(agent.fullness)}，积分${Math.round(agent.greenPoints)}，行动=${agent.currentAction?.description || agent.status}`;
  const customPrompt = agent.customPrompt
    ? `\n角色认知与目的（来自人物编辑页）：${agent.customPrompt}`
    : "";
  const reply = await agent.llm.chat(
    [
      {
        role: "system",
        content: `你是${agent.name}，${agent.age}岁，${agent.occupation}。\n\n${townContext || ""}\n今天是第${worldState.dayCount || 1}天。\n${agentState}${customPrompt}`,
      },
      {
        role: "user",
        content: `你正在和大家开晨会讨论分工。最近的对话:\n${context || "暂无"}\n\n最近已经出现过的句式片段：${repeatedPhrases || "暂无"}\n\n要求：\n- 继续由你自然发言，不要模板化。\n- 接住上一位的话，围绕今天污染、粮食、知识、科技或个人状态说1-2句行动判断。\n- 不要使用括号动作描写，例如“（揉了揉太阳穴）”。\n- 不要用梦境套话开场，不要复用最近的比喻、开场或句式。\n- 只能提到当前在场居民、玩家或“大家”，不要编不存在的人。\n${options.canEndMeeting ? '- 如果分工已经够明确，可以自然说“那就散会吧”，并带一句你准备去做什么。' : ""}\n只输出文字。`,
      },
    ],
    { timeout: 10000 },
  );
  return sanitizeWorldChatText(reply, "大家");
}

// ========== 编辑模式功能 ==========
function initEditor() {
  // 设置编辑模式事件监听
  setupEditorListeners();
  setupEditorSidebarPanels();
  window.addEventListener("pagehide", flushEditorMapPersistOnPageHide);

  // 保存初始历史状态
  saveAreaHistory();
}

function setupEditorListeners() {
  // 模式切换按钮
  const modeToggle = document.getElementById("btn-mode-toggle");
  modeToggle?.addEventListener("click", toggleEditMode);

  // 工具按钮（select, area, eraser）
  document.querySelectorAll(".toolbar-btn[data-tool]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      document
        .querySelectorAll(".toolbar-btn[data-tool]")
        .forEach((b) => b.classList.remove("active"));
      e.currentTarget.classList.add("active");
      state.editorTool = e.currentTarget.dataset.tool;
      // 更新光标
      const container = state.canvas?.parentElement;
      if (container) {
        container.style.cursor =
          state.editorTool === "pan" ? "grab" : "crosshair";
      }
    });
  });

  // Paint模式按钮（blocked/passable）
  document.querySelectorAll(".toolbar-btn[data-paint]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      document
        .querySelectorAll(".toolbar-btn[data-paint]")
        .forEach((b) => b.classList.remove("active"));
      e.currentTarget.classList.add("active");
      state.paintMode = e.currentTarget.dataset.paint;
    });
  });

  // 地块大小选择
  // 地块大小快捷按钮
  document.querySelectorAll("[data-tile]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const val = parseInt(e.currentTarget.dataset.tile);
      const oldVal = CONFIG.MAP_CELL_SIZE;
      document.getElementById("tile-size-input").value = val;
      CONFIG.MAP_CELL_SIZE = val;
      updateAgentPositionsForNewCellSize(oldVal, val);
      state.world?.updateGridSize(CONFIG.MAP_CELL_SIZE);
      scheduleEditorMapPersist();
      updateEditorInfo();
    });
  });

  // 地块大小手动输入
  document
    .getElementById("tile-size-input")
    ?.addEventListener("change", (e) => {
      const val = parseInt(e.target.value);
      if (val >= 8 && val <= 256) {
        const oldVal = CONFIG.MAP_CELL_SIZE;
        CONFIG.MAP_CELL_SIZE = val;
        updateAgentPositionsForNewCellSize(oldVal, val);
        state.world?.updateGridSize(CONFIG.MAP_CELL_SIZE);
        scheduleEditorMapPersist();
        updateEditorInfo();
      }
    });

  // 合并按钮
  document
    .getElementById("btn-merge-areas")
    ?.addEventListener("click", mergeSelectedAreas);

  // 保存/加载/清空
  document
    .getElementById("btn-save-map")
    ?.addEventListener("click", saveMapData);
  document.getElementById("btn-load-map")?.addEventListener("click", () => {
    document.getElementById("map-file-input")?.click();
  });
  document
    .getElementById("map-file-input")
    ?.addEventListener("change", loadMapData);
  document.getElementById("btn-clear-map")?.addEventListener("click", clearMap);
}

function toggleEditMode() {
  state.isEditMode = !state.isEditMode;

  const modeToggle = document.getElementById("btn-mode-toggle");
  const editorToolbar = document.getElementById("editor-toolbar");
  const simSidebar = document.getElementById("simulation-sidebar");
  const editorSidebar = document.getElementById("editor-sidebar");

  if (state.isEditMode) {
    if (modeToggle) modeToggle.textContent = "编辑模式";
    if (modeToggle) modeToggle.classList.add("active");
    if (editorToolbar) editorToolbar.classList.remove("hidden");
    if (simSidebar) simSidebar.classList.add("hidden");
    if (editorSidebar) editorSidebar.classList.remove("hidden");

    if (state.world) state.world.stop();

    updateEditorInfo();
    renderAreaListInEditor();
    renderAreaProperties(state.editorSelectedArea);
    drawMap();
  } else {
    if (modeToggle) modeToggle.textContent = "模拟模式";
    if (modeToggle) modeToggle.classList.remove("active");
    if (editorToolbar) editorToolbar.classList.add("hidden");
    if (simSidebar) simSidebar.classList.remove("hidden");
    if (editorSidebar) editorSidebar.classList.add("hidden");

    // 同步区域到world
    state.world.setAreas(state.areas);
    scheduleEditorMapPersist({ immediate: true });
    drawMap();
  }
}

function showHint(message) {
  const oldHint = document.querySelector(".editor-hint");
  if (oldHint) oldHint.remove();

  const hint = document.createElement("div");
  hint.className = "editor-hint";
  hint.textContent = message;
  document.body.appendChild(hint);

  setTimeout(() => {
    hint.style.opacity = "0";
    hint.style.transition = "opacity 0.3s";
    setTimeout(() => hint.remove(), 300);
  }, 3000);
}

// ========== 启动 ==========
// 暴露编辑器函数供测试使用
window._editorTest = {
  get state() {
    return state;
  },
  eraseAreaAt,
  mergeSelectedAreas,
  addArea,
  renderAreaListInEditor,
  scheduleEditorMapPersist,
  persistEditorMapNow,
};

window.addEventListener("DOMContentLoaded", init);
