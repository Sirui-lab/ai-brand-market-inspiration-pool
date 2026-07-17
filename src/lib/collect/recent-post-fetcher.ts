import { canonicalizeUrl, normalizeText } from "@/lib/import/normalizers";
import { resolveOfficialAccount } from "@/lib/collect/official-accounts";
import { spawn } from "node:child_process";
import path from "node:path";
import net from "node:net";
import tls from "node:tls";

export type RecentPost = {
  id: string;
  title: string;
  url: string;
  publishedAt: string | null;
  author: string | null;
  excerpt: string | null;
  platformSlug: string;
  likesCount?: number | null;
  likesRaw?: string | null;
  thumbnailUrl?: string | null;
  coverUrl?: string | null;
};

export type RecentPostFetchResult = {
  status: "fetched" | "needs_runner" | "failed";
  platformSlug: string;
  sourceId: string;
  since: string;
  posts: RecentPost[];
  message?: string;
};

const WINDOW_DAYS = 7;
const TIMEOUT_MS = 10000;
const RUNNER_TIMEOUT_MS = 45000;
const INSTAGRAM_TIMEOUT_MS = 30000;
const LINKEDIN_TIMEOUT_MS = 30000;
const X_HANDLE_ALIASES: Record<string, string> = {
  chatgpt: "ChatGPTapp"
};
const YOUTUBE_CHANNEL_ALIASES: Record<string, string> = {
  openai: "UCXZCJLdBC09xxGZ6gcdrc6A",
  chatgpt: "UCXZCJLdBC09xxGZ6gcdrc6A"
};

export async function fetchRecentPosts(platformSlug: string, sourceId: string): Promise<RecentPostFetchResult> {
  const normalizedPlatform = normalizeText(platformSlug).toLowerCase();
  const officialAccount = resolveOfficialAccount(normalizedPlatform, sourceId);
  const candidateSourceIds = officialAccount?.sourceIds?.length
    ? officialAccount.sourceIds
    : [officialAccount?.sourceId ?? sourceId];
  const normalizedSource = normalizeSourceId(candidateSourceIds[0] ?? "");
  const since = getSinceDate();

  if (!normalizedSource) {
    return empty("failed", normalizedPlatform, normalizedSource, since, "请输入账号 ID、频道 ID 或 Reddit 用户账号。");
  }

  if (officialAccount && candidateSourceIds.length > 1) {
    return fetchRecentPostsFromCandidates(normalizedPlatform, candidateSourceIds, since);
  }

  if (normalizedPlatform === "youtube") {
    return fetchYouTubeRecentPosts(normalizedSource, since);
  }

  if (normalizedPlatform === "reddit") {
    return fetchRedditRecentPosts(normalizedSource, since);
  }

  if (normalizedPlatform === "instagram") {
    return fetchInstagramRecentPosts(normalizedSource, since);
  }

  if (normalizedPlatform === "x") {
    return fetchXRecentPosts(normalizedSource, since);
  }

  if (normalizedPlatform === "linkedin") {
    return fetchLinkedInRecentPosts(normalizedSource, since);
  }

  return empty("failed", normalizedPlatform, normalizedSource, since, "暂不支持该平台。");
}

async function fetchRecentPostsFromCandidates(platformSlug: string, sourceIds: string[], since: Date): Promise<RecentPostFetchResult> {
  let fallback: RecentPostFetchResult | null = null;

  for (const sourceId of sourceIds) {
    const normalizedSource = normalizeSourceId(sourceId);
    const result = await fetchRecentPostsForNormalizedSource(platformSlug, normalizedSource, since);
    if (result.posts.length || result.status === "fetched") return result;
    fallback = fallback ?? result;
  }

  return (
    fallback ??
    empty("failed", platformSlug, normalizeSourceId(sourceIds[0] ?? ""), since, "没有可用的账号候选。")
  );
}

async function fetchRecentPostsForNormalizedSource(
  platformSlug: string,
  normalizedSource: string,
  since: Date
): Promise<RecentPostFetchResult> {
  if (platformSlug === "youtube") return fetchYouTubeRecentPosts(normalizedSource, since);
  if (platformSlug === "reddit") return fetchRedditRecentPosts(normalizedSource, since);
  if (platformSlug === "instagram") return fetchInstagramRecentPosts(normalizedSource, since);
  if (platformSlug === "x") return fetchXRecentPosts(normalizedSource, since);
  if (platformSlug === "linkedin") return fetchLinkedInRecentPosts(normalizedSource, since);
  return empty("failed", platformSlug, normalizedSource, since, "暂不支持该平台。");
}

async function fetchInstagramRecentPosts(sourceId: string, since: Date): Promise<RecentPostFetchResult> {
  try {
    const url = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(sourceId)}`;
    let response = await fetchInstagramJson(url, { omitCookie: true });

    if ((response.status < 200 || response.status >= 300) && shouldUseInstagramLoginFallback()) {
      response = await fetchInstagramJson(url);
    }

    if (response.status < 200 || response.status >= 300) {
      return empty(
        "needs_runner",
        "instagram",
        sourceId,
        since,
        `Instagram 公开抓取返回 HTTP ${response.status}。如果 VPN 已开启，请设置 INSTAGRAM_PROXY_URL 指向 VPN 本地代理；如果仍失败，可由管理员配置项目专用账号作为兜底。`
      );
    }

    let posts = extractInstagramWebProfilePosts(response.json, sourceId, since);
    if (!posts.length && shouldUseInstagramLoginFallback()) {
      response = await fetchInstagramJson(url);
      if (response.status >= 200 && response.status < 300) {
        posts = extractInstagramWebProfilePosts(response.json, sourceId, since);
      }
    }

    return {
      status: "fetched",
      platformSlug: "instagram",
      sourceId,
      since: since.toISOString(),
      posts,
      message: posts.length
        ? "已通过 Instagram 公开数据抓取最近一周帖子。"
        : "已访问 Instagram，但没有发现最近 7 天帖子；可能账号近期无更新，或需要分页抓取更多历史帖子。"
    };
  } catch (error) {
    return empty(
      "needs_runner",
      "instagram",
      sourceId,
      since,
      error instanceof Error
        ? `Instagram 公开抓取失败：${error.message}。请确认 VPN 已开启并使用可访问 Instagram 的节点；如果仍失败，可由管理员配置项目专用账号作为兜底。`
        : "Instagram 公开抓取失败。请检查 VPN 和网络环境；如果仍失败，可由管理员配置项目专用账号作为兜底。"
    );
  }
}

function extractInstagramWebProfilePosts(value: any, sourceId: string, since: Date): RecentPost[] {
  const edges = value?.data?.user?.edge_owner_to_timeline_media?.edges;
  if (!Array.isArray(edges)) return [];

  return edges
    .map((edge: any) => normalizeInstagramNode(edge?.node, sourceId))
    .filter((post: RecentPost | null): post is RecentPost => Boolean(post))
    .filter((post) => isWithinWindow(post.publishedAt, since))
    .filter(dedupeByUrl);
}

function normalizeInstagramNode(node: any, sourceId: string): RecentPost | null {
  if (!node) return null;
  const shortcode = normalizeText(node.shortcode);
  if (!shortcode) return null;

  const caption = normalizeText(node.edge_media_to_caption?.edges?.[0]?.node?.text);
  const publishedAt = dateFromUnix(typeof node.taken_at_timestamp === "number" ? node.taken_at_timestamp : null);
  if (!publishedAt) return null;

  const isVideo = Boolean(node.is_video);
  const urlType = isVideo ? "reel" : "p";
  const likesCount =
    typeof node.edge_liked_by?.count === "number"
      ? node.edge_liked_by.count
      : typeof node.edge_media_preview_like?.count === "number"
        ? node.edge_media_preview_like.count
        : null;
  return {
    id: shortcode,
    title: caption ? caption.slice(0, 120) : `Instagram post by ${sourceId}`,
    url: `https://www.instagram.com/${urlType}/${shortcode}/`,
    publishedAt,
    author: sourceId,
    excerpt: caption ? caption.slice(0, 240) : null,
    platformSlug: "instagram",
    likesCount,
    likesRaw: likesCount === null ? null : String(likesCount),
    thumbnailUrl: normalizeText(node.display_url || node.thumbnail_src) || null,
    coverUrl: normalizeText(node.display_url || node.thumbnail_src) || null
  };
}

function instagramHeaders(options: { omitCookie?: boolean } = {}) {
  const cookie = options.omitCookie || !shouldUseInstagramLoginFallback() ? "" : instagramCookie();
  return {
    accept: "*/*",
    "x-ig-app-id": "936619743392459",
    "x-requested-with": "XMLHttpRequest",
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    referer: "https://www.instagram.com/",
    ...(cookie ? { cookie } : {})
  };
}

function instagramCookie() {
  return normalizeText(process.env.INSTAGRAM_COOKIE) || sessionCookie(process.env.INSTAGRAM_SESSION_ID);
}

function shouldUseInstagramLoginFallback() {
  return normalizeText(process.env.INSTAGRAM_USE_LOGIN_FALLBACK).toLowerCase() === "true" && Boolean(instagramCookie());
}

async function fetchInstagramJson(url: string, options: { omitCookie?: boolean } = {}): Promise<{ status: number; json: any }> {
  const proxyUrl = normalizeText(process.env.INSTAGRAM_PROXY_URL || process.env.HTTPS_PROXY || process.env.HTTP_PROXY);
  if (proxyUrl) {
    return fetchJsonViaCurl(url, proxyUrl, instagramHeaders(options), INSTAGRAM_TIMEOUT_MS);
  }

  const response = await fetchWithTimeout(url, {
    headers: instagramHeaders(options),
    signalTimeoutMs: INSTAGRAM_TIMEOUT_MS
  });
  return { status: response.status, json: await response.json() };
}

function fetchJsonViaCurl(
  targetUrl: string,
  proxyUrl: string,
  headers: Record<string, string>,
  timeoutMs: number
): Promise<{ status: number; json: any }> {
  return new Promise((resolve, reject) => {
    const args = [
      "-f",
      "-sS",
      "-L",
      "--connect-timeout",
      "5",
      "--max-time",
      String(Math.ceil(timeoutMs / 1000)),
      "--config",
      "-",
      "-w",
      "\n__STATUS__:%{http_code}"
    ];
    const child = spawn("curl", args, { stdio: ["pipe", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const config = [
      `url = "${targetUrl}"`,
      `proxy = "${proxyUrl}"`,
      ...Object.entries(headers).map(([key, value]) => `header = "${key}: ${escapeCurlConfig(value)}"`)
    ].join("\n");

    child.stdin.end(config);
    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.on("error", reject);
    child.on("close", (code) => {
      const output = Buffer.concat(stdout).toString("utf8");
      const errorText = Buffer.concat(stderr).toString("utf8").trim();
      if (code !== 0) {
        reject(new Error(errorText || `curl exited with ${code}`));
        return;
      }

      const marker = output.lastIndexOf("\n__STATUS__:");
      if (marker < 0) {
        reject(new Error("curl response did not include status marker"));
        return;
      }

      const body = output.slice(0, marker);
      const status = Number(output.slice(marker).match(/__STATUS__:(\d+)/)?.[1] ?? 0);
      try {
        resolve({ status, json: body.trim() ? JSON.parse(body) : null });
      } catch (error) {
        reject(new Error(`Instagram returned invalid JSON with HTTP ${status}`));
      }
    });
  });
}

function escapeCurlConfig(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

function fetchJsonViaHttpProxy(
  targetUrl: string,
  proxyUrl: string,
  headers: Record<string, string>,
  timeoutMs: number
): Promise<{ status: number; json: any }> {
  return new Promise((resolve, reject) => {
    const target = new URL(targetUrl);
    const proxy = new URL(proxyUrl);
    const proxyPort = Number(proxy.port || 80);
    const socket = net.connect(proxyPort, proxy.hostname);
    const chunks: Buffer[] = [];
    let secureSocket: tls.TLSSocket | null = null;
    let settled = false;

    const timeout = setTimeout(() => finish(reject, new Error("Instagram proxy request timed out")), timeoutMs);
    const finish = (done: (value: any) => void, value: any) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      secureSocket?.destroy();
      socket.destroy();
      done(value);
    };

    socket.on("connect", () => {
      socket.write(`CONNECT ${target.hostname}:443 HTTP/1.1\r\nHost: ${target.hostname}:443\r\n\r\n`);
    });
    socket.on("error", (error) => finish(reject, error));
    socket.once("data", (data) => {
      const connectResponse = data.toString("utf8");
      if (!connectResponse.includes(" 200 ")) {
        finish(reject, new Error(`Proxy CONNECT failed: ${connectResponse.split("\r\n")[0]}`));
        return;
      }

      secureSocket = tls.connect({ socket, servername: target.hostname, ALPNProtocols: ["http/1.1"] }, () => {
        const requestHeaders = {
          host: target.hostname,
          connection: "close",
          ...headers
        };
        const headerText = Object.entries(requestHeaders)
          .map(([key, value]) => `${key}: ${value}`)
          .join("\r\n");
        secureSocket?.write(`GET ${target.pathname}${target.search} HTTP/1.1\r\n${headerText}\r\n\r\n`);
      });
      secureSocket.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      secureSocket.on("error", (error) => finish(reject, error));
      secureSocket.on("end", () => {
        try {
          const parsed = parseHttpResponse(Buffer.concat(chunks));
          finish(resolve, { status: parsed.status, json: JSON.parse(parsed.body) });
        } catch (error) {
          finish(reject, error);
        }
      });
    });
  });
}

function parseHttpResponse(buffer: Buffer) {
  const separator = buffer.indexOf("\r\n\r\n");
  if (separator < 0) throw new Error("Invalid proxy response");
  const headerText = buffer.subarray(0, separator).toString("utf8");
  const bodyBuffer = buffer.subarray(separator + 4);
  const status = Number(headerText.match(/^HTTP\/\d\.\d\s+(\d+)/)?.[1] ?? 0);
  const isChunked = /transfer-encoding:\s*chunked/i.test(headerText);
  const body = (isChunked ? decodeChunked(bodyBuffer) : bodyBuffer).toString("utf8");
  return { status, body };
}

function decodeChunked(buffer: Buffer) {
  let offset = 0;
  const chunks: Buffer[] = [];
  while (offset < buffer.length) {
    const lineEnd = buffer.indexOf("\r\n", offset);
    if (lineEnd < 0) break;
    const size = parseInt(buffer.subarray(offset, lineEnd).toString("utf8"), 16);
    if (!size) break;
    const start = lineEnd + 2;
    const end = start + size;
    chunks.push(buffer.subarray(start, end));
    offset = end + 2;
  }
  return Buffer.concat(chunks);
}

function sessionCookie(value: string | undefined) {
  const sessionId = normalizeText(value);
  return sessionId ? `sessionid=${sessionId};` : "";
}

async function fetchWithTimeout(url: string, init: RequestInit & { signalTimeoutMs?: number }) {
  const controller = new AbortController();
  const timeoutMs = init.signalTimeoutMs ?? (init.method === "POST" ? RUNNER_TIMEOUT_MS : TIMEOUT_MS);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const { signalTimeoutMs: _signalTimeoutMs, ...fetchInit } = init;
    return await fetch(url, { ...fetchInit, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchYouTubeRecentPosts(sourceId: string, since: Date): Promise<RecentPostFetchResult> {
  const channelId = sourceId.startsWith("UC") ? sourceId : await resolveYouTubeChannelId(sourceId);
  let posts: RecentPost[] = [];
  let usedSource = "YouTube 公开频道页";

  if (channelId) {
    try {
      const xml = await fetchYouTubeFeed(channelId);
      posts = Array.from(xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g))
        .map((match) => parseYouTubeEntry(match[1]))
        .filter((post): post is RecentPost => Boolean(post))
        .filter((post) => isWithinWindow(post.publishedAt, since));
      usedSource = "YouTube 公开 RSS";
      if (!posts.length) {
        const pagePosts = await fetchYouTubeRecentPostsFromVideosPage(`https://www.youtube.com/channel/${channelId}`, since);
        if (pagePosts.length) {
          posts = pagePosts;
          usedSource = "YouTube 公开频道页";
        }
      }
    } catch {
      posts = await fetchYouTubeRecentPostsFromVideosPage(sourceId, since);
    }
  } else {
    posts = await fetchYouTubeRecentPostsFromVideosPage(sourceId, since);
  }

  if (!posts.length && !channelId) {
    return empty(
      "needs_runner",
      "youtube",
      sourceId,
      since,
      "没有解析到 YouTube channel ID，也没有从公开频道页读到最近一周视频。请尝试输入 @handle、频道主页 URL，或 UC 开头的 channel ID。"
    );
  }

  posts = await enrichYouTubeLikes(posts);

  return {
    status: "fetched",
    platformSlug: "youtube",
    sourceId,
    since: since.toISOString(),
    posts,
    message: posts.length ? `已通过 ${usedSource} 抓取最近一周视频。` : "已访问 YouTube 公开数据，但最近 7 天没有新视频。"
  };
}

async function enrichYouTubeLikes(posts: RecentPost[]) {
  const enriched: RecentPost[] = [];
  for (const post of posts.slice(0, 20)) {
    enriched.push(await enrichYouTubeLikeCount(post));
  }
  return [...enriched, ...posts.slice(20)];
}

async function enrichYouTubeLikeCount(post: RecentPost): Promise<RecentPost> {
  try {
    const html = await fetchText(`https://www.youtube.com/watch?v=${encodeURIComponent(post.id)}`, youtubeHeaders("text/html"));
    const likes = parseYouTubeLikes(html);
    return likes.likesCount !== null || likes.likesRaw ? { ...post, ...likes } : post;
  } catch {
    return post;
  }
}

function parseYouTubeLikes(html: string): Pick<RecentPost, "likesCount" | "likesRaw"> {
  const candidates = [
    ...Array.from(html.matchAll(/"likeCount"\s*:\s*"([^"]+)"/g)).map((match) => match[1]),
    ...Array.from(html.matchAll(/"label"\s*:\s*"([^"]*?likes?[^"]*)"/gi)).map((match) => match[1]),
    ...Array.from(html.matchAll(/"accessibilityText"\s*:\s*"([^"]*?likes?[^"]*)"/gi)).map((match) => match[1])
  ];

  for (const candidate of candidates) {
    const cleaned = normalizeText(decodeJsonString(candidate)).replace(/\blikes?\b/i, "").trim();
    const likesCount = parseCompactNumber(cleaned);
    if (likesCount !== null || cleaned) {
      return { likesCount, likesRaw: cleaned || null };
    }
  }

  return { likesCount: null, likesRaw: null };
}

function decodeJsonString(value: string) {
  try {
    return JSON.parse(`"${value.replace(/"/g, "\\\"")}"`);
  } catch {
    return value;
  }
}

async function resolveYouTubeChannelId(sourceId: string): Promise<string | null> {
  const normalized = normalizeText(sourceId).replace(/^@/, "");
  const aliasedChannelId = YOUTUBE_CHANNEL_ALIASES[normalizeYouTubeAlias(normalized)];
  if (aliasedChannelId) return aliasedChannelId;

  const candidates = youtubeChannelCandidates(sourceId, normalized);

  for (const url of candidates) {
    try {
      const html = await fetchText(url, youtubeHeaders("text/html"));
      const channelIds = uniqueStrings([
        ...pickHtmlChannelIds(html, /"externalId":"(UC[^"]+)"/g),
        ...pickHtmlChannelIds(html, /"browseId":"(UC[^"]+)"/g),
        ...pickHtmlChannelIds(html, /<meta\s+itemprop=["']channelId["']\s+content=["'](UC[^"']+)["']/gi),
        ...pickHtmlChannelIds(html, /https:\/\/www\.youtube\.com\/channel\/(UC[\w-]+)/g),
        ...pickHtmlChannelIds(html, /"channelId":"(UC[^"]+)"/g)
      ]);
      if (channelIds[0]) return channelIds[0];
    } catch {
      // Try the next candidate URL.
    }
  }

  return null;
}

function normalizeYouTubeAlias(value: string) {
  return normalizeText(value)
    .replace(/^@/, "")
    .replace(/^youtube[\s:_-]+/i, "")
    .toLowerCase();
}

function youtubeChannelCandidates(sourceId: string, normalized: string) {
  const raw = normalizeText(sourceId);
  const cleaned = normalized.replace(/^youtube[\s:_-]+/i, "");
  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    if (url.hostname.includes("youtube.com")) {
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts[0] === "channel" && parts[1]?.startsWith("UC")) {
        return [`https://www.youtube.com/channel/${parts[1]}`];
      }
      if (parts[0]?.startsWith("@")) {
        return [`https://www.youtube.com/${parts[0]}`];
      }
      if ((parts[0] === "c" || parts[0] === "user") && parts[1]) {
        return [`https://www.youtube.com/${parts[0]}/${parts[1]}`];
      }
      return [url.toString()];
    }
  } catch {
    // Not a URL.
  }

  return [
    `https://www.youtube.com/@${encodeURIComponent(cleaned)}`,
    `https://www.youtube.com/c/${encodeURIComponent(cleaned)}`,
    `https://www.youtube.com/user/${encodeURIComponent(cleaned)}`
  ];
}

function pickHtmlChannelIds(html: string, pattern: RegExp) {
  return Array.from(html.matchAll(pattern)).map((match) => match[1]).filter(Boolean);
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values));
}

async function fetchYouTubeFeed(channelId: string) {
  const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
  return fetchText(url, youtubeHeaders("application/xml,text/xml,text/plain"));
}

async function fetchYouTubeRecentPostsFromVideosPage(sourceId: string, since: Date) {
  const normalized = normalizeText(sourceId).replace(/^@/, "");
  const candidates = youtubeChannelCandidates(sourceId, normalized).map((url) => youtubeVideosUrl(url));

  for (const url of candidates) {
    try {
      const html = await fetchText(url, youtubeHeaders("text/html"));
      const posts = parseYouTubeVideosPage(html, since);
      if (posts.length) return posts;
    } catch {
      // Try the next public page.
    }
  }

  return [];
}

function youtubeHeaders(accept: string) {
  return {
    accept,
    "accept-language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
    "cache-control": "no-cache",
    pragma: "no-cache",
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
  };
}

function youtubeVideosUrl(value: string) {
  try {
    const url = new URL(value);
    if (!url.pathname.endsWith("/videos")) {
      url.pathname = `${url.pathname.replace(/\/$/, "")}/videos`;
    }
    return url.toString();
  } catch {
    return value;
  }
}

function parseYouTubeVideosPage(html: string, since: Date) {
  return [...collectYouTubeRendererJson(html), ...collectYouTubeLockupJson(html)]
    .map(normalizeYouTubeRendererPost)
    .filter((post): post is RecentPost => Boolean(post))
    .filter((post) => isWithinWindow(post.publishedAt, since))
    .filter(dedupeByUrl);
}

function collectYouTubeRendererJson(html: string) {
  const renderers: any[] = [];
  const marker = '"videoRenderer":';
  let index = 0;
  while (index < html.length) {
    const markerIndex = html.indexOf(marker, index);
    if (markerIndex < 0) break;
    const objectStart = html.indexOf("{", markerIndex + marker.length);
    if (objectStart < 0) break;
    const objectText = readJsonObjectAt(html, objectStart);
    if (!objectText) {
      index = markerIndex + marker.length;
      continue;
    }
    try {
      renderers.push(JSON.parse(objectText));
    } catch {
      // Skip malformed renderer snippets.
    }
    index = objectStart + objectText.length;
  }
  return renderers;
}

function collectYouTubeLockupJson(html: string) {
  const renderers: any[] = [];
  const marker = '"lockupViewModel":';
  let index = 0;
  while (index < html.length) {
    const markerIndex = html.indexOf(marker, index);
    if (markerIndex < 0) break;
    const objectStart = html.indexOf("{", markerIndex + marker.length);
    if (objectStart < 0) break;
    const objectText = readJsonObjectAt(html, objectStart);
    if (!objectText) {
      index = markerIndex + marker.length;
      continue;
    }
    try {
      renderers.push(JSON.parse(objectText));
    } catch {
      // Skip malformed lockup snippets.
    }
    index = objectStart + objectText.length;
  }
  return renderers;
}

function readJsonObjectAt(value: string, start: number) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < value.length; index += 1) {
    const char = value[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) return value.slice(start, index + 1);
    }
  }

  return null;
}

function normalizeYouTubeRendererPost(renderer: any): RecentPost | null {
  const id = normalizeText(renderer?.videoId ?? renderer?.contentId ?? extractYouTubeVideoIdFromRenderer(renderer));
  if (!id) return null;
  const title = normalizeText(
    renderer?.title?.runs?.[0]?.text ??
      renderer?.title?.simpleText ??
      renderer?.title?.content ??
      renderer?.headline?.simpleText ??
      renderer?.headline?.runs?.[0]?.text
  );
  if (!title) return null;

  const publishedText = normalizeText(renderer?.publishedTimeText?.simpleText);
  const metadataText = collectRendererText(renderer?.metadata).join(" ");
  const publishedAt = dateFromRelativeText(publishedText || metadataText);
  if (!publishedAt) return null;

  const author = normalizeText(
    renderer?.ownerText?.runs?.[0]?.text ?? renderer?.shortBylineText?.runs?.[0]?.text ?? renderer?.longBylineText?.runs?.[0]?.text
  );

  return {
    id,
    title,
    url: `https://youtu.be/${id}`,
    publishedAt,
    author: author || null,
    excerpt: null,
    platformSlug: "youtube",
    thumbnailUrl: youtubeThumbnailUrl(id),
    coverUrl: youtubeThumbnailUrl(id)
  };
}

function extractYouTubeVideoIdFromRenderer(renderer: any) {
  const serialized = JSON.stringify(renderer);
  return serialized.match(/\/watch\?v=([\w-]+)/)?.[1] ?? null;
}

function collectRendererText(value: any): string[] {
  const found: string[] = [];
  const stack = [value];
  while (stack.length) {
    const current = stack.pop();
    if (Array.isArray(current)) {
      stack.push(...current);
      continue;
    }
    if (current && typeof current === "object") {
      if (typeof current.content === "string") found.push(current.content);
      if (typeof current.simpleText === "string") found.push(current.simpleText);
      if (typeof current.accessibilityLabel === "string") found.push(current.accessibilityLabel);
      stack.push(...Object.values(current));
    }
  }
  return found.map(normalizeText).filter(Boolean);
}

async function fetchXRecentPosts(sourceId: string, since: Date): Promise<RecentPostFetchResult> {
  const handle = normalizeXHandle(sourceId);
  const requestedHandle = normalizeText(sourceId).replace(/^@/, "");
  const xAuthToken = normalizeText(process.env.X_AUTH_TOKEN);
  const xCt0 = normalizeText(process.env.X_CT0);
  if (xAuthToken && xCt0) {
    return fetchXRecentPostsViaCookieSearch(handle, since, { authToken: xAuthToken, ct0: xCt0 });
  }

  const bearerToken = normalizeText(process.env.X_BEARER_TOKEN);
  if (bearerToken) {
    return fetchXRecentPostsViaApi(handle, since, bearerToken);
  }

  const url = `https://x.com/${encodeURIComponent(handle)}`;

  try {
    const html = await fetchText(url, xHeaders());
    const title = pickTitle(html);
    const pageHandle = title?.match(/\(@([^)]+)\)\s*\/\s*X/i)?.[1] ?? null;
    const accountLooksReachable = Boolean(pageHandle && pageHandle.toLowerCase() === handle.toLowerCase());

    if (!accountLooksReachable) {
      return empty(
        "needs_runner",
        "x",
        `@${handle}`,
        since,
        `已访问 X 公开账号页，但无法确认 @${handle} 是否为可用账号。X 匿名页面不直接暴露最近帖子列表，未使用任何个人登录态。`
      );
    }

    return empty(
      "needs_runner",
      "x",
      `@${handle}`,
      since,
      `已确认 X 账号 @${handle} 的公开主页可访问，但 X 匿名 HTML 不包含最近帖子列表。要抓最近一周 posts，需要 X 官方 API 或项目级服务端采集方案；不建议使用个人登录态。`
    );
  } catch (error) {
    const message = errorMessage(error);
    if (message.includes("HTTP 404") || /returned error: 404/i.test(message)) {
      return empty(
        "failed",
        "x",
        `@${requestedHandle || handle}`,
        since,
        xNotFoundMessage(requestedHandle || handle, handle)
      );
    }
    return empty(
      "needs_runner",
      "x",
      `@${handle}`,
      since,
      `X 公开账号页访问失败，暂时无法判断 @${handle} 是否存在或是否有近期发布。请确认 VPN 节点可访问 x.com。${message}。未使用任何个人登录态。`
    );
  }
}

async function fetchXRecentPostsViaCookieSearch(
  handle: string,
  since: Date,
  cookies: { authToken: string; ct0: string }
): Promise<RecentPostFetchResult> {
  try {
    const until = new Date();
    until.setDate(until.getDate() + 1);
    const query = `from:${handle} since:${dateOnly(since)} until:${dateOnly(until)} -filter:replies`;
    const tweets = await runXCookieSearch(query, cookies);
    const posts = tweets
      .map((tweet: any) => normalizeXSearchTweet(tweet, handle))
      .filter((post: RecentPost | null): post is RecentPost => Boolean(post))
      .filter((post: RecentPost) => isWithinWindow(post.publishedAt, since))
      .filter(dedupeByUrl);

    return {
      status: "fetched",
      platformSlug: "x",
      sourceId: `@${handle}`,
      since: since.toISOString(),
      posts,
      message: posts.length
        ? "已通过项目 X 采集账号抓取最近一周官方账号 posts。"
        : `已通过项目 X 采集账号访问 @${handle}，但最近 7 天没有公开发布。`
    };
  } catch (error) {
    return empty(
      "needs_runner",
      "x",
      `@${handle}`,
      since,
      `项目 X 采集账号抓取失败：${errorMessage(error)}。请确认 X_AUTH_TOKEN/X_CT0 仍有效，账号未被验证或风控拦截。`
    );
  }
}

function runXCookieSearch(query: string, cookies: { authToken: string; ct0: string }): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(process.cwd(), "scripts/vendor/bird-search/bird-search.mjs");
    const proxyPreloadPath = path.join(process.cwd(), "scripts/vendor/bird-search/proxy-preload.cjs");
    const nodeOptions = [process.env.NODE_OPTIONS, `--require ${proxyPreloadPath}`].filter(Boolean).join(" ");
    const child = spawn(process.execPath, [scriptPath, query, "--count", "50", "--json"], {
      env: {
        ...process.env,
        AUTH_TOKEN: cookies.authToken,
        CT0: cookies.ct0,
        BIRD_DISABLE_BROWSER_COOKIES: "1",
        NODE_OPTIONS: nodeOptions
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("X cookie search timed out"));
    }, RUNNER_TIMEOUT_MS);

    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      const output = Buffer.concat(stdout).toString("utf8").trim();
      const errorText = Buffer.concat(stderr).toString("utf8").trim();
      let parsed: any;
      try {
        parsed = output ? JSON.parse(output) : null;
      } catch {
        reject(new Error(errorText || output || `bird-search exited with ${code}`));
        return;
      }

      if (code !== 0 || parsed?.error) {
        reject(new Error(parsed?.error || errorText || `bird-search exited with ${code}`));
        return;
      }

      if (!Array.isArray(parsed)) {
        reject(new Error("X cookie search returned an unexpected payload"));
        return;
      }
      resolve(parsed);
    });
  });
}

function normalizeXSearchTweet(tweet: any, fallbackHandle: string): RecentPost | null {
  if (tweet?.inReplyToStatusId || tweet?.in_reply_to_status_id) return null;
  const id = normalizeText(tweet?.id ?? tweet?.id_str);
  const text = normalizeText(tweet?.text);
  const author = normalizeText(tweet?.author?.username) || fallbackHandle;
  const publishedAt = normalizeXPublishedAt(tweet?.created_at ?? tweet?.createdAt);
  const likesCount = pickXLikeCount(tweet);
  if (!id || !publishedAt) return null;

  return {
    id,
    title: text ? text.slice(0, 120) : `X post by @${author}`,
    url: `https://x.com/${author}/status/${id}`,
    publishedAt,
    author: `@${author}`,
    excerpt: text ? text.slice(0, 240) : null,
    platformSlug: "x",
    likesCount,
    likesRaw: likesCount === null ? null : String(likesCount),
    thumbnailUrl: pickXMediaUrl(tweet),
    coverUrl: pickXMediaUrl(tweet)
  };
}

function normalizeXPublishedAt(value: unknown) {
  const raw = normalizeText(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function fetchXRecentPostsViaApi(handle: string, since: Date, bearerToken: string): Promise<RecentPostFetchResult> {
  try {
    const user = await fetchJson(
      `https://api.x.com/2/users/by/username/${encodeURIComponent(handle)}?user.fields=username,name`,
      xApiHeaders(bearerToken)
    );
    const userId = normalizeText(user?.data?.id);
    const username = normalizeText(user?.data?.username) || handle;
    if (!userId) {
      return empty(
        "failed",
        "x",
        `@${handle}`,
        since,
        `未找到 X 官方账号 @${handle}。请确认账号 ID 是否正确，或改用品牌实际官方 handle。`
      );
    }

    const timeline = await fetchJson(
      `https://api.x.com/2/users/${encodeURIComponent(
        userId
      )}/tweets?max_results=20&exclude=replies,retweets&tweet.fields=created_at,text,attachments,public_metrics&expansions=attachments.media_keys&media.fields=media_key,type,url,preview_image_url`,
      xApiHeaders(bearerToken)
    );
    const mediaByKey = new Map(
      (Array.isArray(timeline?.includes?.media) ? timeline.includes.media : [])
        .map((media: any) => [normalizeText(media?.media_key), media])
        .filter(([key]: [string, any]) => Boolean(key))
    );
    const tweets = (Array.isArray(timeline?.data) ? timeline.data : []).map((tweet: any) => ({
      ...tweet,
      attachments: {
        ...tweet.attachments,
        media: Array.isArray(tweet?.attachments?.media_keys)
          ? tweet.attachments.media_keys.map((key: string) => mediaByKey.get(normalizeText(key))).filter(Boolean)
          : tweet?.attachments?.media
      }
    }));
    const posts = tweets
      .map((tweet: any) => normalizeXTweet(tweet, username))
      .filter((post: RecentPost | null): post is RecentPost => Boolean(post))
      .filter((post: RecentPost) => isWithinWindow(post.publishedAt, since))
      .filter(dedupeByUrl);

    return {
      status: "fetched",
      platformSlug: "x",
      sourceId: `@${username}`,
      since: since.toISOString(),
      posts,
      message: posts.length
        ? "已通过 X 官方 API 抓取最近一周官方账号 posts。"
        : `已通过 X 官方 API 访问 @${username}，但最近 7 天没有公开发布。`
    };
  } catch (error) {
    return empty(
      "needs_runner",
      "x",
      `@${handle}`,
      since,
      `X 官方 API 抓取失败：${errorMessage(error)}。请检查 X_BEARER_TOKEN 权限、额度和网络环境；未使用任何个人登录态。`
    );
  }
}

function normalizeXTweet(tweet: any, username: string): RecentPost | null {
  const id = normalizeText(tweet?.id);
  const text = normalizeText(tweet?.text);
  const publishedAt = normalizeText(tweet?.created_at);
  const likesCount = pickXLikeCount(tweet);
  if (!id || !publishedAt) return null;

  return {
    id,
    title: text ? text.slice(0, 120) : `X post by @${username}`,
    url: `https://x.com/${username}/status/${id}`,
    publishedAt,
    author: `@${username}`,
    excerpt: text ? text.slice(0, 240) : null,
    platformSlug: "x",
    likesCount,
    likesRaw: likesCount === null ? null : String(likesCount),
    thumbnailUrl: pickXMediaUrl(tweet),
    coverUrl: pickXMediaUrl(tweet)
  };
}

function pickXLikeCount(tweet: any) {
  return firstNumber(tweet?.public_metrics, ["like_count"]) ??
    firstNumber(tweet, [
      "like_count",
      "likeCount",
      "favorite_count",
      "favoriteCount",
      "favorites",
      "likes"
    ]) ??
    firstNumber(tweet?.legacy, ["favorite_count", "favoriteCount"]) ??
    null;
}

function pickXMediaUrl(tweet: any) {
  const candidates = [
    tweet?.attachments?.media?.[0]?.url,
    tweet?.attachments?.media?.[0]?.preview_image_url,
    tweet?.media?.[0]?.url,
    tweet?.media?.[0]?.media_url_https,
    tweet?.media?.[0]?.media_url,
    tweet?.media?.[0]?.preview_image_url,
    tweet?.photos?.[0]?.url,
    tweet?.photos?.[0]?.media_url_https,
    tweet?.photos?.[0]?.media_url,
    tweet?.video?.preview_image_url,
    tweet?.card?.thumbnail_image_original?.image_value?.url,
    tweet?.card?.binding_values?.thumbnail_image?.image_value?.url,
    tweet?.entities?.media?.[0]?.media_url_https,
    tweet?.entities?.media?.[0]?.media_url,
    tweet?.entities?.media?.[0]?.url,
    tweet?.entities?.media?.[0]?.preview_image_url,
    tweet?.extended_entities?.media?.[0]?.media_url_https,
    tweet?.extended_entities?.media?.[0]?.media_url,
    tweet?.extended_entities?.media?.[0]?.url,
    tweet?.extended_entities?.media?.[0]?.preview_image_url
  ];
  return firstHttpUrl(candidates);
}

function normalizeXHandle(sourceId: string) {
  const handle = normalizeText(sourceId).replace(/^@/, "");
  return X_HANDLE_ALIASES[handle.toLowerCase()] ?? handle;
}

function xNotFoundMessage(requestedHandle: string, resolvedHandle: string) {
  if (requestedHandle.toLowerCase() !== resolvedHandle.toLowerCase()) {
    return `未找到 X 公开账号 @${requestedHandle}。ChatGPT 的公开账号建议使用 @${resolvedHandle}。X 匿名页面不直接暴露最近帖子列表；要抓最近一周 posts，需要 X 官方 API 或项目级服务端采集方案。未使用任何个人登录态。`;
  }
  return `未找到 X 公开账号 @${requestedHandle}。请确认品牌实际官方 handle 是否正确。X 匿名页面不直接暴露最近帖子列表；要抓最近一周 posts，需要 X 官方 API 或项目级服务端采集方案。未使用任何个人登录态。`;
}

function xApiHeaders(bearerToken: string) {
  return {
    accept: "application/json",
    authorization: `Bearer ${bearerToken}`
  };
}

function xHeaders() {
  return {
    accept: "text/html,application/xhtml+xml",
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
  };
}

async function fetchLinkedInRecentPosts(sourceId: string, since: Date): Promise<RecentPostFetchResult> {
  const target = normalizeLinkedInTarget(sourceId);
  const errors: string[] = [];
  let posts: RecentPost[] = [];
  let method = "LinkedIn 公开公司 posts 页";

  for (const url of linkedinPostsCandidates(target)) {
    try {
      const html = await fetchLinkedInText(url, { omitCookie: true });
      posts = extractLinkedInPostsFromHtml(html, target, since);
      if (posts.length) break;
    } catch (error) {
      errors.push(`${url}: ${errorMessage(error)}`);
    }
  }

  if (!posts.length && shouldUseLinkedInLoginFallback()) {
    method = "项目 LinkedIn 采集账号";
    errors.length = 0;
    for (const url of linkedinPostsCandidates(target)) {
      try {
        const html = await fetchLinkedInText(url);
        posts = extractLinkedInPostsFromHtml(html, target, since);
        if (posts.length) break;
      } catch (error) {
        errors.push(`${url}: ${errorMessage(error)}`);
      }
    }
  }

  if (!posts.length && errors.length) {
    return empty(
      "needs_runner",
      "linkedin",
      target.label,
      since,
      linkedinFailureMessage(target, errors)
    );
  }

  return {
    status: "fetched",
    platformSlug: "linkedin",
    sourceId: target.label,
    since: since.toISOString(),
    posts,
    message: posts.length
      ? `已通过 ${method} 抓取最近一周公司页 posts。`
      : shouldUseLinkedInLoginFallback()
        ? `已通过项目 LinkedIn 采集账号访问 ${target.label}，但最近 7 天没有解析到公开公司页 posts。`
        : `已访问 LinkedIn 公开公司页 ${target.label}，但最近 7 天没有解析到 posts。若公开页被 LinkedIn 限制，可由管理员配置项目专用采集账号 cookie。`
  };
}

type LinkedInTarget = ReturnType<typeof normalizeLinkedInTarget>;

function normalizeLinkedInTarget(sourceId: string) {
  const raw = normalizeText(sourceId).replace(/\/$/, "");
  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    if (url.hostname.includes("linkedin.com")) {
      const parts = url.pathname.split("/").filter(Boolean);
      const companyIndex = parts.findIndex((part) => part.toLowerCase() === "company");
      if (companyIndex >= 0 && parts[companyIndex + 1]) {
        return { type: "company" as const, id: parts[companyIndex + 1], label: `company/${parts[companyIndex + 1]}` };
      }
      if (parts[0]) return { type: "unknown" as const, id: parts[0], label: parts.join("/") };
    }
  } catch {
    // Not a URL; continue with handle cleanup.
  }

  const company = raw
    .replace(/^@/, "")
    .replace(/^linkedin[\s:_-]+/i, "")
    .replace(/^company\//i, "")
    .trim();
  return { type: "company" as const, id: company, label: `company/${company}` };
}

function linkedinPostsCandidates(target: LinkedInTarget) {
  if (target.type !== "company") return [`https://www.linkedin.com/${target.label}/posts/`];
  const encoded = encodeURIComponent(target.id);
  return [
    `https://www.linkedin.com/company/${encoded}/posts/`,
    `https://www.linkedin.com/company/${encoded}/posts/?feedView=all`,
    `https://www.linkedin.com/company/${encoded}/`
  ];
}

async function fetchLinkedInText(url: string, options: { omitCookie?: boolean } = {}) {
  const proxyUrl = outboundProxyUrl();
  const headers = linkedinHeaders(options);
  if (proxyUrl) return fetchTextViaCurl(url, proxyUrl, headers, LINKEDIN_TIMEOUT_MS);

  const response = await fetchWithTimeout(url, {
    headers,
    signalTimeoutMs: LINKEDIN_TIMEOUT_MS
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

function linkedinHeaders(options: { omitCookie?: boolean } = {}) {
  const cookie = options.omitCookie || !shouldUseLinkedInLoginFallback() ? "" : linkedinCookie();
  return {
    accept: "text/html,application/xhtml+xml,application/json",
    "accept-language": "en-US,en;q=0.9",
    "csrf-token": linkedInCsrfToken(),
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    referer: "https://www.linkedin.com/",
    ...(cookie ? { cookie } : {})
  };
}

function linkedinCookie() {
  return normalizeText(process.env.LINKEDIN_COOKIE || process.env.LINKEDIN_LI_AT).includes("=")
    ? normalizeText(process.env.LINKEDIN_COOKIE || process.env.LINKEDIN_LI_AT)
    : sessionCookie(process.env.LINKEDIN_LI_AT).replace("sessionid=", "li_at=");
}

function linkedInCsrfToken() {
  const jsession = normalizeText(linkedinCookie().match(/JSESSIONID="?([^";]+)"?/i)?.[1]);
  return jsession || "ajax:0";
}

function shouldUseLinkedInLoginFallback() {
  return normalizeText(process.env.LINKEDIN_USE_LOGIN_FALLBACK).toLowerCase() === "true" && Boolean(linkedinCookie());
}

function extractLinkedInPostsFromHtml(html: string, target: LinkedInTarget, since: Date) {
  return [
    ...extractLinkedInActivityAnchors(html, target),
    ...extractLinkedInJsonLdPosts(html, target),
    ...extractLinkedInEmbeddedPosts(html, target)
  ]
    .filter((post) => isWithinWindow(post.publishedAt, since))
    .filter(dedupeByUrl);
}

function extractLinkedInActivityAnchors(html: string, target: LinkedInTarget): RecentPost[] {
  const posts: RecentPost[] = [];
  const patterns = [
    /https?:\\\/\\\/(?:www\.)?linkedin\.com\\\/feed\\\/update\\\/urn:li:(?:activity|ugcPost):(\d+)[^"\\]*/gi,
    /https?:\/\/(?:www\.)?linkedin\.com\/feed\/update\/urn:li:(?:activity|ugcPost):(\d+)[^"'<\s]*/gi,
    /\/feed\/update\/urn:li:(?:activity|ugcPost):(\d+)[^"'<\s]*/gi
  ];

  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const id = match[1];
      const rawUrl = decodeLinkedInUrl(match[0]);
      const matchIndex = match.index ?? 0;
      const around = html.slice(Math.max(0, matchIndex - 3000), matchIndex + 3000);
      const publishedAt = extractLinkedInPublishedAt(around);
      posts.push({
        id,
        title: extractLinkedInTitle(around) ?? `LinkedIn post by ${target.label}`,
        url: canonicalLinkedInPostUrl(rawUrl, id),
        publishedAt,
        author: target.label,
        excerpt: extractLinkedInExcerpt(around),
        platformSlug: "linkedin",
        thumbnailUrl: extractOpenGraphImage(around),
        coverUrl: extractOpenGraphImage(around)
      });
    }
  }
  return posts.filter((post) => Boolean(post.publishedAt));
}

function extractLinkedInJsonLdPosts(html: string, target: LinkedInTarget): RecentPost[] {
  return Array.from(html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi))
    .flatMap((match) => parseJsonLikePosts(decodeXml(match[1]), target))
    .filter((post): post is RecentPost => Boolean(post));
}

function extractLinkedInEmbeddedPosts(html: string, target: LinkedInTarget): RecentPost[] {
  const objects = collectObjectsFromJsonInHtml(html);
  return objects
    .map((item) => normalizeLinkedInObjectPost(item, target))
    .filter((post): post is RecentPost => Boolean(post));
}

function parseJsonLikePosts(value: string, target: LinkedInTarget): Array<RecentPost | null> {
  try {
    return collectAnyObjects(JSON.parse(value)).map((item) => normalizeLinkedInObjectPost(item, target));
  } catch {
    return [];
  }
}

function collectObjectsFromJsonInHtml(html: string) {
  const objects: Record<string, unknown>[] = [];
  const markers = ["urn:li:activity:", "urn:li:ugcPost:"];
  for (const marker of markers) {
    let index = 0;
    while (index < html.length) {
      const found = html.indexOf(marker, index);
      if (found < 0) break;
      const objectStart = html.lastIndexOf("{", found);
      const objectText = objectStart >= 0 ? readJsonObjectAt(html, objectStart) : null;
      if (objectText) {
        try {
          objects.push(JSON.parse(objectText));
        } catch {
          // Skip malformed snippets.
        }
      }
      index = found + marker.length;
    }
  }
  return objects;
}

function collectAnyObjects(value: unknown): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = [];
  const stack = [value];
  while (stack.length) {
    const current = stack.pop();
    if (Array.isArray(current)) {
      stack.push(...current);
      continue;
    }
    if (current && typeof current === "object") {
      const item = current as Record<string, unknown>;
      found.push(item);
      stack.push(...Object.values(item));
    }
  }
  return found;
}

function normalizeLinkedInObjectPost(item: Record<string, unknown>, target: LinkedInTarget): RecentPost | null {
  const serialized = JSON.stringify(item);
  const id = extractLinkedInPostId(serialized);
  if (!id) return null;

  const rawUrl = firstString(item, ["url", "link", "permalink", "shareUrl", "canonicalUrl"]);
  const publishedAt =
    firstString(item, ["datePublished", "publishedAt", "createdAt", "createdTime", "postedAt"]) ??
    dateFromUnix(firstNumber(item, ["created", "createdTime", "publishedAt", "postedAt"]));
  if (!publishedAt) return null;

  const text = firstString(item, ["text", "description", "articleBody", "commentary", "title", "name"]) ?? extractLinkedInExcerpt(serialized);
  return {
    id,
    title: text ? stripHtml(text).slice(0, 120) : `LinkedIn post by ${target.label}`,
    url: canonicalLinkedInPostUrl(rawUrl, id),
    publishedAt,
    author: firstString(item, ["author", "actor", "name"]) ?? target.label,
    excerpt: text ? stripHtml(text).slice(0, 240) : null,
    platformSlug: "linkedin",
    thumbnailUrl: firstImageUrl(item) ?? extractOpenGraphImage(serialized),
    coverUrl: firstImageUrl(item) ?? extractOpenGraphImage(serialized)
  };
}

function extractOpenGraphImage(value: string) {
  const image =
    value.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
    value.match(/(?:image|thumbnailUrl|thumbnail|display_url|previewImage)["']?\s*:\s*["']([^"']+)["']/i)?.[1];
  return image ? decodeLinkedInUrl(image) : null;
}

function firstImageUrl(item: Record<string, unknown>) {
  const direct = firstString(item, ["image", "thumbnailUrl", "thumbnail", "display_url", "previewImage", "coverUrl"]);
  if (direct) return direct;
  const images = item.image ?? item.images ?? item.thumbnail;
  if (Array.isArray(images)) return firstHttpUrl(images);
  if (images && typeof images === "object") {
    return firstString(images as Record<string, unknown>, ["url", "contentUrl", "thumbnailUrl"]);
  }
  return null;
}

function extractLinkedInPostId(value: string) {
  return value.match(/urn:li:(?:activity|ugcPost):(\d+)/i)?.[1] ?? value.match(/activity-(\d+)/i)?.[1] ?? null;
}

function extractLinkedInPublishedAt(value: string) {
  const decoded = decodeLinkedInUrl(value);
  const iso =
    decoded.match(/(?:datePublished|publishedAt|createdAt|postedAt)["']?\s*[:=]\s*["']([^"']+)["']/i)?.[1] ??
    decoded.match(/<time[^>]+datetime=["']([^"']+)["']/i)?.[1];
  if (iso) {
    const date = new Date(iso);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }

  const milliseconds = decoded.match(/(?:created|createdTime|publishedAt)["']?\s*[:=]\s*(\d{13})/i)?.[1];
  if (milliseconds) return dateFromUnix(Number(milliseconds));

  const seconds = decoded.match(/(?:created|createdTime|publishedAt)["']?\s*[:=]\s*(\d{10})/i)?.[1];
  if (seconds) return dateFromUnix(Number(seconds));

  return dateFromRelativeText(stripHtml(decoded));
}

function extractLinkedInTitle(value: string) {
  const title =
    value.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
    value.match(/(?:title|headline|name)["']?\s*:\s*["']([^"']+)["']/i)?.[1];
  return title ? stripHtml(decodeLinkedInUrl(title)).slice(0, 120) : null;
}

function extractLinkedInExcerpt(value: string) {
  const description =
    value.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
    value.match(/(?:description|text|commentary|articleBody)["']?\s*:\s*["']([^"']+)["']/i)?.[1];
  const text = description ? stripHtml(decodeLinkedInUrl(description)).slice(0, 240) : "";
  return text || null;
}

function canonicalLinkedInPostUrl(rawUrl: string | null, id: string) {
  const url = decodeLinkedInUrl(rawUrl ?? "");
  const canonical = canonicalizeUrl(url.startsWith("/") ? `https://www.linkedin.com${url}` : url).canonicalUrl;
  return canonical ?? `https://www.linkedin.com/feed/update/urn:li:activity:${id}/`;
}

function decodeLinkedInUrl(value: string) {
  return decodeXml(value)
    .replace(/\\\//g, "/")
    .replace(/\\u002F/g, "/")
    .replace(/\\u003A/g, ":")
    .replace(/\\u0026/g, "&")
    .replace(/\\u002D/g, "-");
}

function linkedinFailureMessage(target: LinkedInTarget, errors: string[]) {
  const fallback = shouldUseLinkedInLoginFallback()
    ? "已尝试项目 LinkedIn 采集账号，但未解析到 posts。请确认 LINKEDIN_COOKIE/LI_AT 仍有效、账号未触发验证，并且 VPN 节点可访问 linkedin.com。"
    : "LinkedIn 对公司页 posts 的公开 HTML 经常限制内容。官方 API 通常需要目标组织授权；如需自动抓取任意品牌公司页，建议只使用项目专用采集账号 cookie 作为服务端兜底，不让普通用户登录。";
  return `LinkedIn 公司页 ${target.label} 抓取受限：${errors.slice(0, 2).join("；")}。${fallback}`;
}

async function fetchRedditRecentPosts(sourceId: string, since: Date): Promise<RecentPostFetchResult> {
  const target = normalizeRedditTarget(sourceId);
  const errors: string[] = [];
  let posts: RecentPost[] = [];
  let method = "";

  try {
    posts = await fetchRedditJsonPosts(target, since);
    method = "Reddit 公开 JSON";
  } catch (error) {
    errors.push(`JSON: ${errorMessage(error)}`);
  }

  if (!posts.length) {
    try {
      posts = await fetchRedditRssPosts(target, since);
      method = "Reddit 公开 RSS";
    } catch (error) {
      errors.push(`RSS: ${errorMessage(error)}`);
    }
  }

  if (!posts.length) {
    try {
      posts = await fetchRedditHtmlPosts(target, since);
      method = "Reddit 公开 HTML";
    } catch (error) {
      errors.push(`HTML: ${errorMessage(error)}`);
    }
  }

  if (!method && errors.length) {
    return empty(
      "needs_runner",
      "reddit",
      target.label,
      since,
      redditFailureMessage(target, errors)
    );
  }

  posts = await enrichRedditScores(posts);

  return {
    status: "fetched",
    platformSlug: "reddit",
    sourceId: target.label,
    since: since.toISOString(),
    posts,
    message: posts.length
      ? `已通过 ${method} 抓取最近一周${target.type === "user" ? "官方账号" : "社区"}帖子。`
      : target.type === "user"
        ? `已访问 Reddit 用户账号 ${target.label}，但最近 7 天没有公开发布。`
        : `已访问 Reddit 社区 ${target.label}，但最近 7 天没有新帖子。只有确认该社区由品牌官方运营时，才建议纳入品牌发布内容。`
  };
}

async function enrichRedditScores(posts: RecentPost[]) {
  const enriched: RecentPost[] = [];
  for (const post of posts.slice(0, 12)) {
    enriched.push(await enrichRedditScore(post));
  }
  return [...enriched, ...posts.slice(12)];
}

async function enrichRedditScore(post: RecentPost): Promise<RecentPost> {
  if (typeof post.likesCount === "number" || post.likesRaw) return post;
  try {
    const json = await fetchJson(`${post.url.replace(/\/$/, "")}.json`, redditHeaders());
    const data = Array.isArray(json) ? json[0]?.data?.children?.[0]?.data : null;
    const score = typeof data?.ups === "number" ? data.ups : typeof data?.score === "number" ? data.score : null;
    return score === null ? post : { ...post, likesCount: score, likesRaw: String(score) };
  } catch {
    return post;
  }
}

async function fetchRedditJsonPosts(target: RedditTarget, since: Date) {
  const url =
    target.type === "user"
      ? `https://www.reddit.com/user/${encodeURIComponent(target.id)}/submitted.json?limit=50`
      : `https://www.reddit.com/r/${encodeURIComponent(target.id)}/new.json?limit=50`;
  const json = await fetchJson(url, redditHeaders());
  const children = Array.isArray(json?.data?.children) ? json.data.children : [];
  return children
    .map((item: any) => {
      const data = item?.data ?? {};
      const publishedAt = data.created_utc ? new Date(data.created_utc * 1000).toISOString() : null;
      const permalink = typeof data.permalink === "string" ? `https://www.reddit.com${data.permalink}` : null;
      if (!data.id || !permalink) return null;
      return {
        id: String(data.id),
        title: normalizeText(data.title) || "Untitled Reddit post",
        url: permalink,
        publishedAt,
        author: data.author ? String(data.author) : null,
        excerpt: normalizeText(data.selftext).slice(0, 240) || null,
        platformSlug: "reddit",
        likesCount: typeof data.ups === "number" ? data.ups : typeof data.score === "number" ? data.score : null,
        likesRaw:
          typeof data.ups === "number"
            ? String(data.ups)
            : typeof data.score === "number"
              ? String(data.score)
              : null,
        thumbnailUrl: redditThumbnailFromData(data),
        coverUrl: redditThumbnailFromData(data)
      } satisfies RecentPost;
    })
    .filter((post: RecentPost | null): post is RecentPost => Boolean(post))
    .filter((post: RecentPost) => isWithinWindow(post.publishedAt, since))
    .filter(dedupeByUrl);
}

async function fetchRedditRssPosts(target: RedditTarget, since: Date) {
  const url =
    target.type === "user"
      ? `https://old.reddit.com/user/${encodeURIComponent(target.id)}/submitted/.rss?limit=50`
      : `https://old.reddit.com/r/${encodeURIComponent(target.id)}/new/.rss?limit=50`;
  const xml = await fetchText(url);
  return Array.from(xml.matchAll(/<entry[\s\S]*?<\/entry>/gi))
    .map((match) => parseRedditRssEntry(match[0], target))
    .filter((post): post is RecentPost => Boolean(post))
    .filter((post) => isWithinWindow(post.publishedAt, since))
    .filter(dedupeByUrl);
}

function parseRedditRssEntry(xml: string, target: RedditTarget): RecentPost | null {
  const id = normalizeText(pickXml(xml, "id") ?? pickXml(xml, "guid"));
  const title = pickXml(xml, "title");
  const updated = pickXml(xml, "updated") ?? pickXml(xml, "published");
  const author = pickNestedXml(xml, "author", "name");
  const linkMatch = xml.match(/<link[^>]+href=["']([^"']+)["']/i);
  const link = linkMatch ? decodeXml(linkMatch[1]) : pickXml(xml, "link");
  const canonical = findRedditCommentsUrl(xml) ?? canonicalRedditUrl(link);
  if (!title || !canonical) return null;

  return {
    id: redditPostIdFromUrl(canonical) ?? id ?? canonical,
    title,
    url: canonical,
    publishedAt: updated,
    author: normalizeRedditAuthor(author) ?? (target.type === "user" ? target.id : null),
    excerpt: cleanRedditExcerpt(stripHtml(pickXml(xml, "content") ?? pickXml(xml, "summary") ?? "")),
    platformSlug: "reddit",
    ...parseRedditScore(xml)
  };
}

async function fetchRedditHtmlPosts(target: RedditTarget, since: Date) {
  const url =
    target.type === "user"
      ? `https://old.reddit.com/user/${encodeURIComponent(target.id)}/submitted/?limit=50`
      : `https://old.reddit.com/r/${encodeURIComponent(target.id)}/new/?limit=50`;
  const html = await fetchText(url);
  return Array.from(html.matchAll(/<div[^>]+class="[^"]*\bthing\b[^"]*"[\s\S]*?(?=<div[^>]+class="[^"]*\bthing\b|<\/body>)/gi))
    .map((match) => parseRedditHtmlThing(match[0], target))
    .filter((post): post is RecentPost => Boolean(post))
    .filter((post) => isWithinWindow(post.publishedAt, since))
    .filter(dedupeByUrl);
}

function parseRedditHtmlThing(html: string, target: RedditTarget): RecentPost | null {
  const titleMatch = html.match(/<a[^>]+class="[^"]*\btitle\b[^"]*"[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
  const timeMatch = html.match(/<time[^>]+datetime=["']([^"']+)["']/i);
  if (!titleMatch || !timeMatch) return null;

  const url = findRedditCommentsUrl(html) ?? canonicalRedditUrl(decodeXml(titleMatch[1]));
  const title = stripHtml(titleMatch[2]);
  if (!url || !title) return null;

  const authorMatch = html.match(/<a[^>]+class="[^"]*\bauthor\b[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
  return {
    id: redditPostIdFromUrl(url) ?? url,
    title,
    url,
    publishedAt: decodeXml(timeMatch[1]),
    author: normalizeRedditAuthor(authorMatch ? stripHtml(authorMatch[1]) : null) ?? (target.type === "user" ? target.id : null),
    excerpt: null,
    platformSlug: "reddit",
    ...parseRedditScore(html)
  };
}

function parseRedditScore(value: string): Pick<RecentPost, "likesCount" | "likesRaw"> {
  const scoreText =
    value.match(/score unvoted[^>]*title=["']([^"']+)["']/i)?.[1] ??
    value.match(/data-score=["']([^"']+)["']/i)?.[1] ??
    value.match(/score likes[^>]*>([\s\S]*?)<\/div>/i)?.[1] ??
    "";
  const cleaned = normalizeText(stripHtml(decodeXml(scoreText))).replace(/\bpoints?\b/i, "").trim();
  const likesCount = parseCompactNumber(cleaned);
  return {
    likesCount,
    likesRaw: cleaned || null
  };
}

function redditThumbnailFromData(data: any) {
  const candidates = [
    data?.preview?.images?.[0]?.source?.url,
    data?.preview?.images?.[0]?.resolutions?.at?.(-1)?.url,
    data?.thumbnail
  ];
  for (const candidate of candidates) {
    const url = normalizeText(candidate);
    if (!url || url === "self" || url === "default" || url === "nsfw") continue;
    if (/^https?:\/\//i.test(url)) return decodeXml(url);
  }
  return null;
}

function redditHeaders() {
  return {
    accept: "application/json,text/plain,*/*",
    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AIBrandMarketInspirationPool/0.1"
  };
}

type RedditTarget = ReturnType<typeof normalizeRedditTarget>;

function normalizeRedditTarget(sourceId: string) {
  const raw = normalizeText(sourceId).replace(/\/$/, "");
  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    if (url.hostname.includes("reddit.com")) {
      const [kind, id] = url.pathname.split("/").filter(Boolean);
      if (/^u(ser)?$/i.test(kind) && id) return { type: "user" as const, id, label: `u/${id}` };
      if (/^r$/i.test(kind) && id) return { type: "subreddit" as const, id, label: `r/${id}` };
    }
  } catch {
    // Not a URL; continue with handle cleanup.
  }

  const withoutPrefix = raw.replace(/^reddit[\s:_-]+/i, "");
  const user = withoutPrefix.match(/^u(?:ser)?\/(.+)$/i);
  if (user?.[1]) return { type: "user" as const, id: user[1], label: `u/${user[1]}` };
  const subreddit = withoutPrefix.match(/^r\/(.+)$/i);
  if (subreddit?.[1]) return { type: "subreddit" as const, id: subreddit[1], label: `r/${subreddit[1]}` };
  const userId = withoutPrefix.replace(/^@/, "");
  return { type: "user" as const, id: userId, label: `u/${userId}` };
}

function parseYouTubeEntry(xml: string): RecentPost | null {
  const id = pickXml(xml, "yt:videoId") ?? pickXml(xml, "id");
  const title = pickXml(xml, "title");
  const publishedAt = pickXml(xml, "published");
  const author = pickNestedXml(xml, "author", "name");
  const canonical = id ? `https://youtu.be/${id}` : null;

  if (!id || !title || !canonical) return null;

  return {
    id,
    title,
    url: canonical,
    publishedAt,
    author,
    excerpt: null,
    platformSlug: "youtube",
    thumbnailUrl: youtubeThumbnailUrl(id),
    coverUrl: youtubeThumbnailUrl(id)
  };
}

function youtubeThumbnailUrl(videoId: string) {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

function extractRecentPostsFromRunnerOutput(
  value: unknown,
  platformSlug: string,
  sourceId: string,
  since: Date
): RecentPost[] {
  return collectObjects(value)
    .map((item) => normalizeRunnerPost(item, platformSlug, sourceId))
    .filter((post): post is RecentPost => Boolean(post))
    .filter((post) => isWithinWindow(post.publishedAt, since))
    .filter(dedupeByUrl);
}

function normalizeRunnerPost(item: Record<string, unknown>, platformSlug: string, sourceId: string): RecentPost | null {
  const rawUrl = firstString(item, ["url", "link", "permalink", "postUrl", "shortcodeUrl"]);
  const shortcode = firstString(item, ["shortcode", "code", "id", "pk"]);
  const canonical = canonicalizeUrl(rawUrl || (shortcode ? `https://www.instagram.com/p/${shortcode}/` : "")).canonicalUrl;
  const publishedAt =
    firstString(item, ["publishedAt", "published_at", "timestamp", "takenAt", "taken_at", "createdAt", "created_at"]) ??
    dateFromUnix(firstNumber(item, ["taken_at_timestamp", "created_utc", "timestamp"]));

  if (!canonical || !publishedAt) return null;

  const caption = firstString(item, ["caption", "text", "description", "title"]);
  const likesCount =
    firstNumber(item, ["likesCount", "likeCount", "likes", "favorite_count", "favoriteCount", "ups", "score"]) ?? null;
  const likesRaw = firstString(item, ["likesRaw", "likeRaw", "likesText", "likeText", "scoreText"]);
  const coverUrl = firstString(item, [
    "coverUrl",
    "thumbnailUrl",
    "thumbnail",
    "previewImage",
    "preview_image_url",
    "display_url",
    "displayUrl",
    "imageUrl",
    "image",
    "og:image"
  ]);
  return {
    id: shortcode || canonical,
    title: caption ? caption.slice(0, 120) : `${platformSlug} post by ${sourceId}`,
    url: canonical,
    publishedAt,
    author: firstString(item, ["author", "username", "ownerUsername", "owner_username"]) ?? sourceId,
    excerpt: caption ? caption.slice(0, 240) : null,
    platformSlug,
    likesCount,
    likesRaw: likesRaw ?? (likesCount === null ? null : String(likesCount)),
    thumbnailUrl: coverUrl,
    coverUrl
  };
}

function firstHttpUrl(values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && /^https?:\/\//i.test(value.trim())) return normalizeText(value);
    if (value && typeof value === "object") {
      const nested = firstString(value as Record<string, unknown>, ["url", "contentUrl", "thumbnailUrl", "media_url_https", "media_url"]);
      if (nested && /^https?:\/\//i.test(nested)) return nested;
    }
  }
  return null;
}

function collectObjects(value: unknown): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = [];
  const stack = [value];
  while (stack.length) {
    const current = stack.pop();
    if (Array.isArray(current)) {
      stack.push(...current);
      continue;
    }
    if (current && typeof current === "object") {
      const item = current as Record<string, unknown>;
      if (looksLikePost(item)) found.push(item);
      for (const nested of Object.values(item)) {
        if (nested && typeof nested === "object") stack.push(nested);
      }
    }
  }
  return found;
}

function looksLikePost(item: Record<string, unknown>) {
  return Boolean(
    firstString(item, ["url", "link", "permalink", "postUrl", "shortcodeUrl", "shortcode", "code"]) &&
      (firstString(item, ["publishedAt", "published_at", "timestamp", "takenAt", "taken_at", "createdAt", "created_at"]) ||
        firstNumber(item, ["taken_at_timestamp", "created_utc", "timestamp"]))
  );
}

function firstString(item: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) return normalizeText(value);
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function firstNumber(item: unknown, keys: string[]) {
  if (!item || typeof item !== "object") return null;
  const record = item as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && /^\d+(\.\d+)?$/.test(value)) return Number(value);
  }
  return null;
}

function parseCompactNumber(value: string | null | undefined) {
  const raw = normalizeText(value).toLowerCase().replace(/,/g, "").replace(/\+/g, "").trim();
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

function dateFromUnix(value: number | null) {
  if (!value) return null;
  const milliseconds = value > 10_000_000_000 ? value : value * 1000;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function dateFromRelativeText(value: string) {
  const text = normalizeText(value).toLowerCase();
  if (!text) return null;
  if (text.includes("just now")) return new Date().toISOString();
  if (text.includes("yesterday") || text.includes("昨日") || text.includes("昨天")) {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    return date.toISOString();
  }

  const match = text.match(/(\d+)\s*(second|minute|hour|day|week|month|year|秒|分|分钟|小時|小时|時間|时|日|天|週|周|週間|月|ヶ月|か月|年)s?\s*(ago|前)?/);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2];
  if (!Number.isFinite(amount)) return null;

  const date = new Date();
  if (["second", "秒"].includes(unit)) date.setSeconds(date.getSeconds() - amount);
  if (["minute", "分", "分钟"].includes(unit)) date.setMinutes(date.getMinutes() - amount);
  if (["hour", "小時", "小时", "時間", "时"].includes(unit)) date.setHours(date.getHours() - amount);
  if (["day", "日", "天"].includes(unit)) date.setDate(date.getDate() - amount);
  if (["week", "週", "周", "週間"].includes(unit)) date.setDate(date.getDate() - amount * 7);
  if (["month", "月", "ヶ月", "か月"].includes(unit)) date.setMonth(date.getMonth() - amount);
  if (["year", "年"].includes(unit)) date.setFullYear(date.getFullYear() - amount);
  return date.toISOString();
}

function dedupeByUrl(post: RecentPost, index: number, posts: RecentPost[]) {
  return posts.findIndex((item) => item.url === post.url) === index;
}

async function fetchText(url: string, headers?: Record<string, string>) {
  const proxyUrl = outboundProxyUrl();
  const requestHeaders = headers ?? {
    accept: "application/xml,text/xml,text/plain",
    "user-agent": "AIBrandMarketInspirationPool/0.1 recent-post-fetcher"
  };
  if (proxyUrl) {
    return fetchTextViaCurl(url, proxyUrl, requestHeaders, TIMEOUT_MS);
  }

  const response = await fetchWithTimeout(url, {
    headers: requestHeaders
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

function fetchTextViaCurl(
  targetUrl: string,
  proxyUrl: string,
  headers: Record<string, string>,
  timeoutMs: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      "-f",
      "-sS",
      "-L",
      "--connect-timeout",
      "5",
      "--max-time",
      String(Math.ceil(timeoutMs / 1000)),
      "--config",
      "-",
      "-w",
      "\n__STATUS__:%{http_code}"
    ];
    const child = spawn("curl", args, { stdio: ["pipe", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const config = [
      `url = "${targetUrl}"`,
      `proxy = "${proxyUrl}"`,
      ...Object.entries(headers).map(([key, value]) => `header = "${key}: ${escapeCurlConfig(value)}"`)
    ].join("\n");

    child.stdin.end(config);
    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.on("error", reject);
    child.on("close", (code) => {
      const output = Buffer.concat(stdout).toString("utf8");
      const errorText = Buffer.concat(stderr).toString("utf8").trim();
      if (code !== 0) {
        reject(new Error(errorText || `curl exited with ${code}`));
        return;
      }

      const marker = output.lastIndexOf("\n__STATUS__:");
      if (marker < 0) {
        reject(new Error("curl response did not include status marker"));
        return;
      }

      const body = output.slice(0, marker);
      const status = Number(output.slice(marker).match(/__STATUS__:(\d+)/)?.[1] ?? 0);
      if (status < 200 || status >= 300) {
        reject(new Error(`HTTP ${status}`));
        return;
      }
      resolve(body);
    });
  });
}

async function fetchJson(url: string, headers?: Record<string, string>) {
  const proxyUrl = outboundProxyUrl();
  const requestHeaders = headers ?? {
    accept: "application/json",
    "user-agent": "AIBrandMarketInspirationPool/0.1 recent-post-fetcher"
  };
  if (proxyUrl) {
    const text = await fetchTextViaCurl(url, proxyUrl, requestHeaders, TIMEOUT_MS);
    return JSON.parse(text);
  }

  const response = await fetchWithTimeout(url, {
    headers: requestHeaders
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function outboundProxyUrl() {
  return normalizeText(process.env.SOCIAL_PROXY_URL || process.env.INSTAGRAM_PROXY_URL || process.env.HTTPS_PROXY || process.env.HTTP_PROXY);
}

function getSinceDate() {
  const since = new Date();
  since.setDate(since.getDate() - WINDOW_DAYS);
  return since;
}

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function isWithinWindow(value: string | null, since: Date) {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date >= since;
}

function normalizeSourceId(value: string) {
  const raw = normalizeText(value).replace(/\/$/, "");
  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    const firstPathPart = url.pathname.split("/").filter(Boolean)[0];
    if (url.hostname.includes("instagram.com") && firstPathPart) return normalizeSourceId(firstPathPart);
    if ((url.hostname === "x.com" || url.hostname === "twitter.com") && firstPathPart) return normalizeSourceId(firstPathPart);
    if (url.hostname.includes("linkedin.com")) return normalizeSourceId(firstPathPart ?? raw);
  } catch {
    // Not a URL; continue with handle cleanup.
  }

  return raw
    .replace(/^@/, "")
    .replace(/^(ins|ig|instagram)[\s:_-]+/i, "")
    .replace(/^(x|twitter)[\s:_-]+/i, "")
    .trim();
}

function pickXml(xml: string, tag: string) {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = xml.match(new RegExp(`<${escaped}[^>]*>([\\s\\S]*?)<\\/${escaped}>`, "i"));
  return match ? decodeXml(match[1]) : null;
}

function pickNestedXml(xml: string, parent: string, child: string) {
  const parentMatch = xml.match(new RegExp(`<${parent}[^>]*>([\\s\\S]*?)<\\/${parent}>`, "i"));
  return parentMatch ? pickXml(parentMatch[1], child) : null;
}

function pickTitle(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeXml(match[1]) : null;
}

function decodeXml(value: string) {
  return normalizeText(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number(decimal)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function cleanRedditExcerpt(value: string) {
  const text = normalizeText(value)
    .replace(/\s*submitted by\s+\/?u\/[\w-]+[\s\S]*$/i, "")
    .replace(/\s*\[link\]\s*\[comments\]\s*$/i, "")
    .slice(0, 240);
  return text || null;
}

function stripHtml(value: string | null) {
  if (!value) return "";
  return decodeXml(value.replace(/<[^>]+>/g, " "));
}

function canonicalRedditUrl(value: string | null) {
  const raw = normalizeText(value);
  if (!raw) return null;
  try {
    const url = new URL(raw.startsWith("/") ? `https://www.reddit.com${raw}` : raw);
    if (!url.hostname.includes("reddit.com")) return raw;
    url.hostname = "www.reddit.com";
    url.protocol = "https:";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function findRedditCommentsUrl(value: string) {
  const decoded = decodeXml(value);
  const match = decoded.match(/(?:https?:\/\/(?:old\.|www\.)?reddit\.com)?(\/r\/[^/\s"'<>]+\/comments\/[^/\s"'<>]+\/[^"'<>]*)/i);
  return match ? canonicalRedditUrl(match[1]) : null;
}

function redditPostIdFromUrl(value: string) {
  return value.match(/\/comments\/([^/?#]+)/i)?.[1] ?? null;
}

function normalizeRedditAuthor(value: string | null) {
  const author = normalizeText(value).replace(/^\/?u(?:ser)?\//i, "");
  return author || null;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知错误";
}

function redditFailureMessage(target: RedditTarget, errors: string[]) {
  const tried = `已尝试 JSON、RSS 和 HTML 公开页面，未使用任何个人登录态。${errors.join("；")}`;
  const allNotFound = errors.length > 0 && errors.every((error) => error.includes("HTTP 404"));
  const hasForbidden = errors.some((error) => error.includes("HTTP 403") || /returned error: 403/i.test(error));
  const hasTimeout = errors.some((error) => /timed out|timeout|aborted/i.test(error));
  if (hasForbidden) {
    return `Reddit 当前公开请求被 VPN 节点或网络出口拦截（HTTP 403），暂时无法判断 ${target.label} 是否存在或是否有近期发布。请切换 VPN 节点后重试。${tried}`;
  }
  if (target.type === "user" && hasTimeout) {
    return `Reddit 官方用户账号 ${target.label} 当前网络公开抓取超时，暂时无法判断账号是否存在或是否有近期发布。请切换 VPN 节点或稍后重试。${tried}`;
  }
  if (target.type === "user" && allNotFound) {
    return `未找到 Reddit 公开用户账号 ${target.label}。该品牌可能没有官方 Reddit 账号，或账号名称与输入不一致。${tried}`;
  }
  if (target.type === "user") {
    return `Reddit 官方用户账号 ${target.label} 公开抓取失败。${tried}`;
  }
  return `Reddit 社区 ${target.label} 公开抓取失败。只有确认该社区由品牌官方运营时，才建议纳入品牌发布内容。${tried}`;
}

function empty(
  status: RecentPostFetchResult["status"],
  platformSlug: string,
  sourceId: string,
  since: Date,
  message: string
): RecentPostFetchResult {
  return {
    status,
    platformSlug,
    sourceId,
    since: since.toISOString(),
    posts: [],
    message
  };
}
