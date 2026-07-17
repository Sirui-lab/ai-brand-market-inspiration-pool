import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ensureBaselineData } from "@/lib/seed";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await ensureBaselineData();
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get("platform");
    const brand = searchParams.get("brand");
    const keyword = searchParams.get("keyword");

    const posts = await prisma.post.findMany({
      where: {
        platform: platform ? { slug: platform } : undefined,
        brand: brand ? { slug: brand } : undefined,
        OR: keyword
          ? [
              { captionNormalized: { contains: keyword } },
              {
                case: {
                  analyses: {
                    some: {
                      OR: [
                        { postStructureAnalysis: { contains: keyword } },
                        { postContentAnalysis: { contains: keyword } },
                        { visualDesignAnalysis: { contains: keyword } }
                      ]
                    }
                  }
                }
              }
            ]
          : undefined
      },
      include: {
        platform: true,
        brand: true,
        case: {
          include: {
            analyses: {
              orderBy: [{ source: "asc" }, { version: "desc" }]
            }
          }
        }
      },
      orderBy: [{ likesCount: "desc" }, { createdAt: "desc" }],
      take: 100
    });

    return NextResponse.json(posts);
  } catch (error) {
    console.error("Failed to load posts", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Local Inspiration Library 加载失败" },
      { status: 500 }
    );
  }
}
