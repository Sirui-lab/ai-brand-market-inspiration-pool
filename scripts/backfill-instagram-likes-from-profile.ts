import { prisma } from "@/lib/db";
import { OFFICIAL_ACCOUNTS } from "@/lib/collect/official-accounts";
import { fetchRecentPosts } from "@/lib/collect/recent-post-fetcher";
import { readFileSync } from "node:fs";

loadEnvFile();

async function main() {
  const missingPosts = await prisma.post.findMany({
    where: {
      platform: { slug: "instagram" },
      likesCount: null,
      likesRaw: null
    },
    include: {
      brand: true
    }
  });
  const missingByShortcode = new Map(
    missingPosts
      .map((post) => [instagramShortcode(post.sourceUrl ?? post.canonicalUrl), post] as const)
      .filter(([shortcode]) => Boolean(shortcode))
  );
  const brandSlugs = new Set(missingPosts.map((post) => post.brand.slug));
  const accounts = OFFICIAL_ACCOUNTS.filter(
    (account) => account.platformSlug === "instagram" && brandSlugs.has(account.brandSlug)
  );
  const stats = {
    missing: missingPosts.length,
    accounts: accounts.length,
    fetchedPosts: 0,
    matched: 0,
    updated: 0
  };

  for (const account of accounts) {
    const result = await fetchRecentPosts("instagram", account.sourceId);
    stats.fetchedPosts += result.posts.length;
    for (const recent of result.posts) {
      const shortcode = instagramShortcode(recent.url);
      if (!shortcode) continue;
      const post = missingByShortcode.get(shortcode);
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

  console.log(JSON.stringify(stats, null, 2));
  await prisma.$disconnect();
}

function instagramShortcode(value?: string | null) {
  return value?.match(/instagram\.com\/(?:p|reel)\/([^/?#]+)/i)?.[1] ?? null;
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
