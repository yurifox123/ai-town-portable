import { db } from "./connection";

const schemaSql = `
-- Agents table: identity, config, runtime state
CREATE TABLE IF NOT EXISTS agents (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  age              INTEGER NOT NULL,
  traits           TEXT NOT NULL,
  background       TEXT NOT NULL,
  goals            TEXT NOT NULL DEFAULT '[]',
  occupation       TEXT NOT NULL DEFAULT '普通居民',
  personality      TEXT NOT NULL DEFAULT '{"social":0.5,"energy":0.5}',
  preferences      TEXT NOT NULL DEFAULT '{"places":[],"activities":[]}',
  rules            TEXT NOT NULL DEFAULT '[]',
  custom_prompt    TEXT NOT NULL DEFAULT '',
  routine          TEXT NOT NULL DEFAULT '{"wakeTime":7,"sleepTime":23}',
  position_x       INTEGER NOT NULL DEFAULT 0,
  position_y       INTEGER NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'idle',
  current_action   TEXT,
  health_current   REAL NOT NULL DEFAULT 100,
  health_max       REAL NOT NULL DEFAULT 100,
  green_points     REAL NOT NULL DEFAULT 10,
  fullness         REAL NOT NULL DEFAULT 80,
  cycle_guidance   TEXT,
  awake_hours_since_sleep REAL NOT NULL DEFAULT 0,
  backpack         TEXT NOT NULL DEFAULT '[]',
  decision_history TEXT NOT NULL DEFAULT '[]',
  work_end_time    TEXT,
  work_start_time  TEXT,
  last_survival_update TEXT,
  current_plan     TEXT,
  last_conversation TEXT NOT NULL DEFAULT '[]',
  player_guidance  TEXT NOT NULL DEFAULT '',
  facing_direction TEXT NOT NULL DEFAULT 'down',
  last_sleep_time  INTEGER NOT NULL DEFAULT 0,
  no_sleep_days    INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Memories: observations, actions, thoughts, dialogue records
CREATE TABLE IF NOT EXISTS memories (
  id            TEXT PRIMARY KEY,
  agent_id      TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  content       TEXT NOT NULL,
  timestamp     TEXT NOT NULL,
  importance    INTEGER NOT NULL,
  type          TEXT NOT NULL,
  last_accessed TEXT NOT NULL,
  access_count  INTEGER NOT NULL DEFAULT 0,
  metadata      TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Embeddings stored as raw Float64 BLOB (1536 * 8 = 12288 bytes)
CREATE TABLE IF NOT EXISTS embeddings (
  memory_id TEXT PRIMARY KEY REFERENCES memories(id) ON DELETE CASCADE,
  vector    BLOB NOT NULL
);

-- Reflections: high-level insights from memory synthesis
CREATE TABLE IF NOT EXISTS reflections (
  id               TEXT PRIMARY KEY,
  agent_id         TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  content          TEXT NOT NULL,
  timestamp        TEXT NOT NULL,
  reflection_depth INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Source memories that contributed to each reflection
CREATE TABLE IF NOT EXISTS reflection_sources (
  reflection_id TEXT REFERENCES reflections(id) ON DELETE CASCADE,
  memory_id     TEXT REFERENCES memories(id) ON DELETE CASCADE,
  PRIMARY KEY (reflection_id, memory_id)
);

-- Map areas with services and passability
CREATE TABLE IF NOT EXISTS areas (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  is_blocked INTEGER NOT NULL DEFAULT 0,
  services   TEXT,
  metadata   TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Individual grid cells belonging to areas
CREATE TABLE IF NOT EXISTS area_cells (
  area_id TEXT REFERENCES areas(id) ON DELETE CASCADE,
  x       INTEGER NOT NULL,
  y       INTEGER NOT NULL,
  PRIMARY KEY (area_id, x, y)
);

-- Simulation state (singleton row, id=1)
CREATE TABLE IF NOT EXISTS simulation_state (
  id                INTEGER PRIMARY KEY CHECK (id = 1),
  tick_count        INTEGER NOT NULL DEFAULT 0,
  game_time         TEXT NOT NULL,
  town_health_current REAL NOT NULL DEFAULT 100,
  town_health_max   REAL NOT NULL DEFAULT 100,
  time_scale        REAL NOT NULL DEFAULT 60,
  tile_size         INTEGER NOT NULL DEFAULT 48,
  image_width       INTEGER NOT NULL DEFAULT 1536,
  image_height      INTEGER NOT NULL DEFAULT 1024,
  pollution         REAL NOT NULL DEFAULT 50,
  day_count         INTEGER NOT NULL DEFAULT 1,
  difficulty        TEXT NOT NULL DEFAULT 'normal',
  world_resources   TEXT NOT NULL DEFAULT '{}',
  recent_events     TEXT NOT NULL DEFAULT '[]',
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Dialogue history between agent pairs
CREATE TABLE IF NOT EXISTS dialogues (
  id         TEXT PRIMARY KEY,
  agent_id_1 TEXT NOT NULL,
  agent_id_2 TEXT NOT NULL,
  speaker_1  TEXT NOT NULL,
  speaker_2  TEXT NOT NULL,
  timestamp  TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_memories_agent ON memories(agent_id);
CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
CREATE INDEX IF NOT EXISTS idx_memories_timestamp ON memories(timestamp);
CREATE INDEX IF NOT EXISTS idx_reflections_agent ON reflections(agent_id);
CREATE INDEX IF NOT EXISTS idx_area_cells_area ON area_cells(area_id);
CREATE INDEX IF NOT EXISTS idx_dialogues_agents ON dialogues(agent_id_1, agent_id_2);
`;

db.exec(schemaSql);

// Migration: add personality columns if they don't exist
const columns = db.prepare("PRAGMA table_info(agents)").all();
const existingColumns = columns.map((c) => {
  const column = c as { name: string };
  return column.name;
});
const migrationColumns = [
  "occupation",
  "personality",
  "preferences",
  "rules",
  "custom_prompt",
  "routine",
];
for (const col of migrationColumns) {
  if (!existingColumns.includes(col)) {
    const defaults: Record<string, string> = {
      occupation: "'普通居民'",
      personality:
        '\'{"social":0.5,"energy":0.5}\'',
      preferences: '\'{"places":[],"activities":[]}\'',
      rules: "'[]'",
      custom_prompt: "''",
      routine: '\'{"wakeTime":7,"sleepTime":23}\'',
    };
    db.exec(
      `ALTER TABLE agents ADD COLUMN ${col} TEXT NOT NULL DEFAULT ${defaults[col]}`,
    );
  }
}

const agentRuntimeColumns: Array<[string, string]> = [
  ["cycle_guidance", "ALTER TABLE agents ADD COLUMN cycle_guidance TEXT DEFAULT NULL"],
  [
    "awake_hours_since_sleep",
    "ALTER TABLE agents ADD COLUMN awake_hours_since_sleep REAL NOT NULL DEFAULT 0",
  ],
  ["backpack", "ALTER TABLE agents ADD COLUMN backpack TEXT NOT NULL DEFAULT '[]'"],
  [
    "decision_history",
    "ALTER TABLE agents ADD COLUMN decision_history TEXT NOT NULL DEFAULT '[]'",
  ],
  ["work_end_time", "ALTER TABLE agents ADD COLUMN work_end_time TEXT DEFAULT NULL"],
  [
    "work_start_time",
    "ALTER TABLE agents ADD COLUMN work_start_time TEXT DEFAULT NULL",
  ],
  [
    "last_survival_update",
    "ALTER TABLE agents ADD COLUMN last_survival_update TEXT DEFAULT NULL",
  ],
  ["current_plan", "ALTER TABLE agents ADD COLUMN current_plan TEXT DEFAULT NULL"],
  [
    "last_conversation",
    "ALTER TABLE agents ADD COLUMN last_conversation TEXT NOT NULL DEFAULT '[]'",
  ],
  [
    "player_guidance",
    "ALTER TABLE agents ADD COLUMN player_guidance TEXT NOT NULL DEFAULT ''",
  ],
];

for (const [columnName, statement] of agentRuntimeColumns) {
  if (!existingColumns.includes(columnName)) {
    db.exec(statement);
  }
}

// Seed simulation_state if not exists
const existing = db
  .prepare("SELECT id FROM simulation_state WHERE id = 1")
  .get();
if (!existing) {
  db.prepare(
    `
    INSERT INTO simulation_state (
      id,
      tick_count,
      game_time,
      town_health_current,
      town_health_max,
      time_scale,
      tile_size,
      image_width,
      image_height,
      pollution,
      day_count,
      difficulty,
      world_resources,
      recent_events
    )
    VALUES (1, 0, datetime('now'), 100, 100, 5, 48, 1536, 1024, 50, 1, 'normal', '{}', '[]')
  `,
  ).run();
}

// Migration: add simulation_state columns if they don't exist
const stateColumns = db.prepare("PRAGMA table_info(simulation_state)").all();
const stateColNames = stateColumns.map((c) => {
  const column = c as { name: string };
  return column.name;
});
const stateColumnMigrations: Array<[string, string]> = [
  ["pollution", "ALTER TABLE simulation_state ADD COLUMN pollution REAL NOT NULL DEFAULT 50"],
  ["day_count", "ALTER TABLE simulation_state ADD COLUMN day_count INTEGER NOT NULL DEFAULT 1"],
  [
    "difficulty",
    "ALTER TABLE simulation_state ADD COLUMN difficulty TEXT NOT NULL DEFAULT 'normal'",
  ],
  [
    "world_resources",
    "ALTER TABLE simulation_state ADD COLUMN world_resources TEXT NOT NULL DEFAULT '{}'",
  ],
  [
    "recent_events",
    "ALTER TABLE simulation_state ADD COLUMN recent_events TEXT NOT NULL DEFAULT '[]'",
  ],
];

for (const [columnName, statement] of stateColumnMigrations) {
  if (!stateColNames.includes(columnName)) {
    db.exec(statement);
  }
}

const areaColumns = db.prepare("PRAGMA table_info(areas)").all();
const areaColNames = areaColumns.map((c) => {
  const column = c as { name: string };
  return column.name;
});
if (!areaColNames.includes("metadata")) {
  db.exec("ALTER TABLE areas ADD COLUMN metadata TEXT DEFAULT NULL");
}

db.exec(
  "UPDATE simulation_state SET time_scale = 5 WHERE id = 1 AND time_scale = 60",
);

console.log("✅ Database schema initialized");
