import { NextResponse } from "next/server";
import { getImportBatch } from "@/lib/import/import-service";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return NextResponse.json(await getImportBatch(id));
}
