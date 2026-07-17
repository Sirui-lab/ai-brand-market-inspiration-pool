import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { normalizeCaption, normalizeText, parseLikes } from "@/lib/import/normalizers";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const caseRecord = await prisma.case.findUniqueOrThrow({
    where: { id },
    include: {
      post: { include: { brand: true, platform: true } },
      analyses: { orderBy: [{ source: "asc" }, { version: "desc" }] }
    }
  });
  return NextResponse.json(caseRecord);
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const captionRaw = normalizeText(body.captionRaw);
    const shouldUpdateLikes = Object.prototype.hasOwnProperty.call(body, "likesRaw") && Boolean(normalizeText(body.likesRaw));
    const likesRaw = normalizeText(body.likesRaw);
    const postStructureAnalysis = normalizeText(body.postStructureAnalysis) || null;
    const postContentAnalysis = normalizeText(body.postContentAnalysis) || null;
    const visualDesignAnalysis = normalizeText(body.visualDesignAnalysis) || null;
    const visualReferenceNote = normalizeText(body.visualReferenceNote) || null;
    const likes = shouldUpdateLikes ? parseLikes(likesRaw) : null;

    if (!captionRaw) {
      return NextResponse.json({ error: "请填写 post 内容" }, { status: 400 });
    }

    const caseRecord = await prisma.case.findUniqueOrThrow({
      where: { id },
      include: {
        post: true,
        analyses: {
          where: { source: "human" },
          orderBy: { version: "desc" },
          take: 1
        }
      }
    });
    const analysis = caseRecord.analyses[0];

    const updated = await prisma.$transaction(async (tx) => {
      await tx.post.update({
        where: { id: caseRecord.postId },
        data: {
          captionRaw,
          captionNormalized: normalizeCaption(captionRaw),
          ...(likes
            ? {
                likesRaw: likes.raw,
                likesCount: likes.count,
                likesCapturedAt: likes.count === null ? caseRecord.post.likesCapturedAt : new Date()
              }
            : {}),
          dataStatus: "partial",
          reviewStatus: "imported"
        }
      });

      if (analysis) {
        await tx.caseAnalysis.update({
          where: { id: analysis.id },
          data: {
            status:
              postStructureAnalysis && postContentAnalysis && visualDesignAnalysis
                ? "completed"
                : "partial",
            postStructureAnalysis,
            postContentAnalysis,
            visualDesignAnalysis,
            visualReferenceNote,
            rawAnalysisJson: JSON.stringify({
              postStructureAnalysis,
              postContentAnalysis,
              visualDesignAnalysis,
              visualReferenceNote,
              source: "manual_review"
            }),
            isHumanConfirmed: true,
            analyzedBy: "manual_review",
            analyzedAt: new Date()
          }
        });
      } else {
        await tx.caseAnalysis.create({
          data: {
            caseId: id,
            source: "human",
            status:
              postStructureAnalysis && postContentAnalysis && visualDesignAnalysis
                ? "completed"
                : "partial",
            version: 1,
            postStructureAnalysis,
            postContentAnalysis,
            visualDesignAnalysis,
            visualReferenceNote,
            rawAnalysisJson: JSON.stringify({
              postStructureAnalysis,
              postContentAnalysis,
              visualDesignAnalysis,
              visualReferenceNote,
              source: "manual_review"
            }),
            isHumanConfirmed: true,
            analyzedBy: "manual_review",
            analyzedAt: new Date()
          }
        });
      }

      return tx.case.findUniqueOrThrow({
        where: { id },
        include: {
          post: { include: { brand: true, platform: true } },
          analyses: { orderBy: [{ source: "asc" }, { version: "desc" }] }
        }
      });
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to update case", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "保存案例失败" },
      { status: 500 }
    );
  }
}
