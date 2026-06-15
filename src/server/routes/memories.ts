import http from "http";
import { db } from "../db/connection";
import { readJsonBody } from "../middleware/json";

export async function handleMemories(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  agentId: string,
  memoryId?: string
) {
  // List memories for an agent
  if (!memoryId && req.method === "GET") {
    const url = new URL(req.url!, "http://localhost");
    const type = url.searchParams.get("type");
    const limit = parseInt(url.searchParams.get("limit") || "50", 10);
    const offset = parseInt(url.searchParams.get("offset") || "0", 10);

    let query = `
      SELECT m.*,
             CASE WHEN e.vector IS NOT NULL THEN 1 ELSE 0 END as has_embedding
      FROM memories m
      LEFT JOIN embeddings e ON m.id = e.memory_id
      WHERE m.agent_id = ?
    `;
    const params: unknown[] = [agentId];

    if (type) {
      query += " AND m.type = ?";
      params.push(type);
    }
    query += " ORDER BY m.timestamp DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const memories = db.prepare(query).all(...params);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(memories));
    return;
  }

  // Add a memory for an agent
  if (!memoryId && req.method === "POST") {
    try {
      const body = await readJsonBody(req) as Record<string, unknown>;
      const {
        id: memId, content, timestamp, importance = 5,
        type = "OBSERVATION", embedding = null,
        metadata = null,
      } = body;

      if (!memId || !content) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "id and content are required" }));
        return;
      }

      const agent = db.prepare("SELECT id FROM agents WHERE id = ?").get(agentId);
      if (!agent) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Agent not found" }));
        return;
      }

      db.prepare(`
        INSERT INTO memories (id, agent_id, content, timestamp, importance, type, last_accessed, access_count, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
      `).run(memId, agentId, content, timestamp, importance, type, timestamp, metadata ? JSON.stringify(metadata) : null);

      // Store embedding if provided
      if (embedding) {
        const buffer = embedding instanceof Uint8Array
          ? embedding
          : encodingToBuffer(embedding);
        db.prepare("INSERT INTO embeddings (memory_id, vector) VALUES (?, ?)").run(memId, buffer);
      }

      const memory = db.prepare("SELECT * FROM memories WHERE id = ?").get(memId);
      res.writeHead(201, { "Content-Type": "application/json" });
      res.end(JSON.stringify(memory));
    } catch (e: unknown) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: (e as Error).message }));
    }
    return;
  }

  // Delete a memory
  if (memoryId && req.method === "DELETE") {
    const existing = db.prepare("SELECT id FROM memories WHERE id = ? AND agent_id = ?").get(memoryId, agentId);
    if (!existing) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Memory not found" }));
      return;
    }
    db.prepare("DELETE FROM memories WHERE id = ?").run(memoryId);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "Memory deleted" }));
    return;
  }

  res.writeHead(405, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Method not allowed" }));
}

function encodingToBuffer(data: unknown): Buffer {
  // Accept JSON array of numbers, Float64Array, or base64 string
  if (Array.isArray(data)) {
    return Buffer.from(new Float64Array(data).buffer);
  }
  if (typeof data === "string") {
    return Buffer.from(data, "base64");
  }
  // If it's already a buffer-like object
  if (typeof data === "object" && data !== null && "buffer" in data) {
    return Buffer.from((data as { buffer: ArrayBuffer }).buffer);
  }
  throw new Error("Invalid embedding format: expected array, base64 string, or Float64Array");
}
