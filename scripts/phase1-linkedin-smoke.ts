import * as XLSX from "xlsx";
import { parseWorkbook } from "../src/lib/import/workbook-parser";

const workbook = XLSX.utils.book_new();
const sheet = XLSX.utils.aoa_to_sheet([
  [
    "post内容",
    "点赞量",
    "爆款原因分析-post结构",
    "爆款原因分析-post内容",
    "爆款原因分析-post视觉效果",
    "主视觉参考",
    "原帖链接"
  ],
  [
    "A concise LinkedIn launch post about a new AI workspace.",
    "8k+",
    "Hook first, then product moment, then CTA.",
    "Clear feature value and practical use case.",
    "Clean product screenshot with short overlay text.",
    "Product UI screenshot",
    "https://www.linkedin.com/feed/update/urn:li:activity:1234567890/"
  ]
]);

XLSX.utils.book_append_sheet(workbook, sheet, "Notion");

const buffer = Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
const preview = parseWorkbook(buffer, { platformSlug: "linkedin" });
const [row] = preview.rows;

if (!row) {
  throw new Error("Expected one parsed LinkedIn row");
}

if (row.brandSlug !== "notion") {
  throw new Error(`Expected Notion brand, got ${row.brandSlug}`);
}

if (row.normalizedData.likesCount !== 8000) {
  throw new Error(`Expected likesCount 8000, got ${row.normalizedData.likesCount}`);
}

if (row.normalizedData.publishDate !== null) {
  throw new Error("Expected empty LinkedIn publishDate");
}

if (row.warnings.includes("发布时间为空")) {
  throw new Error("LinkedIn should allow missing publish date");
}

if (!row.normalizedData.postStructureAnalysis || !row.normalizedData.postContentAnalysis || !row.normalizedData.visualDesignAnalysis) {
  throw new Error("Expected all three LinkedIn analysis fields");
}

console.log("LinkedIn parser smoke passed");
