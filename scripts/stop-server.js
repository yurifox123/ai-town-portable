#!/usr/bin/env node

const fs = require("fs");
const http = require("http");
const path = require("path");

const root = path.resolve(__dirname, "..");

function parseEnvPort() {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return null;

  for (const rawLine of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^PORT\s*=\s*(.+)$/);
    if (!match) continue;
    const value = match[1].trim().replace(/^['"]|['"]$/g, "");
    const port = Number(value);
    return Number.isFinite(port) ? port : null;
  }

  return null;
}

function parseArgPort() {
  const portFlagIndex = process.argv.indexOf("--port");
  if (portFlagIndex !== -1) {
    return Number(process.argv[portFlagIndex + 1]);
  }

  const inlinePort = process.argv.find((arg) => arg.startsWith("--port="));
  if (inlinePort) {
    return Number(inlinePort.slice("--port=".length));
  }

  return null;
}

const port = parseArgPort() || Number(process.env.PORT) || parseEnvPort() || 3061;

const request = http.request(
  {
    hostname: "localhost",
    port,
    path: "/api/stop",
    method: "POST",
    timeout: 3000,
  },
  (response) => {
    let body = "";
    response.setEncoding("utf8");
    response.on("data", (chunk) => {
      body += chunk;
    });
    response.on("end", () => {
      if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
        console.log(`Stop request sent to http://localhost:${port}/api/stop`);
        if (body.trim()) {
          console.log(body.trim());
        }
        return;
      }

      console.error(`Stop request failed with HTTP ${response.statusCode || "unknown"}.`);
      if (body.trim()) {
        console.error(body.trim());
      }
      process.exitCode = 1;
    });
  },
);

request.on("timeout", () => {
  request.destroy(new Error("request timed out"));
});

request.on("error", (error) => {
  if (error.code === "ECONNREFUSED") {
    console.log(`No AI Town server responded on port ${port}.`);
    return;
  }

  console.error(`Failed to stop server on port ${port}: ${error.message}`);
  process.exitCode = 1;
});

request.end();
