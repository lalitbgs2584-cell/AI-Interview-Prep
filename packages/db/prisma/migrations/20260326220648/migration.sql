/*
  Warnings:

  - You are about to drop the column `confidenceScore` on the `evaluation` table. All the data in the column will be lost.
  - The `strengths` column on the `evaluation` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "evaluation" DROP COLUMN "confidenceScore",
ADD COLUMN     "dimensions" JSONB,
ADD COLUMN     "followup" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "followupQuestion" TEXT,
ADD COLUMN     "incorrectPoints" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "missingConcepts" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "overallScore100" INTEGER,
ADD COLUMN     "verdict" TEXT,
ADD COLUMN     "weaknesses" TEXT[] DEFAULT ARRAY[]::TEXT[],
ALTER COLUMN "confidence" SET DATA TYPE DOUBLE PRECISION,
DROP COLUMN "strengths",
ADD COLUMN     "strengths" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "interview_question" ADD COLUMN     "expectedAnswer" JSONB;

-- AlterTable
ALTER TABLE "question" ADD COLUMN     "expectedAnswer" JSONB;

-- AlterTable
ALTER TABLE "response" ADD COLUMN     "userAnswer" TEXT;

-- CreateTable
CREATE TABLE "gap_report" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conceptFrequency" JSONB NOT NULL DEFAULT '{}',
    "persistentGaps" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dimensionAverages" JSONB NOT NULL DEFAULT '{}',
    "lastUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gap_report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_summary" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "overallScore" INTEGER NOT NULL DEFAULT 0,
    "plainAvg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "weightedAvg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "recommendation" TEXT NOT NULL DEFAULT 'Needs More Evaluation',
    "durationSeconds" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT,
    "whatWentRight" JSONB NOT NULL DEFAULT '[]',
    "whatWentWrong" JSONB NOT NULL DEFAULT '[]',
    "tips" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "skillScores" JSONB NOT NULL DEFAULT '{}',
    "questionScores" JSONB NOT NULL DEFAULT '[]',
    "gapAnalysis" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_summary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gap_report_userId_idx" ON "gap_report"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "gap_report_userId_key" ON "gap_report"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "interview_summary_interviewId_key" ON "interview_summary"("interviewId");

-- CreateIndex
CREATE INDEX "interview_summary_interviewId_idx" ON "interview_summary"("interviewId");

-- AddForeignKey
ALTER TABLE "gap_report" ADD CONSTRAINT "gap_report_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_summary" ADD CONSTRAINT "interview_summary_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
