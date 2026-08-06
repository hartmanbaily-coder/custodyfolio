import { beforeEach, describe, expect, it, vi } from "vitest";

const heicMocks = vi.hoisted(() => ({
  heicTo: vi.fn(),
}));

vi.mock("heic-to/csp", () => heicMocks);

import {
  convertHeicUploadToJpeg,
  heicJpegFileName,
  isHeicSignature,
  isHeicUpload,
  usesAppleWebKitHeicDecoder,
} from "@/lib/records/heicConversion";

function fileBytesWithBrand(brand: string, payload = "") {
  return new Uint8Array([
    0,
    0,
    0,
    0,
    ...new TextEncoder().encode("ftyp"),
    ...new TextEncoder().encode(brand),
    ...new TextEncoder().encode(payload),
  ]);
}

describe("HEIC exhibit conversion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("recognizes HEIC and HEIF extensions and MIME types", () => {
    expect(isHeicUpload({ name: "IMG_0001.HEIC", type: "" })).toBe(true);
    expect(isHeicUpload({ name: "photo.bin", type: "image/heif" })).toBe(true);
    expect(isHeicUpload({ name: "photo.jpg", type: "image/jpeg" })).toBe(false);
  });

  it("creates a stable JPEG filename", () => {
    expect(heicJpegFileName("IMG_0001.HEIC")).toBe("IMG_0001.jpg");
    expect(heicJpegFileName("scan.heif")).toBe("scan.jpg");
  });

  it("recognizes supported HEIC major brands", () => {
    expect(isHeicSignature(fileBytesWithBrand("heic"))).toBe(true);
    expect(isHeicSignature(fileBytesWithBrand("mif1"))).toBe(true);
    expect(isHeicSignature(fileBytesWithBrand("nope"))).toBe(false);
  });

  it("uses native HEIC decoding for Apple WebKit but not desktop Chromium", () => {
    expect(
      usesAppleWebKitHeicDecoder(
        "Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Mobile/15E148 Version/18.0 Safari/604.1"
      )
    ).toBe(true);
    expect(
      usesAppleWebKitHeicDecoder(
        "Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Mobile/15E148 CriOS/138.0"
      )
    ).toBe(true);
    expect(
      usesAppleWebKitHeicDecoder(
        "Mozilla/5.0 AppleWebKit/537.36 Chrome/138.0.0.0 Safari/537.36"
      )
    ).toBe(false);
  });

  it("converts a verified HEIC file to JPEG while preserving its timestamp", async () => {
    heicMocks.heicTo.mockResolvedValueOnce(new Blob(["jpeg"], { type: "image/jpeg" }));
    const source = new File([fileBytesWithBrand("heic")], "IMG_0001.HEIC", {
      type: "image/heic",
      lastModified: 1234,
    });

    const converted = await convertHeicUploadToJpeg(source);

    expect(converted.name).toBe("IMG_0001.jpg");
    expect(converted.type).toBe("image/jpeg");
    expect(converted.lastModified).toBe(1234);
    expect(converted.size).toBeGreaterThan(0);
  });

  it("accepts a JPEG supplied by WebKit after a HEIC selection", async () => {
    const source = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xdb])], "IMG_0002.HEIC", {
      type: "image/heic",
      lastModified: 5678,
    });

    const converted = await convertHeicUploadToJpeg(source);

    expect(converted.name).toBe("IMG_0002.jpg");
    expect(converted.type).toBe("image/jpeg");
    expect(converted.lastModified).toBe(5678);
    expect(heicMocks.heicTo).not.toHaveBeenCalled();
  });

  it("rejects a renamed file whose HEIC signature does not match", async () => {
    const source = new File(["not-heic"], "fake.heic", { type: "image/heic" });

    await expect(convertHeicUploadToJpeg(source)).rejects.toThrow("file signature");
    expect(heicMocks.heicTo).not.toHaveBeenCalled();
  });
});
