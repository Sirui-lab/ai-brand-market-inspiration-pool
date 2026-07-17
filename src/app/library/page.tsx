import { prisma } from "@/lib/db";
import { ensureBaselineData } from "@/lib/seed";
import { resolvePostCoverUrl } from "@/lib/collect/post-media";
import { mediaDisplayUrl } from "@/lib/collect/media-display";
import Link from "next/link";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  platform?: string;
  brand?: string;
  source?: string;
  reviewStatus?: string;
  keyword?: string;
}>;

const platforms = [
  { slug: "", label: "全部平台" },
  { slug: "instagram", label: "Instagram" },
  { slug: "linkedin", label: "LinkedIn" },
  { slug: "x", label: "X" },
  { slug: "youtube", label: "YouTube" },
  { slug: "reddit", label: "Reddit" }
];

const brands = [
  { slug: "", label: "全部品牌" },
  { slug: "chatgpt", label: "ChatGPT" },
  { slug: "claude", label: "Claude" },
  { slug: "notion", label: "Notion" },
  { slug: "perplexity", label: "Perplexity" },
  { slug: "cursor", label: "Cursor" }
];

const sources = [
  { slug: "", label: "全部来源" },
  { slug: "manual_import", label: "Excel Import" },
  { slug: "browser_collect", label: "Live Collect" }
];

const reviewStatuses = [
  { slug: "", label: "全部状态" },
  { slug: "imported", label: "Imported" },
  { slug: "needs_review", label: "Needs Review" }
];

type LibraryPost = Awaited<ReturnType<typeof getLibraryPosts>>[number];

export default async function LibraryPage({ searchParams }: { searchParams: SearchParams }) {
  try {
    await ensureBaselineData();
    const params = await searchParams;
    const platform = params.platform || "";
    const brand = params.brand || "";
    const source = params.source || "";
    const reviewStatus = params.reviewStatus || "";
    const keyword = params.keyword?.trim() || "";

    const posts = await getLibraryPosts({ platform, brand, source, reviewStatus, keyword });
    const platformCount = new Set(posts.map((post) => post.platform.slug)).size;
    const brandCount = new Set(posts.map((post) => post.brand.slug)).size;

    return (
      <main className="shell">
        <section className="libraryToolbar">
          <div className="libraryTitleBar">
            <div>
              <h1>Local Inspiration Library</h1>
            </div>
          </div>
          <form className="libraryFilters">
            <select name="platform" defaultValue={platform}>
              {platforms.map((item) => (
                <option key={item.slug} value={item.slug}>
                  {item.label}
                </option>
              ))}
            </select>
            <select name="brand" defaultValue={brand}>
              {brands.map((item) => (
                <option key={item.slug} value={item.slug}>
                  {item.label}
                </option>
              ))}
            </select>
            <select name="source" defaultValue={source}>
              {sources.map((item) => (
                <option key={item.slug} value={item.slug}>
                  {item.label}
                </option>
              ))}
            </select>
            <select name="reviewStatus" defaultValue={reviewStatus}>
              {reviewStatuses.map((item) => (
                <option key={item.slug} value={item.slug}>
                  {item.label}
                </option>
              ))}
            </select>
            <input name="keyword" defaultValue={keyword} placeholder="搜索内容或分析" />
            <button type="submit">筛选</button>
          </form>

          <div className="libraryStats">
            <span>当前结果 {posts.length} 条</span>
            <span>{platformCount || 0} 个平台</span>
            <span>{brandCount || 0} 个品牌</span>
          </div>

          {posts.length === 0 ? <p className="emptyState">还没有匹配的灵感。</p> : null}
        </section>

        <section className="inspirationGallery" aria-label="灵感 Gallery">
          {posts.map((post) => (
            <InspirationCard key={post.id} post={post} />
          ))}
        </section>
      </main>
    );
  } catch (error) {
    return (
      <main className="shell">
        <section className="panel">
          <h1>Local Inspiration Library</h1>
          <p className="error">
            {error instanceof Error ? error.message : "Local Inspiration Library 加载失败"}
          </p>
        </section>
      </main>
    );
  }
}

async function getLibraryPosts({
  platform,
  brand,
  source,
  reviewStatus,
  keyword
}: {
  platform: string;
  brand: string;
  source: string;
  reviewStatus: string;
  keyword: string;
}) {
  return prisma.post.findMany({
    where: {
      platform: platform ? { slug: platform } : undefined,
      brand: brand ? { slug: brand } : undefined,
      sourceType: source ? (source as "manual_import" | "browser_collect" | "official_api") : undefined,
      reviewStatus: reviewStatus || undefined,
      OR: keyword
        ? [
            { captionNormalized: { contains: keyword } },
            {
              case: {
                analyses: {
                  some: {
                    OR: [
                      { postStructureAnalysis: { contains: keyword } },
                      { postContentAnalysis: { contains: keyword } },
                      { visualDesignAnalysis: { contains: keyword } }
                    ]
                  }
                }
              }
            }
          ]
        : undefined
    },
    include: {
      brand: true,
      platform: true,
      case: {
        include: {
          analyses: {
            where: { source: "human" },
            orderBy: { version: "desc" },
            take: 1
          }
        }
      }
    },
    orderBy: [{ platform: { displayName: "asc" } }, { brand: { displayName: "asc" } }, { likesCount: "desc" }, { createdAt: "desc" }],
    take: 200
  });
}

function InspirationCard({ post }: { post: LibraryPost }) {
  const analysis = post.case?.analyses[0];
  const sourceUrl = post.sourceUrl || post.canonicalUrl;
  const oneLiner = makeOneLiner(post.captionNormalized, post.platform.displayName);
  const coverUrl = mediaDisplayUrl(resolvePostCoverUrl({
    coverImageUrl: post.coverImageUrl,
    visualReferenceNote: analysis?.visualReferenceNote,
    sourceUrl,
    canonicalUrl: post.canonicalUrl
  }));

  return (
    <Link className="inspirationCard" href={`/library/${post.id}`}>
      <div className="galleryCardSummary">
        <div className={`postCover platform-${post.platform.slug}`}>
          {coverUrl ? (
            <img src={coverUrl} alt="" />
          ) : (
            <div className="postCoverFallback">
              <span>{post.platform.displayName}</span>
              <strong>{post.brand.displayName}</strong>
            </div>
          )}
        </div>
        <h2>{oneLiner}</h2>
        <div className="galleryEngagement">
          <span aria-hidden="true">♥</span>
          <strong>{formatLikes(post.likesCount, post.likesRaw)}</strong>
          <em>点赞</em>
        </div>
      </div>
    </Link>
  );
}

function makeOneLiner(text: string | null, platformLabel: string) {
  const clean = tidyText(text);
  if (!clean) return `${platformLabel} 新内容已入库，等待补全重点信息。`;
  return clean.split(/[。！？!?.]/)[0] || clean;
}

function inferContentType(text: string | null, fallback: string | null) {
  const raw = `${text ?? ""} ${fallback ?? ""}`.toLowerCase();
  if (/conference|summit|devday|大会|峰会/.test(raw)) return "大会";
  if (/collab|partner|partnership|with |联名|合作/.test(raw)) return "联名";
  if (/event|meetup|webinar|workshop|活动|直播/.test(raw)) return "活动";
  if (/space|store|popup|pop-up|office|空间|门店/.test(raw)) return "空间";
  if (/launch|feature|model|product|app|发布|模型|功能|产品/.test(raw)) return "产品";
  return "Campaign";
}

function inferIndustries(text: string | null) {
  const raw = (text ?? "").toLowerCase();
  const values = new Set(["科技"]);
  if (/fashion|style|wear|runway|时尚/.test(raw)) values.add("时尚");
  if (/shop|consumer|customer|pricing|消费|用户/.test(raw)) values.add("消费");
  if (/culture|artist|music|film|story|community|文化|人文|社区/.test(raw)) values.add("文化");
  return Array.from(values).slice(0, 3);
}

function inferMoodTags(text: string | null, platformSlug: string, contentType: string) {
  const raw = (text ?? "").toLowerCase();
  const tags = new Set<string>();
  if (/simple|minimal|quiet|clean|克制/.test(raw)) tags.add("#克制");
  if (/ai|model|launch|future|agent|cursor|claude|gpt|perplexity|先锋/.test(raw)) tags.add("#先锋");
  if (/fun|meme|joke|lol|幽默/.test(raw)) tags.add("#幽默");
  if (/people|human|story|community|learn|人文|社区/.test(raw)) tags.add("#人文");
  if (platformSlug === "reddit" || /raw|beta|terminal|code|粗野/.test(raw)) tags.add("#粗野主义");
  if (!tags.size) tags.add(contentType === "产品" ? "#先锋" : "#克制");
  return Array.from(tags).slice(0, 3);
}

function tidyText(value?: string | null) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function trimToLength(value: string, length: number) {
  if (value.length <= length) return value;
  return value.slice(0, length);
}

function formatLikes(value?: number | null, raw?: string | null) {
  if (typeof value === "number") return value.toLocaleString();
  return raw || "待补全";
}

function formatSource(value: string) {
  if (value === "browser_collect") return "Live Collect";
  if (value === "manual_import") return "Excel Import";
  return value;
}

function formatUrlLabel(value?: string | null) {
  if (!value) return "暂无链接";
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return trimToLength(value, 32);
  }
}

function formatReviewStatus(value: string, text?: string | null) {
  if (!tidyText(text) || value === "low_quality") return { label: "低质量", className: "lowQuality" };
  if (value === "needs_review") return { label: "待审核", className: "needsReview" };
  return { label: "已发布", className: "published" };
}
