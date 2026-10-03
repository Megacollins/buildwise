-- CreateEnum
CREATE TYPE "MeasurementSystem" AS ENUM ('metric', 'imperial');

-- CreateEnum
CREATE TYPE "DesignStage" AS ENUM ('CONCEPT', 'DETAILED_DESIGN', 'PROFESSIONALLY_REVIEWED', 'CONSTRUCTION_DOCUMENTATION');

-- CreateEnum
CREATE TYPE "DataStatus" AS ENUM ('sample', 'partner_supplied', 'verified');

-- CreateEnum
CREATE TYPE "ProfessionalCategory" AS ENUM ('ARCHITECT', 'STRUCTURAL_ENGINEER', 'MEP_ENGINEER', 'QUANTITY_SURVEYOR', 'CONTRACTOR', 'INTERIOR_DESIGNER', 'BUILDER');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('REQUESTED', 'IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "measurementSystem" "MeasurementSystem" NOT NULL DEFAULT 'metric',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Region" (
    "id" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "subdivision" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "measurementSystem" "MeasurementSystem" NOT NULL,
    "locale" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "dataStatus" "DataStatus" NOT NULL DEFAULT 'sample',
    "dataAsOf" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Region_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "budgetTarget" DECIMAL(18,2),
    "budgetMin" DECIMAL(18,2),
    "budgetMax" DECIMAL(18,2),
    "requirements" JSONB NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "stage" "DesignStage" NOT NULL DEFAULT 'CONCEPT',
    "isSample" BOOLEAN NOT NULL DEFAULT false,
    "currentVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Site" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "subdivision" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "addressLine" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "plotWidthMm" INTEGER NOT NULL,
    "plotDepthMm" INTEGER NOT NULL,
    "northAngleDeg" INTEGER NOT NULL DEFAULT 0,
    "irregular" BOOLEAN NOT NULL DEFAULT false,
    "surveyFileKey" TEXT,

    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DesignVersion" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "parentId" TEXT,
    "model" JSONB NOT NULL,
    "modelSchemaVersion" INTEGER NOT NULL,
    "estimate" JSONB NOT NULL,
    "costEngineVersion" TEXT NOT NULL,
    "estimateLow" DECIMAL(18,2) NOT NULL,
    "estimateHigh" DECIMAL(18,2) NOT NULL,
    "grossFloorAreaM2" DOUBLE PRECISION NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DesignVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "roughness" DOUBLE PRECISION,
    "supplier" TEXT,
    "environmental" TEXT,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialPrice" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "priceLow" DECIMAL(18,2) NOT NULL,
    "priceHigh" DECIMAL(18,2) NOT NULL,
    "availability" TEXT NOT NULL,
    "dataStatus" "DataStatus" NOT NULL DEFAULT 'sample',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Professional" (
    "id" TEXT NOT NULL,
    "category" "ProfessionalCategory" NOT NULL,
    "name" TEXT NOT NULL,
    "regionId" TEXT,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "licenceNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Professional_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewRequest" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "category" "ProfessionalCategory" NOT NULL,
    "versionId" TEXT NOT NULL,
    "message" TEXT NOT NULL DEFAULT '',
    "status" "ReviewStatus" NOT NULL DEFAULT 'REQUESTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "versionId" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "fileKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Region_countryCode_idx" ON "Region"("countryCode");

-- CreateIndex
CREATE UNIQUE INDEX "Project_currentVersionId_key" ON "Project"("currentVersionId");

-- CreateIndex
CREATE INDEX "Project_ownerId_updatedAt_idx" ON "Project"("ownerId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Site_projectId_key" ON "Site"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "DesignVersion_projectId_number_key" ON "DesignVersion"("projectId", "number");

-- CreateIndex
CREATE INDEX "Material_category_idx" ON "Material"("category");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialPrice_materialId_regionId_key" ON "MaterialPrice"("materialId", "regionId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "DesignVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Site" ADD CONSTRAINT "Site_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignVersion" ADD CONSTRAINT "DesignVersion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignVersion" ADD CONSTRAINT "DesignVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialPrice" ADD CONSTRAINT "MaterialPrice_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialPrice" ADD CONSTRAINT "MaterialPrice_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Professional" ADD CONSTRAINT "Professional_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewRequest" ADD CONSTRAINT "ReviewRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewRequest" ADD CONSTRAINT "ReviewRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
