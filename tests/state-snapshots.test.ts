import fs from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { __testStateSnapshots } from "../src/server/routes/state";

const {
  ensureSavesDir,
  listSnapshots,
  getSnapshotPath,
  deleteSnapshotFiles,
} = __testStateSnapshots;

function writeSnapshot(name: string, payload: Record<string, unknown> = {}) {
  fs.writeFileSync(
    getSnapshotPath(name),
    JSON.stringify(
      {
        snapshotName: name,
        savedAt: "2026-05-28T12:00:00.000Z",
        ...payload,
      },
      null,
      2,
    ),
    "utf8",
  );
}

describe("state snapshots", () => {
  beforeEach(() => {
    ensureSavesDir();
    for (const entry of fs.readdirSync("data/saves")) {
      if (entry.endsWith(".json") || entry.endsWith(".tmp")) {
        fs.unlinkSync(`data/saves/${entry}`);
      }
    }
  });

  it("hides latest-town-snapshot from the visible snapshot list", () => {
    writeSnapshot("manual-save");
    writeSnapshot("latest-town-snapshot", { snapshotName: "manual-save" });

    const snapshots = listSnapshots();

    expect(snapshots.map((snapshot) => snapshot.snapshotName)).toEqual([
      "manual-save",
    ]);
  });

  it("deletes the requested snapshot and its latest alias when they point to the same save", () => {
    writeSnapshot("town-day-3");
    writeSnapshot("latest-town-snapshot", { snapshotName: "town-day-3" });

    const result = deleteSnapshotFiles("town-day-3");

    expect(result.deleted).toBe(true);
    expect(result.removedLatestAlias).toBe(true);
    expect(fs.existsSync(getSnapshotPath("town-day-3"))).toBe(false);
    expect(fs.existsSync(getSnapshotPath("latest-town-snapshot"))).toBe(false);
  });
});
