import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parseMultipart, getFirstField, getFileFields } from "../middleware/multipart";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..", "..", "..");

/**
 * GET /api/sprites/list - List available sprite folders and portraits
 */
export async function handleSpriteList(
  req: http.IncomingMessage,
  res: http.ServerResponse
) {
  if (req.method !== "GET") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  try {
    const charsDir = path.join(projectRoot, "public", "assets", "characters");
    const portraitsDir = path.join(projectRoot, "public", "assets", "portraits");

    // List sprite folders (dirs with .png files inside)
    const sprites: { id: string; frameCount: number }[] = [];
    if (fs.existsSync(charsDir)) {
      for (const entry of fs.readdirSync(charsDir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          const dirPath = path.join(charsDir, entry.name);
          const frames = fs.readdirSync(dirPath).filter(f => f.endsWith(".png"));
          if (frames.length > 0) {
            sprites.push({ id: entry.name, frameCount: frames.length });
          }
        }
      }
    }

    // List portrait files
    const portraits: string[] = [];
    if (fs.existsSync(portraitsDir)) {
      for (const file of fs.readdirSync(portraitsDir)) {
        if (/\.(png|jpg|jpeg|webp)$/i.test(file)) {
          portraits.push(file);
        }
      }
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ sprites, portraits }));
  } catch (e: unknown) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: (e as Error).message }));
  }
}

/**
 * POST /api/sprites - Upload character sprite/portrait image
 * Fields: agentId, type (sprite|portrait), file
 */
export async function handleSprites(
  req: http.IncomingMessage,
  res: http.ServerResponse
) {
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  try {
    const fields = await parseMultipart(req);
    const agentId = getFirstField(fields, "agentId")?.value?.toString();
    const type = getFirstField(fields, "type")?.value?.toString();
    const fileField = getFirstField(fields, "file");

    if (!agentId || !type || !fileField || fileField.type !== "file") {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({ error: "Missing required fields: agentId, type, file" })
      );
      return;
    }

    // Sanitize agentId (only allow alphanumeric, dash, underscore)
    if (!/^[a-zA-Z0-9_-]+$/.test(agentId)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid agentId" }));
      return;
    }

    // Determine target directory
    const targetDir = type === "portrait"
      ? path.join(projectRoot, "public", "assets", "portraits")
      : path.join(projectRoot, "public", "assets", "characters");

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Get file extension from original filename or content-type
    let ext = ".png";
    const originalFilename = fileField.filename || "";
    const dotIdx = originalFilename.lastIndexOf(".");
    if (dotIdx > -1) ext = originalFilename.slice(dotIdx);

    const filename = `${agentId}${ext}`;
    const filepath = path.join(targetDir, filename);
    const relativePath = type === "portrait"
      ? `portraits/${filename}`
      : `characters/${filename}`;

    fs.writeFileSync(filepath, fileField.value as Buffer);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      message: "Sprite uploaded successfully",
      path: relativePath,
      filename,
    }));
  } catch (e: unknown) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: (e as Error).message }));
  }
}

/**
 * POST /api/sprites/config - Update asset-config.js with character entry
 * Body: { id, spriteId?, portraitFile? }
 */
export async function handleSpriteConfig(
  req: http.IncomingMessage,
  res: http.ServerResponse
) {
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  try {
    const body = await new Promise<string>((resolve) => {
      let data = "";
      req.on("data", (chunk: string) => (data += chunk));
      req.on("end", () => resolve(data));
    });

    const { id, spriteId, portraitFile } = JSON.parse(body);

    if (!id) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "id required" }));
      return;
    }

    // Determine sprite folder: use selected spriteId, or fall back to agent id
    const spriteFolder = spriteId || id;
    const charDir = path.join(projectRoot, "public", "assets", "characters", spriteFolder);
    const hasSprites = fs.existsSync(charDir) && fs.readdirSync(charDir).some(f => f.endsWith(".png"));

    // Determine portrait: use selected portraitFile, or default to {id}.png
    const portraitName = portraitFile || `${id}.png`;
    const portraitPath = path.join(projectRoot, "public", "assets", "portraits", portraitName);
    const hasPortrait = fs.existsSync(portraitPath);

    // Update asset-config.js
    const configPath = path.join(
      projectRoot,
      "public",
      "js",
      "assets",
      "asset-config.js"
    );

    let content = fs.readFileSync(configPath, "utf8");

    // Check if this character already exists in config
    const existsRegex = new RegExp(`\\s*${id}:\\s*\\{`, "m");
    if (!existsRegex.test(content)) {
      // Find insertion point: the closing "  }," of the characters object
      const closeMatch = content.match(/\n  \},\n\n/);
      if (!closeMatch || closeMatch.index === undefined) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Could not find insertion point" }));
        return;
      }
      const insertIdx = closeMatch.index + 1; // after the \n

      const entry = hasSprites
        ? `    ${id}: {
      sprite: "characters/${spriteFolder}.png",
      portrait: "portraits/${portraitName}",
      displaySize: [48, 48],
      animation: {
        basePath: "characters/${spriteFolder}/",
        frameSize: [48, 48],
        walkFrames: 6,
        idleFrames: 1,
      },
    },\n`
        : `    ${id}: {
      sprite: "characters/${id}.png",
      portrait: "portraits/${portraitName}",
      displaySize: [48, 48],
    },\n`;

      content = content.slice(0, insertIdx) + entry + content.slice(insertIdx);
      fs.writeFileSync(configPath, content);
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      message: "Asset config updated",
      hasSprites,
      hasPortrait,
      spriteFolder,
      portraitName,
    }));
  } catch (e: unknown) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: (e as Error).message }));
  }
}

/**
 * POST /api/sprites/batch - Upload multiple sprite frames (folder upload)
 * Fields: agentId, files (multiple)
 * Files should be named: {name}-{direction}-{action}-{frame}.png
 */
export async function handleSpritesBatch(
  req: http.IncomingMessage,
  res: http.ServerResponse
) {
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  try {
    const fields = await parseMultipart(req);
    const agentId = getFirstField(fields, "agentId")?.value?.toString();

    if (!agentId || !/^[a-zA-Z0-9_-]+$/.test(agentId)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid or missing agentId" }));
      return;
    }

    const files = getFileFields(fields, "files");
    if (files.length === 0) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "No files uploaded" }));
      return;
    }

    const charDir = path.join(
      projectRoot, "public", "assets", "characters", agentId
    );
    fs.mkdirSync(charDir, { recursive: true });

    const saved: string[] = [];
    for (const f of files) {
      const original = f.filename || `${agentId}.png`;
      // Rename: {oldName}-{direction}-{action}-{frame}.png -> {agentId}-{direction}-{action}-{frame}.png
      const match = original.match(/^(.+?)-(down|up|left|right)-(idle|walk)-(\d+\.png)$/i);
      const filename = match
        ? `${agentId}-${match[2]}-${match[3]}-${match[4]}`
        : original;
      fs.writeFileSync(path.join(charDir, filename), f.value as Buffer);
      saved.push(filename);
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      message: `${saved.length} frames uploaded`,
      agentId,
      dir: `characters/${agentId}/`,
      files: saved,
    }));
  } catch (e: unknown) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: (e as Error).message }));
  }
}
