import http from "http";
import fs from "fs";
import path from "path";
import { db } from "../db/connection";
import { readJsonBody } from "../middleware/json";

const savesDir = path.resolve(process.cwd(), "data", "saves");
const latestSnapshotPath = path.join(savesDir, "latest-town-snapshot.json");
const latestSnapshotTempPath = path.join(savesDir, "latest-town-snapshot.json.tmp");

function ensureSavesDir() {
  if (!fs.existsSync(savesDir)) {
    fs.mkdirSync(savesDir, { recursive: true });
  }
}

function safeParseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value.trim()) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function normalizeSnapshotName(snapshotName: unknown) {
  if (typeof snapshotName === "string" && snapshotName.trim()) {
    return snapshotName.trim().replace(/[\\/:*?"<>|]/g, "_");
  }
  return "latest-town-snapshot";
}

function getSnapshotPath(snapshotName: string) {
  return path.join(savesDir, `${normalizeSnapshotName(snapshotName)}.json`);
}

function getSnapshotTempPath(snapshotName: string) {
  return `${getSnapshotPath(snapshotName)}.tmp`;
}

function writeSnapshotAtomically(
  snapshotPayload: Record<string, unknown>,
  snapshotName: string,
) {
  const text = JSON.stringify(snapshotPayload, null, 2);
  const targetPath = getSnapshotPath(snapshotName);
  const tempPath = getSnapshotTempPath(snapshotName);
  fs.writeFileSync(tempPath, text, "utf8");
  fs.renameSync(tempPath, targetPath);
}

function readSnapshotFile(snapshotName: string) {
  const snapshotPath = getSnapshotPath(snapshotName);
  if (!fs.existsSync(snapshotPath)) return null;
  const snapshotText = fs.readFileSync(snapshotPath, "utf8");
  return JSON.parse(snapshotText) as Record<string, unknown>;
}

function listSnapshots() {
  ensureSavesDir();
  return fs
    .readdirSync(savesDir)
    .filter((fileName) => fileName.endsWith(".json"))
    .filter((fileName) => fileName !== path.basename(latestSnapshotPath))
    .map((fileName) => {
      const fullPath = path.join(savesDir, fileName);
      const stat = fs.statSync(fullPath);
      const snapshotName = fileName.replace(/\.json$/i, "");
      let savedAt = stat.mtime.toISOString();
      try {
        const parsed = JSON.parse(
          fs.readFileSync(fullPath, "utf8"),
        ) as Record<string, unknown>;
        if (typeof parsed.savedAt === "string" && parsed.savedAt) {
          savedAt = parsed.savedAt;
        }
      } catch {
        // Keep filesystem mtime fallback.
      }
      return {
        snapshotName,
        savedAt,
        fileName,
      };
    })
    .sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
}

function deleteFileIfExists(filePath: string) {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

function tryReadSnapshotFile(snapshotName: string) {
  try {
    return readSnapshotFile(snapshotName);
  } catch {
    return null;
  }
}

function deleteSnapshotFiles(snapshotName: string) {
  ensureSavesDir();
  const normalizedSnapshotName = normalizeSnapshotName(snapshotName);
  const removingLatestAliasDirectly =
    normalizedSnapshotName === "latest-town-snapshot";
  const latestSnapshot = removingLatestAliasDirectly
    ? null
    : tryReadSnapshotFile("latest-town-snapshot");
  const latestAliasMatchesTarget =
    !!latestSnapshot &&
    normalizeSnapshotName(latestSnapshot.snapshotName) ===
      normalizedSnapshotName;

  const filesToDelete = [
    getSnapshotPath(normalizedSnapshotName),
    getSnapshotTempPath(normalizedSnapshotName),
    ...(removingLatestAliasDirectly || latestAliasMatchesTarget
      ? [latestSnapshotPath, latestSnapshotTempPath]
      : []),
  ].filter((filePath, index, allPaths) => allPaths.indexOf(filePath) === index);

  const hasExistingFile = filesToDelete.some((filePath) => fs.existsSync(filePath));
  if (!hasExistingFile) {
    return {
      deleted: false,
      snapshotName: normalizedSnapshotName,
      removedLatestAlias: false,
    };
  }

  filesToDelete.forEach(deleteFileIfExists);

  return {
    deleted: true,
    snapshotName: normalizedSnapshotName,
    removedLatestAlias:
      removingLatestAliasDirectly || latestAliasMatchesTarget,
  };
}

function buildDatabaseFallbackSnapshot() {
  const state = db
    .prepare("SELECT * FROM simulation_state WHERE id = 1")
    .get() as Record<string, unknown> | undefined;
  const agents = db.prepare("SELECT * FROM agents").all();
  const dialogues = db
    .prepare(
      `
      SELECT *
      FROM dialogues
      ORDER BY timestamp ASC
    `,
    )
    .all();
  const memories = db
    .prepare(
      `
      SELECT m.*
      FROM memories m
      ORDER BY m.timestamp ASC
    `,
    )
    .all();
  const reflections = db
    .prepare(
      `
      SELECT r.*,
             COALESCE(
               JSON_GROUP_ARRAY(rs.memory_id) FILTER (WHERE rs.memory_id IS NOT NULL),
               '[]'
             ) as source_memory_ids
      FROM reflections r
      LEFT JOIN reflection_sources rs ON rs.reflection_id = r.id
      GROUP BY r.id
      ORDER BY r.timestamp ASC
    `,
    )
    .all();
  const areas = db
    .prepare(
      `
      SELECT a.id, a.name, a.is_blocked, a.services, a.metadata,
             JSON_GROUP_ARRAY(JSON_OBJECT('x', ac.x, 'y', ac.y))
               FILTER (WHERE ac.x IS NOT NULL) as cells
      FROM areas a
      LEFT JOIN area_cells ac ON a.id = ac.area_id
      GROUP BY a.id
    `,
    )
    .all();

  return {
    version: 2,
    savedAt: new Date().toISOString(),
    snapshotName: "database-fallback-snapshot",
    difficulty:
      typeof state?.difficulty === "string" && state.difficulty
        ? state.difficulty
        : "normal",
    state,
    worldResources: safeParseJson(state?.world_resources, {}),
    events: safeParseJson(state?.recent_events, []),
    agents: (agents as Array<Record<string, unknown>>).map((agent) => ({
      ...agent,
      backpack: safeParseJson(agent.backpack, []),
      decision_history: safeParseJson(agent.decision_history, []),
      current_plan: safeParseJson(agent.current_plan, null),
      last_conversation: safeParseJson(agent.last_conversation, []),
    })),
    dialogues,
    memories,
    reflections: (reflections as Array<Record<string, unknown>>).map(
      (reflection) => ({
        ...reflection,
        source_memory_ids: reflection.source_memory_ids
          ? JSON.parse(reflection.source_memory_ids as string)
          : [],
      }),
    ),
    areas: (areas as Array<Record<string, unknown>>).map((area) => ({
      ...area,
      isBlocked: !!area.is_blocked,
      services: area.services ? JSON.parse(area.services as string) : [],
      metadata: safeParseJson(area.metadata, {}),
      cells: area.cells ? JSON.parse(area.cells as string) : [],
    })),
  };
}

export async function handleState(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  subPath?: string,
) {
  const url = new URL(req.url!, "http://localhost");
  const pathname = url.pathname;

  // GET /api/state - read current state
  if (pathname === "/api/state" && req.method === "GET") {
    const state = db
      .prepare("SELECT * FROM simulation_state WHERE id = 1")
      .get();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(state));
    return;
  }

  // PUT /api/state - update simulation state
  if (pathname === "/api/state" && req.method === "PUT") {
    try {
      const body = (await readJsonBody(req)) as Record<string, unknown>;
      const allowed = [
        "tick_count",
        "game_time",
        "town_health_current",
        "town_health_max",
        "time_scale",
        "tile_size",
        "image_width",
        "image_height",
        "pollution",
      ];
      const updates: string[] = [];
      const values: unknown[] = [];
      for (const key of allowed) {
        if (key in body) {
          updates.push(`${key} = ?`);
          values.push(body[key]);
        }
      }
      if (updates.length > 0) {
        updates.push("updated_at = datetime('now')");
        values.push(1);
        db.prepare(
          `UPDATE simulation_state SET ${updates.join(", ")} WHERE id = ?`,
        ).run(...values);
      }

      const state = db
        .prepare("SELECT * FROM simulation_state WHERE id = 1")
        .get();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(state));
    } catch (e: unknown) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: (e as Error).message }));
    }
    return;
  }

  // POST /api/state/snapshot - full world save
  if (subPath === "snapshot" && req.method === "POST") {
    try {
      ensureSavesDir();
      const body = (await readJsonBody(req)) as Record<string, unknown>;
      const {
        agents,
        memories,
        reflections,
        dialogues,
        areas,
        state: simState,
        difficulty,
        gameConfigDraft,
        worldResources,
        events,
        randomEventState,
        snapshotName,
      } = body as {
        agents: Array<Record<string, unknown>>;
        memories: Array<Record<string, unknown>>;
        reflections: Array<Record<string, unknown>>;
        dialogues?: Array<Record<string, unknown>>;
        areas: Array<Record<string, unknown>>;
        state: Record<string, unknown>;
        difficulty?: string;
        gameConfigDraft?: Record<string, unknown>;
        worldResources?: Record<string, unknown>;
        events?: Array<Record<string, unknown>>;
        randomEventState?: Record<string, unknown> | null;
        snapshotName?: string;
      };
      const normalizedSnapshotName = normalizeSnapshotName(snapshotName);
      const normalizedDifficulty =
        typeof difficulty === "string" && difficulty.trim()
          ? difficulty.trim()
          : "normal";
      const normalizedWorldResources =
        worldResources && typeof worldResources === "object"
          ? worldResources
          : {};
      const normalizedGameConfigDraft =
        gameConfigDraft && typeof gameConfigDraft === "object"
          ? gameConfigDraft
          : {};
      const normalizedEvents = Array.isArray(events) ? events : [];

      const transaction = db.transaction(() => {
        db.exec("DELETE FROM reflection_sources");
        db.exec("DELETE FROM reflections");
        db.exec("DELETE FROM embeddings");
        db.exec("DELETE FROM memories");
        db.exec("DELETE FROM dialogues");
        db.exec("DELETE FROM agents");

        // Clear and reinsert
        if (areas) {
          db.exec("DELETE FROM area_cells");
          db.exec("DELETE FROM areas");
          for (const area of areas) {
            db.prepare(
              "INSERT INTO areas (id, name, is_blocked, services, metadata) VALUES (?, ?, ?, ?, ?)",
            ).run(
              area.id,
              area.name,
              area.isBlocked ? 1 : 0,
              area.services ? JSON.stringify(area.services) : null,
              area.metadata ? JSON.stringify(area.metadata) : null,
            );
            if (area.cells) {
              const cells = area.cells as Array<{ x: number; y: number }>;
              for (const cell of cells) {
                db.prepare(
                  "INSERT INTO area_cells (area_id, x, y) VALUES (?, ?, ?)",
                ).run(area.id, cell.x, cell.y);
              }
            }
          }
        }

        if (simState) {
          const updates: string[] = [];
          const values: unknown[] = [];
          for (const key of [
            "tick_count",
            "game_time",
            "town_health_current",
            "town_health_max",
            "time_scale",
            "tile_size",
            "image_width",
            "image_height",
            "pollution",
            "day_count",
          ]) {
            if (key in simState) {
              updates.push(`${key} = ?`);
              values.push(simState[key]);
            }
          }
          updates.push("difficulty = ?");
          values.push(normalizedDifficulty);
          updates.push("world_resources = ?");
          values.push(JSON.stringify(normalizedWorldResources));
          updates.push("recent_events = ?");
          values.push(JSON.stringify(normalizedEvents));
          if (updates.length > 0) {
            updates.push("updated_at = datetime('now')");
            values.push(1);
            db.prepare(
              `UPDATE simulation_state SET ${updates.join(", ")} WHERE id = ?`,
            ).run(...values);
          }
        }

        if (agents) {
          for (const agent of agents) {
            db.prepare(
              `INSERT OR REPLACE INTO agents
              (id, name, age, traits, background, goals, occupation, personality,
      preferences, rules, routine, position_x, position_y, status,
      current_action, health_current, health_max, green_points, fullness,
      cycle_guidance, awake_hours_since_sleep, backpack, decision_history, work_end_time,
      work_start_time, last_survival_update, current_plan, last_conversation,
      player_guidance, facing_direction, last_sleep_time, no_sleep_days)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            ).run(
              agent.id,
              agent.name,
              agent.age ?? 20,
              typeof agent.traits === "object"
                ? JSON.stringify(agent.traits)
                : String(agent.traits ?? ""),
              typeof agent.background === "object"
                ? JSON.stringify(agent.background)
                : String(agent.background ?? ""),
              typeof agent.goals === "object"
                ? JSON.stringify(agent.goals)
                : String(agent.goals ?? "[]"),
              agent.occupation ?? "普通居民",
              typeof agent.personality === "object"
                ? JSON.stringify(agent.personality)
                : String(
                    agent.personality ??
                      '{"social":0.5,"energy":0.5}',
                  ),
              typeof agent.preferences === "object"
                ? JSON.stringify(agent.preferences)
                : String(agent.preferences ?? '{"places":[],"activities":[]}'),
              typeof agent.rules === "object"
                ? JSON.stringify(agent.rules)
                : String(agent.rules ?? "[]"),
              typeof agent.routine === "object"
                ? JSON.stringify(agent.routine)
                : String(agent.routine ?? '{"wakeTime":7,"sleepTime":23}'),
              agent.position_x ?? 0,
              agent.position_y ?? 0,
              agent.status ?? "idle",
              agent.current_action
                ? typeof agent.current_action === "string"
                  ? agent.current_action
                  : JSON.stringify(agent.current_action)
                : null,
              agent.health_current ?? 100,
              agent.health_max ?? 100,
              agent.green_points ?? 10,
              agent.fullness ?? 80,
              agent.cycle_guidance ?? null,
              agent.awake_hours_since_sleep ?? 0,
              agent.backpack ? JSON.stringify(agent.backpack) : "[]",
              agent.decision_history
                ? typeof agent.decision_history === "string"
                  ? agent.decision_history
                  : JSON.stringify(agent.decision_history)
                : "[]",
              agent.work_end_time ?? null,
              agent.work_start_time ?? null,
              agent.last_survival_update ?? null,
              agent.current_plan
                ? typeof agent.current_plan === "string"
                  ? agent.current_plan
                  : JSON.stringify(agent.current_plan)
                : null,
              agent.last_conversation
                ? typeof agent.last_conversation === "string"
                  ? agent.last_conversation
                  : JSON.stringify(agent.last_conversation)
                : "[]",
              agent.player_guidance ?? "",
              agent.facing_direction ?? "down",
              agent.last_sleep_time ?? 0,
              agent.no_sleep_days ?? 0,
            );
          }
        }

        if (memories) {
          for (const mem of memories) {
            db.prepare(
              `INSERT OR REPLACE INTO memories
              (id, agent_id, content, timestamp, importance, type, last_accessed, access_count, metadata)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            ).run(
              mem.id,
              mem.agent_id,
              mem.content,
              mem.timestamp,
              mem.importance ?? 5,
              mem.type ?? "OBSERVATION",
              mem.last_accessed ?? mem.timestamp,
              mem.access_count ?? 0,
              mem.metadata ? JSON.stringify(mem.metadata) : null,
            );
            if (Array.isArray(mem.embedding) && mem.embedding.length > 0) {
              const vector = Float64Array.from(mem.embedding as number[]);
              const buffer = Buffer.from(vector.buffer);
              db.prepare(
                "INSERT OR REPLACE INTO embeddings (memory_id, vector) VALUES (?, ?)",
              ).run(mem.id, buffer);
            }
          }
        }

        if (reflections) {
          for (const ref of reflections) {
            db.prepare(
              `INSERT OR REPLACE INTO reflections (id, agent_id, content, timestamp)
              VALUES (?, ?, ?, ?)`,
            ).run(ref.id, ref.agent_id, ref.content, ref.timestamp);
            const sourceIds = Array.isArray(ref.source_memory_ids)
              ? ref.source_memory_ids
              : [];
            for (const memoryId of sourceIds) {
              db.prepare(
                "INSERT OR IGNORE INTO reflection_sources (reflection_id, memory_id) VALUES (?, ?)",
              ).run(ref.id, memoryId);
            }
          }
        }

        if (dialogues) {
          for (const dialogue of dialogues) {
            db.prepare(
              `INSERT OR REPLACE INTO dialogues
              (id, agent_id_1, agent_id_2, speaker_1, speaker_2, timestamp)
              VALUES (?, ?, ?, ?, ?, ?)`,
            ).run(
              dialogue.id,
              dialogue.agent_id_1,
              dialogue.agent_id_2,
              dialogue.speaker_1,
              dialogue.speaker_2,
              dialogue.timestamp,
            );
          }
        }
      });

      transaction();
      ensureSavesDir();
      const snapshotPayload = {
        version: 2,
        savedAt: new Date().toISOString(),
        snapshotName: normalizedSnapshotName,
        difficulty: normalizedDifficulty,
        gameConfigDraft: normalizedGameConfigDraft,
        state: simState,
        worldResources: normalizedWorldResources,
        events: normalizedEvents,
        randomEventState:
          randomEventState && typeof randomEventState === "object"
            ? randomEventState
            : null,
        dialogues: Array.isArray(dialogues) ? dialogues : [],
        agents,
        memories,
        reflections,
        areas,
      };
      writeSnapshotAtomically(snapshotPayload, normalizedSnapshotName);
      writeSnapshotAtomically(snapshotPayload, "latest-town-snapshot");

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          message: "Snapshot saved",
          timestamp: new Date().toISOString(),
          savePath: getSnapshotPath(normalizedSnapshotName),
          snapshotName: normalizedSnapshotName,
        }),
      );
    } catch (e: unknown) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: (e as Error).message }));
    }
    return;
  }

  // GET /api/state/snapshot - full world read
  if (subPath === "snapshot" && req.method === "GET") {
    ensureSavesDir();
    const requestedSnapshotName = normalizeSnapshotName(
      url.searchParams.get("name"),
    );
    const snapshotPath = getSnapshotPath(requestedSnapshotName);
    if (fs.existsSync(snapshotPath)) {
      try {
        const parsedSnapshot = readSnapshotFile(requestedSnapshotName);
        if (!parsedSnapshot) {
          throw new Error("Snapshot not found");
        }
        const parsedState =
          parsedSnapshot.state && typeof parsedSnapshot.state === "object"
            ? (parsedSnapshot.state as Record<string, unknown>)
            : {};
        const compatibleSnapshot = {
          version: parsedSnapshot.version ?? 1,
          savedAt: parsedSnapshot.savedAt ?? new Date().toISOString(),
          snapshotName: normalizeSnapshotName(parsedSnapshot.snapshotName),
          difficulty:
            typeof parsedSnapshot.difficulty === "string" &&
            parsedSnapshot.difficulty
              ? parsedSnapshot.difficulty
              : "normal",
          gameConfigDraft:
            parsedSnapshot.gameConfigDraft &&
            typeof parsedSnapshot.gameConfigDraft === "object"
              ? parsedSnapshot.gameConfigDraft
              : {},
          state: parsedState,
          worldResources:
            parsedSnapshot.worldResources &&
            typeof parsedSnapshot.worldResources === "object"
              ? parsedSnapshot.worldResources
              : {},
          randomEventState:
            parsedSnapshot.randomEventState &&
            typeof parsedSnapshot.randomEventState === "object"
              ? parsedSnapshot.randomEventState
              : parsedState.random_event_state &&
                  typeof parsedState.random_event_state === "object"
                ? parsedState.random_event_state
                : null,
          events: Array.isArray(parsedSnapshot.events)
            ? parsedSnapshot.events
            : [],
          dialogues: Array.isArray(parsedSnapshot.dialogues)
            ? parsedSnapshot.dialogues
            : [],
          agents: Array.isArray(parsedSnapshot.agents) ? parsedSnapshot.agents : [],
          memories: Array.isArray(parsedSnapshot.memories)
            ? parsedSnapshot.memories
            : [],
          reflections: Array.isArray(parsedSnapshot.reflections)
            ? parsedSnapshot.reflections
            : [],
          areas: Array.isArray(parsedSnapshot.areas) ? parsedSnapshot.areas : [],
        };
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(compatibleSnapshot));
        return;
      } catch (e) {
        console.warn(
          "Failed to read snapshot file, falling back to database state:",
          e,
        );
      }
    }

    const snapshotPayload = buildDatabaseFallbackSnapshot();

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(snapshotPayload));
    return;
  }

  if (subPath === "snapshots" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ snapshots: listSnapshots() }));
    return;
  }

  if (subPath === "snapshots" && req.method === "DELETE") {
    const requestedSnapshotName = url.searchParams.get("name");
    if (!requestedSnapshotName || !requestedSnapshotName.trim()) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Snapshot name is required" }));
      return;
    }

    try {
      const result = deleteSnapshotFiles(requestedSnapshotName);
      if (!result.deleted) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Snapshot not found" }));
        return;
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
    } catch (e: unknown) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: (e as Error).message }));
    }
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not Found" }));
}

export const __testStateSnapshots = {
  ensureSavesDir,
  listSnapshots,
  normalizeSnapshotName,
  getSnapshotPath,
  getSnapshotTempPath,
  deleteSnapshotFiles,
};
