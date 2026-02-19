import { getIcon } from 'material-file-icons';

const TEXT_EXTENSIONS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
  'json', 'md', 'mdx', 'txt', 'csv', 'log',
  'html', 'htm', 'css', 'scss', 'less', 'sass',
  'xml', 'svg', 'yaml', 'yml', 'toml',
  'py', 'rb', 'rs', 'go', 'java', 'kt', 'scala',
  'c', 'h', 'cpp', 'hpp', 'cc', 'cxx',
  'cs', 'swift', 'dart', 'lua', 'php',
  'sh', 'bash', 'zsh', 'fish', 'bat', 'ps1',
  'sql', 'graphql', 'gql',
  'env', 'gitignore', 'dockerignore', 'editorconfig',
  'lock', 'conf', 'cfg', 'ini', 'properties',
  'vue', 'svelte', 'astro',
]);

const KNOWN_TEXT_FILES = new Set([
  'makefile', 'dockerfile', 'procfile', 'gemfile',
  'rakefile', 'license', 'readme', 'changelog',
  '.gitignore', '.dockerignore', '.editorconfig',
  '.env', '.env.local', '.env.development', '.env.production',
  '.prettierrc', '.eslintrc', '.babelrc',
]);

export function isTextFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  if (KNOWN_TEXT_FILES.has(lower)) return true;
  const ext = lower.split('.').pop() ?? '';
  return TEXT_EXTENSIONS.has(ext);
}

export function getFileIconSvg(filename: string): string {
  try {
    return getIcon(filename).svg;
  } catch {
    return '';
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const LANG_MAP: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript',
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  json: 'json',
  html: 'html', htm: 'html',
  css: 'css', scss: 'css', less: 'css',
  md: 'markdown', mdx: 'markdown',
  py: 'python',
  yaml: 'yaml', yml: 'yaml',
  xml: 'xml', svg: 'xml',
  rs: 'rust',
  c: 'cpp', h: 'cpp', cpp: 'cpp', hpp: 'cpp', cc: 'cpp', cxx: 'cpp',
  java: 'java', kt: 'java', scala: 'java',
  sql: 'sql',
  go: 'go',
  php: 'php',
  sh: 'text', bash: 'text', zsh: 'text',
};

export function getLanguageFromFilename(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  return LANG_MAP[ext] ?? 'text';
}
