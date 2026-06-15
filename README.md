# AI 生态小镇

AI 生态小镇是一个基于 Stanford《Generative Agents》论文思路实现的多智能体模拟项目。居民以自主 Agent 的形式生活在一个 2D 小镇中，拥有记忆、反思、规划、移动、对话和生存需求；整个模拟过程在浏览器中运行，Node.js 服务器负责静态资源、SQLite 持久化和 LLM 代理。

## 项目介绍

AI 生态小镇不是一个单纯的“聊天机器人集合”，而是一个可运行、可观察、可扩展的多智能体社会实验场。项目将记忆系统、反思机制、行为规划、生存压力、资源循环和环境污染统一到同一个 2D 世界里，让每个 Agent 都不只是回答问题，而是在一个持续演化的小镇中“生活”。

在这个世界里，居民会感知周围环境、检索记忆、生成判断、选择行动，并在工作、进食、休息、社交、清理污染和推动城镇发展之间不断权衡。你看到的不是一段静态演示，而是一套能持续推进的动态生态：角色之间会形成不同的行为倾向，建筑会随着资源积累升级，污染会改变整个小镇的生存压力，而世界状态又会反过来影响每个 Agent 的决策。

从展示效果上看，它兼具“可玩性”和“可讲述性”：浏览器中可以实时看到居民移动、对话、工作、饥饿、休息和环境变化；从研究和产品视角看，它又提供了一个非常适合验证 Agent 行为、提示词设计、长期记忆机制和社会型模拟交互的实验底座。

这个项目尤其适合用于以下场景：

- AI Agent 产品演示：把“智能体”从对话框拉回到一个可观察、可解释的世界里。
- 多智能体研究与原型验证：测试记忆检索、规划链路、角色设定和环境反馈。
- 互动式展览或教学：用可视化方式展示生成式智能体如何在复杂系统中协作与失衡。
- 世界观型应用孵化：在游戏化小镇中探索 AI 居民、生态治理、资源经济和叙事体验的结合。

## 当前状态

- 当前项目是 **Web-First 架构**，主入口是浏览器界面，不是旧版 CLI 模拟器。
- `ARCHITECTURE.md` 仍然存在，但内容已过时；请以本 README、`AGENTS.md` / `CLAUDE.md` 和源码为准。
- 推荐使用 `npm` 脚本启动项目；Windows 下也可以直接使用仓库内的 `start.bat` 打开常用菜单。

## 核心特性

- 自主 Agent：每个居民都有性格、背景、目标、记忆和当前行动。
- 三层记忆系统：观察、反思、计划共同驱动决策。
- 浏览器内模拟：Canvas 实时渲染小镇、居民状态、事件和地图。
- 生存与经济系统：健康、饱腹、绿色积分、工作、消费、睡眠。
- 全局生态系统：污染、知识、科技、物资、粮食等城镇资源共同推进演化。
- 地图与资源编辑：主界面内置地图编辑模式，并提供额外的精灵裁剪和动画测试工具页。
- 快照存档：支持完整保存和加载一整个小镇世界状态。
- LLM 代理配置：当前运行时以 `custom` 兼容接口为主，支持在浏览器中直接测试和保存配置。

## 技术栈

- 前端：Vanilla JavaScript（ES Modules）+ Canvas
- 后端：Node.js + TypeScript + 原生 `http.createServer`
- 数据库：SQLite（`better-sqlite3`）
- 资源管理：本地静态资源 + 精灵配置
- 测试现状：安装了 `vitest`，但暂时没有正式测试用例

## 架构总览

项目分为 3 个主要层次：

1. `src/server/`
   负责 HTTP 服务、LLM 代理、SQLite 读写、地图和快照 API。
2. `public/js/`
   负责浏览器端模拟逻辑，包括 Agent、世界模拟器、记忆系统、寻路、提示词和 UI。
3. `public/assets/`
   负责地图、建筑、人物精灵和头像素材。

核心调用链大致如下：

```text
public/js/app/app.js
  -> public/js/core/simulator.js
    -> public/js/core/agent.js
      -> public/js/core/memory.js
      -> public/js/core/pathfinder.js
      -> public/js/core/personality.js
      -> public/js/core/prompts.js
      -> public/js/core/game-config.js
```

## 快速开始

### 1. 安装依赖

```bash
npm ci
```

项目提交了 `package-lock.json`，新电脑或干净环境建议优先使用 `npm ci`，这样依赖版本与当前开发环境一致。

GitHub 仓库不会包含 `node_modules/`。如果你是下载源码 zip 或 clone 新仓库，第一次运行前必须先执行这一条；否则启动时会看到 `'tsx' 不是内部或外部命令` 这类报错。

### 2. 启动项目

```bash
npm start
```

首次启动时如果还没有 `node_modules/`，`npm start` 会先自动执行 `npm ci` 安装依赖。
如果自动安装因为网络失败中断，手动重新执行 `npm ci` 后再运行 `npm start`。

`npm start` 也会自动初始化运行时目录，创建 `data/`、`data/saves/`、`data/chroma/`，并在缺少 `.env` 时从 `.env.example` 生成一份。

默认端口是 `3061`。如果端口已被占用，服务器会自动尝试下一个可用端口。

启动后访问：

```text
http://localhost:3061
```

### 3. 配置 LLM，然后重启服务

第一次启动后，先不要直接开始模拟。请先在网页右侧的 **LLM 配置** 面板里填写、保存并测试配置。当前实现以 `custom` 兼容接口为主，默认模型是 Kimi K2.5。

常用配置项：

```env
LLM_PROVIDER=custom
CUSTOM_API_KEY=your-api-key
CUSTOM_MODEL=kimi-k2.5
CUSTOM_ENDPOINT=https://coding.dashscope.aliyuncs.com/apps/anthropic/v1/messages
CUSTOM_RESPONSE_PATH=content[1].text
CUSTOM_API_KEY_HEADER=x-api-key
```

保存并测试 LLM 配置后，关闭当前服务，再重新启动。这样后端会重新读取 `.env` 和持久化配置：

```bash
npm run stop
npm start
```

也可以在启动窗口按 `Ctrl+C` 关闭，然后重新执行 `npm start`。

### 4. 可选：手动初始化或自检

```bash
npm run setup
npm run doctor
```

### 5. 常用脚本

```bash
# 初始化运行时目录和 .env
npm run setup

# 检查当前电脑是否具备运行条件
npm run doctor

# 开发模式（tsx watch）
npm run dev

# 类型检查 / lint
npm run lint

# 构建 TypeScript
npm run build

# 运行测试（当前仅 passWithNoTests）
npm test

# 停止默认 3061 端口服务
npm run stop
```

## LLM 配置

当前运行时通过 `/api/llm/chat` 代理请求，实际实现走 `custom` provider，并把目标接口视为兼容 Anthropic / OpenAI 风格的聊天端点。

关键点如下：

- 默认 endpoint：DashScope Anthropic 兼容接口
- 默认 model：`kimi-k2.5`
- 默认 response path：`content[1].text`
- 已保存的 API Key 不会回显到浏览器；在配置面板里把密钥输入框留空表示保持原值。

浏览器内也提供了 LLM 配置面板，可以直接读取、测试和保存配置。

## 游戏机制速览

### Agent 生命周期

```text
initialize -> perceive -> decide -> executeAction -> loop
```

### 记忆检索

记忆检索使用三维加权评分：

```text
score = relevance * 0.6 + recency * 0.2 + importance * 0.2
```

### 生存属性

- Health：受饥饿、睡眠、污染和活动影响
- Fullness：随时间、移动、工作持续下降
- Green Points：工作获得，消费支出

### 城镇全局系统

- Pollution：污染达到上限会触发坏结局
- World Resources：
  - `techTheory`
  - `techProduction`
  - `materialValue`
  - `knowledgeReserve`
  - `foodStock`
- Building Levels：建筑会随着资源积累升级，影响收益、污染和服务效果

### 地图与移动

- 移动与模拟 tick 解耦
- 使用 A* 寻路
- 支持墙、河流、围栏、桥、门等通行规则

## 主要功能入口

- 主模拟界面：`/`
- 精灵裁剪工具：`/sprite-crop-tool.html`
- 动画测试工具：`/anim-test.html`
- 地图编辑：主界面内置编辑模式

## API 概览

### LLM

- `GET/PUT /api/llm/config`
- `POST /api/llm/config/test`
- `POST /api/llm/chat`
- `POST /api/llm/embedding`

### Agents

- `GET/POST /api/agents`
- `GET/PATCH/DELETE /api/agents/:id`
- `GET/POST /api/agents/:id/memories`
- `DELETE /api/agents/:id/memories/:memoryId`
- `GET/POST /api/agents/:id/reflections`

### Map / State / Sprites

- `GET/POST/PUT /api/map/areas`
- `DELETE /api/map/areas/:id`
- `GET/PUT /api/state`
- `POST /api/state/snapshot`
- `GET /api/state/snapshot`
- `GET /api/state/snapshots`
- `GET /api/sprites/list`
- `POST /api/sprites`
- `POST /api/sprites/batch`
- `POST /api/sprites/config`
- `POST /api/stop`

## 目录结构

```text
ai-town/
├─ src/
│  └─ server/
│     ├─ index.ts
│     ├─ db/
│     │  ├─ connection.ts
│     │  └─ schema.ts
│     ├─ middleware/
│     │  ├─ json.ts
│     │  └─ multipart.ts
│     └─ routes/
│        ├─ agents.ts
│        ├─ llm.ts
│        ├─ map.ts
│        ├─ memories.ts
│        ├─ reflections.ts
│        ├─ sprites.ts
│        └─ state.ts
├─ public/
│  ├─ index.html
│  ├─ styles.css
│  ├─ sprite-crop-tool.html
│  ├─ anim-test.html
│  ├─ building-editor.html
│  ├─ assets/
│  ├─ css/
│  └─ js/
│     ├─ app/
│     ├─ assets/
│     ├─ core/
│     ├─ editor/
│     └─ tools/
├─ data/
│  ├─ ai-town.db
│  └─ saves/
├─ AGENTS.md
├─ CLAUDE.md
├─ ARCHITECTURE.md
├─ package.json
└─ tsconfig.json
```

## 仓库说明

- `data/` 是运行时数据目录，包含 SQLite 数据库和快照文件。
- `dist/` 是 TypeScript 构建产物，不参与开发时的主运行链路。
- `package-lock.json` 必须提交，用于保证不同电脑安装到同一批依赖版本。
- `docs/` 不包含在这个便携仓库里，避免把额外设计文档混进发布包。

## 换电脑运行

把项目目录复制到另一台电脑后，必须确认这些外部条件：

- **Node.js**：需要先安装 Node.js 和 npm；推荐 Node.js 22 LTS。仓库包含 `.nvmrc`，使用 nvm 时可执行 `nvm use`。
- **依赖包**：`node_modules/` 不需要手动复制，在新电脑进入项目目录后执行 `npm ci`。
- **项目自检**：安装依赖后执行 `npm run setup` 和 `npm run doctor`。`doctor` 会检查 Node/npm、lockfile、关键依赖、素材文件、运行时目录和 LLM 配置状态。
- **LLM 密钥**：`.env` 不会提交到仓库，`npm run setup` 会自动从 `.env.example` 创建 `.env`，但你仍需要填入自己的 `CUSTOM_API_KEY`。
- **数据库与存档**：`data/` 是运行时目录；不复制也能启动，系统会自动创建 `data/ai-town.db` 和 `data/saves/`。如果要带走旧存档，需要单独复制 `data/ai-town.db`、`data/ai-town.db-wal`、`data/ai-town.db-shm` 和 `data/saves/`。
- **素材文件**：`public/assets/` 已随项目提交，正常复制仓库即可显示默认地图、头像和精灵。
- **浏览器**：日常运行只需要普通浏览器访问 `http://localhost:3061`；只有运行 Playwright 自动化测试时才需要 Playwright 浏览器运行时。

## 已知历史残留

- `ARCHITECTURE.md` 仍在描述旧架构，不适合作为当前实现说明。
- `start.bat` / `stop.bat` 属于旧的 Windows 包装脚本，优先使用 `npm` 脚本。
- 仓库中仍有一些辅助页和实验工具页，主流程请以 `public/index.html` 对应的浏览器入口为准。

## License

MIT
