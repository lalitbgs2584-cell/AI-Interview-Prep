/*
  Warnings:

  - The values [PREMIUM] on the enum `SubscriptionPlan` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `score` on the `evaluation` table. All the data in the column will be lost.
  - The `difficulty` column on the `question` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `type` column on the `question` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "InterviewStatus" AS ENUM ('CREATED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InterviewType" AS ENUM ('TECHNICAL', 'HR', 'SYSTEM_DESIGN', 'BEHAVIORAL');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('CREATED', 'PAID', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('CREATED', 'ACTIVE', 'CANCELLED', 'PAST_DUE');

-- AlterEnum
BEGIN;
CREATE TYPE "SubscriptionPlan_new" AS ENUM ('FREE', 'STARTER', 'PRO', 'ENTERPRISE');
ALTER TABLE "public"."user" ALTER COLUMN "plan" DROP DEFAULT;
ALTER TABLE "user" ALTER COLUMN "plan" TYPE "SubscriptionPlan_new" USING ("plan"::text::"SubscriptionPlan_new");
ALTER TYPE "SubscriptionPlan" RENAME TO "SubscriptionPlan_old";
ALTER TYPE "SubscriptionPlan_new" RENAME TO "SubscriptionPlan";
DROP TYPE "public"."SubscriptionPlan_old";
ALTER TABLE "user" ALTER COLUMN "plan" SET DEFAULT 'FREE';
COMMIT;

-- AlterTable
ALTER TABLE "evaluation" DROP COLUMN "score",
ADD COLUMN     "overallScore" INTEGER;

-- AlterTable
ALTER TABLE "interview" ADD COLUMN     "status" "InterviewStatus" NOT NULL DEFAULT 'CREATED',
ADD COLUMN     "type" "InterviewType" NOT NULL DEFAULT 'TECHNICAL';

-- AlterTable
ALTER TABLE "question" DROP COLUMN "difficulty",
ADD COLUMN     "difficulty" "Difficulty",
DROP COLUMN "type",
ADD COLUMN     "type" "InterviewType";

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isResumeUploaded" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "resumeFileName" TEXT,
ADD COLUMN     "resumeUploadedAt" TIMESTAMP(3),
ADD COLUMN     "resumeUrl" TEXT;

-- CreateTable
CREATE TABLE "subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "razorpayCustomerId" TEXT,
    "razorpaySubscriptionId" TEXT,
    "razorpayPlanId" TEXT,
    "status" "SubscriptionStatus",
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "razorpayOrderId" TEXT,
    "razorpayPaymentId" TEXT,
    "razorpaySignature" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "PaymentStatus",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscription_userId_key" ON "subscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_razorpaySubscriptionId_key" ON "subscription"("razorpaySubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_razorpayPaymentId_key" ON "payment"("razorpayPaymentId");

-- CreateIndex
CREATE INDEX "payment_userId_idx" ON "payment"("userId");

-- CreateIndex
CREATE INDEX "interview_status_idx" ON "interview"("status");

-- CreateIndex
CREATE INDEX "question_difficulty_idx" ON "question"("difficulty");

-- CreateIndex
CREATE INDEX "question_type_idx" ON "question"("type");

-- CreateIndex
CREATE INDEX "user_plan_idx" ON "user"("plan");

-- AddForeignKey
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
