import { describe, expect, it } from "vitest";
import LLMClient from "../public/js/app/llm-client.js";
import { setActiveGameConfig } from "../public/js/core/game-config.js";

describe("llm client local fallback", () => {
  it("marks decision fallback payloads so decision history does not label them as LLM", () => {
    const client = new LLMClient();

    const raw = client.buildDecisionFallback(`
## 世界:
理论值: 10
生产值: 10
知识储备: 15
粮食: 50
污染: 20/100

## 地点: 图书馆(2, 2), 实验室(4, 4)
## 输出JSON:
{"action":"MOVE|TALK|WAIT|SLEEP|WORK|BUY","description":"描述","targetX":0,"targetY":0,"workHours":2,"serviceName":"服务名"}
`);
    const decision = JSON.parse(raw);

    expect(decision.action).toBe("WORK");
    expect(decision.isFallback).toBe(true);
  });

  it("throws when local fallback is disabled and the backend circuit is open", async () => {
    setActiveGameConfig("normal", {
      llm: {
        enableLocalFallback: false,
      },
    });

    const client = new LLMClient();
    client.backendCircuitOpenUntil = Date.now() + 1000;

    await expect(
      client.chat([{ role: "user", content: "测试" }]),
    ).rejects.toThrow();

    setActiveGameConfig("normal", {});
  });
});
