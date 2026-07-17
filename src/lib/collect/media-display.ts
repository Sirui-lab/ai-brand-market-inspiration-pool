import { isCacheableRemoteImageUrl } from "@/lib/collect/media-cache";
import { normalizeText } from "@/lib/import/normalizers";

export function mediaDisplayUrl(value?: string | null) {
  const url = normalizeText(value);
  if (!url) return null;
  if (url.startsWith("/media-cache/")) return url;
  if (isCacheableRemoteImageUrl(url)) return `/api/media/proxy?url=${encodeURIComponent(url)}`;
  return url;
}
