export type HeaderMap = {
  postType?: string;
  caption?: string;
  likes?: string;
  structure?: string;
  content?: string;
  visual?: string;
  extra?: string;
  visualReference?: string;
  publishDate?: string;
  sourceUrl?: string;
};

const HEADER_ALIASES: Record<keyof HeaderMap, string[]> = {
  postType: ["post类别", "post type", "类型"],
  caption: ["post内容", "内容", "caption"],
  likes: ["点赞量", "likes"],
  structure: ["爆款原因分析-post结构", "post structure", "结构"],
  content: ["爆款原因分析-post内容", "post content", "内容分析"],
  visual: ["爆款原因分析-post视觉效果", "visual design", "视觉分析"],
  extra: ["爆款原因分析-其他因素", "其他因素"],
  visualReference: [
    "主视觉参考",
    "visual reference",
    "图片",
    "图片链接",
    "配图",
    "封面",
    "封面图",
    "封面链接",
    "image",
    "image url",
    "cover",
    "cover url",
    "media url",
    "thumbnail",
    "thumbnail url"
  ],
  publishDate: ["发布时间", "publish date", "date"],
  sourceUrl: ["原帖链接", "source url", "url", "link"]
};

function cleanHeader(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, "");
}

export function buildHeaderMap(headers: unknown[]): HeaderMap {
  const result: HeaderMap = {};
  headers.forEach((header) => {
    const cleaned = cleanHeader(header);
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.map(cleanHeader).includes(cleaned)) {
        result[field as keyof HeaderMap] = String(header ?? "");
      }
    }
  });
  return result;
}

export function columnName(index: number): string {
  let n = index + 1;
  let name = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}
