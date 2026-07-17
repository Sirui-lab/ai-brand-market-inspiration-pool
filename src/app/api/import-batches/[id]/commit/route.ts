import { NextResponse } from "next/server";
import { commitImportBatch } from "@/lib/import/import-service";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return NextResponse.json(await commitImportBatch(id));
  } catch (error) {
    console.error("Failed to commit import batch", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "确认入库失败"
      },
      { status: 500 }
    );
  }
}
