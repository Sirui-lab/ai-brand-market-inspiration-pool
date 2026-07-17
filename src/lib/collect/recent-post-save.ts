import { prisma } from "@/lib/db";
import { buildLocalCaseAnalysis } from "@/lib/analysis/local-case-analysis";
import { cacheRemoteImage } from "@/lib/collect/media-cache";
import { makeCollectFingerprint } from "@/lib/collect/url-intake";
import { getYouTubeThumbnailUrl, getVisualAssetUrl } from "@/lib/collect/post-media";
import type { RecentPost } from "@/lib/collect/recent-post-fetcher";
import { canonicalizeUrl, extractExternalPostId, normalizeCaption } from "@/lib/import/normalizers";
import { spawn } from "node:child_process";

export async function saveRecentPost(recentPost: RecentPost, brandSlug: string | null) {
  const platform = await prisma.platform.findUnique({ where: { slug: recentPost.platformSlug } });
  const brand = brandSlug ? await prisma.brand.findUnique({ where: { slug: brandSlug } }) : null;

  if (!platform || !brand) {
    return {
      status: "skipped" as const,
      message: "未能识别平台或品牌，已跳过保存。"
    };
  }

  const canonical = canonicalizeUrl(recentPost.url);
  if (!canonical.canonicalUrl) {
    return {
      status: "skipped" as const,
      message: "原帖链接无法解析，已跳过保存。"
    };
  }

  const externalPostId = extractExternalPostId(canonical.canonicalUrl) ?? recentPost.id;
  const existing = await prisma.post.findFirst({
    where: {
      OR: [{ canonicalUrl: canonical.canonicalUrl }, { platformId: platform.id, externalPostId }]
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
    }
  });

  if (existing) {
    const engagement = await resolveRecentPostEngagement(recentPost);
    const coverImageUrl = await resolveRecentPostCover(recentPost);
    const analysis = existing.case?.analyses[0] ?? null;
    const caption = normalizeCaption([recentPost.title, recentPost.excerpt].filter(Boolean).join("\n\n")) || existing.captionNormalized;
    const localAnalysis =
      existing.case && isMissingAnalysis(analysis)
        ? buildLocalCaseAnalysis({
            caption: caption || `待补全原帖内容：${canonical.canonicalUrl}`,
            platform: existing.platform.displayName,
            brand: existing.brand.displayName,
            url: recentPost.url,
            publishedAt: recentPost.publishedAt,
            likesCount: engagement.likesCount ?? existing.likesCount,
            visualReferenceNote: coverImageUrl ?? analysis?.visualReferenceNote ?? existing.coverImageUrl,
            rawContext: recentPost
          })
        : null;
    const postPatch = {
      ...(coverImageUrl && !existing.coverImageUrl ? { coverImageUrl } : {}),
      ...(engagement.likesCount !== null || engagement.likesRaw
        ? {
            likesCount: engagement.likesCount ?? existing.likesCount,
            likesRaw: engagement.likesRaw ?? existing.likesRaw,
            likesCapturedAt: new Date()
          }
        : {})
    };

    if (Object.keys(postPatch).length) {
      await prisma.post.update({
        where: { id: existing.id },
        data: postPatch
      });
    }
    if (coverImageUrl && analysis && !getVisualAssetUrl(analysis.visualReferenceNote)) {
      await prisma.caseAnalysis.update({
        where: { id: analysis.id },
        data: { visualReferenceNote: coverImageUrl }
      });
    }
    if (existing.case && localAnalysis) {
      if (analysis) {
        await prisma.caseAnalysis.update({
          where: { id: analysis.id },
          data: {
            status: localAnalysis.status,
            postStructureAnalysis: localAnalysis.postStructureAnalysis,
            postContentAnalysis: localAnalysis.postContentAnalysis,
            visualDesignAnalysis: localAnalysis.visualDesignAnalysis,
            visualReferenceNote: coverImageUrl ?? analysis.visualReferenceNote ?? localAnalysis.visualReferenceNote,
            rawAnalysisJson: localAnalysis.rawAnalysisJson,
            analyzedBy: "local_case_analysis",
            analyzedAt: new Date()
          }
        });
      } else {
        await prisma.caseAnalysis.create({
          data: {
            caseId: existing.case.id,
            source: "human",
            status: localAnalysis.status,
            version: 1,
            postStructureAnalysis: localAnalysis.postStructureAnalysis,
            postContentAnalysis: localAnalysis.postContentAnalysis,
            visualDesignAnalysis: localAnalysis.visualDesignAnalysis,
            visualReferenceNote: coverImageUrl ?? localAnalysis.visualReferenceNote,
            rawAnalysisJson: localAnalysis.rawAnalysisJson,
            isHumanConfirmed: false,
            analyzedBy: "local_case_analysis",
            analyzedAt: new Date()
          }
        });
      }
    }
    return {
      status: "duplicate" as const,
      postId: existing.id,
      message:
        coverImageUrl || engagement.likesCount !== null || engagement.likesRaw || localAnalysis
          ? "这条帖子已存在，已补写缺失的封面、点赞或创意解码。"
          : "这条帖子已经在 Local Inspiration Library 里。"
    };
  }

  const engagement = await resolveRecentPostEngagement(recentPost);
  const coverImageUrl = await resolveRecentPostCover(recentPost);
  const caption = normalizeCaption([recentPost.title, recentPost.excerpt].filter(Boolean).join("\n\n"));
  const localAnalysis = buildLocalCaseAnalysis({
    caption: caption || `待补全原帖内容：${canonical.canonicalUrl}`,
    platform: platform.displayName,
    brand: brand.displayName,
    url: recentPost.url,
    publishedAt: recentPost.publishedAt,
    likesCount: engagement.likesCount,
    visualReferenceNote: coverImageUrl,
    rawContext: recentPost
  });
  const post = await prisma.post.create({
    data: {
      platformId: platform.id,
      brandId: brand.id,
      sourceType: "browser_collect",
      sourceRecordId: `recent:${recentPost.platformSlug}:${recentPost.author ?? "unknown"}:${recentPost.id}`,
      externalPostId,
      canonicalUrl: canonical.canonicalUrl,
      sourceUrl: recentPost.url,
      postTypeLabel: recentPost.url.includes("/reel/") ? "reel" : null,
      captionRaw: caption || `待补全原帖内容：${canonical.canonicalUrl}`,
      captionNormalized: caption || `待补全原帖内容：${canonical.canonicalUrl}`,
      publishDate: recentPost.publishedAt ? new Date(recentPost.publishedAt) : null,
      likesCount: engagement.likesCount,
      likesRaw: engagement.likesRaw,
      likesCapturedAt: engagement.likesCount === null && !engagement.likesRaw ? null : new Date(),
      coverImageUrl,
      dataStatus: "partial",
      reviewStatus: "needs_review",
      contentFingerprint: makeCollectFingerprint(canonical.canonicalUrl, caption),
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
              visualReferenceNote: coverImageUrl ?? localAnalysis.visualReferenceNote,
              rawAnalysisJson: localAnalysis.rawAnalysisJson,
              isHumanConfirmed: false,
              analyzedBy: "local_case_analysis"
            }
          }
        }
      }
    }
  });

  return {
    status: "saved" as const,
    postId: post.id,
    message: "已加入 Local Inspiration Library。"
  };
}

function isMissingAnalysis(
  analysis?: {
    postStructureAnalysis: string | null;
    postContentAnalysis: string | null;
    visualDesignAnalysis: string | null;
  } | null
) {
  return !analysis || (!analysis.postStructureAnalysis && !analysis.postContentAnalysis && !analysis.visualDesignAnalysis);
}

async function resolveRecentPostCover(recentPost: RecentPost) {
  const remoteCover =
    getVisualAssetUrl(recentPost.coverUrl) ??
    getVisualAssetUrl(recentPost.thumbnailUrl) ??
    getYouTubeThumbnailUrl(recentPost.url);
  return (await cacheRemoteImage(remoteCover)) ?? remoteCover;
}

async function resolveRecentPostEngagement(recentPost: RecentPost) {
  if (typeof recentPost.likesCount === "number" || recentPost.likesRaw) {
    return {
      likesCount: typeof recentPost.likesCount === "number" ? recentPost.likesCount : null,
      likesRaw: recentPost.likesRaw ?? (typeof recentPost.likesCount === "number" ? String(recentPost.likesCount) : null)
    };
  }

  if (recentPost.platformSlug === "reddit") return fetchRedditEngagement(recentPost.url);
  if (recentPost.platformSlug === "youtube") return fetchYouTubeEngagement(recentPost.url);
  if (recentPost.platformSlug === "instagram") return fetchInstagramEngagement(recentPost.url);
  return { likesCount: null, likesRaw: null };
}

async function fetchRedditEngagement(url: string) {
  try {
    const response = await fetch(`${url.replace(/\/$/, "")}.json`, {
      headers: {
        accept: "application/json,text/plain,*/*",
        "user-agent": "Mozilla/5.0 AIBrandMarketInspirationPool/0.1"
      }
    });
    if (!response.ok) return { likesCount: null, likesRaw: null };
    const json = await response.json();
    const data = Array.isArray(json) ? json[0]?.data?.children?.[0]?.data : null;
    const score = typeof data?.ups === "number" ? data.ups : typeof data?.score === "number" ? data.score : null;
    if (score !== null) return { likesCount: score, likesRaw: String(score) };
  } catch {
    // Fall through to old.reddit HTML below.
  }
  return fetchRedditEngagementFromHtml(url);
}

async function fetchRedditEngagementFromHtml(url: string) {
  try {
    const html = await fetchTextWithOptionalProxy(oldRedditUrl(url));
    const raw =
      html.match(/class="score unvoted"[^>]*title="([^"]+)"/i)?.[1] ??
      html.match(/data-score="([^"]+)"/i)?.[1] ??
      html.match(/>\s*([\d,]+)\s+points?\s*</i)?.[1] ??
      null;
    const score = parseIntegerScore(raw);
    return { likesCount: score, likesRaw: score === null ? null : String(score) };
  } catch {
    return { likesCount: null, likesRaw: null };
  }
}

async function fetchTextWithOptionalProxy(url: string) {
  const proxyUrl = process.env.INSTAGRAM_PROXY_URL || process.env.REDDIT_PROXY_URL || process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  if (proxyUrl) return fetchTextViaCurl(url, proxyUrl);
  const response = await fetch(url, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": "Mozilla/5.0 AIBrandMarketInspirationPool/0.1"
    }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

function fetchTextViaCurl(url: string, proxyUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "curl",
      ["-f", "-sS", "-L", "--connect-timeout", "5", "--max-time", "20", "-x", proxyUrl, "-A", "Mozilla/5.0", url],
      { stdio: ["ignore", "pipe", "pipe"] }
    );
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdout).toString("utf8"));
        return;
      }
      reject(new Error(Buffer.concat(stderr).toString("utf8") || `curl exited with ${code}`));
    });
  });
}

function oldRedditUrl(value: string) {
  const url = new URL(value);
  url.hostname = "old.reddit.com";
  return url.toString();
}

function parseIntegerScore(value?: string | null) {
  const raw = String(value ?? "").replace(/,/g, "").trim();
  if (!/^-?\d+$/.test(raw)) return null;
  return Number(raw);
}

async function fetchYouTubeEngagement(url: string) {
  try {
    const response = await fetch(url, {
      headers: {
        accept: "text/html",
        "accept-language": "en-US,en;q=0.9",
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
      }
    });
    if (!response.ok) return { likesCount: null, likesRaw: null };
    const html = await response.text();
    const candidates = [
      ...Array.from(html.matchAll(/"likeCount"\s*:\s*"([^"]+)"/g)).map((match) => match[1]),
      ...Array.from(html.matchAll(/"label"\s*:\s*"([^"]*?likes?[^"]*)"/gi)).map((match) => match[1]),
      ...Array.from(html.matchAll(/"accessibilityText"\s*:\s*"([^"]*?likes?[^"]*)"/gi)).map((match) => match[1])
    ];
    for (const candidate of candidates) {
      const raw = decodeJsonString(candidate).replace(/\blikes?\b/i, "").trim();
      const count = parseCompactNumber(raw);
      if (count !== null || raw) return { likesCount: count, likesRaw: raw || null };
    }
  } catch {
    // Ignore public page parsing failures.
  }
  return { likesCount: null, likesRaw: null };
}

async function fetchInstagramEngagement(url: string) {
  try {
    const html = await fetchTextWithOptionalProxy(url);
    const candidates = [
      ...Array.from(html.matchAll(/"edge_liked_by"\s*:\s*\{\s*"count"\s*:\s*(\d+)/g)).map((match) => match[1]),
      ...Array.from(html.matchAll(/"edge_media_preview_like"\s*:\s*\{\s*"count"\s*:\s*(\d+)/g)).map((match) => match[1]),
      ...Array.from(html.matchAll(/"like_count"\s*:\s*(\d+)/g)).map((match) => match[1])
    ];
    for (const candidate of candidates) {
      const count = parseCompactNumber(candidate);
      if (count !== null) return { likesCount: count, likesRaw: String(count) };
    }
  } catch {
    // Ignore public page parsing failures.
  }
  return { likesCount: null, likesRaw: null };
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

function decodeJsonString(value: string) {
  try {
    return JSON.parse(`"${value.replace(/"/g, "\\\"")}"`);
  } catch {
    return value;
  }
}
