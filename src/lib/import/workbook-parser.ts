import * as XLSX from "xlsx";
import { resolveBrandSlug } from "@/lib/brand-config";
import { buildHeaderMap } from "@/lib/import/headers";
import {
  canonicalizeUrl,
  makeFingerprint,
  normalizeCaption,
  normalizeText,
  parseLikes,
  parsePublishDate
} from "@/lib/import/normalizers";
import type { ParsedImportRow, WorkbookPreview } from "@/lib/import/types";

function cellValue(row: Record<string, unknown>, column?: string): unknown {
  return column ? row[column] : undefined;
}

function isMostlyEmpty(row: Record<string, unknown>): boolean {
  return Object.values(row).filter((value) => normalizeText(value)).length === 0;
}

function findHeaderIndex(headers: unknown[], header?: string): number {
  if (!header) return -1;
  return headers.findIndex((value) => String(value ?? "") === header);
}

function hyperlinkTarget(sheet: XLSX.WorkSheet, rowIndex: number, columnIndex: number): string | null {
  if (columnIndex < 0) return null;
  const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
  const cell = sheet[address] as XLSX.CellObject & {
    l?: { Target?: string; target?: string; display?: string };
  };
  return cell?.l?.Target ?? cell?.l?.target ?? cell?.l?.display ?? null;
}

export function parseWorkbook(
  buffer: Buffer,
  options: { platformSlug?: string } = {}
): WorkbookPreview {
  const allowMissingPublishDate = options.platformSlug === "linkedin";
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    cellDates: false,
    cellFormula: false,
    cellHTML: false,
    cellNF: false,
    cellStyles: false
  });

  const rows: ParsedImportRow[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: false,
      defval: ""
    });

    const headerIndex = matrix.findIndex((row) =>
      row.some((value) => normalizeText(value) === "post内容")
    );
    if (headerIndex < 0) continue;

    const headers = matrix[headerIndex];
    const headerMap = buildHeaderMap(headers);
    const sourceUrlIndex = findHeaderIndex(headers, headerMap.sourceUrl);
    const brandSlug = resolveBrandSlug(sheetName);

    const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      range: headerIndex,
      raw: false,
      defval: ""
    });

    jsonRows.forEach((row, index) => {
      const sourceRowNumber = headerIndex + index + 2;
      if (isMostlyEmpty(row)) return;

      const captionRaw = normalizeText(cellValue(row, headerMap.caption));
      const captionNormalized = normalizeCaption(captionRaw);
      const likes = parseLikes(cellValue(row, headerMap.likes));
      const publishDate = parsePublishDate(cellValue(row, headerMap.publishDate));
      const sourceUrlValue =
        cellValue(row, headerMap.sourceUrl) ||
        hyperlinkTarget(sheet, sourceRowNumber - 1, sourceUrlIndex);
      const url = canonicalizeUrl(sourceUrlValue);
      const postStructureAnalysis = normalizeText(cellValue(row, headerMap.structure)) || null;
      const postContentAnalysis = normalizeText(cellValue(row, headerMap.content)) || null;
      const visualDesignAnalysis = normalizeText(cellValue(row, headerMap.visual)) || null;
      const importedExtraAnalysis = normalizeText(cellValue(row, headerMap.extra)) || null;
      const warnings = [
        likes.warning,
        publishDate.warning,
        url.warning,
        !allowMissingPublishDate && !publishDate.date ? "发布时间为空" : null,
        !url.canonicalUrl ? "原帖链接为空或无法规范化" : null,
        !postStructureAnalysis ? "结构分析为空" : null,
        !postContentAnalysis ? "内容分析为空" : null,
        !visualDesignAnalysis ? "视觉分析为空" : null
      ].filter(Boolean) as string[];
      const errors = [
        !brandSlug ? `无法从 sheet 名识别品牌: ${sheetName}` : null,
        !captionRaw ? "post内容为空" : null,
        !postStructureAnalysis && !postContentAnalysis && !visualDesignAnalysis
          ? "三个核心分析字段全为空"
          : null
      ].filter(Boolean) as string[];

      const contentFingerprint = makeFingerprint([
        sheetName,
        captionNormalized,
        url.canonicalUrl ?? ""
      ]);

      rows.push({
        sheetName,
        sourceRowNumber,
        brandSlug,
        status: errors.length ? "error" : warnings.length ? "warning" : "valid",
        rawData: row,
        normalizedData: {
          postTypeLabel: normalizeText(cellValue(row, headerMap.postType)) || null,
          captionRaw,
          captionNormalized,
          likesRaw: likes.raw,
          likesCount: likes.count,
          publishDate: publishDate.date?.toISOString() ?? null,
          sourceUrl: url.sourceUrl,
          canonicalUrl: url.canonicalUrl,
          externalPostId: url.externalPostId,
          postStructureAnalysis,
          postContentAnalysis,
          visualDesignAnalysis,
          importedExtraAnalysis,
          visualReferenceNote: normalizeText(cellValue(row, headerMap.visualReference)) || null,
          contentFingerprint
        },
        warnings,
        errors
      });
    });
  }

  return {
    rows,
    sheets: workbook.SheetNames
  };
}
