#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const quiet = process.argv.includes("--quiet");

function log(message) {
  if (!quiet) {
    console.log(message);
  }
}

function fail(message) {
  console.error(`[fail] ${message}`);
  process.exitCode = 1;
}

function ensureProjectRoot() {
  const packagePath = path.join(root, "package.json");
  if (!fs.existsSync(packagePath)) {
    fail("package.json was not found. Run this script from the project checkout.");
    return false;
  }

  const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  if (pkg.name !== "ai-town") {
    fail(`unexpected package name: ${pkg.name || "(missing)"}`);
    return false;
  }

  return true;
}

function ensureDir(relativePath) {
  const target = path.join(root, relativePath);
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
    log(`[created] ${relativePath}`);
    return;
  }

  log(`[ok] ${relativePath}`);
}

function ensureEnvFile() {
  const envPath = path.join(root, ".env");
  const examplePath = path.join(root, ".env.example");

  if (fs.existsSync(envPath)) {
    log("[ok] .env");
    return;
  }

  if (!fs.existsSync(examplePath)) {
    fail(".env is missing and .env.example was not found.");
    return;
  }

  fs.copyFileSync(examplePath, envPath);
  log("[created] .env from .env.example");
}

if (ensureProjectRoot()) {
  ensureDir("data");
  ensureDir(path.join("data", "saves"));
  ensureDir(path.join("data", "chroma"));
  ensureEnvFile();
  log("Setup complete.");
}
