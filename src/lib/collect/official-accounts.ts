export type OfficialAccount = {
  brandSlug: string;
  brandLabel: string;
  platformSlug: string;
  platformLabel: string;
  sourceId: string;
  sourceIds?: string[];
  label: string;
  accountType?: "official" | "community" | "user";
  note?: string;
  aliases: string[];
};

export const OFFICIAL_ACCOUNTS: OfficialAccount[] = [
  {
    brandSlug: "chatgpt",
    brandLabel: "ChatGPT",
    platformSlug: "instagram",
    platformLabel: "Instagram",
    sourceId: "openai",
    label: "ChatGPT / OpenAI Instagram",
    accountType: "official",
    aliases: ["openai", "chatgpt"]
  },
  {
    brandSlug: "chatgpt",
    brandLabel: "ChatGPT",
    platformSlug: "x",
    platformLabel: "X",
    sourceId: "ChatGPTapp",
    label: "ChatGPT X",
    accountType: "official",
    aliases: ["openai", "chatgpt", "chatgptapp"]
  },
  {
    brandSlug: "chatgpt",
    brandLabel: "ChatGPT",
    platformSlug: "linkedin",
    platformLabel: "LinkedIn",
    sourceId: "company/openai",
    label: "OpenAI LinkedIn",
    accountType: "official",
    aliases: ["openai", "chatgpt"]
  },
  {
    brandSlug: "chatgpt",
    brandLabel: "ChatGPT",
    platformSlug: "youtube",
    platformLabel: "YouTube",
    sourceId: "UCXZCJLdBC09xxGZ6gcdrc6A",
    label: "OpenAI YouTube",
    accountType: "official",
    aliases: ["openai", "chatgpt", "@openai"]
  },
  {
    brandSlug: "chatgpt",
    brandLabel: "ChatGPT",
    platformSlug: "reddit",
    platformLabel: "Reddit",
    sourceId: "u/OpenAI",
    label: "OpenAI Reddit 用户 u/OpenAI",
    accountType: "user",
    note: "u/ 是用户发布页，适合看账号自己发过什么。",
    aliases: ["openai", "chatgpt", "u/openai"]
  },
  {
    brandSlug: "chatgpt",
    brandLabel: "ChatGPT",
    platformSlug: "reddit",
    platformLabel: "Reddit",
    sourceId: "r/OpenAI",
    label: "OpenAI Reddit 社区 r/OpenAI",
    accountType: "community",
    note: "r/ 是社区讨论区，不一定是官方发布，但适合观察用户讨论和热点。",
    aliases: ["openai", "chatgpt", "r/openai"]
  },
  {
    brandSlug: "claude",
    brandLabel: "Claude",
    platformSlug: "instagram",
    platformLabel: "Instagram",
    sourceId: "claudeai",
    label: "Claude Instagram",
    accountType: "official",
    aliases: ["anthropic", "claude", "claudeai"]
  },
  {
    brandSlug: "claude",
    brandLabel: "Claude",
    platformSlug: "x",
    platformLabel: "X",
    sourceId: "AnthropicAI",
    label: "Anthropic X",
    accountType: "official",
    aliases: ["anthropic", "claude", "anthropicai"]
  },
  {
    brandSlug: "claude",
    brandLabel: "Claude",
    platformSlug: "linkedin",
    platformLabel: "LinkedIn",
    sourceId: "company/anthropicresearch",
    label: "Anthropic LinkedIn",
    accountType: "official",
    aliases: ["anthropic", "claude", "anthropicresearch"]
  },
  {
    brandSlug: "claude",
    brandLabel: "Claude",
    platformSlug: "youtube",
    platformLabel: "YouTube",
    sourceId: "@Anthropic",
    sourceIds: ["@Anthropic", "@AnthropicAI", "https://www.youtube.com/@AnthropicAI"],
    label: "Anthropic YouTube",
    accountType: "official",
    aliases: ["anthropic", "claude", "anthropicai", "@anthropicai"]
  },
  {
    brandSlug: "claude",
    brandLabel: "Claude",
    platformSlug: "reddit",
    platformLabel: "Reddit",
    sourceId: "u/AnthropicAI",
    label: "Anthropic Reddit 用户 u/AnthropicAI",
    accountType: "user",
    note: "u/ 是用户发布页，适合看账号自己发过什么。",
    aliases: ["anthropic", "claude", "anthropicai", "u/anthropicai"]
  },
  {
    brandSlug: "claude",
    brandLabel: "Claude",
    platformSlug: "reddit",
    platformLabel: "Reddit",
    sourceId: "r/ClaudeAI",
    label: "Claude Reddit 社区 r/ClaudeAI",
    accountType: "community",
    note: "r/ 是社区讨论区，不一定是官方发布，但适合观察用户讨论和热点。",
    aliases: ["anthropic", "claude", "claudeai", "r/claudeai", "r/claude"]
  },
  {
    brandSlug: "notion",
    brandLabel: "Notion",
    platformSlug: "instagram",
    platformLabel: "Instagram",
    sourceId: "notionhq",
    label: "Notion Instagram",
    accountType: "official",
    aliases: ["notion", "notionhq"]
  },
  {
    brandSlug: "notion",
    brandLabel: "Notion",
    platformSlug: "x",
    platformLabel: "X",
    sourceId: "NotionHQ",
    label: "Notion X",
    accountType: "official",
    aliases: ["notion", "notionhq"]
  },
  {
    brandSlug: "notion",
    brandLabel: "Notion",
    platformSlug: "linkedin",
    platformLabel: "LinkedIn",
    sourceId: "company/notionhq",
    label: "Notion LinkedIn",
    accountType: "official",
    aliases: ["notion", "notionhq"]
  },
  {
    brandSlug: "notion",
    brandLabel: "Notion",
    platformSlug: "youtube",
    platformLabel: "YouTube",
    sourceId: "@Notion",
    label: "Notion YouTube",
    accountType: "official",
    aliases: ["notion", "notionhq", "@notion"]
  },
  {
    brandSlug: "notion",
    brandLabel: "Notion",
    platformSlug: "reddit",
    platformLabel: "Reddit",
    sourceId: "u/NotionHQ",
    label: "Notion Reddit 用户 u/NotionHQ",
    accountType: "user",
    note: "u/ 是用户发布页，适合看账号自己发过什么。",
    aliases: ["notion", "notionhq", "u/notionhq"]
  },
  {
    brandSlug: "notion",
    brandLabel: "Notion",
    platformSlug: "reddit",
    platformLabel: "Reddit",
    sourceId: "r/Notion",
    label: "Notion Reddit 社区 r/Notion",
    accountType: "community",
    note: "r/ 是社区讨论区，不一定是官方发布，但适合观察用户讨论和热点。",
    aliases: ["notion", "notionhq", "r/notion"]
  },
  {
    brandSlug: "perplexity",
    brandLabel: "Perplexity",
    platformSlug: "instagram",
    platformLabel: "Instagram",
    sourceId: "perplexity_ai",
    label: "Perplexity Instagram",
    accountType: "official",
    aliases: ["perplexity", "perplexity_ai", "perplexity ai"]
  },
  {
    brandSlug: "perplexity",
    brandLabel: "Perplexity",
    platformSlug: "x",
    platformLabel: "X",
    sourceId: "perplexity_ai",
    label: "Perplexity X",
    accountType: "official",
    aliases: ["perplexity", "perplexity_ai", "perplexity ai"]
  },
  {
    brandSlug: "perplexity",
    brandLabel: "Perplexity",
    platformSlug: "linkedin",
    platformLabel: "LinkedIn",
    sourceId: "company/perplexity-ai",
    label: "Perplexity LinkedIn",
    accountType: "official",
    aliases: ["perplexity", "perplexity-ai", "perplexity ai"]
  },
  {
    brandSlug: "perplexity",
    brandLabel: "Perplexity",
    platformSlug: "youtube",
    platformLabel: "YouTube",
    sourceId: "@perplexity_ai",
    label: "Perplexity YouTube",
    accountType: "official",
    aliases: ["perplexity", "perplexity_ai", "perplexity ai", "@perplexity_ai"]
  },
  {
    brandSlug: "perplexity",
    brandLabel: "Perplexity",
    platformSlug: "reddit",
    platformLabel: "Reddit",
    sourceId: "u/perplexity_ai",
    label: "Perplexity Reddit 用户 u/perplexity_ai",
    accountType: "user",
    note: "u/ 是用户发布页，适合看账号自己发过什么。",
    aliases: ["perplexity", "perplexity_ai", "perplexity ai", "u/perplexity_ai"]
  },
  {
    brandSlug: "perplexity",
    brandLabel: "Perplexity",
    platformSlug: "reddit",
    platformLabel: "Reddit",
    sourceId: "r/perplexity_ai",
    label: "Perplexity Reddit 社区 r/perplexity_ai",
    accountType: "community",
    note: "r/ 是社区讨论区，不一定是官方发布，但适合观察用户讨论和热点。",
    aliases: ["perplexity", "perplexity_ai", "perplexity ai", "r/perplexity_ai"]
  },
  {
    brandSlug: "cursor",
    brandLabel: "Cursor",
    platformSlug: "instagram",
    platformLabel: "Instagram",
    sourceId: "cursor_ai",
    label: "Cursor Instagram",
    accountType: "official",
    aliases: ["cursor", "cursorai", "cursor_ai", "trycursor"]
  },
  {
    brandSlug: "cursor",
    brandLabel: "Cursor",
    platformSlug: "x",
    platformLabel: "X",
    sourceId: "cursor_ai",
    label: "Cursor X",
    accountType: "official",
    aliases: ["cursor", "cursorai", "cursor_ai", "trycursor"]
  },
  {
    brandSlug: "cursor",
    brandLabel: "Cursor",
    platformSlug: "linkedin",
    platformLabel: "LinkedIn",
    sourceId: "company/anysphere",
    label: "Cursor / Anysphere LinkedIn",
    accountType: "official",
    aliases: ["cursor", "anysphere", "trycursor"]
  },
  {
    brandSlug: "cursor",
    brandLabel: "Cursor",
    platformSlug: "youtube",
    platformLabel: "YouTube",
    sourceId: "@cursor_ai",
    label: "Cursor YouTube",
    accountType: "official",
    aliases: ["cursor", "cursorai", "cursor_ai", "trycursor", "@cursor_ai"]
  },
  {
    brandSlug: "cursor",
    brandLabel: "Cursor",
    platformSlug: "reddit",
    platformLabel: "Reddit",
    sourceId: "u/cursor_ai",
    label: "Cursor Reddit 用户 u/cursor_ai",
    accountType: "user",
    note: "u/ 是用户发布页，适合看账号自己发过什么。",
    aliases: ["cursor", "cursorai", "cursor_ai", "trycursor", "u/cursor_ai"]
  },
  {
    brandSlug: "cursor",
    brandLabel: "Cursor",
    platformSlug: "reddit",
    platformLabel: "Reddit",
    sourceId: "r/cursor",
    label: "Cursor Reddit 社区 r/cursor",
    accountType: "community",
    note: "r/ 是社区讨论区，不一定是官方发布，但适合观察用户讨论和热点。",
    aliases: ["cursor", "cursorai", "cursor_ai", "trycursor", "r/cursor"]
  }
];

export function resolveOfficialAccount(platformSlug: string, value: string) {
  const platform = normalizeAccountAlias(platformSlug);
  const normalized = normalizeAccountAlias(value);
  if (!platform || !normalized) return null;

  return (
    OFFICIAL_ACCOUNTS.find(
      (account) =>
        account.platformSlug === platform &&
        [account.brandSlug, account.brandLabel, account.sourceId, account.label, ...account.aliases]
          .map(normalizeAccountAlias)
          .includes(normalized)
    ) ?? null
  );
}

function normalizeAccountAlias(value: string) {
  return value.trim().replace(/^@/, "").toLowerCase().replace(/\s+/g, " ");
}
