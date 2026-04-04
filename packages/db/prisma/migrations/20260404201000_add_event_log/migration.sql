CREATE TABLE "event_log" (
    "id" TEXT NOT NULL,
    "traceId" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'info',
    "userId" TEXT,
    "interviewId" TEXT,
    "fileId" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "event_log_traceId_createdAt_idx" ON "event_log"("traceId", "createdAt");
CREATE INDEX "event_log_service_stage_createdAt_idx" ON "event_log"("service", "stage", "createdAt");
CREATE INDEX "event_log_userId_createdAt_idx" ON "event_log"("userId", "createdAt");
CREATE INDEX "event_log_interviewId_createdAt_idx" ON "event_log"("interviewId", "createdAt");

ALTER TABLE "event_log"
ADD CONSTRAINT "event_log_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
