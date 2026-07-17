from pathlib import Path
import sqlite3

db_path = Path("prisma/dev.db")
db_path.parent.mkdir(parents=True, exist_ok=True)

schema = """
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS Brand (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  displayName TEXT NOT NULL,
  aliasesJson TEXT NOT NULL,
  isActive BOOLEAN NOT NULL DEFAULT 1,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Platform (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  displayName TEXT NOT NULL,
  isActive BOOLEAN NOT NULL DEFAULT 1,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS SocialAccount (
  id TEXT PRIMARY KEY,
  brandId TEXT NOT NULL,
  platformId TEXT NOT NULL,
  handle TEXT NOT NULL,
  profileUrl TEXT,
  isActive BOOLEAN NOT NULL DEFAULT 1,
  crawlEnabled BOOLEAN NOT NULL DEFAULT 0,
  displayOrder INTEGER NOT NULL DEFAULT 0,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (brandId) REFERENCES Brand(id),
  FOREIGN KEY (platformId) REFERENCES Platform(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS SocialAccount_platformId_handle_key ON SocialAccount(platformId, handle);

CREATE TABLE IF NOT EXISTS ImportBatch (
  id TEXT PRIMARY KEY,
  platformId TEXT NOT NULL,
  sourceFileName TEXT NOT NULL,
  sourceFileHash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'uploaded',
  totalRows INTEGER NOT NULL DEFAULT 0,
  successCount INTEGER NOT NULL DEFAULT 0,
  warningCount INTEGER NOT NULL DEFAULT 0,
  failedCount INTEGER NOT NULL DEFAULT 0,
  duplicateCount INTEGER NOT NULL DEFAULT 0,
  committedAt DATETIME,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (platformId) REFERENCES Platform(id)
);

CREATE TABLE IF NOT EXISTS ImportBatchItem (
  id TEXT PRIMARY KEY,
  importBatchId TEXT NOT NULL,
  sheetName TEXT NOT NULL,
  sourceRowNumber INTEGER NOT NULL,
  brandId TEXT,
  status TEXT NOT NULL,
  rawDataJson TEXT NOT NULL,
  normalizedDataJson TEXT NOT NULL,
  warningsJson TEXT NOT NULL,
  errorsJson TEXT NOT NULL,
  duplicatePostId TEXT,
  createdPostId TEXT,
  createdCaseId TEXT,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (importBatchId) REFERENCES ImportBatch(id),
  FOREIGN KEY (brandId) REFERENCES Brand(id)
);

CREATE TABLE IF NOT EXISTS Post (
  id TEXT PRIMARY KEY,
  platformId TEXT NOT NULL,
  brandId TEXT NOT NULL,
  socialAccountId TEXT,
  sourceType TEXT NOT NULL DEFAULT 'manual_import',
  sourceRecordId TEXT NOT NULL,
  importBatchId TEXT,
  externalPostId TEXT,
  canonicalUrl TEXT UNIQUE,
  sourceUrl TEXT,
  postTypeLabel TEXT,
  captionRaw TEXT NOT NULL,
  captionNormalized TEXT NOT NULL,
  publishDate DATETIME,
  likesCount INTEGER,
  likesRaw TEXT,
  likesCapturedAt DATETIME,
  coverImageUrl TEXT,
  dataStatus TEXT NOT NULL DEFAULT 'partial',
  reviewStatus TEXT NOT NULL DEFAULT 'imported',
  contentFingerprint TEXT NOT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (platformId) REFERENCES Platform(id),
  FOREIGN KEY (brandId) REFERENCES Brand(id),
  FOREIGN KEY (socialAccountId) REFERENCES SocialAccount(id),
  FOREIGN KEY (importBatchId) REFERENCES ImportBatch(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS Post_platformId_externalPostId_key ON Post(platformId, externalPostId);
CREATE INDEX IF NOT EXISTS Post_platformId_brandId_idx ON Post(platformId, brandId);
CREATE INDEX IF NOT EXISTS Post_contentFingerprint_idx ON Post(contentFingerprint);

CREATE TABLE IF NOT EXISTS "Case" (
  id TEXT PRIMARY KEY,
  postId TEXT NOT NULL UNIQUE,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (postId) REFERENCES Post(id)
);

CREATE TABLE IF NOT EXISTS CaseAnalysis (
  id TEXT PRIMARY KEY,
  caseId TEXT NOT NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  postStructureAnalysis TEXT,
  postContentAnalysis TEXT,
  visualDesignAnalysis TEXT,
  importedExtraAnalysis TEXT,
  visualReferenceNote TEXT,
  rawAnalysisJson TEXT NOT NULL,
  isHumanConfirmed BOOLEAN NOT NULL DEFAULT 0,
  analyzedBy TEXT,
  analyzedAt DATETIME,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (caseId) REFERENCES "Case"(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS CaseAnalysis_caseId_source_version_key ON CaseAnalysis(caseId, source, version);
"""

with sqlite3.connect(db_path) as conn:
  conn.executescript(schema)

print(f"Initialized {db_path}")
