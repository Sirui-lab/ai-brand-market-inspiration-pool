import { prisma } from "@/lib/db";
import { getYouTubeThumbnailUrl, getVisualAssetUrl } from "@/lib/collect/post-media";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import type { Prisma } from "@prisma/client";

loadEnvFile();

type BackfillStats = {
  scanned: number;
  updatedPosts: number;
  updatedAnalyses: number;
  fetchedMetadata: number;
  fetchedHtml: number;
  htmlWithImageMeta: number;
  foundCovers: number;
  foundLikes: number;
  skipped: number;
  byPlatform: Record<
    string,
    {
      scanned: number;
      updatedPosts: number;
      fetchedMetadata: number;
      fetchedHtml: number;
      htmlWithImageMeta: number;
      foundCovers: number;
      foundLikes: number;
      skipped: number;
    }
  >;
};

type BackfillPost = Prisma.PostGetPayload<{
  include: {
    platform: true;
    case: {
      include: {
        analyses: true;
      };
    };
  };
}>;

async function main() {
  const stats: BackfillStats = {
    scanned: 0,
    updatedPosts: 0,
    updatedAnalyses: 0,
    fetchedMetadata: 0,
    fetchedHtml: 0,
    htmlWithImageMeta: 0,
    foundCovers: 0,
    foundLikes: 0,
    skipped: 0,
    byPlatform: {}
  };
  const posts = await prisma.post.findMany({
    where: {
      OR: [{ coverImageUrl: null }, { likesCount: null, likesRaw: null }]
    },
    include: {
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

  const instagramPosts = posts.filter((post) => post.platform.slug === "instagram");
  const otherPosts = posts.filter((post) => post.platform.slug !== "instagram");

  await mapLimit(instagramPosts, 1, async (post) => {
    await sleep(350);
    const result = await processPost(post);
    mergeStats(stats, result);
  });

  await mapLimit(otherPosts, 8, async (post) => {
    const result = await processPost(post);
    mergeStats(stats, result);
  });

  console.log(JSON.stringify(stats, null, 2));
}

async function processPost(post: BackfillPost) {
  const stats: BackfillStats = {
    scanned: 1,
    updatedPosts: 0,
    updatedAnalyses: 0,
    fetchedMetadata: 0,
    fetchedHtml: 0,
    htmlWithImageMeta: 0,
    foundCovers: 0,
    foundLikes: 0,
    skipped: 0,
    byPlatform: {}
  };
  const platformStats = platformStatsFor(stats, post.platform.slug);
  platformStats.scanned += 1;

  const analysis = post.case?.analyses[0] ?? null;
  const sourceUrl = post.sourceUrl ?? post.canonicalUrl;
  const localCover =
    getVisualAssetUrl(post.coverImageUrl) ??
    getVisualAssetUrl(analysis?.visualReferenceNote) ??
    getYouTubeThumbnailUrl(sourceUrl);

  let coverImageUrl = localCover;
  let likesCount = post.likesCount;
  let likesRaw = post.likesRaw;

  if ((!coverImageUrl || (likesCount === null && !likesRaw)) && post.platform.slug === "reddit" && sourceUrl) {
    const reddit = await fetchRedditMedia(sourceUrl);
    coverImageUrl = coverImageUrl ?? reddit.coverImageUrl;
    likesCount = likesCount ?? reddit.likesCount;
    likesRaw = likesRaw ?? reddit.likesRaw;
  }

  if (sourceUrl && ((!coverImageUrl && ["instagram", "linkedin", "x"].includes(post.platform.slug)) || ((likesCount === null && !likesRaw) && ["instagram", "youtube"].includes(post.platform.slug)))) {
    const metadata = await fetchPublicPageMetadata(sourceUrl, post.platform.slug);
    stats.fetchedMetadata += 1;
    platformStats.fetchedMetadata += 1;
    if (metadata.fetchedHtml) {
      stats.fetchedHtml += 1;
      platformStats.fetchedHtml += 1;
    }
    if (metadata.htmlWithImageMeta) {
      stats.htmlWithImageMeta += 1;
      platformStats.htmlWithImageMeta += 1;
    }
    if (metadata.coverImageUrl) {
      stats.foundCovers += 1;
      platformStats.foundCovers += 1;
    }
    if (metadata.likesCount !== null || metadata.likesRaw) {
      stats.foundLikes += 1;
      platformStats.foundLikes += 1;
    }
    coverImageUrl = coverImageUrl ?? metadata.coverImageUrl;
    likesCount = likesCount ?? metadata.likesCount;
    likesRaw = likesRaw ?? metadata.likesRaw;
  }

  const postData = {
    ...(coverImageUrl && !post.coverImageUrl ? { coverImageUrl } : {}),
    ...(likesCount !== null || likesRaw
      ? {
          likesCount,
          likesRaw: likesRaw ?? (likesCount === null ? null : String(likesCount)),
          likesCapturedAt: post.likesCapturedAt ?? new Date()
        }
      : {})
  };

  if (Object.keys(postData).length) {
    await prisma.post.update({ where: { id: post.id }, data: postData });
    stats.updatedPosts += 1;
    platformStats.updatedPosts += 1;
  } else {
    stats.skipped += 1;
    platformStats.skipped += 1;
  }

  if (coverImageUrl && analysis && !getVisualAssetUrl(analysis.visualReferenceNote)) {
    await prisma.caseAnalysis.update({
      where: { id: analysis.id },
      data: { visualReferenceNote: coverImageUrl }
    });
    stats.updatedAnalyses += 1;
  }

  return stats;
}

async function fetchPublicPageMetadata(url: string, platformSlug: string) {
  const normalizedUrl = normalizeBackfillUrl(url, platformSlug);
  const html = await fetchPublicHtml(normalizedUrl, platformSlug);
  if (!html) return emptyMedia();
  const htmlWithImageMeta = /(?:og:image|twitter:image|display_url|thumbnail_src|thumbnailUrl)/i.test(html);
  const likes = pickLikes(html, platformSlug);
  return {
    coverImageUrl:
      pickMetaImage(html, ["og:image", "twitter:image", "twitter:image:src"]) ??
      pickJsonImage(html) ??
      null,
    likesCount: likes.likesCount,
    likesRaw: likes.likesRaw,
    fetchedHtml: true,
    htmlWithImageMeta
  };
}

function normalizeBackfillUrl(url: string, platformSlug: string) {
  const decoded = decodeXml(url);
  if (platformSlug === "instagram") {
    return decoded.replace(
      /instagram\.com\/[^/?#]+\/(p|reel)\//i,
      "instagram.com/$1/"
    );
  }
  return decoded;
}

async function fetchPublicHtml(url: string, platformSlug: string) {
  const proxyUrl =
    platformSlug === "instagram" || platformSlug === "youtube"
      ? process.env.INSTAGRAM_PROXY_URL || process.env.HTTPS_PROXY || process.env.HTTP_PROXY
      : "";
  const headers = {
    accept: "text/html,application/xhtml+xml",
    "accept-language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
  };

  if (proxyUrl) {
    return fetchHtmlViaCurl(url, proxyUrl, headers, platformSlug === "instagram" ? 10 : 5);
  }

  try {
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(platformSlug === "instagram" ? 8000 : 3000)
    });
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) return null;
    return (await response.text()).slice(0, 500_000);
  } catch {
    return null;
  }
}

function fetchHtmlViaCurl(
  targetUrl: string,
  proxyUrl: string,
  headers: Record<string, string>,
  timeoutSeconds: number
): Promise<string | null> {
  return new Promise((resolve) => {
    const userAgent = "Mozilla/5.0";
    const args = [
      "-f",
      "-sS",
      "-L",
      "--proxy",
      proxyUrl,
      ...(userAgent ? ["-A", userAgent] : []),
      "--connect-timeout",
      "5",
      "--max-time",
      String(timeoutSeconds),
      targetUrl
    ];
    const child = spawn("curl", args, { stdio: ["ignore", "pipe", "ignore"] });
    const stdout: Buffer[] = [];
    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.on("error", () => resolve(null));
    child.on("close", (code) => {
      if (code !== 0) {
        resolve(null);
        return;
      }
      resolve(Buffer.concat(stdout).toString("utf8").slice(0, 500_000));
    });
  });
}

function pickMetaImage(html: string, names: string[]) {
  for (const name of names) {
    const escaped = escapeRegExp(name);
    const propertyFirst = new RegExp(
      `<meta\\s+[^>]*(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']+)["'][^>]*>`,
      "i"
    );
    const contentFirst = new RegExp(
      `<meta\\s+[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']${escaped}["'][^>]*>`,
      "i"
    );
    const match = html.match(propertyFirst) ?? html.match(contentFirst);
    const image = match?.[1] ? decodeXml(match[1]) : null;
    if (image && /^https?:\/\//i.test(image)) return image;
  }
  return null;
}

function pickJsonImage(html: string) {
  const patterns = [
    /"display_url"\s*:\s*"([^"]+)"/i,
    /"thumbnail_src"\s*:\s*"([^"]+)"/i,
    /"thumbnailUrl"\s*:\s*"([^"]+)"/i,
    /"image"\s*:\s*"([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i
  ];
  for (const pattern of patterns) {
    const image = html.match(pattern)?.[1];
    if (image && /^https?:\/\//i.test(image)) return decodeJsonString(image);
  }
  return null;
}

function pickLikes(html: string, platformSlug: string) {
  const candidates =
    platformSlug === "youtube"
      ? [
          ...Array.from(html.matchAll(/"likeCount"\s*:\s*"([^"]+)"/g)).map((match) => match[1]),
          ...Array.from(html.matchAll(/"label"\s*:\s*"([^"]*?likes?[^"]*)"/gi)).map((match) => match[1]),
          ...Array.from(html.matchAll(/"accessibilityText"\s*:\s*"([^"]*?likes?[^"]*)"/gi)).map((match) => match[1])
        ]
      : platformSlug === "instagram"
        ? [
            ...Array.from(html.matchAll(/"edge_liked_by"\s*:\s*\{\s*"count"\s*:\s*(\d+)/g)).map((match) => match[1]),
            ...Array.from(html.matchAll(/"edge_media_preview_like"\s*:\s*\{\s*"count"\s*:\s*(\d+)/g)).map((match) => match[1]),
            ...Array.from(html.matchAll(/"like_count"\s*:\s*(\d+)/g)).map((match) => match[1])
          ]
        : [];

  for (const candidate of candidates) {
    const raw = decodeJsonString(candidate)
      .replace(/\blikes?\b/i, "")
      .replace(/\bviews?\b/i, "")
      .trim();
    const likesCount = parseCompactNumber(raw);
    if (likesCount !== null || raw) return { likesCount, likesRaw: raw || null };
  }
  return { likesCount: null, likesRaw: null };
}

async function fetchRedditMedia(url: string) {
  const proxyUrl = process.env.REDDIT_PROXY_URL || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.INSTAGRAM_PROXY_URL || "";
  const jsonUrl = `${url.replace(/\/$/, "")}.json`;
  try {
    const jsonText = proxyUrl
      ? await fetchTextViaCurl(jsonUrl, proxyUrl, "Mozilla/5.0 AIBrandMarketInspirationPool/0.1 backfill", 8)
      : await fetchText(jsonUrl, {
          accept: "application/json,text/plain,*/*",
          "user-agent": "Mozilla/5.0 AIBrandMarketInspirationPool/0.1 backfill"
        });
    if (!jsonText) return fetchRedditMediaFromHtml(url, proxyUrl);
    const json = JSON.parse(jsonText);
    const data = Array.isArray(json) ? json[0]?.data?.children?.[0]?.data : null;
    const score = typeof data?.ups === "number" ? data.ups : typeof data?.score === "number" ? data.score : null;
    return {
      coverImageUrl: redditThumbnailFromData(data),
      likesCount: score,
      likesRaw: score === null ? null : String(score)
    };
  } catch {
    return fetchRedditMediaFromHtml(url, proxyUrl);
  }
}

async function fetchRedditMediaFromHtml(url: string, proxyUrl: string) {
  const oldUrl = oldRedditUrl(url);
  const html = proxyUrl
    ? await fetchTextViaCurl(oldUrl, proxyUrl, "Mozilla/5.0 AIBrandMarketInspirationPool/0.1 backfill", 8)
    : await fetchText(oldUrl, {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "Mozilla/5.0 AIBrandMarketInspirationPool/0.1 backfill"
      });
  if (!html) return emptyMedia();
  const scoreRaw =
    html.match(/score\s+unvoted["'][^>]*title=["']([^"']+)["']/i)?.[1] ??
    html.match(/data-score=["']([^"']+)["']/i)?.[1] ??
    html.match(/>\s*([\d,.]+)\s+points?\s*</i)?.[1] ??
    null;
  const score = parseIntegerScore(scoreRaw);
  return {
    coverImageUrl: pickMetaImage(html, ["og:image", "twitter:image"]) ?? null,
    likesCount: score,
    likesRaw: scoreRaw
  };
}

async function fetchText(url: string, headers: Record<string, string>) {
  try {
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(4500)
    });
    if (!response.ok) return null;
    return response.text();
  } catch {
    return null;
  }
}

function fetchTextViaCurl(targetUrl: string, proxyUrl: string, userAgent: string, timeoutSeconds: number) {
  return new Promise<string | null>((resolve) => {
    const child = spawn("curl", [
      "-f",
      "-sS",
      "-L",
      "--proxy",
      proxyUrl,
      "-A",
      userAgent,
      "--connect-timeout",
      "5",
      "--max-time",
      String(timeoutSeconds),
      targetUrl
    ], { stdio: ["ignore", "pipe", "ignore"] });
    const stdout: Buffer[] = [];
    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.on("error", () => resolve(null));
    child.on("close", (code) => {
      resolve(code === 0 ? Buffer.concat(stdout).toString("utf8").slice(0, 500_000) : null);
    });
  });
}

function oldRedditUrl(value: string) {
  try {
    const url = new URL(decodeXml(value));
    url.hostname = "old.reddit.com";
    url.search = "";
    return url.toString();
  } catch {
    return value;
  }
}

function parseIntegerScore(value?: string | null) {
  if (!value) return null;
  const score = Number(value.replace(/[^\d]/g, ""));
  return Number.isFinite(score) ? score : null;
}

function parseCompactNumber(value: string | null | undefined) {
  const raw = String(value ?? "").toLowerCase().replace(/,/g, "").replace(/\+/g, "").trim();
  if (!raw) return null;
  const match = raw.match(/^(\d+(?:\.\d+)?)(k|m|w|万)?$/i);
  if (!match) return null;
  const numeric = Number(match[1]);
  if (!Number.isFinite(numeric)) return null;
  const unit = match[2];
  if (unit === "k") return Math.round(numeric * 1000);
  if (unit === "m") return Math.round(numeric * 1000000);
  if (unit === "w" || unit === "万") return Math.round(numeric * 10000);
  return Math.round(numeric);
}

function redditThumbnailFromData(data: any) {
  const candidates = [
    data?.preview?.images?.[0]?.source?.url,
    data?.preview?.images?.[0]?.resolutions?.at?.(-1)?.url,
    data?.thumbnail
  ];
  for (const candidate of candidates) {
    const url = typeof candidate === "string" ? candidate.trim() : "";
    if (!url || url === "self" || url === "default" || url === "nsfw") continue;
    if (/^https?:\/\//i.test(url)) return decodeXml(url);
  }
  return null;
}

function decodeXml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function decodeJsonString(value: string) {
  try {
    return JSON.parse(`"${value.replace(/"/g, "\\\"")}"`);
  } catch {
    return value.replace(/\\u0026/g, "&").replace(/\\\//g, "/");
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function emptyMedia() {
  return { coverImageUrl: null, likesCount: null, likesRaw: null, fetchedHtml: false, htmlWithImageMeta: false };
}

async function mapLimit<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let index = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index];
      index += 1;
      await worker(item);
    }
  });
  await Promise.all(runners);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mergeStats(target: BackfillStats, source: BackfillStats) {
  target.scanned += source.scanned;
  target.updatedPosts += source.updatedPosts;
  target.updatedAnalyses += source.updatedAnalyses;
  target.fetchedMetadata += source.fetchedMetadata;
  target.fetchedHtml += source.fetchedHtml;
  target.htmlWithImageMeta += source.htmlWithImageMeta;
  target.foundCovers += source.foundCovers;
  target.foundLikes += source.foundLikes;
  target.skipped += source.skipped;
  for (const [platform, stats] of Object.entries(source.byPlatform)) {
    const targetPlatform = platformStatsFor(target, platform);
    targetPlatform.scanned += stats.scanned;
    targetPlatform.updatedPosts += stats.updatedPosts;
    targetPlatform.fetchedMetadata += stats.fetchedMetadata;
    targetPlatform.fetchedHtml += stats.fetchedHtml;
    targetPlatform.htmlWithImageMeta += stats.htmlWithImageMeta;
    targetPlatform.foundCovers += stats.foundCovers;
    targetPlatform.foundLikes += stats.foundLikes;
    targetPlatform.skipped += stats.skipped;
  }
}

function platformStatsFor(stats: BackfillStats, platform: string) {
  stats.byPlatform[platform] = stats.byPlatform[platform] ?? {
    scanned: 0,
    updatedPosts: 0,
    fetchedMetadata: 0,
    fetchedHtml: 0,
    htmlWithImageMeta: 0,
    foundCovers: 0,
    foundLikes: 0,
    skipped: 0
  };
  return stats.byPlatform[platform];
}

function loadEnvFile() {
  try {
    const text = readFileSync(".env", "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator < 0) continue;
      const key = trimmed.slice(0, separator).trim();
      const value = trimmed
        .slice(separator + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // .env is optional for this script.
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
