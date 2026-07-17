import { resolveBrandSlug } from "@/lib/brand-config";
import { canonicalizeUrl, makeFingerprint } from "@/lib/import/normalizers";

export type UrlIntakeResult = {
  sourceUrl: string | null;
  canonicalUrl: string | null;
  externalPostId: string | null;
  platformSlug: string | null;
  brandSlug: string | null;
  handle: string | null;
  warning?: string;
};

const HANDLE_BRAND_ALIASES: Record<string, string> = {
  openai: "chatgpt",
  chatgpt: "chatgpt",
  anthropic: "claude",
  anthropicresearch: "claude",
  claude: "claude",
  claudeai: "claude",
  notion: "notion",
  notionhq: "notion",
  perplexity: "perplexity",
  perplexity_ai: "perplexity",
  "perplexity-ai": "perplexity",
  cursor: "cursor",
  cursorai: "cursor",
  trycursor: "cursor"
};

export function analyzeCollectUrl(value: string): UrlIntakeResult {
  const url = canonicalizeUrl(value);
  if (!url.canonicalUrl) {
    return {
      ...url,
      platformSlug: null,
      brandSlug: null,
      handle: null,
      warning: url.warning ?? "URL 无法识别"
    };
  }

  const parsed = new URL(url.canonicalUrl);
  const platformSlug = inferPlatformSlug(parsed);
  const handle = inferHandle(parsed, platformSlug);
  const brandSlug = inferBrandSlug(handle);

  return {
    ...url,
    platformSlug,
    brandSlug,
    handle,
    warning: platformSlug ? undefined : "暂不支持该平台 URL"
  };
}

export function makeCollectFingerprint(canonicalUrl: string, fallbackText: string) {
  return makeFingerprint([canonicalUrl || fallbackText]);
}

function inferPlatformSlug(url: URL): string | null {
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  if (host.includes("instagram.com")) return "instagram";
  if (host === "x.com" || host === "twitter.com") return "x";
  if (host.includes("linkedin.com")) return "linkedin";
  if (host.includes("youtube.com") || host === "youtu.be") return "youtube";
  if (host.includes("reddit.com")) return "reddit";
  return null;
}

function inferHandle(url: URL, platformSlug: string | null): string | null {
  const parts = url.pathname.split("/").filter(Boolean);
  if (!parts.length) return null;

  if (platformSlug === "linkedin") {
    const postsIndex = parts.indexOf("posts");
    if (postsIndex >= 0 && parts[postsIndex + 1]) return cleanHandle(parts[postsIndex + 1]);
    if (parts[0] === "company" && parts[1]) return cleanHandle(parts[1]);
    if (parts[0] === "in" && parts[1]) return cleanHandle(parts[1]);
  }

  if (platformSlug === "instagram" || platformSlug === "x") {
    return cleanHandle(parts[0]);
  }

  if (platformSlug === "youtube") {
    if (parts[0]?.startsWith("@")) return cleanHandle(parts[0].slice(1));
    if ((parts[0] === "c" || parts[0] === "channel" || parts[0] === "user") && parts[1]) {
      return cleanHandle(parts[1]);
    }
  }

  if (platformSlug === "reddit") {
    if (parts[0]?.toLowerCase() === "r" && parts[1]) return cleanHandle(parts[1]);
    if (parts[0]?.toLowerCase() === "user" && parts[1]) return cleanHandle(parts[1]);
  }

  return null;
}

function inferBrandSlug(handle: string | null): string | null {
  if (!handle) return null;
  return HANDLE_BRAND_ALIASES[handle] ?? resolveBrandSlug(handle);
}

function cleanHandle(value?: string): string | null {
  const cleaned = String(value ?? "")
    .trim()
    .replace(/^@/, "")
    .toLowerCase();
  return cleaned || null;
}
