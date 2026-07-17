import { normalizeText } from "@/lib/import/normalizers";

export function getVisualAssetUrl(value?: string | null) {
  const text = normalizeText(value);
  if (!text) return null;
  if (/^\/media-cache\//i.test(text)) return text;
  if (!/^https?:\/\//i.test(text)) return null;
  if (/\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(text)) return text;
  try {
    const url = new URL(text);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    const format = url.searchParams.get("format")?.toLowerCase();
    if (format && ["jpg", "jpeg", "png", "webp", "gif"].includes(format)) return text;
    if (
      [
        "ytimg.com",
        "i.ytimg.com",
        "redd.it",
        "preview.redd.it",
        "redditmedia.com",
        "twimg.com",
        "pbs.twimg.com",
        "licdn.com",
        "media.licdn.com",
        "fbcdn.net",
        "cdninstagram.com"
      ].some((domain) => host === domain || host.endsWith(`.${domain}`))
    ) {
      return text;
    }
  } catch {
    return null;
  }
  return null;
}

export function getYouTubeVideoId(value?: string | null) {
  const text = normalizeText(value);
  if (!text) return null;
  const match =
    text.match(/[?&]v=([^&]+)/) ??
    text.match(/youtu\.be\/([^?&/]+)/) ??
    text.match(/youtube\.com\/shorts\/([^?&/]+)/) ??
    text.match(/youtube\.com\/embed\/([^?&/]+)/);
  return match?.[1] ?? null;
}

export function getYouTubeThumbnailUrl(value?: string | null) {
  const videoId = getYouTubeVideoId(value);
  return videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null;
}

export function resolvePostCoverUrl({
  coverImageUrl,
  visualReferenceNote,
  sourceUrl,
  canonicalUrl
}: {
  coverImageUrl?: string | null;
  visualReferenceNote?: string | null;
  sourceUrl?: string | null;
  canonicalUrl?: string | null;
}) {
  return (
    getVisualAssetUrl(coverImageUrl) ??
    getVisualAssetUrl(visualReferenceNote) ??
    getYouTubeThumbnailUrl(sourceUrl) ??
    getYouTubeThumbnailUrl(canonicalUrl)
  );
}
