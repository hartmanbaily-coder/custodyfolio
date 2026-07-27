import { afterEach, describe, expect, it, vi } from "vitest";
import {
  downloadBlobFile,
  downloadTextFile,
  notifyNativeNavigationChanged,
  notifyNativeSessionInvalidated,
  shareHtmlAsPdf,
} from "@/lib/records/clientStore";

afterEach(() => {
  vi.unstubAllGlobals();
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
});
