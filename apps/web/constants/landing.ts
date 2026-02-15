export const FEATURES = [
  { icon: "🧬", title: "Confidence Analysis", desc: "Filler word frequency, speech rate, and pause patterns combine into a real-time confidence score. Powered by librosa audio feature extraction.",  color: "#5c9fff", bg: "rgba(92,159,255,0.08)" },
  { icon: "📑", title: "Smart Resume Parsing", desc: "Upload a PDF or DOCX — skills, roles, and keywords are extracted via LLM parsing and stored in Qdrant for deep semantic retrieval during interviews.",  color: "#ff6b6b", bg: "rgba(255,107,107,0.08)" },
  { icon: "🎯", title: "Adaptive Question Flow", desc: "Questions adapt in real-time. Strong reply? The AI goes deeper. Struggled? It pivots to scaffolding follow-ups. Powered by GPT-o3 with streaming.",  color: "#00e5b0", bg: "rgba(0,229,176,0.08)" },
];

export const STEPS = [
  { num: "01", icon: "📄", title: "Upload Your Resume", desc: "We parse your resume and job description to extract skills, experience, and gaps. Stored securely and referenced by the AI throughout your session." },
  { num: "02", icon: "🧠", title: "AI Generates Questions", desc: "GPT-o3 crafts a personalized question set — technical, behavioral, and situational — calibrated to your experience level and target role." },
  { num: "03", icon: "🎥", title: "Live Video Interview", desc: "Your face is visible; the AI speaks in real-time audio. Answers are transcribed and analyzed for tone, vocabulary, and technical depth." },
  { num: "04", icon: "📊", title: "Deep Feedback Report", desc: "Receive a scored breakdown: confidence, vocab richness, topic mastery. The AI remembers your history via Mem0 to track long-term improvement." },
];

export const STACK = [
  { label: "React + TypeScript", color: "#00e5b0" },
  { label: "Python FastAPI",     color: "#5c9fff" },
  { label: "OpenAI GPT-o3",     color: "#ff6b6b" },
  { label: "Whisper ASR",       color: "#00e5b0" },
  { label: "Mem0 Memory",       color: "#c97fff" },
  { label: "Valkey Queue",      color: "#ffd15c" },
  { label: "MongoDB",           color: "#5c9fff" },
  { label: "Qdrant Vector DB",  color: "#00e5b0" },
  { label: "Neo4j Graph DB",    color: "#ff6b6b" },
  { label: "Better Auth",       color: "#c97fff" },
  { label: "Docker + Compose",  color: "#00e5b0" },
  { label: "WebRTC / LiveKit",  color: "#ffd15c" },
  { label: "ImageKit CDN",      color: "#5c9fff" },
  { label: "Prisma ORM",        color: "#ff6b6b" },
];

export const SCORES = [
  { label: "Vocabulary Richness", val: 88, color: "#00e5b0" },
  { label: "Technical Depth",     val: 74, color: "#5c9fff" },
  { label: "Confidence Signal",   val: 81, color: "#c97fff" },
  { label: "Clarity & Structure", val: 92, color: "#ffd15c" },
];

export const LIVE_SCORES = [
  { label: "Confidence", val: 84, color: "#00e5b0" },
  { label: "Clarity",    val: 91, color: "#5c9fff" },
  { label: "Depth",      val: 78, color: "#c97fff" },
];

export const WAVE_BARS = [
  { delay: 0,    h: 8  },
  { delay: 0.1,  h: 16 },
  { delay: 0.2,  h: 24 },
  { delay: 0.3,  h: 18 },
  { delay: 0.4,  h: 10 },
  { delay: 0.5,  h: 22 },
  { delay: 0.15, h: 14 },
  { delay: 0.25, h: 8  },
];