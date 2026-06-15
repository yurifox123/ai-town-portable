#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";
const tsxBin = path.join(
  root,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tsx.cmd" : "tsx",
);

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: false,
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

run(process.execPath, [path.join(root, "scripts", "setup.js"), "--quiet"]);

if (!fs.existsSync(tsxBin)) {
  console.log("[setup] Dependencies are missing. Running npm ci...");
  run(npmBin, ["ci"]);
}
