import http from "http";
import { db } from "../db/connection";
import { readJsonBody } from "../middleware/json";

function safeParseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value.trim()) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export async function handleMap(
  req: http.IncomingMessage,
  res: http.ServerResponse,
) {
  const url = new URL(req.url!, "http://localhost");
  const pathname = url.pathname;

  // GET /api/map/areas - list all areas with cells
  if (pathname === "/api/map/areas" && req.method === "GET") {
    const areas = db
      .prepare(
        `
      SELECT a.id, a.name, a.is_blocked as isBlocked, a.services, a.metadata, a.created_at,
             JSON_GROUP_ARRAY(
               JSON_OBJECT('x', ac.x, 'y', ac.y)
             ) FILTER (WHERE ac.x IS NOT NULL) as cells
      FROM areas a
      LEFT JOIN area_cells ac ON a.id = ac.area_id
      GROUP BY a.id
      ORDER BY a.name
    `,
      )
      .all();
    const normalizedAreas = (areas as Array<Record<string, unknown>>).map(
      (area) => ({
        ...area,
        isBlocked: area.isBlocked ? 1 : 0,
        services: safeParseJson(area.services, []),
        metadata: safeParseJson(area.metadata, {}),
        cells: safeParseJson(area.cells, []),
      }),
    );
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(normalizedAreas));
    return;
  }

  // POST /api/map/areas - create or update an area
  if (pathname === "/api/map/areas" && req.method === "POST") {
    try {
      const body = (await readJsonBody(req)) as Record<string, unknown>;
      const {
        id,
        name,
        isBlocked = 0,
        services = null,
        metadata = null,
        cells = [],
      } = body;

      if (!id || !name) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "id and name are required" }));
        return;
      }

      const existing = db.prepare("SELECT id FROM areas WHERE id = ?").get(id);

      if (existing) {
        db.prepare(
          "UPDATE areas SET name = ?, is_blocked = ?, services = ?, metadata = ? WHERE id = ?",
        ).run(
          name,
          isBlocked ? 1 : 0,
          services ? JSON.stringify(services) : null,
          metadata ? JSON.stringify(metadata) : null,
          id,
        );
        db.prepare("DELETE FROM area_cells WHERE area_id = ?").run(id);
      } else {
        db.prepare(
          "INSERT INTO areas (id, name, is_blocked, services, metadata) VALUES (?, ?, ?, ?, ?)",
        ).run(
          id,
          name,
          isBlocked ? 1 : 0,
          services ? JSON.stringify(services) : null,
          metadata ? JSON.stringify(metadata) : null,
        );
      }

      // Insert cells
      if (Array.isArray(cells) && cells.length > 0) {
        const stmt = db.prepare(
          "INSERT OR REPLACE INTO area_cells (area_id, x, y) VALUES (?, ?, ?)",
        );
        const insertMany = db.transaction(
          (areaId: string, cellList: Array<{ x: number; y: number }>) => {
            for (const cell of cellList) {
              stmt.run(areaId, cell.x, cell.y);
            }
          },
        );
        insertMany(String(id), cells as Array<{ x: number; y: number }>);
      }

      const area = db.prepare("SELECT * FROM areas WHERE id = ?").get(id);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(area));
    } catch (e: unknown) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: (e as Error).message }));
    }
    return;
  }

  // PUT /api/map/areas - full area replacement (for editor save)
  if (pathname === "/api/map/areas" && req.method === "PUT") {
    try {
      const body = (await readJsonBody(req)) as Record<string, unknown>;
      const { areas } = body as {
        areas: Array<{
          id: string;
          name: string;
          isBlocked: number;
          services: unknown[];
          metadata?: Record<string, unknown>;
          cells: Array<{ x: number; y: number }>;
        }>;
      };

      if (!areas || !Array.isArray(areas)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "areas array required" }));
        return;
      }

      // Clear existing data
      db.exec("DELETE FROM area_cells");
      db.exec("DELETE FROM areas");

      const insertArea = db.prepare(
        "INSERT INTO areas (id, name, is_blocked, services, metadata) VALUES (?, ?, ?, ?, ?)",
      );
      const insertCell = db.prepare(
        "INSERT INTO area_cells (area_id, x, y) VALUES (?, ?, ?)",
      );

      const normalizeCells = (cells: unknown) => {
        if (!Array.isArray(cells)) return [];
        return cells
          .map((cell) => {
            const x = Number((cell as { x?: unknown })?.x);
            const y = Number((cell as { y?: unknown })?.y);
            if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
            return { x, y };
          })
          .filter((cell): cell is { x: number; y: number } => !!cell);
      };

      const transaction = db.transaction((areaList: typeof areas) => {
        for (const area of areaList) {
          const safeCells = normalizeCells(area.cells);
          insertArea.run(
            area.id,
            area.name,
            area.isBlocked ? 1 : 0,
            area.services ? JSON.stringify(area.services) : null,
            area.metadata ? JSON.stringify(area.metadata) : null,
          );
          if (safeCells.length > 0) {
            for (const cell of safeCells) {
              insertCell.run(area.id, cell.x, cell.y);
            }
          }
        }
      });
      transaction(areas);

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({ message: "Map replaced", areaCount: areas.length }),
      );
    } catch (e: unknown) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: (e as Error).message }));
    }
    return;
  }

  // DELETE /api/map/areas/:id
  if (pathname.startsWith("/api/map/areas/") && req.method === "DELETE") {
    const areaId = pathname.replace("/api/map/areas/", "");
    const existing = db
      .prepare("SELECT id FROM areas WHERE id = ?")
      .get(areaId);
    if (!existing) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Area not found" }));
      return;
    }
    db.prepare("DELETE FROM areas WHERE id = ?").run(areaId);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "Area deleted" }));
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not Found" }));
}
