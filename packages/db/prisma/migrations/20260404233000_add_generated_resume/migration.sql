CREATE TABLE "generated_resume" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "latexCode" TEXT NOT NULL,
  "atsScore" INTEGER NOT NULL DEFAULT 0,
  "targetRole" TEXT,
  "jobDescription" TEXT,
  "atsBreakdown" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "sourceData" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "generated_resume_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "generated_resume_userId_updatedAt_idx"
ON "generated_resume"("userId", "updatedAt");

ALTER TABLE "generated_resume"
ADD CONSTRAINT "generated_resume_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "user"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
