import { afterEach, describe, expect, it, vi } from "vitest";
import {
  downloadBlobFile,
  downloadTextFile,
  notifyNativeNavigationChanged,
  notifyNativeSessionInvalidated,
  shareHtmlAsPdf,
} from "@/lib/records/clientStore";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("native text export bridge", () => {
  it("tells the iOS shell when browser history changes", () => {
    const postMessage = vi.fn();
    vi.stubGlobal("window", {
      webkit: {
        messageHandlers: {
          lostToFoundNavigation: { postMessage },
        },
      },
    });

    notifyNativeNavigationChanged({
      canGoBack: true,
      canGoForward: false,
    });

    expect(postMessage).toHaveBeenCalledWith({
      action: "historyChanged",
      canGoBack: true,
      canGoForward: false,
    });
  });

  it("tells the iOS shell to clear its local WebKit and Keychain session", () => {
    const postMessage = vi.fn();
    vi.stubGlobal("window", {
      webkit: {
        messageHandlers: {
          lostToFoundSession: { postMessage },
        },
      },
    });

    notifyNativeSessionInvalidated();

    expect(postMessage).toHaveBeenCalledWith({
      action: "clearLocalSession",
    });
  });

  it("sends CSV exports to the Custody Folio iOS bridge", () => {
    const postMessage = vi.fn();
    vi.stubGlobal("window", {
      webkit: {
        messageHandlers: {
          lostToFoundDownload: { postMessage },
        },
      },
    });

    downloadTextFile("my_custody_case_report.csv", "date,event\n2026-07-10,Export", "text/csv");

    expect(postMessage).toHaveBeenCalledWith({
      fileName: "my_custody_case_report.csv",
      body: "date,event\n2026-07-10,Export",
      contentType: "text/csv",
    });
  });

  it("requests a native PDF when a printable report is exported", () => {
    const postMessage = vi.fn();
    vi.stubGlobal("window", {
      webkit: {
        messageHandlers: {
          lostToFoundDownload: { postMessage },
        },
      },
    });

    expect(shareHtmlAsPdf("my_custody_case_report.pdf", "<h1>Report</h1>")).toBe(true);

    expect(postMessage).toHaveBeenCalledWith({
      fileName: "my_custody_case_report.pdf",
      body: "<h1>Report</h1>",
      contentType: "text/html",
      renderAsPDF: true,
    });
  });

  it("sends evidence files to the native bridge without using a browser download", async () => {
    const postMessage = vi.fn();
    vi.stubGlobal("window", {
      webkit: {
        messageHandlers: {
          lostToFoundDownload: { postMessage },
        },
      },
    });

    await downloadBlobFile("receipt.txt", new Blob(["receipt"], { type: "text/plain" }));

    expect(postMessage).toHaveBeenCalledWith({
      fileName: "receipt.txt",
      body: "cmVjZWlwdA==",
      contentType: "text/plain",
      base64Encoded: true,
    });
  });

  it("streams binary exports through the chunked iOS bridge when available", async () => {
    const postMessage = vi.fn();
    vi.stubGlobal("window", {
      webkit: {
        messageHandlers: {
          lostToFoundDownloadV2: { postMessage },
        },
      },
    });

    const bytes = new Uint8Array(70 * 1024);
    bytes.fill(0x61);
    await downloadBlobFile("compiled.pdf", new Blob([bytes], { type: "application/pdf" }));

    expect(postMessage.mock.calls[0]?.[0]).toMatchObject({
      action: "start",
      fileName: "compiled.pdf",
      contentType: "application/pdf",
      byteCount: bytes.byteLength,
    });
    expect(postMessage.mock.calls[1]?.[0]).toMatchObject({
      action: "chunk",
      sequence: 0,
    });
    expect(postMessage.mock.calls[2]?.[0]).toMatchObject({
      action: "chunk",
      sequence: 1,
    });
    expect(postMessage.mock.calls[3]?.[0]).toMatchObject({
      action: "complete",
      chunks: 2,
    });

    const chunkBytes = postMessage.mock.calls
      .slice(1, 3)
      .flatMap(([message]) => Array.from(Buffer.from(message.body, "base64")));
    expect(Uint8Array.from(chunkBytes)).toEqual(bytes);
  });

  it("refuses an unsafe single-message export on an older iOS shell", async () => {
    const postMessage = vi.fn();
    vi.stubGlobal("window", {
      webkit: {
        messageHandlers: {
          lostToFoundDownload: { postMessage },
        },
      },
    });

    const oversized = new Blob([new Uint8Array((4 * 1024 * 1024) + 1)], {
      type: "application/pdf",
    });
    await expect(downloadBlobFile("compiled.pdf", oversized)).rejects.toThrow(
      "too large for the installed TestFlight build"
    );
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("keeps browser PDF bytes available for Safari preview and print", async () => {
    vi.useFakeTimers();
    const click = vi.fn();
    const remove = vi.fn();
    const appendChild = vi.fn();
    const anchor = {
      href: "",
      download: "",
      rel: "",
      style: { display: "" },
      click,
      remove,
    };
    const createObjectURL = vi.fn(() => "blob:https://custodyfolio.com/compiled-pdf");
    const revokeObjectURL = vi.fn();

    vi.stubGlobal("window", {});
    vi.stubGlobal("document", {
      body: { appendChild },
      createElement: vi.fn(() => anchor),
    });
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });

    await downloadBlobFile(
      "compiled.pdf",
      new Blob(["%PDF-1.7\nscreenshot exhibit"], { type: "application/pdf" })
    );

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(anchor).toMatchObject({
      href: "blob:https://custodyfolio.com/compiled-pdf",
      download: "compiled.pdf",
      rel: "noopener",
      style: { display: "none" },
    });
    expect(appendChild).toHaveBeenCalledWith(anchor);
    expect(click).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(59_999);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(revokeObjectURL).toHaveBeenCalledWith(
      "blob:https://custodyfolio.com/compiled-pdf"
    );
  });
});
