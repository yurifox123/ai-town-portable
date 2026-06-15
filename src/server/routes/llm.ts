import fs from "fs/promises";
import http from "http";
import path from "path";
import dotenv from "dotenv";
import { readJsonBody } from "../middleware/json";

dotenv.config();

type RuntimeLlmConfig = {
  apiKey: string;
  apiKeyHeader: string;
  anthropicVersion: string;
  endpoint: string;
  model: string;
  responsePath: string;
};

type RuntimeEmbeddingConfig = {
  endpoint: string;
  responsePath: string;
};

type PersistedLlmConfig = {
  apiKey: string;
  apiKeyHeader: string;
  anthropicVersion: string;
  embeddingEndpoint: string;
  embeddingResponsePath: string;
  endpoint: string;
  model: string;
  responsePath: string;
};

type PublicLlmConfig = Omit<PersistedLlmConfig, "apiKey"> & {
  apiKey: "";
  hasApiKey: boolean;
};

const DEFAULT_LLM_ENDPOINT =
  "https://coding.dashscope.aliyuncs.com/apps/anthropic/v1/messages";
const DEFAULT_LLM_MODEL = "kimi-k2.5";
const DEFAULT_RESPONSE_PATH = "content[1].text";
const DEFAULT_EMBEDDING_RESPONSE_PATH = "data[0].embedding";
const DEFAULT_ANTHROPIC_VERSION = "2023-06-01";
const ENV_PATH = path.resolve(process.cwd(), ".env");

function isMiMoEndpoint(endpoint: string): boolean {
  try {
    return new URL(endpoint).hostname.endsWith("xiaomimimo.com");
  } catch {
    return /xiaomimimo\.com/i.test(endpoint);
  }
}

function buildAuthHeaders(
  endpoint: string,
  apiKey: string,
  configuredHeader = "",
): Record<string, string> {
  const headers: Record<string, string> = {};
  if (!apiKey) return headers;

  const normalizedHeader = configuredHeader.trim().toLowerCase();
  if (normalizedHeader === "authorization" || normalizedHeader === "bearer") {
    headers.Authorization = `Bearer ${apiKey}`;
    return headers;
  }

  const headerName =
    normalizedHeader || (isMiMoEndpoint(endpoint) ? "api-key" : "x-api-key");
  headers[headerName] = apiKey;
  return headers;
}

function createLlmConfigFromEnv(): RuntimeLlmConfig {
  return {
    apiKey: process.env.CUSTOM_API_KEY?.trim() || "",
    apiKeyHeader: process.env.CUSTOM_API_KEY_HEADER?.trim() || "",
    anthropicVersion: process.env.CUSTOM_ANTHROPIC_VERSION?.trim() || "",
    endpoint: process.env.CUSTOM_ENDPOINT?.trim() || DEFAULT_LLM_ENDPOINT,
    model: process.env.CUSTOM_MODEL?.trim() || DEFAULT_LLM_MODEL,
    responsePath: process.env.CUSTOM_RESPONSE_PATH?.trim() || DEFAULT_RESPONSE_PATH,
  };
}

function createEmbeddingConfigFromEnv(): RuntimeEmbeddingConfig {
  return {
    endpoint: process.env.CUSTOM_EMBEDDING_ENDPOINT?.trim() || "",
    responsePath:
      process.env.CUSTOM_EMBEDDING_RESPONSE_PATH?.trim() ||
      DEFAULT_EMBEDDING_RESPONSE_PATH,
  };
}

let llmConfig = createLlmConfigFromEnv();
let embeddingConfig = createEmbeddingConfigFromEnv();

function getPersistedConfig(): PersistedLlmConfig {
  return {
    apiKey: llmConfig.apiKey,
    apiKeyHeader: llmConfig.apiKeyHeader,
    anthropicVersion: llmConfig.anthropicVersion,
    embeddingEndpoint: embeddingConfig.endpoint,
    embeddingResponsePath: embeddingConfig.responsePath,
    endpoint: llmConfig.endpoint,
    model: llmConfig.model,
    responsePath: llmConfig.responsePath,
  };
}

function toPublicConfig(config: PersistedLlmConfig): PublicLlmConfig {
  return {
    ...config,
    apiKey: "",
    hasApiKey: Boolean(config.apiKey.trim()),
  };
}

function applyRuntimeConfig(config: PersistedLlmConfig): void {
  llmConfig = {
    apiKey: config.apiKey,
    apiKeyHeader: config.apiKeyHeader,
    anthropicVersion: config.anthropicVersion,
    endpoint: config.endpoint || DEFAULT_LLM_ENDPOINT,
    model: config.model || DEFAULT_LLM_MODEL,
    responsePath: config.responsePath || DEFAULT_RESPONSE_PATH,
  };

  embeddingConfig = {
    endpoint: config.embeddingEndpoint,
    responsePath:
      config.embeddingResponsePath || DEFAULT_EMBEDDING_RESPONSE_PATH,
  };

  process.env.LLM_PROVIDER = "custom";
  process.env.CUSTOM_API_KEY = llmConfig.apiKey;
  process.env.CUSTOM_API_KEY_HEADER = llmConfig.apiKeyHeader;
  process.env.CUSTOM_ANTHROPIC_VERSION = llmConfig.anthropicVersion;
  process.env.CUSTOM_ENDPOINT = llmConfig.endpoint;
  process.env.CUSTOM_MODEL = llmConfig.model;
  process.env.CUSTOM_RESPONSE_PATH = llmConfig.responsePath;
  process.env.CUSTOM_EMBEDDING_ENDPOINT = embeddingConfig.endpoint;
  process.env.CUSTOM_EMBEDDING_RESPONSE_PATH = embeddingConfig.responsePath;
}

function hasOwnKey(
  payload: Record<string, unknown>,
  key: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(payload, key);
}

function readStringField(
  payload: Record<string, unknown>,
  key: string,
  currentValue: string,
  options: { preserveBlank?: boolean } = {},
): string {
  if (!hasOwnKey(payload, key)) return currentValue;
  const value = payload[key];
  if (typeof value !== "string") {
    return options.preserveBlank ? currentValue : "";
  }

  const trimmed = value.trim();
  if (options.preserveBlank && !trimmed) {
    return currentValue;
  }

  return trimmed;
}

function normalizeConfigPayload(
  payload: Record<string, unknown>,
): PersistedLlmConfig {
  const current = getPersistedConfig();
  return {
    apiKey: readStringField(payload, "apiKey", current.apiKey, {
      preserveBlank: true,
    }),
    apiKeyHeader: readStringField(
      payload,
      "apiKeyHeader",
      current.apiKeyHeader,
    ),
    anthropicVersion: readStringField(
      payload,
      "anthropicVersion",
      current.anthropicVersion,
    ),
    embeddingEndpoint: readStringField(
      payload,
      "embeddingEndpoint",
      current.embeddingEndpoint,
    ),
    embeddingResponsePath: readStringField(
      payload,
      "embeddingResponsePath",
      current.embeddingResponsePath,
    ),
    endpoint: readStringField(payload, "endpoint", current.endpoint),
    model: readStringField(payload, "model", current.model),
    responsePath: readStringField(
      payload,
      "responsePath",
      current.responsePath,
    ),
  };
}

function validateConfig(config: PersistedLlmConfig): string[] {
  const errors: string[] = [];
  if (!config.endpoint) errors.push("API 接口不能为空");
  if (!config.model) errors.push("模型不能为空");
  if (!config.apiKey) errors.push("API Key 不能为空");
  return errors;
}

function escapeRegex(source: string): string {
  return source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function persistConfigToEnv(config: PersistedLlmConfig): Promise<void> {
  let envText = "";
  try {
    envText = await fs.readFile(ENV_PATH, "utf8");
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code !== "ENOENT") {
      throw error;
    }
  }

  const newline = envText.includes("\r\n") ? "\r\n" : "\n";
  const lines = envText ? envText.split(/\r?\n/) : [];
  const updates = Object.entries({
    LLM_PROVIDER: "custom",
    CUSTOM_API_KEY: config.apiKey,
    CUSTOM_API_KEY_HEADER: config.apiKeyHeader,
    CUSTOM_ANTHROPIC_VERSION: config.anthropicVersion,
    CUSTOM_EMBEDDING_ENDPOINT: config.embeddingEndpoint,
    CUSTOM_EMBEDDING_RESPONSE_PATH: config.embeddingResponsePath,
    CUSTOM_ENDPOINT: config.endpoint,
    CUSTOM_MODEL: config.model,
    CUSTOM_RESPONSE_PATH: config.responsePath,
  });

  for (const [key, value] of updates) {
    const serialized = `${key}=${value}`;
    const index = lines.findIndex((line) =>
      new RegExp(`^\\s*${escapeRegex(key)}=`).test(line),
    );

    if (index >= 0) {
      lines[index] = serialized;
    } else {
      lines.push(serialized);
    }
  }

  const nextText = lines.join(newline);
  await fs.writeFile(
    ENV_PATH,
    nextText ? `${nextText}${newline}` : "",
    "utf8",
  );
}

function resolveLlmConfig(
  override: Partial<PersistedLlmConfig> = {},
): RuntimeLlmConfig {
  return {
    apiKey: override.apiKey?.trim() ?? llmConfig.apiKey,
    apiKeyHeader: override.apiKeyHeader?.trim() ?? llmConfig.apiKeyHeader,
    anthropicVersion:
      override.anthropicVersion?.trim() ?? llmConfig.anthropicVersion,
    endpoint: override.endpoint?.trim() || llmConfig.endpoint || DEFAULT_LLM_ENDPOINT,
    model: override.model?.trim() || llmConfig.model || DEFAULT_LLM_MODEL,
    responsePath:
      override.responsePath?.trim() ||
      llmConfig.responsePath ||
      DEFAULT_RESPONSE_PATH,
  };
}

function getValueByPath(obj: unknown, pathValue: string): unknown {
  const keys = pathValue.replace(/\[(\d+)\]/g, ".$1").split(".");
  let value: unknown = obj;
  for (const key of keys) {
    if (value === null || value === undefined) return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

function normalizeTimeoutMs(value: unknown, fallback = 30000): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.max(1000, Math.min(60000, number));
}

async function callLLM(
  messages: unknown[],
  options: Record<string, unknown> = {},
  overrideConfig: Partial<PersistedLlmConfig> = {},
) {
  const activeConfig = resolveLlmConfig(overrideConfig);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...buildAuthHeaders(
      activeConfig.endpoint,
      activeConfig.apiKey,
      activeConfig.apiKeyHeader,
    ),
  };

  const anthropicVersion =
    activeConfig.anthropicVersion ||
    (isMiMoEndpoint(activeConfig.endpoint) ? "" : DEFAULT_ANTHROPIC_VERSION);
  if (anthropicVersion) {
    headers["anthropic-version"] = anthropicVersion;
  }

  const body: Record<string, unknown> = {
    model: activeConfig.model,
    max_tokens: (options.maxTokens as number) || 1000,
    temperature: (options.temperature as number) || 0.7,
    thinking: { type: "disabled" },
    messages,
  };

  if (options.system) {
    body.system = options.system;
  }

  const timeoutMs = normalizeTimeoutMs(
    options.timeout ?? options.timeoutMs,
    30000,
  );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(activeConfig.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      throw new Error(`LLM API timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM API error: ${response.status} - ${errorText}`);
  }

  const data = (await response.json()) as Record<string, unknown>;

  let content: unknown;
  if (data.content && Array.isArray(data.content)) {
    const textBlock = (
      data.content as Array<{ text?: string; type?: string }>
    ).find((block) => block.type === "text");
    content = textBlock?.text ?? getValueByPath(data, activeConfig.responsePath);
  } else {
    content = getValueByPath(data, activeConfig.responsePath);
  }

  return { content, raw: data };
}

async function getEmbedding(text: string): Promise<number[] | null> {
  if (!embeddingConfig.endpoint) return null;

  const activeConfig = resolveLlmConfig();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...buildAuthHeaders(
      embeddingConfig.endpoint,
      activeConfig.apiKey,
      activeConfig.apiKeyHeader,
    ),
  };

  const timeoutMs = 20000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(embeddingConfig.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ input: text, model: "text-embedding-3-small" }),
      signal: controller.signal,
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      throw new Error(`Embedding API timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new Error(`Embedding API error: ${response.status}`);
  }

  const data = await response.json();
  return (
    (getValueByPath(data, embeddingConfig.responsePath) as number[]) ?? null
  );
}

function writeJson(
  res: http.ServerResponse,
  statusCode: number,
  payload: unknown,
): void {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

export async function handleLlmChat(
  req: http.IncomingMessage,
  res: http.ServerResponse,
) {
  try {
    const body = await readJsonBody(req);
    const { messages, options } = body as {
      messages: unknown[];
      options: Record<string, unknown>;
    };
    const result = await callLLM(messages, options || {});
    writeJson(res, 200, result);
  } catch (e: unknown) {
    console.error("LLM Chat Error:", e);
    writeJson(res, 500, { error: (e as Error).message });
  }
}

export async function handleLlmEmbedding(
  req: http.IncomingMessage,
  res: http.ServerResponse,
) {
  try {
    const body = await readJsonBody(req);
    const { text } = body as { text: string };
    const embedding = await getEmbedding(text);
    writeJson(res, 200, { embedding });
  } catch (e: unknown) {
    writeJson(res, 500, { error: (e as Error).message });
  }
}

export async function handleLlmConfig(
  req: http.IncomingMessage,
  res: http.ServerResponse,
) {
  if (req.method === "GET") {
    writeJson(res, 200, { config: toPublicConfig(getPersistedConfig()) });
    return;
  }

  if (req.method !== "PUT") {
    writeJson(res, 405, { error: "Method Not Allowed" });
    return;
  }

  try {
    const body = (await readJsonBody(req)) as Record<string, unknown>;
    const nextConfig = normalizeConfigPayload(body || {});
    const errors = validateConfig(nextConfig);

    if (errors.length > 0) {
      writeJson(res, 400, { error: errors.join("；") });
      return;
    }

    applyRuntimeConfig(nextConfig);
    const appliedConfig = getPersistedConfig();
    await persistConfigToEnv(appliedConfig);
    writeJson(res, 200, {
      config: toPublicConfig(appliedConfig),
      message: "LLM 配置已保存并立即生效",
    });
  } catch (e: unknown) {
    console.error("LLM Config Error:", e);
    writeJson(res, 500, { error: (e as Error).message });
  }
}

export async function handleLlmConfigTest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
) {
  if (req.method !== "POST") {
    writeJson(res, 405, { error: "Method Not Allowed" });
    return;
  }

  try {
    const body = (await readJsonBody(req)) as Record<string, unknown>;
    const configPayload =
      body?.config && typeof body.config === "object"
        ? (body.config as Record<string, unknown>)
        : body;
    const draftConfig = normalizeConfigPayload(configPayload || {});
    const errors = validateConfig(draftConfig);

    if (errors.length > 0) {
      writeJson(res, 400, { success: false, error: errors.join("；") });
      return;
    }

    const prompt =
      typeof body?.prompt === "string" && body.prompt.trim()
        ? body.prompt.trim()
        : "Please reply with only OK";
    const startedAt = Date.now();

    try {
      const result = await callLLM(
        [{ role: "user", content: prompt }],
        {
          maxTokens: 64,
          temperature: 0,
          system:
            "You are a connectivity test assistant. Reply concisely and follow the user instruction exactly.",
        },
        draftConfig,
      );

      writeJson(res, 200, {
        success: true,
        durationMs: Date.now() - startedAt,
        content:
          typeof result.content === "string"
            ? result.content
            : JSON.stringify(result.content),
        endpoint: resolveLlmConfig(draftConfig).endpoint,
        model: resolveLlmConfig(draftConfig).model,
      });
    } catch (e: unknown) {
      writeJson(res, 200, {
        success: false,
        durationMs: Date.now() - startedAt,
        error: (e as Error).message,
      });
    }
  } catch (e: unknown) {
    console.error("LLM Config Test Error:", e);
    writeJson(res, 500, { success: false, error: (e as Error).message });
  }
}
