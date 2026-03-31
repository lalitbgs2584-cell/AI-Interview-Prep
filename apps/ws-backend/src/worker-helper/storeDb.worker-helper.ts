import { prisma } from "@repo/db/prisma-db";

export const storeToDB = async (payload: any) => {
    const {
        user_id: userId,
        file_id: fileId,
        neo4j_node_id: neo4jNodeId,
        qdrant_point_ids: qdrantPointIds = [],
        stored_in_neo4j: storedInNeo4j = false,
        stored_in_qdrant: storedInQdrant = false,
        skills = [],
        work_experience: workExperience = [],
        education = [],
        projects = [],
        extracurricular = [],
        key_skills: keySkills = [],
        strong_domains: strongDomains = [],
        experience_level: experienceLevel = 0,
        ats_score: atsScore = 0,
        error,
    } = payload;

    try {

        // ❌ If parsing failed → mark file failed & exit
        if (error) {
            await prisma.file.update({
                where: { id: fileId },
                data: { status: "FAILED" },
            });
            return { success: false, message: "Resume Processing Failed" };
        }

        // ✅ Mark file processed outside transaction (reduces lock time)
        await prisma.file.update({
            where: { id: fileId },
            data: { status: "PROCESSED" },
        });

        await prisma.$transaction(
            async (tx) => {

                // ── 1. Skills: clear old mapping → upsert global skills → remap ──
                await tx.userSkill.deleteMany({ where: { userId } });

                const upsertedSkills = await Promise.all(
                    skills.map((skill: any) =>
                        tx.skill.upsert({
                            where: { name: skill.name },
                            update: { category: skill.category ?? null },
                            create: { name: skill.name, category: skill.category ?? null },
                        })
                    )
                );

                if (upsertedSkills.length > 0) {
                    await tx.userSkill.createMany({
                        data: upsertedSkills.map((skill) => ({ userId, skillId: skill.id })),
                        skipDuplicates: true,
                    });
                }

                // ── 2. Resume upsert ──────────────────────────────────────────────
                const resume = await tx.resume.upsert({
                    where: { userId },

                    /* ── CREATE ── */
                    create: {
                        neo4jNodeId,
                        qdrantPointIds: Array.isArray(qdrantPointIds) ? qdrantPointIds : [],
                        storedInNeo4j,
                        storedInQdrant,
                        user:   { connect: { id: userId } },
                        file:   { connect: { id: fileId } },

                        workExperience: {
                            create: workExperience.map((w: any) => ({
                                company:     w.company     ?? null,
                                role:        w.role        ?? null,
                                duration:    w.duration    ?? null,
                                description: w.description ?? null,
                            })),
                        },
                        education: {
                            create: education.map((e: any) => ({
                                institution: e.institution,
                                degree:      e.degree,
                                duration:    e.duration ?? null,
                                grade:       e.grade    ?? null,
                            })),
                        },
                        projects: {
                            create: projects.map((p: any) => ({
                                title:       p.title,
                                techStack:   Array.isArray(p.tech_stack)
                                    ? p.tech_stack
                                    : p.tech_stack
                                        ? p.tech_stack.split(",").map((t: string) => t.trim())
                                        : [],
                                description: p.description ?? null,
                            })),
                        },
                        extracurricular: {
                            create: extracurricular.map((ex: any) => ({
                                title:        ex.title,
                                organization: ex.organization ?? null,
                                duration:     ex.duration     ?? null,
                                description:  ex.description  ?? null,
                            })),
                        },
                    },

                    /* ── UPDATE ── */
                    update: {
                        fileId,
                        neo4jNodeId,
                        qdrantPointIds,
                        storedInNeo4j,
                        storedInQdrant,

                        workExperience: {
                            deleteMany: {},
                            create: workExperience.map((w: any) => ({
                                company:     w.company     ?? null,
                                role:        w.role        ?? null,
                                duration:    w.duration    ?? null,
                                description: w.description ?? null,
                            })),
                        },
                        education: {
                            deleteMany: {},
                            create: education.map((e: any) => ({
                                institution: e.institution,
                                degree:      e.degree,
                                duration:    e.duration ?? null,
                                grade:       e.grade    ?? null,
                            })),
                        },
                        projects: {
                            deleteMany: {},
                            create: projects.map((p: any) => ({
                                title:       p.title,
                                techStack:   Array.isArray(p.tech_stack)
                                    ? p.tech_stack
                                    : p.tech_stack
                                        ? p.tech_stack.split(",").map((t: string) => t.trim())
                                        : [],
                                description: p.description ?? null,
                            })),
                        },
                        extracurricular: {
                            deleteMany: {},
                            create: extracurricular.map((ex: any) => ({
                                title:        ex.title,
                                organization: ex.organization ?? null,
                                duration:     ex.duration     ?? null,
                                description:  ex.description  ?? null,
                            })),
                        },
                    },

                    select: { id: true },
                });

                // ── 3. Insights upsert (keyed on resumeId) ───────────────────────
                await tx.insights.upsert({
                    where: { resumeId: resume.id },
                    create: {
                        resumeId:        resume.id,
                        experienceLevel: experienceLevel,
                        keySkills:       keySkills,
                        ATSSCORE:        atsScore,
                        strongDomains:   strongDomains,
                    },
                    update: {
                        experienceLevel: experienceLevel,
                        keySkills:       keySkills,
                        ATSSCORE:        atsScore,
                        strongDomains:   strongDomains,
                    },
                });
            },
            {
                maxWait: 15000,
                timeout: 40000,
            }
        );

        return { success: true, message: "Resume Stored Successfully" };

    } catch (err) {
        console.error("DB Store Error:", err);
        return { success: false, message: "Database Store Failed" };
    }
};