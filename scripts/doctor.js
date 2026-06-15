#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
let failures = 0;
let warnings = 0;

function rel(filePath) {
  return path.relative(root, filePath) || ".";
}

function ok(message) {
  console.log(`[ok] ${message}`);
}

function warn(message) {
  warnings += 1;
  console.warn(`[warn] ${message}`);
}

function fail(message) {
  failures += 1;
  console.error(`[fail] ${message}`);
}

function readJson(relativePath) {
  const filePath = path.join(root, relativePath);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function fileExists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function parseEnvFile(relativePath) {
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) return {};

  const env = {};
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }

  return env;
}

function checkNodeVersion() {
  const version = process.versions.node;
  const major = Number(version.split(".")[0]);
  if (major >= 20 && major <= 26) {
    ok(`Node.js ${version}`);
  } else {
    fail(`Node.js ${version} is not supported. Use Node.js 20.x or 22.x LTS.`);
  }
}

function checkNpm() {
  const npmExecPath = process.env.npm_execpath;

  try {
    const version =
      npmExecPath && fs.existsSync(npmExecPath)
        ? execFileSync(process.execPath, [npmExecPath, "--version"], {
            cwd: root,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
          }).trim()
        : execFileSync(
            process.platform === "win32" ? "cmd.exe" : "npm",
            process.platform === "win32"
              ? ["/d", "/s", "/c", "npm --version"]
              : ["--version"],
            {
              cwd: root,
              encoding: "utf8",
              stdio: ["ignore", "pipe", "pipe"],
            },
          ).trim();
    ok(`npm ${version}`);
  } catch (error) {
    fail(`npm is not available: ${error.message}`);
  }
}

function checkPackageScripts(pkg) {
  const requiredScripts = ["setup", "doctor", "start", "stop", "build", "test", "lint"];
  for (const script of requiredScripts) {
    if (pkg.scripts && pkg.scripts[script]) {
      ok(`npm script ${script}`);
    } else {
      fail(`npm script ${script} is missing`);
    }
  }

  if (pkg.scripts?.stop?.includes("npx ")) {
    warn("npm run stop invokes npx, which may require network access on fresh machines.");
  }

  if (
    pkg.scripts?.prestart?.includes("scripts/setup.js") ||
    pkg.scripts?.prestart?.includes("scripts/prepare-start.js")
  ) {
    ok("npm start runs setup first");
  } else {
    warn("npm start does not run setup first.");
  }

  if (pkg.packageManager) {
    ok(`packageManager ${pkg.packageManager}`);
  } else {
    warn("packageManager is missing from package.json.");
  }

  if (pkg.engines?.node && pkg.engines?.npm) {
    ok(`engines node ${pkg.engines.node}, npm ${pkg.engines.npm}`);
  } else {
    warn("package.json engines should declare supported Node/npm versions.");
  }
}

function checkPackageLock(pkg) {
  if (!fileExists("package-lock.json")) {
    fail("package-lock.json is missing. Run npm install once and commit the lockfile.");
    return;
  }

  const lock = readJson("package-lock.json");
  const lockedRoot = lock.packages && lock.packages[""];

  if (lock.lockfileVersion !== 3) {
    warn(`package-lock.json uses lockfileVersion ${lock.lockfileVersion}; expected 3.`);
  } else {
    ok("package-lock.json lockfileVersion 3");
  }

  if (lock.name !== pkg.name || lockedRoot?.name !== pkg.name) {
    fail("package-lock.json package name does not match package.json.");
  } else if (lock.version !== pkg.version || lockedRoot?.version !== pkg.version) {
    fail(
      `package-lock.json version (${lock.version}/${lockedRoot?.version}) does not match package.json (${pkg.version}).`,
    );
  } else {
    ok("package-lock.json matches package.json");
  }
}

function checkDependencyInstall() {
  if (!fileExists("node_modules")) {
    fail("node_modules is missing. Run npm ci before starting the project.");
    return;
  }

  for (const packageName of ["tsx", "typescript", "vitest", "better-sqlite3"]) {
    try {
      require.resolve(packageName, { paths: [root] });
      ok(`${packageName} is installed`);
    } catch {
      fail(`${packageName} is missing. Run npm ci to restore dependencies.`);
    }
  }

  try {
    require(require.resolve("better-sqlite3", { paths: [root] }));
    ok("better-sqlite3 native binding loads");
  } catch (error) {
    fail(
      `better-sqlite3 failed to load. Reinstall dependencies with a supported Node version. ${error.message}`,
    );
  }
}

function checkRuntimeFiles() {
  const requiredFiles = [
    "src/server/index.ts",
    "public/index.html",
    "public/js/app/app.js",
    "public/assets/default-map.json",
    "public/assets/map.png",
  ];

  for (const requiredFile of requiredFiles) {
    if (fileExists(requiredFile)) {
      ok(requiredFile);
    } else {
      fail(`${requiredFile} is missing`);
    }
  }

  for (const requiredDir of ["data", "data/saves", "data/chroma"]) {
    if (fileExists(requiredDir)) {
      ok(requiredDir);
    } else {
      warn(`${requiredDir} is missing. Run npm run setup or npm start to create it.`);
    }
  }
}

function checkEnvironment() {
  if (!fileExists(".env.example")) {
    fail(".env.example is missing");
    return;
  }
  ok(".env.example");

  if (!fileExists(".env")) {
    warn(".env is missing. Run npm run setup to create it from .env.example.");
    return;
  }
  ok(".env");

  const env = parseEnvFile(".env");
  const apiKey = env.CUSTOM_API_KEY || "";
  if (!apiKey || apiKey === "your-api-key") {
    warn("CUSTOM_API_KEY is not configured. The web app starts, but LLM calls will fail.");
  } else {
    ok("CUSTOM_API_KEY is configured");
  }

  const endpoint = env.CUSTOM_ENDPOINT || "";
  if (!endpoint) {
    warn("CUSTOM_ENDPOINT is empty. Configure it before using LLM features.");
  } else {
    ok("CUSTOM_ENDPOINT is configured");
  }

  const dbPath = env.DB_PATH || env.DATABASE_URL || "./data/ai-town.db";
  if (path.isAbsolute(dbPath)) {
    const resolvedDbPath = path.resolve(dbPath);
    const relativeToRoot = path.relative(root, resolvedDbPath);
    if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
      warn(
        `${rel(resolvedDbPath)} is outside the project. Absolute database paths make the folder less portable.`,
      );
      return;
    }
  }
  ok(`database path is portable: ${dbPath}`);
}

function main() {
  if (!fileExists("package.json")) {
    fail("package.json is missing");
  }

  const pkg = readJson("package.json");

  console.log(`AI Town doctor: ${root}`);
  checkNodeVersion();
  checkNpm();
  checkPackageScripts(pkg);
  checkPackageLock(pkg);
  checkDependencyInstall();
  checkRuntimeFiles();
  checkEnvironment();

  if (failures > 0) {
    console.error(`Doctor found ${failures} failing check(s) and ${warnings} warning(s).`);
    process.exit(1);
  }

  console.log(`Doctor passed with ${warnings} warning(s).`);
}

main();
