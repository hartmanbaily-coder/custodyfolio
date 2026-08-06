const heicExtensions = new Set(["heic", "heif"]);
const heicMimeTypes = new Set([
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
]);

function fileExtension(fileName: string) {
  return fileName.toLowerCase().split(".").at(-1) || "";
}

export function isHeicUpload(file: Pick<File, "name" | "type">) {
  return heicExtensions.has(fileExtension(file.name)) || heicMimeTypes.has(file.type.toLowerCase());
}

export function heicJpegFileName(fileName: string) {
  const withoutExtension = fileName.replace(/\.(heic|heif)$/i, "");
  return `${withoutExtension || "iphone-photo"}.jpg`;
}

function isJpegSignature(bytes: Uint8Array) {
  return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

export function isHeicSignature(bytes: Uint8Array) {
  const majorBrand = String.fromCharCode(...bytes.slice(8, 12));
  return new Set(["heic", "heix", "hevc", "hevx", "mif1"]).has(majorBrand);
}

export function usesAppleWebKitHeicDecoder(userAgent: string) {
  return /AppleWebKit/i.test(userAgent) && !/(Chrome|Chromium|Edg|OPR)\//i.test(userAgent);
}

async function convertHeicWithNativeBrowser(file: File, maximumPixels: number) {
  if (
    typeof document === "undefined" ||
    typeof Image === "undefined" ||
    typeof navigator === "undefined" ||
    !usesAppleWebKitHeicDecoder(navigator.userAgent)
  ) {
    return null;
  }

  const sourceUrl = URL.createObjectURL(file);
  const image = new Image();
  try {
    image.decoding = "async";
    image.src = sourceUrl;
    let decodeTimeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        image.decode(),
        new Promise<never>((_, reject) => {
          decodeTimeout = setTimeout(
            () => reject(new Error("Native HEIC decoding timed out.")),
            5_000
          );
        }),
      ]);
    } finally {
      if (decodeTimeout) clearTimeout(decodeTimeout);
    }

    if (!image.naturalWidth || !image.naturalHeight) return null;
    if (image.naturalWidth * image.naturalHeight > maximumPixels) {
      throw new Error(`Each screenshot must be ${maximumPixels.toLocaleString()} pixels or smaller.`);
    }

    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) return null;

    context.drawImage(image, 0, 0);
    const converted = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.9);
    });
    canvas.width = 1;
    canvas.height = 1;
    return converted;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Each screenshot must be")) {
      throw error;
    }
    return null;
  } finally {
    image.src = "";
    URL.revokeObjectURL(sourceUrl);
  }
}

export async function convertHeicUploadToJpeg(file: File, maximumPixels = 25_000_000) {
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());

  // Older WebKit versions may hand a JPEG to a file input after the user chooses
  // a HEIC photo. Normalize that browser-provided JPEG without decoding it again.
  if (isJpegSignature(header)) {
    return new File([file], heicJpegFileName(file.name), {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  }

  if (!isHeicSignature(header)) {
    throw new Error("The HEIC/HEIF filename, content type, and file signature do not match.");
  }

  let converted = await convertHeicWithNativeBrowser(file, maximumPixels);
  try {
    if (!converted) {
      const { heicTo } = await import("heic-to/csp");
      converted = await heicTo({
        blob: file,
        type: "image/jpeg",
        quality: 0.9,
      });
    }
  } catch {
    throw new Error("This HEIC/HEIF photo could not be decoded on this device.");
  }

  if (!converted.size) {
    throw new Error("This HEIC/HEIF photo produced an empty converted image.");
  }

  return new File([converted], heicJpegFileName(file.name), {
    type: "image/jpeg",
    lastModified: file.lastModified,
  });
}
