/**
 * 记忆系统（前端版本）
 * 管理Agent的记忆流、检索和反思
 */
import GAME_CONFIG from "./game-config.js";
import PROMPTS from "./prompts.js";

class MemorySystem {
  constructor(agentId, llmClient) {
    this.memories = new Map();
    this.reflections = new Map();
    this.agentId = agentId;
    this.llm = llmClient;

    // 配置参数
    const m = GAME_CONFIG.memory;
    this.REFLECTION_THRESHOLD = m.reflectionThreshold;
    this.IMPORTANCE_THRESHOLD = m.importanceThreshold;
    this.EMBEDDING_DIMENSION = 1536;
  }

  async buildEmbedding(content) {
    let embedding;
    try {
      embedding = await this.llm.getEmbedding(content);
    } catch (e) {
      console.warn("获取嵌入失败，使用随机向量:", e);
    }

    if (!embedding) {
      embedding = this.llm.generateRandomEmbedding();
    }

    return embedding;
  }

  /**
   * 添加记忆
   */
  async addMemory(content, type, importance = 5, metadata = null) {
    const embedding = await this.buildEmbedding(content);

    const memory = {
      id: this.generateId(),
      agentId: this.agentId,
      content,
      timestamp: new Date(),
      importance,
      type,
      embedding,
      lastAccessed: new Date(),
      accessCount: 0,
      metadata,
    };

    this.memories.set(memory.id, memory);

    return memory;
  }

  /**
   * 添加反思
   */
  async addReflection(
    content,
    importance = GAME_CONFIG.memory.reflectionImportance,
    sourceMemoryIds = [],
    metadata = null,
  ) {
    const embedding = await this.buildEmbedding(content);
    const reflection = {
      id: this.generateId("ref"),
      agentId: this.agentId,
      content,
      timestamp: new Date(),
      importance,
      type: "REFLECTION",
      embedding,
      source_memory_ids: sourceMemoryIds,
      lastAccessed: new Date(),
      accessCount: 0,
      metadata,
    };

    this.reflections.set(reflection.id, reflection);
    return reflection;
  }

  /**
   * 检索相关记忆
   */
  async retrieveMemories(query, limit = 10, filter = null) {
    let queryEmbedding;
    try {
      queryEmbedding = await this.llm.getEmbedding(query);
    } catch (e) {
      console.warn("获取查询嵌入失败:", e);
    }

    // 如果嵌入为null，生成随机向量
    if (!queryEmbedding) {
      queryEmbedding = this.llm.generateRandomEmbedding();
    }

    let memories = [
      ...Array.from(this.memories.values()),
      ...Array.from(this.reflections.values()),
    ];

    memories = memories.filter((memory) => !this.isLowSignalMemory(memory));

    // 应用过滤
    if (filter?.type) {
      memories = memories.filter((m) => m.type === filter.type);
    }
    if (filter?.minImportance) {
      memories = memories.filter((m) => m.importance >= filter.minImportance);
    }

    // 计算得分并排序
    const results = memories.map((memory) => {
      const relevance = this.llm.cosineSimilarity(
        queryEmbedding,
        memory.embedding,
      );
      const recency = this.calculateRecency(memory);
      const normalizedImportance = memory.importance / 10;

      // 加权得分
      const m = GAME_CONFIG.memory;
      const score =
        relevance * m.relevanceWeight +
        recency * m.recencyWeight +
        normalizedImportance * m.importanceWeight;

      return {
        memory,
        score,
        relevance,
        recency,
        importance: normalizedImportance,
      };
    });

    // 按得分排序并返回前N个
    results.sort((a, b) => b.score - a.score);

    // 更新访问记录
    for (const result of results.slice(0, limit)) {
      result.memory.lastAccessed = new Date();
      result.memory.accessCount++;
    }

    return results.slice(0, limit);
  }

  isLowSignalMemory(memory) {
    const content = typeof memory?.content === "string" ? memory.content.trim() : "";
    if (!content) return true;
    if (memory?.metadata?.lowSignal) return true;
    return /^我移动到了位置\(\d+\s*,\s*\d+\)$/.test(content);
  }

  /**
   * 文本相似度（词汇重叠率）
   */
  textSimilarity(a, b) {
    const wordsA = new Set(
      a.split(/[\s,，。！？、]+/).filter((w) => w.length > 1),
    );
    const wordsB = new Set(
      b.split(/[\s,，。！？、]+/).filter((w) => w.length > 1),
    );
    if (wordsA.size === 0 || wordsB.size === 0) return 0;
    let overlap = 0;
    for (const w of wordsA) {
      if (wordsB.has(w)) overlap++;
    }
    return overlap / Math.max(wordsA.size, wordsB.size);
  }

  /**
   * 智能相似度：embedding有效时用embedding，否则用文本
   */
  smartSimilarity(memA, memB) {
    if (!memA?.content || !memB?.content) {
      return 0;
    }
    const textSimilarity = this.textSimilarity(memA.content, memB.content);
    const embA = memA?.embedding;
    const embB = memB?.embedding;

    if (
      !Array.isArray(embA) ||
      !Array.isArray(embB) ||
      embA.length === 0 ||
      embB.length === 0
    ) {
      return textSimilarity;
    }

    const embeddingSimilarity = this.llm.cosineSimilarity(embA, embB);
    if (!Number.isFinite(embeddingSimilarity)) {
      return textSimilarity;
    }

    return Math.max(textSimilarity, Math.max(0, embeddingSimilarity));
  }

  /**
   * 计算时效性分数
   */
  calculateRecency(memory) {
    const hoursSince =
      (new Date() - new Date(memory.timestamp)) / (1000 * 60 * 60);
    // 指数衰减
    return Math.exp(-hoursSince / GAME_CONFIG.memory.recencyDecayHours);
  }

  /**
   * 梦境阶段：基于今天的记忆生成梦境叙事和洞察（不写记忆，返回结果）
   */
  async dream() {
    const todayMemories = Array.from(this.memories.values())
      .filter((m) => m.type !== "REFLECTION")
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    if (todayMemories.length < 3)
      return { narrative: "今天没做梦", insights: [], success: false };

    const memoryTexts = todayMemories
      .slice(-30)
      .map((m, i) => `${i + 1}. [${m.type}] ${m.content}`)
      .join("\n");

    try {
      const response = await this.llm.chat(
        [
          { role: "system", content: PROMPTS.system.assistant },
          { role: "user", content: PROMPTS.user.dream(memoryTexts) },
        ],
        { timeout: 30000 },
      );

      let parsed;
      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        parsed = jsonMatch
          ? JSON.parse(jsonMatch[0])
          : { narrative: response, insights: [] };
      } catch {
        parsed = { narrative: response, insights: [] };
      }

      return {
        narrative: parsed.narrative,
        insights: parsed.insights,
        success: true,
      };
    } catch (e) {
      console.error("[梦境] dream() 失败:", e);
      return { narrative: "今天没做梦", insights: [], success: false };
    }
  }

  /**
   * 合并相似记忆（排除REFLECTION和DREAM）
   */
  async mergeMemories() {
    const candidates = Array.from(this.memories.values())
      .filter((m) => m.type !== "REFLECTION" && m.type !== "DREAM")
      .slice(0, 50); // 限制处理数量
    if (candidates.length < 2) return 0;

    let mergedCount = 0;
    const toDelete = new Set();
    const MAX_MERGES = 5;

    for (let i = 0; i < candidates.length && mergedCount < MAX_MERGES; i++) {
      if (toDelete.has(candidates[i].id)) continue;
      for (
        let j = i + 1;
        j < candidates.length && mergedCount < MAX_MERGES;
        j++
      ) {
        if (toDelete.has(candidates[j].id)) continue;
        const sim = this.smartSimilarity(candidates[i], candidates[j]);
        if (sim >= 0.5) {
          const merged = await this.llmMerge(candidates[i], candidates[j]);
          if (merged) {
            console.log(
              `[合并] "${candidates[i].content}" + "${candidates[j].content}" → "${merged.content}"`,
            );
            toDelete.add(candidates[i].id);
            toDelete.add(candidates[j].id);
            await this.addMemory(
              merged.content,
              candidates[i].type,
              merged.importance,
            );
            mergedCount++;
          }
        }
      }
    }

    for (const id of toDelete) this.memories.delete(id);
    return mergedCount;
  }

  /**
   * LLM合并两条记忆
   */
  async llmMerge(memA, memB) {
    try {
      const response = await this.llm.chat(
        [
          { role: "system", content: PROMPTS.system.assistantMerge },
          { role: "user", content: PROMPTS.user.merge(memA, memB) },
        ],
        { timeout: 15000 },
      );

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const mergedContent =
          typeof parsed?.content === "string" ? parsed.content.trim() : "";
        if (!mergedContent) {
          return null;
        }
        return {
          content: mergedContent,
          importance: Math.max(memA.importance, memB.importance),
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * 遗忘低价值记忆
   */
  forgetMemories() {
    const now = Date.now();
    let deletedCount = 0;

    for (const [id, mem] of this.memories) {
      if (mem.type === "REFLECTION" || mem.type === "DREAM") continue;

      const importanceNorm = mem.importance / 10;
      const hoursSince = (now - new Date(mem.timestamp).getTime()) / 3600000;
      const recency = Math.exp(
        -hoursSince / GAME_CONFIG.memory.recencyDecayHours,
      );
      const accessNorm = Math.min(mem.accessCount / 20, 1);

      const score = importanceNorm * 0.4 + recency * 0.3 + accessNorm * 0.3;

      if (score < 0.2) {
        this.memories.delete(id);
        deletedCount++;
      }
    }
    return deletedCount;
  }

  /**
   * 相似记忆提升为反思（≥3次相似记忆）
   */
  async promoteObservations() {
    const candidates = Array.from(this.memories.values())
      .filter(
        (m) =>
          m.type !== "REFLECTION" &&
          m.type !== "DREAM" &&
          !m.metadata?.lowSignal &&
          (m.importance ?? 0) >= this.IMPORTANCE_THRESHOLD,
      )
      .sort((a, b) => {
        const importanceDiff = (b.importance ?? 0) - (a.importance ?? 0);
        if (importanceDiff !== 0) return importanceDiff;
        return new Date(b.timestamp) - new Date(a.timestamp);
      })
      .slice(0, GAME_CONFIG.memory.maxReflectionMemories);
    if (candidates.length < GAME_CONFIG.memory.minReflectionMemories) return 0;

    let promotedCount = 0;
    const used = new Set();
    const MAX_PROMOTES = 3;

    for (
      let i = 0;
      i < candidates.length && promotedCount < MAX_PROMOTES;
      i++
    ) {
      if (used.has(candidates[i].id)) continue;
      const similar = [candidates[i]];

      for (let j = i + 1; j < candidates.length; j++) {
        if (used.has(candidates[j].id)) continue;
        const sim = this.smartSimilarity(candidates[i], candidates[j]);
        if (sim >= 0.5) similar.push(candidates[j]);
      }

      if (similar.length >= 3) {
        const texts = similar.map((m) => m.content).join("\n");
        const sourceMemoryIds = similar.map((m) => m.id);

        try {
          const rawInsight = await this.llm.chat(
            [
              { role: "system", content: PROMPTS.system.assistant },
              {
                role: "user",
                content: PROMPTS.user.patternReflection(texts, similar.length),
              },
            ],
            { timeout: 15000 },
          );
          const normalizedInsight = String(rawInsight || "").trim();
          const reflectionContent = normalizedInsight.startsWith("反思:")
            ? normalizedInsight
            : `反思: ${normalizedInsight}`;

          const duplicatedReflection = Array.from(this.reflections.values()).some(
            (reflection) =>
              this.textSimilarity(reflection.content, reflectionContent) >= 0.75,
          );

          if (!duplicatedReflection && normalizedInsight) {
            await this.addReflection(
              reflectionContent,
              GAME_CONFIG.memory.reflectionImportance,
              sourceMemoryIds,
              { similarCount: similar.length },
            );
            promotedCount++;
          }

          for (const m of similar) used.add(m.id);
        } catch {}
      }
    }
    return promotedCount;
  }

  /**
   * 记忆整合：合并 → 遗忘 → 提升
   */
  async consolidate() {
    console.log(`[记忆整合] 开始整合 ${this.memories.size} 条记忆`);
    const merged = await this.mergeMemories();
    console.log(`[记忆整合] 合并完成: ${merged}条`);
    const deleted = this.forgetMemories();
    console.log(`[记忆整合] 遗忘完成: ${deleted}条`);
    const promoted = await this.promoteObservations();
    console.log(
      `[记忆整合] 合并${merged}条, 遗忘${deleted}条, 提升${promoted}条`,
    );
    return { merged, deleted, promoted };
  }

  /**
   * 获取最近记忆
   */
  getRecentMemories(limit = 10) {
    const memories = Array.from(this.memories.values());
    memories.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return memories.slice(0, limit);
  }

  /**
   * 导出数据（用于保存）
   */
  exportData() {
    return {
      memories: Array.from(this.memories.values()),
      reflections: Array.from(this.reflections.values()),
    };
  }

  /**
   * 导入数据
   */
  importData(data) {
    this.memories.clear();
    this.reflections.clear();

    if (data.memories) {
      for (const memory of data.memories) {
        memory.timestamp = new Date(memory.timestamp);
        memory.lastAccessed = new Date(memory.lastAccessed || memory.timestamp);
        this.memories.set(memory.id, memory);
        if (memory.type === "REFLECTION" && !this.reflections.has(memory.id)) {
          this.reflections.set(memory.id, {
            ...memory,
            source_memory_ids:
              memory.source_memory_ids || memory.metadata?.source_memory_ids || [],
          });
        }
      }
    }

    if (data.reflections) {
      for (const reflection of data.reflections) {
        reflection.timestamp = new Date(reflection.timestamp);
        this.reflections.set(reflection.id, reflection);
      }
    }
  }

  /**
   * 生成唯一ID
   */
  generateId(prefix = "mem") {
    return `${prefix}_` + Math.random().toString(36).substr(2, 9);
  }
}

export default MemorySystem;
