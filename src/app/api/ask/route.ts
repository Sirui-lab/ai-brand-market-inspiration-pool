import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ensureBaselineData } from "@/lib/seed";
import { DISPLAY_BRANDS } from "@/lib/brand-config";
import { PLATFORMS } from "@/lib/platform-config";

export const runtime = "nodejs";

type AskRequest = {
  question?: string;
};

type Citation = {
  id: string;
  title: string;
  platform: string;
  brand: string;
  url: string | null;
  likes: number | null;
  publishDate: string | null;
  matchedFields: string[];
  excerpt: string;
};

type AskIntent = ReturnType<typeof parseQuestion>;

const THEME_KEYWORDS = [
  "launch",
  "release",
  "announcement",
  "feature",
  "product",
  "meme",
  "community",
  "education",
  "tutorial",
  "comparison",
  "benchmark",
  "trend",
  "event",
  "campaign",
  "视觉",
  "结构",
  "发布",
  "功能",
  "教程",
  "社区",
  "热点",
  "对比",
  "产品",
  "品牌",
  "转化",
  "互动",
  "高赞"
];

export async function POST(request: Request) {
  try {
    await ensureBaselineData();
    const body = (await request.json()) as AskRequest;
    const question = String(body.question ?? "").trim();

    if (question.length < 3) {
      return NextResponse.json({ error: "请输入一个更具体的问题。" }, { status: 400 });
    }

    const intent = parseQuestion(question);
    const candidates = await retrieveCandidates(intent);
    const citations = diversifyCitations(rankCandidates(question, intent, candidates), intent);
    const answer = await answerQuestion(question, intent, citations);

    return NextResponse.json({
      answer,
      citations,
      diagnostics: {
        mode: "local_fallback",
        totalCandidates: candidates.length,
        filters: {
          platforms: intent.platforms,
          brands: intent.brands,
          keywords: intent.keywords
        }
      }
    });
  } catch (error) {
    console.error("Ask API failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ask 请求失败" },
      { status: 500 }
    );
  }
}

function parseQuestion(question: string) {
  const normalized = question.toLowerCase();
  const platforms = PLATFORMS.filter((platform) =>
    normalized.includes(platform.slug.toLowerCase()) ||
    normalized.includes(platform.displayName.toLowerCase())
  ).map((platform) => platform.slug);

  const brands = DISPLAY_BRANDS.filter((brand) => {
    const names = [brand.slug, brand.displayName, ...brand.aliases].map((item) => item.toLowerCase());
    return names.some((name) => normalized.includes(name.trim()));
  }).map((brand) => brand.slug);

  const keywords = Array.from(
    new Set(
      [
        ...THEME_KEYWORDS.filter((keyword) => normalized.includes(keyword.toLowerCase())),
        ...question
          .split(/[\s,，。！？?;；:：()[\]{}"'“”‘’]+/)
          .map((token) => token.trim())
          .filter((token) => token.length >= 3)
          .filter((token) => !["what", "which", "how", "about", "generate", "based", "recent"].includes(token.toLowerCase()))
      ].slice(0, 10)
    )
  );

  const questionType = inferQuestionType(normalized, platforms, brands);

  return { platforms, brands, keywords, questionType };
}

async function retrieveCandidates(intent: AskIntent) {
  const shouldPrioritizeCoverage = intent.brands.length > 0 || intent.platforms.length > 0;
  const keywordFilters = intent.keywords.flatMap((keyword) => [
    { captionNormalized: { contains: keyword } },
    {
      case: {
        analyses: {
          some: {
            OR: [
              { postStructureAnalysis: { contains: keyword } },
              { postContentAnalysis: { contains: keyword } },
              { visualDesignAnalysis: { contains: keyword } },
              { importedExtraAnalysis: { contains: keyword } },
              { visualReferenceNote: { contains: keyword } }
            ]
          }
        }
      }
    }
  ]);

  return prisma.post.findMany({
    where: {
      platform: intent.platforms.length ? { slug: { in: intent.platforms } } : undefined,
      brand: intent.brands.length ? { slug: { in: intent.brands } } : undefined,
      OR: !shouldPrioritizeCoverage && keywordFilters.length ? keywordFilters : undefined
    },
    include: {
      platform: true,
      brand: true,
      case: {
        include: {
          analyses: {
            orderBy: [{ source: "asc" }, { version: "desc" }],
            take: 2
          }
        }
      }
    },
    orderBy: [{ likesCount: "desc" }, { publishDate: "desc" }, { createdAt: "desc" }],
    take: 120
  });
}

function diversifyCitations(citations: Citation[], intent: AskIntent) {
  if (intent.platforms.length || intent.brands.length === 0) return citations;

  const platformBuckets = new Map<string, Citation[]>();
  for (const citation of citations) {
    const bucket = platformBuckets.get(citation.platform) ?? [];
    bucket.push(citation);
    platformBuckets.set(citation.platform, bucket);
  }

  if (platformBuckets.size <= 1) return citations;

  const diversified: Citation[] = [];
  const seen = new Set<string>();
  const buckets = Array.from(platformBuckets.values()).sort((a, b) => b.length - a.length);
  const maxBucketSize = Math.max(...buckets.map((bucket) => bucket.length));

  for (let index = 0; index < maxBucketSize; index += 1) {
    for (const bucket of buckets) {
      const citation = bucket[index];
      if (citation && !seen.has(citation.id)) {
        diversified.push(citation);
        seen.add(citation.id);
      }
    }
  }

  for (const citation of citations) {
    if (!seen.has(citation.id)) diversified.push(citation);
  }

  return diversified;
}

function rankCandidates(
  question: string,
  intent: AskIntent,
  candidates: Awaited<ReturnType<typeof retrieveCandidates>>
): Citation[] {
  const tokens = new Set([...intent.keywords, ...question.toLowerCase().split(/\W+/)].filter((token) => token.length >= 3));

  return candidates
    .map((post) => {
      const analysis = post.case?.analyses[0];
      const fields = {
        caption: post.captionNormalized,
        structure: analysis?.postStructureAnalysis ?? "",
        content: analysis?.postContentAnalysis ?? "",
        visual: analysis?.visualDesignAnalysis ?? "",
        extra: analysis?.importedExtraAnalysis ?? ""
      };
      const haystack = Object.values(fields).join("\n").toLowerCase();
      const matchedFields = Object.entries(fields)
        .filter(([, value]) => value && [...tokens].some((token) => value.toLowerCase().includes(token.toLowerCase())))
        .map(([key]) => key);
      const tokenScore = [...tokens].reduce((score, token) => score + (haystack.includes(token.toLowerCase()) ? 2 : 0), 0);
      const filterScore =
        (intent.platforms.includes(post.platform.slug) ? 3 : 0) +
        (intent.brands.includes(post.brand.slug) ? 3 : 0);
      const likesScore = Math.min(Math.log10((post.likesCount ?? 0) + 1), 6);
      const completenessScore = analysis?.status === "completed" ? 2 : analysis ? 1 : 0;

      return {
        id: post.case?.id ?? post.id,
        title: makeTitle(post.captionNormalized),
        platform: post.platform.displayName,
        brand: post.brand.displayName,
        url: post.sourceUrl ?? post.canonicalUrl,
        likes: post.likesCount,
        publishDate: post.publishDate?.toISOString() ?? null,
        matchedFields: matchedFields.length ? matchedFields : ["metadata"],
        excerpt: makeExcerpt(fields),
        score: tokenScore + filterScore + likesScore + completenessScore
      };
    })
    .sort((a, b) => b.score - a.score)
    .map(({ score: _score, ...citation }) => citation);
}

async function answerQuestion(question: string, intent: AskIntent, citations: Citation[]) {
  if (!citations.length) {
    return [
      "## 简短回答",
      "当前 Local Inspiration Library 里没有找到足够匹配的问题素材，不能负责任地做策略判断。",
      "",
      "## 数据缺口",
      `已尝试按${formatFilters(intent)}检索 posts / cases / analyses，但没有命中可引用案例。`
    ].join("\n");
  }

  return buildLocalAnswer(question, citations, intent);
}

function buildLocalAnswer(question: string, citations: Citation[], intent: AskIntent) {
  const representative = citations.slice(0, 12);
  const references = citations.slice(0, 8);
  const byPlatform = countBy(citations, "platform");
  const byBrand = countBy(citations, "brand");
  const patternParagraph = synthesizePatternParagraph(question, representative, byBrand, byPlatform, intent);

  return [
    "## 回答",
    buildOpeningSentence(question, citations.length, intent),
    patternParagraph,
    "",
    "## 代表性案例",
    ...references.map((item, index) => `- [${index + 1}] ${item.title}｜${item.platform}｜${item.brand}${item.url ? `｜${item.url}` : ""}`)
  ].join("\n");
}

function synthesizePatternParagraph(
  question: string,
  citations: Citation[],
  byBrand: Record<string, number>,
  byPlatform: Record<string, number>,
  intent: AskIntent
) {
  const text = citations.map((item) => `${item.title} ${item.excerpt}`).join(" ").toLowerCase();
  const brands = Object.keys(byBrand).slice(0, 3).join(" / ") || "这些品牌";
  const platforms = Object.keys(byPlatform).slice(0, 3).join(" / ") || "这些平台";
  const signals = [
    hasAny(text, ["prompt", "复制", "copy"]) ? "把用户行动设计得很轻，最好能直接复制 prompt、套用模板或马上试一次" : null,
    hasAny(text, ["what do you think", "评论", "think", "讨论"]) ? "用提问或开放式判断题制造评论入口，让内容不只是展示结果，而是邀请用户参与判断" : null,
    hasAny(text, ["photo", "image", "图片", "照片", "生成", "视觉"]) ? "优先展示一个一眼可懂的结果图或变化结果，让用户先被效果吸引，再理解产品能力" : null,
    hasAny(text, ["童年", "baby", "family", "父母", "怀旧", "情绪"]) ? "把 AI 能力包装进情绪或生活场景里，降低技术感，提升共鸣和转发欲" : null,
    hasAny(text, ["launch", "发布", "new", "功能", "product"]) ? "发布类内容更适合把新能力翻译成具体使用场景，而不是只罗列功能名称" : null,
    hasAny(text, ["教程", "how to", "tutorial"]) ? "教程型内容的价值在于降低操作门槛，让用户觉得自己也能复现同样效果" : null
  ].filter((item): item is string => Boolean(item));

  const selected = signals.length
    ? signals.slice(0, 3)
    : ["共同点是场景足够具体、理解成本低，并且能让用户快速判断这条内容和自己是否有关"];

  if (intent.questionType === "brand_compare") {
    const brandNames = Object.keys(byBrand);
    return [
      `从命中样本看，${brands} 的差异更像是“内容重心”的差异，而不是单纯格式差异。`,
      `${brandNames[0] ?? "一类品牌"}相关案例更适合观察它如何把产品能力转译成用户场景；${brandNames[1] ? `${brandNames[1]}相关案例则可以看它如何用主题、语气或案例选择建立品牌感。` : "另一组案例则可以继续补充后再做更稳的对照。"}`,
      `这批样本共同指向的判断是：${joinChineseList(selected)}。`
    ].join("");
  }

  if (intent.questionType === "platform_compare") {
    return [
      `${platforms} 的平台差异主要体现在信息密度和互动方式上。`,
      `命中案例显示，可迁移的不是单条文案，而是内容机制：${joinChineseList(selected)}。`,
      `做跨平台复用时，建议保留核心场景和结果展示，但按平台重新调整开头节奏、视觉承载和互动入口。`
    ].join("");
  }

  if (intent.questionType === "idea_generation") {
    return [
      `如果把这些案例转成可执行灵感，方向可以从“用户马上能试”“结果一眼可见”“评论区有话可说”三类切入。`,
      `当前样本里最值得借用的是：${joinChineseList(selected)}。`,
      `因此生成新选题时，可以先定一个具体用户场景，再设计一个可复制动作，最后用对比图、提问或模板降低参与门槛。`
    ].join("");
  }

  if (intent.questionType === "case_search") {
    return [
      `这次检索更像是在找可复用案例池。命中的 ${brands} / ${platforms} 案例里，优先级较高的是那些能清楚说明“用户为什么会停下来”的内容。`,
      `筛选时可以重点看三类信号：${joinChineseList(selected)}。`,
      `右侧引用里的案例可作为素材入口，再进入 Local Inspiration Library 看完整结构、内容和视觉分析。`
    ].join("");
  }

  return [
    `${brands} 在 ${platforms} 的命中案例里，表现更好的内容并不只是介绍 AI 功能，而是把能力放进一个容易代入的使用场景。`,
    `从这些案例看，关键做法是：${joinChineseList(selected)}。`,
    `所以复用时重点不是模仿某一条文案，而是保留背后的结构：强场景或强结果开头，接一个低门槛参与方式，再用评论、转发或可复制动作承接兴趣。`
  ].join("");
}

function inferQuestionType(normalized: string, platforms: string[], brands: string[]) {
  if (hasAny(normalized, ["比较", "对比", "compare", "difference", "不同"]) && brands.length >= 2) return "brand_compare" as const;
  if (hasAny(normalized, ["比较", "对比", "compare", "difference", "不同"]) && platforms.length >= 2) return "platform_compare" as const;
  if (hasAny(normalized, ["生成", "想法", "灵感", "方向", "idea", "brief", "选题"])) return "idea_generation" as const;
  if (hasAny(normalized, ["找", "有哪些", "案例", "搜索", "find", "show me"])) return "case_search" as const;
  return "summary" as const;
}

function buildOpeningSentence(question: string, citationCount: number, intent: AskIntent) {
  const openings: Record<AskIntent["questionType"], string[]> = {
    brand_compare: [
      `我先按品牌对照来读这 ${citationCount} 条命中案例，而不是把它当成普通关键词搜索。`,
      `这个问题适合看品牌之间的内容取向差异；当前库里有 ${citationCount} 条相关样本可参考。`
    ],
    platform_compare: [
      `我会先把这 ${citationCount} 条样本按平台语境拆开看：同一个主题在不同平台上，表达方式通常会变。`,
      `这不是单纯找高赞帖，而是看平台机制如何影响内容呈现；当前命中了 ${citationCount} 条案例。`
    ],
    idea_generation: [
      `我把这个问题当成选题发散来处理：先从 ${citationCount} 条案例里抽可复用机制，再转成内容方向。`,
      `下面不是直接复刻案例，而是把 ${citationCount} 条命中内容里的可迁移做法拆出来。`
    ],
    case_search: [
      `我先帮你把相关素材筛出来，再给一个阅读这些案例的角度；当前命中 ${citationCount} 条。`,
      `这个问题更像案例检索，重点是找到值得复盘的样本，而不是马上下最终结论。`
    ],
    summary: [
      `从当前 Local Inspiration Library 命中的 ${citationCount} 条案例看，「${question}」可以先作为内容模式问题来判断。`,
      `我先基于这 ${citationCount} 条命中案例做一个归纳，结论会偏向内容策略而不是单条复述。`
    ]
  };
  const options = openings[intent.questionType];
  return options[pickVariant(question, options.length)];
}

function pickVariant(seed: string, count: number) {
  const total = seed.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return total % count;
}

function hasAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
}

function joinChineseList(items: string[]) {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]}；同时${items[1]}`;
  return `${items.slice(0, -1).join("；")}；同时${items[items.length - 1]}`;
}

function makeTitle(caption: string) {
  const compact = caption.replace(/\s+/g, " ").trim();
  if (!compact) return "Untitled case";
  return compact.length > 90 ? `${compact.slice(0, 87)}...` : compact;
}

function makeExcerpt(fields: Record<string, string>) {
  const text = fields.content || fields.structure || fields.visual || fields.caption || fields.extra || "";
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > 220 ? `${compact.slice(0, 217)}...` : compact || "暂无分析摘要。";
}

function countBy(items: Citation[], key: "platform" | "brand") {
  return items.reduce<Record<string, number>>((acc, item) => {
    acc[item[key]] = (acc[item[key]] ?? 0) + 1;
    return acc;
  }, {});
}

function formatFilters(intent: AskIntent) {
  const parts = [
    intent.platforms.length ? `平台 ${intent.platforms.join(", ")}` : "全部平台",
    intent.brands.length ? `品牌 ${intent.brands.join(", ")}` : "全部品牌",
    intent.keywords.length ? `关键词 ${intent.keywords.slice(0, 6).join(", ")}` : "无显式关键词"
  ];
  return parts.join(" / ");
}
