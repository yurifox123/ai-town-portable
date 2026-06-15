/**
 * 人格系统：Prompt 构建 + 行为权重计算
 * 从 prompts.js 导入提示词模板，保留辅助函数
 */
import GAME_CONFIG from "./game-config.js";
import PROMPTS, { personalityDescription } from "./prompts.js";

export function normalizePersonality(personality) {
  const defaults = GAME_CONFIG.personality.defaultTraits;
  const source =
    personality && typeof personality === "object" ? personality : {};
  return {
    social:
      typeof source.social === "number" && Number.isFinite(source.social)
        ? source.social
        : defaults.social,
    energy:
      typeof source.energy === "number" && Number.isFinite(source.energy)
        ? source.energy
        : defaults.energy,
  };
}

/**
 * 将旧格式（只有 traits 字符串）补全为完整人格结构
 */
export function normalizeTemplate(t) {
  t.personality = normalizePersonality(t.personality);
  if (!t.rules || !Array.isArray(t.rules)) t.rules = [];
  if (!t.preferences) t.preferences = { places: [], activities: [] };
  if (!t.customPrompt && t.custom_prompt) t.customPrompt = t.custom_prompt;
  if (!t.customPrompt) t.customPrompt = "";
  if (!t.routine)
    t.routine = {
      wakeTime: GAME_CONFIG.personality.defaultWakeTime,
      sleepTime: GAME_CONFIG.personality.defaultSleepTime,
    };
  if (!t.occupation) t.occupation = "普通居民";
  // 从 traits 字符串反向生成 rules（如果只有旧格式）
  if (!t.rules.length && t.traits) {
    t.rules = [`你是一个${t.traits}的人`];
  }
  return t;
}

// 重新导出 prompts.js 中的构建函数
export const buildSystemPrompt = PROMPTS.system.identity;
export const buildDecisionPrompt = (agent, context = {}) => {
  const basePrompt = PROMPTS.user.decision(agent, context);
  const cycleGuidance = context.cycleGuidance || agent.cycleGuidance;
  if (!cycleGuidance) return basePrompt;
  return `${basePrompt}\n\n## 杞洖鎸囧紩\n${cycleGuidance}\n璇峰皢杩欐潯鎸囧紩浣滀负鏂瑰悜鍙傝€冿紝浣嗕笉瑕佹妸瀹冨綋鎴愭櫘閫氳蹇嗛€愭潯澶嶈銆?`;
};
export const buildPlanPrompt = (agent) => {
  const basePrompt = PROMPTS.user.plan(agent);
  if (!agent.cycleGuidance) return basePrompt;
  return `${basePrompt}\n\n琛ュ厖锛氫綘杩欎竴杞敹鍒颁簡涓€鏉℃潵鑷笂涓疆鍥炵殑鎸囧紩锛?${agent.cycleGuidance}`;
};
export const buildMeetingPrompt = PROMPTS.user.meeting;
export { personalityDescription };
