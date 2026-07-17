import { prisma } from "@/lib/db";
import { OFFICIAL_ACCOUNTS } from "@/lib/collect/official-accounts";
import { fetchRecentPosts } from "@/lib/collect/recent-post-fetcher";
import { getYouTubeVideoId } from "@/lib/collect/post-media";
import { readFileSync } from "node:fs";

loadEnvFile();

async function main() {
  const missingPosts = await prisma.post.findMany({
    where: {
      platform: { slug: "youtube" },
      likesCount: null,
      likesRaw: null
    },
    include: { brand: true }
  });
  const missingByVideoId = new Map(
    missingPosts
      .map((post) => [getYouTubeVideoId(post.sourceUrl ?? post.canonicalUrl), post] as const)
      .filter(([videoId]) => Boolean(videoId))
  );
  const brandSlugs = new Set(missingPosts.map((post) => post.brand.slug));
  const accounts = OFFICIAL_ACCOUNTS.filter(
    (account) => account.platformSlug === "youtube" && brandSlugs.has(account.brandSlug)
  );
  const stats = {
    missing: missingPosts.length,
    accounts: accounts.length,
    fetchedPosts: 0,
    matched: 0,
    updated: 0
  };

  for (const account of accounts) {
    const sourceIds = account.sourceIds?.length ? account.sourceIds : [account.sourceId];
    for (const sourceId of sourceIds) {
      const result = await fetchRecentPosts("youtube", sourceId);
      stats.fetchedPosts += result.posts.length;
      for (const recent of result.posts) {
        const videoId = getYouTubeVideoId(recent.url) ?? recent.id;
        const post = missingByVideoId.get(videoId);
        if (!post) continue;
        stats.matched += 1;
        if (typeof recent.likesCount === "number" || recent.likesRaw) {
          await prisma.post.update({
            where: { id: post.id },
            data: {
              likesCount: typeof recent.likesCount === "number" ? recent.likesCount : null,
              likesRaw: recent.likesRaw ?? (typeof recent.likesCount === "number" ? String(recent.likesCount) : null),
              likesCapturedAt: new Date()
            }
          });
          stats.updated += 1;
        }
      }
    }
  }

  console.log(JSON.stringify(stats, null, 2));
  await prisma.$disconnect();
}

function loadEnvFile() {
  try {
    const text = readFileSync(".env", "utf8");
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    // .env is optional.
  }
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
