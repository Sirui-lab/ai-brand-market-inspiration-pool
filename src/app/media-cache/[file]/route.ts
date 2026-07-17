import { mediaCacheFilePath } from "@/lib/collect/media-cache";
import { readFile } from "node:fs/promises";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  if (!/^[a-f0-9-]+\.(?:jpg|jpeg|png|webp|gif|avif)$/i.test(file)) {
    return new Response("Unsupported media path", { status: 400 });
  }

  try {
    const body = await readFile(mediaCacheFilePath(file));
    return new Response(body, {
      headers: {
        "content-type": contentTypeForPath(file),
        "cache-control": "public, max-age=31536000, immutable"
      }
    });
  } catch {
    return new Response("Media not found", { status: 404 });
  }
}

function contentTypeForPath(value: string) {
  if (value.endsWith(".png")) return "image/png";
  if (value.endsWith(".webp")) return "image/webp";
  if (value.endsWith(".gif")) return "image/gif";
  if (value.endsWith(".avif")) return "image/avif";
  return "image/jpeg";
}
