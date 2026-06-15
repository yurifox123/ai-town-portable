/**
 * Agent类（前端版本）
 * 能够自主感知、记忆、规划和行动的AI代理
 */
import MemorySystem from "./memory.js";
import PathFinder from "./pathfinder.js";
import GAME_CONFIG from "./game-config.js";
import {
  normalizeTemplate,
  buildSystemPrompt,
  buildDecisionPrompt,
  buildPlanPrompt,
  buildMeetingPrompt,
} from "./personality.js";
import {
  describeService,
  getAreaBuildingSummary,
  getBestServiceForIntent,
  getAreaTags,
  getAreaBuilding,
  isWorkableArea,
  normalizeAreaSemantics,
  serviceHasTag,
  serviceMatchesIntent,
} from "./building-semantics.js";

class Agent {
  constructor(config, llmClient) {
    this.id = config.id;
    this.name = config.name;
    this.config = { ...config };
    delete this.config.cycleGuidance;
    this.memory = new MemorySystem(config.id, llmClient);
    this.llm = llmClient;
    this.cycleGuidance = config.cycleGuidance || null;

    // 状态
    this.position = { x: 0, y: 0 };
    // 移动相关
    this.moveTarget = null;
    this.currentPath = []; // A*计算出的路径
    this.currentPathIndex = 0; // 当前走到路径的哪一步
    this.movesSinceLastDecision = 0;
    this.facingDirection = "down";
    this.decisionInterval = GAME_CONFIG.movement.decisionInterval;
    this.moveInterval = null; // 移动定时器
    this.moveSpeed = GAME_CONFIG.movement.moveSpeed;

    this.currentPlan = null;
    this.currentAction = null;
    this.observations = [];
    this.status = "idle";
    this.workTarget = null; // 工作承诺：到达前不改变目标
    this.workEndTime = null; // 工作结束时间戳
    this._workStartTime = null; // 工作开始时间（gameTime）
    this.cleanupOverrideUntil = null;
    this.cleanupRetargetAt = null;
    this.lastFeedback = null; // 上次行动反馈
    this.playerGuidance = config.playerGuidance || "";
    this.customPrompt = config.customPrompt || config.custom_prompt || "";
    this.config.customPrompt = this.customPrompt;
    this.conversationLockUntil = null;
    this.nextDecisionAt = config.nextDecisionAt
      ? new Date(config.nextDecisionAt)
      : null;

    // 社交状态
    this.nearbyAgents = new Set();
    this.lastConversation = new Map();

    // 生存属性
    const maxHealth = config.healthMax ?? GAME_CONFIG.survival.healthMax ?? 100;
    this.health = {
      current: maxHealth,
      max: maxHealth,
    };
    this.greenPoints = config.greenPoints ?? GAME_CONFIG.initialGreenPoints;
    this.fullness = config.fullness ?? GAME_CONFIG.initialFullness;
    this.lastSurvivalUpdate = Date.now(); // 上次更新生存属性的时间戳

    // 睡眠追踪（按游戏内清醒时长累计，避免受现实时间影响）
    this.awakeHoursSinceSleep = 0;
    this.consecutiveNoSleepDays = 0; // 连续不睡觉天数

    // 背包系统
    this.backpack = []; // [{name, quantity, fullness, health}]
    this.decisionHistory = Array.isArray(config.decisionHistory)
      ? config.decisionHistory.slice(-10)
      : [];

    // 记忆类型
    this.MemoryType = {
      OBSERVATION: "OBSERVATION",
      THOUGHT: "THOUGHT",
      ACTION: "ACTION",
      REFLECTION: "REFLECTION",
      DIALOGUE: "DIALOGUE",
    };

    // 行动类型
    this.ActionType = {
      MOVE: "MOVE",
      INTERACT: "INTERACT",
      TALK: "TALK",
      WAIT: "WAIT",
      SLEEP: "SLEEP",
      WORK: "WORK",
      BUY: "BUY",
    };

    // 人格数据（从 normalizeTemplate 后的 config 提取）
    this.personality = config.personality;
    this.rules = config.rules;
    this.preferences = config.preferences;
    this.routine = config.routine;
    this.occupation = config.occupation;
    this.customPrompt = config.customPrompt || config.custom_prompt || "";
    this.config.customPrompt = this.customPrompt;

    // 世界引用（用于地形碰撞检测）
    this.world = null;
  }

  /**
   * 初始化Agent
   */
  async initialize() {
    const cfg = this.config;

    await this.memory.addMemory(
      `我是${this.name}，${cfg.age}岁，${cfg.occupation}。${cfg.background}`,
      this.MemoryType.THOUGHT,
      10,
    );

    await this.memory.addMemory(
      `我的性格：${cfg.traits}。行动倾向：${cfg.rules.join("；")}`,
      this.MemoryType.THOUGHT,
      9,
    );

    if (cfg.customPrompt) {
      await this.memory.addMemory(
        `我的角色认知与目的：${cfg.customPrompt}`,
        this.MemoryType.THOUGHT,
        10,
      );
    }

    for (const goal of cfg.goals) {
      await this.memory.addMemory(
        `我的目标：${goal}`,
        this.MemoryType.THOUGHT,
        8,
      );
    }

    // 创建今日计划
    await this.createDailyPlan();
  }

  /**
   * 感知环境
   */
  async perceive(observations) {
    for (const obs of observations) {
      this.observations.push(obs);

      let importance = 5;
      if (obs.type === "agent") importance = 3;
      if (obs.type === "area" || obs.type === "time") importance = 2;
      if (obs.type === "event") importance = 8;
      if (obs.importance !== undefined) {
        importance = obs.importance;
      }

      const metadata = {
        position: obs.position,
        type: obs.type,
        lowSignal: Boolean(obs.lowSignal),
      };
      if (obs.targetId) metadata.targetId = obs.targetId;
      if (obs.distance !== undefined) metadata.distance = obs.distance;
      if (obs.signalCategory) metadata.signalCategory = obs.signalCategory;

      await this.memory.addMemory(
        `观察到: ${obs.description}`,
        this.MemoryType.OBSERVATION,
        importance,
        metadata,
      );
    }
  }

  /**
   * 决策下一步行动
   */
  async decide(worldState) {
    // 获取相关记忆
    const contextQuery = `当前情况: 我在(${this.position.x}, ${this.position.y})，${this.getTimeContext(worldState.time)}`;
    const relevantMemories = await this.memory.retrieveMemories(
      contextQuery,
      10,
    );

    // 获取世界中的地点和服务信息（从区域数据读取）
    const locations = [];
    const workLocations = [];
    const foodLocations = [];
    const buildingSummaries = [];
    const areas = worldState.getAreas ? worldState.getAreas() : [];

    // 辅助：从区域中随机选一个可通行的格子
    const pickRandomAreaCell = (targetX, targetY) => {
      for (const area of areas) {
        if (area.isBlocked || !area.cells || area.cells.length === 0) continue;
        const inArea = area.cells.some(
          (c) => c.x === targetX && c.y === targetY,
        );
        if (inArea) {
          const passable = area.cells.filter((c) =>
            this.world ? this.world.isPassable(c.x, c.y) : true,
          );
          if (passable.length > 0) {
            return passable[Math.floor(Math.random() * passable.length)];
          }
        }
      }
      return null;
    };
    const findAreaAt = (x, y) => {
      for (const area of areas) {
        if (area.isBlocked || !area.cells || area.cells.length === 0) continue;
        if (area.cells.some((c) => c.x === x && c.y === y)) return area;
      }
      return null;
    };
    for (const area of areas) {
      normalizeAreaSemantics(area);
      if (area.isBlocked || !area.cells || area.cells.length === 0) continue;
      // 计算区域中心位置
      let sumX = 0,
        sumY = 0;
      for (const c of area.cells) {
        sumX += c.x;
        sumY += c.y;
      }
      const cx = Math.round(sumX / area.cells.length);
      const cy = Math.round(sumY / area.cells.length);
      locations.push(`${area.name}(${cx},${cy})`);
      const summary = getAreaBuildingSummary(area);
      if (summary) buildingSummaries.push(summary);

      // 分类地点
      if (area.services) {
        const hasWork = isWorkableArea(area);
        const hasFood = area.services.some((s) =>
          serviceMatchesIntent(s, "food"),
        );
        if (hasWork) workLocations.push(`${area.name}(${cx},${cy})`);
        if (hasFood) foodLocations.push(`${area.name}(${cx},${cy})`);
      }
    }

    // 构建决策提示
    const memoryContext = relevantMemories
      .map((r) => r.memory.content)
      .join("\n");
    const cycleGuidance = this.cycleGuidance || "";
    const playerGuidance = this.playerGuidance || "";

    // 生存属性上下文
    const d = GAME_CONFIG.decision;
    let survivalContext = "";
    if (this.health.current < d.healthCritical) {
      survivalContext += `【紧急】健康值极低(${this.health.current}/${this.health.max})，你需要立即休息恢复！\n`;
    } else if (this.health.current < d.healthWarning) {
      survivalContext += `【警告】健康值较低(${this.health.current}/${this.health.max})，建议休息。\n`;
    }

    // 判断食物价格（最便宜的食物）
    const cheapestFoodPrice = GAME_CONFIG.survival.cheapestFoodPrice;
    const canAffordFood = this.greenPoints >= cheapestFoodPrice;

    if (this.fullness < d.fullnessCritical) {
      if (canAffordFood) {
        survivalContext += `【紧急】极度饥饿(${this.fullness}/100)，你必须立即寻找食物！优先前往咖啡馆或便利店。\n`;
      } else {
        survivalContext += `【紧急】极度饥饿(${this.fullness}/100)且没有钱(只有${this.greenPoints}积分)，你必须先去咖啡馆或便利店工作赚钱，然后再买食物！\n`;
      }
    } else if (this.fullness < d.fullnessWarning) {
      if (canAffordFood) {
        survivalContext += `【警告】很饿(${this.fullness}/100)，建议找点东西吃。\n`;
      } else {
        survivalContext += `【警告】很饿(${this.fullness}/100)但没有钱买食物(只有${this.greenPoints}积分)，你需要先去工作赚钱。可工作地点: ${workLocations.join(", ") || "咖啡馆、便利店"}\n`;
      }
    }

    if (this.greenPoints < 0) {
      survivalContext += `【警告】积分为负(${this.greenPoints})，急需工作赚钱！可工作地点: ${workLocations.join(", ") || "咖啡馆、便利店"}\n`;
    } else if (this.greenPoints < cheapestFoodPrice) {
      survivalContext += `【警告】积分太少(${this.greenPoints})，连最便宜的食物都买不起，必须先去工作赚钱！可工作地点: ${workLocations.join(", ") || "咖啡馆、便利店"}\n`;
    } else if (this.greenPoints < d.greenPointsLow) {
      survivalContext += `【提示】积分较少(${this.greenPoints})，可能需要工作。\n`;
    }

    // 时间提示
    const hour = worldState.time.getHours();
    const t = GAME_CONFIG.time;
    const isNight = hour >= t.nightStart || hour < t.nightEnd;
    if (isNight) {
      survivalContext += `【深夜】现在${hour}点，夜深了，你应该回家睡觉休息！在家睡觉可以恢复健康。\n`;
    } else if (hour >= t.eveningStart) {
      survivalContext += `【晚间】现在${hour}点，天色已晚，如果累了可以准备回家休息。\n`;
    }

    // 不睡觉惩罚警告
    if (this.consecutiveNoSleepDays >= d.noSleepWarningDays) {
      survivalContext += `【严重警告】你已经连续${this.consecutiveNoSleepDays}天没有睡觉了！不睡觉会严重损害健康：1天-10健康，2天-50健康，3天健康归零！你必须立即去睡觉！\n`;
    } else if (this.consecutiveNoSleepDays >= 1) {
      survivalContext += `【警告】你已经${this.consecutiveNoSleepDays}天没有睡觉了，健康值会持续下降。请尽快回家休息。\n`;
    }

    // 污染警告（高优先级）
    const pollution = worldState.pollution ?? GAME_CONFIG.initialPollution;
    if (pollution >= GAME_CONFIG.pollution.gameOverThreshold) {
      survivalContext += `【致命】污染已达${pollution}/100，小镇即将毁灭！所有人必须立刻去带“污染净化”效果的建筑清理污染！这是最紧急的任务！\n`;
    } else if (pollution >= GAME_CONFIG.pollution.warningCritical) {
      survivalContext += `【危急】污染高达${pollution}/100，小镇濒临毁灭！请立即前往污染净化建筑清理污染，优先参考建筑认知里的具体净化数值。\n`;
    } else if (pollution >= GAME_CONFIG.pollution.warningHigh) {
      survivalContext += `【警告】污染${pollution}/100，小镇环境恶化！请考虑去污染净化建筑清理污染。\n`;
    } else if (
      pollution > GAME_CONFIG.pollution.goodEndingThreshold &&
      pollution <= GAME_CONFIG.pollution.finishCleanupThreshold
    ) {
      survivalContext += `【收尾】污染只剩${pollution}/100，我们加加油。去污染净化建筑继续净化，就可能直接结束危机，别在最后一点时分散去做次要事务。\n`;
    }

    // 附近建筑提示
    let nearbyBuildings = "";
    let canBuyFood = false;
    for (const area of areas) {
      if (
        area.isBlocked ||
        !area.cells ||
        area.cells.length === 0 ||
        !area.services
      )
        continue;
      let sumX = 0,
        sumY = 0;
      for (const c of area.cells) {
        sumX += c.x;
        sumY += c.y;
      }
      const cx = Math.round(sumX / area.cells.length);
      const cy = Math.round(sumY / area.cells.length);
      const distance =
        Math.abs(cx - this.position.x) + Math.abs(cy - this.position.y);
      if (
        distance <= GAME_CONFIG.movement.observationRange &&
        area.services.length > 0
      ) {
        const foodServices = area.services.filter((s) =>
          serviceMatchesIntent(s, "food"),
        );
        const services = area.services
          .map((s) => `${describeService(s)}(${s.cost || 0}积分)`)
          .join(", ");
        nearbyBuildings += `- ${area.name}: ${services}\n`;
        if (foodServices.length > 0) {
          canBuyFood = true;
        }
      }
    }

    const agentStatsContext = worldState.agents
      ? Array.from(worldState.agents.values())
          .map((agentState) => {
            const actionDesc =
              agentState.currentAction?.description ||
              agentState.currentAction?.type ||
              "无";
            const healthCurrent =
              agentState.health?.current ?? agentState.health ?? "?";
            const healthMax = agentState.health?.max ?? 100;
            return `${agentState.name}: 状态=${agentState.status}, 位置=(${agentState.position?.x ?? "?"},${agentState.position?.y ?? "?"}), 健康=${Math.round(healthCurrent)}/${healthMax}, 饱腹=${Math.round(agentState.fullness ?? 0)}/100, 积分=${Math.round(agentState.greenPoints ?? 0)}, 当前行动=${actionDesc}`;
          })
          .join("\n")
      : "";

    const decisionPrompt = buildDecisionPrompt(this, {
      memoryContext,
      cycleGuidance,
      playerGuidance,
      survivalContext,
      worldState,
      nearbyAgentsDesc: this.getNearbyDescription(),
      locations,
      buildingSummaries,
      nearbyBuildings,
      canBuyFood,
      isNight,
      agentStatsContext,
    });

    try {
      console.log(`[${this.name}] 正在请求LLM决策...`);
      const response = await this.llm.chat([
        { role: "system", content: buildSystemPrompt(this) },
        { role: "user", content: decisionPrompt },
      ], {
        timeout: GAME_CONFIG.llm?.requestTimeoutMs ?? 10000,
        overallTimeout: GAME_CONFIG.llm?.decisionTimeoutMs ?? 12000,
        maxRetries: 5,
      });
      console.log(`[${this.name}] LLM响应:`, response);

      // 解析JSON响应
      let decision;
      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          decision = JSON.parse(jsonMatch[0]);
        } else {
          decision = JSON.parse(response);
        }
        console.log(`[${this.name}] 解析的决策:`, decision);
      } catch (e) {
        // 如果解析失败，使用默认行为
        console.warn(`[${this.name}] 解析决策失败，使用默认:`, response);
        decision = { action: "WAIT", description: response.trim() };
      }

      // 根据决策类型构建行动
      let actionType = decision.action?.toUpperCase() || "WAIT";

      if (
        actionType === "MOVE" &&
        decision.targetX !== undefined &&
        decision.targetY !== undefined
      ) {
        // 随机选区域内的一个格子，避免所有 agent 挤在同一个目标点
        const areaCell = pickRandomAreaCell(decision.targetX, decision.targetY);
        const target = areaCell || { x: decision.targetX, y: decision.targetY };
        return {
          type: this.ActionType.MOVE,
          description:
            decision.description || `移动到(${target.x}, ${target.y})`,
          targetPosition: target,
          timestamp: new Date(),
        };
      } else if (actionType === "TALK") {
        return {
          type: this.ActionType.TALK,
          description: decision.description || "与人交谈",
          timestamp: new Date(),
        };
      } else if (actionType === "SLEEP") {
        return {
          type: this.ActionType.SLEEP,
          description: decision.description || "休息",
          timestamp: new Date(),
        };
      } else if (actionType === "WORK") {
        const workBuildingNames = ["实验室", "工厂", "仓库", "田地", "图书馆"];
        const cleanupBuildings = ["许愿池"];
        // 从位置找建筑的辅助函数
        const findAreaAt = (x, y) => {
          for (const area of areas) {
            if (area.isBlocked || !area.cells || area.cells.length === 0)
              continue;
            if (area.cells.some((c) => c.x === x && c.y === y)) return area;
          }
          return null;
        };

        const currentArea = worldState.getAreaNameAt
          ? worldState.getAreaNameAt(this.position.x, this.position.y)
          : null;
        const currentAreaObject = findAreaAt(this.position.x, this.position.y);
        const currentWorkService = currentAreaObject
          ? getBestServiceForIntent(currentAreaObject, "work")
          : null;
        // 判断是否为清理类建筑（无收入）
        const isCleanup =
          currentAreaObject &&
          (getAreaTags(currentAreaObject).includes("pollutionCleanup") ||
            cleanupBuildings.includes(currentArea) ||
            (currentWorkService?.pollutionEffect || 0) < 0);
        const effectiveHourlyRate = isCleanup
          ? 0
          : decision.hourlyRate ??
            currentWorkService?.income ??
            GAME_CONFIG.decision.defaultHourlyRate;

        const cleanupMentionedInDescription =
          typeof decision.description === "string" &&
          (cleanupBuildings.some((name) => decision.description.includes(name)) ||
            /净化|污染/.test(decision.description));
        const findNearestWorkArea = (candidateNames, intent = "work") => {
          let bestArea = null;
          let bestDist = Infinity;
          for (const area of areas) {
            normalizeAreaSemantics(area);
            if (area.isBlocked || !area.cells || area.cells.length === 0) continue;
            const matchesName =
              !candidateNames?.length || candidateNames.includes(area.name);
            const matchesIntent =
              intent === "work"
                ? isWorkableArea(area)
                : Boolean(getBestServiceForIntent(area, intent));
            if (!matchesName && !matchesIntent) continue;
            let sumX = 0,
              sumY = 0;
            for (const c of area.cells) {
              sumX += c.x;
              sumY += c.y;
            }
            const cx = Math.round(sumX / area.cells.length);
            const cy = Math.round(sumY / area.cells.length);
            const dist =
              Math.abs(cx - this.position.x) + Math.abs(cy - this.position.y);
            if (dist < bestDist) {
              bestDist = dist;
              bestArea = area;
            }
          }
          return bestArea;
        };
        const findNamedWorkArea = (candidateName) => {
          if (!candidateName) return null;
          let bestArea = null;
          let bestDist = Infinity;
          for (const area of areas) {
            normalizeAreaSemantics(area);
            if (area.isBlocked || !area.cells || area.cells.length === 0) continue;
            if (area.name !== candidateName) continue;
            if (!isWorkableArea(area)) continue;
            let sumX = 0;
            let sumY = 0;
            for (const c of area.cells) {
              sumX += c.x;
              sumY += c.y;
            }
            const cx = Math.round(sumX / area.cells.length);
            const cy = Math.round(sumY / area.cells.length);
            const dist =
              Math.abs(cx - this.position.x) + Math.abs(cy - this.position.y);
            if (dist < bestDist) {
              bestDist = dist;
              bestArea = area;
            }
          }
          return bestArea;
        };

        // 确定目标建筑
        let targetArea = null;
        const workHours = Math.min(
          4,
          Math.max(1, parseInt(decision.workHours) || 2),
        );

        if (decision.targetBuilding) {
          const namedArea = findNamedWorkArea(decision.targetBuilding);
          if (namedArea && isWorkableArea(namedArea)) {
            targetArea = namedArea;
          }
        }

        if (!targetArea && cleanupMentionedInDescription) {
          targetArea = findNearestWorkArea(cleanupBuildings, "cleanup");
        }

        // 1) LLM指定了目标位置且是工作建筑 → 尊重LLM选择
        if (
          !targetArea &&
          decision.targetX !== undefined &&
          decision.targetY !== undefined
        ) {
          const llmArea = findAreaAt(decision.targetX, decision.targetY);
          if (llmArea && isWorkableArea(llmArea)) {
            targetArea = llmArea;
          }
        }

        // 2) LLM没指定有效工作建筑 → 用偏好建筑
        if (!targetArea) {
          let bestDist = Infinity;
          for (const area of areas) {
            normalizeAreaSemantics(area);
            if (area.isBlocked || !area.cells || area.cells.length === 0)
              continue;
            if (!isWorkableArea(area)) continue;
            if (!this.preferences.places.includes(area.name)) continue;
            let sumX = 0,
              sumY = 0;
            for (const c of area.cells) {
              sumX += c.x;
              sumY += c.y;
            }
            const cx = Math.round(sumX / area.cells.length);
            const cy = Math.round(sumY / area.cells.length);
            const dist =
              Math.abs(cx - this.position.x) + Math.abs(cy - this.position.y);
            if (dist < bestDist) {
              bestDist = dist;
              targetArea = area;
            }
          }
        }

        // 3) 没有偏好匹配 → 最近的工作建筑
        if (!targetArea) {
          targetArea = findNearestWorkArea(workBuildingNames, "work");
        }

        const canWorkInCurrentArea =
          currentAreaObject && isWorkableArea(currentAreaObject);
        const canWorkHereForThisDecision =
          canWorkInCurrentArea &&
          (!cleanupMentionedInDescription || isCleanup);

        // 只有当前站着的地方就是“本次真正目标”时，才允许原地工作
        if (
          canWorkHereForThisDecision &&
          (!targetArea || currentArea === targetArea.name)
        ) {
          if (isCleanup) {
            this.cleanupOverrideUntil = null;
            this.cleanupRetargetAt = null;
          }
          return {
            type: this.ActionType.WORK,
            description:
              decision.description || (isCleanup ? "净化污染" : "工作"),
            hourlyRate: effectiveHourlyRate,
            workHours,
            timestamp: new Date(),
          };
        }

        if (targetArea) {
          const targetWorkService =
            getBestServiceForIntent(targetArea, "cleanup") ||
            getBestServiceForIntent(targetArea, "work");
          const isCleanupTarget =
            getAreaTags(targetArea).includes("pollutionCleanup") ||
            cleanupBuildings.includes(targetArea.name) ||
            (targetWorkService?.pollutionEffect || 0) < 0;
          const targetHourlyRate = isCleanupTarget
            ? 0
            : decision.hourlyRate ??
              targetWorkService?.income ??
              GAME_CONFIG.decision.defaultHourlyRate;

          // 已在目标建筑内，直接工作
          const alreadyInside = targetArea.cells.some(
            (c) => c.x === this.position.x && c.y === this.position.y,
          );
          if (alreadyInside) {
            if (isCleanupTarget) {
              this.cleanupOverrideUntil = null;
              this.cleanupRetargetAt = null;
            }
            return {
              type: this.ActionType.WORK,
              description: decision.description || (isCleanupTarget ? "净化污染" : "工作"),
              hourlyRate: targetHourlyRate,
              workHours,
              timestamp: new Date(),
            };
          }

          const passable = targetArea.cells.filter((c) =>
            worldState.isPassable ? worldState.isPassable(c.x, c.y) : true,
          );
          if (passable.length > 0) {
            const cell = passable[Math.floor(Math.random() * passable.length)];
            const dx = Math.abs(cell.x - this.position.x);
            const dy = Math.abs(cell.y - this.position.y);
            if (dx + dy > 1) {
              console.log(
                `[${this.name}] WORK → 前往${targetArea.name}(${cell.x},${cell.y})`,
              );
              this.workTarget = {
                building: targetArea.name,
                position: cell,
                workHours: workHours,
              };
              if (isCleanupTarget) {
                this.cleanupOverrideUntil = null;
              }
              return {
                type: this.ActionType.MOVE,
                description: isCleanupTarget
                  ? `前往${targetArea.name}净化污染`
                  : `前往${targetArea.name}工作`,
                targetPosition: cell,
                timestamp: new Date(),
              };
            }
          }

          this.lastFeedback = isCleanupTarget
            ? `污染太高了，要先走进${targetArea.name}开始净化。`
            : `想去${targetArea.name}工作，但还没真正走进目标区域，下一步需要继续移动。`;
          return {
            type: this.ActionType.MOVE,
            description: isCleanupTarget
              ? `继续前往${targetArea.name}净化污染`
              : `继续前往${targetArea.name}`,
            targetPosition:
              passable[0] ||
              targetArea.cells[0] || {
                x: this.position.x,
                y: this.position.y,
              },
            timestamp: new Date(),
          };
        }

        this.lastFeedback = "想去工作，但暂时没有找到可到达的工作地点。";
        return {
          type: this.ActionType.WAIT,
          description: decision.description || "暂时找不到合适的工作地点",
          timestamp: new Date(),
        };
      } else if (actionType === "BUY") {
        console.log(`[${this.name}] LLM决策: BUY购买食物`);
        const hasBuyTarget =
          decision.targetX !== undefined && decision.targetY !== undefined;
        let targetArea = hasBuyTarget
          ? findAreaAt(decision.targetX, decision.targetY)
          : null;

        const isValidBuyArea = (area) =>
          area &&
          !area.isBlocked &&
          area.services &&
          area.services.some((s) => s.fullness > 0 || s.health > 0);

        // 如果LLM没给有效购买目标，再退回系统兜底选择
        if (!isValidBuyArea(targetArea)) {
          targetArea = null;
          let nearestDist = Infinity;
          for (const area of areas) {
            if (!isValidBuyArea(area)) continue;
            let sumX = 0,
              sumY = 0;
            for (const c of area.cells) {
              sumX += c.x;
              sumY += c.y;
            }
            const cx = Math.round(sumX / area.cells.length);
            const cy = Math.round(sumY / area.cells.length);
            const dist =
              Math.abs(cx - this.position.x) + Math.abs(cy - this.position.y);
            if (dist < nearestDist) {
              nearestDist = dist;
              targetArea = area;
            }
          }
        }

        if (targetArea) {
          const areaCell = targetArea.cells.find((c) =>
            worldState.isPassable ? worldState.isPassable(c.x, c.y) : true,
          );
          const target =
            areaCell ||
            pickRandomAreaCell(targetArea.cells[0].x, targetArea.cells[0].y);
          const alreadyInside = targetArea.cells.some(
            (c) => c.x === this.position.x && c.y === this.position.y,
          );
          if (!alreadyInside && target) {
            console.log(`[${this.name}] 前往${targetArea.name}购买服务`);
            return {
              type: this.ActionType.MOVE,
              description: decision.description || `前往${targetArea.name}购买`,
              targetPosition: target,
              serviceName: decision.serviceName || "",
              timestamp: new Date(),
            };
          }
        }

        return {
          type: this.ActionType.BUY,
          description: decision.description || "购买",
          serviceName: decision.serviceName || "",
          timestamp: new Date(),
        };
      } else {
        return {
          type: this.ActionType.WAIT,
          description: decision.description || "等待",
          timestamp: new Date(),
        };
      }
    } catch (e) {
      console.error("决策失败:", e);
      return {
        type: this.ActionType.WAIT,
        description: "正在思考...",
        timestamp: new Date(),
      };
    }
  }

  /**
   * 执行行动
   */
  async executeAction(action, world) {
    // 保存world引用（用于碰撞检测）
    this.world = world;

    // 确保 action 是对象格式
    if (typeof action === "string") {
      this.currentAction = { description: action, timestamp: new Date() };
    } else {
      this.currentAction = action;
    }
    this.status = "busy";

    console.log(
      `[${this.name}] 执行行动: ${action.type || "未知类型"} - ${action.description || "无描述"}`,
    );
    this.recordDecision(action, world);

    // 记录行动到记忆
    const actionDesc = typeof action === "object" ? action.description : action;
    await this.memory.addMemory(
      `我决定: ${actionDesc}`,
      this.MemoryType.ACTION,
      6,
    );

    // 根据行动类型执行
    switch (action.type) {
      case this.ActionType.MOVE:
        if (action.targetPosition) {
          // 启动独立移动循环，每 0.2 秒走一格，不依赖 tick
          this.startMoving({ ...action.targetPosition });
        }
        break;

      case this.ActionType.TALK:
        // 对话由 checkAgentInteractions → startConversation 处理；不再生成模板闲聊
        break;

      case this.ActionType.SLEEP:
        console.log(`[${this.name}] 执行SLEEP行动，准备回家睡觉...`);
        if (world) {
          // 找到宿舍区域，并为每个 agent 分配尽量不重叠的落点
          let myHome = null;
          const areas = world.getAreas ? world.getAreas() : [];
          for (const area of areas) {
            normalizeAreaSemantics(area);
            const isSleepArea =
              area.name === "宿舍" ||
              getAreaTags(area).includes("sleepRest") ||
              Boolean(getBestServiceForIntent(area, "sleep"));
            if (isSleepArea && area.cells && area.cells.length > 0) {
              const assignedCell =
                world.findAreaCell?.(area.name, this.position, this.id) ??
                area.cells[0];
              myHome = {
                position: { ...assignedCell },
                services: area.services || [],
              };
              break;
            }
          }

          if (myHome) {
            const distance =
              Math.abs(myHome.position.x - this.position.x) +
              Math.abs(myHome.position.y - this.position.y);

            const alreadyAtHome = world.isAgentAtHome?.(this) || distance === 0;
            if (alreadyAtHome) {
              // 已经在家附近，使用睡觉服务
              console.log(`[${this.name}] 已经到家，开始睡觉`);
              const sleepService = myHome.services.find((s) =>
                serviceMatchesIntent(s, "sleep"),
              );
              if (sleepService) {
                await this.interactWithObject(myHome, sleepService);
              } else {
                this.status = "sleeping";
              }
            } else {
              // 不在家，先移动回家（标记为sleeping，这样dream phase能检测到）
              console.log(`[${this.name}] 距离家还有${distance}格，先移动回家`);
              await this.memory.addMemory(
                `夜深了，准备回家睡觉`,
                this.MemoryType.THOUGHT,
                7,
              );
              this.status = "sleeping";
              this.startMoving({ ...myHome.position });
            }
          } else {
            console.warn(`[${this.name}] 未找到宿舍，无法进入睡眠状态`);
            this.status = "idle";
            this.currentAction = null;
            this.lastFeedback = "想睡觉，但地图上找不到宿舍。";
          }
        } else {
          this.status = "idle";
          this.currentAction = null;
          this.lastFeedback = "想睡觉，但当前世界不可用。";
        }
        break;

      case this.ActionType.INTERACT:
        if (action.targetObject) {
          await this.interactWithObject(action.targetObject, action.service);
        }
        break;

      case this.ActionType.WORK:
        if (world) {
          const currentArea = world.getAreaAt?.(this.position.x, this.position.y);
          const canWorkHere = currentArea && isWorkableArea(currentArea);
          if (!canWorkHere) {
            this.status = "idle";
            this.lastFeedback = "说要工作，但当前位置并不在可工作的建筑里。";
            break;
          }
        }
        this.status = "working";
        // 设置工作结束时间（gameTime由tick统一推进）
        if (action.workHours && this.world) {
          this.workEndTime = new Date(
            this.world.gameTime.getTime() + action.workHours * 3600000,
          );
          this._workStartTime = new Date(this.world.gameTime);
        }
        break;

      case this.ActionType.BUY:
        console.log(`[${this.name}] 执行BUY行动，寻找附近食物...`);
        // 寻找附近有可购买服务的区域
        if (world) {
          let bestArea = null;
          let bestService = null;
          let minDistance = Infinity;
          const areas = world.getAreas ? world.getAreas() : [];

          for (const area of areas) {
            if (area.isBlocked || !area.services || area.services.length === 0)
              continue;
            let sumX = 0,
              sumY = 0;
            for (const c of area.cells) {
              sumX += c.x;
              sumY += c.y;
            }
            const cx = Math.round(sumX / area.cells.length);
            const cy = Math.round(sumY / area.cells.length);

            const distance =
              Math.abs(cx - this.position.x) + Math.abs(cy - this.position.y);
            if (
              distance <= GAME_CONFIG.movement.observationRange &&
              distance < minDistance
            ) {
              // 找可购买服务（食物或健康物品，考虑建筑等级成本倍率和粮食库存）
              const costMult = world?.getCostMultiplier?.(area.name) ?? 1;
              const foodStock = world?.worldResources?.foodStock ?? 0;
              const foodServices = area.services.filter(
                (s) =>
                  (serviceMatchesIntent(s, "food") ||
                    serviceMatchesIntent(s, "healing")) &&
                  this.greenPoints >= Math.round(s.cost * costMult) &&
                  (s.fullness <= 0 || foodStock > 0),
              );
              if (foodServices.length > 0) {
                const obj = {
                  name: area.name,
                  position: { x: cx, y: cy },
                  services: area.services,
                };
                // 如果指定了服务名，找匹配的
                if (action.serviceName) {
                  const matchedService = foodServices.find(
                    (s) => s.name === action.serviceName,
                  );
                  if (matchedService) {
                    bestArea = obj;
                    bestService = matchedService;
                    minDistance = distance;
                  }
                } else {
                  // 否则根据当前需求选性价比最高的
                  bestArea = obj;
                  bestService = foodServices.sort((a, b) => {
                    // 优先满足最急需的属性
                    const aVal =
                      (a.fullness || 0) * (this.fullness < 30 ? 2 : 1) +
                      (a.health || 0) * (this.health.current < 50 ? 3 : 0.5);
                    const bVal =
                      (b.fullness || 0) * (this.fullness < 30 ? 2 : 1) +
                      (b.health || 0) * (this.health.current < 50 ? 3 : 0.5);
                    return bVal / b.cost - aVal / a.cost;
                  })[0];
                  minDistance = distance;
                }
              }
            }
          }

          if (bestArea && bestService) {
            console.log(
              `[${this.name}] 找到食物: ${bestService.name} at ${bestArea.name}，价格${bestService.cost}，恢复${bestService.fullness}饱腹`,
            );
            await this.interactWithObject(bestArea, bestService);
            // 购买完成后重置状态
            this.status = "idle";
            this.currentAction = null;
          } else {
            // 分析失败原因
            const cheapestFood = GAME_CONFIG.survival.cheapestFoodPrice;
            if (this.greenPoints < cheapestFood) {
              console.log(
                `[${this.name}] 积分不足(${this.greenPoints})，买不起食物，需要去工作赚钱`,
              );
              await this.memory.addMemory(
                `很饿但是只有${this.greenPoints}积分，买不起食物，必须先工作赚钱`,
                this.MemoryType.OBSERVATION,
                8,
              );
              // 如果饥饿且没钱，不直接替agent开工，而是交给下一轮决策
              if (this.fullness < d.fullnessWarning) {
                console.log(
                  `[${this.name}] 饥饿且没钱，等待下一轮自主决定如何赚钱`,
                );
                this.status = "idle";
                this.currentAction = null;
                this.workEndTime = null;
                this._workStartTime = null;
                return;
              }
            } else {
              console.log(`[${this.name}] 附近没有卖食物的地方`);
              await this.memory.addMemory(
                "附近没有卖食物的地方，需要去找咖啡馆或便利店",
                this.MemoryType.OBSERVATION,
                6,
              );
            }
            // 购买失败也重置状态
            this.status = "idle";
            this.currentAction = null;
          }
        } else {
          console.warn(
            `[${this.name}] BUY行动失败：world或world.objects未定义`,
          );
          this.status = "idle";
          this.currentAction = null;
        }
        break;
    }

    return action;
  }

  recordDecision(action, world) {
    const actionObject =
      action && typeof action === "object" ? action : { description: action };
    const target = actionObject.targetPosition
      ? { ...actionObject.targetPosition }
      : actionObject.targetObject?.position
        ? { ...actionObject.targetObject.position }
        : null;
    this.decisionHistory.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      dayCount: world?.dayCount ?? 1,
      gameTime: world?.gameTime
        ? world.gameTime.toISOString()
        : new Date().toISOString(),
      type: actionObject.type || "UNKNOWN",
      description: actionObject.description || "无描述",
      target,
      source:
        actionObject.source ||
        (actionObject.isFallback ? "fallback" : "llm"),
    });
    this.decisionHistory = this.decisionHistory.slice(-10);
  }

  /**
   * 开始移动（使用A*寻路）
   */
  startMoving(targetPosition) {
    if (this.moveInterval) {
      clearInterval(this.moveInterval);
    }

    // 使用A*计算路径（排除自身位置和其他 agent 占据的格子）
    const startPos = { x: this.position.x, y: this.position.y };
    const agentId = this.id;
    const world = this.world;
    const path = PathFinder.findPath(startPos, targetPosition, (x, y) => {
      if (!world) return true;
      // 目标位置只检查地形，不检查 agent 占用（允许走到目标格）
      if (x === targetPosition.x && y === targetPosition.y) {
        return world.isPassable(x, y);
      }
      return world.isPassable(x, y);
    });

    if (!path || path.length === 0) {
      console.log(
        `[${this.name}] 无法找到到达目标(${targetPosition.x},${targetPosition.y})的路径`,
      );
      this.status = "idle";
      this.currentAction = null;
      this.workTarget = null;
      this.lastFeedback = `前往(${targetPosition.x},${targetPosition.y})的路线被卡住了，需要重新规划。`;
      return false;
    }

    this.currentPath = path;
    this.currentPathIndex = 0;
    this.moveTarget = targetPosition;
    if (this.status !== "sleeping") {
      this.status = "moving";
    }

    console.log(
      `[${this.name}] A*寻路完成，路径长度: ${path.length}格，目标: (${targetPosition.x},${targetPosition.y})`,
    );

    // 启动移动循环，每 0.2 秒走一格
    this.moveInterval = setInterval(() => {
      const stillMoving = this.moveOneStep();

      if (!stillMoving) {
        // 到达目标，停止移动定时器
        this.stopMoving();
      }
    }, this.moveSpeed);

    return true;
  }

  /**
   * 停止移动
   */
  stopMoving() {
    if (this.moveInterval) {
      clearInterval(this.moveInterval);
      this.moveInterval = null;
    }
    this.moveTarget = null;
    this.currentPath = [];
    this.currentPathIndex = 0;
    if (this.status !== "sleeping") {
      this.status = "idle";
      this.nextDecisionAt = this.world?.gameTime
        ? new Date(this.world.gameTime)
        : new Date();
    }
  }

  lockForConversation(durationMs = 0) {
    const safeDuration = Math.max(0, Number(durationMs) || 0);
    this.stopMoving();
    this.conversationLockUntil = new Date(Date.now() + safeDuration).toISOString();
    this.status = "talking";
  }

  isConversationLocked(now = Date.now()) {
    if (!this.conversationLockUntil) return false;
    return new Date(this.conversationLockUntil).getTime() > now;
  }

  releaseConversationLock(now = Date.now()) {
    if (!this.conversationLockUntil) return false;
    const lockUntil = new Date(this.conversationLockUntil).getTime();
    if (lockUntil > now) return false;
    this.conversationLockUntil = null;
    if (this.status === "talking") {
      this.status = "idle";
    }
    if (!this.currentAction || this.currentAction.type === this.ActionType.TALK) {
      this.currentAction = null;
    }
    return true;
  }

  /**
   * 沿A*路径移动一步
   * @returns {boolean} 是否还有剩余移动
   */
  moveOneStep() {
    if (
      !this.moveTarget ||
      !this.currentPath ||
      this.currentPath.length === 0
    ) {
      return false;
    }

    // 获取路径中的下一个点
    const nextStep = this.currentPath[this.currentPathIndex];

    if (!nextStep) {
      console.log(`[${this.name}] 路径已走完，到达目标`);
      this.moveTarget = null;
      this.currentPath = [];
      this.currentPathIndex = 0;
      // sleeping状态的agent到家后不重置为idle，保留sleeping意图
      if (this.status !== "sleeping") {
        this.status = "idle";
      }
      return false;
    }

    // 计算移动方向
    const dx = nextStep.x - this.position.x;
    const dy = nextStep.y - this.position.y;

    // 更新朝向
    if (dx > 0) this.facingDirection = "right";
    else if (dx < 0) this.facingDirection = "left";
    else if (dy > 0) this.facingDirection = "down";
    else if (dy < 0) this.facingDirection = "up";

    // 检查动态障碍（仅地形）
    const blocked =
      this.world && !this.world.isPassable(nextStep.x, nextStep.y);

    if (blocked) {
      console.log(`[${this.name}] 路径被阻挡，重新计算路径...`);

      const agentId = this.id;
      const world = this.world;
      const remainingPath = PathFinder.findPath(
        { x: this.position.x, y: this.position.y },
        this.moveTarget,
        (x, y) => {
          if (!world) return true;
          if (x === this.moveTarget.x && y === this.moveTarget.y) {
            return world.isPassable(x, y);
          }
          return world.isPassable(x, y);
        },
      );

      if (remainingPath && remainingPath.length > 0) {
        this.currentPath = remainingPath;
        this.currentPathIndex = 0;
        console.log(
          `[${this.name}] 重新计算路径成功，新路径长度: ${remainingPath.length}`,
        );
        return true; // 继续移动
      } else {
        // 无路可走，累计失败次数，超过阈值则放弃
        this._pathFailCount = (this._pathFailCount || 0) + 1;
        if (this._pathFailCount >= 10) {
          console.log(
            `[${this.name}] 连续${this._pathFailCount}次无路可走，放弃移动`,
          );
          this.moveTarget = null;
          this.currentPath = [];
          this.currentPathIndex = 0;
          this._pathFailCount = 0;
          if (this.status !== "sleeping") {
            this.status = "idle";
          }
          this.currentAction = null;
          this.workTarget = null;
          this.lastFeedback = "路线一直走不通，先停下来重新考虑下一步。";
          return false;
        }
        return true;
      }
    }

    // 执行移动
    const oldPos = { ...this.position };
    this.position.x = nextStep.x;
    this.position.y = nextStep.y;
    this._pathFailCount = 0;
    // 更新占用表
    if (this.world) {
      this.world.setAgentOccupancy(this.id, oldPos, this.position);
    }
    this.currentPathIndex++;
    this.movesSinceLastDecision++;

    const remainingSteps = this.currentPath.length - this.currentPathIndex;
    console.log(
      `[${this.name}] 移动: (${oldPos.x},${oldPos.y}) -> (${this.position.x},${this.position.y})，剩余: ${remainingSteps}步，已走${this.movesSinceLastDecision}格`,
    );

    // 检查是否到达目标
    if (
      this.position.x === this.moveTarget.x &&
      this.position.y === this.moveTarget.y
    ) {
      console.log(
        `[${this.name}] 已到达目标位置 (${this.moveTarget.x},${this.moveTarget.y})，共走${this.movesSinceLastDecision}格`,
      );
      this.moveTarget = null;
      this.currentPath = [];
      this.currentPathIndex = 0;
      if (this.status !== "sleeping") {
        this.status = "idle";
      }
      return false;
    }

    // 还有剩余移动
    if (this.status !== "sleeping") {
      this.status = "moving";
    }
    return true;
  }

  /**
   * 检查是否应该做新决策
   * 条件：走了50格，或到达目标，或没有移动目标
   */
  shouldMakeNewDecision() {
    // 没有目标，需要做决策
    if (!this.moveTarget) return true;

    // 已经走了50格，需要做新决策
    if (this.movesSinceLastDecision >= this.decisionInterval) {
      console.log(
        `[${this.name}] 已走${this.movesSinceLastDecision}格，触发新决策`,
      );
      return true;
    }

    return false;
  }

  /**
   * 重置决策计数器（在做出新决策后调用）
   */
  resetDecisionCounter() {
    this.movesSinceLastDecision = 0;
  }

  /**
   * 检查是否正在移动中
   */
  isMoving() {
    return this.moveTarget !== null;
  }

  /**
   * 创建每日计划
   */
  async createDailyPlan() {
    const prompt = buildPlanPrompt(this);

    try {
      const plan = await this.llm.chat([
        { role: "system", content: buildSystemPrompt(this) },
        { role: "user", content: prompt },
      ]);

      this.currentPlan = {
        content: plan,
        created: new Date(),
        type: "DAILY",
      };

      await this.memory.addMemory(
        `今日计划: ${plan}`,
        this.MemoryType.THOUGHT,
        7,
      );
    } catch (e) {
      console.error("创建计划失败:", e);
    }
  }

  /**
   * 获取时间上下文
   */
  getTimeContext(time) {
    const minutes = time.getHours() * 60 + time.getMinutes();
    if (minutes < 120) return "午夜";
    if (minutes < 360) return "凌晨";
    if (minutes < 540) return "清晨";
    if (minutes < 690) return "上午";
    if (minutes < 810) return "中午";
    if (minutes < 1080) return "下午";
    if (minutes < 1200) return "傍晚";
    return "晚上";
  }

  /**
   * 获取附近描述
   */
  getNearbyDescription() {
    if (this.nearbyAgents.size === 0) {
      return "周围没有人";
    }
    return `附近有${this.nearbyAgents.size}个人`;
  }

  /**
   * 设置位置
   */
  setPosition(pos) {
    this.position = pos;
  }

  /**
   * 获取位置
   */
  getPosition() {
    return this.position;
  }

  /**
   * 获取当前状态
   */
  getState() {
    return {
      status: this.status,
      currentAction: this.currentAction,
      position: this.position,
    };
  }

  /**
   * 获取序列化数据
   */
  serialize() {
    return {
      id: this.id,
      name: this.name,
      config: this.config,
      position: this.position,
      status: this.status,
      currentAction: this.currentAction,
      health: this.health,
      greenPoints: this.greenPoints,
      fullness: this.fullness,
      cycleGuidance: this.cycleGuidance,
      playerGuidance: this.playerGuidance,
      awakeHoursSinceSleep: this.awakeHoursSinceSleep,
      consecutiveNoSleepDays: this.consecutiveNoSleepDays,
      backpack: this.backpack,
      decisionHistory: this.decisionHistory,
      workEndTime: this.workEndTime ? this.workEndTime.toISOString() : null,
      workStartTime: this._workStartTime
        ? this._workStartTime.toISOString()
        : null,
      facingDirection: this.facingDirection,
      lastSurvivalUpdate: this.lastSurvivalUpdate,
      nextDecisionAt: this.nextDecisionAt
        ? this.nextDecisionAt.toISOString()
        : null,
      currentPlan: this.currentPlan
        ? {
            ...this.currentPlan,
            created:
              this.currentPlan.created instanceof Date
                ? this.currentPlan.created.toISOString()
                : this.currentPlan.created,
          }
        : null,
      lastConversation: Array.from(this.lastConversation.entries()),
      conversationLockUntil: this.conversationLockUntil,
      memory: this.memory.exportData(),
    };
  }

  /**
   * 从序列化数据恢复
   */
  static deserialize(data, llmClient) {
    const agent = new Agent(data.config, llmClient);
    agent.position = data.position;
    agent.status = data.status || "idle";
    agent.currentAction = data.currentAction || null;
    if (data.health) {
      agent.health = data.health;
    }
    if (data.greenPoints !== undefined) {
      agent.greenPoints = data.greenPoints;
    }
    if (data.fullness !== undefined) {
      agent.fullness = data.fullness;
    }
    if (data.cycleGuidance) {
      agent.cycleGuidance = data.cycleGuidance;
    }
    if (typeof data.playerGuidance === "string") {
      agent.playerGuidance = data.playerGuidance;
    }
    if (data.awakeHoursSinceSleep !== undefined) {
      agent.awakeHoursSinceSleep = data.awakeHoursSinceSleep;
    }
    if (data.consecutiveNoSleepDays !== undefined) {
      agent.consecutiveNoSleepDays = data.consecutiveNoSleepDays;
    }
    if (data.backpack) {
      agent.backpack = data.backpack;
    }
    if (Array.isArray(data.decisionHistory)) {
      agent.decisionHistory = data.decisionHistory.slice(-10);
    }
    if (data.workEndTime) {
      agent.workEndTime = new Date(data.workEndTime);
    }
    if (data.workStartTime) {
      agent._workStartTime = new Date(data.workStartTime);
    }
    if (data.facingDirection) {
      agent.facingDirection = data.facingDirection;
    }
    if (data.lastSurvivalUpdate) {
      agent.lastSurvivalUpdate = data.lastSurvivalUpdate;
    }
    if (data.currentPlan) {
      agent.currentPlan = {
        ...data.currentPlan,
        created: data.currentPlan.created
          ? new Date(data.currentPlan.created)
          : new Date(),
      };
    }
    if (Array.isArray(data.lastConversation)) {
      agent.lastConversation = new Map(data.lastConversation);
    } else if (
      data.lastConversation &&
      typeof data.lastConversation === "object"
    ) {
      agent.lastConversation = new Map(Object.entries(data.lastConversation));
    }
    if (data.conversationLockUntil) {
      agent.conversationLockUntil = data.conversationLockUntil;
    }
    if (data.nextDecisionAt) {
      agent.nextDecisionAt = new Date(data.nextDecisionAt);
    }
    if (data.memory) {
      agent.memory.importData(data.memory);
    }
    return agent;
  }

  /**
   * 更新生存属性（随时间自动消耗）
   * @param {number} gameMinutes - 游戏时间经过的分钟数
   * @param {boolean} isMoving - 是否在移动中
   * @param {boolean} isWorking - 是否在工作
   * @param {boolean} isSleeping - 是否在睡觉
   */
  updateSurvivalAttributes(
    gameMinutes,
    isMoving = false,
    isWorking = false,
    isSleeping = false,
    worldPollution = 0,
  ) {
    const now = Date.now();
    const elapsedHours = gameMinutes / 60;

    // 饱腹值消耗
    const s = GAME_CONFIG.survival;
    let fullnessConsumed = elapsedHours * s.fullnessBaseConsumption;

    if (isMoving) {
      fullnessConsumed += elapsedHours * s.fullnessMoveExtra;
    }
    if (isWorking) {
      fullnessConsumed += elapsedHours * s.fullnessWorkExtra;
    }
    if (isSleeping) {
      fullnessConsumed = elapsedHours * s.fullnessSleepRate;
    }

    this.fullness = Math.max(0, this.fullness - fullnessConsumed);

    // 健康值变化
    if (this.fullness === 0) {
      const healthLost = elapsedHours * s.healthStarvingLoss;
      this.health.current = Math.max(0, this.health.current - healthLost);
    } else if (this.fullness < s.hungerHealthLossThreshold) {
      const healthLost = elapsedHours * s.healthHungryLoss;
      this.health.current = Math.max(0, this.health.current - healthLost);
    } else if (isSleeping) {
      const healthGain = elapsedHours * s.healthSleepGain;
      this.health.current = Math.min(
        this.health.max,
        this.health.current + healthGain,
      );
      this.awakeHoursSinceSleep = 0;
      this.consecutiveNoSleepDays = 0;
    } else if (
      this.fullness >= s.healthRestThreshold &&
      !isMoving &&
      !isWorking
    ) {
      const healthGain = elapsedHours * s.healthRestGain;
      this.health.current = Math.min(
        this.health.max,
        this.health.current + healthGain,
      );
    }

    if (!isSleeping) {
      this.awakeHoursSinceSleep += elapsedHours;
    }

    // 不睡觉惩罚机制：按游戏内清醒时长结算
    const gameDaysSinceLastSleep = this.awakeHoursSinceSleep / 24;

    if (gameDaysSinceLastSleep >= 1 && !isSleeping) {
      // 计算连续不睡觉天数（取整）
      const noSleepDays = Math.floor(gameDaysSinceLastSleep);

      if (noSleepDays !== this.consecutiveNoSleepDays) {
        this.consecutiveNoSleepDays = noSleepDays;

        let sleepPenalty = 0;
        if (noSleepDays >= 3) {
          sleepPenalty =
            s.sleepPenaltyDay3 === "lethal"
              ? this.health.current
              : Number(s.sleepPenaltyDay3) || 0;
          const penaltyText =
            s.sleepPenaltyDay3 === "lethal"
              ? "健康值归零"
              : `健康值-${sleepPenalty}`;
          console.log(`[${this.name}] 连续${noSleepDays}天没有睡觉，${penaltyText}！`);
        } else if (noSleepDays >= 2) {
          sleepPenalty = s.sleepPenaltyDay2;
          console.log(
            `[${this.name}] 连续${noSleepDays}天没有睡觉，健康值-${s.sleepPenaltyDay2}`,
          );
        } else if (noSleepDays >= 1) {
          sleepPenalty = s.sleepPenaltyDay1;
          console.log(
            `[${this.name}] ${noSleepDays}天没有睡觉，健康值-${s.sleepPenaltyDay1}`,
          );
        }

        if (sleepPenalty > 0) {
          this.health.current = Math.max(0, this.health.current - sleepPenalty);
          // 记录到记忆
          this.memory.addMemory(
            `已经连续${noSleepDays}天没有睡觉了，感觉非常疲惫，健康受损`,
            this.MemoryType.OBSERVATION,
            9,
          );
        }
      }
    }

    // 污染健康伤害
    if (worldPollution > s.pollutionDamageThreshold) {
      const pollutionDamage =
        elapsedHours *
        (worldPollution - s.pollutionDamageThreshold) *
        s.pollutionDamageRate;
      this.health.current = Math.max(0, this.health.current - pollutionDamage);
    }
    if (worldPollution > s.pollutionCriticalThreshold) {
      const criticalDamage = elapsedHours * s.pollutionCriticalDamage;
      this.health.current = Math.max(0, this.health.current - criticalDamage);
    }

    // 健康=0时进入昏迷状态
    if (this.health.current === 0) {
      this.status = "unconscious";
    }

    // 从背包自动使用物品
    if (this.status !== "unconscious") {
      this.useFromBackpack();
    }

    this.lastSurvivalUpdate = now;
  }

  async applyInsomniaNightPenalty(dayCount = 1) {
    const s = GAME_CONFIG.survival;
    const noSleepDays = Math.max(1, (this.consecutiveNoSleepDays || 0) + 1);
    this.consecutiveNoSleepDays = noSleepDays;
    this.awakeHoursSinceSleep = Math.max(
      this.awakeHoursSinceSleep || 0,
      noSleepDays * 24,
    );

    let sleepPenalty = 0;
    if (noSleepDays >= 3) {
      sleepPenalty =
        s.sleepPenaltyDay3 === "lethal"
          ? this.health.current
          : Number(s.sleepPenaltyDay3) || 0;
    } else if (noSleepDays >= 2) {
      sleepPenalty = Number(s.sleepPenaltyDay2) || 0;
    } else {
      sleepPenalty = Number(s.sleepPenaltyDay1) || 0;
    }

    if (sleepPenalty > 0) {
      this.health.current = Math.max(0, this.health.current - sleepPenalty);
    }

    const penaltyText =
      sleepPenalty > 0
        ? `健康-${Math.round(sleepPenalty)}`
        : "没有额外扣血";
    const feedback = `第${dayCount}天清晨醒来时，你因为没在宿舍入睡触发失眠：连续${noSleepDays}晚没睡好，${penaltyText}。今天要更早回宿舍。`;
    this.lastFeedback = feedback;
    await this.memory.addMemory(
      feedback,
      this.MemoryType.OBSERVATION,
      9,
    );
    return { noSleepDays, sleepPenalty, feedback };
  }

  /**
   * 恢复饱腹值
   * @param {number} amount - 恢复量
   */
  eat(amount) {
    this.fullness = Math.min(100, this.fullness + amount);
  }

  /**
   * 恢复健康值
   * @param {number} amount - 恢复量
   */
  heal(amount) {
    this.health.current = Math.min(
      this.health.max,
      this.health.current + amount,
    );
  }

  /**
   * 与建筑/物体交互
   * @param {Object} object - 建筑/物体
   * @param {Object} service - 服务项目
   */
  async interactWithObject(object, service) {
    if (!service) {
      // 如果没有指定服务，使用第一个可用服务
      service = object.services?.[0];
    }

    if (!service) {
      console.log(`[${this.name}] ${object.name} 没有可用的服务`);
      return;
    }

    const buildingType = object.name;
    const world = this.world;
    const objectArea =
      object.area ||
      world?.getAreaAt?.(this.position.x, this.position.y) ||
      (world?.getAreas?.() || []).find((area) => area.name === buildingType);
    if (objectArea) normalizeAreaSemantics(objectArea);
    const buildingSemantics = objectArea ? getAreaBuilding(objectArea) : null;

    // 计算建筑等级倍率
    const costMult = world?.getCostMultiplier?.(buildingType) ?? 1;
    const effectMult = world?.getEffectMultiplier?.(buildingType) ?? 1;
    const actualCost = Math.round(service.cost * costMult);

    // 检查积分（使用实际成本）
    if (actualCost > 0 && this.greenPoints < actualCost) {
      console.log(
        `[${this.name}] 积分不足，无法使用 ${service.name}（需要${actualCost}）`,
      );
      await this.memory.addMemory(
        `想去${object.name}消费但积分不够（需要${actualCost}）`,
        this.MemoryType.OBSERVATION,
        5,
      );
      return;
    }

    // 扣除积分
    if (actualCost > 0) {
      this.spendPoints(actualCost);
    }

    // 应用效果（乘以效果倍率）
    // 支援/混合型补给建筑把物品放入背包；纯消费建筑直接生效。
    const shouldStoreSupplyInBackpack =
      (service.fullness || service.health) &&
      (buildingType === "物资基地" ||
        buildingSemantics?.purpose === "support" ||
        buildingSemantics?.purpose === "mixed" ||
        serviceHasTag(service, "foodSupply"));
    if (shouldStoreSupplyInBackpack) {
      // 食物类物品需要消耗粮食库存
      if (service.fullness && world?.worldResources) {
        const stock = world.worldResources.foodStock || 0;
        const foodStockCost = Math.max(
          1,
          Math.ceil((service.fullness || 0) / 12),
        );
        if (stock < foodStockCost) {
          console.log(
            `[${this.name}] 粮食库存不足，无法购买${service.name}（需要${foodStockCost}）`,
          );
          // 退还积分
          if (actualCost > 0) this.greenPoints += actualCost;
          this.lastFeedback = `${buildingType}库存不足，没能领取${service.name}。`;
          await this.memory.addMemory(
            this.lastFeedback,
            this.MemoryType.OBSERVATION,
            6,
          );
          return;
        }
        world.worldResources.foodStock = stock - foodStockCost;
      }
      const existing = this.backpack.find((i) => i.name === service.name);
      if (existing) {
        existing.quantity++;
      } else {
        this.backpack.push({
          name: service.name,
          quantity: 1,
          fullness: service.fullness || 0,
          health: service.health || 0,
        });
      }
      console.log(
        `[${this.name}] 将${service.name}放入背包，粮食库存:${world?.worldResources?.foodStock ?? "N/A"}，当前背包: ${this.backpack.map((i) => `${i.name}×${i.quantity}`).join(", ") || "空"}`,
      );
      this.lastFeedback = `已从${buildingType}领取${service.name}放入背包，之后饥饿或受伤时会自动使用。`;
    } else {
      if (service.fullness) {
        this.eat(Math.round(service.fullness * effectMult));
      }
      if (service.health) {
        this.heal(Math.round(service.health * effectMult));
      }
    }

    // 特殊建筑处理
    if (world?.worldResources) {
      if (buildingType === "图书馆" && service.name === "收集资料") {
        // 图书馆：知识储备-1，概率转化为理论值或生产值
        if (world.worldResources.knowledgeReserve > 0) {
          world.worldResources.knowledgeReserve = Math.max(
            0,
            world.worldResources.knowledgeReserve - 1,
          );
          const libLevel = world.getBuildingLevel(
            world.worldResources.knowledgeReserve,
          );
          const convertProb =
            GAME_CONFIG.resourceAccumulation.knowledgeConversionChance /
            libLevel;
          if (Math.random() < convertProb) {
            // 概率转理论值或生产值
            if (Math.random() < GAME_CONFIG.decision.knowledgeSplitRatio) {
              world.worldResources.techTheory = Math.min(
                100,
                world.worldResources.techTheory + 1,
              );
            } else {
              world.worldResources.techProduction = Math.min(
                100,
                world.worldResources.techProduction + 1,
              );
            }
          }
        }
      } else if (buildingType === "田地" && service.name === "种地") {
        world.worldResources.materialValue = Math.min(
          GAME_CONFIG.resourceAccumulation.materialValueMax,
          world.worldResources.materialValue +
            GAME_CONFIG.resourceAccumulation.materialValuePerInteraction,
        );
      }
    }

    // 记录到记忆
    const actionDesc = service.description || `${service.name}(${object.name})`;
    await this.memory.addMemory(
      `在${object.name}${actionDesc}，消耗${actualCost}积分`,
      this.MemoryType.ACTION,
      6,
    );

    console.log(
      `[${this.name}] 在${object.name}使用了${service.name}，剩余积分:${this.greenPoints}，饱腹:${this.fullness}，健康:${this.health.current}`,
    );

    // 如果是睡觉，改变状态并推进gameTime到醒来
    if (service.name === "睡觉") {
      // 恢复health
      this.health.current = Math.min(this.health.max, this.health.current + 10);
      this.consecutiveNoSleepDays = 0;

      const hour = this.world ? this.world.gameTime.getHours() : 8;
      if (hour >= 22 || hour < 6) {
        // 夜晚：status="sleeping"，等所有人到齐触发梦境
        this.status = "sleeping";
      } else {
        // 白天：纯恢复数值，立即idle
        this.status = "idle";
      }
    }
  }

  /**
   * 从背包自动使用物品恢复属性
   * 优先恢复健康，再恢复饱腹
   */
  useFromBackpack() {
    const s = GAME_CONFIG.survival;
    // 优先恢复健康
    if (this.health.current < s.autoUseHealthThreshold) {
      const healthItem = this.backpack
        .filter((i) => i.health > 0)
        .sort((a, b) => b.health - a.health)[0];
      if (healthItem) {
        this.heal(healthItem.health);
        healthItem.quantity--;
        if (healthItem.quantity <= 0) {
          this.backpack = this.backpack.filter((i) => i !== healthItem);
        }
        console.log(
          `[${this.name}] 从背包使用${healthItem.name}，健康+${healthItem.health}，剩余: ${this.backpack.map((i) => `${i.name}×${i.quantity}`).join(", ") || "空"}`,
        );
        this.lastFeedback = `背包自动使用${healthItem.name}，健康+${healthItem.health}。`;
        this.memory.addMemory(
          this.lastFeedback,
          this.MemoryType.OBSERVATION,
          5,
        );
        return true;
      }
    }
    // 恢复饱腹
    if (this.fullness < s.autoUseFullnessThreshold) {
      const foodItem = this.backpack
        .filter((i) => i.fullness > 0)
        .sort((a, b) => b.fullness - a.fullness)[0];
      if (foodItem) {
        this.eat(foodItem.fullness);
        foodItem.quantity--;
        if (foodItem.quantity <= 0) {
          this.backpack = this.backpack.filter((i) => i !== foodItem);
        }
        console.log(
          `[${this.name}] 从背包使用${foodItem.name}，饱腹+${foodItem.fullness}，剩余: ${this.backpack.map((i) => `${i.name}×${i.quantity}`).join(", ") || "空"}`,
        );
        this.lastFeedback = `背包自动使用${foodItem.name}，饱腹+${foodItem.fullness}。`;
        this.memory.addMemory(
          this.lastFeedback,
          this.MemoryType.OBSERVATION,
          5,
        );
        return true;
      }
    }
    return false;
  }

  /**
   * 消耗积分
   * @param {number} amount - 消耗量
   * @returns {boolean} - 是否成功
   */
  spendPoints(amount) {
    if (this.greenPoints >= amount) {
      this.greenPoints -= amount;
      return true;
    }
    return false;
  }

  /**
   * 增加积分
   * @param {number} amount - 增加量
   */
  earnPoints(amount) {
    this.greenPoints += amount;
  }

  /**
   * 晨会发言：用LLM生成一句话今日计划
   */
  async generateMeetingMessage(townContext, meetingContext = {}) {
    try {
      const response = await this.llm.chat(
        [
          { role: "system", content: buildSystemPrompt(this) },
          {
            role: "user",
            content: buildMeetingPrompt(this, townContext, meetingContext),
          },
        ],
        { timeout: 15000 },
      );
      return (
        this.world?.sanitizeConversationText?.(response, {
          replacement: "大家",
        }) || response.replace(/^["']|["']$/g, "").trim()
      );
    } catch (e) {
      console.warn(`[晨会] ${this.name} LLM调用失败:`, e.message || e);
      return "（沉思中...）";
    }
  }
}

export default Agent;
