import http from "http";
import { db } from "../db/connection";
import { readJsonBody } from "../middleware/json";

export async function handleReflections(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  agentId: string
) {
  if (req.method === "GET") {
    const reflections = db.prepare(`
      SELECT r.*,
             GROUP_CONCAT(rs.memory_id) as source_memory_ids
      FROM reflections r
      LEFT JOIN reflection_sources rs ON r.id = rs.reflection_id
      WHERE r.agent_id = ?
      GROUP BY r.id
      ORDER BY r.timestamp DESC
    `).all(agentId);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(reflections));
    return;
  }

  if (req.method === "POST") {
    try {
      const body = await readJsonBody(req) as Record<string, unknown>;
      const { id: refId, content, timestamp, sourceMemories = [] } = body;

      if (!refId || !content) {
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
        INSERT INTO reflections (id, agent_id, content, timestamp)
        VALUES (?, ?, ?, ?)
      `).run(refId, agentId, content, timestamp);

      for (const memoryId of (sourceMemories as string[])) {
        db.prepare(
          "INSERT OR IGNORE INTO reflection_sources (reflection_id, memory_id) VALUES (?, ?)"
        ).run(refId, memoryId);
      }

      const reflection = db.prepare("SELECT * FROM reflections WHERE id = ?").get(refId);
      res.writeHead(201, { "Content-Type": "application/json" });
      res.end(JSON.stringify(reflection));
    } catch (e: unknown) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: (e as Error).message }));
    }
    return;
  }

  res.writeHead(405, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Method not allowed" }));
}
