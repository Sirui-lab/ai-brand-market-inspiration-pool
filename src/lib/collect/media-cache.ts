import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { normalizeText } from "@/lib/import/normalizers";

const CACHE_DIR = path.join(process.cwd(), "public", "media-cache");
const CACHE_PATH_PREFIX = "/media-cache/";

function mediaCacheDir() {
  return process.env.MEDIA_CACHE_DIR || CACHE_DIR;
}

export function mediaCacheFilePath(cachePath: string) {
  const fileName = path.basename(cachePath);
  return path.join(mediaCacheDir(), fileName);
}

export function isCacheableRemoteImageUrl(value?: string | null) {
  const text = normalizeText(value);
  if (!/^https?:\/\//i.test(text)) return false;
  try {
    const url = new URL(text);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    return [
      "cdninstagram.com",
      "fbcdn.net",
      "twimg.com",
      "pbs.twimg.com",
      "redd.it",
      "preview.redd.it",
      "redditmedia.com",
      "ytimg.com",
      "i.ytimg.com",
      "licdn.com",
      "media.licdn.com"
    ].some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

export function cachedMediaPathForUrl(url: string, contentType?: string | null) {
  const extension = extensionForContentType(contentType) ?? extensionFromUrl(url) ?? "jpg";
  const key = createHash("sha256").update(url).digest("hex").slice(0, 32);
  return `${CACHE_PATH_PREFIX}${key}.${extension}`;
}

export async function cacheRemoteImage(url?: string | null) {
  const text = normalizeText(url);
  if (!isCacheableRemoteImageUrl(text)) return null;
  const fallbackPath = cachedMediaPathForUrl(text);
  const fallbackFile = mediaCacheFilePath(fallbackPath);
  try {
    await readFile(fallbackFile);
    return fallbackPath;
  } catch {
    // Continue and fetch below.
  }

  const fetched = await fetchImage(text);
  if (!fetched) return null;
  const { bytes, contentType } = fetched;
  if (!bytes.length) return null;

  const cachePath = cachedMediaPathForUrl(text, contentType);
  const filePath = mediaCacheFilePath(cachePath);
  await mkdir(mediaCacheDir(), { recursive: true });
  await writeFile(filePath, bytes);
  return cachePath;
}

async function fetchImage(url: string) {
  const proxyUrl = normalizeText(process.env.INSTAGRAM_PROXY_URL || process.env.HTTPS_PROXY || process.env.HTTP_PROXY);
  if (proxyUrl) return fetchImageViaCurl(url, proxyUrl);

  const response = await fetch(url, {
    headers: imageHeaders()
  });
  if (!response.ok) return null;
  const contentType = response.headers.get("content-type");
  if (!contentType?.toLowerCase().startsWith("image/")) return null;
  return { bytes: Buffer.from(await response.arrayBuffer()), contentType };
}

function fetchImageViaCurl(url: string, proxyUrl: string): Promise<{ bytes: Buffer; contentType: string } | null> {
  return new Promise((resolve, reject) => {
    const args = [
      "-f",
      "-sS",
      "-L",
      "--connect-timeout",
      "5",
      "--max-time",
      "25",
      "-x",
      proxyUrl,
      "-H",
      `accept: ${imageHeaders().accept}`,
      "-H",
      `user-agent: ${imageHeaders()["user-agent"]}`,
      "-w",
      "\n__CONTENT_TYPE__:%{content_type}",
      url
    ];
    const child = spawn("curl", args, { stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.on("error", reject);
    child.on("close", (code) => {
      const output = Buffer.concat(stdout);
      const marker = Buffer.from("\n__CONTENT_TYPE__:");
      const markerIndex = output.lastIndexOf(marker);
      if (code !== 0 || markerIndex < 0) {
        resolve(null);
        return;
      }
      const bytes = output.subarray(0, markerIndex);
      const contentType = output.subarray(markerIndex + marker.length).toString("utf8").trim();
      if (!contentType.toLowerCase().startsWith("image/")) {
        resolve(null);
        return;
      }
      resolve({ bytes, contentType });
    });
  });
}

function imageHeaders() {
  return {
    accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "user-agent": "Mozilla/5.0"
  };
}

function extensionFromUrl(value: string) {
  try {
    const pathname = new URL(value).pathname;
    const match = pathname.match(/\.([a-z0-9]+)$/i);
    return normalizeExtension(match?.[1]);
  } catch {
    return null;
  }
}

function extensionForContentType(value?: string | null) {
  const contentType = normalizeText(value).split(";")[0]?.toLowerCase();
  if (contentType === "image/jpeg" || contentType === "image/jpg") return "jpg";
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/gif") return "gif";
  if (contentType === "image/avif") return "avif";
  return null;
}

function normalizeExtension(value?: string | null) {
  const extension = normalizeText(value).toLowerCase();
  if (extension === "jpeg") return "jpg";
  return ["jpg", "png", "webp", "gif", "avif"].includes(extension) ? extension : null;
}
