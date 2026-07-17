import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createImportPreview } from "@/lib/import/import-service";
import { ensureBaselineData } from "@/lib/seed";

export const runtime = "nodejs";

export async function GET() {
  try {
    await ensureBaselineData();
    const batches = await prisma.importBatch.findMany({
      include: {
        platform: true
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 8
    });

    return NextResponse.json(
      batches.map((batch) => ({
        id: batch.id,
        platform: batch.platform.displayName,
        platformSlug: batch.platform.slug,
        sourceFileName: batch.sourceFileName,
        status: batch.status,
        totalRows: batch.totalRows,
        successCount: batch.successCount,
        warningCount: batch.warningCount,
        failedCount: batch.failedCount,
        duplicateCount: batch.duplicateCount,
        createdAt: batch.createdAt.toISOString(),
        committedAt: batch.committedAt?.toISOString() ?? null
      }))
    );
  } catch (error) {
    console.error("Failed to load import batches", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "读取导入批次失败"
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const platformSlug = String(form.get("platform") ?? "");
    const file = form.get("file");

    if (!platformSlug) {
      return NextResponse.json({ error: "请选择平台" }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "请上传 Excel 文件" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const batch = await createImportPreview({
      platformSlug,
      fileName: file.name,
      buffer
    });

    return NextResponse.json(batch);
  } catch (error) {
    console.error("Failed to create import preview", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "上传并预览失败"
      },
      { status: 500 }
    );
  }
}
