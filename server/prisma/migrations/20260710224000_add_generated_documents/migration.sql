-- CreateTable
CREATE TABLE "generated_documents" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "storageFilename" TEXT NOT NULL,
    "displayFilename" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "docType" TEXT,
    "workspaceId" INTEGER NOT NULL,
    "threadId" INTEGER,
    "userId" INTEGER,
    "chatId" INTEGER,
    "title" TEXT,
    "fileSize" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME,
    CONSTRAINT "generated_documents_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "generated_documents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "generated_documents_storageFilename_key" ON "generated_documents"("storageFilename");

-- CreateIndex
CREATE INDEX "generated_documents_workspaceId_fileType_idx" ON "generated_documents"("workspaceId", "fileType");

-- CreateIndex
CREATE INDEX "generated_documents_workspaceId_docType_idx" ON "generated_documents"("workspaceId", "docType");

-- CreateIndex
CREATE INDEX "generated_documents_userId_idx" ON "generated_documents"("userId");

-- CreateIndex
CREATE INDEX "generated_documents_createdAt_idx" ON "generated_documents"("createdAt");
