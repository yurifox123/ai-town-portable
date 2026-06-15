import { describe, expect, it, vi } from "vitest";
import MemorySystem from "../public/js/core/memory.js";

const llmStub = {
  async chat() {
    return "反思: 这似乎说明他在反复确认同伴位置。";
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

describe("memory signal filtering", () => {
  it("does not retrieve raw movement coordinate memories into decision context", async () => {
    const memory = new MemorySystem("agent-1", llmStub);

    await memory.addMemory("我移动到了位置(20, 11)", "ACTION", 5);
    await memory.addMemory("我决定先去图书馆整理资料", "ACTION", 6);

    const results = await memory.retrieveMemories("当前位置: 我在(20, 11)", 10);
    const contents = results.map((entry) => entry.memory.content);

    expect(contents).not.toContain("我移动到了位置(20, 11)");
    expect(contents).toContain("我决定先去图书馆整理资料");
  });

  it("filters low-signal nearby observations out of retrieval context", async () => {
    const memory = new MemorySystem("agent-1", llmStub);

    await memory.addMemory("观察到: 看到小明在附近", "OBSERVATION", 7, {
      type: "agent",
      lowSignal: true,
      signalCategory: "nearby-agent",
    });
    await memory.addMemory("观察到: 我决定去许愿池继续净化污染", "ACTION", 8);

    const results = await memory.retrieveMemories("当前情况: 污染还没清完", 10);
    const contents = results.map((entry) => entry.memory.content);

    expect(contents).not.toContain("观察到: 看到小明在附近");
    expect(contents).toContain("观察到: 我决定去许愿池继续净化污染");
  });

  it("does not promote low-signal observations into reflections", async () => {
    const memory = new MemorySystem("agent-1", llmStub);
    const chatSpy = vi.spyOn(llmStub, "chat");

    await memory.addMemory("观察到: 看到小明在附近", "OBSERVATION", 7, {
      type: "agent",
      lowSignal: true,
    });
    await memory.addMemory("观察到: 看到小红在附近", "OBSERVATION", 7, {
      type: "agent",
      lowSignal: true,
    });
    await memory.addMemory("观察到: 看到小米在附近", "OBSERVATION", 7, {
      type: "agent",
      lowSignal: true,
    });

    const promoted = await memory.promoteObservations();

    expect(promoted).toBe(0);
    expect(memory.reflections.size).toBe(0);
    expect(chatSpy).not.toHaveBeenCalled();
  });
});
