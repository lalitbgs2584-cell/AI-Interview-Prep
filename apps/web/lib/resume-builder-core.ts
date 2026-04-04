export type ResumeSectionKey =
  | "summary"
  | "experience"
  | "education"
  | "skills"
  | "projects"
  | "certifications"
  | "achievements";

export interface ResumeExperienceEntry {
  id: string;
  company: string;
  title: string;
  location: string;
  startDate: string;
  endDate: string;
  bullets: string[];
}

export interface ResumeEducationEntry {
  id: string;
  institution: string;
  degree: string;
  location: string;
  startDate: string;
  endDate: string;
  grade: string;
  details: string[];
}

export interface ResumeProjectEntry {
  id: string;
  name: string;
  role: string;
  link: string;
  techStack: string[];
  bullets: string[];
}

export interface ResumeSkillGroups {
  core: string[];
  tools: string[];
  platforms: string[];
}

export interface ResumeBuilderData {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  website: string;
  linkedin: string;
  github: string;
  summary: string;
  targetRole: string;
  jobDescription: string;
  skills: ResumeSkillGroups;
  experience: ResumeExperienceEntry[];
  education: ResumeEducationEntry[];
  projects: ResumeProjectEntry[];
  certifications: string[];
  achievements: string[];
}

export interface AtsScoreBreakdown {
  score: number;
  keywordCoverage: number;
  sectionCoverage: number;
  quantifiedCoverage: number;
  actionVerbCoverage: number;
  lengthScore: number;
  matchedKeywords: string[];
  missingKeywords: string[];
  missingSections: string[];
  suggestions: string[];
}

export interface GeneratedResumePayload {
  title: string;
  latexCode: string;
  ats: AtsScoreBreakdown;
  sourceData: ResumeBuilderData;
}

const ACTION_VERBS = [
  "accelerated",
  "architected",
  "automated",
  "built",
  "collaborated",
  "created",
  "delivered",
  "designed",
  "drove",
  "enhanced",
  "executed",
  "generated",
  "implemented",
  "improved",
  "launched",
  "led",
  "managed",
  "migrated",
  "optimized",
  "owned",
  "reduced",
  "scaled",
  "shipped",
  "streamlined",
];

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "into",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "their",
  "this",
  "to",
  "with",
  "you",
  "your",
]);

const DEFAULT_SUMMARY =
  "Results-oriented professional with a track record of building reliable systems, collaborating across teams, and translating business goals into measurable outcomes.";

function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createEmptyExperienceEntry(): ResumeExperienceEntry {
  return {
    id: createId("exp"),
    company: "",
    title: "",
    location: "",
    startDate: "",
    endDate: "Present",
    bullets: [""],
  };
}

export function createEmptyEducationEntry(): ResumeEducationEntry {
  return {
    id: createId("edu"),
    institution: "",
    degree: "",
    location: "",
    startDate: "",
    endDate: "",
    grade: "",
    details: [""],
  };
}

export function createEmptyProjectEntry(): ResumeProjectEntry {
  return {
    id: createId("proj"),
    name: "",
    role: "",
    link: "",
    techStack: [],
    bullets: [""],
  };
}

export function createEmptyResumeBuilderData(): ResumeBuilderData {
  return {
    fullName: "",
    email: "",
    phone: "",
    location: "",
    website: "",
    linkedin: "",
    github: "",
    summary: "",
    targetRole: "",
    jobDescription: "",
    skills: {
      core: [],
      tools: [],
      platforms: [],
    },
    experience: [createEmptyExperienceEntry()],
    education: [createEmptyEducationEntry()],
    projects: [createEmptyProjectEntry()],
    certifications: [],
    achievements: [],
  };
}

export function normalizeList(value: string | string[] | undefined | null) {
  if (Array.isArray(value)) {
    return value.map((item) => item.trim()).filter(Boolean);
  }

  return (value ?? "")
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function sanitizeEntries<T>(items: T[], isMeaningful: (item: T) => boolean, fallback: () => T) {
  const cleaned = items.filter(isMeaningful);
  return cleaned.length > 0 ? cleaned : [fallback()];
}

export function normalizeBuilderData(input: Partial<ResumeBuilderData> | null | undefined): ResumeBuilderData {
  const base = createEmptyResumeBuilderData();
  const source = input ?? {};

  const experience = sanitizeEntries(
    (source.experience ?? []).map((entry) => ({
      id: entry.id || createId("exp"),
      company: (entry.company ?? "").trim(),
      title: (entry.title ?? "").trim(),
      location: (entry.location ?? "").trim(),
      startDate: (entry.startDate ?? "").trim(),
      endDate: (entry.endDate ?? "").trim() || "Present",
      bullets: normalizeList(entry.bullets).length ? normalizeList(entry.bullets) : [""],
    })),
    (entry) => Boolean(entry.company || entry.title || entry.bullets.some(Boolean)),
    createEmptyExperienceEntry,
  );

  const education = sanitizeEntries(
    (source.education ?? []).map((entry) => ({
      id: entry.id || createId("edu"),
      institution: (entry.institution ?? "").trim(),
      degree: (entry.degree ?? "").trim(),
      location: (entry.location ?? "").trim(),
      startDate: (entry.startDate ?? "").trim(),
      endDate: (entry.endDate ?? "").trim(),
      grade: (entry.grade ?? "").trim(),
      details: normalizeList(entry.details).length ? normalizeList(entry.details) : [""],
    })),
    (entry) => Boolean(entry.institution || entry.degree || entry.details.some(Boolean)),
    createEmptyEducationEntry,
  );

  const projects = sanitizeEntries(
    (source.projects ?? []).map((entry) => ({
      id: entry.id || createId("proj"),
      name: (entry.name ?? "").trim(),
      role: (entry.role ?? "").trim(),
      link: (entry.link ?? "").trim(),
      techStack: normalizeList(entry.techStack),
      bullets: normalizeList(entry.bullets).length ? normalizeList(entry.bullets) : [""],
    })),
    (entry) => Boolean(entry.name || entry.role || entry.bullets.some(Boolean)),
    createEmptyProjectEntry,
  );

  return {
    ...base,
    ...source,
    fullName: (source.fullName ?? "").trim(),
    email: (source.email ?? "").trim(),
    phone: (source.phone ?? "").trim(),
    location: (source.location ?? "").trim(),
    website: (source.website ?? "").trim(),
    linkedin: (source.linkedin ?? "").trim(),
    github: (source.github ?? "").trim(),
    summary: (source.summary ?? "").trim(),
    targetRole: (source.targetRole ?? "").trim(),
    jobDescription: source.jobDescription ?? "",
    skills: {
      core: normalizeList(source.skills?.core),
      tools: normalizeList(source.skills?.tools),
      platforms: normalizeList(source.skills?.platforms),
    },
    experience,
    education,
    projects,
    certifications: normalizeList(source.certifications),
    achievements: normalizeList(source.achievements),
  };
}

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function tokenize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+.#/\-\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

export function extractJobKeywords(jobDescription: string) {
  const counts = new Map<string, number>();
  for (const token of tokenize(jobDescription)) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 18)
    .map(([token]) => token);
}

export function getResumePlainText(data: ResumeBuilderData) {
  const chunks = [
    data.fullName,
    data.email,
    data.phone,
    data.location,
    data.website,
    data.linkedin,
    data.github,
    data.summary,
    data.targetRole,
    ...data.skills.core,
    ...data.skills.tools,
    ...data.skills.platforms,
    ...data.certifications,
    ...data.achievements,
    ...data.experience.flatMap((entry) => [
      entry.company,
      entry.title,
      entry.location,
      entry.startDate,
      entry.endDate,
      ...entry.bullets,
    ]),
    ...data.education.flatMap((entry) => [
      entry.institution,
      entry.degree,
      entry.location,
      entry.startDate,
      entry.endDate,
      entry.grade,
      ...entry.details,
    ]),
    ...data.projects.flatMap((entry) => [
      entry.name,
      entry.role,
      entry.link,
      ...entry.techStack,
      ...entry.bullets,
    ]),
  ];

  return chunks.filter(Boolean).join(" ");
}

export function estimateResumeAts(data: ResumeBuilderData): AtsScoreBreakdown {
  const normalized = normalizeBuilderData(data);
  const keywords = extractJobKeywords(normalized.jobDescription);
  const resumeText = getResumePlainText(normalized).toLowerCase();
  const matchedKeywords = keywords.filter((keyword) => resumeText.includes(keyword));
  const missingKeywords = keywords.filter((keyword) => !resumeText.includes(keyword));

  const presentSections: ResumeSectionKey[] = [];
  if (normalized.summary) presentSections.push("summary");
  if (normalized.experience.some((entry) => entry.company || entry.title || entry.bullets.some(Boolean))) presentSections.push("experience");
  if (normalized.education.some((entry) => entry.institution || entry.degree)) presentSections.push("education");
  if (normalized.skills.core.length || normalized.skills.tools.length || normalized.skills.platforms.length) presentSections.push("skills");
  if (normalized.projects.some((entry) => entry.name || entry.bullets.some(Boolean))) presentSections.push("projects");
  if (normalized.certifications.length) presentSections.push("certifications");
  if (normalized.achievements.length) presentSections.push("achievements");

  const allSections: ResumeSectionKey[] = [
    "summary",
    "experience",
    "education",
    "skills",
    "projects",
    "certifications",
    "achievements",
  ];

  const missingSections = allSections.filter((section) => !presentSections.includes(section));

  const bulletPool = [
    ...normalized.experience.flatMap((entry) => entry.bullets),
    ...normalized.projects.flatMap((entry) => entry.bullets),
    ...normalized.achievements,
  ].filter(Boolean);

  const quantifiedBullets = bulletPool.filter((bullet) => /\d|%|\$|x|yrs|years/i.test(bullet)).length;
  const actionVerbBullets = bulletPool.filter((bullet) => ACTION_VERBS.some((verb) => bullet.toLowerCase().startsWith(verb))).length;

  const keywordCoverage = keywords.length ? matchedKeywords.length / keywords.length : normalized.targetRole ? 0.75 : 0.6;
  const sectionCoverage = presentSections.length / allSections.length;
  const quantifiedCoverage = bulletPool.length ? quantifiedBullets / bulletPool.length : 0;
  const actionVerbCoverage = bulletPool.length ? actionVerbBullets / bulletPool.length : 0;

  const wordCount = getResumePlainText(normalized).split(/\s+/).filter(Boolean).length;
  const lengthScore = wordCount >= 220 && wordCount <= 700 ? 1 : wordCount >= 160 && wordCount <= 850 ? 0.7 : 0.45;

  let score = 42;
  score += Math.round(keywordCoverage * 24);
  score += Math.round(sectionCoverage * 16);
  score += Math.round(quantifiedCoverage * 8);
  score += Math.round(actionVerbCoverage * 7);
  score += Math.round(lengthScore * 8);

  if (normalized.targetRole) score += 5;
  if (normalized.email && (normalized.linkedin || normalized.github || normalized.website)) score += 4;
  if (normalized.summary && normalized.summary.length >= 90) score += 3;

  score = Math.max(38, Math.min(98, score));

  const suggestions: string[] = [];
  if (missingSections.includes("summary")) suggestions.push("Add a short summary aligned to the target role.");
  if (missingSections.includes("projects")) suggestions.push("Include at least one project with measurable impact and relevant tech keywords.");
  if (missingSections.includes("certifications") && /aws|azure|gcp|cloud|security|scrum/i.test(normalized.jobDescription)) {
    suggestions.push("Add certifications if the target role expects them.");
  }
  if (missingKeywords.length) {
    suggestions.push(`Work these keywords into natural bullet points: ${missingKeywords.slice(0, 6).map(titleCase).join(", ")}.`);
  }
  if (quantifiedCoverage < 0.4) suggestions.push("Quantify more bullets with metrics, percentages, revenue, time saved, or scale.");
  if (actionVerbCoverage < 0.5) suggestions.push("Start more bullets with strong action verbs such as Built, Led, Optimized, or Delivered.");

  return {
    score,
    keywordCoverage: Math.round(keywordCoverage * 100),
    sectionCoverage: Math.round(sectionCoverage * 100),
    quantifiedCoverage: Math.round(quantifiedCoverage * 100),
    actionVerbCoverage: Math.round(actionVerbCoverage * 100),
    lengthScore: Math.round(lengthScore * 100),
    matchedKeywords: matchedKeywords.map(titleCase),
    missingKeywords: missingKeywords.map(titleCase),
    missingSections: missingSections.map(titleCase),
    suggestions,
  };
}

export function escapeLatex(value: string) {
  return value
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/([#$%&_{}])/g, "\\$1")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}")
    .replace(/>/g, "\\textgreater{}")
    .replace(/</g, "\\textless{}");
}

function formatDateRange(startDate: string, endDate: string) {
  const start = startDate.trim();
  const end = endDate.trim();
  if (!start && !end) return "";
  if (!start) return end;
  if (!end) return start;
  return `${start} -- ${end}`;
}

function formatLinks(data: ResumeBuilderData) {
  const items = [data.email, data.phone, data.location, data.linkedin, data.github, data.website].filter(Boolean);
  return items.map((item) => escapeLatex(item)).join(" \\textbar{} ");
}

function renderBulletList(items: string[]) {
  const meaningful = items.map((item) => item.trim()).filter(Boolean);
  if (!meaningful.length) return "";

  return [
    "\\begin{itemize}[leftmargin=*, itemsep=2pt, topsep=2pt]",
    ...meaningful.map((item) => `  \\item ${escapeLatex(item)}`),
    "\\end{itemize}",
  ].join("\n");
}

function renderSkillLines(groups: ResumeSkillGroups) {
  const lines = [
    groups.core.length ? `\\textbf{Core:} ${escapeLatex(groups.core.join(", "))}` : "",
    groups.tools.length ? `\\textbf{Tools:} ${escapeLatex(groups.tools.join(", "))}` : "",
    groups.platforms.length ? `\\textbf{Platforms:} ${escapeLatex(groups.platforms.join(", "))}` : "",
  ].filter(Boolean);

  return lines.join("\\\\\n");
}

export function renderResumeLatex(data: ResumeBuilderData) {
  const normalized = normalizeBuilderData(data);
  const summary = normalized.summary || DEFAULT_SUMMARY;
  const skillLines = renderSkillLines(normalized.skills);
  const experienceBlocks = normalized.experience
    .filter((entry) => entry.company || entry.title || entry.bullets.some(Boolean))
    .map((entry) => {
      const headerParts = [entry.title, entry.company].filter(Boolean).map(escapeLatex).join(" -- ");
      const rightSide = [entry.location, formatDateRange(entry.startDate, entry.endDate)].filter(Boolean).map(escapeLatex).join(" \\textbar{} ");
      return [
        `\\textbf{${headerParts || "Experience"}}${rightSide ? ` \\hfill ${rightSide}` : ""}`,
        renderBulletList(entry.bullets),
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  const educationBlocks = normalized.education
    .filter((entry) => entry.institution || entry.degree)
    .map((entry) => {
      const left = [entry.degree, entry.institution].filter(Boolean).map(escapeLatex).join(" -- ");
      const right = [entry.location, formatDateRange(entry.startDate, entry.endDate), entry.grade ? `Grade: ${entry.grade}` : ""]
        .filter(Boolean)
        .map(escapeLatex)
        .join(" \\textbar{} ");
      return [
        `\\textbf{${left || "Education"}}${right ? ` \\hfill ${right}` : ""}`,
        ...normalizeList(entry.details).map((detail) => escapeLatex(detail)),
      ]
        .filter(Boolean)
        .join("\\\\\n");
    })
    .join("\n\n");

  const projectBlocks = normalized.projects
    .filter((entry) => entry.name || entry.bullets.some(Boolean))
    .map((entry) => {
      const titleParts = [entry.name, entry.role].filter(Boolean).map(escapeLatex).join(" -- ");
      const techLine = entry.techStack.length ? `\\textit{${escapeLatex(entry.techStack.join(", "))}}` : "";
      const linkLine = entry.link ? `\\href{${entry.link}}{${escapeLatex(entry.link)}}` : "";
      return [
        `\\textbf{${titleParts || "Project"}}${linkLine ? ` \\hfill ${linkLine}` : ""}`,
        techLine,
        renderBulletList(entry.bullets),
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  const certifications = normalizeList(normalized.certifications).map((item) => escapeLatex(item)).join("\\\\\n");
  const achievements = renderBulletList(normalized.achievements);

  const sections = [
    `\\section*{Summary}\n${escapeLatex(summary)}`,
    experienceBlocks ? `\\section*{Experience}\n${experienceBlocks}` : "",
    educationBlocks ? `\\section*{Education}\n${educationBlocks}` : "",
    skillLines ? `\\section*{Skills}\n${skillLines}` : "",
    projectBlocks ? `\\section*{Projects}\n${projectBlocks}` : "",
    certifications ? `\\section*{Certifications}\n${certifications}` : "",
    achievements ? `\\section*{Achievements}\n${achievements}` : "",
  ].filter(Boolean);

  return `\\documentclass[11pt]{article}
\\usepackage[margin=0.7in]{geometry}
\\usepackage[T1]{fontenc}
\\usepackage[utf8]{inputenc}
\\usepackage[hidelinks]{hyperref}
\\usepackage{enumitem}
\\setlength{\\parindent}{0pt}
\\setlength{\\parskip}{4pt}
\\pagestyle{empty}

\\begin{document}
{\\LARGE \\textbf{${escapeLatex(normalized.fullName || "Candidate Name")}}}\\\\
${formatLinks(normalized)}

${sections.join("\n\n")}

\\end{document}
`;
}

export function getResumeTitle(data: ResumeBuilderData) {
  const role = data.targetRole?.trim() || "ATS Resume";
  const name = data.fullName?.trim() || "Candidate";
  return `${name} - ${role}`;
}

export function profileToResumeBuilderData(profileResponse: any): ResumeBuilderData {
  const user = profileResponse?.user ?? profileResponse ?? {};
  const resume = Array.isArray(user.resumes) ? user.resumes[0] : null;
  const interviews = Array.isArray(user.interviews) ? user.interviews : [];
  const inferredRole = interviews[0]?.title || "Software Engineer";
  const skillNames = Array.isArray(user.skills)
    ? user.skills.map((entry: any) => entry?.skill?.name).filter(Boolean)
    : [];

  const experience = Array.isArray(resume?.workExperience)
    ? resume.workExperience.map((entry: any) => ({
        id: createId("exp"),
        company: entry.company ?? "",
        title: entry.role ?? "",
        location: "",
        startDate: "",
        endDate: entry.duration ?? "",
        bullets: entry.description ? normalizeList(entry.description) : [""],
      }))
    : [createEmptyExperienceEntry()];

  const education = Array.isArray(resume?.education)
    ? resume.education.map((entry: any) => ({
        id: createId("edu"),
        institution: entry.institution ?? "",
        degree: entry.degree ?? "",
        location: "",
        startDate: "",
        endDate: "",
        grade: entry.grade ?? "",
        details: [""],
      }))
    : [createEmptyEducationEntry()];

  const projects = Array.isArray(resume?.projects)
    ? resume.projects.map((entry: any) => ({
        id: createId("proj"),
        name: entry.title ?? "",
        role: "",
        link: "",
        techStack: Array.isArray(entry.techStack) ? entry.techStack : [],
        bullets: entry.description ? normalizeList(entry.description) : [""],
      }))
    : [createEmptyProjectEntry()];

  return normalizeBuilderData({
    fullName: user.name ?? "",
    email: user.email ?? "",
    targetRole: inferredRole,
    summary: user.resumes?.[0]?.insights?.strongDomains?.length
      ? `Candidate with experience across ${user.resumes[0].insights.strongDomains.join(", ")} and a focus on ${inferredRole}.`
      : "",
    skills: {
      core: skillNames.slice(0, 10),
      tools: resume?.insights?.keySkills?.slice(0, 10) ?? [],
      platforms: [],
    },
    experience,
    education,
    projects,
    achievements: resume?.insights?.strongDomains ?? [],
  });
}
