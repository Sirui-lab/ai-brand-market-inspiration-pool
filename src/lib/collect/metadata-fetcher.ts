import { normalizeText } from "@/lib/import/normalizers";

export type FetchedMetadata = {
  status: "fetched" | "failed" | "skipped";
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
  error?: string;
};

const TIMEOUT_MS = 7000;
const MAX_HTML_CHARS = 450_000;

export async function fetchPublicMetadata(url: string): Promise<FetchedMetadata> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; AIBrandMarketInspirationPool/0.1; +internal-url-intake)",
        accept: "text/html,application/xhtml+xml"
      }
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return empty("failed", `HTTP ${response.status}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      return empty("skipped", "不是 HTML 页面");
    }

    const html = (await response.text()).slice(0, MAX_HTML_CHARS);
    return {
      status: "fetched",
      title: pickMeta(html, ["og:title", "twitter:title"]) ?? pickTitle(html),
      description:
        pickMeta(html, ["og:description", "twitter:description", "description"]) ?? null,
      imageUrl: pickMeta(html, ["og:image", "twitter:image"]) ?? null,
      siteName: pickMeta(html, ["og:site_name"]) ?? null
    };
  } catch (error) {
    return empty("failed", error instanceof Error ? error.message : "抓取失败");
  }
}

export function metadataToCaption(metadata: FetchedMetadata, fallbackUrl: string) {
  const parts = [metadata.title, metadata.description].map((item) => normalizeText(item));
  const text = parts.filter(Boolean).join("\n\n");
  return text || `待补全原帖内容：${fallbackUrl}`;
}

function empty(status: FetchedMetadata["status"], error: string): FetchedMetadata {
  return {
    status,
    title: null,
    description: null,
    imageUrl: null,
    siteName: null,
    error
  };
}

function pickTitle(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeHtml(match[1]) : null;
}

function pickMeta(html: string, names: string[]) {
  for (const name of names) {
    const escaped = escapeRegExp(name);
    const propertyFirst = new RegExp(
      `<meta\\s+[^>]*(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']*)["'][^>]*>`,
      "i"
    );
    const contentFirst = new RegExp(
      `<meta\\s+[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${escaped}["'][^>]*>`,
      "i"
    );
    const match = html.match(propertyFirst) ?? html.match(contentFirst);
    if (match?.[1]) return decodeHtml(match[1]);
  }
  return null;
}

function decodeHtml(value: string) {
  return normalizeText(value)
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, " ");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
