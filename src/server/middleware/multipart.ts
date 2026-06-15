import http from "http";

export interface MultipartField {
  type: "file" | "text";
  name: string;
  value: Buffer | string;
  filename?: string;
  contentType?: string;
}

/**
 * Split a Buffer by a delimiter Buffer, returning an array of Buffer parts.
 */
function splitBuffer(buf: Buffer, delimiter: Buffer): Buffer[] {
  const parts: Buffer[] = [];
  let start = 0;
  while (true) {
    const idx = buf.indexOf(delimiter, start);
    if (idx === -1) {
      parts.push(buf.subarray(start));
      break;
    }
    parts.push(buf.subarray(start, idx));
    start = idx + delimiter.length;
  }
  return parts;
}

export async function parseMultipart(
  req: http.IncomingMessage
): Promise<Map<string, MultipartField | MultipartField[]>> {
  return new Promise((resolve, reject) => {
    const contentType = req.headers["content-type"] || "";
    const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
    if (!boundaryMatch) {
      reject(new Error("No multipart boundary"));
      return;
    }
    const boundary = boundaryMatch[1] || boundaryMatch[2];
    const boundaryBuf = Buffer.from(`--${boundary}`);

    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      const fields = new Map<string, MultipartField | MultipartField[]>();
      const parts = splitBuffer(body, boundaryBuf);

      for (const part of parts) {
        if (part.length < 4) continue;
        // Find header end (\r\n\r\n)
        const headerEnd = part.indexOf("\r\n\r\n");
        if (headerEnd === -1) continue;

        const headerStr = part.subarray(0, headerEnd).toString("utf8");
        // Strip trailing \r\n from body data
        const bodyData = part.subarray(headerEnd + 4, part.length - 2);

        const dispMatch = headerStr.match(
          /Content-Disposition:\s*form-data;\s*name="([^"]+)"(?:;\s*filename="([^"]+)")?/i
        );
        if (!dispMatch) continue;

        const name = dispMatch[1];
        const filename = dispMatch[2];
        const ctMatch = headerStr.match(/Content-Type:\s*(\S+)/i);
        const contentTypeVal = ctMatch ? ctMatch[1] : undefined;

        const field: MultipartField = {
          type: filename ? "file" : "text",
          name,
          value: bodyData,
          filename,
          contentType: contentTypeVal,
        };

        const existing = fields.get(name);
        if (existing) {
          const arr = Array.isArray(existing) ? existing : [existing];
          arr.push(field);
          fields.set(name, arr);
        } else {
          fields.set(name, field);
        }
      }

      resolve(fields);
    });
    req.on("error", reject);
  });
}

/** Helper: get first field value (text or single file) */
export function getFirstField(
  fields: Map<string, MultipartField | MultipartField[]>,
  name: string
): MultipartField | undefined {
  const val = fields.get(name);
  if (!val) return undefined;
  return Array.isArray(val) ? val[0] : val;
}

/** Helper: get all file fields with given name */
export function getFileFields(
  fields: Map<string, MultipartField | MultipartField[]>,
  name: string
): MultipartField[] {
  const val = fields.get(name);
  if (!val) return [];
  return Array.isArray(val)
    ? val.filter((f) => f.type === "file")
    : val.type === "file"
      ? [val]
      : [];
}
