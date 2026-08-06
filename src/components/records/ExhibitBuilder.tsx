"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { downloadBlobFile } from "@/lib/records/clientStore";
import type {
  ExhibitSaveRequest,
  SavedScreenshotExhibit,
} from "@/lib/records/exhibitEvidence";
import { convertHeicUploadToJpeg, isHeicUpload } from "@/lib/records/heicConversion";
import {
  exhibitLimits,
  generateScreenshotExhibit,
  inspectExhibitImage,
  normalizeExhibitSourcesForPdf,
  validateExhibitSources,
  type ExhibitDetails,
  type ExhibitSource,
} from "@/lib/records/exhibits";

interface SelectedExhibitSource extends ExhibitSource {
  file: File;
  originalFileName: string;
  previewUrl: string;
}

export default function ExhibitBuilder({
  cloudStorageEnabled,
  onSave,
  onOpenFiles,
}: {
  cloudStorageEnabled: boolean;
  onSave: (request: ExhibitSaveRequest) => Promise<SavedScreenshotExhibit>;
  onOpenFiles: () => void;
}) {
  const [sources, setSources] = useState<SelectedExhibitSource[]>([]);
  const [label, setLabel] = useState("");
  const [title, setTitle] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [description, setDescription] = useState("");
  const [includeCoverPage, setIncludeCoverPage] = useState(true);
  const [includePageNumbers, setIncludePageNumbers] = useState(true);
  const [includeInReports, setIncludeInReports] = useState(true);
  const [saveOriginals, setSaveOriginals] = useState(false);
  const [generated, setGenerated] = useState<{
    blob: Blob;
    fileName: string;
    pageCount: number;
  } | null>(null);
  const [savedExhibit, setSavedExhibit] = useState<SavedScreenshotExhibit | null>(null);
  const [busy, setBusy] = useState<"select" | "generate" | "save" | "share" | "">("");
  const [message, setMessage] = useState("");
  const sourcesRef = useRef(sources);

  useEffect(() => {
    sourcesRef.current = sources;
  }, [sources]);

  useEffect(
    () => () => {
      for (const source of sourcesRef.current) URL.revokeObjectURL(source.previewUrl);
    },
    []
  );

  const details: ExhibitDetails = useMemo(
    () => ({
      label: label.trim() || undefined,
      title: title.trim() || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      description: description.trim() || undefined,
      includeCoverPage,
      includePageNumbers,
    }),
    [dateFrom, dateTo, description, includeCoverPage, includePageNumbers, label, title]
  );

  function invalidateOutput() {
    setGenerated(null);
    setSavedExhibit(null);
    setMessage("");
  }

  async function selectScreenshots(files: FileList | null) {
    if (!files?.length) return;
    setBusy("select");
    setMessage("");

    const nextSources: SelectedExhibitSource[] = [];
    try {
      if (sources.length + files.length > exhibitLimits.maximumScreenshots) {
        throw new Error(`Choose no more than ${exhibitLimits.maximumScreenshots} screenshots.`);
      }

      const incomingFiles = Array.from(files);
      const incomingHeicCount = incomingFiles.filter(isHeicUpload).length;
      const totalOriginalBytes =
        sources.reduce((sum, source) => sum + source.file.size, 0) +
        incomingFiles.reduce((sum, file) => sum + file.size, 0);
      if (totalOriginalBytes > exhibitLimits.maximumTotalInputBytes) {
        throw new Error("The selected screenshots exceed the 24 MB total limit.");
      }

      if (incomingHeicCount) {
        setMessage(
          `Preparing ${incomingHeicCount} iPhone photo${incomingHeicCount === 1 ? "" : "s"} on this device...`
        );
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }

      let convertedCount = 0;
      for (const file of incomingFiles) {
        const preparedFile = isHeicUpload(file)
          ? await convertHeicUploadToJpeg(file, exhibitLimits.maximumImagePixels)
          : file;
        if (preparedFile !== file) convertedCount += 1;

        const bytes = new Uint8Array(await preparedFile.arrayBuffer());
        const inspection = inspectExhibitImage(bytes, {
          fileName: preparedFile.name,
          fileType: preparedFile.type,
        });
        if (!inspection.ok) throw new Error(`${file.name}: ${inspection.error}`);

        nextSources.push({
          id: crypto.randomUUID(),
          fileName: preparedFile.name,
          fileType: preparedFile.type,
          file,
          originalFileName: file.name,
          bytes,
          info: inspection.info,
          previewUrl: URL.createObjectURL(preparedFile),
        });
        const incrementalValidation = validateExhibitSources([...sources, ...nextSources]);
        if (!incrementalValidation.ok) throw new Error(incrementalValidation.error);
      }

      const validation = validateExhibitSources([...sources, ...nextSources]);
      if (!validation.ok) throw new Error(validation.error);

      setSources((current) => [...current, ...nextSources]);
      setGenerated(null);
      setSavedExhibit(null);
      setMessage(
        `${nextSources.length} screenshot${nextSources.length === 1 ? "" : "s"} added.${
          convertedCount
            ? ` ${convertedCount} HEIC/HEIF photo${convertedCount === 1 ? " was" : "s were"} converted locally for the PDF.`
            : ""
        }`
      );
    } catch (error) {
      for (const source of nextSources) URL.revokeObjectURL(source.previewUrl);
      setMessage(error instanceof Error ? error.message : "Screenshots could not be read.");
    } finally {
      setBusy("");
    }
  }

  function moveSource(index: number, direction: -1 | 1) {
    const destination = index + direction;
    if (destination < 0 || destination >= sources.length) return;
    setSources((current) => {
      const next = [...current];
      [next[index], next[destination]] = [next[destination], next[index]];
      return next;
    });
    invalidateOutput();
  }

  function removeSource(id: string) {
    setSources((current) => {
      const removed = current.find((source) => source.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return current.filter((source) => source.id !== id);
    });
    invalidateOutput();
  }

  async function generate() {
    setBusy("generate");
    setSavedExhibit(null);
    setMessage("");
    try {
      const normalized = await normalizeExhibitSourcesForPdf(sources);
      const output = await generateScreenshotExhibit(normalized, details);
      setGenerated(output);
      setMessage(
        `PDF generated with ${output.pageCount} page${output.pageCount === 1 ? "" : "s"}. Review the order below before sharing or saving.`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The PDF could not be generated.");
    } finally {
      setBusy("");
    }
  }

  async function share() {
    if (!generated) return;
    if (generated.blob.size > exhibitLimits.maximumNativeShareBytes) {
      setMessage("This PDF exceeds the 25 MB protected-share limit and cannot be shared safely.");
      return;
    }

    setBusy("share");
    try {
      await downloadBlobFile(generated.fileName, generated.blob);
      setMessage("The compiled PDF is ready to download or share.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The PDF could not be prepared for sharing.");
    } finally {
      setBusy("");
    }
  }

  async function save() {
    if (!generated) return;
    if (!cloudStorageEnabled) {
      setMessage("Sign in before saving a generated exhibit to Files.");
      return;
    }
    if (generated.blob.size > exhibitLimits.maximumEvidenceBytes) {
      setMessage(
        "This PDF is larger than the existing 10 MB evidence limit. You may still share it locally, but it cannot be saved to Files."
      );
      return;
    }
    if (
      saveOriginals &&
      sources.some((source) => source.file.size > exhibitLimits.maximumEvidenceBytes)
    ) {
      setMessage(
        "At least one original screenshot exceeds the 10 MB evidence limit. Turn off original saving or choose smaller originals."
      );
      return;
    }

    setBusy("save");
    setSavedExhibit(null);
    setMessage("");
    try {
      const saved = await onSave({
        pdfFile: new File([generated.blob], generated.fileName, {
          type: "application/pdf",
          lastModified: Date.now(),
        }),
        sources: sources.map((source) => ({ id: source.id, file: source.file })),
        saveOriginals,
        metadata: {
          label: details.label,
          title: details.title,
          dateFrom: details.dateFrom,
          dateTo: details.dateTo,
          description: details.description,
          includeInReports,
        },
      });
      setSavedExhibit(saved);
      setMessage(`${saved.fileName} was saved to Files and confirmed in private storage.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The generated exhibit could not be saved.");
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="min-w-0 max-w-full rounded-lg border border-slate-200 bg-white p-4 shadow-sm" aria-labelledby="exhibit-builder-heading">
      <div className="flex min-w-0 max-w-full flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-full">
          <h2 id="exhibit-builder-heading" className="text-base font-semibold text-slate-950 [overflow-wrap:anywhere]">
            Screenshot exhibit builder
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
            Compile user-selected PNG, JPEG, HEIC, or HEIF screenshots into a US Letter PDF. The
            result is a derived exhibit, not an authenticated, verified, admissible, or tamper-proof
            original.
          </p>
        </div>
        <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-900">
          Local processing
        </span>
      </div>

      <div className="mt-4 grid min-w-0 gap-4 xl:grid-cols-[360px_1fr]">
        <div className="min-w-0 space-y-3">
          <label className="grid min-w-0 max-w-full gap-1.5 text-sm font-medium text-slate-700">
            Screenshots
            <input
              type="file"
              multiple
              accept=".png,.jpg,.jpeg,.heic,.heif,image/png,image/jpeg,image/heic,image/heif"
              className="input"
              disabled={Boolean(busy)}
              onChange={(event) => {
                void selectScreenshots(event.currentTarget.files);
                event.currentTarget.value = "";
              }}
            />
          </label>
          <p className="text-xs leading-5 text-slate-500">
            Up to 12 screenshots, 24 MB total, 25 megapixels each, and 60 megapixels combined.
            HEIC/HEIF photos are converted to JPEG on this device before PDF generation.
          </p>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <label className="grid min-w-0 max-w-full gap-1.5 text-sm font-medium text-slate-700">
              Exhibit label
              <input className="input" value={label} maxLength={60} onChange={(event) => { setLabel(event.target.value); invalidateOutput(); }} />
            </label>
            <label className="grid min-w-0 max-w-full gap-1.5 text-sm font-medium text-slate-700">
              Neutral title
              <input className="input" value={title} maxLength={140} onChange={(event) => { setTitle(event.target.value); invalidateOutput(); }} />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid min-w-0 max-w-full gap-1.5 text-sm font-medium text-slate-700">
              Start date
              <input type="date" className="input" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); invalidateOutput(); }} />
            </label>
            <label className="grid min-w-0 max-w-full gap-1.5 text-sm font-medium text-slate-700">
              End date
              <input type="date" className="input" value={dateTo} onChange={(event) => { setDateTo(event.target.value); invalidateOutput(); }} />
            </label>
          </div>
          <label className="grid min-w-0 max-w-full gap-1.5 text-sm font-medium text-slate-700">
            Short description
            <textarea className="input min-h-20" value={description} maxLength={500} onChange={(event) => { setDescription(event.target.value); invalidateOutput(); }} />
          </label>
          <div className="grid gap-2 text-sm text-slate-700">
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 accent-teal-700"
                checked={includeCoverPage}
                onChange={(event) => { setIncludeCoverPage(event.target.checked); invalidateOutput(); }}
              />
              Include a neutral cover page.
            </label>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 accent-teal-700"
                checked={includePageNumbers}
                onChange={(event) => { setIncludePageNumbers(event.target.checked); invalidateOutput(); }}
              />
              Add Page X of Y numbering, including the cover page.
            </label>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 accent-teal-700"
                checked={includeInReports}
                onChange={(event) => setIncludeInReports(event.target.checked)}
              />
              Include the saved PDF in report file indexes.
            </label>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 accent-teal-700"
                checked={saveOriginals}
                onChange={(event) => setSaveOriginals(event.target.checked)}
              />
              When saving, preserve every selected screenshot as a separate original evidence item.
            </label>
          </div>
          <button type="button" className="btn-primary w-full" disabled={Boolean(busy) || sources.length === 0} onClick={() => void generate()}>
            {busy === "generate" ? "Generating PDF..." : generated ? "Regenerate PDF" : "Generate PDF"}
          </button>
          {message ? (
            <p
              role="status"
              aria-live="polite"
              className={`rounded-md border p-3 text-sm leading-6 ${
                generated && message.startsWith("PDF generated with")
                  ? "border-teal-200 bg-teal-50 font-medium text-teal-950"
                  : "border-slate-200 bg-slate-50 text-slate-700"
              }`}
            >
              {message}
            </p>
          ) : null}
          {savedExhibit ? (
            <button type="button" className="btn-primary w-full" onClick={onOpenFiles}>
              Open saved PDF in Files
            </button>
          ) : null}
          {generated ? (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
              <button type="button" className="btn-secondary" disabled={Boolean(busy)} onClick={() => void share()}>
                {busy === "share" ? "Preparing share..." : "Download or share PDF"}
              </button>
              <button type="button" className="btn-secondary" disabled={Boolean(busy)} onClick={() => void save()}>
                {busy === "save" ? "Saving and reloading..." : "Save PDF to Files"}
              </button>
            </div>
          ) : null}
        </div>

        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900">
            Planned page order · {sources.length} screenshot{sources.length === 1 ? "" : "s"}
          </h3>
          {sources.length === 0 ? (
            <p className="mt-3 rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
              Select screenshots to preview and arrange them.
            </p>
          ) : (
            <ol className="mt-3 grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {sources.map((source, index) => (
                <li key={source.id} className="min-w-0 rounded-md border border-slate-200 bg-slate-50 p-3">
                  <Image
                    src={source.previewUrl}
                    alt={`Screenshot ${index + 1} preview`}
                    width={source.info.width}
                    height={source.info.height}
                    unoptimized
                    className="h-48 w-full rounded border border-slate-200 bg-white object-contain"
                  />
                  <p className="mt-2 break-words text-xs font-semibold text-slate-800">
                    {index + 1}. {source.originalFileName}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {source.info.width} × {source.info.height} · {Math.round(source.file.size / 1024)} KB
                  </p>
                  <div className="mt-3 grid grid-cols-3 gap-1.5">
                    <button type="button" className="btn-secondary px-2 py-1.5 text-xs" disabled={index === 0} onClick={() => moveSource(index, -1)} aria-label={`Move ${source.originalFileName} up`}>
                      Move up
                    </button>
                    <button type="button" className="btn-secondary px-2 py-1.5 text-xs" disabled={index === sources.length - 1} onClick={() => moveSource(index, 1)} aria-label={`Move ${source.originalFileName} down`}>
                      Move down
                    </button>
                    <button type="button" className="btn-secondary px-2 py-1.5 text-xs text-red-700" onClick={() => removeSource(source.id)} aria-label={`Remove ${source.originalFileName}`}>
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}
