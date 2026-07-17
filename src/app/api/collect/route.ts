import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildLocalCaseAnalysis } from "@/lib/analysis/local-case-analysis";
import { analyzeCollectUrl, makeCollectFingerprint } from "@/lib/collect/url-intake";
import { fetchPublicMetadata, metadataToCaption } from "@/lib/collect/metadata-fetcher";
import { ensureBaselineData } from "@/lib/seed";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await ensureBaselineData();
    const body = await request.json();
    const inputUrl = String(body.url ?? "");
    const selectedBrandSlug = body.brandSlug ? String(body.brandSlug) : null;
    const note = body.note ? String(body.note).trim() : "";
    const analyzed = analyzeCollectUrl(inputUrl);

    if (!analyzed.canonicalUrl || !analyzed.platformSlug) {
      return NextResponse.json({ error: analyzed.warning ?? "请输入支持的平台原帖链接" }, { status: 400 });
    }

    const platform = await prisma.platform.findUnique({ where: { slug: analyzed.platformSlug } });
    if (!platform) {
      return NextResponse.json({ error: "暂不支持该平台" }, { status: 400 });
    }

    const brandSlug = selectedBrandSlug || analyzed.brandSlug;
    if (!brandSlug) {
      return NextResponse.json({ error: "无法自动识别品牌，请手动选择品牌" }, { status: 400 });
    }

    const brand = await prisma.brand.findUnique({ where: { slug: brandSlug } });
    if (!brand) {
      return NextResponse.json({ error: "品牌不存在" }, { status: 400 });
    }

    const duplicateFilters = [
      { canonicalUrl: analyzed.canonicalUrl },
      analyzed.externalPostId
        ? { platformId: platform.id, externalPostId: analyzed.externalPostId }
        : null
    ].filter((item): item is { canonicalUrl: string } | { platformId: string; externalPostId: string } =>
      Boolean(item)
    );

    const existing = await prisma.post.findFirst({
      where: { OR: duplicateFilters },
      include: { platform: true, brand: true }
    });

    if (existing) {
      return NextResponse.json({
        status: "duplicate",
        post: existing,
        metadata: null,
        message: "这个链接已经在 Local Inspiration Library 里"
      });
    }

    const metadata = await fetchPublicMetadata(analyzed.canonicalUrl);
    const caption = note || metadataToCaption(metadata, analyzed.canonicalUrl);
    const localAnalysis = buildLocalCaseAnalysis({
      caption,
      platform: platform.displayName,
      brand: brand.displayName,
      url: analyzed.sourceUrl,
      visualReferenceNote: metadata.imageUrl,
      rawContext: { note, intake: "url_collect", metadata }
    });
    const post = await prisma.post.create({
      data: {
        platformId: platform.id,
        brandId: brand.id,
        sourceType: "browser_collect",
        sourceRecordId: `collect:${analyzed.canonicalUrl}`,
        externalPostId: analyzed.externalPostId,
        canonicalUrl: analyzed.canonicalUrl,
        sourceUrl: analyzed.sourceUrl,
        captionRaw: caption,
        captionNormalized: caption,
        dataStatus: "partial",
        reviewStatus: "needs_review",
        contentFingerprint: makeCollectFingerprint(analyzed.canonicalUrl, caption),
        case: {
          create: {
            analyses: {
              create: {
                source: "human",
                status: localAnalysis.status,
                version: 1,
                postStructureAnalysis: localAnalysis.postStructureAnalysis,
                postContentAnalysis: localAnalysis.postContentAnalysis,
                visualDesignAnalysis: localAnalysis.visualDesignAnalysis,
                visualReferenceNote: localAnalysis.visualReferenceNote,
                rawAnalysisJson: localAnalysis.rawAnalysisJson,
                isHumanConfirmed: false,
                analyzedBy: "local_case_analysis"
              }
            }
          }
        }
      },
      include: {
        platform: true,
        brand: true,
        case: { include: { analyses: true } }
      }
    });

    return NextResponse.json({
      status: "created",
      post,
      inferred: {
        platformSlug: analyzed.platformSlug,
        brandSlug,
        handle: analyzed.handle
      },
      metadata
    });
  } catch (error) {
    console.error("Failed to collect URL", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "保存链接失败" },
      { status: 500 }
    );
  }
}
