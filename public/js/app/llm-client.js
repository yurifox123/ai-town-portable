import GAME_CONFIG from "../core/game-config.js";
import { getTagKeyByLabel } from "../core/building-semantics.js";

/**
 * LLM client for browser-side simulation logic.
 * Calls the backend proxy so API keys stay on the server.
 * Falls back to lightweight local heuristics when the backend is unavailable.
 */
class LLMClient {
  constructor() {
    this.baseUrl = "/api/llm";
    this.backendCircuitOpenUntil = 0;
    this.backendFailureCount = 0;
    this.backendCooldownBaseMs = 60 * 1000;
  }

  isLocalFallbackEnabled() {
    return GAME_CONFIG.llm?.enableLocalFallback !== false;
  }

  async retry(operation, maxRetries = 5) {
    let lastError = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation(attempt);
      } catch (error) {
        lastError = error;
        if (attempt >= maxRetries) break;
      }
    }
    throw lastError;
  }

  normalizeTimeout(value, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return fallback;
    return Math.max(1000, Math.min(60000, number));
  }

  async requestJson(path, options = {}) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const message =
        payload?.error ||
        payload?.message ||
        `Request failed: ${response.status}`;
      throw new Error(message);
    }

    return payload;
  }

  async getConfig() {
    return this.requestJson("/config", { method: "GET" });
  }

  async testConfig(config, prompt) {
    return this.requestJson("/config/test", {
      method: "POST",
      body: JSON.stringify({ config, prompt }),
    });
  }

  async saveConfig(config) {
    return this.requestJson("/config", {
      method: "PUT",
      body: JSON.stringify(config),
    });
  }

  /**
   * Send a chat completion request.
   */
  async chat(messages, options = {}) {
    let systemMessage = null;
    const filteredMessages = [];

    for (const msg of messages) {
      if (msg.role === "system") {
        systemMessage = msg.content;
      } else {
        filteredMessages.push(msg);
      }
    }

    if (Date.now() < this.backendCircuitOpenUntil && this.isLocalFallbackEnabled()) {
      return this.generateLocalFallback(systemMessage, filteredMessages, {
        reason: "backend-circuit-open",
      });
    }

    const maxRetries = Math.max(1, options.maxRetries ?? 5);
    const requestTimeout = this.normalizeTimeout(
      options.timeout,
      GAME_CONFIG.llm?.requestTimeoutMs ?? 10000,
    );
    const overallTimeout = this.normalizeTimeout(
      options.overallTimeout,
      GAME_CONFIG.llm?.overallTimeoutMs ?? 20000,
    );
    const startedAt = Date.now();

    try {
      const content = await this.retry(async () => {
        const elapsed = Date.now() - startedAt;
        const remaining = overallTimeout - elapsed;
        if (remaining <= 250) {
          throw new Error(`LLM overall timeout after ${overallTimeout}ms`);
        }

        const effectiveTimeout = Math.min(requestTimeout, remaining);
        const {
          timeout: _timeout,
          overallTimeout: _overallTimeout,
          maxRetries: _maxRetries,
          ...fetchOptions
        } = options;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), effectiveTimeout);

        try {
          const requestBody = {
            messages: filteredMessages,
            options: {
              ...fetchOptions,
              timeout: effectiveTimeout,
              system: systemMessage || fetchOptions.system,
            },
          };

          const response = await fetch(`${this.baseUrl}/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody),
            signal: controller.signal,
          });

          if (!response.ok) {
            const errorText = await response.text().catch(() => "");
            throw new Error(
              `LLM request failed: ${response.status}${errorText ? ` - ${errorText}` : ""}`,
            );
          }

          const data = await response.json();
          return data.content;
        } finally {
          if (timer) clearTimeout(timer);
        }
      }, maxRetries);

      this.resetBackendCircuit();
      return content;
    } catch (error) {
      this.noteBackendFailure(error);
      if (!this.isLocalFallbackEnabled()) {
        throw error;
      }
      console.warn(
        "LLM API unavailable, switching to local fallback",
        error,
      );
      return this.generateLocalFallback(systemMessage, filteredMessages, {
        reason: error?.message || String(error || "unknown-error"),
      });
    }
  }

  noteBackendFailure(error) {
    const message = String(error?.message || error || "");
    const seriousNetworkFailure =
      /fetch failed|network|timed out|timeout|abort|eacces|ecconn|503|502|500/i.test(
        message,
      );

    this.backendFailureCount = Math.min(this.backendFailureCount + 1, 5);
    const multiplier = seriousNetworkFailure
      ? this.backendFailureCount
      : Math.max(1, Math.ceil(this.backendFailureCount / 2));
    const cooldown = Math.min(
      5 * 60 * 1000,
      this.backendCooldownBaseMs * multiplier,
    );
    this.backendCircuitOpenUntil = Date.now() + cooldown;
  }

  resetBackendCircuit() {
    this.backendFailureCount = 0;
    this.backendCircuitOpenUntil = 0;
  }

  generateLocalFallback(systemMessage, messages, meta = {}) {
    const system = String(systemMessage || "");
    const transcript = messages
      .map((msg) => String(msg?.content || ""))
      .join("\n");
    const lastUserMessage = String(
      [...messages].reverse().find((msg) => msg.role === "user")?.content || "",
    );
    const joined = `${system}\n${transcript}`.trim();
    const type = this.detectPromptType(system, lastUserMessage, joined);

    try {
      switch (type) {
        case "decision":
          return this.buildDecisionFallback(joined);
        case "dialogue":
          return this.buildDialogueFallback(joined);
        case "dream":
          return this.buildDreamFallback(joined);
        case "merge":
          return this.buildMergeFallback(joined);
        case "patternReflection":
          return this.buildPatternReflectionFallback(joined);
        case "meetingConsensus":
          return this.buildMeetingConsensusFallback(joined);
        case "meetingMessage":
          return this.buildMeetingMessageFallback(joined);
        case "meetingChat":
          return this.buildMeetingChatFallback(joined);
        case "privateChat":
          return this.buildPrivateChatFallback(joined);
        case "cycleGuidance":
          return this.buildCycleGuidanceFallback(joined);
        case "dailyPlan":
          return this.buildDailyPlanFallback(joined);
        default:
          return this.buildGenericFallback(joined, meta.reason);
      }
    } catch (error) {
      console.warn("Local fallback generation failed, using safe default", error);
      return this.buildSafeDefault(type);
    }
  }

  detectPromptType(system, lastUserMessage, joined) {
    if (joined.includes("最近的私聊记录")) return "privateChat";
    if (joined.includes("给下一个轮回中的自己留一句提醒")) {
      return "cycleGuidance";
    }
    if (joined.includes("输出JSON数组") && joined.includes("规划今天的活动")) {
      return "dailyPlan";
    }
    if (
      joined.includes('"speaker1"') &&
      joined.includes('"speaker2"') &&
      joined.includes("对话")
    ) {
      return "dialogue";
    }
    if (joined.includes('"narrative"') && joined.includes('"insights"')) {
      return "dream";
    }
    if (joined.includes("合并以下两条相似记忆")) return "merge";
    if (joined.includes("次相似行为")) return "patternReflection";
    if (
      joined.includes("统一意见") ||
      joined.includes("只输出统一意见文本")
    ) {
      return "meetingConsensus";
    }
    if (joined.includes("最近的对话") && joined.includes("晨会")) {
      return "meetingChat";
    }
    if (
      joined.includes("讨论今天的分工协作") ||
      joined.includes("只输出文字，不要JSON")
    ) {
      return "meetingMessage";
    }
    if (
      joined.includes('"action":"MOVE|TALK|WAIT|SLEEP|WORK|BUY"') ||
      joined.includes("## 输出JSON") ||
      joined.includes("当前情况:")
    ) {
      return "decision";
    }
    if (system.includes("玩家单独交谈")) return "privateChat";
    return "generic";
  }

  getKnowledgeWarningThreshold() {
    return GAME_CONFIG.decision?.knowledgeWarning ?? 45;
  }

  getKnowledgeEarlyFocusThreshold() {
    return GAME_CONFIG.decision?.knowledgeEarlyFocusThreshold ?? 90;
  }

  getTechRampTarget() {
    return GAME_CONFIG.decision?.techRampTarget ?? 30;
  }

  shouldFrontloadLibrary({ techTheory, techProduction, knowledge }) {
    if (knowledge <= 0) return false;
    if (knowledge < this.getKnowledgeWarningThreshold()) return true;
    return (
      knowledge <= this.getKnowledgeEarlyFocusThreshold() &&
      techTheory < this.getTechRampTarget() &&
      techProduction < this.getTechRampTarget()
    );
  }

  buildDecisionFallback(text) {
    const locations = this.parseLocations(text);
    const semanticBuildings = this.parseBuildingSemantics(text);
    const nearbyServices = this.parseNearbyServices(text);
    const nearbyAgentCount = this.extractNearbyAgentCount(text);
    const statusSection = this.extractSection(text, "## 状态:", "## 世界:");
    const profile = this.buildDecisionProfile(text);
    const agentKey = profile.key || text;
    const health = this.extractNumber(
      text,
      [/健康[:：]\s*([-\d.]+)\s*\/\s*[-\d.]+/],
      100,
    );
    const fullness = this.extractNumber(
      text,
      [/饱腹[:：]\s*([-\d.]+)\s*\/\s*100/],
      80,
    );
    const points = this.extractNumber(text, [/积分[:：]\s*([-\d.]+)/], 10);
    const pollution = this.extractNumber(
      text,
      [/污染(?:指数)?[:：]\s*([-\d.]+)\s*\/\s*100/],
      50,
    );
    const techTheory = this.extractNumber(
      text,
      [/理论值[:：]\s*([-\d.]+)/, [/科技理论[:：]\s*([-\d.]+)/]],
      0,
    );
    const techProduction = this.extractNumber(
      text,
      [/生产值[:：]\s*([-\d.]+)/, /科技生产[:：]\s*([-\d.]+)/],
      0,
    );
    const knowledge = this.extractNumber(
      text,
      [/知识(?:储备)?[:：]\s*([-\d.]+)/],
      100,
    );
    const food = this.extractNumber(
      text,
      [/粮食(?:库存)?[:：]\s*([-\d.]+)/],
      50,
    );
    const hour = this.extractHour(text);
    const isNight =
      hour >= 22 ||
      hour < 6 ||
      /深夜|凌晨/.test(statusSection) ||
      /夜深了/.test(statusSection);
    const exhausted =
      /已经连续\d+天没有睡觉/.test(statusSection) ||
      /健康值会持续下降/.test(statusSection);
    const cheapestFoodPrice = 2;
    const theoryGap = techProduction - techTheory;
    const productionGap = techTheory - techProduction;
    const severeTheoryGap = theoryGap >= 18;
    const severeProductionGap = productionGap >= 18;
    const shouldFrontloadLibrary = this.shouldFrontloadLibrary({
      techTheory,
      techProduction,
      knowledge,
    });

    if (pollution >= 80) {
      return this.makeWorkDecision(
        locations,
        semanticBuildings,
        ["许愿池"],
        "先去许愿池压污染，别让小镇直接崩掉。",
        2,
        { key: agentKey, profile, strictPrimary: true },
      );
    }

    if (health < 30 || exhausted || isNight) {
      return this.stringify({
        action: "SLEEP",
        description: "先回去休息，别把身体硬耗垮。",
      });
    }

    if (fullness < 20) {
      if (points >= cheapestFoodPrice) {
        return this.makeFoodDecision(
          locations,
          nearbyServices,
          "先找吃的，不然撑不到下一步。",
        );
      }
      return this.makeWorkDecision(
        locations,
        semanticBuildings,
        profile.moneyBuildings,
        "先去工作赚点积分，再想办法填肚子。",
        2,
        {
          key: agentKey,
          profile,
          fallbackNames: ["仓库", "工厂", "田地", "实验室", "图书馆"],
          strictPrimary: true,
        },
      );
    }

    if (food < 20) {
      return this.makeWorkDecision(
        locations,
        semanticBuildings,
        ["田地", "工厂"],
        "先补粮食库存，今天不能再让粮仓见底。",
        2,
        {
          key: agentKey,
          profile,
          fallbackNames: ["实验室", "图书馆"],
          strictPrimary: true,
        },
      );
    }

    if (knowledge < this.getKnowledgeWarningThreshold()) {
      return this.makeWorkDecision(
        locations,
        semanticBuildings,
        ["图书馆", "实验室"],
        "先去图书馆把现有知识转成理论和生产，不然科技推进会卡住。",
        2,
        {
          key: agentKey,
          profile,
          fallbackNames: ["工厂", "田地"],
          strictPrimary: true,
        },
      );
    }

    if (pollution >= 60 && this.shouldTakeCleanupShift(profile, pollution)) {
      return this.makeWorkDecision(
        locations,
        semanticBuildings,
        ["许愿池"],
        "先把污染稳住，再谈别的安排。",
        2,
        { key: agentKey, profile, strictPrimary: true },
      );
    }

    if (shouldFrontloadLibrary && profile.theoryScore >= profile.productionScore - 2) {
      return this.makeWorkDecision(
        locations,
        semanticBuildings,
        ["图书馆", "实验室"],
        "前期先把图书馆和实验室跑起来，不然双科技底子一直起不来。",
        2,
        {
          key: agentKey,
          profile,
          fallbackNames: ["工厂", "田地"],
          strictPrimary: true,
        },
      );
    }

    if (points < 5) {
      return this.makeWorkDecision(
        locations,
        semanticBuildings,
        profile.moneyBuildings,
        "先去工作攒积分，别把自己卡死。",
        2,
        {
          key: agentKey,
          profile,
          fallbackNames: ["仓库", "工厂", "田地", "实验室", "图书馆"],
          strictPrimary: true,
        },
      );
    }

    if (fullness < 40 && points >= cheapestFoodPrice) {
      return this.makeFoodDecision(
        locations,
        nearbyServices,
        "先吃点东西稳住状态。",
      );
    }

    if (severeTheoryGap) {
      return this.makeWorkDecision(
        locations,
        semanticBuildings,
        ["实验室", "图书馆"],
        "今天理论明显掉队，先补研究和资料。",
        2,
        {
          key: agentKey,
          profile,
          fallbackNames: ["仓库", "工厂", "田地"],
          strictPrimary: true,
        },
      );
    }

    if (severeProductionGap) {
      return this.makeWorkDecision(
        locations,
        semanticBuildings,
        ["工厂", "仓库", "田地"],
        "今天生产明显掉队，先把理论尽快落到现实里。",
        2,
        {
          key: agentKey,
          profile,
          fallbackNames: ["实验室", "图书馆"],
          strictPrimary: true,
        },
      );
    }

    if (
      nearbyAgentCount > 0 &&
      pollution < 60 &&
      !severeTheoryGap &&
      !severeProductionGap &&
      profile.socialScore >= 2 &&
      this.hashString(`${agentKey}:talk:${hour}`) % 5 === 0
    ) {
      return this.stringify({
        action: "TALK",
        description: "先和身边的人对齐一下情况。",
      });
    }

    const strategicWork = this.buildStrategicWorkOrder({
      profile,
      techTheory,
      techProduction,
      knowledge,
      food,
      pollution,
    });

    return this.makeWorkDecision(
      locations,
      semanticBuildings,
      strategicWork.names,
      strategicWork.description,
      2,
      {
        key: agentKey,
        profile,
        fallbackNames: ["实验室", "工厂", "图书馆", "仓库", "田地"],
        strictPrimary: strategicWork.strictPrimary,
      },
    );
  }

  makeWorkDecision(
    locations,
    semanticBuildings,
    preferredNames,
    description,
    workHours = 2,
    options = {},
  ) {
    let target = null;

    if (options.strictPrimary) {
      const strictOrder = this.composeWorkOrder(
        preferredNames,
        null,
        [],
        `${options.key || "work"}:strict`,
        semanticBuildings,
      );
      target = this.findLocation(locations, strictOrder, options.key);
    }

    if (!target) {
      const orderedNames = this.composeWorkOrder(
        preferredNames,
        options.profile,
        options.fallbackNames,
        options.key,
        semanticBuildings,
      );
      target = this.findLocation(locations, orderedNames, options.key);
    }

    if (!target) {
      const semanticTarget = this.findSemanticLocation(
        semanticBuildings,
        preferredNames,
        options.key,
      );
      if (semanticTarget) target = semanticTarget;
    }

    if (!target) {
      return this.stringify({
        action: "WAIT",
        description: "先观察一下，再决定去哪里行动。",
      });
    }
    return this.stringify({
      action: "WORK",
      description,
      targetBuilding: target.name,
      targetX: target.x,
      targetY: target.y,
      workHours,
    });
  }

  makeFoodDecision(locations, nearbyServices, description) {
    const nearbyFood = this.pickNearbyFood(nearbyServices);
    if (nearbyFood) {
      return this.stringify({
        action: "BUY",
        description,
        serviceName: nearbyFood.serviceName || "",
      });
    }

    const target = this.findLocation(locations, [
      "物资基地",
      "咖啡馆",
      "便利店",
      "餐厅",
      "食堂",
      "田地",
    ]);

    if (!target) {
      return this.stringify({
        action: "WAIT",
        description: "想找吃的，但暂时没看清最近的食物来源。",
      });
    }

    return this.stringify({
      action: "BUY",
      description,
      targetX: target.x,
      targetY: target.y,
      serviceName: nearbyFood?.serviceName || "",
    });
  }

  buildStrategicWorkOrder({
    profile,
    techTheory,
    techProduction,
    knowledge,
    food,
    pollution,
  }) {
    const theoryGap = techProduction - techTheory;
    const productionGap = techTheory - techProduction;
    const shouldFrontloadLibrary = this.shouldFrontloadLibrary({
      techTheory,
      techProduction,
      knowledge,
    });

    if (food <= 30 && profile.foodScore >= profile.theoryScore - 1) {
      return {
        names: ["田地", "工厂"],
        description: "先把粮食和物资稳住，别让今天变成硬撑。",
        strictPrimary: true,
      };
    }

    if (shouldFrontloadLibrary && profile.theoryScore >= profile.productionScore - 2) {
      return {
        names: ["图书馆", "实验室"],
        description: "前期先把图书馆和实验室带起来，双科技底子稳了，后面才不会一直空转。",
        strictPrimary: true,
      };
    }

    if (theoryGap >= 8 && profile.theoryScore >= profile.productionScore) {
      return {
        names: ["实验室", "图书馆"],
        description: "今天先补理论，别让科技路线偏科。",
        strictPrimary: true,
      };
    }

    if (productionGap >= 8 && profile.productionScore >= profile.theoryScore) {
      return {
        names: ["工厂", "田地"],
        description: "今天先补生产，把理论尽快落到现实里。",
        strictPrimary: true,
      };
    }

    if (pollution >= 55 && profile.cleanupScore >= 4) {
      return {
        names: ["许愿池", ...profile.rankedWorkBuildings],
        description: "我这边更适合先盯污染，别让局面突然翻车。",
        strictPrimary: true,
      };
    }

    const leadBuilding = profile.rankedWorkBuildings[0] || "实验室";
    const descriptions = {
      实验室: "先按自己的长项去推理论和研究。",
      图书馆: "前期先把资料和知识线补起来，别让后面的理论和生产失去底子。",
      工厂: "先去补生产线，让成果真正做出来。",
      仓库: "仓库只适合补个人积分，不能给小镇增加任何集体资源。",
      田地: "先把粮食和基础物资续上，大家才能继续撑。",
      许愿池: "先盯住污染，不给小镇继续失血的机会。",
    };

    return {
      names: [leadBuilding],
      description: descriptions[leadBuilding] || "先按分工推进手头最稳妥的事。",
      strictPrimary: true,
    };
  }

  buildDecisionProfile(text) {
    const intro = this.extractDecisionIntro(text);
    const preferredPlaces = this.extractPreferenceList(intro, [
      /喜欢去[:：]\s*([^\n]+)/,
      /偏好地点[:：]\s*([^\n]+)/,
    ]);
    const preferredActivities = this.extractPreferenceList(intro, [
      /喜欢做[:：]\s*([^\n]+)/,
      /偏好活动[:：]\s*([^\n]+)/,
    ]);
    const rulesText = intro
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /^\d+\.\s+/.test(line))
      .join("\n");
    const name = this.extractText(intro, [/你是([^，,\n]+)[，,]/], "");
    const occupation = this.extractText(
      intro,
      [/你是[^，,\n]+，\d+岁，([^。\n]+)/],
      "",
    );
    const key =
      [
        name,
        occupation,
        preferredPlaces.join(","),
        preferredActivities.join(","),
        rulesText,
      ]
        .filter(Boolean)
        .join("|") || intro.slice(0, 120);
    const buildingAffinities = this.buildBuildingAffinities({
      intro,
      rulesText,
      preferredPlaces,
      preferredActivities,
      occupation,
    });
    const rankedWorkBuildings = this.rankBuildingsByAffinity(
      ["实验室", "图书馆", "工厂", "田地"],
      buildingAffinities,
      `${key}:work`,
    );
    const moneyBuildings = this.rankBuildingsByAffinity(
      ["仓库", "工厂", "田地", "实验室", "图书馆"],
      buildingAffinities,
      `${key}:money`,
    );

    return {
      intro,
      rulesText,
      preferredPlaces,
      preferredActivities,
      name,
      occupation,
      key,
      buildingAffinities,
      rankedWorkBuildings,
      moneyBuildings,
      theoryScore:
        (buildingAffinities["实验室"] || 0) + (buildingAffinities["图书馆"] || 0),
      productionScore:
        (buildingAffinities["工厂"] || 0) +
        (buildingAffinities["田地"] || 0),
      foodScore: buildingAffinities["田地"] || 0,
      cleanupScore: buildingAffinities["许愿池"] || 0,
      socialScore: this.countKeywordHits(intro, [
        "主动与人交流",
        "社交",
        "聊天",
        "朋友",
        "开朗",
        "活泼",
      ]),
    };
  }

  buildBuildingAffinities({
    intro,
    rulesText,
    preferredPlaces,
    preferredActivities,
    occupation,
  }) {
    const affinity = {};
    const placeSet = new Set(preferredPlaces);
    const activityText = [
      occupation,
      rulesText,
      preferredActivities.join(" "),
      preferredPlaces.join(" "),
    ]
      .filter(Boolean)
      .join("\n");
    const keywordMap = {
      实验室: ["实验室", "研究", "理论", "科技", "编程", "软件", "学习"],
      图书馆: ["图书馆", "阅读", "读书", "资料", "知识", "安静"],
      工厂: ["工厂", "制造", "生产", "效率", "产品"],
      仓库: ["仓库", "搬运", "货物", "储备", "物资", "后勤"],
      田地: ["田地", "种地", "种植", "粮食", "庄稼", "耕作", "美食"],
      许愿池: ["许愿池", "污染", "净化", "清理", "拯救", "救世"],
    };

    for (const [building, keywords] of Object.entries(keywordMap)) {
      let score = 1;
      if (placeSet.has(building)) score += 5;
      if (rulesText.includes(building)) score += 4;
      if (occupation.includes(building)) score += 3;
      if (intro.includes(building)) score += 1;
      score += this.countKeywordHits(activityText, keywords);
      affinity[building] = score;
    }

    if (placeSet.has("物资基地")) {
      affinity["田地"] += 4;
      affinity["仓库"] += 3;
    }
    if (placeSet.has("实验室")) affinity["图书馆"] += 2;
    if (placeSet.has("图书馆")) affinity["实验室"] += 2;
    if (placeSet.has("工厂")) affinity["仓库"] += 2;
    if (placeSet.has("仓库")) affinity["工厂"] += 2;

    return affinity;
  }

  shouldTakeCleanupShift(profile, pollution) {
    if (pollution >= 70) return true;
    return (
      profile.cleanupScore >= 4 ||
      this.hashString(`${profile.key}:cleanup:${pollution}`) % 2 === 0
    );
  }

  composeWorkOrder(
    primaryNames,
    profile,
    fallbackNames = [],
    key = "",
    semanticBuildings = [],
  ) {
    const allowedBuildings = new Set([
      "实验室",
      "图书馆",
      "工厂",
      "仓库",
      "田地",
      "许愿池",
    ]);
    for (const building of semanticBuildings || []) {
      if (building?.name) allowedBuildings.add(building.name);
    }
    const scores = new Map();
    const addNames = (names, base) => {
      [...new Set((names || []).filter(Boolean))]
        .flatMap((name) => this.expandSemanticNames(name, semanticBuildings))
        .filter((name) => allowedBuildings.has(name))
        .forEach((name, index) => {
          scores.set(name, (scores.get(name) || 0) + base - index * 3);
        });
    };

    addNames(primaryNames, 500);
    addNames(profile?.preferredPlaces || [], 70);
    addNames(profile?.rankedWorkBuildings || [], 30);
    addNames(fallbackNames, 10);

    for (const name of scores.keys()) {
      scores.set(
        name,
        scores.get(name) +
          ((profile?.buildingAffinities?.[name] || 0) * 6) +
          (this.hashString(`${key || profile?.key || "work"}:${name}`) % 7),
      );
    }

    return [...scores.keys()].sort((a, b) => scores.get(b) - scores.get(a));
  }

  expandSemanticNames(name, semanticBuildings = []) {
    const raw = String(name || "").trim();
    if (!raw) return [];
    const intentByLegacyName = {
      许愿池: "pollutionCleanup",
      实验室: "techTheory",
      工厂: "techProduction",
      田地: "foodProduction",
      图书馆: "knowledgeConversion",
      仓库: "personalPoints",
      物资基地: "foodSupply",
    };
    const names = [raw];
    const tagKey = intentByLegacyName[raw] || raw;
    for (const building of semanticBuildings || []) {
      if (building.tags?.includes(tagKey)) names.push(building.name);
    }
    return [...new Set(names)];
  }

  findSemanticLocation(semanticBuildings = [], preferredNames = [], key = "") {
    const expanded = preferredNames.flatMap((name) =>
      this.expandSemanticNames(name, semanticBuildings),
    );
    const preferredSet = new Set(expanded);
    const candidates = (semanticBuildings || []).filter(
      (building) => preferredSet.has(building.name) || expanded.length === 0,
    );
    if (candidates.length === 0) return null;
    return this.pickHashedItem(candidates, key || "semantic-location");
  }

  buildDialogueFallback(text) {
    const name1 =
      this.extractText(text, [/角色1[:：]\s*([^，,\n]+)/], "甲") || "甲";
    const name2 =
      this.extractText(text, [/角色2[:：]\s*([^，,\n]+)/], "乙") || "乙";
    const pollution = this.extractNumber(
      text,
      [/污染[:：]\s*([-\d.]+)\s*\/\s*100/],
      50,
    );
    const food = this.extractNumber(text, [/粮食库存[:：]\s*([-\d.]+)/], 50);
    const knowledge = this.extractNumber(text, [/知识储备[:：]\s*([-\d.]+)/], 50);

    let speaker1;
    let speaker2;

    if (pollution >= 80) {
      speaker1 = `${name2}，先去许愿池压一下污染吧，再拖就真完了。`;
      speaker2 = `行，我忙完这口气就过去，先把命保住。`;
    } else if (food < 20) {
      speaker1 = `${name2}，今天先别空转了，粮食再掉下去大家都得饿。`;
      speaker2 = `我知道，先把吃的补起来，其他事晚点再说。`;
    } else if (knowledge < 20) {
      speaker1 = `${name2}，图书馆那边得补资料了，不然科技线推进不动。`;
      speaker2 = `嗯，我也这么想，先把知识底子垫起来。`;
    } else {
      const variants = [
        [
          `${name2}，你那边进展怎么样？别一个人硬扛。`,
          `还行，先把手头这点做完，有事我会喊你。`,
        ],
        [
          `${name2}，今天状态看着还行，等会儿一起对下分工？`,
          `好啊，别各干各的，省得又白忙一轮。`,
        ],
        [
          `${name2}，先稳一点推进吧，别让节奏乱掉。`,
          `明白，我会盯着局面，有问题马上说。`,
        ],
      ];
      [speaker1, speaker2] = this.pickVariant(
        `${name1}-${name2}-${text}`,
        variants,
      );
    }

    return this.stringify({ speaker1, speaker2 });
  }

  buildDreamFallback(text) {
    const pollution = this.extractNumber(
      text,
      [/污染(?:指数)?[^\d]*([-\d.]+)\s*(?:\/\s*100)?/],
      50,
    );
    const memories = this.extractListItems(text).slice(-3);

    let narrative = "梦里大家还在废墟边奔跑，远处忽明忽暗的灯像下一次机会。";
    if (pollution >= 80) {
      narrative =
        "梦里许愿池像裂开的月亮，不断吞下黑雾，所有人都在和倒计时赛跑。";
    } else if (memories.length > 0) {
      narrative = `梦里反复闪回${memories[0]}，像是在提醒自己别再走回头路。`;
    }

    const insights = [];
    if (pollution >= 80) {
      insights.push("污染必须优先处理");
    }
    if (/粮食|饥饿|饿/.test(text)) {
      insights.push("先稳住食物再谈长远");
    }
    if (/知识|图书馆|理论/.test(text)) {
      insights.push("知识和生产都不能偏科");
    }
    if (insights.length === 0) {
      insights.push("别让今天的焦虑变成明天的惯性");
    }

    return this.stringify({
      narrative: this.truncate(narrative, 80),
      insights: insights.slice(0, 3),
    });
  }

  buildMergeFallback(text) {
    const first = this.extractText(text, [/1\.\s*(.+)/], "") || "";
    const second = this.extractText(text, [/2\.\s*(.+)/], "") || "";
    const merged =
      this.summarizePair(first, second) || "我反复记得同一件事，它还在影响我的判断。";

    return this.stringify({
      content: this.truncate(merged, 60),
      importance: 7,
    });
  }

  buildPatternReflectionFallback(text) {
    const pollution = this.extractNumber(
      text,
      [/污染(?:指数)?[^\d]*([-\d.]+)\s*(?:\/\s*100)?/],
      50,
    );
    if (pollution >= 80) {
      return "我还在重复旧习惯，再不改就会拖着大家一起输掉这轮。";
    }
    if (/饥饿|吃|粮食/.test(text)) {
      return "我总在被眼前生存追着跑，得更早处理食物问题。";
    }
    if (/知识|理论|图书馆/.test(text)) {
      return "我不能只埋头做事，得把零散努力变成真正能积累的进展。";
    }
    return "我今天的做法有点机械了，下一轮得更主动地调整节奏。";
  }

  buildMeetingConsensusFallback(text) {
    const pollution = this.extractNumber(
      text,
      [/污染(?:指数)?[^\d]*([-\d.]+)\s*(?:\/\s*100)?/],
      50,
    );
    const food = this.extractNumber(text, [/粮食(?:库存)?[:：]\s*([-\d.]+)/], 50);
    const knowledge = this.extractNumber(
      text,
      [/知识(?:储备)?[:：]\s*([-\d.]+)/],
      50,
    );

    if (pollution >= 60) {
      return "今天先统一处理污染，谁手上不紧急就先去许愿池，稳住后再分头补资源。";
    }
    if (food < 20) {
      return "今天先补粮食库存，优先安排人去田地和物资线，别让大家饿到失控。";
    }
    if (knowledge < 20) {
      return "今天先去图书馆和实验室，把现有知识尽快转成双科技进展。";
    }
    return "今天按分工推进，但理论和生产都要一起抬，污染一升高就立刻转去净化。";
  }

  buildMeetingMessageFallback(text) {
    const pollution = this.extractNumber(
      text,
      [/污染(?:指数)?[^\d]*([-\d.]+)\s*(?:\/\s*100)?/],
      50,
    );
    const food = this.extractNumber(text, [/粮食(?:库存)?[:：]\s*([-\d.]+)/], 50);
    const knowledge = this.extractNumber(
      text,
      [/知识(?:储备)?[:：]\s*([-\d.]+)/],
      50,
    );

    if (pollution >= 60) {
      return "我先去许愿池压污染，局面稳一点我们再补别的。";
    }
    if (food < 20) {
      return "今天先别空转了，先把粮仓顶住，不然人会先散。";
    }
    if (knowledge < 20) {
      return "我建议先补资料和理论，不然生产再忙也容易瞎忙。";
    }

    const variants = [
      "我先按分工推进，谁那边顶不住就马上喊一声。",
      "今天先稳扎稳打，别各忙各的，信息及时互通。",
      "我这边先开工，有紧急情况随时叫我一起顶上。",
    ];
    return this.pickVariant(text, variants);
  }

  buildMeetingChatFallback(text) {
    const latest = this.extractLatestConversationLine(text);
    if (/污染|许愿池|净化/.test(latest)) {
      return "我赞成先压污染，不然今天所有安排都会被它吃掉。";
    }
    if (/粮食|饿|吃/.test(latest)) {
      return "先把吃的稳住吧，饿着肚子谁也撑不住长线。";
    }
    if (/知识|图书馆|理论/.test(latest)) {
      return "可以，先补知识底子，别让后面科技线空转。";
    }
    if (/散会|结束/.test(latest)) {
      return "那就先这么定，别拖了，今天按这个方向做。";
    }
    const variants = [
      "我这边没问题，先照这个节奏推进。",
      "行，先把最急的顶住，别又聊着聊着散掉了。",
      "我认同，先定优先级，比各忙各的强。",
    ];
    return this.pickVariant(`${text}-meeting-chat`, variants);
  }

  buildPrivateChatFallback(text) {
    const latest = this.extractLatestConversationLine(text);
    if (/污染|许愿池|净化/.test(latest)) {
      return "我记住了，我会优先去压污染。";
    }
    if (/吃|饿|粮食|物资/.test(latest)) {
      return "行，我会先顾好吃的，不然真撑不住。";
    }
    if (/睡|休息|别太拼/.test(latest)) {
      return "你说得对，我会先缓一下再继续。";
    }
    if (/图书馆|知识|理论/.test(latest)) {
      return "这个建议有用，我会先去把知识转成更实在的科技进展。";
    }
    if (/工厂|生产|实验室/.test(latest)) {
      return "我会参考这个方向，下一步就去试。";
    }
    if (/不要|别/.test(latest)) {
      return "好，我先停一停，换个更稳的办法。";
    }
    const variants = [
      "我记住了，这轮我会按你说的试试。",
      "行，我会把这句话带进接下来的判断里。",
      "收到，我会参考这个方向，不再瞎折腾。",
    ];
    return this.pickVariant(`${text}-private-chat`, variants);
  }

  buildCycleGuidanceFallback(text) {
    const pollution = this.extractNumber(
      text,
      [/污染[^\d]*([-\d.]+)\s*(?:\/\s*100)?/],
      50,
    );
    const techTheory = this.extractNumber(
      text,
      [/科技理论[^\d]*([-\d.]+)/, /理论值[:：]\s*([-\d.]+)/],
      0,
    );
    const techProduction = this.extractNumber(
      text,
      [/科技生产[^\d]*([-\d.]+)/, /生产值[:：]\s*([-\d.]+)/],
      0,
    );
    const food = this.extractNumber(text, [/粮食(?:库存)?[:：]\s*([-\d.]+)/], 50);

    if (pollution >= 90) {
      return "先全员压污染，别拖着工作做到世界先毁掉。";
    }
    if (food < 20) {
      return "别急着卷科技，先把田地和粮食库存稳住。";
    }
    if (techTheory < 50 || techProduction < 50) {
      return "理论和生产要一起冲高，偏一边都到不了终局。";
    }
    return "污染一高就立刻净化，其他人同时补粮和知识。";
  }

  buildDailyPlanFallback(text) {
    const pollution = this.extractNumber(
      text,
      [/污染(?:指数)?[^\d]*([-\d.]+)\s*(?:\/\s*100)?/],
      50,
    );
    const food = this.extractNumber(text, [/粮食(?:库存)?[:：]\s*([-\d.]+)/], 50);
    const knowledge = this.extractNumber(
      text,
      [/知识(?:储备)?[:：]\s*([-\d.]+)/],
      50,
    );

    let plan;
    if (pollution >= 60) {
      plan = [
        { time: "上午", activity: "先去许愿池处理污染" },
        { time: "下午", activity: "补最紧缺的资源缺口" },
        { time: "晚上", activity: "整理情况后回宿舍休息" },
      ];
    } else if (food < 20) {
      plan = [
        { time: "上午", activity: "优先去田地或物资线补粮" },
        { time: "下午", activity: "继续工作并关注同伴状态" },
        { time: "晚上", activity: "确认库存后回去休息" },
      ];
    } else if (knowledge < 20) {
      plan = [
        { time: "上午", activity: "先去图书馆整理资料并转化成科技进展" },
        { time: "下午", activity: "再把理论和生产线接起来" },
        { time: "晚上", activity: "复盘今天收获后休息" },
      ];
    } else {
      plan = [
        { time: "上午", activity: "处理今天最紧急的任务" },
        { time: "下午", activity: "按分工推进资源或科技" },
        { time: "晚上", activity: "检查局势并回宿舍休息" },
      ];
    }
    return JSON.stringify(plan, null, 0);
  }

  buildGenericFallback(text, reason = "") {
    if (/JSON/.test(text)) {
      return this.stringify({
        action: "WAIT",
        description: "先稳一下，等局势更清楚再行动。",
      });
    }
    if (/晨会|讨论/.test(text)) {
      return "先把最急的事顶住，别空转。";
    }
    if (/玩家|回应/.test(text)) {
      return "我记住了，我会试着按这个方向做。";
    }
    if (reason) {
      return "先按眼前最紧急的事做，别让节奏断掉。";
    }
    return "我先继续观察，再决定下一步。";
  }

  buildSafeDefault(type) {
    switch (type) {
      case "dialogue":
        return this.stringify({
          speaker1: "先稳住局面吧。",
          speaker2: "好，别让事情继续变糟。",
        });
      case "dream":
        return this.stringify({
          narrative: "梦里仍在寻找一条能让大家活下去的路。",
          insights: ["先处理最紧急的问题"],
        });
      case "merge":
        return this.stringify({
          content: "这件事我已经反复记住了。",
          importance: 7,
        });
      case "meetingConsensus":
        return "今天先处理最紧急的问题，污染升高就统一转去净化。";
      case "meetingMessage":
      case "meetingChat":
      case "privateChat":
      case "cycleGuidance":
        return "先把最急的事顶住。";
      case "dailyPlan":
        return JSON.stringify([
          { time: "上午", activity: "处理紧急问题" },
          { time: "下午", activity: "推进主要工作" },
          { time: "晚上", activity: "休息并复盘" },
        ]);
      case "decision":
      default:
        return this.stringify({
          action: "WAIT",
          description: "先观察一下局面。",
        });
    }
  }

  parseLocations(text) {
    const map = new Map();
    const regex = /([^\s,，:\n]+)\((\d+)\s*,\s*(\d+)\)/g;
    let match;

    while ((match = regex.exec(text))) {
      const name = match[1]?.trim();
      const x = Number(match[2]);
      const y = Number(match[3]);
      if (!name || !Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (!map.has(name)) map.set(name, []);
      map.get(name).push({ name, x, y });
    }

    return map;
  }

  parseBuildingSemantics(text) {
    const section = this.extractSection(text, "## 建筑认知:", "## 附近服务:");
    const results = [];
    const lineRegex = /-\s*([^(\n|]+)\((\d+)\s*,\s*(\d+)\)\s*\|([^\n]+)/g;
    let match;

    while ((match = lineRegex.exec(section))) {
      const name = match[1]?.trim();
      const x = Number(match[2]);
      const y = Number(match[3]);
      const rest = match[4] || "";
      if (!name || !Number.isFinite(x) || !Number.isFinite(y)) continue;

      const tagText =
        this.extractText(rest, [/标签[:：]\s*([^|]+)/], "") || "";
      const tags = tagText
        .split(/[、,，]/)
        .map((label) => label.trim())
        .map((label) => getTagKeyByLabel(label))
        .filter(Boolean);
      const purpose =
        this.extractText(rest, [/用途[:：]\s*([^|]+)/], "") || "";
      const description =
        this.extractText(rest, [/认知[:：]\s*([^|]+)/], "") || "";
      const serviceText =
        this.extractText(rest, [/服务[:：]\s*([^|]+)/], "") || "";

      results.push({
        name,
        x,
        y,
        tags,
        purpose,
        description,
        serviceText,
      });
    }

    return results;
  }

  findLocation(locationMap, names, key = "") {
    for (const name of names) {
      const locations = locationMap.get(name);
      if (locations?.length) {
        return this.pickHashedItem(locations, `${key}:${name}`);
      }
    }

    const allLocations = [...locationMap.values()].flat();
    if (allLocations.length > 0) {
      return this.pickHashedItem(allLocations, key || "fallback-location");
    }

    return null;
  }

  parseNearbyServices(text) {
    const results = [];
    const regex = /-\s*([^:\n]+):\s*([^\n]+)/g;
    let match;

    while ((match = regex.exec(text))) {
      const areaName = match[1]?.trim();
      const serviceText = match[2] || "";
      if (!areaName) continue;

      const services = [];
      const serviceRegex = /([^,(，]+)\([^)]*\)/g;
      let serviceMatch;
      while ((serviceMatch = serviceRegex.exec(serviceText))) {
        const serviceName = serviceMatch[1]?.trim();
        if (serviceName) services.push(serviceName);
      }

      if (services.length > 0) {
        results.push({ areaName, services });
      }
    }

    return results;
  }

  pickNearbyFood(nearbyServices) {
    const preferredAreas = new Set([
      "物资基地",
      "咖啡馆",
      "便利店",
      "餐厅",
      "食堂",
      "田地",
    ]);

    for (const area of nearbyServices) {
      if (preferredAreas.has(area.areaName) && area.services.length > 0) {
        return {
          areaName: area.areaName,
          serviceName: area.services[0],
        };
      }
    }

    for (const area of nearbyServices) {
      if (area.services.length > 0) {
        return {
          areaName: area.areaName,
          serviceName: area.services[0],
        };
      }
    }

    return null;
  }

  extractLatestConversationLine(text) {
    const lines = String(text || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => line.includes(":") || line.includes("："));

    if (lines.length === 0) return "";
    const latest = lines[lines.length - 1];
    const parts = latest.split(/[:：]/);
    return parts.slice(1).join(":").trim() || latest.trim();
  }

  extractSection(text, startMarker, endMarker = "") {
    const source = String(text || "");
    const startIndex = source.indexOf(startMarker);
    if (startIndex === -1) return "";

    const from = source.slice(startIndex + startMarker.length);
    if (!endMarker) return from;

    const endIndex = from.indexOf(endMarker);
    return endIndex === -1 ? from : from.slice(0, endIndex);
  }

  extractDecisionIntro(text) {
    const source = String(text || "");
    const markers = ["## 记忆:", "## 状态:"];
    let endIndex = source.length;

    for (const marker of markers) {
      const index = source.indexOf(marker);
      if (index !== -1) {
        endIndex = Math.min(endIndex, index);
      }
    }

    return source.slice(0, endIndex).trim();
  }

  extractPreferenceList(text, patterns) {
    const raw = this.extractText(text, patterns, "");
    if (!raw) return [];

    return raw
      .split(/[，,、]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .filter(
        (item) =>
          !["无", "无特殊偏好", "无特别偏好", "各种活动", "各处"].includes(item),
      );
  }

  extractNearbyAgentCount(text) {
    const explicit = this.extractNumber(text, [/附近有(\d+)人/], NaN);
    if (Number.isFinite(explicit)) return explicit;
    if (/周围没有人/.test(text)) return 0;
    return 0;
  }

  extractListItems(text) {
    return String(text || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /^\d+\.\s+/.test(line) || /^-\s+/.test(line))
      .map((line) => line.replace(/^(\d+\.\s+|-\s+)/, "").trim());
  }

  summarizePair(first, second) {
    const a = this.normalizeSentence(first);
    const b = this.normalizeSentence(second);
    if (!a && !b) return "";
    if (!a) return b;
    if (!b) return a;
    if (a === b) return a;
    if (a.includes(b)) return a;
    if (b.includes(a)) return b;

    const commonKeywords = [
      "污染",
      "许愿池",
      "图书馆",
      "实验室",
      "工厂",
      "仓库",
      "田地",
      "物资基地",
      "粮食",
      "知识",
      "理论",
      "生产",
      "睡觉",
      "饥饿",
      "玩家",
    ].filter((keyword) => a.includes(keyword) && b.includes(keyword));

    if (commonKeywords.length > 0) {
      return `我反复记得和${commonKeywords[0]}有关的事：${this.truncate(a, 22)}；${this.truncate(b, 22)}`;
    }

    return `我把两件事连在一起记住了：${this.truncate(a, 22)}；${this.truncate(b, 22)}`;
  }

  normalizeSentence(text) {
    return String(text || "")
      .replace(/\s+/g, " ")
      .replace(/^["']|["']$/g, "")
      .trim();
  }

  rankBuildingsByAffinity(names, affinityMap, key = "") {
    return [...new Set((names || []).filter(Boolean))].sort((a, b) => {
      const scoreA = (affinityMap?.[a] || 0) * 10 + (this.hashString(`${key}:${a}`) % 7);
      const scoreB = (affinityMap?.[b] || 0) * 10 + (this.hashString(`${key}:${b}`) % 7);
      return scoreB - scoreA;
    });
  }

  countKeywordHits(text, keywords) {
    const source = String(text || "");
    return (keywords || []).reduce(
      (count, keyword) => (source.includes(keyword) ? count + 1 : count),
      0,
    );
  }

  pickHashedItem(items, key = "") {
    if (!Array.isArray(items) || items.length === 0) return null;
    return items[this.hashString(key || "pick") % items.length];
  }

  extractHour(text) {
    const explicitHour = text.match(/现在(\d{1,2})点/);
    if (explicitHour) return Number(explicitHour[1]);

    const timeMatches = [...String(text || "").matchAll(/(\d{1,2}):(\d{2})/g)];
    if (timeMatches.length > 0) {
      return Number(timeMatches[timeMatches.length - 1][1]);
    }

    if (/凌晨/.test(text)) return 3;
    if (/深夜/.test(text)) return 23;
    if (/晚间/.test(text)) return 20;
    if (/早晨/.test(text)) return 8;
    return 12;
  }

  extractNumber(text, patterns, fallback = 0) {
    const safePatterns = Array.isArray(patterns) ? patterns : [patterns];
    for (const pattern of safePatterns) {
      if (!(pattern instanceof RegExp)) continue;
      const match = String(text || "").match(pattern);
      if (!match) continue;
      const value = Number(match[1]);
      if (Number.isFinite(value)) return value;
    }
    return fallback;
  }

  extractText(text, patterns, fallback = "") {
    const safePatterns = Array.isArray(patterns) ? patterns : [patterns];
    for (const pattern of safePatterns) {
      if (!(pattern instanceof RegExp)) continue;
      const match = String(text || "").match(pattern);
      if (!match) continue;
      const value = String(match[1] || "").trim();
      if (value) return value;
    }
    return fallback;
  }

  truncate(text, maxLength = 50) {
    const normalized = String(text || "").trim();
    if (normalized.length <= maxLength) return normalized;
    return `${normalized.slice(0, Math.max(0, maxLength - 1))}…`;
  }

  stringify(value) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return JSON.stringify({
        ...value,
        isFallback: value.isFallback ?? true,
      });
    }
    return JSON.stringify(value);
  }

  hashString(text) {
    let hash = 0;
    const source = String(text || "");
    for (let i = 0; i < source.length; i++) {
      hash = (hash * 31 + source.charCodeAt(i)) >>> 0;
    }
    return hash;
  }

  pickVariant(key, options) {
    if (!Array.isArray(options) || options.length === 0) return "";
    return options[this.hashString(key) % options.length];
  }

  /**
   * Get an embedding for a piece of text.
   */
  async getEmbedding(text) {
    try {
      return await this.retry(async () => {
        const response = await fetch(`${this.baseUrl}/embedding`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });

        if (!response.ok) {
          throw new Error(`Embedding request failed: ${response.status}`);
        }

        const data = await response.json();
        return data.embedding;
      }, 5);
    } catch (error) {
      console.warn(
        "Embedding API unavailable after retries, using random fallback vector",
        error,
      );
      return this.generateRandomEmbedding();
    }
  }

  /**
   * Generate a random normalized embedding vector as fallback.
   */
  generateRandomEmbedding() {
    const vec = [];
    for (let i = 0; i < 1536; i++) {
      vec.push((Math.random() - 0.5) * 2);
    }
    const magnitude = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
    return vec.map((v) => v / magnitude);
  }

  /**
   * Cosine similarity helper.
   */
  cosineSimilarity(a, b) {
    if (!a || !b || !Array.isArray(a) || !Array.isArray(b)) {
      return 0.5;
    }

    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      magnitudeA += a[i] * a[i];
      magnitudeB += b[i] * b[i];
    }

    if (magnitudeA === 0 || magnitudeB === 0) return 0;

    return dotProduct / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
  }
}

export default LLMClient;
