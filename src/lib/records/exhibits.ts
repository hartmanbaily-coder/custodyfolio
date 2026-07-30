import { jsPDF } from "jspdf";

export const exhibitLimits = {
  maximumScreenshots: 12,
  maximumTotalInputBytes: 24 * 1024 * 1024,
  maximumImagePixels: 25_000_000,
  maximumTotalPixels: 60_000_000,
  maximumEvidenceBytes: 10 * 1024 * 1024,
  maximumNativeShareBytes: 25 * 1024 * 1024,
} as const;

export type ExhibitImageFormat = "PNG" | "JPEG";

export interface ExhibitImageInfo {
  format: ExhibitImageFormat;
  width: number;
  height: number;
  pixels: number;
}

export interface ExhibitSource {
  id: string;
  fileName: string;
  fileType: string;
  bytes: Uint8Array;
  info: ExhibitImageInfo;
}

export interface ExhibitDetails {
  label?: string;
  title?: string;
  dateFrom?: string;
  dateTo?: string;
  description?: string;
  includeCoverPage: boolean;
  includePageNumbers: boolean;
}

export interface ExhibitPagePlacement {
  x: number;
  y: number;
  width: number;
  height: number;
}

const normalizedMaximumLongEdge = 2200;
const normalizedMaximumShortEdge = 1600;
const normalizedJpegQuality = 0.82;
const maximumGenerationMilliseconds = 30_000;

export type ExhibitPagePlan =
  | { kind: "cover"; pageNumber: number }
  | { kind: "screenshot"; pageNumber: number; sourceId: string };

const letterWidthPoints = 612;
const letterHeightPoints = 792;
const pageMarginPoints = 36;
const footerHeightPoints = 24;

function readUint32BigEndian(bytes: Uint8Array, offset: number) {
  return (
    ((bytes[offset] || 0) * 0x1000000) +
    ((bytes[offset + 1] || 0) << 16) +
    ((bytes[offset + 2] || 0) << 8) +
    (bytes[offset + 3] || 0)
  );
}

function readUint16BigEndian(bytes: Uint8Array, offset: number) {
  return ((bytes[offset] || 0) << 8) + (bytes[offset + 1] || 0);
}

function inspectPng(bytes: Uint8Array): ExhibitImageInfo | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || !signature.every((value, index) => bytes[index] === value)) {
    return null;
  }

  const ihdrLength = readUint32BigEndian(bytes, 8);
  const ihdrType = String.fromCharCode(...bytes.slice(12, 16));
  if (ihdrLength !== 13 || ihdrType !== "IHDR") return null;

  const width = readUint32BigEndian(bytes, 16);
  const height = readUint32BigEndian(bytes, 20);
  if (!width || !height) return null;

  return { format: "PNG", width, height, pixels: width * height };
}

const jpegStartOfFrameMarkers = new Set([
  0xc0,
  0xc1,
  0xc2,
  0xc3,
  0xc5,
  0xc6,
  0xc7,
  0xc9,
  0xca,
  0xcb,
  0xcd,
  0xce,
  0xcf,
]);

function inspectJpeg(bytes: Uint8Array): ExhibitImageInfo | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

  let offset = 2;
  while (offset + 3 < bytes.length) {
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) return null;

    const marker = bytes[offset];
    offset += 1;

    if (marker === 0xd9 || marker === 0xda) return null;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 1 >= bytes.length) return null;

    const segmentLength = readUint16BigEndian(bytes, offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) return null;

    if (jpegStartOfFrameMarkers.has(marker)) {
      if (segmentLength < 7) return null;
      const height = readUint16BigEndian(bytes, offset + 3);
      const width = readUint16BigEndian(bytes, offset + 5);
      if (!width || !height) return null;
      return { format: "JPEG", width, height, pixels: width * height };
    }

    offset += segmentLength;
  }

  return null;
}

export function inspectExhibitImage(
  bytes: Uint8Array,
  input: { fileName: string; fileType: string }
) {
  const extension = input.fileName.toLowerCase().split(".").at(-1) || "";
  const png = inspectPng(bytes);
  const jpeg = png ? null : inspectJpeg(bytes);
  const info = png || jpeg;

  if (!info) {
    return { ok: false as const, error: "Only valid PNG and JPEG screenshots are supported." };
  }

  const expectedExtensions = info.format === "PNG" ? new Set(["png"]) : new Set(["jpg", "jpeg"]);
  const expectedMimeTypes =
    info.format === "PNG" ? new Set(["image/png"]) : new Set(["image/jpeg", "image/jpg"]);

  if (!expectedExtensions.has(extension) || !expectedMimeTypes.has(input.fileType.toLowerCase())) {
    return {
      ok: false as const,
      error: "The screenshot filename, content type, and file signature do not match.",
    };
  }

  if (info.pixels > exhibitLimits.maximumImagePixels) {
    return {
      ok: false as const,
      error: `Each screenshot must be ${exhibitLimits.maximumImagePixels.toLocaleString()} pixels or smaller.`,
    };
  }

  return { ok: true as const, info };
}

export function validateExhibitSources(sources: Array<Pick<ExhibitSource, "bytes" | "info">>) {
  if (sources.length === 0) {
    return { ok: false as const, error: "Choose at least one screenshot." };
  }
  if (sources.length > exhibitLimits.maximumScreenshots) {
    return {
      ok: false as const,
      error: `Choose no more than ${exhibitLimits.maximumScreenshots} screenshots.`,
    };
  }

  const totalBytes = sources.reduce((sum, source) => sum + source.bytes.byteLength, 0);
  if (totalBytes > exhibitLimits.maximumTotalInputBytes) {
    return { ok: false as const, error: "The selected screenshots exceed the 24 MB total limit." };
  }

  const totalPixels = sources.reduce((sum, source) => sum + source.info.pixels, 0);
  if (totalPixels > exhibitLimits.maximumTotalPixels) {
    return {
      ok: false as const,
      error: `The selected screenshots exceed the ${exhibitLimits.maximumTotalPixels.toLocaleString()} combined-pixel limit.`,
    };
  }

  return { ok: true as const, totalBytes, totalPixels };
}

export function planExhibitImagePlacement(width: number, height: number): ExhibitPagePlacement {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("Screenshot dimensions must be positive finite numbers.");
  }
  const availableWidth = letterWidthPoints - pageMarginPoints * 2;
  const availableHeight = letterHeightPoints - pageMarginPoints * 2 - footerHeightPoints;
  const scale = Math.min(availableWidth / width, availableHeight / height);
  const placedWidth = width * scale;
  const placedHeight = height * scale;

  return {
    x: (letterWidthPoints - placedWidth) / 2,
    y: pageMarginPoints + (availableHeight - placedHeight) / 2,
    width: placedWidth,
    height: placedHeight,
  };
}

export function planExhibitPages(
  sources: Array<Pick<ExhibitSource, "id">>,
  includeCoverPage: boolean
): ExhibitPagePlan[] {
  const pages: ExhibitPagePlan[] = [];
  if (includeCoverPage) pages.push({ kind: "cover", pageNumber: 1 });
  for (const source of sources) {
    pages.push({
      kind: "screenshot",
      pageNumber: pages.length + 1,
      sourceId: source.id,
    });
  }
  return pages;
}

async function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("A screenshot could not be prepared locally.")),
      "image/jpeg",
      normalizedJpegQuality
    );
  });
}

async function loadCanvasImage(blob: Blob): Promise<{
  image: CanvasImageSource;
  close: () => void;
}> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob);
      return { image: bitmap, close: () => bitmap.close() };
    } catch {
      // Some iOS WebKit versions expose createImageBitmap but reject valid
      // Photos screenshots with "Load failed". Fall through to the broadly
      // supported HTMLImageElement decoder instead of surfacing that raw error.
    }
  }
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.decoding = "async";
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("A screenshot could not be decoded on this device."));
      image.src = url;
    });
    return { image, close: () => URL.revokeObjectURL(url) };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

export async function normalizeExhibitSourcesForPdf(sources: ExhibitSource[]) {
  if (typeof window === "undefined" || typeof document === "undefined") return sources;
  const startedAt = performance.now();
  const normalized: ExhibitSource[] = [];
  for (const source of sources) {
    if (performance.now() - startedAt > maximumGenerationMilliseconds) {
      throw new Error("PDF preparation exceeded the 30 second local-processing limit.");
    }
    const drawable = await loadCanvasImage(
      new Blob([source.bytes.slice().buffer as ArrayBuffer], { type: source.fileType })
    );
    try {
      const landscape = source.info.width >= source.info.height;
      const maximumWidth = landscape ? normalizedMaximumLongEdge : normalizedMaximumShortEdge;
      const maximumHeight = landscape ? normalizedMaximumShortEdge : normalizedMaximumLongEdge;
      const scale = Math.min(1, maximumWidth / source.info.width, maximumHeight / source.info.height);
      const width = Math.max(1, Math.round(source.info.width * scale));
      const height = Math.max(1, Math.round(source.info.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Local screenshot processing is not available on this device.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(drawable.image, 0, 0, width, height);
      const bytes = new Uint8Array(await (await canvasBlob(canvas)).arrayBuffer());
      normalized.push({
        ...source,
        fileType: "image/jpeg",
        bytes,
        info: { format: "JPEG", width, height, pixels: width * height },
      });
      canvas.width = 1;
      canvas.height = 1;
    } finally {
      drawable.close();
    }
  }
  return normalized;
}

export function sanitizeExhibitFileName(label?: string, title?: string) {
  const requested = [label, title].filter(Boolean).join("-") || "compiled-screenshots";
  const safe = requested
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return `custody_folio_exhibit_${safe || "compiled_screenshots"}.pdf`;
}

function addWrappedText(
  document: jsPDF,
  value: string,
  y: number,
  options: { size?: number; style?: "normal" | "bold"; maxWidth?: number } = {}
) {
  document.setFont("helvetica", options.style || "normal");
  document.setFontSize(options.size || 11);
  const lines = document.splitTextToSize(value, options.maxWidth || 500) as string[];
  document.text(lines, pageMarginPoints, y);
  return y + lines.length * (options.size || 11) * 1.35;
}

export async function generateScreenshotExhibit(
  sources: ExhibitSource[],
  details: ExhibitDetails
) {
  const validation = validateExhibitSources(sources);
  if (!validation.ok) throw new Error(validation.error);
  const pagePlan = planExhibitPages(sources, details.includeCoverPage);

  const document = new jsPDF({
    unit: "pt",
    format: "letter",
    orientation: "portrait",
    compress: true,
    putOnlyUsedFonts: true,
  });

  document.setProperties({
    title: "Compiled screenshot exhibit",
    subject: "User-compiled screenshots",
    author: "",
    creator: "Custody Folio",
    keywords: "",
  });

  if (details.includeCoverPage) {
    let y = 90;
    y = addWrappedText(document, details.label || "Exhibit", y, { size: 18, style: "bold" });
    if (details.title) y = addWrappedText(document, details.title, y + 8, { size: 15, style: "bold" });

    const dateLabel =
      details.dateFrom && details.dateTo && details.dateFrom !== details.dateTo
        ? `${details.dateFrom} through ${details.dateTo}`
        : details.dateFrom || details.dateTo || "";
    if (dateLabel) y = addWrappedText(document, `Date: ${dateLabel}`, y + 12);
    if (details.description) y = addWrappedText(document, details.description, y + 12);

    addWrappedText(
      document,
      `Compiled from ${sources.length} user selected screenshot${sources.length === 1 ? "" : "s"}. Custody Folio organizes user provided information and does not authenticate, verify, or determine the admissibility of these materials. Preserve original files separately.`,
      Math.max(y + 28, 360),
      { size: 10 }
    );
  }

  sources.forEach((source, index) => {
    if (details.includeCoverPage || index > 0) document.addPage("letter", "portrait");
    const placement = planExhibitImagePlacement(source.info.width, source.info.height);
    document.addImage(
      source.bytes,
      source.info.format,
      placement.x,
      placement.y,
      placement.width,
      placement.height,
      undefined,
      "FAST"
    );
  });

  if (details.includePageNumbers) {
    const pageCount = document.getNumberOfPages();
    for (let page = 1; page <= pageCount; page += 1) {
      document.setPage(page);
      document.setFont("helvetica", "normal");
      document.setFontSize(9);
      document.setTextColor(71, 85, 105);
      document.text(`Page ${page} of ${pageCount}`, letterWidthPoints / 2, 770, {
        align: "center",
      });
    }
  }

  const blob = document.output("blob");
  return {
    blob,
    fileName: sanitizeExhibitFileName(details.label, details.title),
    pageCount: document.getNumberOfPages(),
    pagePlan,
    inputBytes: validation.totalBytes,
    inputPixels: validation.totalPixels,
  };
}
