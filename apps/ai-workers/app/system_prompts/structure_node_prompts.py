def structure_node_prompt(cleaned_text: str) -> str:
    return f"""You are expert resume parser. Extract EXACTLY this JSON structure.

RULES (CRITICAL):
- ONLY valid JSON. No text, no ```, no explanation. Invalid = FAIL.
- Escape quotes in data: \\\"
- Empty sections: [] or null/0
- Extract EVERY skill/tool (Git, VSCode, LangChain bhi)
- No merging entries - each separate object

RESUME:
{cleaned_text}

JSON OUTPUT:
{{
  "skills": [{{"name": "Python", "category": "Language"}}],
  "work_experience": [{{"company": "", "role": "", "duration": "", "description": ""}}],
  "education": [{{"institution": "", "degree": "", "duration": "", "grade": ""}}],
  "projects": [{{"title": "", "tech_stack": [], "description": ""}}],
  "extracurricular": [{{"title": "", "organization": "", "duration": "", "description": ""}}],
  "experienceLevel": 5,
  "key_skills": ["Python", "React", "Prisma"],
  "strong_domains": ["Backend, Fullstack"],
}}"""
