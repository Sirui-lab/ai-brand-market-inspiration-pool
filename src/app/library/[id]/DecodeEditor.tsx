"use client";

import { useState } from "react";

type DecodeEditorProps = {
  caseId: string;
  captionRaw: string;
  likesRaw: string | null;
  visualReferenceNote: string | null;
  initialStructure: string | null;
  initialContent: string | null;
  initialVisual: string | null;
};

export function DecodeEditor({
  caseId,
  captionRaw,
  likesRaw,
  visualReferenceNote,
  initialStructure,
  initialContent,
  initialVisual
}: DecodeEditorProps) {
  const [editing, setEditing] = useState(false);
  const [structure, setStructure] = useState(initialStructure ?? "");
  const [content, setContent] = useState(initialContent ?? "");
  const [visual, setVisual] = useState(initialVisual ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setMessage(null);
    setError(null);
    const response = await fetch(`/api/cases/${caseId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        captionRaw,
        postStructureAnalysis: structure,
        postContentAnalysis: content,
        visualDesignAnalysis: visual,
        visualReferenceNote: visualReferenceNote ?? ""
      })
    });
    const data = await safeJson(response);
    setSaving(false);
    if (!response.ok) {
      setError(data.error ?? "保存失败");
      return;
    }
    setEditing(false);
    setMessage("已保存人工编辑版本。");
  }

  return (
    <section className="decodeSection">
      <div className="decodeHeader">
        <h2>创意解码</h2>
        <button className="secondaryAction" type="button" onClick={() => setEditing((value) => !value)}>
          {editing ? "取消编辑" : "人工编辑"}
        </button>
      </div>

      {editing ? (
        <div className="decodeEditGrid">
          <DecodeEditField title="内容" value={content} onChange={setContent} />
          <DecodeEditField title="结构" value={structure} onChange={setStructure} />
          <DecodeEditField title="视觉效果" value={visual} onChange={setVisual} />
          <div className="decodeEditActions">
            <button type="button" disabled={saving} onClick={save}>
              {saving ? "保存中..." : "保存人工编辑"}
            </button>
          </div>
        </div>
      ) : (
        <div className="decodeGrid">
          <DecodeBlock title="内容" text={content} />
          <DecodeBlock title="结构" text={structure} />
          <DecodeBlock title="视觉效果" text={visual} />
        </div>
      )}

      {message ? <p className="successText">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}

function DecodeBlock({ title, text }: { title: string; text?: string | null }) {
  const lines = formatDecodeLines(text);
  return (
    <article className="decodeBlock">
      <h3>{title}</h3>
      {lines.length ? (
        <div>
          {lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      ) : (
        <p>暂无</p>
      )}
    </article>
  );
}

function DecodeEditField({
  title,
  value,
  onChange
}: {
  title: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="decodeEditField">
      <span>{title}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function formatDecodeLines(value?: string | null) {
  return (value ?? "")
    .split(/\n+|(?=\d+[.、）)])|(?=•)/)
    .map((line) => line.replace(/\s+/g, " ").trim().replace(/^•\s*/, ""))
    .filter(Boolean);
}

async function safeJson(response: Response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: text };
  }
}
