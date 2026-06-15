import path from "node:path";
import { describe, expect, it } from "vitest";
import { getStaticContentType, resolvePublicFile } from "../src/server/static";

const publicDir = path.resolve(process.cwd(), "public");

function insidePublic(...parts: string[]) {
  return path.resolve(publicDir, ...parts);
}

describe("static file resolver", () => {
  it("maps the root URL to index.html", () => {
    expect(resolvePublicFile(publicDir, "/")).toBe(insidePublic("index.html"));
  });

  it("drops query strings before resolving a public asset", () => {
    expect(resolvePublicFile(publicDir, "/assets/a.png?cache=1")).toBe(
      insidePublic("assets", "a.png"),
    );
  });

  it("rejects traversal attempts before path normalization can hide them", () => {
    expect(resolvePublicFile(publicDir, "/../publicx/secret.txt")).toBeNull();
    expect(resolvePublicFile(publicDir, "/%2e%2e/publicx/secret.txt")).toBeNull();
    expect(resolvePublicFile(publicDir, "/..%5Cpublicx%5Csecret.txt")).toBeNull();
  });

  it("rejects malformed or unsafe encoded paths", () => {
    expect(resolvePublicFile(publicDir, "/%E0%A4%A")).toBeNull();
    expect(resolvePublicFile(publicDir, "/assets/%00.png")).toBeNull();
  });

  it("returns known content types and falls back for unknown extensions", () => {
    expect(getStaticContentType("index.html")).toBe("text/html");
    expect(getStaticContentType("sprite.PNG")).toBe("image/png");
    expect(getStaticContentType("asset.bin")).toBe("application/octet-stream");
  });
});
