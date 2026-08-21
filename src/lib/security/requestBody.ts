import type { NextRequest } from "next/server";

export class RequestBodyTooLargeError extends Error {
  constructor() {
    super("Request body exceeds the configured limit.");
    this.name = "RequestBodyTooLargeError";
  }
}

export function requestContentLengthExceeds(request: NextRequest, maxBytes: number) {
  const header = request.headers.get("content-length");
  if (!header || !/^\d+$/.test(header)) return false;
  const length = Number(header);
  return !Number.isSafeInteger(length) || length > maxBytes;
}

export async function readTextBodyWithLimit(request: NextRequest, maxBytes: number) {
  if (requestContentLengthExceeds(request, maxBytes)) throw new RequestBodyTooLargeError();
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new RequestBodyTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}
