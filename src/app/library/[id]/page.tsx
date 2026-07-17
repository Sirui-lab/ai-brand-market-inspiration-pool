import { prisma } from "@/lib/db";
import { resolvePostCoverUrl } from "@/lib/collect/post-media";
import { mediaDisplayUrl } from "@/lib/collect/media-display";
import { DecodeEditor } from "@/app/library/[id]/DecodeEditor";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ id: string }>;

export default async function LibraryDetailPage({ params }: { params: PageParams }) {
  const { id } = await params;
  const post = await prisma.post.findUnique({
    where: { id },
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
    }
  });

  if (!post) notFound();

  const analysis = post.case?.analyses[0];
  const title = makeOneLiner(post.captionNormalized, post.platform.displayName);
  const sourceUrl = post.sourceUrl || post.canonicalUrl;
  const coverUrl = mediaDisplayUrl(resolvePostCoverUrl({
    coverImageUrl: post.coverImageUrl,
    visualReferenceNote: analysis?.visualReferenceNote,
    sourceUrl,
    canonicalUrl: post.canonicalUrl
  }));
  const contentType = inferContentType(post.captionNormalized, post.postTypeLabel);
  const industries = inferIndustries(post.captionNormalized).join(" / ");
  const moodTags = inferMoodTags(post.captionNormalized, post.platform.slug, contentType).join(" / ");

  return (
    <main className="shell">
      <section className="detailHeader">
        <Link href="/library">Back to Local Inspiration Library</Link>
        <h1>{title}</h1>
        <p>{post.brand.displayName} · {post.platform.displayName}</p>
      </section>

      <section className="inspirationDetailLayout">
        <aside className="detailVisualPanel">
          <div className={`detailCover platform-${post.platform.slug}`}>
            {coverUrl ? (
              <img src={coverUrl} alt="" />
            ) : (
              <div className="postCoverFallback">
                <span>{post.platform.displayName}</span>
                <strong>{post.brand.displayName}</strong>
              </div>
            )}
          </div>
          <div className="detailMetric">
            <span>点赞量</span>
            <strong>{formatLikes(post.likesCount, post.likesRaw)}</strong>
          </div>
        </aside>

        <article className="detailContentPanel">
          <div className="detailFieldGrid">
            <DetailField label="内容类型" value={contentType} />
            <DetailField label="行业" value={industries} />
            <DetailField label="气质标签" value={moodTags} />
            <DetailField label="商业影响" value={`${formatLikes(post.likesCount, post.likesRaw)} 点赞`} />
          </div>

          {post.case ? (
            <DecodeEditor
              caseId={post.case.id}
              captionRaw={post.captionRaw}
              likesRaw={post.likesRaw}
              visualReferenceNote={analysis?.visualReferenceNote ?? null}
              initialContent={analysis?.postContentAnalysis ?? null}
              initialStructure={analysis?.postStructureAnalysis ?? null}
              initialVisual={analysis?.visualDesignAnalysis ?? null}
            />
          ) : null}

          <section className="sourceSection">
            <DetailField label="来源链接" value={formatUrlLabel(sourceUrl)} href={sourceUrl} />
          </section>
        </article>
      </section>
    </main>
  );
}

function DetailField({ label, value, href }: { label: string; value: string; href?: string | null }) {
  return (
    <div className="detailField">
      <span>{label}</span>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer">{value}</a>
      ) : (
        <p>{value}</p>
      )}
    </div>
  );
}

function makeOneLiner(text: string | null, platformLabel: string) {
  const clean = tidyText(text);
  if (!clean) return `${platformLabel} 新内容已入库，等待补全重点信息。`;
  return clean.replace(/[。！？!?.].*$/, "");
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

function formatUrlLabel(value?: string | null) {
  if (!value) return "暂无链接";
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return trimToLength(value, 32);
  }
}
