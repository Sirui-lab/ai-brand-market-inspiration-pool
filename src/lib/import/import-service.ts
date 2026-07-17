import crypto from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { ImportBatchItem, ImportItemStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ensureBaselineData } from "@/lib/seed";
import { getVisualAssetUrl } from "@/lib/collect/post-media";
import { parseWorkbook } from "@/lib/import/workbook-parser";
import type { ParsedImportRow } from "@/lib/import/types";

function hashBuffer(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function detectDuplicate(platformId: string, row: ParsedImportRow): Promise<string | null> {
  const normalized = row.normalizedData;
  if (normalized.externalPostId) {
    const byExternalId = await prisma.post.findFirst({
      where: { platformId, externalPostId: normalized.externalPostId },
      select: { id: true }
    });
    if (byExternalId) return byExternalId.id;
  }

  if (normalized.canonicalUrl) {
    const byUrl = await prisma.post.findUnique({
      where: { canonicalUrl: normalized.canonicalUrl },
      select: { id: true }
    });
    if (byUrl) return byUrl.id;
  }

  const byFingerprint = await prisma.post.findFirst({
    where: {
      platformId,
      contentFingerprint: normalized.contentFingerprint
    },
    select: { id: true }
  });
  return byFingerprint?.id ?? null;
}

async function detectDuplicateFromNormalized(
  platformId: string,
  normalized: ParsedImportRow["normalizedData"],
  tx: Prisma.TransactionClient
): Promise<string | null> {
  if (normalized.externalPostId) {
    const byExternalId = await tx.post.findFirst({
      where: { platformId, externalPostId: normalized.externalPostId },
      select: { id: true }
    });
    if (byExternalId) return byExternalId.id;
  }

  if (normalized.canonicalUrl) {
    const byUrl = await tx.post.findUnique({
      where: { canonicalUrl: normalized.canonicalUrl },
      select: { id: true }
    });
    if (byUrl) return byUrl.id;
  }

  const byFingerprint = await tx.post.findFirst({
    where: {
      platformId,
      contentFingerprint: normalized.contentFingerprint
    },
    select: { id: true }
  });
  return byFingerprint?.id ?? null;
}

function itemStatus(row: ParsedImportRow, duplicatePostId: string | null): ImportItemStatus {
  if (row.errors.length) return "error";
  if (duplicatePostId) return "duplicate";
  return row.warnings.length ? "warning" : "valid";
}

export async function createImportPreview(input: {
  platformSlug: string;
  fileName: string;
  buffer: Buffer;
}) {
  await ensureBaselineData();
  const platform = await prisma.platform.findUniqueOrThrow({
    where: { slug: input.platformSlug }
  });
  const parsed = parseWorkbook(input.buffer, { platformSlug: input.platformSlug });
  const fileHash = hashBuffer(input.buffer);

  const batch = await prisma.importBatch.create({
    data: {
      platformId: platform.id,
      sourceFileName: input.fileName,
      sourceFileHash: fileHash,
      status: "uploaded"
    }
  });

  let failedCount = 0;
  let duplicateCount = 0;
  let warningCount = 0;

  for (const row of parsed.rows) {
    const brand = row.brandSlug
      ? await prisma.brand.findUnique({ where: { slug: row.brandSlug } })
      : null;
    const duplicatePostId = row.errors.length ? null : await detectDuplicate(platform.id, row);
    const status = itemStatus(row, duplicatePostId);
    if (status === "error") failedCount += 1;
    if (status === "duplicate") duplicateCount += 1;
    if (status === "warning") warningCount += 1;

    await prisma.importBatchItem.create({
      data: {
        importBatchId: batch.id,
        sheetName: row.sheetName,
        sourceRowNumber: row.sourceRowNumber,
        brandId: brand?.id,
        status,
        rawDataJson: JSON.stringify(row.rawData),
        normalizedDataJson: JSON.stringify(row.normalizedData),
        warningsJson: JSON.stringify(row.warnings),
        errorsJson: JSON.stringify(row.errors),
        duplicatePostId
      }
    });
  }

  const successCount = parsed.rows.length - failedCount - duplicateCount;
  await prisma.importBatch.update({
    where: { id: batch.id },
    data: {
      status: "preview_ready",
      totalRows: parsed.rows.length,
      successCount,
      warningCount,
      failedCount,
      duplicateCount
    }
  });

  return getImportBatch(batch.id);
}

export async function getImportBatch(id: string) {
  return prisma.importBatch.findUniqueOrThrow({
    where: { id },
    include: {
      platform: true,
      items: {
        include: { brand: true },
        orderBy: [{ sheetName: "asc" }, { sourceRowNumber: "asc" }]
      }
    }
  });
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

export async function commitImportBatch(id: string) {
  const batch = await prisma.importBatch.findUniqueOrThrow({
    where: { id },
    include: { items: true }
  });

  if (batch.status === "committed") {
    return getImportBatch(id);
  }

  await prisma.$transaction(async (tx) => {
    for (const item of batch.items) {
      if (item.status === "error" || item.status === "duplicate" || item.createdPostId) {
        continue;
      }
      const normalized = parseJson<ParsedImportRow["normalizedData"]>(item.normalizedDataJson);
      if (!item.brandId) continue;
      const coverImageUrl = getVisualAssetUrl(normalized.visualReferenceNote);

      const duplicatePostId = await detectDuplicateFromNormalized(batch.platformId, normalized, tx);
      if (duplicatePostId) {
        if (coverImageUrl || normalized.likesCount !== null || normalized.likesRaw) {
          const duplicate = await tx.post.findUnique({
            where: { id: duplicatePostId },
            select: { coverImageUrl: true, likesCount: true, likesRaw: true, likesCapturedAt: true, case: { select: { id: true } } }
          });
          if (duplicate) {
            await tx.post.update({
              where: { id: duplicatePostId },
              data: {
                ...(coverImageUrl && !duplicate.coverImageUrl ? { coverImageUrl } : {}),
                ...(duplicate.likesCount === null && !duplicate.likesRaw && (normalized.likesCount !== null || normalized.likesRaw)
                  ? {
                      likesCount: normalized.likesCount,
                      likesRaw: normalized.likesRaw ?? (normalized.likesCount === null ? null : String(normalized.likesCount)),
                      likesCapturedAt: duplicate.likesCapturedAt ?? new Date()
                    }
                  : {})
              }
            });
            if (coverImageUrl && duplicate.case?.id) {
              const analysis = await tx.caseAnalysis.findFirst({
                where: { caseId: duplicate.case.id },
                orderBy: { version: "desc" },
                select: { id: true, visualReferenceNote: true }
              });
              if (analysis && !getVisualAssetUrl(analysis.visualReferenceNote)) {
                await tx.caseAnalysis.update({
                  where: { id: analysis.id },
                  data: { visualReferenceNote: coverImageUrl }
                });
              }
            }
          }
        }
        await tx.importBatchItem.update({
          where: { id: item.id },
          data: {
            status: "duplicate",
            duplicatePostId
          }
        });
        continue;
      }

      const post = await tx.post.create({
        data: {
          platformId: batch.platformId,
          brandId: item.brandId,
          sourceType: "manual_import",
          sourceRecordId: `${item.sheetName}:${item.sourceRowNumber}`,
          importBatchId: batch.id,
          externalPostId: normalized.externalPostId,
          canonicalUrl: normalized.canonicalUrl,
          sourceUrl: normalized.sourceUrl,
          postTypeLabel: normalized.postTypeLabel,
          captionRaw: normalized.captionRaw,
          captionNormalized: normalized.captionNormalized,
          publishDate: normalized.publishDate ? new Date(normalized.publishDate) : null,
          coverImageUrl,
          likesCount: normalized.likesCount,
          likesRaw: normalized.likesRaw,
          likesCapturedAt: normalized.likesCount === null ? null : new Date(),
          dataStatus: item.status === "warning" ? "partial" : "complete",
          reviewStatus: "imported",
          contentFingerprint: normalized.contentFingerprint
        }
      });

      const caseRecord = await tx.case.create({
        data: { postId: post.id }
      });

      await tx.caseAnalysis.create({
        data: {
          caseId: caseRecord.id,
          source: "human",
          status:
            normalized.postStructureAnalysis &&
            normalized.postContentAnalysis &&
            normalized.visualDesignAnalysis
              ? "completed"
              : "partial",
          version: 1,
          postStructureAnalysis: normalized.postStructureAnalysis,
          postContentAnalysis: normalized.postContentAnalysis,
          visualDesignAnalysis: normalized.visualDesignAnalysis,
          importedExtraAnalysis: normalized.importedExtraAnalysis,
          visualReferenceNote: normalized.visualReferenceNote,
          rawAnalysisJson: JSON.stringify({
            postStructureAnalysis: normalized.postStructureAnalysis,
            postContentAnalysis: normalized.postContentAnalysis,
            visualDesignAnalysis: normalized.visualDesignAnalysis,
            importedExtraAnalysis: normalized.importedExtraAnalysis
          }),
          isHumanConfirmed: true,
          analyzedBy: "historical_import",
          analyzedAt: new Date()
        }
      });

      await tx.importBatchItem.update({
        where: { id: item.id },
        data: {
          status: "imported",
          createdPostId: post.id,
          createdCaseId: caseRecord.id
        }
      });
    }

    await tx.importBatch.update({
      where: { id },
      data: { status: "committed", committedAt: new Date() }
    });
  });

  return getImportBatch(id);
}

export type ImportBatchWithItems = Awaited<ReturnType<typeof getImportBatch>>;
