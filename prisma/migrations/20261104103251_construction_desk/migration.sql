-- CreateEnum
CREATE TYPE "ChangeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'APPLYING', 'APPLIED', 'FAILED', 'STALE');

-- CreateTable
CREATE TABLE "AgentKey" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "AgentKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeRequest" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "requestText" TEXT NOT NULL DEFAULT '',
    "requestedVia" TEXT NOT NULL,
    "roomRef" TEXT,
    "agentKeyId" TEXT,
    "idempotencyKey" TEXT,
    "baseVersionId" TEXT NOT NULL,
    "comparison" JSONB NOT NULL,
    "status" "ChangeStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "appliedVersionId" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentKey_keyHash_key" ON "AgentKey"("keyHash");

-- CreateIndex
CREATE INDEX "AgentKey_projectId_idx" ON "AgentKey"("projectId");

-- CreateIndex
CREATE INDEX "ChangeRequest_projectId_createdAt_idx" ON "ChangeRequest"("projectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChangeRequest_projectId_idempotencyKey_key" ON "ChangeRequest"("projectId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "AgentKey" ADD CONSTRAINT "AgentKey_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
