import { readFileSync } from "node:fs";
import { parseWorkbook } from "../src/lib/import/workbook-parser";

const file = process.argv[2];
if (!file) {
  console.error("Usage: pnpm phase0:inspect <xlsx-file> [platform]");
  process.exit(1);
}
const platformSlug = process.argv[3];

const preview = parseWorkbook(readFileSync(file), { platformSlug });
const byStatus = preview.rows.reduce<Record<string, number>>((acc, row) => {
  acc[row.status] = (acc[row.status] ?? 0) + 1;
  return acc;
}, {});

console.log(JSON.stringify({ sheets: preview.sheets, totalRows: preview.rows.length, byStatus }, null, 2));
console.log(
  preview.rows.slice(0, 5).map((row) => ({
    sheetName: row.sheetName,
    sourceRowNumber: row.sourceRowNumber,
    brandSlug: row.brandSlug,
    status: row.status,
    caption: row.normalizedData.captionNormalized.slice(0, 80),
    likesRaw: row.normalizedData.likesRaw,
    likesCount: row.normalizedData.likesCount,
    publishDate: row.normalizedData.publishDate,
    canonicalUrl: row.normalizedData.canonicalUrl,
    warnings: row.warnings,
    errors: row.errors
  }))
);
