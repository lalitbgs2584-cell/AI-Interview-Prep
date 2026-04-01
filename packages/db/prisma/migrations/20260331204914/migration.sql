-- AlterTable
ALTER TABLE "evaluation" ADD COLUMN     "evidenceSnippets" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "responseAnalyticsMetrics" JSONB,
ADD COLUMN     "scorePillars" JSONB,
ADD COLUMN     "whyScoreNotHigher" TEXT;

-- AlterTable
ALTER TABLE "interview_question" ADD COLUMN     "refereceAnswer" TEXT;

-- AlterTable
ALTER TABLE "interview_summary" ADD COLUMN     "contentQuality" TEXT,
ADD COLUMN     "deliveryQuality" TEXT,
ADD COLUMN     "endReason" TEXT,
ADD COLUMN     "interruptionCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "interviewIntegrity" TEXT,
ADD COLUMN     "isEarlyExit" BOOLEAN NOT NULL DEFAULT false;
