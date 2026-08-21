import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import {
  readTextBodyWithLimit,
  RequestBodyTooLargeError,
} from "@/lib/security/requestBody";

describe("bounded request body reader", () => {
  it("stops a streamed body as soon as it crosses the byte limit", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("ab"));
        controller.enqueue(new TextEncoder().encode("cd"));
        controller.close();
      },
    });
    const request = new NextRequest(
      "https://custodyfolio.com/api/records/dataset",
      {
        method: "PUT",
        body: stream,
        duplex: "half",
      } as unknown as ConstructorParameters<typeof NextRequest>[1]
    );

    await expect(readTextBodyWithLimit(request, 3)).rejects.toBeInstanceOf(
      RequestBodyTooLargeError
    );
  });

  it("preserves a legitimate streamed UTF-8 body", async () => {
    const request = new NextRequest("https://custodyfolio.com/api/records/dataset", {
      method: "PUT",
      body: "{\"ok\":true}",
    });

    await expect(readTextBodyWithLimit(request, 64)).resolves.toBe("{\"ok\":true}");
  });
});
