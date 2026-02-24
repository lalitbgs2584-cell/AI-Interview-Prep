import dotenv from "dotenv";
dotenv.config();

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@repo/db/prisma-db";

console.log("DATABASE_URL:",process.env.DATABASE_URL)

export const auth = betterAuth({
    baseURL: process.env.BETTER_AUTH_BASE_URL,
    trustedOrigins: ["http://localhost:3000"],
    database: prismaAdapter(prisma, {
        provider: "postgresql",
    }),
    emailAndPassword: {
        enabled: true
    },
    socialProviders: {
        github: {
            clientId: process.env.GITHUB_CLIENT_ID as string,
            clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
        },
        google: {
            clientId: process.env.GOOGLE_CLIENT_ID as string,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
        },
    }
});