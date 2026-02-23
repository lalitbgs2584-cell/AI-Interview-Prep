/*
  Warnings:

  - You are about to drop the column `plan` on the `user` table. All the data in the column will be lost.
  - You are about to drop the column `resumeFileName` on the `user` table. All the data in the column will be lost.
  - You are about to drop the column `resumeUploadedAt` on the `user` table. All the data in the column will be lost.
  - You are about to drop the column `resumeUrl` on the `user` table. All the data in the column will be lost.
  - You are about to drop the `payment` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `subscription` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "FileStatus" AS ENUM ('STARTING', 'UPLOADED', 'PROCESSING', 'PROCESSED', 'FAILED');

-- DropForeignKey
ALTER TABLE "payment" DROP CONSTRAINT "payment_subscriptionId_fkey";

-- DropForeignKey
ALTER TABLE "payment" DROP CONSTRAINT "payment_userId_fkey";

-- DropForeignKey
ALTER TABLE "subscription" DROP CONSTRAINT "subscription_userId_fkey";

-- DropIndex
DROP INDEX "user_plan_idx";

-- AlterTable
ALTER TABLE "user" DROP COLUMN "plan",
DROP COLUMN "resumeFileName",
DROP COLUMN "resumeUploadedAt",
DROP COLUMN "resumeUrl";

-- DropTable
DROP TABLE "payment";

-- DropTable
DROP TABLE "subscription";

-- DropEnum
DROP TYPE "PaymentStatus";

-- DropEnum
DROP TYPE "SubscriptionPlan";

-- DropEnum
DROP TYPE "SubscriptionStatus";

-- CreateTable
CREATE TABLE "file" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "OriginalFileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "S3FileName" TEXT NOT NULL,
    "status" "FileStatus" NOT NULL DEFAULT 'STARTING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "file_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "file_userId_idx" ON "file"("userId");

-- AddForeignKey
ALTER TABLE "file" ADD CONSTRAINT "file_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
