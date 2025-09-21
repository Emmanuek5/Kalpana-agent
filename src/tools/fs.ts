import fs from "node:fs/promises";
import path from "node:path";
import { getActiveSandbox } from "../sandbox";

export interface WriteFileInput {
  relativePath: string; // relative to /workspace in the container and host volume
  content: string;
}

export interface ReadFileInput {
  relativePath: string;
}

export interface ListDirInput {
  relativePath?: string;
  recursive?: boolean;
}

export interface MakeDirInput {
  relativePath: string;
  recursive?: boolean;
}

export interface DeleteInput {
  relativePath: string;
  recursive?: boolean;
}

export interface CopyInput {
  sourcePath: string;
  destinationPath: string;
}

export interface MoveInput {
  sourcePath: string;
  destinationPath: string;
}

export interface FileStatsInput {
  relativePath: string;
}

function toHostPath(relativePath = "") {
  const { hostVolumePath } = getActiveSandbox();
  const p = path.resolve(hostVolumePath, relativePath);
  if (!p.startsWith(hostVolumePath))
    throw new Error("Path escapes sandbox volume");
  return p;
}

export async function fsWriteFile({ relativePath, content }: WriteFileInput) {
  const target = toHostPath(relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, "utf8");
  return { ok: true } as const;
}

export async function fsReadFile({ relativePath }: ReadFileInput) {
  const target = toHostPath(relativePath);
  const text = await fs.readFile(target, "utf8");
  return { text };
}

export async function fsListDir({
  relativePath = ".",
  recursive = false,
}: ListDirInput) {
  const target = toHostPath(relativePath);

  if (!recursive) {
    const entries = await fs.readdir(target, { withFileTypes: true });
    return entries.map((e) => ({
      name: e.name,
      type: e.isDirectory() ? "dir" : "file",
      path: path.posix.join(relativePath, e.name),
    }));
  }

  // Recursive listing
  const results: Array<{ name: string; type: string; path: string }> = [];

  async function scanDirectory(dirPath: string, relativeBase: string) {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const relativePath = path.posix.join(relativeBase, entry.name);

        results.push({
          name: entry.name,
          type: entry.isDirectory() ? "dir" : "file",
          path: relativePath,
        });

        if (entry.isDirectory()) {
          await scanDirectory(fullPath, relativePath);
        }
      }
    } catch (error) {
      // Skip directories we can't read
    }
  }

  await scanDirectory(target, relativePath);
  return results;
}

export async function fsMakeDir({
  relativePath,
  recursive = true,
}: MakeDirInput) {
  const target = toHostPath(relativePath);
  await fs.mkdir(target, { recursive });
  return { ok: true, path: relativePath };
}

export async function fsDelete({
  relativePath,
  recursive = false,
}: DeleteInput) {
  const target = toHostPath(relativePath);

  try {
    const stats = await fs.stat(target);
    if (stats.isDirectory()) {
      await fs.rmdir(target, { recursive });
    } else {
      await fs.unlink(target);
    }
    return { ok: true, deleted: relativePath };
  } catch (error) {
    return {
      ok: false,
      error: `Failed to delete ${relativePath}: ${(error as Error).message}`,
    };
  }
}

export async function fsCopy({ sourcePath, destinationPath }: CopyInput) {
  const source = toHostPath(sourcePath);
  const destination = toHostPath(destinationPath);

  try {
    // Create destination directory if it doesn't exist
    await fs.mkdir(path.dirname(destination), { recursive: true });

    const stats = await fs.stat(source);
    if (stats.isDirectory()) {
      // Copy directory recursively
      await fs.cp(source, destination, { recursive: true });
    } else {
      // Copy file
      await fs.copyFile(source, destination);
    }

    return { ok: true, copied: `${sourcePath} → ${destinationPath}` };
  } catch (error) {
    return {
      ok: false,
      error: `Failed to copy ${sourcePath} to ${destinationPath}: ${
        (error as Error).message
      }`,
    };
  }
}

export async function fsMove({ sourcePath, destinationPath }: MoveInput) {
  const source = toHostPath(sourcePath);
  const destination = toHostPath(destinationPath);

  try {
    // Create destination directory if it doesn't exist
    await fs.mkdir(path.dirname(destination), { recursive: true });

    await fs.rename(source, destination);
    return { ok: true, moved: `${sourcePath} → ${destinationPath}` };
  } catch (error) {
    return {
      ok: false,
      error: `Failed to move ${sourcePath} to ${destinationPath}: ${
        (error as Error).message
      }`,
    };
  }
}

export async function fsStats({ relativePath }: FileStatsInput) {
  const target = toHostPath(relativePath);

  try {
    const stats = await fs.stat(target);
    return {
      ok: true,
      stats: {
        type: stats.isDirectory()
          ? "directory"
          : stats.isFile()
          ? "file"
          : "other",
        size: stats.size,
        created: stats.birthtime.toISOString(),
        modified: stats.mtime.toISOString(),
        permissions: stats.mode.toString(8),
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: `Failed to get stats for ${relativePath}: ${
        (error as Error).message
      }`,
    };
  }
}
