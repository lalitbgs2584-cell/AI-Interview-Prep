export interface DocFileEntry {
  path: string;
  summary: string;
  area: string;
  tags: string[];
}

export interface DocSection {
  id: string;
  title: string;
  summary: string;
  bullets: string[];
  files: string[];
  tags: string[];
}

export interface DocAssistantReply {
  answer: string;
  highlights: string[];
  relatedFiles: DocFileEntry[];
  relatedSections: DocSection[];
}

export const adminDocFiles: DocFileEntry[] = [
  {
    path: 'apps/admin/app/(dashboard)/page.tsx',
    summary: 'Main admin dashboard with KPI cards, recent sessions, flagged sessions, and top-skill overview.',
    area: 'Admin UI',
    tags: ['dashboard', 'kpi', 'overview', 'stats'],
  },
  {
    path: 'apps/admin/app/users/page.tsx',
    summary: 'Admin CRM list for users, with search, role filter, block and role toggle actions.',
    area: 'Admin UI',
    tags: ['users', 'crm', 'block', 'role'],
  },
  {
    path: 'apps/admin/app/users/[id]/page.tsx',
    summary: 'Deep user profile page with tabs for interviews, resume data, skills, and interview recordings.',
    area: 'Admin UI',
    tags: ['user detail', 'recordings', 'resume', 'skills'],
  },
  {
    path: 'apps/admin/app/interviews/page.tsx',
    summary: 'Global interview browser for admins, with filtering by type and status.',
    area: 'Admin UI',
    tags: ['interviews', 'session list', 'filters'],
  },
  {
    path: 'apps/admin/app/interviews/[id]/page.tsx',
    summary: 'Single interview inspector with question-by-question breakdown and video playback.',
    area: 'Admin UI',
    tags: ['interview detail', 'recording', 'evaluation', 'questions'],
  },
  {
    path: 'apps/admin/lib/admin-api.ts',
    summary: 'Typed fetch layer used by the admin frontend for dashboard, users, interviews, and recordings.',
    area: 'Admin UI',
    tags: ['api client', 'fetch', 'types'],
  },
  {
    path: 'apps/admin/components/admin/AdminRecordingGallery.tsx',
    summary: 'Reusable admin video gallery used on user and interview detail pages.',
    area: 'Admin UI',
    tags: ['recordings', 'video', 'reusable'],
  },
  {
    path: 'apps/admin/components/layouts/Sidebar.tsx',
    summary: 'Admin navigation structure. Add routes here when new admin areas are introduced.',
    area: 'Admin UI',
    tags: ['sidebar', 'navigation', 'routes'],
  },
  {
    path: 'apps/ws-backend/src/routes/admin.routes.ts',
    summary: 'Express route map for the admin API namespace under /api/admin.',
    area: 'Backend',
    tags: ['admin api', 'routes', 'express'],
  },
  {
    path: 'apps/ws-backend/src/controllers/admin.controller.ts',
    summary: 'Main backend logic for admin dashboard data, users, interviews, and recording endpoints.',
    area: 'Backend',
    tags: ['controller', 'admin', 'users', 'interviews', 'recordings'],
  },
  {
    path: 'apps/ws-backend/src/middlewares/error.middlewares.ts',
    summary: 'Shared auth middleware plus the admin-only guard that checks role, block state, and deletion state.',
    area: 'Backend',
    tags: ['middleware', 'admin guard', 'auth'],
  },
  {
    path: 'apps/ws-backend/src/utils/adminRecordings.ts',
    summary: 'Reads local saved-recordings and resolves file paths for admin playback.',
    area: 'Backend',
    tags: ['recordings', 'file system', 'video'],
  },
  {
    path: 'apps/web/app/api/save-recording/route.ts',
    summary: 'Stores user interview recordings locally in saved-recordings.',
    area: 'Web App',
    tags: ['save recording', 'local storage', 'web'],
  },
  {
    path: 'apps/web/lib/interview-recordings.server.ts',
    summary: 'Shared recording lookup logic used by the web app for playback and metadata.',
    area: 'Web App',
    tags: ['recording helper', 'server util'],
  },
  {
    path: 'apps/web/app/interview/[id]/page.tsx',
    summary: 'Main user interview experience including fullscreen rules, screen share, chat, and recording start.',
    area: 'Web App',
    tags: ['interview page', 'fullscreen', 'screenshare', 'recording'],
  },
];

export const adminDocSections: DocSection[] = [
  {
    id: 'admin-overview',
    title: 'Admin Architecture Overview',
    summary: 'The admin panel is a Next.js app that talks to the ws-backend through a guarded /api/admin namespace.',
    bullets: [
      'The frontend lives in apps/admin and uses a small typed API client in apps/admin/lib/admin-api.ts.',
      'The backend data is served from apps/ws-backend/src/controllers/admin.controller.ts.',
      'Admin route protection is handled in apps/ws-backend/src/middlewares/error.middlewares.ts via adminMiddleware.',
      'Interview videos are read from the local saved-recordings folder through apps/ws-backend/src/utils/adminRecordings.ts.',
    ],
    files: [
      'apps/admin/lib/admin-api.ts',
      'apps/ws-backend/src/controllers/admin.controller.ts',
      'apps/ws-backend/src/middlewares/error.middlewares.ts',
      'apps/ws-backend/src/utils/adminRecordings.ts',
    ],
    tags: ['architecture', 'admin', 'backend', 'frontend'],
  },
  {
    id: 'recording-flow',
    title: 'Interview Recording Flow',
    summary: 'User sessions record locally, the web app can replay them, and admins can inspect the same recordings from the admin side.',
    bullets: [
      'The user app saves videos through apps/web/app/api/save-recording/route.ts.',
      'The admin backend exposes /api/admin/recordings and /api/admin/recordings/:name for playback.',
      'The user profile page and interview detail page in admin both use AdminRecordingGallery.',
      'This is local-file based right now, so later migration to S3 or R2 only needs the storage helper swapped out.',
    ],
    files: [
      'apps/web/app/api/save-recording/route.ts',
      'apps/ws-backend/src/utils/adminRecordings.ts',
      'apps/admin/components/admin/AdminRecordingGallery.tsx',
      'apps/admin/app/users/[id]/page.tsx',
      'apps/admin/app/interviews/[id]/page.tsx',
    ],
    tags: ['recordings', 'video', 'playback', 'storage'],
  },
  {
    id: 'user-management',
    title: 'User Management Flow',
    summary: 'Admins can search users, open a full profile, block or unblock them, and change roles from the UI.',
    bullets: [
      'The user list pulls from GET /api/admin/users.',
      'User detail pulls from GET /api/admin/users/:id and includes resume data, interviews, and recordings.',
      'Role and block changes go through PATCH /api/admin/users/:id.',
      'The core UI files for this flow are users/page.tsx and users/[id]/page.tsx.',
    ],
    files: [
      'apps/admin/app/users/page.tsx',
      'apps/admin/app/users/[id]/page.tsx',
      'apps/ws-backend/src/routes/admin.routes.ts',
      'apps/ws-backend/src/controllers/admin.controller.ts',
    ],
    tags: ['users', 'admin actions', 'role', 'block'],
  },
  {
    id: 'where-to-edit',
    title: 'Where To Edit What',
    summary: 'This is the quick file map for common admin changes so you do not have to hunt around the repo.',
    bullets: [
      'Add a new admin page: apps/admin/app/<route>/page.tsx and apps/admin/components/layouts/Sidebar.tsx.',
      'Add a new admin API endpoint: apps/ws-backend/src/routes/admin.routes.ts and apps/ws-backend/src/controllers/admin.controller.ts.',
      'Change admin auth rules: apps/ws-backend/src/middlewares/error.middlewares.ts.',
      'Change local recording behavior: apps/ws-backend/src/utils/adminRecordings.ts and apps/web/app/api/save-recording/route.ts.',
    ],
    files: [
      'apps/admin/components/layouts/Sidebar.tsx',
      'apps/ws-backend/src/routes/admin.routes.ts',
      'apps/ws-backend/src/controllers/admin.controller.ts',
      'apps/ws-backend/src/middlewares/error.middlewares.ts',
      'apps/ws-backend/src/utils/adminRecordings.ts',
    ],
    tags: ['file map', 'edit guide', 'navigation'],
  },
];

function tokenize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s/\-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function scoreMatch(question: string, haystack: string[]) {
  const terms = tokenize(question);
  if (!terms.length) return 0;

  const combined = haystack.join(' ').toLowerCase();
  return terms.reduce((score, term) => {
    if (combined.includes(term)) return score + 2;
    if (combined.includes(term.slice(0, Math.max(3, term.length - 2)))) return score + 1;
    return score;
  }, 0);
}

export function buildDocAssistantReply(question: string): DocAssistantReply {
  const rankedSections = [...adminDocSections]
    .map((section) => ({
      section,
      score: scoreMatch(question, [section.title, section.summary, section.tags.join(' '), section.bullets.join(' '), section.files.join(' ')]),
    }))
    .sort((left, right) => right.score - left.score)
    .filter((entry) => entry.score > 0)
    .slice(0, 3)
    .map((entry) => entry.section);

  const rankedFiles = [...adminDocFiles]
    .map((file) => ({
      file,
      score: scoreMatch(question, [file.path, file.summary, file.area, file.tags.join(' ')]),
    }))
    .sort((left, right) => right.score - left.score)
    .filter((entry) => entry.score > 0)
    .slice(0, 5)
    .map((entry) => entry.file);

  if (!rankedSections.length && !rankedFiles.length) {
    return {
      answer: 'I could not find a strong direct match in the built-in docs yet. Try asking about admin users, interview recordings, routes, auth, dashboard, or file locations.',
      highlights: [
        'Try a narrower prompt like where is admin auth checked? or which file shows user interview videos?',
      ],
      relatedFiles: adminDocFiles.slice(0, 4),
      relatedSections: adminDocSections.slice(0, 2),
    };
  }

  const answerParts: string[] = [];
  if (rankedSections[0]) {
    answerParts.push(rankedSections[0].summary);
  }
  if (rankedFiles[0]) {
    answerParts.push(`The most relevant file is ${rankedFiles[0].path}.`);
  }

  const highlights = rankedSections.flatMap((section) => section.bullets).slice(0, 4);

  return {
    answer: answerParts.join(' '),
    highlights,
    relatedFiles: rankedFiles,
    relatedSections: rankedSections,
  };
}
