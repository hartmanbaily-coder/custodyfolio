import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchRecordsStorage } from "@/lib/records/clientStore";

describe("records storage client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retries a transient WebKit Load failed error", async () => {
    const successfulResponse = new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Load failed"))
      .mockResolvedValueOnce(successfulResponse);
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchRecordsStorage("/api/records/dataset?caseId=default", {
        body: JSON.stringify({ dataset: { dateNotes: [] } }),
        method: "PUT",
      })
    ).resolves.toBe(successfulResponse);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]).toEqual(fetchMock.mock.calls[0]);
  });

  it("gives the user an actionable message when both attempts lose the connection", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Load failed"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchRecordsStorage("/api/records/dataset?caseId=default", {
        body: JSON.stringify({ dataset: { dateNotes: [] } }),
        method: "PUT",
      })
    ).rejects.toThrow(
      "Could not reach secure records storage. Check your connection and try saving again."
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry an intentional cancellation", async () => {
    const cancellation = new DOMException("The operation was aborted.", "AbortError");
    const fetchMock = vi.fn().mockRejectedValue(cancellation);
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchRecordsStorage("/api/records/dataset?caseId=default")
    ).rejects.toBe(cancellation);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
