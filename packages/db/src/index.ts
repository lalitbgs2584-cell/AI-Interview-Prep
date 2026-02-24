// apps/ws-backend/lib/prisma-db.ts (or @repo/db/prisma-db)
import dotenv from "dotenv";
dotenv.config({ override: true }); // ✅ Force override

import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient } from '@prisma/client';

console.log('🔍 Prisma DB - DATABASE_URL:', !!process.env.DATABASE_URL ? '✅ loaded' : '❌ missing');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL missing in prisma.ts');
}

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
