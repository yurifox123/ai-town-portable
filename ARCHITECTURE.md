# AI生态小镇项目架构说明

> 复刻斯坦福 Generative Agents（生成式代理）论文的多智能体模拟系统

---

## 📁 项目结构总览

```
src/
├── index.ts                    # 程序入口
├── types/                      # 类型定义
│   └── index.ts               # 所有接口/枚举定义
├── config/                     # 配置管理
│   └── index.ts               # 环境变量、配置验证
├── llm/                        # LLM客户端
│   └── client.ts              # 支持多供应商API
├── memory/                     # 记忆系统
│   └── memory-system.ts       # 记忆流、反思、检索
├── agent/                      # Agent核心
│   └── agent.ts               # 感知、决策、行动
├── world/                      # 世界模拟
│   └── simulator.ts           # 时间、地图、事件
├── data/                       # 数据模板
│   └── agent-templates.ts     # 预定义角色
└── example-kimi.ts            # Kimi运行示例
```

---

## 1️⃣ `src/index.ts` - **程序入口**

整个应用的启动文件。

### 主要流程
```typescript
1. 加载配置 → 验证API密钥
2. 初始化LLM客户端
3. 创建世界模拟器
4. 创建3个Agent（小明、小红、阿强）
5. 启动模拟循环（每5秒一个tick）
6. 触发一次示例对话
```

### 监听的事件
- `tick` - 每次时间推进
- `agentJoined` - Agent加入世界
- `event` - 世界事件发生

---

## 2️⃣ `src/types/index.ts` - **类型定义**

所有数据结构定义的中央仓库。

### 核心类型

| 类型 | 说明 |
|------|------|
| `Memory` | 记忆对象（内容、时间、重要性、嵌入向量） |
| `MemoryType` | 记忆类型枚举：`OBSERVATION`/`THOUGHT`/`ACTION`/`REFLECTION`/`DIALOGUE` |
| `Reflection` | 反思对象（高维洞察） |
| `Plan` | 计划对象（长期/日/小时/即时） |
| `Action` | 动作对象（移动/对话/交互/思考/等待） |
| `AgentConfig` | Agent配置（姓名、年龄、性格、背景、目标） |
| `WorldState` | 世界状态（时间、所有Agent、物体、事件） |
| `LLMConfig` | LLM配置（支持自定义供应商） |
| `RetrievalResult` | 检索结果（含三维度得分） |

---

## 3️⃣ `src/config/index.ts` - **配置管理**

从环境变量读取配置。

### 可配置项
```env
LLM_PROVIDER=custom          # openai/anthropic/ollama/custom
CUSTOM_MODEL=kimi-k2.5
CUSTOM_API_KEY=xxx
CUSTOM_ENDPOINT=https://...
CUSTOM_RESPONSE_PATH=content[0].text

WORLD_WIDTH=50              # 地图宽度
WORLD_HEIGHT=50             # 地图高度
TIME_SCALE=60               # 时间缩放（1秒现实=60秒游戏）
TICK_INTERVAL_MS=5000       # tick间隔
```

---

## 4️⃣ `src/llm/client.ts` - **LLM客户端**

支持4种供应商的统一接口。

### 支持的供应商

| 供应商 | 说明 |
|--------|------|
| `openai` | 官方OpenAI SDK |
| `anthropic` | 官方Claude SDK |
| `ollama` | 本地模型（fetch调用） |
| `custom` | **自定义API**（当前使用的） |

### 关键方法
- `generate()` - 生成文本
- `generateJSON()` - 生成结构化JSON（带schema约束）
- `getEmbedding()` - 获取文本向量嵌入

### 自定义供应商特性
- 支持自定义请求头
- 支持响应路径提取（如 `content[1].text`）
- 支持独立embedding端点

---

## 5️⃣ `src/memory/memory-system.ts` - **记忆系统**

斯坦福论文的核心实现。

### 三大功能

#### 🔹 记忆流 (Memory Stream)
- 所有观察、想法、动作、对话的原始记录
- 每个记忆有：内容、时间、重要性、类型、向量嵌入

#### 🔹 反思 (Reflection)
- 当记忆数达到阈值（100条）时触发
- LLM自动总结高维洞察
- 反思本身也加入记忆流

#### 🔹 三维度检索
```
综合得分 = 相关性 × 0.6 + 时效性 × 0.2 + 重要性 × 0.2

相关性 = 余弦相似度(查询向量, 记忆向量)
时效性 = exp(-小时数/24)  // 指数衰减
重要性 = 1-10分 / 10
```

---

## 6️⃣ `src/agent/agent.ts` - **Agent核心**

每个AI代理的"大脑"。

### 生命周期
```
initialize() → perceive() → decide() → executeAction()
     ↑_________________________________________↓
```

### 核心方法

| 方法 | 功能 |
|------|------|
| `initialize()` | 记录性格、背景、目标到记忆，创建今日计划 |
| `perceive()` | 接收环境观察，评估重要性，存入记忆 |
| `decide()` | 基于检索到的相关记忆，决定下一步行动 |
| `executeAction()` | 执行动作，记录到记忆，更新状态 |
| `respondToDialogue()` | 响应其他Agent的对话（带记忆检索） |
| `createDailyPlan()` | 基于反思和近期活动制定日计划 |

### 状态管理
- 位置坐标 (x, y)
- 当前动作
- 附近Agent列表
- 上次对话时间

---

## 7️⃣ `src/world/simulator.ts` - **世界模拟器**

继承`EventEmitter`，管理整个虚拟世界。

### 核心功能

#### 世界初始化
- 创建地点：咖啡馆、公园、小屋、商店
- 每个地点有位置、描述

#### Tick循环（每5秒）
```typescript
1. 推进游戏时间（+5分钟）
2. 对每个Agent：
   - 获取环境观察（附近物体/Agent/时间）
   - Agent感知 → 决策 → 执行
   - 处理交互（如对话）
3. 广播状态更新
```

#### 事件系统
- `tick` - 时间推进
- `agentJoined`/`agentLeft` - Agent进出
- `event` - 世界事件
- `started`/`stopped` - 模拟启停

#### 对话系统
`startConversation(agent1, agent2)` - 触发两个Agent的多轮对话

---

## 8️⃣ `src/data/agent-templates.ts` - **角色模板**

预定义的5个角色：

| 角色 | 年龄 | 性格 | 职业 |
|------|------|------|------|
| 小明 | 25 | 外向活泼 | 软件工程师 |
| 小红 | 23 | 温柔内向 | 自由插画师 |
| 阿强 | 28 | 沉稳可靠 | 健身教练 |
| 琳达 | 26 | 独立自主 | 产品经理 |
| 王大爷 | 65 | 和蔼可亲 | 退休教师 |

每个角色有独特的背景故事和目标，影响他们的行为和决策。

---

## 9️⃣ `src/example-kimi.ts` - **Kimi运行示例**

当前使用的配置文件，接入阿里云DashScope的Kimi K2.5。

### 关键配置
```typescript
endpoint: 'https://coding.dashscope.aliyuncs.com/apps/anthropic/v1/messages'
headers: {
  'x-api-key': '你的API密钥',
  'anthropic-version': '2023-06-01',
}
responsePath: 'content[1].text'  // Kimi返回thinking+text两个content
```

---

## 🔄 数据流转示意图

```
┌─────────────────────────────────────────────────────────┐
│                    WorldSimulator                       │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                │
│  │ Agent A │  │ Agent B │  │ Agent C │  ...            │
│  └────┬────┘  └────┬────┘  └────┬────┘                │
│       │            │            │                       │
│  ┌────▼────────────▼────────────▼────┐                 │
│  │         共享的世界状态              │                 │
│  │  时间、地点、物体、事件            │                 │
│  └───────────────────────────────────┘                 │
└─────────────────────────────────────────────────────────┘

每个Agent内部:
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   perceive  │───→│    decide   │───→│   execute   │
│  (感知环境)  │    │  (检索记忆)  │    │  (执行动作)  │
└──────┬──────┘    └──────┬──────┘    └──────┬──────┘
       │                  │                  │
       ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────┐
│                  MemorySystem                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ 记忆流    │  │  反思    │  │ 三维度检索引擎    │  │
│  │(原始记录) │  │(高维洞察)│  │(相关+时效+重要)  │  │
│  └──────────┘  └──────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────┘
       ▲
       │
┌──────┴──────┐
│  LLMClient  │ ←── 调用 Kimi K2.5 API
│ (生成/嵌入)  │
└─────────────┘
```

---

## 🎯 核心概念回顾

### 生成式代理三大组件

1. **记忆流 (Memory Stream)** - 记录一切经历
2. **反思 (Reflection)** - 周期性总结形成洞察
3. **规划 (Planning)** - 基于反思制定行动计划

### 记忆检索三维度

```
得分 = 相关性(cosineSimilarity) × 时效性(recency衰减) × 重要性(importance)
```

### Agent决策流程

```
感知环境 → 检索相关记忆 → LLM生成决策 → 执行动作 → 记录到记忆
```

---

## 📚 参考

- 斯坦福论文：[Generative Agents: Interactive Simulacra of Human Behavior](https://arxiv.org/abs/2304.03442)
- a16z实现：[ai-town](https://github.com/a16z-infra/ai-town)
