CREATE TABLE "user_token_usage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "tokensUsed" INTEGER NOT NULL DEFAULT 0,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_token_usage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "job_failure" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "queue" TEXT NOT NULL,
    "userId" TEXT,
    "reason" TEXT,
    "failedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "job_failure_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_token_usage_userId_date_model_key" ON "user_token_usage"("userId", "date", "model");
CREATE INDEX "user_token_usage_userId_date_idx" ON "user_token_usage"("userId", "date");
CREATE INDEX "job_failure_queue_failedAt_idx" ON "job_failure"("queue", "failedAt");
CREATE INDEX "job_failure_userId_failedAt_idx" ON "job_failure"("userId", "failedAt");

ALTER TABLE "user_token_usage"
ADD CONSTRAINT "user_token_usage_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
