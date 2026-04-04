import OpenAI from "openai";

import {
  estimateResumeAts,
  GeneratedResumePayload,
  getResumeTitle,
  normalizeBuilderData,
  normalizeList,
  renderResumeLatex,
  ResumeBuilderData,
  ResumeEducationEntry,
  ResumeExperienceEntry,
  ResumeProjectEntry,
} from "@/lib/resume-builder-core";

interface ResumeAiShape {
  summary?: string;
  experience?: Array<Partial<ResumeExperienceEntry>>;
  education?: Array<Partial<ResumeEducationEntry>>;
  projects?: Array<Partial<ResumeProjectEntry>>;
  certifications?: string[];
  achievements?: string[];
  skills?: {
    core?: string[];
    tools?: string[];
    platforms?: string[];
  };
}

function mergeAiOutput(base: ResumeBuilderData, ai: ResumeAiShape | null | undefined): ResumeBuilderData {
  if (!ai) {
    return normalizeBuilderData(base);
  }

  return normalizeBuilderData({
    ...base,
    summary: ai.summary || base.summary,
    certifications: ai.certifications?.length ? ai.certifications : base.certifications,
    achievements: ai.achievements?.length ? ai.achievements : base.achievements,
    skills: {
      core: ai.skills?.core?.length ? ai.skills.core : base.skills.core,
      tools: ai.skills?.tools?.length ? ai.skills.tools : base.skills.tools,
      platforms: ai.skills?.platforms?.length ? ai.skills.platforms : base.skills.platforms,
    },
    experience: ai.experience?.length
      ? ai.experience.map((entry, index) => ({
          id: entry.id || `exp-ai-${index}`,
          company: entry.company || "",
          title: entry.title || "",
          location: entry.location || "",
          startDate: entry.startDate || "",
          endDate: entry.endDate || "Present",
          bullets: normalizeList(entry.bullets),
        }))
      : base.experience,
    education: ai.education?.length
      ? ai.education.map((entry, index) => ({
          id: entry.id || `edu-ai-${index}`,
          institution: entry.institution || "",
          degree: entry.degree || "",
          location: entry.location || "",
          startDate: entry.startDate || "",
          endDate: entry.endDate || "",
          grade: entry.grade || "",
          details: normalizeList(entry.details),
        }))
      : base.education,
    projects: ai.projects?.length
      ? ai.projects.map((entry, index) => ({
          id: entry.id || `proj-ai-${index}`,
          name: entry.name || "",
          role: entry.role || "",
          link: entry.link || "",
          techStack: normalizeList(entry.techStack),
          bullets: normalizeList(entry.bullets),
        }))
      : base.projects,
  });
}

function createDeterministicFallback(base: ResumeBuilderData) {
  const normalized = normalizeBuilderData(base);
  const summary =
    normalized.summary ||
    `Results-oriented ${normalized.targetRole || "professional"} with experience delivering measurable business outcomes, improving reliability, and collaborating across product and engineering teams.`;

  const experience = normalized.experience.map((entry) => {
    const bullets = entry.bullets.filter(Boolean).length
      ? entry.bullets.map((bullet) => bullet.trim())
      : [
          `Built and improved ${normalized.targetRole || "key initiatives"} at ${entry.company || "the organization"}, translating business goals into repeatable execution.`,
          `Collaborated cross-functionally to deliver measurable outcomes, improve quality, and reduce turnaround time.`,
        ];

    return {
      ...entry,
      bullets,
    };
  });

  const projects = normalized.projects.map((entry) => ({
    ...entry,
    bullets: entry.bullets.filter(Boolean).length
      ? entry.bullets
      : [
          `Designed and shipped ${entry.name || "a project"} using ${entry.techStack.join(", ") || "relevant tools"}, with a focus on performance, reliability, and maintainability.`,
        ],
  }));

  return normalizeBuilderData({
    ...normalized,
    summary,
    experience,
    projects,
  });
}

function buildPrompt(data: ResumeBuilderData) {
  return {
    model: "gpt-4o-mini",
    response_format: { type: "json_object" as const },
    temperature: 0.3,
    messages: [
      {
        role: "system" as const,
        content:
          "You are an expert resume writer. Rewrite the supplied resume data into ATS-friendly content. Return strict JSON only. Rules: single-column resume, no tables, no graphics, standard section names, keyword-rich bullets, quantified achievements where plausible, concise and professional tone, align to target role and job description. Keep the existing facts grounded in the user data and avoid inventing employers or degrees.",
      },
      {
        role: "user" as const,
        content: JSON.stringify({
          targetRole: data.targetRole,
          jobDescription: data.jobDescription,
          candidate: data,
          outputShape: {
            summary: "string",
            skills: {
              core: ["string"],
              tools: ["string"],
              platforms: ["string"],
            },
            experience: [
              {
                company: "string",
                title: "string",
                location: "string",
                startDate: "string",
                endDate: "string",
                bullets: ["string", "string", "string"],
              },
            ],
            education: [
              {
                institution: "string",
                degree: "string",
                location: "string",
                startDate: "string",
                endDate: "string",
                grade: "string",
                details: ["string"],
              },
            ],
            projects: [
              {
                name: "string",
                role: "string",
                link: "string",
                techStack: ["string"],
                bullets: ["string", "string"],
              },
            ],
            certifications: ["string"],
            achievements: ["string"],
          },
        }),
      },
    ],
  };
}

export async function generateResumeWithAi(input: ResumeBuilderData): Promise<GeneratedResumePayload> {
  const normalized = normalizeBuilderData(input);
  const client = process.env.OPENAI_API_KEY
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : null;

  let improved = createDeterministicFallback(normalized);

  if (client) {
    try {
      const response = await client.chat.completions.create(buildPrompt(normalized));
      const content = response.choices[0]?.message?.content;
      if (content) {
        const parsed = JSON.parse(content) as ResumeAiShape;
        improved = mergeAiOutput(normalized, parsed);
      }
    } catch (error) {
      console.error("Resume AI generation failed, using fallback template:", error);
    }
  }

  const ats = estimateResumeAts(improved);
  const latexCode = renderResumeLatex(improved);

  return {
    title: getResumeTitle(improved),
    latexCode,
    ats,
    sourceData: improved,
  };
}
