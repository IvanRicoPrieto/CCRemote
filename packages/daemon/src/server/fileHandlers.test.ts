import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validatePathInProject, listDirectory, readFileContent, writeFileContent } from './fileHandlers.js';

let testDir: string;

beforeAll(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'ccremote-test-'));
  // Create test structure
  await mkdir(join(testDir, 'src'));
  await mkdir(join(testDir, '.hidden-dir'));
  await writeFile(join(testDir, 'README.md'), '# Test');
  await writeFile(join(testDir, '.gitignore'), 'node_modules');
  await writeFile(join(testDir, 'src', 'index.ts'), 'console.log("hello");');
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe('validatePathInProject', () => {
  it('acepta rutas dentro del proyecto', () => {
    expect(validatePathInProject(testDir, join(testDir, 'src'))).toBe(join(testDir, 'src'));
  });

  it('acepta el propio proyecto', () => {
    expect(validatePathInProject(testDir, testDir)).toBe(testDir);
  });

  it('rechaza path traversal con ../', () => {
    expect(validatePathInProject(testDir, join(testDir, '..', 'etc', 'passwd'))).toBeNull();
  });

  it('rechaza rutas absolutas fuera del proyecto', () => {
    expect(validatePathInProject(testDir, '/etc/passwd')).toBeNull();
  });
});

describe('listDirectory', () => {
  it('lista archivos y directorios', async () => {
    const result = await listDirectory(testDir, testDir);
    expect(result.error).toBeUndefined();
    const names = result.entries.map((e) => e.name);
    expect(names).toContain('src');
    expect(names).toContain('README.md');
  });

  it('incluye archivos ocultos', async () => {
    const result = await listDirectory(testDir, testDir);
    const names = result.entries.map((e) => e.name);
    expect(names).toContain('.gitignore');
    expect(names).toContain('.hidden-dir');
  });

  it('ordena directorios primero', async () => {
    const result = await listDirectory(testDir, testDir);
    const firstFile = result.entries.findIndex((e) => !e.isDirectory);
    const lastDirIdx = result.entries.reduce((acc, e, i) => (e.isDirectory ? i : acc), -1);
    if (firstFile !== -1 && lastDirIdx !== -1) {
      expect(lastDirIdx).toBeLessThan(firstFile);
    }
  });

  it('incluye tamaño de archivos', async () => {
    const result = await listDirectory(testDir, testDir);
    const readme = result.entries.find((e) => e.name === 'README.md');
    expect(readme).toBeDefined();
    expect(readme!.size).toBeGreaterThan(0);
  });

  it('rechaza rutas fuera del proyecto', async () => {
    const result = await listDirectory(testDir, '/etc');
    expect(result.error).toBe('Ruta fuera del proyecto');
  });
});

describe('readFileContent', () => {
  it('lee archivo dentro del proyecto', async () => {
    const result = await readFileContent(testDir, join(testDir, 'README.md'));
    expect(result.error).toBeUndefined();
    expect(result.content).toBe('# Test');
  });

  it('rechaza rutas fuera del proyecto', async () => {
    const result = await readFileContent(testDir, '/etc/passwd');
    expect(result.error).toBe('Ruta fuera del proyecto');
  });

  it('retorna error para archivo inexistente', async () => {
    const result = await readFileContent(testDir, join(testDir, 'noexiste.txt'));
    expect(result.error).toContain('No se puede leer');
  });
});

describe('writeFileContent', () => {
  it('escribe archivo dentro del proyecto', async () => {
    const filePath = join(testDir, 'output.txt');
    const result = await writeFileContent(testDir, filePath, 'hola mundo');
    expect(result.success).toBe(true);

    const readResult = await readFileContent(testDir, filePath);
    expect(readResult.content).toBe('hola mundo');
  });

  it('rechaza rutas fuera del proyecto', async () => {
    const result = await writeFileContent(testDir, '/tmp/evil.txt', 'hack');
    expect(result.error).toBe('Ruta fuera del proyecto');
    expect(result.success).toBe(false);
  });

  it('rechaza contenido demasiado grande', async () => {
    const bigContent = 'x'.repeat(1_048_577);
    const result = await writeFileContent(testDir, join(testDir, 'big.txt'), bigContent);
    expect(result.error).toContain('demasiado grande');
    expect(result.success).toBe(false);
  });
});
