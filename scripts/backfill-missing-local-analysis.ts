import { prisma } from "@/lib/db";
import { buildLocalCaseAnalysis } from "@/lib/analysis/local-case-analysis";
import { resolvePostCoverUrl } from "@/lib/collect/post-media";

async function main() {
  const posts = await prisma.post.findMany({
    where: {
      case: {
        analyses: {
          some: {
            source: "human",
            postStructureAnalysis: null,
            postContentAnalysis: null,
            visualDesignAnalysis: null
          }
        }
      }
    },
    include: {
      brand: true,
      platform: true,
      case: {
        include: {
          analyses: {
            where: { source: "human" },
            orderBy: { version: "desc" },
            take: 1
          }
        }
      }
    },
    take: 500
  });
  const stats = { scanned: posts.length, updated: 0 };

  for (const post of posts) {
    const analysis = post.case?.analyses[0];
    if (!post.case || !analysis) continue;
    const cover = resolvePostCoverUrl({
      coverImageUrl: post.coverImageUrl,
      visualReferenceNote: analysis.visualReferenceNote,
      sourceUrl: post.sourceUrl,
      canonicalUrl: post.canonicalUrl
    });
    const localAnalysis = buildLocalCaseAnalysis({
      caption: post.captionNormalized || post.captionRaw,
      platform: post.platform.displayName,
      brand: post.brand.displayName,
      url: post.sourceUrl ?? post.canonicalUrl,
      publishedAt: post.publishDate,
      likesCount: post.likesCount,
      visualReferenceNote: cover,
      rawContext: {
        source: "missing_analysis_backfill",
        postId: post.id
      }
    });

    await prisma.caseAnalysis.update({
      where: { id: analysis.id },
      data: {
        status: localAnalysis.status,
        postStructureAnalysis: localAnalysis.postStructureAnalysis,
        postContentAnalysis: localAnalysis.postContentAnalysis,
        visualDesignAnalysis: localAnalysis.visualDesignAnalysis,
        visualReferenceNote: cover ?? analysis.visualReferenceNote,
        rawAnalysisJson: localAnalysis.rawAnalysisJson,
        analyzedBy: "local_case_analysis",
        analyzedAt: new Date()
      }
    });
    stats.updated += 1;
  }

  console.log(JSON.stringify(stats, null, 2));
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
