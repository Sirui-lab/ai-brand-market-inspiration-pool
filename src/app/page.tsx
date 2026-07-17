import { StatCard } from "@/app/components/StatCard";
import { prisma } from "@/lib/db";
import { ensureBaselineData } from "@/lib/seed";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await ensureBaselineData();
  const [caseCount, postCount, platformCount, brandCount, platformCoverage, brandCoverage] = await Promise.all([
    prisma.case.count(),
    prisma.post.count(),
    prisma.platform.count(),
    prisma.brand.count(),
    prisma.post.groupBy({
      by: ["platformId"],
      _count: { _all: true },
      orderBy: { _count: { platformId: "desc" } }
    }),
    prisma.post.groupBy({
      by: ["brandId"],
      _count: { _all: true },
      orderBy: { _count: { brandId: "desc" } }
    })
  ]);
  const [platforms, brands] = await Promise.all([
    prisma.platform.findMany({ orderBy: { displayName: "asc" } }),
    prisma.brand.findMany({ orderBy: { displayName: "asc" } })
  ]);
  const platformNames = new Map(platforms.map((item) => [item.id, item.displayName]));
  const brandNames = new Map(brands.map((item) => [item.id, item.displayName]));

  return (
    <main className="shell">
      <section className="pageHeader">
        <p className="eyebrow">Dashboard</p>
        <h1>AI Brand & Market Inspiration Pool</h1>
        <div className="actions">
          <Link href="/collect">抓取最新内容</Link>
          <Link href="/library" className="secondaryAction">
            Local Inspiration Library
          </Link>
        </div>
      </section>

      <section className="statGrid">
        <StatCard label="Cases" value={caseCount} note="已沉淀的内容案例" />
        <StatCard label="Posts" value={postCount} note="已归一化的原帖记录" />
        <StatCard label="Platforms" value={platformCount} note="当前数据覆盖平台" />
        <StatCard label="Brands" value={brandCount} note="当前追踪品牌" />
      </section>

      <section className="dashboardGrid">
        <section className="dashboardPanel">
          <div className="sectionTitle">
            <div>
              <h2>平台覆盖</h2>
              <p>当前入库案例按平台分布。</p>
            </div>
          </div>
          <div className="coverageList">
            {platformCoverage.length ? (
              platformCoverage.map((item) => (
                <CoverageRow
                  key={item.platformId}
                  label={platformNames.get(item.platformId) ?? "Unknown"}
                  value={item._count._all}
                  total={postCount}
                />
              ))
            ) : (
              <p className="mutedText">还没有入库案例。</p>
            )}
          </div>
        </section>

        <section className="dashboardPanel">
          <div className="sectionTitle">
            <div>
              <h2>品牌覆盖</h2>
              <p>当前追踪品牌的数据分布。</p>
            </div>
          </div>
          <div className="coverageList">
            {brandCoverage.length ? (
              brandCoverage.map((item) => (
                <CoverageRow
                  key={item.brandId}
                  label={brandNames.get(item.brandId) ?? "Unknown"}
                  value={item._count._all}
                  total={postCount}
                />
              ))
            ) : (
              <p className="mutedText">还没有品牌覆盖数据。</p>
            )}
          </div>
        </section>
      </section>

      <section className="workspaceGrid">
        <Link className="moduleTile" href="/collect">
          <span>01</span>
          <h2>Live Collect</h2>
          <p>从品牌账号抓取最近一周 post 更新内容。</p>
        </Link>
        <Link className="moduleTile" href="/library">
          <span>02</span>
          <h2>Local Inspiration Library</h2>
          <p>以 Gallery 卡片浏览已入库灵感，保留来源、解码和商业数据。</p>
        </Link>
        <Link className="moduleTile" href="/ask">
          <span>03</span>
          <h2>Search / Ask</h2>
          <p>围绕 posts、cases 和 analyses 做检索、总结、对比与灵感生成。</p>
        </Link>
      </section>
    </main>
  );
}

function CoverageRow({ label, value, total }: { label: string; value: number; total: number }) {
  const percent = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="coverageRow">
      <div>
        <strong>{label}</strong>
        <span>{value.toLocaleString()} cases</span>
      </div>
      <div className="progressTrack" aria-label={`${label} ${percent}%`}>
        <span style={{ width: `${percent}%` }} />
      </div>
      <em>{percent}%</em>
    </div>
  );
}
