type LocalAnalysisInput = {
  caption: string;
  platform: string;
  brand: string;
  url?: string | null;
  likesCount?: number | null;
  publishedAt?: string | Date | null;
  visualReferenceNote?: string | null;
  rawContext?: unknown;
};

export function buildLocalCaseAnalysis(input: LocalAnalysisInput) {
  const caption = compact(input.caption);
  const format = inferFormat(caption, input.url);
  const hooks = inferHooks(caption);
  const contentAngles = inferContentAngles(caption);
  const visualSignals = inferVisualSignals(caption, input.url, input.visualReferenceNote);
  const engagement = input.likesCount ? `当前已记录 ${input.likesCount.toLocaleString()} likes，可作为优先复盘样本。` : "暂未记录 likes 数据，可结合互动表现继续判断强弱。";

  return {
    status: "partial" as const,
    postStructureAnalysis: [
      `开头以${hooks.primary}切入，适合在信息流里快速建立注意力。`,
      `主体更像${format}：先给用户一个明确场景，再让品牌能力自然进入，而不是直接做功能说明。`,
      `如果要复用，结构可以抽象为：场景/冲突 -> AI 能力介入 -> 可尝试的结果或讨论点。`
    ].join("\n"),
    postContentAnalysis: [
      `${input.brand} 这条内容的高赞潜力主要来自${contentAngles.join("、")}。`,
      `${engagement}`,
      `对内容团队的启发是：不要只讲功能点，要把功能翻译成用户愿意转发、评论或立刻尝试的具体情境。`
    ].join("\n"),
    visualDesignAnalysis: [
      `视觉上可按${visualSignals.primary}来理解：让用户先看懂结果，再理解产品能力。`,
      visualSignals.secondary,
      `结合原图或视频截图，可以继续拆解构图、字幕、封面文字和品牌露出的强弱。`
    ].join("\n"),
    visualReferenceNote: input.visualReferenceNote ?? null,
    rawAnalysisJson: JSON.stringify({
      generatedBy: "local_case_analysis",
      confidence: "heuristic_draft",
      input: {
        platform: input.platform,
        brand: input.brand,
        url: input.url,
        likesCount: input.likesCount,
        publishedAt: input.publishedAt,
        rawContext: input.rawContext
      }
    })
  };
}

function inferFormat(caption: string, url?: string | null) {
  const lower = caption.toLowerCase();
  if (url?.includes("/reel/") || lower.includes("video") || lower.includes("视频")) return "短视频/动态演示型内容";
  if (lower.includes("prompt") || lower.includes("教程") || lower.includes("how to")) return "可复制教程型内容";
  if (lower.includes("launch") || lower.includes("发布") || lower.includes("new")) return "产品发布型内容";
  if (lower.includes("meme") || lower.includes("梗")) return "社交梗/轻互动型内容";
  return "场景化案例型内容";
}

function inferHooks(caption: string) {
  const lower = caption.toLowerCase();
  if (lower.includes("what do you think") || lower.includes("你怎么看")) return { primary: "开放式提问" };
  if (lower.includes("prompt")) return { primary: "可复制 prompt" };
  if (lower.includes("before") || lower.includes("after") || lower.includes("对比")) return { primary: "前后对比" };
  if (lower.includes("launch") || lower.includes("发布") || lower.includes("new")) return { primary: "新品/新能力发布" };
  return { primary: "具体用户场景" };
}

function inferContentAngles(caption: string) {
  const lower = caption.toLowerCase();
  const angles = [
    lower.includes("prompt") ? "低门槛可复用" : null,
    lower.includes("what do you think") || lower.includes("评论") ? "评论互动引导" : null,
    lower.includes("photo") || lower.includes("image") || lower.includes("图片") || lower.includes("照片") ? "强结果展示" : null,
    lower.includes("baby") || lower.includes("family") || lower.includes("童年") || lower.includes("父母") ? "情绪共鸣" : null,
    lower.includes("launch") || lower.includes("new") || lower.includes("发布") ? "产品新鲜感" : null,
    lower.includes("tutorial") || lower.includes("how to") || lower.includes("教程") ? "学习价值" : null
  ].filter((item): item is string => Boolean(item));

  return angles.length ? angles.slice(0, 3) : ["场景明确", "理解成本低", "用户容易代入"];
}

function inferVisualSignals(caption: string, url?: string | null, visualReferenceNote?: string | null) {
  const lower = caption.toLowerCase();
  if (url?.includes("/reel/")) {
    return {
      primary: "动态结果演示",
      secondary: "这类内容需要在前几秒给出清晰变化或结果，否则用户很难停留。"
    };
  }
  if (visualReferenceNote) {
    return {
      primary: "封面/预览图承载第一信息",
      secondary: "当前已保存视觉参考链接，可在 Review 中进一步补充画面结构。"
    };
  }
  if (lower.includes("photo") || lower.includes("image") || lower.includes("图片") || lower.includes("照片")) {
    return {
      primary: "结果图驱动",
      secondary: "重点应放在结果是否一眼可懂、是否有分享欲，而不是复杂解释。"
    };
  }
  return {
    primary: "信息清晰优先",
    secondary: "目前缺少完整视觉素材，先按文案和链接判断视觉策略。"
  };
}

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}
