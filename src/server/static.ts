import path from "path";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

function decodePathname(pathname: string) {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return null;
  }
}

export function resolvePublicFile(publicDir: string, requestUrl: string) {
  const root = path.resolve(publicDir);
  const rawPathname = (requestUrl || "/").split(/[?#]/, 1)[0] || "/";
  const decodedPathname = decodePathname(rawPathname);
  if (!decodedPathname || decodedPathname.includes("\0")) return null;

  const normalizedPathname = decodedPathname.replace(/\\/g, "/");
  if (normalizedPathname.split("/").includes("..")) return null;

  const url = new URL(requestUrl || "/", "http://localhost");
  const relativeRequestPath =
    url.pathname === "/"
      ? "index.html"
      : normalizedPathname.replace(/^\/+/, "");
  const resolvedPath = path.resolve(root, relativeRequestPath);
  const relativeToRoot = path.relative(root, resolvedPath);

  if (
    relativeToRoot === "" ||
    relativeToRoot.startsWith("..") ||
    path.isAbsolute(relativeToRoot)
  ) {
    return null;
  }

  return resolvedPath;
}

export function getStaticContentType(filePath: string) {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}
