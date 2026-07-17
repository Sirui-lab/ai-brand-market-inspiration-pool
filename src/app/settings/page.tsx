const brands = ["ChatGPT", "Claude", "Notion", "Perplexity", "Cursor"];
const platforms = ["Instagram", "X", "LinkedIn", "YouTube", "Reddit"];
const analysisFields = ["Post Structure", "Post Content", "Visual Design"];

export default function SettingsPage() {
  const credentialStatus = [
    {
      platform: "YouTube",
      status: "公开数据",
      detail: "使用公开 RSS 和频道页，不需要用户账号。"
    },
    {
      platform: "Reddit",
      status: "公开数据",
      detail: "使用公开 JSON、RSS 和帖子页，不需要用户账号。"
    },
    {
      platform: "Instagram",
      status: process.env.INSTAGRAM_USE_LOGIN_FALLBACK === "true" ? "项目兜底已启用" : "公开抓取优先",
      detail: "默认不需要账号；公开访问受限时，只应由管理员配置项目专用采集账号。"
    },
    {
      platform: "X",
      status: process.env.X_BEARER_TOKEN || (process.env.X_AUTH_TOKEN && process.env.X_CT0) ? "项目凭证已配置" : "需要项目凭证",
      detail: "稳定抓取最近 posts 和点赞量需要 X API Bearer Token，或管理员配置项目专用采集账号。"
    },
    {
      platform: "LinkedIn",
      status: process.env.LINKEDIN_USE_LOGIN_FALLBACK === "true" ? "项目兜底已启用" : "公开抓取优先",
      detail: "默认尝试公开公司页；公开页受限时，只应由管理员配置项目专用采集账号。"
    }
  ];

  return (
    <main className="shell">
      <section className="pageHeader">
        <p className="eyebrow">Settings / Taxonomy</p>
        <h1>Taxonomy</h1>
        <p>统一品牌、平台和分析字段，保证 Local Inspiration Library、抓取和检索使用同一套分类。</p>
      </section>

      <section className="settingsGrid">
        <TaxonomyBlock title="Brands" items={brands} />
        <TaxonomyBlock title="Platforms" items={platforms} />
        <TaxonomyBlock title="AI Analysis Fields" items={analysisFields} />
      </section>

      <section className="taxonomyBlock credentialBlock">
        <h2>Collection Credentials</h2>
        <p>
          采集凭证由管理员在服务端统一配置。普通使用者不需要、也不应该提交个人社媒账号。
        </p>
        <div className="credentialGrid">
          {credentialStatus.map((item) => (
            <article className="credentialItem" key={item.platform}>
              <div>
                <strong>{item.platform}</strong>
                <span>{item.status}</span>
              </div>
              <p>{item.detail}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function TaxonomyBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="taxonomyBlock">
      <h2>{title}</h2>
      <div className="tagList">
        {items.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
    </section>
  );
}
