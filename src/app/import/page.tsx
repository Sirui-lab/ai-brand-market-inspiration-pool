"use client";

import { useEffect, useState } from "react";

type Batch = {
  id: string;
  status: string;
  totalRows: number;
  successCount: number;
  warningCount: number;
  failedCount: number;
  duplicateCount: number;
  items: Array<{
    id: string;
    sheetName: string;
    sourceRowNumber: number;
    status: string;
    warningsJson: string;
    errorsJson: string;
    normalizedDataJson: string;
    brand?: { displayName: string } | null;
  }>;
};

type RecentBatch = {
  id: string;
  platform: string;
  platformSlug: string;
  sourceFileName: string;
  status: string;
  totalRows: number;
  successCount: number;
  warningCount: number;
  failedCount: number;
  duplicateCount: number;
  createdAt: string;
  committedAt: string | null;
};

const platformGuides = [
  {
    slug: "instagram",
    name: "Instagram",
    status: "Ready",
    note: "已支持多 sheet、表头识别、原帖链接、点赞量和发布时间解析。"
  },
  {
    slug: "linkedin",
    name: "LinkedIn",
    status: "Ready",
    note: "支持按平台模板导入、预览和去重入库。"
  },
  {
    slug: "x",
    name: "X",
    status: "Ready",
    note: "支持按平台模板导入、预览和去重入库。"
  }
];

export default function ImportPage() {
  const [platform, setPlatform] = useState("instagram");
  const [file, setFile] = useState<File | null>(null);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [recentBatches, setRecentBatches] = useState<RecentBatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadRecentBatches();
  }, []);

  async function loadRecentBatches() {
    const response = await fetch("/api/import-batches");
    const data = await safeJson(response);
    if (response.ok) {
      setRecentBatches(data);
    }
  }

  async function upload() {
    if (!file) return;
    setLoading(true);
    setError(null);
    const form = new FormData();
    form.set("platform", platform);
    form.set("file", file);
    const response = await fetch("/api/import-batches", { method: "POST", body: form });
    const data = await safeJson(response);
    setLoading(false);
    if (!response.ok) {
      setError(data.error ?? "上传失败");
      return;
    }
    setBatch(data);
    await loadRecentBatches();
  }

  async function commit() {
    if (!batch) return;
    setLoading(true);
    setError(null);
    const response = await fetch(`/api/import-batches/${batch.id}/commit`, { method: "POST" });
    const data = await safeJson(response);
    setLoading(false);
    if (!response.ok) {
      setError(data.error ?? "确认入库失败");
      return;
    }
    setBatch(data);
    await loadRecentBatches();
  }

  return (
    <main className="shell">
      <section className="pageHeader">
        <p className="eyebrow">Import Center</p>
        <h1>历史数据导入中心</h1>
        <p>上传 Excel 后生成预览，确认无误后写入 Local Inspiration Library，并保留校验、去重和幂等保护。</p>
      </section>

      <section className="importLayout">
        <div className="panel">
          <h2>上传文件</h2>
        <div className="formGrid">
          <label>
            平台
            <select value={platform} onChange={(event) => setPlatform(event.target.value)}>
              <option value="instagram">Instagram</option>
              <option value="linkedin">LinkedIn</option>
              <option value="x">X</option>
            </select>
          </label>
          <label>
            Excel 文件
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <button disabled={!file || loading} onClick={upload}>
            {loading ? "处理中..." : "上传并预览"}
          </button>
        </div>
        {error ? <p className="error">{error}</p> : null}
        </div>

        <aside className="supportPanel">
          <h2>平台支持状态</h2>
          <div className="supportList">
            {platformGuides.map((item) => (
              <article key={item.slug} className="supportItem">
                <div>
                  <h3>{item.name}</h3>
                  <p>{item.note}</p>
                </div>
                <span className={`supportBadge ${item.status.toLowerCase()}`}>{item.status}</span>
              </article>
            ))}
          </div>
        </aside>
      </section>

      {batch ? (
        <section className="panel">
          <div className="summaryHeader">
            <div>
              <h2>导入预览</h2>
              <p>Batch ID: {batch.id}</p>
            </div>
            <button disabled={loading || batch.status === "committed"} onClick={commit}>
              {batch.status === "committed" ? "已入库" : "确认入库"}
            </button>
          </div>
          <div className="stats">
            <span>总行数 {batch.totalRows}</span>
            <span>可入库 {batch.successCount}</span>
            <span>Warning {batch.warningCount}</span>
            <span>失败 {batch.failedCount}</span>
            <span>重复 {batch.duplicateCount}</span>
          </div>
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Sheet</th>
                  <th>行号</th>
                  <th>Brand</th>
                  <th>Status</th>
                  <th>内容</th>
                  <th>提示</th>
                </tr>
              </thead>
              <tbody>
                {batch.items.slice(0, 200).map((item) => {
                  const normalized = JSON.parse(item.normalizedDataJson);
                  const warnings = JSON.parse(item.warningsJson);
                  const errors = JSON.parse(item.errorsJson);
                  return (
                    <tr key={item.id}>
                      <td>{item.sheetName}</td>
                      <td>{item.sourceRowNumber}</td>
                      <td>{item.brand?.displayName ?? "-"}</td>
                      <td>
                        <span className={`status ${item.status}`}>{item.status}</span>
                      </td>
                      <td>{normalized.captionNormalized}</td>
                      <td>{[...errors, ...warnings].join("；")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="panel">
        <div className="summaryHeader">
          <div>
            <h2>最近导入批次</h2>
            <p>用于快速确认最近上传、预览和入库状态。</p>
          </div>
        </div>
        {recentBatches.length ? (
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>时间</th>
                  <th>平台</th>
                  <th>文件</th>
                  <th>Status</th>
                  <th>结果</th>
                </tr>
              </thead>
              <tbody>
                {recentBatches.map((item) => (
                  <tr key={item.id}>
                    <td>{formatDateTime(item.createdAt)}</td>
                    <td>{item.platform}</td>
                    <td>{item.sourceFileName}</td>
                    <td>
                      <span className={`status ${item.status}`}>{item.status}</span>
                    </td>
                    <td>
                      总 {item.totalRows} / 可入库 {item.successCount} / Warning {item.warningCount} / 重复{" "}
                      {item.duplicateCount} / 失败 {item.failedCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="emptyState">还没有导入批次。</p>
        )}
      </section>
    </main>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
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
