import { describe, it, expect } from 'vitest';
import { isTextFile, formatFileSize, getLanguageFromFilename } from './fileUtils.js';

describe('isTextFile', () => {
  it('reconoce archivos TypeScript', () => {
    expect(isTextFile('app.ts')).toBe(true);
    expect(isTextFile('Component.tsx')).toBe(true);
  });

  it('reconoce archivos sin extensión conocidos', () => {
    expect(isTextFile('Makefile')).toBe(true);
    expect(isTextFile('Dockerfile')).toBe(true);
    expect(isTextFile('.gitignore')).toBe(true);
  });

  it('reconoce archivos de configuración', () => {
    expect(isTextFile('.env')).toBe(true);
    expect(isTextFile('.prettierrc')).toBe(true);
    expect(isTextFile('config.yaml')).toBe(true);
  });

  it('rechaza archivos binarios', () => {
    expect(isTextFile('image.png')).toBe(false);
    expect(isTextFile('video.mp4')).toBe(false);
    expect(isTextFile('archive.zip')).toBe(false);
  });
});

describe('formatFileSize', () => {
  it('formatea bytes', () => {
    expect(formatFileSize(500)).toBe('500 B');
  });

  it('formatea kilobytes', () => {
    expect(formatFileSize(2048)).toBe('2.0 KB');
  });

  it('formatea megabytes', () => {
    expect(formatFileSize(1_500_000)).toBe('1.4 MB');
  });

  it('retorna vacío para 0', () => {
    expect(formatFileSize(0)).toBe('');
  });
});

describe('getLanguageFromFilename', () => {
  it('detecta TypeScript', () => {
    expect(getLanguageFromFilename('app.ts')).toBe('typescript');
    expect(getLanguageFromFilename('app.tsx')).toBe('typescript');
  });

  it('detecta Python', () => {
    expect(getLanguageFromFilename('script.py')).toBe('python');
  });

  it('detecta YAML', () => {
    expect(getLanguageFromFilename('config.yml')).toBe('yaml');
  });

  it('retorna text para extensiones desconocidas', () => {
    expect(getLanguageFromFilename('data.xyz')).toBe('text');
  });
});
