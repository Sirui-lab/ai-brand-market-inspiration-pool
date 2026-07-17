export type DisplayBrand = {
  slug: string;
  displayName: string;
  aliases: string[];
};

export const DISPLAY_BRANDS: DisplayBrand[] = [
  {
    slug: "chatgpt",
    displayName: "ChatGPT",
    aliases: ["openai", "chatgpt", "openai "]
  },
  {
    slug: "claude",
    displayName: "Claude",
    aliases: ["anthropic", "claude", "claudeai"]
  },
  {
    slug: "notion",
    displayName: "Notion",
    aliases: ["notion", "notionhq", "notion "]
  },
  {
    slug: "perplexity",
    displayName: "Perplexity",
    aliases: ["perplexity", "perplexity_ai", "perplexity ai"]
  },
  {
    slug: "cursor",
    displayName: "Cursor",
    aliases: ["cursor", "trycursor", "cursor_ai", "cursor "]
  }
];

export function normalizeAlias(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function resolveBrandSlug(value: string): string | null {
  const normalized = normalizeAlias(value);
  for (const brand of DISPLAY_BRANDS) {
    if (brand.aliases.map(normalizeAlias).includes(normalized)) {
      return brand.slug;
    }
  }
  return null;
}
