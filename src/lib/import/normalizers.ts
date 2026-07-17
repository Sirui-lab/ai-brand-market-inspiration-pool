import crypto from "node:crypto";

export function normalizeText(value: unknown): string {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .trim();
}

export function normalizeCaption(value: unknown): string {
  return normalizeText(value).replace(/\s+/g, " ");
}

export function parseLikes(value: unknown): { raw: string | null; count: number | null; warning?: string } {
  const raw = normalizeText(value);
  if (!raw || raw === "/" || raw === "-") return { raw: raw || null, count: null };

  const compact = raw.toLowerCase().replace(/,/g, "").replace(/\+/g, "").trim();
  const match = compact.match(/^(\d+(?:\.\d+)?)(w|万|k)?$/i);
  if (!match) {
    return { raw, count: null, warning: `点赞量无法解析: ${raw}` };
  }

  const numeric = Number(match[1]);
  const unit = match[2];
  const multiplier = unit === "w" || unit === "万" ? 10000 : unit === "k" ? 1000 : 1;
  return { raw, count: Math.round(numeric * multiplier) };
}

export function parsePublishDate(value: unknown): { date: Date | null; warning?: string } {
  const raw = normalizeText(value);
  if (!raw) return { date: null };

  const normalized = raw.replace(/[./]/g, "-");
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return { date: null, warning: `发布时间无法解析: ${raw}` };
  }
  return { date };
}

export function canonicalizeUrl(value: unknown): {
  sourceUrl: string | null;
  canonicalUrl: string | null;
  externalPostId: string | null;
  warning?: string;
} {
  const sourceUrl = normalizeText(value);
  if (!sourceUrl) {
    return { sourceUrl: null, canonicalUrl: null, externalPostId: null };
  }

  try {
    const url = new URL(sourceUrl.startsWith("http") ? sourceUrl : `https://${sourceUrl}`);
    url.search = "";
    url.hash = "";
    const canonicalUrl = url.toString();
    return {
      sourceUrl,
      canonicalUrl,
      externalPostId: extractExternalPostId(canonicalUrl)
    };
  } catch {
    return {
      sourceUrl,
      canonicalUrl: null,
      externalPostId: null,
      warning: `URL 无法解析: ${sourceUrl}`
    };
  }
}

export function extractExternalPostId(url: string): string | null {
  const instagram = url.match(/instagram\.com\/(?:p|reel)\/([^/?#]+)/i);
  if (instagram) return instagram[1];

  const linkedinActivity = url.match(/activity-(\d+)/i);
  if (linkedinActivity) return linkedinActivity[1];

  const xStatus = url.match(/(?:x|twitter)\.com\/[^/]+\/status\/(\d+)/i);
  if (xStatus) return xStatus[1];

  const youtubeShort = url.match(/youtu\.be\/([^/?#]+)/i);
  if (youtubeShort) return youtubeShort[1];

  const youtubeWatch = url.match(/youtube\.com\/watch\/([^/?#]+)/i);
  if (youtubeWatch) return youtubeWatch[1];

  const redditComments = url.match(/reddit\.com\/r\/[^/]+\/comments\/([^/?#]+)/i);
  if (redditComments) return redditComments[1];

  return null;
}

export function makeFingerprint(parts: string[]): string {
  const normalized = parts.map(normalizeCaption).join("|").toLowerCase();
  return crypto.createHash("sha256").update(normalized).digest("hex");
}
