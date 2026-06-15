import { describe, expect, it, vi } from "vitest";
import Agent from "../public/js/core/agent.js";
import WorldSimulator from "../public/js/core/simulator.js";
import { setActiveGameConfig } from "../public/js/core/game-config.js";

const llmStub = {
  async chat() {
    return JSON.stringify({
      action: "WAIT",
      description: "观察局势",
    });
  },
  async getEmbedding() {
    return [1, 0, 0];
  },
  generateRandomEmbedding() {
    return [1, 0, 0];
  },
  cosineSimilarity() {
    return 1;
  },
};

function createAgent(overrides = {}) {
  const agent = new Agent(
    {
      id: "agent-1",
      name: "测试员",
      age: 20,
      occupation: "测试",
      background: "用于测试行为规则。",
      goals: [],
      personality: { social: 0.5, energy: 0.5 },
      preferences: { places: [], activities: [] },
      routine: { wakeTime: 7, sleepTime: 22 },
      rules: [],
      ...overrides,
    },
    llmStub,
  );
  agent.position = { x: 0, y: 0 };
  return agent;
}

function createWorldState(areas, pollution = 100) {
  return {
    time: new Date("2026-05-28T12:00:00"),
    pollution,
    getAreas: () => areas,
    getAreaNameAt(x, y) {
      return areas.find((area) =>
        area.cells?.some((cell) => cell.x === x && cell.y === y),
      )?.name ?? null;
    },
    isPassable: () => true,
  };
}

describe("agent behavior guardrails", () => {
  it("does not enter sleeping when no dorm exists", async () => {
    const agent = createAgent();

    await agent.executeAction(
      { type: agent.ActionType.SLEEP, description: "回宿舍睡觉" },
      {
        getAreas: () => [],
        isAgentAtHome: () => false,
      },
    );

    expect(agent.status).toBe("idle");
    expect(agent.currentAction).toBeNull();
    expect(agent.lastFeedback).toContain("找不到宿舍");
  });

  it("does not rewrite a work decision to the wishing well during critical pollution", async () => {
    const agent = createAgent();
    const areas = [
      {
        name: "工厂",
        cells: [{ x: 4, y: 4 }],
        services: [{ name: "制造", income: 10 }],
      },
      {
        name: "许愿池",
        cells: [{ x: 9, y: 9 }],
        services: [{ name: "净化", pollutionEffect: -1 }],
      },
    ];
    agent.llm = {
      ...llmStub,
      async chat() {
        return JSON.stringify({
          action: "WORK",
          description: "继续制造零件",
          targetX: 4,
          targetY: 4,
          workHours: 2,
        });
      },
    };

    const action = await agent.decide(createWorldState(areas, 100));

    expect(action.type).toBe(agent.ActionType.MOVE);
    expect(action.targetPosition).toEqual({ x: 4, y: 4 });
    expect(action.description).toBe("前往工厂工作");
  });

  it("does not work in place when the decision description says to go to the wishing well", async () => {
    const agent = createAgent();
    agent.position = { x: 4, y: 4 };
    const areas = [
      {
        name: "工厂",
        cells: [{ x: 4, y: 4 }],
        services: [{ name: "制造", income: 10 }],
      },
      {
        name: "许愿池",
        cells: [{ x: 9, y: 9 }],
        services: [{ name: "净化", pollutionEffect: -1 }],
      },
    ];
    agent.llm = {
      ...llmStub,
      async chat() {
        return JSON.stringify({
          action: "WORK",
          description: "污染只剩11%，必须先去许愿池净化，争取直接结束危机。",
          workHours: 2,
        });
      },
    };

    const action = await agent.decide(createWorldState(areas, 11));

    expect(action.type).toBe(agent.ActionType.MOVE);
    expect(action.targetPosition).toEqual({ x: 9, y: 9 });
    expect(action.description).toBe("前往许愿池净化污染");
  });

  it("interrupts polluted non-cleanup work for a fresh decision without setting a cleanup target", () => {
    const world = new WorldSimulator({ llmClient: llmStub });
    world.pollution = 80;
    world.areas = [
      { name: "工厂", cells: [{ x: 1, y: 1 }], services: [] },
      { name: "许愿池", cells: [{ x: 2, y: 2 }], services: [] },
    ];

    const agent = createAgent();
    agent.position = { x: 1, y: 1 };
    agent.status = "working";
    agent.currentAction = {
      type: agent.ActionType.WORK,
      description: "在工厂工作",
      hourlyRate: 0,
      workHours: 2,
    };
    agent.workEndTime = new Date(world.gameTime.getTime() + 2 * 3600000);
    agent._workStartTime = new Date(world.gameTime);
    agent.earnPoints = vi.fn();

    world.updateAgentSync(agent);

    expect(agent.status).toBe("idle");
    expect(agent.currentAction).toBeNull();
    expect(agent.workTarget).toBeNull();
    expect(agent.cleanupOverrideUntil).toBeNull();
    expect(agent.cleanupRetargetAt).toBeNull();
    expect(agent._needsDecision).toBe(true);
    expect(agent.lastFeedback).toContain("重新判断下一步行动");
  });

  it("announces which agents were forced to wait by a world event", () => {
    const world = new WorldSimulator({ llmClient: llmStub });
    const agent = createAgent({ id: "agent-1", name: "小明" });
    agent.moveTarget = { x: 9, y: 9 };
    agent.currentPath = [{ x: 1, y: 0 }];
    agent.currentPathIndex = 0;
    agent.workTarget = { building: "工厂" };
    agent.workEndTime = new Date(world.gameTime.getTime() + 3600000);
    agent._workStartTime = new Date(world.gameTime);
    agent.stopMoving = vi.fn(function stopMoving() {
      this.moveTarget = null;
      this.currentPath = [];
      this.currentPathIndex = 0;
    });
    world.agents.set(agent.id, agent);

    const event = world.triggerEvent("accident", "尘暴压向小镇。", {
      title: "尘暴越境",
      effects: { forceWaitCount: 1 },
    });

    expect(event.description).toContain("小明的行动被打断");
    expect(event.effects.interruptedAgents).toEqual(["小明"]);
    expect(agent.stopMoving).toHaveBeenCalledOnce();
    expect(agent.currentAction.type).toBe(agent.ActionType.WAIT);
    expect(agent.moveTarget).toBeNull();
    expect(agent.currentPath).toEqual([]);
    expect(agent.workTarget).toBeNull();
    expect(agent.workEndTime).toBeNull();
  });

  it("does not start random conversations without an explicit TALK action", async () => {
    const world = new WorldSimulator({ llmClient: llmStub });
    const agent = createAgent({ id: "agent-1", name: "小明" });
    const other = createAgent({ id: "agent-2", name: "小红" });
    other.position = { x: 1, y: 0 };
    world.agents.set(agent.id, agent);
    world.agents.set(other.id, other);
    world.startConversation = vi.fn();

    const started = await world.checkAgentInteractions(agent);

    expect(started).toBe(false);
    expect(world.startConversation).not.toHaveBeenCalled();
  });

  it("skips conversation events when LLM dialogue generation fails", async () => {
    const world = new WorldSimulator();
    world.llm = {
      ...llmStub,
      async chat() {
        throw new Error("no dialogue");
      },
    };
    const agent = createAgent({ id: "agent-1", name: "小明" });
    const other = createAgent({ id: "agent-2", name: "小红" });
    other.position = { x: 1, y: 0 };
    world.agents.set(agent.id, agent);
    world.agents.set(other.id, other);
    const eventSpy = vi.fn();
    world.addEventListener("event", eventSpy);

    const started = await world.checkAgentInteractions(agent, { force: true });

    expect(started).toBe(false);
    expect(eventSpy).not.toHaveBeenCalled();
  });

  it("prioritizes the wishing well as a finish-line fallback when pollution is nearly cleared", () => {
    const world = new WorldSimulator();
    world.pollution = 11;
    world.areas = [
      { name: "许愿池", cells: [{ x: 2, y: 2 }], services: [] },
      { name: "图书馆", cells: [{ x: 4, y: 4 }], services: [] },
    ];
    const agent = createAgent();
    agent.position = { x: 0, y: 0 };

    const action = world.createFallbackDecisionAction(agent, world.getWorldState());

    expect(action.type).toBe(agent.ActionType.MOVE);
    expect(action.targetPosition).toEqual({ x: 2, y: 2 });
    expect(action.description).toContain("污染只剩一点，我们加加油");
  });

  it("interrupts non-cleanup work for a fresh decision when pollution is nearly cleared", () => {
    const world = new WorldSimulator({ llmClient: llmStub });
    world.pollution = 11;
    world.areas = [
      { name: "工厂", cells: [{ x: 1, y: 1 }], services: [] },
      { name: "许愿池", cells: [{ x: 2, y: 2 }], services: [] },
    ];

    const agent = createAgent();
    agent.position = { x: 1, y: 1 };
    agent.status = "working";
    agent.currentAction = {
      type: agent.ActionType.WORK,
      description: "在工厂工作",
      hourlyRate: 0,
      workHours: 2,
    };
    agent.workEndTime = new Date(world.gameTime.getTime() + 2 * 3600000);
    agent._workStartTime = new Date(world.gameTime);
    agent.earnPoints = vi.fn();

    world.updateAgentSync(agent);

    expect(agent.status).toBe("idle");
    expect(agent.currentAction).toBeNull();
    expect(agent.workTarget).toBeNull();
    expect(agent._needsDecision).toBe(true);
    expect(agent.lastFeedback).toContain("污染只剩一点，我们加加油");
    expect(agent.lastFeedback).toContain("重新判断下一步行动");
  });

  it("uses meeting consensus fallback to call for final cleanup when pollution is low but not zero", async () => {
    const world = new WorldSimulator();
    world.llm = {
      async chat() {
        throw new Error("consensus unavailable");
      },
    };
    world.pollution = 11;
    world.worldResources = {
      ...world.worldResources,
      foodStock: 100,
      knowledgeReserve: 100,
    };

    const consensus = await world.buildMeetingConsensus(
      [],
      "污染指数: 11/100",
    );

    expect(consensus).toContain("污染只剩一点，我们加加油");
    expect(consensus).toContain("许愿池");
  });

  it("waits instead of locally deciding when local fallback is disabled", async () => {
    setActiveGameConfig("normal", {
      llm: {
        enableLocalFallback: false,
      },
    });

    const world = new WorldSimulator({ llmClient: llmStub });
    const agent = createAgent();
    world.agents.set(agent.id, agent);
    world.isRunning = true;
    agent._needsDecision = true;
    world.planAgentDecision = vi.fn(async () => {
      throw new Error("llm offline");
    });

    await world.tick();

    expect(agent.currentAction?.type).toBe(agent.ActionType.WAIT);
    expect(agent.currentAction?.description).toContain("LLM未接通");
    expect(agent.decisionHistory.at(-1)?.source).toBe("llm-unavailable");
    expect(agent.lastFeedback).toContain("本地兜底已关闭");

    setActiveGameConfig("normal", {});
  });

  it("uses both agents' social tendencies to gate forced TALK success", async () => {
    const world = new WorldSimulator({ llmClient: llmStub });
    const agent = createAgent({
      id: "agent-1",
      personality: { social: 0.9, energy: 0.5 },
    });
    const other = createAgent({
      id: "agent-2",
      personality: { social: 0.1, energy: 0.5 },
    });
    other.position = { x: 1, y: 0 };
    world.agents.set(agent.id, agent);
    world.agents.set(other.id, other);
    world.startConversation = vi.fn(async () => true);

    const randomSpy = vi
      .spyOn(Math, "random")
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.5);

    const started = await world.checkAgentInteractions(agent, { force: true });

    expect(started).toBe(false);
    expect(world.startConversation).not.toHaveBeenCalled();

    randomSpy.mockRestore();
  });

  it("prefers more social partners when picking a conversation target", () => {
    const world = new WorldSimulator({ llmClient: llmStub });
    const agent = createAgent({
      id: "agent-1",
      personality: { social: 0.8, energy: 0.5 },
    });
    const reserved = createAgent({
      id: "agent-2",
      personality: { social: 0.1, energy: 0.5 },
    });
    const outgoing = createAgent({
      id: "agent-3",
      personality: { social: 0.95, energy: 0.5 },
    });

    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.99);
    const picked = world.pickConversationCandidate(agent, [reserved, outgoing]);

    expect(picked).toBe(outgoing);

    randomSpy.mockRestore();
  });

  it("scales work income and resource output with energy", () => {
    const world = new WorldSimulator();
    world.setAreas([{ name: "田地", cells: [{ x: 1, y: 1 }], services: [] }]);

    const lowEnergyAgent = createAgent({
      id: "agent-low",
      personality: { social: 0.5, energy: 0 },
    });
    lowEnergyAgent.position = { x: 1, y: 1 };
    lowEnergyAgent.status = "working";
    lowEnergyAgent.currentAction = {
      type: lowEnergyAgent.ActionType.WORK,
      description: "低精力种地",
      hourlyRate: 10,
      workHours: 1,
    };
    lowEnergyAgent._workStartTime = new Date(world.gameTime);
    lowEnergyAgent.workEndTime = new Date(world.gameTime.getTime() + 3600000);
    const lowPointsBefore = lowEnergyAgent.greenPoints;
    const lowMaterialBefore = world.worldResources.materialValue;
    const lowFoodBefore = world.worldResources.foodStock;

    world._finalizeWork(lowEnergyAgent);

    const lowPointsGain = lowEnergyAgent.greenPoints - lowPointsBefore;
    const lowMaterialGain = world.worldResources.materialValue - lowMaterialBefore;
    const lowFoodGain = world.worldResources.foodStock - lowFoodBefore;

    const highEnergyAgent = createAgent({
      id: "agent-high",
      personality: { social: 0.5, energy: 1 },
    });
    highEnergyAgent.position = { x: 1, y: 1 };
    highEnergyAgent.status = "working";
    highEnergyAgent.currentAction = {
      type: highEnergyAgent.ActionType.WORK,
      description: "高精力种地",
      hourlyRate: 10,
      workHours: 1,
    };
    highEnergyAgent._workStartTime = new Date(world.gameTime);
    highEnergyAgent.workEndTime = new Date(world.gameTime.getTime() + 3600000);
    const highPointsBefore = highEnergyAgent.greenPoints;
    const highMaterialBefore = world.worldResources.materialValue;
    const highFoodBefore = world.worldResources.foodStock;

    world._finalizeWork(highEnergyAgent);

    const highPointsGain = highEnergyAgent.greenPoints - highPointsBefore;
    const highMaterialGain =
      world.worldResources.materialValue - highMaterialBefore;
    const highFoodGain = world.worldResources.foodStock - highFoodBefore;

    expect(lowPointsGain).toBeCloseTo(5);
    expect(highPointsGain).toBeCloseTo(15);
    expect(highMaterialGain).toBeGreaterThan(lowMaterialGain);
    expect(highFoodGain).toBeGreaterThan(lowFoodGain);
  });
});
