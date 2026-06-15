import { describe, expect, it } from "vitest";
import {
  getAreaBuildingSummary,
  isWorkableArea,
  normalizeAreaSemantics,
} from "../public/js/core/building-semantics.js";
import WorldSimulator from "../public/js/core/simulator.js";
import Agent from "../public/js/core/agent.js";

const llmStub = {
  async chat() {
    return JSON.stringify({ action: "WAIT", description: "观察局势" });
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
      background: "用于测试建筑语义。",
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

describe("building semantics loop", () => {
  it("generates services and prompt summary from editable metadata tags", () => {
    const area = normalizeAreaSemantics({
      name: "医务室",
      cells: [{ x: 5, y: 5 }],
      services: [],
      metadata: {
        building: {
          enabled: true,
          purpose: "support",
          tags: ["healing"],
          agentDescription: "健康低时来这里治疗。",
        },
      },
    });

    expect(area.services.some((service) => service.tags.includes("healing"))).toBe(
      true,
    );
    expect(isWorkableArea(area)).toBe(false);
    expect(getAreaBuildingSummary(area)).toContain("医务室(5,5)");
    expect(getAreaBuildingSummary(area)).toContain("治疗恢复");
  });

  it("uses editable effect values in generated services and prompt summaries", () => {
    const area = normalizeAreaSemantics({
      name: "前端净化塔",
      cells: [{ x: 7, y: 7 }],
      services: [],
      metadata: {
        building: {
          enabled: true,
          purpose: "collective",
          effectValues: { pollutionCleanup: -6 },
          agentDescription: "前端测试创建的净化建筑。",
        },
      },
    });
    const cleanupService = area.services.find((service) =>
      service.tags.includes("pollutionCleanup"),
    );

    expect(area.metadata.building.tags).toEqual(["pollutionCleanup"]);
    expect(cleanupService.pollutionEffect).toBe(-6);
    expect(getAreaBuildingSummary(area)).toContain("污染-6/小时");
  });

  it("uses semantic cleanup buildings for local fallback decisions", () => {
    const world = new WorldSimulator({ llmClient: llmStub });
    world.pollution = 82;
    world.setAreas([
      {
        name: "净化塔",
        cells: [{ x: 3, y: 3 }],
        services: [],
        metadata: {
          building: {
            enabled: true,
            purpose: "collective",
            tags: ["pollutionCleanup"],
            agentDescription: "污染高时来这里净化。",
          },
        },
      },
    ]);
    const agent = createAgent();

    const action = world.createFallbackDecisionAction(agent, world.getWorldState());

    expect(action.type).toBe(agent.ActionType.MOVE);
    expect(action.targetPosition).toEqual({ x: 3, y: 3 });
    expect(action.description).toContain("污染");
  });

  it("applies semantic resource effects when working in a custom food building", () => {
    const world = new WorldSimulator({ llmClient: llmStub });
    world.setAreas([
      {
        name: "温室",
        cells: [{ x: 6, y: 6 }],
        services: [],
        metadata: {
          building: {
            enabled: true,
            purpose: "collective",
            tags: ["foodProduction"],
            agentDescription: "增加集体粮食库存。",
          },
        },
      },
    ]);
    const agent = createAgent({ personality: { social: 0.5, energy: 1 } });
    agent.position = { x: 6, y: 6 };
    agent.status = "working";
    agent.currentAction = {
      type: agent.ActionType.WORK,
      description: "在温室生产粮食",
      hourlyRate: 0,
      workHours: 1,
    };
    agent._workStartTime = new Date(world.gameTime);
    agent.workEndTime = new Date(world.gameTime.getTime() + 3600000);
    const foodBefore = world.worldResources.foodStock;

    world._finalizeWork(agent);

    expect(world.worldResources.foodStock).toBeGreaterThan(foodBefore);
    expect(agent.lastFeedback).toContain("粮食");
  });

  it("treats semantic sleep buildings like dorms for night checks", () => {
    const world = new WorldSimulator({ llmClient: llmStub });
    world.setAreas([
      {
        name: "睡眠舱",
        cells: [{ x: 2, y: 2 }],
        services: [],
        metadata: {
          building: {
            enabled: true,
            purpose: "support",
            effectValues: { sleepRest: 10 },
            agentDescription: "能睡觉休息。",
          },
        },
      },
    ]);
    const agent = createAgent();
    agent.position = { x: 2, y: 2 };

    expect(world.isAgentAtHome(agent)).toBe(true);
  });

  it("stores semantic support supplies in backpack like the legacy supply base", async () => {
    const world = new WorldSimulator({ llmClient: llmStub });
    const supplyArea = normalizeAreaSemantics({
      name: "补给站",
      cells: [{ x: 6, y: 6 }],
      services: [],
      metadata: {
        building: {
          enabled: true,
          purpose: "support",
          effectValues: { foodSupply: 20, healing: 18 },
          agentDescription: "能领取食物和治疗补给。",
        },
      },
    });
    world.setAreas([supplyArea]);
    world.worldResources.foodStock = 100;
    const agent = createAgent();
    agent.position = { x: 6, y: 6 };
    agent.world = world;
    const service = supplyArea.services.find((item) => item.fullness > 0);

    await agent.interactWithObject(
      { name: supplyArea.name, area: supplyArea, services: supplyArea.services },
      service,
    );

    expect(agent.backpack).toEqual([
      expect.objectContaining({ name: service.name, quantity: 1, fullness: 20 }),
    ]);
    expect(agent.fullness).toBe(76);
    expect(agent.lastFeedback).toContain("补给站");
  });
});
