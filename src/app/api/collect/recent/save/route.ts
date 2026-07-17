import { NextResponse } from "next/server";
import { resolveBrandSlug } from "@/lib/brand-config";
import { saveRecentPost } from "@/lib/collect/recent-post-save";
import type { RecentPost } from "@/lib/collect/recent-post-fetcher";
import { ensureBaselineData } from "@/lib/seed";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await ensureBaselineData();
    const body = await request.json();
    const post = body.post as RecentPost | undefined;
    const brandSlug = body.brandSlug ? String(body.brandSlug) : resolveBrandSlug(String(post?.author ?? ""));

    if (!post?.url || !post.platformSlug || !post.id) {
      return NextResponse.json({ error: "缺少待保存的帖子信息" }, { status: 400 });
    }

    const result = await saveRecentPost(post, brandSlug);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "加入 Local Inspiration Library 失败" },
      { status: 500 }
    );
  }
}
