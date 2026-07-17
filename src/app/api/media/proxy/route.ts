import { cacheRemoteImage, isCacheableRemoteImageUrl, mediaCacheFilePath } from "@/lib/collect/media-cache";
import { readFile } from "node:fs/promises";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get("url");
  if (!url || !isCacheableRemoteImageUrl(url)) {
    return new Response("Unsupported media URL", { status: 400 });
  }

  const cachedPath = await cacheRemoteImage(url);
  if (!cachedPath) {
    return new Response("Media unavailable", { status: 502 });
  }

  const filePath = mediaCacheFilePath(cachedPath);
  const body = await readFile(filePath);
  return new Response(body, {
    headers: {
      "content-type": contentTypeForPath(cachedPath),
      "cache-control": "public, max-age=31536000, immutable"
    }
  });
}

function contentTypeForPath(value: string) {
  if (value.endsWith(".png")) return "image/png";
  if (value.endsWith(".webp")) return "image/webp";
  if (value.endsWith(".gif")) return "image/gif";
  if (value.endsWith(".avif")) return "image/avif";
  return "image/jpeg";
}
