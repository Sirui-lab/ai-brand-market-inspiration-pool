"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type CaseRecord = {
  id: string;
  post: {
    captionRaw: string;
    likesRaw: string | null;
    sourceUrl: string | null;
    canonicalUrl: string | null;
    reviewStatus: string;
    platform: { displayName: string };
    brand: { displayName: string };
  };
  analyses: Array<{
    postStructureAnalysis: string | null;
    postContentAnalysis: string | null;
    visualDesignAnalysis: string | null;
    visualReferenceNote: string | null;
  }>;
};

export default function ReviewCasePage() {
  const params = useParams<{ id: string }>();
  const [caseRecord, setCaseRecord] = useState<CaseRecord | null>(null);
  const [captionRaw, setCaptionRaw] = useState("");
  const [likesRaw, setLikesRaw] = useState("");
  const [postStructureAnalysis, setPostStructureAnalysis] = useState("");
  const [postContentAnalysis, setPostContentAnalysis] = useState("");
  const [visualDesignAnalysis, setVisualDesignAnalysis] = useState("");
  const [visualReferenceNote, setVisualReferenceNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const response = await fetch(`/api/cases/${params.id}`);
      const data = await safeJson(response);
      setLoading(false);
      if (!response.ok) {
        setError(data.error ?? "加载失败");
        return;
      }
      const analysis = data.analyses?.[0];
      setCaseRecord(data);
      setCaptionRaw(data.post.captionRaw ?? "");
      setLikesRaw(data.post.likesRaw ?? "");
      setPostStructureAnalysis(analysis?.postStructureAnalysis ?? "");
      setPostContentAnalysis(analysis?.postContentAnalysis ?? "");
      setVisualDesignAnalysis(analysis?.visualDesignAnalysis ?? "");
      setVisualReferenceNote(analysis?.visualReferenceNote ?? "");
    }
    void load();
  }, [params.id]);

  async function save() {
    setSaving(true);
    setSaved(false);
    setError(null);
    const response = await fetch(`/api/cases/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        captionRaw,
        likesRaw,
        postStructureAnalysis,
        postContentAnalysis,
        visualDesignAnalysis,
        visualReferenceNote
      })
    });
    const data = await safeJson(response);
    setSaving(false);
    if (!response.ok) {
      setError(data.error ?? "保存失败");
      return;
    }
    setCaseRecord(data);
    setSaved(true);
  }

  if (loading) {
    return (
      <main className="shell">
        <section className="panel">
          <p>加载中...</p>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <section className="pageHeader">
        <p className="eyebrow">Case Review</p>
        <h1>补全案例</h1>
        <p>把 Live Collect 保存的链接补成可复用案例。保存后会进入 Imported 状态。</p>
        <div className="actions">
          <Link href="/library?source=browser_collect&reviewStatus=needs_review">返回待补全列表</Link>
          <Link href="/library" className="secondaryAction">
            Local Inspiration Library
          </Link>
        </div>
      </section>

      {caseRecord ? (
        <section className="reviewLayout">
          <section className="panel">
            <div className="caseMeta reviewMeta">
              <span>{caseRecord.post.platform.displayName}</span>
              <span>{caseRecord.post.brand.displayName}</span>
              <span>{caseRecord.post.reviewStatus}</span>
            </div>

            <div className="reviewForm">
              <label>
                Post Content
                <textarea value={captionRaw} onChange={(event) => setCaptionRaw(event.target.value)} />
              </label>
              <label>
                Likes
                <input value={likesRaw} placeholder="例如 8k+ / 1w+ / 600+" onChange={(event) => setLikesRaw(event.target.value)} />
              </label>
              <label>
                Post Structure
                <textarea value={postStructureAnalysis} onChange={(event) => setPostStructureAnalysis(event.target.value)} />
              </label>
              <label>
                Post Content Analysis
                <textarea value={postContentAnalysis} onChange={(event) => setPostContentAnalysis(event.target.value)} />
              </label>
              <label>
                Visual Design
                <textarea value={visualDesignAnalysis} onChange={(event) => setVisualDesignAnalysis(event.target.value)} />
              </label>
              <label>
                Visual Reference
                <input value={visualReferenceNote} onChange={(event) => setVisualReferenceNote(event.target.value)} />
              </label>
              <button disabled={saving || !captionRaw.trim()} onClick={save}>
                {saving ? "保存中..." : "保存并标记完成"}
              </button>
            </div>
            {error ? <p className="error">{error}</p> : null}
            {saved ? <p className="successText">已保存。</p> : null}
          </section>

          <aside className="supportPanel">
            <h2>原帖</h2>
            <p>{caseRecord.post.canonicalUrl ?? "暂无链接"}</p>
            {caseRecord.post.sourceUrl ? (
              <a className="textLink" href={caseRecord.post.sourceUrl} target="_blank" rel="noreferrer">
                打开原帖
              </a>
            ) : null}
          </aside>
        </section>
      ) : (
        <section className="panel">
          <p className="error">{error ?? "没有找到这个案例"}</p>
        </section>
      )}
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
