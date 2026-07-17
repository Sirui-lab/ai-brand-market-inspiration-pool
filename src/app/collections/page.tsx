import Link from "next/link";

const collectionIdeas = [
  {
    title: "Launch Inspiration",
    count: "Template",
    owner: "Campaign planning",
    text: "产品发布、功能发布、模型发布相关的高赞表达方式。",
    tags: ["Launch", "Product", "Model update"]
  },
  {
    title: "Creator & Community",
    count: "Template",
    owner: "Community content",
    text: "用户故事、社区共创、UGC 二创和创作者案例。",
    tags: ["UGC", "Creator", "Community"]
  },
  {
    title: "Competitive Watch",
    count: "Template",
    owner: "Market research",
    text: "ChatGPT、Claude、Notion、Perplexity、Cursor 的海外内容观察。",
    tags: ["Competitor", "Benchmark", "Weekly review"]
  },
  {
    title: "Visual Patterns",
    count: "Template",
    owner: "Design reference",
    text: "沉淀高赞内容里可复用的主视觉、排版和截图表达方式。",
    tags: ["Visual Design", "Carousel", "Screenshot"]
  }
];

const workflowSteps = [
  "从 Local Inspiration Library 按品牌、平台或关键词筛选案例",
  "把相关案例加入一个 Collection",
  "补充用途、主题、适用场景和团队备注",
  "导出 brief 或给 Search / Ask 引用"
];

const futureFields = ["Collection name", "Use case", "Owner", "Linked cases", "Notes", "Updated at"];

export default function CollectionsPage() {
  return (
    <main className="shell">
      <section className="pageHeader">
        <p className="eyebrow">Collections</p>
        <h1>Collections</h1>
        <p>把 Local Inspiration Library 里的案例整理成可复用的主题灵感包，用于内容策划、竞品观察和视觉参考。</p>
        <div className="actions">
          <Link href="/library">从 Local Inspiration Library 选择案例</Link>
          <Link href="/ask" className="secondaryAction">
            问答引用
          </Link>
        </div>
      </section>

      <section className="collectionGrid">
        {collectionIdeas.map((item) => (
          <article key={item.title} className="collectionCard">
            <span>{item.count}</span>
            <h2>{item.title}</h2>
            <p>{item.text}</p>
            <div className="collectionMeta">
              <strong>{item.owner}</strong>
            </div>
            <div className="tagList compactTags">
              {item.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="dashboardGrid wideFirst">
        <section className="dashboardPanel">
          <div className="sectionTitle">
            <div>
              <h2>Collection 工作流</h2>
              <p>围绕主题、用途和适用场景组织案例。</p>
            </div>
          </div>
          <div className="stepList">
            {workflowSteps.map((step, index) => (
              <div key={step} className="stepItem">
                <span>{String(index + 1).padStart(2, "0")}</span>
                <p>{step}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="dashboardPanel">
          <div className="sectionTitle">
            <div>
              <h2>数据字段</h2>
              <p>用于组织主题灵感包的核心信息。</p>
            </div>
          </div>
          <div className="fieldList">
            {futureFields.map((field) => (
              <span key={field}>{field}</span>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
