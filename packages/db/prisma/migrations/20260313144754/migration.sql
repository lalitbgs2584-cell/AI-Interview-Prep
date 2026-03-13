/*
  Warnings:

  - You are about to drop the column `aiIdealAnswer` on the `response` table. All the data in the column will be lost.
  - You are about to drop the column `durationSeconds` on the `response` table. All the data in the column will be lost.
  - You are about to drop the column `userAudioUrl` on the `response` table. All the data in the column will be lost.
  - You are about to drop the column `userText` on the `response` table. All the data in the column will be lost.
  - You are about to drop the column `userTranscript` on the `response` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "interview" ADD COLUMN     "videoUrl" TEXT;

-- AlterTable
ALTER TABLE "response" DROP COLUMN "aiIdealAnswer",
DROP COLUMN "durationSeconds",
DROP COLUMN "userAudioUrl",
DROP COLUMN "userText",
DROP COLUMN "userTranscript";
