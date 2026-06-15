import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

// Initialize database (side effects: creates tables)
import "./db/connection";
import "./db/schema";

import {
  handleLlmChat,
  handleLlmConfig,
  handleLlmConfigTest,
  handleLlmEmbedding,
} from "./routes/llm";
import { handleAgents } from "./routes/agents";
import { handleMemories } from "./routes/memories";
import { handleReflections } from "./routes/reflections";
import { handleMap } from "./routes/map";
import { handleState } from "./routes/state";
import {
  handleSprites,
  handleSpriteConfig,
  handleSpritesBatch,
  handleSpriteList,
} from "./routes/sprites";
import { getStaticContentType, resolvePublicFile } from "./static";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve public/ relative to project root (src/server/ -> public/)
const publicDir = path.resolve(__dirname, "..", "..", "public");

const PORT = process.env.PORT || 3061;

// Server reference (module-level for /api/stop access)
let serverRef: http.Server | null = null;

// Track active connections for force-close
const sockets = new Set<import("net").Socket>();

// Route matching: return { handler, params } or null
function matchRoute(url: string, method: string) {
  const pathname = new URL(url, "http://localhost").pathname;

  // LLM endpoints
  if (pathname === "/api/llm/config" && (method === "GET" || method === "PUT"))
    return { handler: "llm-config" };
  if (pathname === "/api/llm/config/test" && method === "POST")
    return { handler: "llm-config-test" };
  if (pathname === "/api/llm/chat" && method === "POST")
    return { handler: "llm-chat" };
  if (pathname === "/api/llm/embedding" && method === "POST")
    return { handler: "llm-embedding" };
  if (pathname === "/api/stop" && method === "POST") return { handler: "stop" };
  if (pathname === "/api/sprites/config" && method === "POST")
    return { handler: "sprite-config" };
  if (pathname === "/api/sprites/batch" && method === "POST")
    return { handler: "sprites-batch" };
  if (pathname === "/api/sprites/list" && method === "GET")
    return { handler: "sprite-list" };
  if (pathname === "/api/sprites" && method === "POST")
    return { handler: "sprites" };

  // Agent endpoints: /api/agents or /api/agents/:id
  if (pathname.startsWith("/api/agents/")) {
    const parts = pathname.split("/");
    // /api/agents/:id/memories
    if (parts.length === 5 && parts[4] === "memories") {
      return { handler: "memories", agentId: parts[3] };
    }
    // /api/agents/:id/memories/:memoryId
    if (parts.length === 6 && parts[4] === "memories") {
      return { handler: "memory", agentId: parts[3], memoryId: parts[5] };
    }
    // /api/agents/:id/reflections
    if (parts.length === 5 && parts[4] === "reflections") {
      return { handler: "reflections", agentId: parts[3] };
    }
    // /api/agents/:id
    return { handler: "agent", id: parts[3] };
  }
  if (pathname === "/api/agents") return { handler: "agents" };

  // Map endpoints
  if (pathname.startsWith("/api/map/")) {
    return { handler: "map" };
  }

  // State endpoints
  if (pathname === "/api/state") return { handler: "state" };
  if (pathname === "/api/state/snapshot")
    return { handler: "state", subPath: "snapshot" };
  if (pathname === "/api/state/snapshots")
    return { handler: "state", subPath: "snapshots" };

  return null;
}

/**
 * Graceful shutdown with force-close fallback
 */
function shutdownServer() {
  if (!serverRef) {
    process.exit(0);
    return;
  }

  // Phase 1: Stop accepting new connections, wait for existing ones to finish
  serverRef.close(() => {
    process.exit(0);
  });

  // Phase 2: Force-destroy all remaining sockets after timeout
  setTimeout(() => {
    console.log("⚠️ 优雅关闭超时，强制释放端口...");
    for (const socket of sockets) {
      socket.destroy();
    }
    process.exit(0);
  }, 3000);
}

/**
 * Route request to appropriate handler
 */
async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
) {
  const url = req.url!;
  const method = req.method!;

  // API routing
  const route = matchRoute(url, method);
  if (route) {
    res.setHeader("Content-Type", "application/json");

    switch (route.handler) {
      case "llm-chat":
        return handleLlmChat(req, res);
      case "llm-config":
        return handleLlmConfig(req, res);
      case "llm-config-test":
        return handleLlmConfigTest(req, res);
      case "llm-embedding":
        return handleLlmEmbedding(req, res);
      case "stop":
        console.log("\n👋 收到停止请求，正在关闭服务器...");
        res.writeHead(200);
        res.end(JSON.stringify({ message: "服务器已关闭" }));
        shutdownServer();
        return;
      case "agents":
        return handleAgents(req, res);
      case "agent":
        return handleAgents(req, res, route.id as string);
      case "memories":
        return handleMemories(req, res, route.agentId as string);
      case "memory":
        return handleMemories(
          req,
          res,
          route.agentId as string,
          route.memoryId as string,
        );
      case "reflections":
        return handleReflections(req, res, route.agentId as string);
      case "map":
        return handleMap(req, res);
      case "state":
        return handleState(req, res, route.subPath as string | undefined);
      case "sprites":
        return handleSprites(req, res);
      case "sprite-config":
        return handleSpriteConfig(req, res);
      case "sprites-batch":
        return handleSpritesBatch(req, res);
      case "sprite-list":
        return handleSpriteList(req, res);
    }
  }

  // Static file serving
  const fullPath = resolvePublicFile(publicDir, url);
  if (!fullPath) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const data = await fs.promises.readFile(fullPath);
    const contentType = getStaticContentType(fullPath);

    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      res.writeHead(404);
      res.end("Not Found");
    } else {
      res.writeHead(500);
      res.end("Internal Server Error");
    }
  }
}

/**
 * Start server with auto port increment
 */
async function main() {
  if (!process.env.CUSTOM_API_KEY) {
    console.warn("⚠️ 未检测到 CUSTOM_API_KEY，LLM 功能在配置前将不可用");
    console.warn("可在 .env 中设置，或启动后通过浏览器里的 LLM 配置面板填写");
  }

  let currentPort = Number(PORT);
  let started = false;

  while (!started) {
    try {
      await new Promise((resolve, reject) => {
        serverRef = http.createServer(handleRequest);

        // Track connections for force-close
        serverRef.on("connection", (socket) => {
          sockets.add(socket);
          socket.on("close", () => sockets.delete(socket));
        });

        serverRef.listen(currentPort, () => {
          console.log("\n🌐 AI生态小镇服务器已启动");
          console.log(`   访问地址: http://localhost:${currentPort}`);
          console.log(`   LLM模型: ${process.env.CUSTOM_MODEL || "kimi-k2.5"}`);
          console.log(`   数据库: ${process.env.DB_PATH || "data/ai-town.db"}`);
          console.log("");
          started = true;

          process.on("SIGINT", () => {
            console.log("\n👋 正在关闭服务器...");
            shutdownServer();
          });

          resolve(true);
        });

        serverRef.on("error", (err: NodeJS.ErrnoException) => {
          if (err.code === "EACCES" || err.code === "EADDRINUSE") {
            console.log(`⚠️ 端口 ${currentPort} 不可用，尝试下一个端口...`);
            serverRef!.close();
            currentPort++;
            reject(err);
          } else {
            reject(err);
          }
        });
      });
    } catch {
      // continue to next port
    }
  }
}

main().catch(console.error);
