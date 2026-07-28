import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import {
  exhibitLimits,
  generateScreenshotExhibit,
  inspectExhibitImage,
  planExhibitImagePlacement,
  planExhibitPages,
  sanitizeExhibitFileName,
  validateExhibitSources,
  type ExhibitSource,
} from "@/lib/records/exhibits";

const onePixelPng = new Uint8Array(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64"
  )
);

function pngHeader(width: number, height: number) {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  bytes.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

function jpegHeader(width: number, height: number) {
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x04, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x0b, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x01, 0x01, 0x11, 0x00,
    0xff, 0xd9,
  ]);
}

function source(id: string): ExhibitSource {
  return {
    id,
    fileName: `${id}.png`,
    fileType: "image/png",
    bytes: onePixelPng,
    info: { format: "PNG", width: 1, height: 1, pixels: 1 },
  };
}

describe("screenshot exhibit domain", () => {
  it("keeps the mobile-safe exhibit budget explicit", () => {
    expect(exhibitLimits.maximumScreenshots).toBe(12);
    expect(exhibitLimits.maximumTotalInputBytes).toBe(24 * 1024 * 1024);
    expect(exhibitLimits.maximumTotalPixels).toBe(60_000_000);
  });

  it("recognizes matching PNG and JPEG signatures and dimensions", () => {
    expect(inspectExhibitImage(pngHeader(1200, 1800), { fileName: "a.png", fileType: "image/png" }))
      .toMatchObject({ ok: true, info: { format: "PNG", width: 1200, height: 1800 } });
    expect(inspectExhibitImage(jpegHeader(900, 1600), { fileName: "a.jpeg", fileType: "image/jpeg" }))
      .toMatchObject({ ok: true, info: { format: "JPEG", width: 900, height: 1600 } });
  });

  it("rejects invalid, truncated, mismatched, and oversized images", () => {
    expect(inspectExhibitImage(new Uint8Array([1, 2, 3]), { fileName: "a.png", fileType: "image/png" }))
      .toMatchObject({ ok: false });
    expect(inspectExhibitImage(pngHeader(100, 100), { fileName: "a.jpg", fileType: "image/jpeg" }))
      .toMatchObject({ ok: false });
    expect(inspectExhibitImage(pngHeader(6000, 5000), { fileName: "a.png", fileType: "image/png" }))
      .toMatchObject({ ok: false });
  });

  it("preserves source order in page plans with and without a cover", () => {
    expect(planExhibitPages([{ id: "b" }, { id: "a" }], true)).toEqual([
      { kind: "cover", pageNumber: 1 },
      { kind: "screenshot", pageNumber: 2, sourceId: "b" },
      { kind: "screenshot", pageNumber: 3, sourceId: "a" },
    ]);
    expect(planExhibitPages([{ id: "b" }, { id: "a" }], false)).toEqual([
      { kind: "screenshot", pageNumber: 1, sourceId: "b" },
      { kind: "screenshot", pageNumber: 2, sourceId: "a" },
    ]);
  });

  it("fits landscape and portrait screenshots proportionally inside letter margins", () => {
    const portrait = planExhibitImagePlacement(1170, 2532);
    const landscape = planExhibitImagePlacement(2532, 1170);
    expect(portrait.width / portrait.height).toBeCloseTo(1170 / 2532, 8);
    expect(landscape.width / landscape.height).toBeCloseTo(2532 / 1170, 8);
    expect(portrait.x).toBeGreaterThanOrEqual(36);
    expect(portrait.y).toBeGreaterThanOrEqual(36);
    expect(landscape.x + landscape.width).toBeLessThanOrEqual(576);
    expect(landscape.y + landscape.height).toBeLessThanOrEqual(732);
  });

  it("sanitizes downloaded filenames", () => {
    expect(sanitizeExhibitFileName("Exhibit A", "../private child name?"))
      .toBe("my_custody_case_exhibit_Exhibit-A-private-child-name.pdf");
    expect(sanitizeExhibitFileName("💼", "")).toBe("my_custody_case_exhibit_compiled_screenshots.pdf");
  });

  it("enforces count, total input size, and combined-pixel limits", () => {
    const base = {
      bytes: new Uint8Array(1),
      info: { format: "PNG" as const, width: 1, height: 1, pixels: 1 },
    };
    expect(validateExhibitSources(Array.from({ length: exhibitLimits.maximumScreenshots + 1 }, () => base)))
      .toMatchObject({ ok: false });
    expect(validateExhibitSources([{
      ...base,
      bytes: { byteLength: exhibitLimits.maximumTotalInputBytes + 1 } as Uint8Array,
    }])).toMatchObject({ ok: false });
    expect(validateExhibitSources([{
      ...base,
      info: { ...base.info, pixels: exhibitLimits.maximumTotalPixels + 1 },
    }])).toMatchObject({ ok: false });
  });

  it("generates US Letter pages, cover options, and pagination without changing order", async () => {
    const withCover = await generateScreenshotExhibit([source("first"), source("second")], {
      label: "Exhibit A",
      title: "Screenshots",
      includeCoverPage: true,
      includePageNumbers: true,
    });
    expect(withCover.pageCount).toBe(3);
    expect(withCover.pagePlan.map((page) => page.kind)).toEqual(["cover", "screenshot", "screenshot"]);
    expect(withCover.blob.type).toBe("application/pdf");

    const withoutCover = await generateScreenshotExhibit([source("first")], {
      includeCoverPage: false,
      includePageNumbers: false,
    });
    expect(withoutCover.pageCount).toBe(1);
    expect(withoutCover.pagePlan).toEqual([{ kind: "screenshot", pageNumber: 1, sourceId: "first" }]);
  });
});
