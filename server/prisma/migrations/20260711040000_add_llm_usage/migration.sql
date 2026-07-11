-- CreateTable
CREATE TABLE "llm_usage" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER,
    "workspaceId" INTEGER,
    "threadId" INTEGER,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "requestType" TEXT NOT NULL DEFAULT 'chat',
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" REAL,
    "durationMs" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "llm_usage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "llm_usage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "llm_usage_userId_createdAt_idx" ON "llm_usage"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "llm_usage_workspaceId_createdAt_idx" ON "llm_usage"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "llm_usage_model_createdAt_idx" ON "llm_usage"("model", "createdAt");

-- CreateIndex
CREATE INDEX "llm_usage_createdAt_idx" ON "llm_usage"("createdAt");
