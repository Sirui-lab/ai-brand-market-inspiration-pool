import { mkdir, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const databasePath = sqlitePathFromDatabaseUrl(process.env.DATABASE_URL);
const mediaCacheDir = process.env.MEDIA_CACHE_DIR;

if (databasePath) {
  await mkdir(path.dirname(databasePath), { recursive: true });
  if (!(await exists(databasePath))) {
    const prismaBin = path.join(process.cwd(), "node_modules", ".bin", "prisma");
    const result = spawnSync(prismaBin, ["db", "push", "--skip-generate"], {
      stdio: "inherit",
      env: process.env
    });
    if (result.status !== 0) {
      throw new Error(`Failed to initialize SQLite database at ${databasePath}`);
    }
  }
}

if (mediaCacheDir) {
  await mkdir(mediaCacheDir, { recursive: true });
}

function sqlitePathFromDatabaseUrl(value) {
  if (!value?.startsWith("file:")) return null;
  const rawPath = value.slice("file:".length);
  if (!rawPath || rawPath.startsWith("./")) return null;
  return path.resolve(rawPath);
}

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}
