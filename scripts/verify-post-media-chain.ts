import { saveRecentPost } from "@/lib/collect/recent-post-save";
import type { RecentPost } from "@/lib/collect/recent-post-fetcher";
import { resolvePostCoverUrl } from "@/lib/collect/post-media";
import { prisma } from "@/lib/db";
import { ensureBaselineData } from "@/lib/seed";

const stamp = Date.now();
const samples: RecentPost[] = [
  {
    id: `verify-youtube-${stamp}`,
    title: "Verification YouTube post",
    url: `https://youtu.be/verifyYT${stamp}`,
    publishedAt: new Date().toISOString(),
    author: "openai",
    excerpt: "Temporary verification item",
    platformSlug: "youtube",
    coverUrl: `https://i.ytimg.com/vi/verifyYT${stamp}/hqdefault.jpg`,
    thumbnailUrl: `https://i.ytimg.com/vi/verifyYT${stamp}/hqdefault.jpg`,
    likesCount: 1200,
    likesRaw: "1200"
  },
  {
    id: `verify-reddit-${stamp}`,
    title: "Verification Reddit post",
    url: `https://www.reddit.com/r/OpenAI/comments/verify${stamp}/verification/`,
    publishedAt: new Date().toISOString(),
    author: "OpenAI",
    excerpt: "Temporary verification item",
    platformSlug: "reddit",
    coverUrl: `https://preview.redd.it/verify${stamp}.jpg?width=640&format=pjpg&auto=webp&s=test`,
    thumbnailUrl: `https://preview.redd.it/verify${stamp}.jpg?width=640&format=pjpg&auto=webp&s=test`,
    likesCount: 321,
    likesRaw: "321"
  },
  {
    id: `verify-instagram-${stamp}`,
    title: "Verification Instagram post",
    url: `https://www.instagram.com/p/verify${stamp}/`,
    publishedAt: new Date().toISOString(),
    author: "openai",
    excerpt: "Temporary verification item",
    platformSlug: "instagram",
    coverUrl: `https://instagram.fverify.test/verify${stamp}.jpg`,
    thumbnailUrl: `https://instagram.fverify.test/verify${stamp}.jpg`,
    likesCount: 9876,
    likesRaw: "9876"
  }
];

async function main() {
  await ensureBaselineData();
  const savedIds: string[] = [];
  const results = [];

  try {
    for (const sample of samples) {
      const result = await saveRecentPost(sample, "chatgpt");
      if (!result.postId) throw new Error(`Save failed for ${sample.platformSlug}: ${result.message}`);
      savedIds.push(result.postId);
      results.push(await inspectPost(result.postId, sample.platformSlug));
    }

    const duplicateSeed: RecentPost = {
      id: `verify-duplicate-${stamp}`,
      title: "Verification duplicate seed",
      url: `https://youtu.be/verifyDup${stamp}`,
      publishedAt: new Date().toISOString(),
      author: "openai",
      excerpt: null,
      platformSlug: "youtube"
    };
    const seedResult = await saveRecentPost(duplicateSeed, "chatgpt");
    if (!seedResult.postId) throw new Error(`Duplicate seed save failed: ${seedResult.message}`);
    savedIds.push(seedResult.postId);

    const duplicateResult = await saveRecentPost(
      {
        ...duplicateSeed,
        coverUrl: `https://i.ytimg.com/vi/verifyDup${stamp}/hqdefault.jpg`,
        thumbnailUrl: `https://i.ytimg.com/vi/verifyDup${stamp}/hqdefault.jpg`,
        likesCount: 555,
        likesRaw: "555"
      },
      "chatgpt"
    );
    results.push({
      duplicateStatus: duplicateResult.status,
      duplicateMessage: duplicateResult.message,
      ...(await inspectPost(seedResult.postId, "youtube-duplicate"))
    });

    console.log(JSON.stringify(results, null, 2));
  } finally {
    await cleanup(savedIds);
    await prisma.$disconnect();
  }
}

async function inspectPost(postId: string, label: string) {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: {
      case: {
        include: {
          analyses: {
            where: { source: "human" },
            orderBy: { version: "desc" },
            take: 1
          }
        }
      }
    }
  });
  if (!post) throw new Error(`Post ${postId} disappeared`);
  const analysis = post.case?.analyses[0];
  return {
    label,
    postId,
    coverImageUrl: post.coverImageUrl,
    visualReferenceNote: analysis?.visualReferenceNote,
    libraryCoverUrl: resolvePostCoverUrl({
      coverImageUrl: post.coverImageUrl,
      visualReferenceNote: analysis?.visualReferenceNote,
      sourceUrl: post.sourceUrl,
      canonicalUrl: post.canonicalUrl
    }),
    likesCount: post.likesCount,
    likesRaw: post.likesRaw,
    likesCapturedAt: Boolean(post.likesCapturedAt)
  };
}

async function cleanup(postIds: string[]) {
  if (!postIds.length) return;
  const cases = await prisma.case.findMany({ where: { postId: { in: postIds } }, select: { id: true } });
  const caseIds = cases.map((item) => item.id);
  if (caseIds.length) {
    await prisma.caseAnalysis.deleteMany({ where: { caseId: { in: caseIds } } });
    await prisma.case.deleteMany({ where: { id: { in: caseIds } } });
  }
  await prisma.post.deleteMany({ where: { id: { in: postIds } } });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
