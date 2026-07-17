import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import xlsx from "xlsx";
import { prisma } from "@/lib/db";
import { normalizeText } from "@/lib/import/normalizers";

const workbookPath = process.argv[2] ?? "/Users/zhongsirui/Desktop/X社媒高赞内容.xlsx";
const sheetBrandSlug: Record<string, string> = {
  anthropic: "claude",
  openai: "chatgpt",
  notion: "notion",
  perplexity: "perplexity",
  cursor: "cursor"
};

type ImageAnchor = {
  row: number;
  col: number;
  mediaPath: string;
};

async function main() {
  const workbook = xlsx.readFile(workbookPath, { cellDates: true });
  const anchorsBySheet = readImageAnchorsBySheet(workbookPath, workbook.SheetNames);
  const stats = {
    sheets: workbook.SheetNames.length,
    embeddedImages: Object.values(anchorsBySheet).reduce((sum, anchors) => sum + anchors.length, 0),
    candidates: 0,
    matched: 0,
    updatedPosts: 0,
    updatedAnalyses: 0,
    skippedNoPost: 0,
    skippedNoImage: 0
  };

  await mkdir(path.join(process.cwd(), "public", "media-cache"), { recursive: true });

  for (const sheetName of workbook.SheetNames) {
    const brandSlug = sheetBrandSlug[sheetName.toLowerCase()];
    if (!brandSlug) continue;
    const rows = xlsx.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: "" });
    const anchors = anchorsBySheet[sheetName] ?? [];

    for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex] ?? [];
      const caption = normalizeText(row[0]);
      if (!caption) continue;
      stats.candidates += 1;
      const image = pickImageForRow(anchors, rowIndex);
      if (!image) {
        stats.skippedNoImage += 1;
        continue;
      }

      const post = await findPost(brandSlug, caption, normalizeText(row[1]));
      if (!post) {
        stats.skippedNoPost += 1;
        continue;
      }
      stats.matched += 1;

      const cachePath = await writeEmbeddedImage(image.mediaPath, sheetName, rowIndex);
      if (!post.coverImageUrl) {
        await prisma.post.update({
          where: { id: post.id },
          data: { coverImageUrl: cachePath }
        });
        stats.updatedPosts += 1;
      }

      const analysis = post.case?.analyses[0] ?? null;
      if (analysis && !analysis.visualReferenceNote?.startsWith("/media-cache/")) {
        await prisma.caseAnalysis.update({
          where: { id: analysis.id },
          data: { visualReferenceNote: cachePath }
        });
        stats.updatedAnalyses += 1;
      }
    }
  }

  console.log(JSON.stringify(stats, null, 2));
  await prisma.$disconnect();
}

async function findPost(brandSlug: string, caption: string, likesRaw: string) {
  const exact = await prisma.post.findFirst({
    where: {
      platform: { slug: "x" },
      brand: { slug: brandSlug },
      captionNormalized: caption
    },
    include: {
      case: {
        include: {
          analyses: {
            where: { source: "human" },
            orderBy: { version: "desc" },
            take: 1
          }
        }
      }
    }
  });
  if (exact) return exact;

  return prisma.post.findFirst({
    where: {
      platform: { slug: "x" },
      brand: { slug: brandSlug },
      likesRaw: likesRaw || undefined,
      OR: [{ captionNormalized: { contains: caption.slice(0, 24) } }, { captionRaw: { contains: caption.slice(0, 24) } }]
    },
    include: {
      case: {
        include: {
          analyses: {
            where: { source: "human" },
            orderBy: { version: "desc" },
            take: 1
          }
        }
      }
    }
  });
}

function readImageAnchorsBySheet(filePath: string, sheetNames: string[]) {
  const result: Record<string, ImageAnchor[]> = {};
  sheetNames.forEach((sheetName, index) => {
    const sheetNumber = index + 2;
    const sheetRelsPath = `xl/worksheets/_rels/sheet${sheetNumber}.xml.rels`;
    const sheetRels = unzipText(filePath, sheetRelsPath);
    const drawingTarget = [...sheetRels.matchAll(/<Relationship[^>]+Target="([^"]+drawings\/drawing\d+\.xml)"[^>]*>/g)][0]?.[1];
    if (!drawingTarget) {
      result[sheetName] = [];
      return;
    }
    const drawingPath = `xl/${drawingTarget.replace(/^\.\.\//, "")}`;
    const drawingRelsPath = drawingPath.replace("xl/drawings/", "xl/drawings/_rels/") + ".rels";
    const drawingXml = unzipText(filePath, drawingPath);
    const drawingRels = unzipText(filePath, drawingRelsPath);
    const mediaByRel = new Map(
      [...drawingRels.matchAll(/<Relationship[^>]+Id="([^"]+)"[^>]+Target="\.\.\/media\/([^"]+)"[^>]*>/g)].map((match) => [
        match[1],
        `xl/media/${match[2]}`
      ])
    );
    result[sheetName] = [...drawingXml.matchAll(/<xdr:twoCellAnchor>.*?<xdr:from>.*?<xdr:col>(\d+)<\/xdr:col>.*?<xdr:row>(\d+)<\/xdr:row>.*?<a:blip r:embed="([^"]+)".*?<\/xdr:twoCellAnchor>/g)].flatMap(
      (match) => {
        const mediaPath = mediaByRel.get(match[3]);
        return mediaPath ? [{ col: Number(match[1]), row: Number(match[2]), mediaPath }] : [];
      }
    );
  });
  return result;
}

function pickImageForRow(anchors: ImageAnchor[], rowIndex: number) {
  return anchors
    .filter((anchor) => anchor.row === rowIndex && anchor.col >= 5)
    .sort((a, b) => a.col - b.col)[0] ?? null;
}

async function writeEmbeddedImage(mediaPath: string, sheetName: string, rowIndex: number) {
  const bytes = execFileSync("unzip", ["-p", workbookPath, mediaPath], { maxBuffer: 50 * 1024 * 1024 });
  const extension = imageExtension(bytes) ?? mediaPath.match(/\.([a-z0-9]+)$/i)?.[1]?.replace("jpeg", "jpg") ?? "jpg";
  const key = createHash("sha256").update(`${sheetName}:${rowIndex}:${mediaPath}`).digest("hex").slice(0, 32);
  const cachePath = `/media-cache/x-excel-${key}.${extension}`;
  await writeFile(path.join(process.cwd(), "public", cachePath), bytes);
  return cachePath;
}

function imageExtension(bytes: Buffer) {
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "jpg";
  if (bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
  if (bytes.subarray(0, 6).toString("ascii").startsWith("GIF")) return "gif";
  return null;
}

function unzipText(filePath: string, entryPath: string) {
  return execFileSync("unzip", ["-p", filePath, entryPath], { encoding: "utf8" });
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
