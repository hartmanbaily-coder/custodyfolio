import type { MetadataRoute } from "next";

const publicPaths = [
  "",
  "/guides/factual-custody-record-checklist",
  "/privacy",
  "/consumer-health-data",
  "/terms",
  "/security",
  "/ai-data-use",
  "/subprocessors",
  "/accessibility",
  "/open-source",
  "/contact",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date("2026-08-30T00:00:00.000Z");

  return publicPaths.map((path) => ({
    url: `https://custodyfolio.com${path || "/"}`,
    lastModified,
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : path.startsWith("/guides/") ? 0.8 : 0.5,
  }));
}
