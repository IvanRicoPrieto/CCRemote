import { readdir, readFile, writeFile, stat, rm, mkdir, rename, access } from 'node:fs/promises';
import { resolve, relative, dirname } from 'node:path';
import type { FileListingEntry } from '@ccremote/shared';

const MAX_FILE_SIZE = 1_048_576; // 1MB

export function validatePathInProject(projectPath: string, targetPath: string): string | null {
  const resolved = resolve(projectPath, targetPath);
  const rel = relative(projectPath, resolved);
  if (rel.startsWith('..') || rel.startsWith('/')) {
    return null;
  }
  return resolved;
}

export async function listDirectory(
  projectPath: string,
  targetPath: string
): Promise<{ path: string; entries: FileListingEntry[]; error?: string }> {
  const resolvedPath = validatePathInProject(projectPath, targetPath || projectPath);
  if (!resolvedPath) {
    return { path: targetPath, entries: [], error: 'Ruta fuera del proyecto' };
  }

  try {
    const dirEntries = await readdir(resolvedPath, { withFileTypes: true });
    const entries: FileListingEntry[] = dirEntries
      .map((e) => ({ name: e.name, isDirectory: e.isDirectory(), size: 0 }))
      .sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      });

    // Get file sizes in parallel
    await Promise.all(
      entries
        .filter((e) => !e.isDirectory)
        .map(async (entry) => {
          try {
            const s = await stat(resolve(resolvedPath, entry.name));
            entry.size = s.size;
          } catch {
            /* ignore stat errors */
          }
        })
    );

    return { path: resolvedPath, entries };
  } catch {
    return { path: resolvedPath, entries: [], error: 'No se puede leer el directorio' };
  }
}

export async function readFileContent(
  projectPath: string,
  filePath: string
): Promise<{ path: string; content: string; error?: string }> {
  const resolved = validatePathInProject(projectPath, filePath);
  if (!resolved) {
    return { path: filePath, content: '', error: 'Ruta fuera del proyecto' };
  }

  try {
    const fileStat = await stat(resolved);
    if (fileStat.size > MAX_FILE_SIZE) {
      return { path: resolved, content: '', error: 'Archivo demasiado grande (max 1MB)' };
    }
    const content = await readFile(resolved, 'utf-8');
    return { path: resolved, content };
  } catch (err) {
    return { path: resolved, content: '', error: `No se puede leer: ${(err as Error).message}` };
  }
}

export async function writeFileContent(
  projectPath: string,
  filePath: string,
  content: string
): Promise<{ path: string; success: boolean; error?: string }> {
  const resolved = validatePathInProject(projectPath, filePath);
  if (!resolved) {
    return { path: filePath, success: false, error: 'Ruta fuera del proyecto' };
  }

  if (Buffer.byteLength(content, 'utf-8') > MAX_FILE_SIZE) {
    return { path: resolved, success: false, error: 'Contenido demasiado grande (max 1MB)' };
  }

  try {
    await writeFile(resolved, content, 'utf-8');
    return { path: resolved, success: true };
  } catch (err) {
    return { path: resolved, success: false, error: `No se puede escribir: ${(err as Error).message}` };
  }
}

export async function deleteFile(
  projectPath: string,
  filePath: string
): Promise<{ path: string; success: boolean; error?: string }> {
  const resolved = validatePathInProject(projectPath, filePath);
  if (!resolved) {
    return { path: filePath, success: false, error: 'Ruta fuera del proyecto' };
  }

  // Prevent deleting the project root itself
  if (resolve(resolved) === resolve(projectPath)) {
    return { path: resolved, success: false, error: 'No se puede eliminar la raíz del proyecto' };
  }

  try {
    const fileStat = await stat(resolved);
    await rm(resolved, { recursive: fileStat.isDirectory(), force: false });
    return { path: resolved, success: true };
  } catch (err) {
    return { path: resolved, success: false, error: `No se puede eliminar: ${(err as Error).message}` };
  }
}

export async function createFile(
  projectPath: string,
  filePath: string
): Promise<{ path: string; success: boolean; isDirectory: false; error?: string }> {
  const resolved = validatePathInProject(projectPath, filePath);
  if (!resolved) {
    return { path: filePath, success: false, isDirectory: false, error: 'Ruta fuera del proyecto' };
  }

  try {
    await access(resolved);
    return { path: resolved, success: false, isDirectory: false, error: 'Ya existe un archivo con ese nombre' };
  } catch {
    // File does not exist, good
  }

  try {
    await mkdir(dirname(resolved), { recursive: true });
    await writeFile(resolved, '', 'utf-8');
    return { path: resolved, success: true, isDirectory: false };
  } catch (err) {
    return { path: resolved, success: false, isDirectory: false, error: `No se puede crear: ${(err as Error).message}` };
  }
}

export async function createDirectory(
  projectPath: string,
  dirPath: string
): Promise<{ path: string; success: boolean; isDirectory: true; error?: string }> {
  const resolved = validatePathInProject(projectPath, dirPath);
  if (!resolved) {
    return { path: dirPath, success: false, isDirectory: true, error: 'Ruta fuera del proyecto' };
  }

  try {
    await access(resolved);
    return { path: resolved, success: false, isDirectory: true, error: 'Ya existe una carpeta con ese nombre' };
  } catch {
    // Does not exist, good
  }

  try {
    await mkdir(resolved, { recursive: true });
    return { path: resolved, success: true, isDirectory: true };
  } catch (err) {
    return { path: resolved, success: false, isDirectory: true, error: `No se puede crear: ${(err as Error).message}` };
  }
}

export async function renameFile(
  projectPath: string,
  oldPath: string,
  newPath: string
): Promise<{ oldPath: string; newPath: string; success: boolean; error?: string }> {
  const resolvedOld = validatePathInProject(projectPath, oldPath);
  const resolvedNew = validatePathInProject(projectPath, newPath);

  if (!resolvedOld || !resolvedNew) {
    return { oldPath, newPath, success: false, error: 'Ruta fuera del proyecto' };
  }

  // Prevent renaming the project root
  if (resolve(resolvedOld) === resolve(projectPath)) {
    return { oldPath: resolvedOld, newPath: resolvedNew, success: false, error: 'No se puede renombrar la raíz del proyecto' };
  }

  try {
    await access(resolvedNew);
    return { oldPath: resolvedOld, newPath: resolvedNew, success: false, error: 'Ya existe un archivo con ese nombre' };
  } catch {
    // Target does not exist, good
  }

  try {
    await mkdir(dirname(resolvedNew), { recursive: true });
    await rename(resolvedOld, resolvedNew);
    return { oldPath: resolvedOld, newPath: resolvedNew, success: true };
  } catch (err) {
    return { oldPath: resolvedOld, newPath: resolvedNew, success: false, error: `No se puede renombrar: ${(err as Error).message}` };
  }
}
