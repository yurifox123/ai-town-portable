import http from "http";
import { db } from "../db/connection";
import { readJsonBody } from "../middleware/json";

export async function handleAgents(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  id?: string,
) {
  if (!id && req.method === "GET") {
    const agents = db
      .prepare(
        `
      SELECT id, name, age, traits, background, goals, occupation,
             personality, preferences, rules, custom_prompt, routine,
             position_x, position_y, status,
             health_current, health_max, green_points, fullness,
             facing_direction, created_at
      FROM agents
      ORDER BY created_at
    `,
      )
      .all();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(agents));
    return;
  }

  if (!id && req.method === "POST") {
    try {
      const body = (await readJsonBody(req)) as Record<string, unknown>;
      const {
        id: agentId,
        name,
        age,
        traits,
        background,
        goals = [],
        position_x = 0,
        position_y = 0,
        status = "idle",
        current_action = null,
        health_current = 100,
        health_max = 100,
        green_points = 10,
        fullness = 80,
        facing_direction = "down",
        last_sleep_time = 0,
        no_sleep_days = 0,
        occupation = "普通居民",
        personality = '{"social":0.5,"energy":0.5}',
        preferences = '{"places":[],"activities":[]}',
        rules = "[]",
        custom_prompt = "",
        routine = '{"wakeTime":7,"sleepTime":23}',
      } = body;

      if (!agentId || !name) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "id and name are required" }));
        return;
      }

      db.prepare(
        `
        INSERT INTO agents (id, name, age, traits, background, goals, occupation, personality, preferences, rules, custom_prompt, routine, position_x, position_y,
                           status, current_action, health_current, health_max, green_points,
                           fullness, facing_direction, last_sleep_time, no_sleep_days)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      ).run(
        agentId,
        name,
        age ?? 20,
        traits ?? "",
        background ?? "",
        JSON.stringify(goals),
        occupation,
        personality,
        preferences,
        rules,
        custom_prompt,
        routine,
        position_x,
        position_y,
        status,
        current_action ? JSON.stringify(current_action) : null,
        health_current,
        health_max,
        green_points,
        fullness,
        facing_direction,
        last_sleep_time,
        no_sleep_days,
      );

      const agent = db
        .prepare("SELECT * FROM agents WHERE id = ?")
        .get(agentId);
      res.writeHead(201, { "Content-Type": "application/json" });
      res.end(JSON.stringify(agent));
    } catch (e: unknown) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: (e as Error).message }));
    }
    return;
  }

  if (id && req.method === "GET") {
    const agent = db.prepare("SELECT * FROM agents WHERE id = ?").get(id);
    if (!agent) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Agent not found" }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(agent));
    return;
  }

  if (id && req.method === "PATCH") {
    try {
      const body = (await readJsonBody(req)) as Record<string, unknown>;
      const existing = db.prepare("SELECT id FROM agents WHERE id = ?").get(id);
      if (!existing) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Agent not found" }));
        return;
      }

      const allowed = [
        "name",
        "age",
        "position_x",
        "position_y",
        "status",
        "current_action",
        "health_current",
        "health_max",
        "green_points",
        "fullness",
        "facing_direction",
        "last_sleep_time",
        "no_sleep_days",
        "traits",
        "background",
        "goals",
        "occupation",
        "personality",
        "preferences",
        "rules",
        "custom_prompt",
        "routine",
      ];
      const jsonFields = new Set([
        "current_action",
        "goals",
        "personality",
        "preferences",
        "rules",
        "routine",
      ]);
      const updates: string[] = [];
      const values: unknown[] = [];
      for (const key of allowed) {
        if (key in body) {
          updates.push(`${key} = ?`);
          values.push(
            jsonFields.has(key)
              ? body[key]
                ? typeof body[key] === "string"
                  ? body[key]
                  : JSON.stringify(body[key])
                : null
              : body[key],
          );
        }
      }
      if (updates.length === 0) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "No valid fields to update" }));
        return;
      }
      updates.push("updated_at = datetime('now')");
      values.push(id);

      db.prepare(`UPDATE agents SET ${updates.join(", ")} WHERE id = ?`).run(
        ...values,
      );
      const updated = db.prepare("SELECT * FROM agents WHERE id = ?").get(id);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(updated));
    } catch (e: unknown) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: (e as Error).message }));
    }
    return;
  }

  if (id && req.method === "DELETE") {
    const existing = db.prepare("SELECT id FROM agents WHERE id = ?").get(id);
    if (!existing) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Agent not found" }));
      return;
    }
    db.prepare("DELETE FROM agents WHERE id = ?").run(id);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "Agent deleted" }));
    return;
  }

  res.writeHead(405, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Method not allowed" }));
}
