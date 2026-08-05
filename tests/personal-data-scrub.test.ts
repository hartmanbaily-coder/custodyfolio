import { describe, expect, it } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const sourceRoots = [
  "src",
  "public",
  "ios/CustodyFolio/CustodyFolio",
];
const textExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".sql",
  ".swift",
  ".ts",
  ".tsx",
]);

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(path);
      return textExtensions.has(extname(entry.name).toLowerCase()) ? [path] : [];
    })
  );
  return files.flat();
}

describe("web and iOS personal-data scrub", () => {
  it("contains no native phone numbers, developer home paths, or unapproved email addresses", async () => {
    const files = (await Promise.all(sourceRoots.map(sourceFiles))).flat();
    const findings: string[] = [];

    for (const file of files) {
      const content = await readFile(file, "utf8");
      const label = relative(process.cwd(), file);
      if (/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/.test(content)) {
        findings.push(`${label}: phone-like value`);
      }
      if (/\/Users\/[^/\s"'`]+/.test(content)) {
        findings.push(`${label}: developer home path`);
      }

      const emails = content.match(/[A-Z0-9._%+-]+@[A-Z][A-Z0-9.-]*\.[A-Z]{2,}/gi) || [];
      for (const email of emails) {
        const normalized = email.toLowerCase();
        const approved =
          normalized === "support@custodyfolio.com" ||
          normalized === "privacy@custodyfolio.com" ||
          normalized === "security@custodyfolio.com" ||
          normalized.endsWith("@example.test") ||
          normalized.endsWith("@example.invalid");
        if (!approved) findings.push(`${label}: unapproved email domain`);
      }
    }

    expect(findings).toEqual([]);
  });
});
