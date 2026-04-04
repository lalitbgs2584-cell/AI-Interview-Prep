import { promises as fs } from "fs";
import path from "path";

const RECORDING_DIRECTORIES = ["saved-recordings", "recordings"] as const;
const RECORDING_EXTENSIONS = [".webm", ".mp4"] as const;

export interface StoredRecording {
  name: string;
  url: string;
  createdAt: string;
  size: number;
}

const isRecordingFile = (name: string) =>
  RECORDING_EXTENSIONS.some((extension) => name.toLowerCase().endsWith(extension));

const matchesInterview = (name: string, interviewId?: string | null) => {
  if (!interviewId) return true;

  return (
    name.startsWith(`interview-${interviewId}-`) ||
    name.includes(interviewId)
  );
};

async function getExistingRecordingDirectories() {
  const candidates = RECORDING_DIRECTORIES.map((directory) =>
    path.join(process.cwd(), directory),
  );

  const directories = await Promise.all(
    candidates.map(async (directory) => {
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

export async function ensureRecordingDirectory() {
  const directory = path.join(process.cwd(), RECORDING_DIRECTORIES[0]);
  await fs.mkdir(directory, { recursive: true });
  return directory;
}

export async function listStoredRecordings(interviewId?: string | null) {
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
                url: `/api/recordings/${encodeURIComponent(name)}`,
                createdAt: stat.mtime.toISOString(),
                size: stat.size,
              } satisfies StoredRecording;
            } catch {
              return null;
            }
          }),
      );
    }),
  );

  return recordings
    .flat()
    .filter((recording): recording is StoredRecording => Boolean(recording))
    .sort(
      (left, right) =>
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
    );
}

export async function resolveStoredRecordingPath(name: string) {
  const directories = await getExistingRecordingDirectories();

  for (const directory of directories) {
    const fullPath = path.join(directory, name);
    try {
      await fs.access(fullPath);
      return fullPath;
    } catch {
      continue;
    }
  }

  return null;
}
