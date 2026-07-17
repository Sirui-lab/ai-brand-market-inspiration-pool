"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type AskResponse = {
  answer: string;
  citations: Array<{
    id: string;
    title: string;
    platform: string;
    brand: string;
    url: string | null;
    likes: number | null;
    publishDate: string | null;
    matchedFields: string[];
    excerpt: string;
  }>;
  diagnostics: {
    mode: "local_fallback";
    totalCandidates: number;
    filters: {
      platforms: string[];
      brands: string[];
      keywords: string[];
    };
  };
};

const suggestions = [
  "总结 ChatGPT Instagram 高赞内容的常见结构",
  "Cursor 最近的产品发布内容有什么可借鉴？",
  "按品牌比较 Claude 和 Perplexity 的内容主题",
  "生成 5 个基于 YouTube / Reddit 案例的社区内容方向"
];

const HISTORY_KEY = "ask-search-history";

export default function AskPage() {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<AskResponse | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState<string[]>([]);

  useEffect(() => {
    const stored = window.localStorage.getItem(HISTORY_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) setHistory(parsed.filter((item) => typeof item === "string"));
      } catch {
        window.localStorage.removeItem(HISTORY_KEY);
      }
    }
  }, []);

  const filters = useMemo(() => {
    if (!result) return "";
    const { platforms, brands, keywords } = result.diagnostics.filters;
    return [
      platforms.length ? `平台 ${platforms.join(", ")}` : "全部平台",
      brands.length ? `品牌 ${brands.join(", ")}` : "全部品牌",
      keywords.length ? `关键词 ${keywords.slice(0, 5).join(", ")}` : "自动扩展"
    ].join(" / ");
  }, [result]);

  async function submitAsk(event?: FormEvent) {
    event?.preventDefault();
    const trimmed = question.trim();
    if (!trimmed) return;
    await runAsk(trimmed);
  }

  async function runAsk(value: string) {
    setIsLoading(true);
    setError("");
    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: value })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Ask 请求失败");
      setResult(data);
      saveHistory(value);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Ask 请求失败");
    } finally {
      setIsLoading(false);
    }
  }

  function useSuggestion(value: string) {
    setQuestion(value);
  }

  function saveHistory(value: string) {
    setHistory((current) => {
      const next = [value, ...current.filter((item) => item !== value)].slice(0, 8);
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      return next;
    });
  }

  function clearHistory() {
    setHistory([]);
    window.localStorage.removeItem(HISTORY_KEY);
  }

  async function runHistorySearch(value: string) {
    setQuestion(value);
    await runAsk(value);
  }

  return (
    <main className="shell">
      <section className="askWorkspaceHeader">
        <div>
          <h1>Search / Ask</h1>
          <p>围绕已收集的 posts、cases 和 analyses 做检索、总结、对比与灵感生成。</p>
        </div>
        <div className="headerActions">
          <Link href="/collect">Collect</Link>
          <Link href="/import" className="secondaryAction">Import</Link>
        </div>
      </section>

      <section className="askWorkbench">
        <form className="askComposer" onSubmit={submitAsk}>
          <label htmlFor="askQuestion">Ask the inspiration pool</label>
          <textarea
            id="askQuestion"
            defaultValue={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="例如：请总结 ChatGPT 在 Instagram 上高赞产品功能 posts 的结构，并给 Kimi 3 个可借鉴方向"
            rows={4}
          />
          <div className="askComposerFooter">
            {filters ? <span>{filters}</span> : null}
            <button id="askSubmit" type="submit" disabled={isLoading || !question.trim()}>
              {isLoading ? "Thinking..." : "Ask"}
            </button>
          </div>
        </form>

        <div className="askSuggestionGrid">
          {suggestions.map((item) => (
            <button key={item} type="button" data-suggestion={item} onClick={() => useSuggestion(item)}>
              {item}
            </button>
          ))}
        </div>

        <section className="searchHistoryPanel">
          <div className="historyHeader">
            <h2>历史搜索</h2>
            <button type="button" onClick={clearHistory} disabled={!history.length}>
              清空历史搜索记录
            </button>
          </div>
          {history.length ? (
            <div className="historyList">
              {history.map((item) => (
                <button key={item} type="button" onClick={() => runHistorySearch(item)}>
                  {item}
                </button>
              ))}
            </div>
          ) : (
            <p className="emptyState">还没有历史搜索。</p>
          )}
        </section>
      </section>

      {error ? <p className="error askError">{error}</p> : null}

      {result ? (
        <section className="askResultLayout">
          <article className="askAnswerPanel">
            <div className="answerText">
              {result.answer.split("\n").map((line, index) => renderAnswerLine(line, index))}
            </div>
          </article>

          <aside className="citationPanel">
            <div className="sectionTitle">
              <div>
                <p className="eyebrow">References</p>
                <h2>命中案例</h2>
              </div>
              <span>{result.citations.length}</span>
            </div>

            {result.citations.length ? (
              <div className="citationList">
                {result.citations.map((item, index) => (
                  <section key={item.id} className="citationCard">
                    <span className="rankBadge">#{index + 1}</span>
                    <h3>{item.title}</h3>
                    <p>{item.excerpt}</p>
                    <div className="caseMeta">
                      <span>{item.platform}</span>
                      <span>{item.brand}</span>
                      <span>{item.likes === null ? "Likes unknown" : `${item.likes.toLocaleString()} likes`}</span>
                    </div>
                    {item.url ? (
                      <a href={item.url} target="_blank" rel="noreferrer">
                        打开原帖
                      </a>
                    ) : null}
                  </section>
                ))}
              </div>
            ) : null}
          </aside>
        </section>
      ) : (
        <>
          <div id="askNativeAnswer" className="answerText" hidden />
          <div id="askNativeCitations" className="citationList" hidden />
        </>
      )}
      <script dangerouslySetInnerHTML={{ __html: nativeAskScript }} />
    </main>
  );
}

function renderAnswerLine(line: string, index: number) {
  if (!line.trim()) return <br key={index} />;
  if (line.startsWith("## ")) return <h3 key={index}>{line.replace(/^##\s*/, "")}</h3>;
  if (line.startsWith("- ")) return <p key={index} className="answerBullet">{line.replace(/^-\s*/, "")}</p>;
  return <p key={index}>{line}</p>;
}

const nativeAskScript = `
(() => {
  const historyKey = "ask-search-history";
  const form = document.querySelector(".askComposer");
  const textarea = document.getElementById("askQuestion");
  const submit = document.getElementById("askSubmit");
  const answer = document.getElementById("askNativeAnswer");
  const answerEmpty = document.getElementById("askEmptyAnswer");
  const citations = document.getElementById("askNativeCitations");
  const citationsEmpty = document.getElementById("askEmptyCitations");
  if (!form || !textarea || !submit) return;

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\\"": "&quot;",
    "'": "&#039;"
  })[char]);

  const updateSubmit = () => {
    submit.disabled = !textarea.value.trim();
  };

  const saveHistory = (value) => {
    try {
      const current = JSON.parse(window.localStorage.getItem(historyKey) || "[]");
      const next = [value, ...current.filter((item) => item !== value)].slice(0, 8);
      window.localStorage.setItem(historyKey, JSON.stringify(next));
    } catch {}
  };

  const renderAnswer = (text) => {
    if (!answer || !answerEmpty) return;
    answer.hidden = false;
    answerEmpty.hidden = true;
    answer.innerHTML = text.split("\\n").map((line) => {
      if (!line.trim()) return "<br />";
      if (line.startsWith("## ")) return "<h3>" + escapeHtml(line.replace(/^##\\s*/, "")) + "</h3>";
      if (line.startsWith("- ")) return "<p class=\\"answerBullet\\">" + escapeHtml(line.replace(/^-\\s*/, "")) + "</p>";
      return "<p>" + escapeHtml(line) + "</p>";
    }).join("");
  };

  const renderCitations = (items) => {
    if (!citations || !citationsEmpty) return;
    citations.hidden = false;
    citationsEmpty.hidden = true;
    citations.innerHTML = (items || []).map((item, index) => {
      const likes = item.likes === null || item.likes === undefined ? "Likes unknown" : Number(item.likes).toLocaleString() + " likes";
      const link = item.url ? "<a href=\\"" + escapeHtml(item.url) + "\\" target=\\"_blank\\" rel=\\"noreferrer\\">打开原帖</a>" : "";
      return "<section class=\\"citationCard\\">" +
        "<span class=\\"rankBadge\\">#" + (index + 1) + "</span>" +
        "<h3>" + escapeHtml(item.title) + "</h3>" +
        "<p>" + escapeHtml(item.excerpt) + "</p>" +
        "<div class=\\"caseMeta\\"><span>" + escapeHtml(item.platform) + "</span><span>" + escapeHtml(item.brand) + "</span><span>" + escapeHtml(likes) + "</span></div>" +
        link +
      "</section>";
    }).join("");
  };

  document.querySelectorAll("[data-suggestion]").forEach((button) => {
    button.addEventListener("click", () => {
      textarea.value = button.getAttribute("data-suggestion") || "";
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      updateSubmit();
      textarea.focus();
    });
  });

  textarea.addEventListener("input", updateSubmit);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const question = textarea.value.trim();
    if (!question) return;
    submit.disabled = true;
    submit.textContent = "Thinking...";
    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Ask 请求失败");
      renderAnswer(data.answer || "");
      renderCitations(data.citations || []);
      saveHistory(question);
    } catch (error) {
      renderAnswer("## 出错了\\n" + (error instanceof Error ? error.message : "Ask 请求失败"));
    } finally {
      submit.textContent = "Ask";
      updateSubmit();
    }
  });

  updateSubmit();
})();
`;
