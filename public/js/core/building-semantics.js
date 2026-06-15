import GAME_CONFIG from "./game-config.js";

export const BUILDING_PURPOSES = Object.freeze([
  { value: "personal", label: "个人" },
  { value: "collective", label: "集体" },
  { value: "mixed", label: "混合" },
  { value: "support", label: "支援" },
  { value: "neutral", label: "中性" },
]);

const EFFECT_VALUE_SLIDER = Object.freeze({ min: -2, max: 2, step: 0.01 });

export const BUILDING_EFFECT_TAGS = Object.freeze([
  {
    key: "personalPoints",
    label: "个人积分",
    description: "只让使用者赚取个人积分，不增加集体资源。",
    intents: ["money", "work"],
    control: { ...EFFECT_VALUE_SLIDER, unit: "积分/小时", defaultValue: 8 },
  },
  {
    key: "foodSupply",
    label: "食物补给",
    description: "提供个人食物或补给，通常会消耗粮食库存。",
    intents: ["food", "buy"],
    control: { ...EFFECT_VALUE_SLIDER, unit: "饱腹/次", defaultValue: 20 },
  },
  {
    key: "healing",
    label: "治疗恢复",
    description: "恢复个人健康，适合低血量时使用。",
    intents: ["healing", "buy"],
    control: { ...EFFECT_VALUE_SLIDER, unit: "健康/次", defaultValue: 18 },
  },
  {
    key: "sleepRest",
    label: "睡眠休息",
    description: "提供睡眠与休息，恢复健康并解除熬夜风险。",
    intents: ["sleep"],
    control: { ...EFFECT_VALUE_SLIDER, unit: "健康/次", defaultValue: 10 },
  },
  {
    key: "pollutionCleanup",
    label: "污染净化",
    description: "直接降低污染，是集体救世行动。",
    intents: ["cleanup", "work"],
    control: { ...EFFECT_VALUE_SLIDER, unit: "污染/小时", defaultValue: -0.52 },
  },
  {
    key: "techTheory",
    label: "科技理论",
    description: "推进科技理论值。",
    intents: ["theory", "work"],
    control: { ...EFFECT_VALUE_SLIDER, unit: "理论/小时", defaultValue: 1 },
  },
  {
    key: "techProduction",
    label: "科技生产",
    description: "推进科技生产值。",
    intents: ["production", "work"],
    control: { ...EFFECT_VALUE_SLIDER, unit: "生产/小时", defaultValue: 1 },
  },
  {
    key: "knowledgeReserve",
    label: "知识储备",
    description: "增加可被消耗和转化的知识储备。",
    intents: ["knowledge", "work"],
    control: { ...EFFECT_VALUE_SLIDER, unit: "知识/小时", defaultValue: 2 },
  },
  {
    key: "knowledgeConversion",
    label: "知识转化",
    description: "消耗前人知识，转化为理论与生产进展。",
    intents: ["knowledge", "theory", "production", "work"],
    control: { ...EFFECT_VALUE_SLIDER, unit: "知识/小时", defaultValue: 2 },
  },
  {
    key: "foodProduction",
    label: "粮食生产",
    description: "增加集体粮食库存。",
    intents: ["foodProduction", "food", "work"],
    control: { ...EFFECT_VALUE_SLIDER, unit: "粮食/小时", defaultValue: 0.6 },
  },
  {
    key: "materialValue",
    label: "物资价值",
    description: "增加集体物资价值。",
    intents: ["material", "work"],
    control: { ...EFFECT_VALUE_SLIDER, unit: "物资/小时", defaultValue: 1 },
  },
  {
    key: "socialPlace",
    label: "社交场所",
    description: "适合交谈与协作，不直接产生数值。",
    intents: ["social"],
    control: { ...EFFECT_VALUE_SLIDER, unit: "社交吸引", defaultValue: 1 },
  },
]);

const TAG_BY_KEY = new Map(BUILDING_EFFECT_TAGS.map((tag) => [tag.key, tag]));
const TAG_KEY_BY_LABEL = new Map(
  BUILDING_EFFECT_TAGS.map((tag) => [tag.label, tag.key]),
);
const PURPOSE_BY_VALUE = new Map(BUILDING_PURPOSES.map((p) => [p.value, p]));

const LEGACY_AREA_SEMANTICS = Object.freeze({
  宿舍: {
    purpose: "support",
    tags: ["sleepRest"],
    agentDescription: "休息和睡觉的地方，夜里回到这里才能避免熬夜惩罚。",
  },
  实验室: {
    purpose: "collective",
    tags: ["techTheory"],
    agentDescription: "研究理论的地方，能补齐科技理论短板。",
  },
  物资基地: {
    purpose: "mixed",
    tags: ["foodSupply", "materialValue"],
    agentDescription:
      "个人应急补给点，可以领取食物和药品进背包，但不等于集体粮仓。",
  },
  许愿池: {
    purpose: "collective",
    tags: ["pollutionCleanup"],
    agentDescription: "直接净化污染的地方，污染升高时这是集体生死线。",
  },
  田地: {
    purpose: "collective",
    tags: ["foodProduction", "materialValue"],
    agentDescription: "生产集体粮食的地方，粮食危机时优先级很高。",
  },
  图书馆: {
    purpose: "collective",
    tags: ["knowledgeConversion", "knowledgeReserve"],
    agentDescription:
      "前人知识的储备地，知识会被消耗并转化成理论和生产进展。",
  },
  仓库: {
    purpose: "personal",
    tags: ["personalPoints"],
    agentDescription:
      "纯个人积分收益点，不增加集体资源，也不能替代救世行动。",
  },
  工厂: {
    purpose: "collective",
    tags: ["techProduction"],
    agentDescription: "把理论落到生产的地方，推进科技生产值。",
  },
});

function clonePlain(value, fallback = {}) {
  try {
    return JSON.parse(JSON.stringify(value ?? fallback));
  } catch {
    return fallback;
  }
}

function parseJsonMaybe(value, fallback) {
  if (typeof value !== "string") return value ?? fallback;
  if (!value.trim()) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function uniqueKnownTags(tags = []) {
  const result = [];
  for (const tag of tags || []) {
    const key = String(tag || "").trim();
    if (!TAG_BY_KEY.has(key) || result.includes(key)) continue;
    result.push(key);
  }
  return result;
}

function isNonZeroEffectValue(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric !== 0;
}

function getPresetDefaultEffectValue(tagKey) {
  const preset = presetForTag(tagKey);
  if (tagKey === "personalPoints" && preset.income != null) {
    return Number(preset.income) || 0;
  }
  if (tagKey === "foodSupply" && preset.fullness != null) {
    return Number(preset.fullness) || 0;
  }
  if ((tagKey === "healing" || tagKey === "sleepRest") && preset.health != null) {
    return Number(preset.health) || 0;
  }
  if (tagKey === "pollutionCleanup" && preset.pollutionEffect != null) {
    return Number(preset.pollutionEffect) || 0;
  }
  const effects = preset.resourceEffects || {};
  const resourceKeyByTag = {
    techTheory: "techTheory",
    techProduction: "techProduction",
    knowledgeReserve: "knowledgeReserve",
    foodProduction: "foodStock",
    materialValue: "materialValue",
  };
  const resourceKey = resourceKeyByTag[tagKey];
  if (resourceKey && effects[resourceKey] != null) {
    return Number(effects[resourceKey]) || 0;
  }
  return Number(TAG_BY_KEY.get(tagKey)?.control?.defaultValue) || 0;
}

function normalizeEffectValues(effectValues = {}, fallbackTags = []) {
  const normalized = {};
  if (effectValues && typeof effectValues === "object") {
    for (const tag of BUILDING_EFFECT_TAGS) {
      if (!Object.prototype.hasOwnProperty.call(effectValues, tag.key)) continue;
      const numeric = Number(effectValues[tag.key]);
      normalized[tag.key] = Number.isFinite(numeric) ? numeric : 0;
    }
  }

  for (const tagKey of uniqueKnownTags(fallbackTags)) {
    if (Object.prototype.hasOwnProperty.call(normalized, tagKey)) continue;
    normalized[tagKey] = getPresetDefaultEffectValue(tagKey);
  }

  return normalized;
}

function tagsFromEffectValues(effectValues = {}) {
  return uniqueKnownTags(
    Object.entries(effectValues)
      .filter(([, value]) => isNonZeroEffectValue(value))
      .map(([tagKey]) => tagKey),
  );
}

function purposeOrDefault(value, fallback = "neutral") {
  return PURPOSE_BY_VALUE.has(value) ? value : fallback;
}

function getAreaCenter(area) {
  const cells = Array.isArray(area?.cells) ? area.cells : [];
  if (cells.length === 0) return null;
  const sum = cells.reduce(
    (acc, cell) => ({
      x: acc.x + Number(cell.x || 0),
      y: acc.y + Number(cell.y || 0),
    }),
    { x: 0, y: 0 },
  );
  return {
    x: Math.round(sum.x / cells.length),
    y: Math.round(sum.y / cells.length),
  };
}

function inferTagsFromServices(services = []) {
  const tags = [];
  for (const service of services || []) {
    if (!service || typeof service !== "object") continue;
    tags.push(...(Array.isArray(service.tags) ? service.tags : []));
    if ((service.income || 0) > 0) tags.push("personalPoints");
    if ((service.fullness || 0) > 0) tags.push("foodSupply");
    if ((service.health || 0) > 0) tags.push("healing");
    if ((service.pollutionEffect || 0) < 0) tags.push("pollutionCleanup");
    if (service.resourceEffects && typeof service.resourceEffects === "object") {
      if (service.resourceEffects.techTheory) tags.push("techTheory");
      if (service.resourceEffects.techProduction) tags.push("techProduction");
      if (service.resourceEffects.foodStock) tags.push("foodProduction");
      if (service.resourceEffects.materialValue) tags.push("materialValue");
      if (service.resourceEffects.knowledgeReserve) tags.push("knowledgeReserve");
    }
    if (String(service.name || "").includes("睡")) tags.push("sleepRest");
  }
  return uniqueKnownTags(tags);
}

function inferEffectValuesFromServices(services = []) {
  const values = {};
  for (const service of services || []) {
    if (!service || typeof service !== "object") continue;
    if (service.income != null) values.personalPoints = Number(service.income) || 0;
    if (service.fullness != null) values.foodSupply = Number(service.fullness) || 0;
    if (service.health != null) values.healing = Number(service.health) || 0;
    if (String(service.name || "").includes("睡") && service.health != null) {
      values.sleepRest = Number(service.health) || 0;
    }
    if (service.pollutionEffect != null) {
      values.pollutionCleanup = Number(service.pollutionEffect) || 0;
    }
    const effects = service.resourceEffects || {};
    if (effects.techTheory != null) values.techTheory = Number(effects.techTheory) || 0;
    if (effects.techProduction != null) {
      values.techProduction = Number(effects.techProduction) || 0;
    }
    if (effects.knowledgeReserve != null) {
      values.knowledgeReserve = Number(effects.knowledgeReserve) || 0;
    }
    if (effects.foodStock != null) values.foodProduction = Number(effects.foodStock) || 0;
    if (effects.materialValue != null) {
      values.materialValue = Number(effects.materialValue) || 0;
    }
    if (serviceHasTag(service, "knowledgeConversion")) {
      values.knowledgeConversion =
        Number(service.knowledgeConversionRate) ||
        getPresetDefaultEffectValue("knowledgeConversion");
    }
    if (serviceHasTag(service, "socialPlace")) {
      values.socialPlace =
        Number(service.socialValue) || getPresetDefaultEffectValue("socialPlace");
    }
  }
  return values;
}

export function getTagLabel(tagKey) {
  return TAG_BY_KEY.get(tagKey)?.label || tagKey;
}

export function getTagKeyByLabel(label) {
  return TAG_KEY_BY_LABEL.get(label) || "";
}

export function getPurposeLabel(purpose) {
  return PURPOSE_BY_VALUE.get(purpose)?.label || "中性";
}

export function inferAreaSemantics(area) {
  const name = String(area?.name || "").trim();
  const legacy = LEGACY_AREA_SEMANTICS[name];
  const serviceTags = inferTagsFromServices(area?.services);
  const effectValues = normalizeEffectValues(
    inferEffectValuesFromServices(area?.services),
    [...(legacy?.tags || []), ...serviceTags],
  );
  const tags = tagsFromEffectValues(effectValues);
  const enabled =
    Boolean(legacy) ||
    tags.length > 0 ||
    (Array.isArray(area?.services) && area.services.length > 0);
  const purpose =
    legacy?.purpose ||
    (tags.includes("personalPoints") && tags.length === 1
      ? "personal"
      : tags.some((tag) =>
          ["pollutionCleanup", "techTheory", "techProduction", "foodProduction", "materialValue"].includes(tag),
        )
        ? "collective"
        : enabled
          ? "mixed"
          : "neutral");

  return {
    enabled,
    purpose,
    tags,
    effectValues,
    agentDescription:
      legacy?.agentDescription ||
      (enabled
        ? `${name || "这个区域"}的用途由它的服务和标签决定，居民会按效果选择是否前往。`
        : ""),
  };
}

function presetForTag(tagKey) {
  return GAME_CONFIG.buildingEffectPresets?.[tagKey] || {};
}

function createDefaultService(tagKey, purpose = "neutral", effectValue = null) {
  const preset = presetForTag(tagKey);
  const numericValue =
    effectValue == null
      ? getPresetDefaultEffectValue(tagKey)
      : Number(effectValue) || 0;
  const collectiveImpact = preset.collectiveImpact || purpose;
  const resourceEffects = createDefaultResourceEffects(tagKey, numericValue);
  const base = {
    name: preset.serviceName || getTagLabel(tagKey),
    cost: preset.cost ?? 0,
    description: preset.description || TAG_BY_KEY.get(tagKey)?.description || "",
    tags: [tagKey],
    collectiveImpact,
    semanticGenerated: true,
  };

  if (tagKey === "personalPoints") base.income = numericValue;
  if (tagKey === "foodSupply") base.fullness = numericValue;
  if (tagKey === "healing" || tagKey === "sleepRest") base.health = numericValue;
  if (tagKey === "pollutionCleanup") base.pollutionEffect = numericValue;
  if (tagKey === "knowledgeConversion") base.knowledgeConversionRate = numericValue;
  if (tagKey === "socialPlace") base.socialValue = numericValue;
  if (Object.keys(resourceEffects).length > 0) {
    base.resourceEffects = resourceEffects;
  }

  return base;
}

function createDefaultResourceEffects(tagKey, effectValue = null) {
  const value =
    effectValue == null
      ? getPresetDefaultEffectValue(tagKey)
      : Number(effectValue) || 0;
  const effectByTag = {
    techTheory: { techTheory: value },
    techProduction: { techProduction: value },
    knowledgeReserve: { knowledgeReserve: value },
    foodProduction: { foodStock: value },
    materialValue: { materialValue: value },
  };
  return clonePlain(effectByTag[tagKey] || {}, {});
}

function normalizeService(service, areaPurpose) {
  if (!service || typeof service !== "object") return null;
  const normalized = { ...service };
  normalized.tags = uniqueKnownTags(normalized.tags || inferTagsFromServices([normalized]));
  if (!normalized.collectiveImpact) {
    normalized.collectiveImpact = areaPurpose || "neutral";
  }
  if (normalized.resourceEffects && typeof normalized.resourceEffects === "object") {
    normalized.resourceEffects = clonePlain(normalized.resourceEffects, {});
  }
  if (normalized.knowledgeConversionRate != null) {
    normalized.knowledgeConversionRate = Number(normalized.knowledgeConversionRate) || 0;
  }
  if (normalized.socialValue != null) {
    normalized.socialValue = Number(normalized.socialValue) || 0;
  }
  return normalized;
}

function mergeGeneratedServices(services, effectValues, purpose) {
  const tags = tagsFromEffectValues(effectValues);
  const normalized = (Array.isArray(services) ? services : [])
    .map((service) => normalizeService(service, purpose))
    .filter(Boolean)
    .filter((service) => !service.semanticGenerated);

  for (const tag of tags) {
    normalized.push(createDefaultService(tag, purpose, effectValues[tag]));
  }

  return normalized;
}

export function normalizeAreaSemantics(area) {
  if (!area || typeof area !== "object") return area;
  area.metadata = parseJsonMaybe(area.metadata, {}) || {};
  if (!area.metadata || typeof area.metadata !== "object") area.metadata = {};

  const inferred = inferAreaSemantics(area);
  const hasExplicitBuilding = Object.prototype.hasOwnProperty.call(
    area.metadata,
    "building",
  );
  const rawBuilding =
    hasExplicitBuilding && area.metadata.building && typeof area.metadata.building === "object"
      ? area.metadata.building
      : {};

  const enabled =
    typeof rawBuilding.enabled === "boolean"
      ? rawBuilding.enabled
      : inferred.enabled;
  const purpose = purposeOrDefault(rawBuilding.purpose, inferred.purpose);
  const effectValues = normalizeEffectValues(
    rawBuilding.effectValues,
    Array.isArray(rawBuilding.tags) ? rawBuilding.tags : inferred.tags,
  );
  const tags = tagsFromEffectValues(effectValues);
  const agentDescription =
    typeof rawBuilding.agentDescription === "string" &&
    rawBuilding.agentDescription.trim()
      ? rawBuilding.agentDescription.trim()
      : inferred.agentDescription;

  area.metadata = {
    ...area.metadata,
    building: {
      enabled,
      purpose,
      tags,
      effectValues,
      agentDescription,
      inferred: rawBuilding.inferred === true ? true : !hasExplicitBuilding,
    },
  };

  if (enabled) {
    area.services = mergeGeneratedServices(area.services, effectValues, purpose);
  } else if (Array.isArray(area.services)) {
    area.services = area.services
      .map((service) => normalizeService(service, purpose))
      .filter(Boolean)
      .filter((service) => !service.semanticGenerated);
  } else {
    area.services = [];
  }

  return area;
}

export function getAreaBuilding(area) {
  normalizeAreaSemantics(area);
  return area?.metadata?.building || {
    enabled: false,
    purpose: "neutral",
    tags: [],
    effectValues: {},
    agentDescription: "",
  };
}

export function getAreaTags(area) {
  const building = getAreaBuilding(area);
  if (!building.enabled) return [];
  return uniqueKnownTags([
    ...(building.tags || []),
    ...inferTagsFromServices(area?.services || []),
  ]);
}

export function serviceHasTag(service, tagKey) {
  return Array.isArray(service?.tags) && service.tags.includes(tagKey);
}

export function serviceMatchesIntent(service, intent) {
  if (!service) return false;
  const tags = Array.isArray(service.tags) ? service.tags : [];
  for (const tag of tags) {
    if (TAG_BY_KEY.get(tag)?.intents?.includes(intent)) return true;
  }
  if (intent === "food") return (service.fullness || 0) > 0;
  if (intent === "healing") return (service.health || 0) > 0;
  if (intent === "cleanup") return (service.pollutionEffect || 0) < 0;
  if (intent === "money") return (service.income || 0) > 0;
  if (intent === "sleep") return String(service.name || "").includes("睡");
  if (intent === "buy") return (service.fullness || 0) > 0 || (service.health || 0) > 0;
  if (intent === "work") {
    return (
      (service.income || 0) > 0 ||
      (service.pollutionEffect || 0) !== 0 ||
      Boolean(
        service.resourceEffects &&
          Object.values(service.resourceEffects).some((value) => Number(value) !== 0),
      )
    );
  }
  if (intent === "theory") return Boolean(service.resourceEffects?.techTheory);
  if (intent === "production") {
    return Boolean(service.resourceEffects?.techProduction);
  }
  if (intent === "foodProduction") {
    return Boolean(service.resourceEffects?.foodStock);
  }
  if (intent === "material") return Boolean(service.resourceEffects?.materialValue);
  if (intent === "knowledge") {
    return (
      Boolean(service.resourceEffects?.knowledgeReserve) ||
      serviceHasTag(service, "knowledgeConversion")
    );
  }
  return false;
}

export function getBestServiceForIntent(area, intent) {
  normalizeAreaSemantics(area);
  const services = Array.isArray(area?.services) ? area.services : [];
  return services.find((service) => serviceMatchesIntent(service, intent)) || null;
}

export function isWorkableArea(area) {
  if (!area || area.isBlocked || !Array.isArray(area.cells) || area.cells.length === 0) {
    return false;
  }
  normalizeAreaSemantics(area);
  const building = getAreaBuilding(area);
  if (!building.enabled) return false;
  return (area.services || []).some((service) => {
    if ((service.income || 0) > 0) return true;
    if ((service.pollutionEffect || 0) !== 0) return true;
    if (service.resourceEffects && Object.keys(service.resourceEffects).length > 0) {
      return true;
    }
    return ["personalPoints", "pollutionCleanup", "techTheory", "techProduction", "knowledgeReserve", "knowledgeConversion", "foodProduction", "materialValue"].some((tag) =>
      serviceHasTag(service, tag),
    );
  });
}

export function getAreaBuildingSummary(area) {
  normalizeAreaSemantics(area);
  const building = getAreaBuilding(area);
  if (!building.enabled || area.isBlocked) return "";
  const center = getAreaCenter(area);
  if (!center) return "";

  const tagLabels = getAreaTags(area).map(getTagLabel).join("、") || "无";
  const services = (area.services || [])
    .map((service) => describeService(service))
    .filter(Boolean)
    .join("；");
  return `- ${area.name}(${center.x},${center.y}) | 用途:${getPurposeLabel(building.purpose)} | 标签:${tagLabels} | 认知:${building.agentDescription || "暂无"} | 服务:${services || "无"}`;
}

export function describeService(service) {
  if (!service) return "";
  const effects = [];
  if ((service.income || 0) > 0) effects.push(`积分+${service.income}/小时`);
  if ((service.fullness || 0) > 0) effects.push(`饱腹+${service.fullness}`);
  if ((service.health || 0) > 0) effects.push(`健康+${service.health}`);
  if ((service.pollutionEffect || 0) !== 0) {
    effects.push(`污染${service.pollutionEffect}/小时`);
  }
  for (const [key, value] of Object.entries(service.resourceEffects || {})) {
    if (!value) continue;
    const label =
      {
        techTheory: "理论",
        techProduction: "生产",
        knowledgeReserve: "知识",
        foodStock: "粮食",
        materialValue: "物资",
      }[key] || key;
    effects.push(`${label}${value > 0 ? "+" : ""}${value}/小时`);
  }
  const tagLabels = (service.tags || []).map(getTagLabel).join("、");
  return `${service.name}${effects.length ? `(${effects.join(",")})` : ""}${tagLabels ? `[${tagLabels}]` : ""}`;
}

function clampResource(key, value) {
  const cap = GAME_CONFIG.resourceCap || {};
  const acc = GAME_CONFIG.resourceAccumulation || {};
  const maxByKey = {
    techTheory: cap.techTheory ?? 100,
    techProduction: cap.techProduction ?? 100,
    foodStock: acc.foodStockMax ?? 200,
    materialValue: acc.materialValueMax ?? 200,
  };
  const max = maxByKey[key] ?? Infinity;
  return Math.max(0, Math.min(max, value));
}

export function applyServiceResourceEffects(service, world, workHours, agent = null) {
  if (!service || !world?.worldResources) return {};
  const hours = Number(workHours);
  if (!Number.isFinite(hours) || hours <= 0) return {};

  const resources = world.worldResources;
  const before = clonePlain(resources, {});
  const effects = service.resourceEffects || {};

  for (const [key, perHour] of Object.entries(effects)) {
    const value = Number(perHour);
    if (!Number.isFinite(value) || value === 0) continue;
    resources[key] = clampResource(key, (resources[key] || 0) + value * hours);
  }

  if (serviceHasTag(service, "knowledgeConversion")) {
    const acc = GAME_CONFIG.resourceAccumulation || {};
    const knowledge = resources.knowledgeReserve || 0;
    const consume = Math.min(knowledge, hours * 2);
    if (consume > 0) {
      resources.knowledgeReserve = Math.max(0, knowledge - consume);
      if (Math.random() < (acc.knowledgeConversionChance ?? 0.5)) {
        const split = GAME_CONFIG.decision?.knowledgeSplitRatio ?? 0.5;
        resources.techTheory = clampResource(
          "techTheory",
          (resources.techTheory || 0) + consume * split,
        );
        resources.techProduction = clampResource(
          "techProduction",
          (resources.techProduction || 0) + consume * (1 - split),
        );
      }
    }
  }

  const changes = {};
  for (const key of [
    "techTheory",
    "techProduction",
    "knowledgeReserve",
    "foodStock",
    "materialValue",
  ]) {
    const diff = (resources[key] || 0) - (before[key] || 0);
    if (diff !== 0) changes[key] = diff;
  }

  if (agent && Object.keys(changes).length > 0) {
    agent.lastFeedback = `建筑效果生效: ${Object.entries(changes)
      .map(([key, value]) => `${key}${value > 0 ? "+" : ""}${Math.round(value * 10) / 10}`)
      .join(", ")}`;
  }

  return changes;
}
