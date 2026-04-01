/*
  Warnings:

  - You are about to drop the column `expectedAnswer` on the `interview_question` table. All the data in the column will be lost.
  - You are about to drop the column `refereceAnswer` on the `interview_question` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "interview_question" DROP COLUMN "expectedAnswer",
DROP COLUMN "refereceAnswer",
ADD COLUMN     "referenceAnswer" TEXT;
