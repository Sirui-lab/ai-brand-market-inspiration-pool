import { readFileSync } from "node:fs";
import { prisma } from "../src/lib/db";
import { createImportPreview, commitImportBatch } from "../src/lib/import/import-service";

const file = process.argv[2] ?? "/Users/zhongsirui/Downloads/Instagram 社媒高赞内容.xlsx";
const platform = process.argv[3] ?? "instagram";

async function main() {
  const preview = await createImportPreview({
    platformSlug: platform,
    fileName: file.split("/").pop() ?? "sample.xlsx",
    buffer: readFileSync(file)
  });

  console.log("preview", {
    id: preview.id,
    totalRows: preview.totalRows,
    successCount: preview.successCount,
    warningCount: preview.warningCount,
    failedCount: preview.failedCount,
    duplicateCount: preview.duplicateCount
  });

  const committed = await commitImportBatch(preview.id);
  const postCount = await prisma.post.count();
  const caseCount = await prisma.case.count();
  const analysisCount = await prisma.caseAnalysis.count({ where: { source: "human" } });

  console.log("committed", {
    id: committed.id,
    status: committed.status,
    postCount,
    caseCount,
    humanAnalysisCount: analysisCount
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
