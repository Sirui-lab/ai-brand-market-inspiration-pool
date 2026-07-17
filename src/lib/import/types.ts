import type { ImportItemStatus } from "@prisma/client";

export type ParsedImportRow = {
  sheetName: string;
  sourceRowNumber: number;
  brandSlug: string | null;
  status: ImportItemStatus;
  rawData: Record<string, unknown>;
  normalizedData: {
    postTypeLabel: string | null;
    captionRaw: string;
    captionNormalized: string;
    likesRaw: string | null;
    likesCount: number | null;
    publishDate: string | null;
    sourceUrl: string | null;
    canonicalUrl: string | null;
    externalPostId: string | null;
    postStructureAnalysis: string | null;
    postContentAnalysis: string | null;
    visualDesignAnalysis: string | null;
    importedExtraAnalysis: string | null;
    visualReferenceNote: string | null;
    contentFingerprint: string;
  };
  warnings: string[];
  errors: string[];
};

export type WorkbookPreview = {
  rows: ParsedImportRow[];
  sheets: string[];
};
