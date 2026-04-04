import { promises as fs } from "fs";
import path from "path";

const RECORDING_EXTENSIONS = [".webm", ".mp4"] as const;
const RECORDING_DIRECTORY_CANDIDATES = [
  path.resolve(process.cwd(), "apps", "web", "saved-recordings"),
  path.resolve(process.cwd(), "apps", "web", "recordings"),
  path.resolve(process.cwd(), "..", "web", "saved-recordings"),
  path.resolve(process.cwd(), "..", "web", "recordings"),
] as const;

export interface AdminStoredRecording {
  name: string;
  url: string;
  createdAt: string;
  size: number;
}

function isRecordingFile(name: string) {
  const lower = name.toLowerCase();
  return RECORDING_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

function matchesInterview(name: string, interviewId?: string | null) {
  if (!interviewId) return true;
  return name.startsWith(`interview-${interviewId}`) || name.includes(interviewId);
}

async function getExistingRecordingDirectories() {
  const uniqueDirectories = [...new Set(RECORDING_DIRECTORY_CANDIDATES)];
  const directories = await Promise.all(
    uniqueDirectories.map(async (directory) => {
      try {
        const stat = await fs.stat(directory);
        return stat.isDirectory() ? directory : null;
      } catch {
        return null;
      }
    }),
  );

  return directories.filter((directory): directory is string => Boolean(directory));
}

export async function listAdminRecordings(interviewId?: string | null) {
  const directories = await getExistingRecordingDirectories();
  if (!directories.length) return [];

  const recordings = await Promise.all(
    directories.map(async (directory) => {
      const entries = await fs.readdir(directory);
      return Promise.all(
        entries
          .filter(isRecordingFile)
          .filter((name) => matchesInterview(name, interviewId))
          .map(async (name) => {
            const fullPath = path.join(directory, name);
            try {
              const stat = await fs.stat(fullPath);
              return {
                name,
                url: `/api/admin/recordings/${encodeURIComponent(name)}`,
                createdAt: stat.mtime.toISOString(),
                size: stat.size,
              } satisfies AdminStoredRecording;
            } catch {
              return null;
            }
          }),
      );
    }),
  );

  return recordings
    .flat()
    .filter((item): item is AdminStoredRecording => Boolean(item))
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

export async function resolveAdminRecordingPath(name: string) {
  const safeName = path.basename(name);
  const directories = await getExistingRecordingDirectories();

  for (const directory of directories) {
    const fullPath = path.join(directory, safeName);
    try {
      await fs.access(fullPath);
      return fullPath;
    } catch {
      continue;
    }
  }

  return null;
}
