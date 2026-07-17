import { NextResponse } from "next/server";
import { fetchRecentPosts } from "@/lib/collect/recent-post-fetcher";
import { ensureBaselineData } from "@/lib/seed";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await ensureBaselineData();
    const body = await request.json();
    const platformSlug = String(body.platformSlug ?? "");
    const sourceId = String(body.sourceId ?? "");
    const result = await fetchRecentPosts(platformSlug, sourceId);
    const status = result.status === "failed" ? 400 : 200;
    return NextResponse.json(result, { status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "抓取最近一周帖子失败" },
      { status: 500 }
    );
  }
}
