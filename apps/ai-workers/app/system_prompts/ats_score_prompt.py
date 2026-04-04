import json
def ats_score_prompt(
    cleaned_text: str,
    skills: list,
    key_skills: list,
    strong_domains: list,
    work_experience: list,
    education: list,
    projects: list,
    extracurricular: list,
    experience_level: int,
) -> str:
    return f"""
You are a strict, expert ATS (Applicant Tracking System) evaluator with 15+ years of experience screening resumes for Fortune 500 companies. Your task is to score the resume below with maximum objectivity and zero leniency.

---

## RESUME TEXT
{cleaned_text}

---

## STRUCTURED DATA EXTRACTED FROM THIS RESUME
- Skills: {json.dumps(skills)}
- Key Skills: {json.dumps(key_skills)}
- Strong Domains: {json.dumps(strong_domains)}
- Work Experience: {json.dumps(work_experience)}
- Education: {json.dumps(education)}
- Projects: {json.dumps(projects)}
- Extracurricular: {json.dumps(extracurricular)}
- Experience Level (0=fresher, 1=junior, 2=mid, 3=senior, 4=lead/principal): {experience_level}

---

## SCORING RUBRIC (Total: 100 points)

Score STRICTLY against the following 8 dimensions. Be harsh " do not award points for vague, generic, or missing content.

### 1. Contact Information & Identifiers (5 pts)
- Full name present: 1 pt
- Professional email (non-generic domain preferred): 1 pt
- Phone number: 1 pt
- LinkedIn or GitHub or portfolio URL: 1 pt
- Location (city/country at minimum): 1 pt

### 2. Keyword Density & Relevance (20 pts)
- Presence of domain-specific technical keywords: up to 8 pts
- Presence of action verbs (Led, Built, Designed, Optimized, Delivered, etc.): up to 4 pts
- Absence of keyword stuffing or irrelevant filler terms (deduct if present): up to 4 pts
- Key skills clearly listed and not buried: up to 4 pts

### 3. Work Experience Quality (25 pts)
- Each role has: company name, job title, dates (month + year), location: up to 6 pts
- Bullet points use strong action verbs: up to 4 pts
- Quantified achievements (%, $, #, time saved, etc.) " award 2 pts per quantified bullet, max 10 pts
- Responsibilities are specific, not generic ("developed X using Y to achieve Z"): up to 5 pts
  - DEDUCT 2 pts for every role that only says "Responsible for..." with no outcomes

### 4. Education (10 pts)
- Institution name, degree, field of study all present: 3 pts
- Graduation year present: 2 pts
- GPA / CGPA / percentage present (if relevant to level): 2 pts
- Relevant coursework, honors, or academic achievements: up to 3 pts

### 5. Skills Section (15 pts)
- Skills grouped by category (e.g., Languages, Frameworks, Tools, Cloud): up to 5 pts
- Depth of skills list (not just 3-4 generic tools): up to 5 pts
- No obsolete or irrelevant skills for the domain (e.g., MS Paint listed as a skill): up to 5 pts
  - DEDUCT 1 pt per clearly irrelevant or trivial skill listed

### 6. Projects (10 pts)
- Each project includes: title, tech stack, brief description: up to 4 pts
- At least one project has a measurable outcome or live link: up to 3 pts
- Projects are relevant to stated skills/domains: up to 3 pts

### 7. Formatting & ATS Compatibility (10 pts)
- No tables, images, headers/footers, or multi-column layouts detected (infer from OCR quality and structure): up to 4 pts
- Consistent date formatting throughout: 2 pts
- Section headings are standard and recognizable (Experience, Education, Skills, Projects): 2 pts
- Font/whitespace issues detectable from OCR artifacts (deduct if messy): up to 2 pts

### 8. Overall Completeness & Professionalism (5 pts)
- Resume length appropriate for experience level (fresher: 1 page, mid: 1-2, senior: 2): 2 pts
- No spelling/grammar issues detectable in text: 2 pts
- No personal details that should not appear (photo, religion, marital status): 1 pt

---

## SCORING INSTRUCTIONS

1. Score each dimension individually.
2. Add all dimension scores to get a total out of 100.
3. Do NOT round up generously. If something is partially done, give partial credit only.
4. The final score must reflect genuine ATS compatibility " a score of 90+ should be RARE and only for near-perfect resumes.
5. Typical ranges: Fresher with decent resume: 45-60. Mid-level solid resume: 60-75. Senior well-optimized resume: 75"88. Near-perfect: 89"95.

---

## OUTPUT FORMAT

Respond ONLY with a valid JSON object. No preamble, no explanation, no markdown fences.

{{
  "dimension_scores": {{
    "contact_information": <0-5>,
    "keyword_density": <0-20>,
    "work_experience_quality": <0-25>,
    "education": <0-10>,
    "skills_section": <0-15>,
    "projects": <0-10>,
    "formatting_ats_compatibility": <0-10>,
    "completeness_professionalism": <0-5>
  }},
  "total_score": <0-100>,
  "critical_gaps": ["<specific issue 1>", "<specific issue 2>", ...],
  "top_strengths": ["<strength 1>", "<strength 2>", ...]
}}
"""

    