/*
  Warnings:

  - Made the column `S3FileName` on table `file` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "file" ALTER COLUMN "S3FileName" SET NOT NULL;
