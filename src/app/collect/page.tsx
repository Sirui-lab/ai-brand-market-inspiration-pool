"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { OFFICIAL_ACCOUNTS } from "@/lib/collect/official-accounts";

const collectPlatforms = [
  { slug: "instagram", label: "Instagram" },
  { slug: "x", label: "X" },
  { slug: "linkedin", label: "LinkedIn" },
  { slug: "youtube", label: "YouTube" },
  { slug: "reddit", label: "Reddit" }
];

const proxyImageHosts = [
  "cdninstagram.com",
  "fbcdn.net",
  "twimg.com",
  "pbs.twimg.com",
  "redd.it",
  "preview.redd.it",
  "redditmedia.com",
  "ytimg.com",
  "i.ytimg.com",
  "licdn.com",
  "media.licdn.com"
];

type RecentPostResult = {
  status: "fetched" | "needs_runner" | "failed";
  platformSlug: string;
  sourceId: string;
  since: string;
  message?: string;
  posts: Array<{
    id: string;
    title: string;
    url: string;
    publishedAt: string | null;
    author: string | null;
    excerpt: string | null;
    platformSlug: string;
    likesCount?: number | null;
    likesRaw?: string | null;
    thumbnailUrl?: string | null;
    coverUrl?: string | null;
  }>;
};

export default function CollectPage() {
  const [recentPlatformSlug, setRecentPlatformSlug] = useState("instagram");
  const [selectedAccountSourceId, setSelectedAccountSourceId] = useState(
    OFFICIAL_ACCOUNTS.find((account) => account.platformSlug === "instagram")?.sourceId ?? ""
  );
  const [recentLoading, setRecentLoading] = useState(false);
  const [recentError, setRecentError] = useState<string | null>(null);
  const [recentResult, setRecentResult] = useState<RecentPostResult | null>(null);
  const [savingPostIds, setSavingPostIds] = useState<Record<string, boolean>>({});
  const [postSaveStatus, setPostSaveStatus] = useState<Record<string, string>>({});
  const availableAccounts = useMemo(
    () => OFFICIAL_ACCOUNTS.filter((account) => account.platformSlug === recentPlatformSlug),
    [recentPlatformSlug]
  );
  const selectedAccount = availableAccounts.find((account) => account.sourceId === selectedAccountSourceId) ?? availableAccounts[0];

  function changeRecentPlatform(platformSlug: string) {
    const nextAccount = OFFICIAL_ACCOUNTS.find((account) => account.platformSlug === platformSlug);
    setRecentPlatformSlug(platformSlug);
    setSelectedAccountSourceId(nextAccount?.sourceId ?? "");
    setRecentResult(null);
    setRecentError(null);
  }

  function changeRecentAccount(sourceId: string) {
    setSelectedAccountSourceId(sourceId);
    setRecentResult(null);
    setRecentError(null);
  }

  async function fetchRecent() {
    setRecentError(null);
    setRecentResult(null);
    if (!selectedAccount?.sourceId) {
      setRecentError("当前平台还没有配置官方账号。");
      return;
    }
    setRecentLoading(true);
    const response = await fetch("/api/collect/recent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        platformSlug: recentPlatformSlug,
        sourceId: selectedAccount.sourceId
      })
    });
    const data = await safeJson(response);
    setRecentLoading(false);
    if (!response.ok && !data.posts) {
      setRecentError(data.error ?? data.message ?? "抓取失败");
      return;
    }
    setRecentResult(data);
  }

  async function savePost(post: RecentPostResult["posts"][number]) {
    setSavingPostIds((current) => ({ ...current, [post.id]: true }));
    setPostSaveStatus((current) => ({ ...current, [post.id]: "" }));
    const response = await fetch("/api/collect/recent/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ post, brandSlug: selectedAccount?.brandSlug || null })
    });
    const data = await safeJson(response);
    setSavingPostIds((current) => ({ ...current, [post.id]: false }));
    setPostSaveStatus((current) => ({
      ...current,
      [post.id]: response.ok ? data.message ?? "已加入 Local Inspiration Library。" : data.error ?? "加入失败"
    }));
  }

  return (
    <main className="shell">
      <section className="pageHeader">
        <h1>Live Collect</h1>
        <p>从品牌账号中抓取最近一周的post更新内容</p>
        <div className="actions">
          <Link href="/library">Local Inspiration Library</Link>
        </div>
      </section>

      <section className="importLayout">
        <section className="panel">
          <div className="sectionTitle">
            <div>
              <p className="eyebrow">Recent Posts Capture</p>
              <h2>抓取最近一周更新</h2>
              <p>选择平台和账号，自动拉取最近 7 天更新的post列表</p>
              {recentPlatformSlug === "reddit" ? (
                <p>
                  Reddit 里 u/ 是用户发布页，适合看账号自己发过什么；r/ 是社区讨论区，不一定是官方发布，适合观察用户讨论和热点。
                </p>
              ) : null}
            </div>
            <span className="supportBadge queued">7 Days</span>
          </div>
          <div className="collectForm">
            <label>
              平台
              <select value={recentPlatformSlug} onChange={(event) => changeRecentPlatform(event.target.value)}>
                {collectPlatforms.map((platform) => (
                  <option key={platform.slug} value={platform.slug}>
                    {platform.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              账号 / 社区
              <select
                value={selectedAccountSourceId}
                onChange={(event) => changeRecentAccount(event.target.value)}
                disabled={!availableAccounts.length}
              >
                {availableAccounts.length ? (
                  availableAccounts.map((account) => (
                    <option key={`${account.platformSlug}-${account.sourceId}`} value={account.sourceId}>
                      {account.label}
                    </option>
                  ))
                ) : (
                  <option value="">暂无可抓取账号 / 社区</option>
                )}
              </select>
            </label>
            {selectedAccount?.note ? <p className="emptyState">{selectedAccount.note}</p> : null}
            <button disabled={recentLoading || !availableAccounts.length} onClick={fetchRecent}>
              {recentLoading ? "抓取中..." : "抓取最近一周帖子"}
            </button>
          </div>
          {recentError ? <p className="error">{recentError}</p> : null}
          {recentResult ? (
            <div className="captureDraft">
              <strong>
                {recentResult.platformSlug} / {recentResult.sourceId}
              </strong>
              <p>
                最近 7 天窗口：{formatDate(recentResult.since)} 至今天。{recentSummary(recentResult)}
              </p>
              {recentResult.message ? <span>{recentResult.message}</span> : null}
              {recentResult.posts.length ? (
                <div className="recentPostList">
                  {recentResult.posts.map((post) => (
                    <article key={`${post.platformSlug}-${post.id}`} className="recentPostItem">
                      {post.coverUrl || post.thumbnailUrl ? (
                        <img
                          className="recentPostThumb"
                          src={displayMediaUrl(post.coverUrl ?? post.thumbnailUrl)}
                          alt=""
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                      ) : null}
                      <div>
                        <a href={post.url} target="_blank" rel="noreferrer">
                          {post.title}
                        </a>
                        <p>
                          {post.author ?? "未知作者"} · {post.publishedAt ? formatDate(post.publishedAt) : "未知时间"}
                        </p>
                        {post.excerpt ? <p>{post.excerpt}</p> : null}
                        <p>{formatLikes(post.likesCount, post.likesRaw)}</p>
                        <div className="recentPostActions">
                          <button disabled={Boolean(savingPostIds[post.id])} onClick={() => savePost(post)}>
                            {savingPostIds[post.id] ? "加入中..." : "加入 Local Inspiration Library"}
                          </button>
                          {postSaveStatus[post.id] ? <span>{postSaveStatus[post.id]}</span> : null}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        <aside className="supportPanel">
          <h2>Tips</h2>
          <div className="supportList">
            <article className="supportItem">
              <div>
                <h3>Reddit 来源</h3>
                <p>u/ 是用户发布页；r/ 是社区讨论区，适合观察讨论热点。</p>
              </div>
            </article>
            <article className="supportItem">
              <div>
                <h3>互动数据</h3>
                <p>系统会尽量读取公开点赞量；平台未公开时显示为未知。</p>
              </div>
            </article>
          </div>
        </aside>
      </section>
    </main>
  );
}

async function safeJson(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

function recentSummary(result: RecentPostResult) {
  if (result.status === "fetched") return `找到 ${result.posts.length} 条。`;
  if (result.status === "needs_runner") return "当前网络暂时无法确认账号状态。";
  return "抓取失败。";
}

function formatLikes(value?: number | null, raw?: string | null) {
  if (typeof value === "number") return `点赞量 ${value.toLocaleString()}`;
  if (raw) return `点赞量 ${raw}`;
  return "点赞量未知";
}

function displayMediaUrl(value?: string | null) {
  if (!value) return "";
  if (value.startsWith("/media-cache/")) return value;
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (proxyImageHosts.some((domain) => host === domain || host.endsWith(`.${domain}`))) {
      return `/api/media/proxy?url=${encodeURIComponent(value)}`;
    }
  } catch {
    return value;
  }
  return value;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
}
