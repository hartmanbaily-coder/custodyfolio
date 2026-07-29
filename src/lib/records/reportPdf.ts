import { jsPDF } from "jspdf";
import { siteName } from "../site";
import type {
  ReportPreview,
  SectionExportChart,
  SectionExportPacket,
  SectionExportTable,
} from "./reports";
import type { DateRange } from "./types";

export type PrintableReportPacket = Pick<
  SectionExportPacket,
  | "title"
  | "caseName"
  | "generatedAt"
  | "range"
  | "disclaimer"
  | "metrics"
  | "summaries"
  | "charts"
  | "tables"
  | "suggestedUses"
>;

const pageWidth = 612;
const pageMargin = 36;
const contentWidth = pageWidth - pageMargin * 2;
const footerTop = 759;
const contentBottom = 744;
const teal = [15, 118, 110] as const;
const navy = [15, 23, 42] as const;
const slate = [71, 85, 105] as const;
const lightSlate = [248, 250, 252] as const;
const border = [203, 213, 225] as const;
const blue = [37, 99, 235] as const;
const amber = [180, 83, 9] as const;

function pdfText(value: unknown) {
  return String(value ?? "")
    .normalize("NFC")
    .replaceAll("\u00a0", " ")
    .replace(/[‐‑‒–—―−]/g, "-")
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replaceAll("…", "...")
    .replaceAll("•", "-")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
}

function setTextColor(document: jsPDF, color: readonly [number, number, number]) {
  document.setTextColor(color[0], color[1], color[2]);
}

function setFillColor(document: jsPDF, color: readonly [number, number, number]) {
  document.setFillColor(color[0], color[1], color[2]);
}

function setDrawColor(document: jsPDF, color: readonly [number, number, number]) {
  document.setDrawColor(color[0], color[1], color[2]);
}

function wrappedLines(document: jsPDF, value: unknown, width: number) {
  return document.splitTextToSize(pdfText(value), width) as string[];
}

function formatChartValue(value: number, unit?: string) {
  if (unit === "USD") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(value);
  }
  if (unit === "minutes") return `${value} min`;
  return Number.isInteger(value) ? value.toLocaleString("en-US") : value.toFixed(2);
}

export function printableReportPacket(
  preview: ReportPreview,
  range: DateRange
): PrintableReportPacket {
  return {
    title: preview.title,
    caseName: preview.caseName,
    generatedAt: preview.generatedAt,
    range,
    disclaimer: preview.disclaimer,
    metrics: preview.metrics,
    summaries: [preview.focus, ...preview.summaries],
    charts: preview.charts,
    tables: preview.tables,
    suggestedUses: [
      "Review the dated entries against original records before sharing.",
      "Use this factual organization aid with an attorney or other qualified professional as appropriate.",
    ],
  };
}

export function generatePrintableReportPdf(packet: PrintableReportPacket) {
  const document = new jsPDF({
    unit: "pt",
    format: "letter",
    orientation: "portrait",
    compress: true,
    putOnlyUsedFonts: true,
  });
  document.setProperties({
    title: pdfText(packet.title),
    subject: "User-generated custody records summary",
    author: "",
    creator: siteName,
    keywords: "",
  });

  let cursorY = pageMargin;

  function drawContinuationHeader() {
    document.setFont("helvetica", "bold");
    document.setFontSize(8);
    setTextColor(document, teal);
    document.text(pdfText(siteName).toUpperCase(), pageMargin, pageMargin);
    document.setFont("helvetica", "normal");
    setTextColor(document, slate);
    document.text(pdfText(packet.title), pageWidth - pageMargin, pageMargin, {
      align: "right",
      maxWidth: contentWidth * 0.68,
    });
    setDrawColor(document, border);
    document.line(pageMargin, pageMargin + 8, pageWidth - pageMargin, pageMargin + 8);
    cursorY = pageMargin + 24;
  }

  function addPage() {
    document.addPage("letter", "portrait");
    drawContinuationHeader();
  }

  function ensureSpace(height: number) {
    if (cursorY + height > contentBottom) addPage();
  }

  function drawSectionTitle(title: string) {
    ensureSpace(28);
    document.setFont("helvetica", "bold");
    document.setFontSize(14);
    setTextColor(document, navy);
    document.text(pdfText(title), pageMargin, cursorY + 13);
    setDrawColor(document, teal);
    document.setLineWidth(1.5);
    document.line(pageMargin, cursorY + 19, pageWidth - pageMargin, cursorY + 19);
    cursorY += 30;
  }

  function drawTextBlock(
    value: unknown,
    options: {
      background?: readonly [number, number, number];
      color?: readonly [number, number, number];
      fontSize?: number;
      bold?: boolean;
      borderColor?: readonly [number, number, number];
    } = {}
  ) {
    const fontSize = options.fontSize || 9.5;
    const lineHeight = fontSize * 1.35;
    const lines = wrappedLines(document, value, contentWidth - 20);
    const height = Math.max(28, lines.length * lineHeight + 17);
    ensureSpace(height + 7);
    setFillColor(document, options.background || lightSlate);
    setDrawColor(document, options.borderColor || border);
    document.roundedRect(pageMargin, cursorY, contentWidth, height, 4, 4, "FD");
    document.setFont("helvetica", options.bold ? "bold" : "normal");
    document.setFontSize(fontSize);
    setTextColor(document, options.color || slate);
    document.text(lines, pageMargin + 10, cursorY + 13, { lineHeightFactor: 1.35 });
    cursorY += height + 7;
  }

  function drawMetrics() {
    const gap = 8;
    const cardWidth = (contentWidth - gap) / 2;
    for (let index = 0; index < packet.metrics.length; index += 2) {
      const pair = packet.metrics.slice(index, index + 2);
      const cards = pair.map((metric) => {
        const labelLines = wrappedLines(document, metric.label, cardWidth - 18);
        const detailLines = metric.detail
          ? wrappedLines(document, metric.detail, cardWidth - 18)
          : [];
        const height = Math.max(
          66,
          13 + labelLines.length * 10 + 24 + detailLines.length * 9 + 9
        );
        return { metric, labelLines, detailLines, height };
      });
      const rowHeight = Math.max(...cards.map((card) => card.height));
      ensureSpace(rowHeight + 8);

      cards.forEach((card, pairIndex) => {
        const x = pageMargin + pairIndex * (cardWidth + gap);
        setFillColor(document, lightSlate);
        setDrawColor(document, border);
        document.roundedRect(x, cursorY, cardWidth, rowHeight, 4, 4, "FD");
        document.setFont("helvetica", "bold");
        document.setFontSize(8);
        setTextColor(document, slate);
        document.text(card.labelLines, x + 9, cursorY + 12, { lineHeightFactor: 1.25 });
        const valueY = cursorY + 18 + card.labelLines.length * 10;
        document.setFontSize(17);
        setTextColor(document, navy);
        document.text(pdfText(card.metric.value), x + 9, valueY + 13);
        if (card.detailLines.length > 0) {
          document.setFont("helvetica", "normal");
          document.setFontSize(7.5);
          setTextColor(document, slate);
          document.text(card.detailLines, x + 9, valueY + 27, {
            lineHeightFactor: 1.2,
          });
        }
      });
      cursorY += rowHeight + 8;
    }
  }

  function drawChartHeading(chart: SectionExportChart, continued = false) {
    const title = `${chart.title}${chart.unit ? ` (${chart.unit})` : ""}${
      continued ? " - continued" : ""
    }`;
    const titleLines = wrappedLines(document, title, contentWidth);
    const descriptionLines = chart.description
      ? wrappedLines(document, chart.description, contentWidth)
      : [];
    const legendLabels = chart.seriesLabels?.filter(
      (label): label is string => Boolean(label)
    ) || [];
    const height =
      titleLines.length * 12 +
      descriptionLines.length * 10 +
      (legendLabels.length > 0 ? 16 : 0) +
      7;
    ensureSpace(height + 25);
    document.setFont("helvetica", "bold");
    document.setFontSize(11);
    setTextColor(document, navy);
    document.text(titleLines, pageMargin, cursorY + 10, { lineHeightFactor: 1.15 });
    cursorY += titleLines.length * 12;
    if (descriptionLines.length > 0) {
      document.setFont("helvetica", "normal");
      document.setFontSize(8);
      setTextColor(document, slate);
      document.text(descriptionLines, pageMargin, cursorY + 8, {
        lineHeightFactor: 1.25,
      });
      cursorY += descriptionLines.length * 10 + 3;
    }
    if (legendLabels.length > 0) {
      const colors = [teal, blue, amber];
      let legendX = pageMargin;
      legendLabels.forEach((label, index) => {
        setFillColor(document, colors[index] || slate);
        document.rect(legendX, cursorY + 3, 7, 7, "F");
        document.setFontSize(7.5);
        setTextColor(document, slate);
        document.text(pdfText(label), legendX + 11, cursorY + 10);
        legendX += Math.min(170, document.getTextWidth(pdfText(label)) + 25);
      });
      cursorY += 16;
    }
  }

  function drawChart(chart: SectionExportChart) {
    drawChartHeading(chart);
    if (chart.rows.length === 0) {
      document.setFont("helvetica", "italic");
      document.setFontSize(9);
      setTextColor(document, slate);
      document.text("No chart data for this range.", pageMargin, cursorY + 10);
      cursorY += 24;
      return;
    }

    const values = chart.rows.flatMap((row) =>
      [row.value, row.secondaryValue, row.tertiaryValue].filter(
        (value): value is number => typeof value === "number"
      )
    );
    const maximum = Math.max(1, ...values.map((value) => Math.abs(value)));

    chart.rows.forEach((row) => {
      const series = [row.value, row.secondaryValue, row.tertiaryValue].filter(
        (value): value is number => typeof value === "number"
      );
      const labelLines = wrappedLines(document, row.label, contentWidth * 0.62);
      const rowHeight = Math.max(26, labelLines.length * 9 + series.length * 8 + 7);
      if (cursorY + rowHeight > contentBottom) {
        addPage();
        drawChartHeading(chart, true);
      }

      document.setFont("helvetica", "normal");
      document.setFontSize(8);
      setTextColor(document, slate);
      document.text(labelLines, pageMargin, cursorY + 8, { lineHeightFactor: 1.15 });
      document.setFont("helvetica", "bold");
      setTextColor(document, navy);
      document.text(
        series.map((value) => formatChartValue(value, chart.unit)).join(" / "),
        pageWidth - pageMargin,
        cursorY + 8,
        { align: "right" }
      );
      let barY = cursorY + labelLines.length * 9 + 4;
      const colors = [teal, blue, amber];
      series.forEach((value, index) => {
        setFillColor(document, [226, 232, 240]);
        document.roundedRect(pageMargin, barY, contentWidth, 5, 2.5, 2.5, "F");
        setFillColor(document, colors[index] || slate);
        document.roundedRect(
          pageMargin,
          barY,
          Math.max(5, (Math.abs(value) / maximum) * contentWidth),
          5,
          2.5,
          2.5,
          "F"
        );
        barY += 8;
      });
      cursorY += rowHeight;
    });
    cursorY += 7;
  }

  function tableRecordLines(table: SectionExportTable, row: string[]) {
    return table.headers.flatMap((header, index) => {
      const value = pdfText(row[index]).trim();
      if (!value) return [];
      return wrappedLines(document, `${header}: ${value}`, contentWidth - 24);
    });
  }

  function drawTable(table: SectionExportTable) {
    drawSectionTitle(table.title);
    if (table.rows.length === 0) {
      document.setFont("helvetica", "italic");
      document.setFontSize(9);
      setTextColor(document, slate);
      document.text("No rows for this range.", pageMargin, cursorY + 10);
      cursorY += 24;
      return;
    }

    table.rows.forEach((row, rowIndex) => {
      const lines = tableRecordLines(table, row);
      const lineHeight = 9.2;
      const fullHeight = 28 + lines.length * lineHeight;
      const maximumCardHeight = contentBottom - (pageMargin + 24);

      if (fullHeight <= maximumCardHeight) {
        ensureSpace(fullHeight + 8);
        setFillColor(document, [255, 255, 255]);
        setDrawColor(document, border);
        document.roundedRect(
          pageMargin,
          cursorY,
          contentWidth,
          fullHeight,
          4,
          4,
          "FD"
        );
        document.setFont("helvetica", "bold");
        document.setFontSize(9);
        setTextColor(document, navy);
        document.text(`Record ${rowIndex + 1}`, pageMargin + 10, cursorY + 13);
        document.setFont("helvetica", "normal");
        document.setFontSize(7.8);
        setTextColor(document, slate);
        document.text(lines, pageMargin + 10, cursorY + 27, {
          lineHeightFactor: 1.18,
        });
        cursorY += fullHeight + 8;
        return;
      }

      let lineIndex = 0;
      while (lineIndex < lines.length) {
        ensureSpace(45);
        document.setFont("helvetica", "bold");
        document.setFontSize(9);
        setTextColor(document, navy);
        document.text(
          `Record ${rowIndex + 1}${lineIndex > 0 ? " - continued" : ""}`,
          pageMargin,
          cursorY + 10
        );
        cursorY += 18;
        const availableLines = Math.max(
          1,
          Math.floor((contentBottom - cursorY) / lineHeight)
        );
        const chunk = lines.slice(lineIndex, lineIndex + availableLines);
        document.setFont("helvetica", "normal");
        document.setFontSize(7.8);
        setTextColor(document, slate);
        document.text(chunk, pageMargin, cursorY + 8, { lineHeightFactor: 1.18 });
        cursorY += chunk.length * lineHeight + 8;
        lineIndex += chunk.length;
        if (lineIndex < lines.length) addPage();
      }
      cursorY += 4;
    });
  }

  setDrawColor(document, teal);
  document.setLineWidth(5);
  document.line(pageMargin, pageMargin, pageWidth - pageMargin, pageMargin);
  document.setFont("helvetica", "bold");
  document.setFontSize(8);
  setTextColor(document, teal);
  document.text(pdfText(siteName).toUpperCase(), pageMargin, pageMargin + 18);
  document.setFont("helvetica", "normal");
  setTextColor(document, slate);
  document.text(
    `${pdfText(packet.range.from)} to ${pdfText(packet.range.to)}`,
    pageWidth - pageMargin,
    pageMargin + 18,
    { align: "right" }
  );

  const titleLines = wrappedLines(document, packet.title, contentWidth);
  document.setFont("helvetica", "bold");
  document.setFontSize(21);
  setTextColor(document, navy);
  document.text(titleLines, pageMargin, pageMargin + 45, { lineHeightFactor: 1.12 });
  cursorY = pageMargin + 48 + titleLines.length * 23;
  document.setFontSize(10);
  setTextColor(document, slate);
  document.text(pdfText(packet.caseName), pageMargin, cursorY);
  document.setFont("helvetica", "normal");
  document.setFontSize(8);
  document.text(
    `Generated ${pdfText(packet.generatedAt)}`,
    pageWidth - pageMargin,
    cursorY,
    { align: "right" }
  );
  cursorY += 14;

  drawTextBlock(packet.disclaimer, {
    background: [255, 251, 235],
    borderColor: [252, 211, 77],
    color: [113, 63, 18],
    fontSize: 8.5,
  });
  drawMetrics();

  packet.summaries.forEach((summary, index) => {
    drawTextBlock(summary, {
      background: index === 0 ? [236, 253, 245] : lightSlate,
      borderColor: index === 0 ? [153, 246, 228] : border,
      color: index === 0 ? [19, 78, 74] : slate,
      bold: index === 0,
      fontSize: 9,
    });
  });

  drawSectionTitle("Charts");
  if (packet.charts.length === 0) {
    document.setFont("helvetica", "italic");
    document.setFontSize(9);
    setTextColor(document, slate);
    document.text("No chart data for this range.", pageMargin, cursorY + 10);
    cursorY += 24;
  } else {
    packet.charts.forEach(drawChart);
  }

  drawSectionTitle("Before sharing");
  packet.suggestedUses.forEach((use) => {
    const lines = wrappedLines(document, `- ${use}`, contentWidth - 8);
    const height = Math.max(13, lines.length * 11);
    ensureSpace(height);
    document.setFont("helvetica", "normal");
    document.setFontSize(8.5);
    setTextColor(document, slate);
    document.text(lines, pageMargin + 4, cursorY + 8, { lineHeightFactor: 1.25 });
    cursorY += height;
  });
  cursorY += 4;

  packet.tables.forEach(drawTable);

  const pageCount = document.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    document.setPage(page);
    setDrawColor(document, border);
    document.setLineWidth(0.5);
    document.line(pageMargin, footerTop, pageWidth - pageMargin, footerTop);
    document.setFont("helvetica", "normal");
    document.setFontSize(7.5);
    setTextColor(document, slate);
    document.text(pdfText(siteName), pageMargin, footerTop + 13);
    document.text(`Page ${page} of ${pageCount}`, pageWidth - pageMargin, footerTop + 13, {
      align: "right",
    });
  }

  const output = document.output("arraybuffer");
  return {
    blob: new Blob([output], { type: "application/pdf" }),
    byteLength: output.byteLength,
    pageCount,
  };
}
