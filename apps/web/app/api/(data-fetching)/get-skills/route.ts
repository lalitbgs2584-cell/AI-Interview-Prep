import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@repo/auth/server";
import { prisma } from "@repo/db/prisma-db";

export async function GET(req: NextRequest) {
    try {
        const session = await auth.api.getSession({
            headers: await headers(),
        });

        // 1 If not authenticated
        if (!session?.user) {
            return NextResponse.json(
                { message: "Unauthorized" },
                { status: 401 }
            );
        }

        // 2 Fetch user skills
        const userSkills = await prisma.userSkill.findMany({
            where: {
                userId: session.user.id, // ... no stringify
            },
            include: {
                skill: true, // optional but useful
            },
        });

        console.log(userSkills)
        // 3 Return response
        return NextResponse.json({
            success: true,
            data: userSkills,
        });

    } catch (error) {
        console.error("Error fetching user skills:", error);

        return NextResponse.json(
            { success: false, message: "Internal Server Error" },
            { status: 500 }
        );
    }
}