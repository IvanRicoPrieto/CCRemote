import type { Capabilities } from '@ccremote/shared';

export const capabilities: Capabilities = {
  models: [
    {
      id: 'sonnet',
      name: 'Sonnet',
      description: 'Rápido y capaz',
    },
    {
      id: 'opus',
      name: 'Opus',
      description: 'Más inteligente, más lento',
    },
    {
      id: 'haiku',
      name: 'Haiku',
      description: 'Ultra rápido, ligero',
    },
  ],
  modes: [
    {
      id: 'plan',
      name: 'Plan Mode',
      description: 'Claude planifica antes de actuar',
      requiresRestart: false,
      flag: '--plan',
    },
    {
      id: 'auto-accept',
      name: 'Auto Accept',
      description: 'Acepta cambios automáticamente',
      requiresRestart: false,
      flag: '--auto-accept',
    },
  ],
  commands: [
    {
      id: 'compact',
      name: '/compact',
      description: 'Compactar contexto de la sesión',
      input: '/compact',
    },
    {
      id: 'clear',
      name: '/clear',
      description: 'Limpiar sesión',
      input: '/clear',
    },
    {
      id: 'config',
      name: '/config',
      description: 'Ver configuración',
      input: '/config',
    },
    {
      id: 'help',
      name: '/help',
      description: 'Mostrar ayuda',
      input: '/help',
    },
    {
      id: 'review',
      name: '/review',
      description: 'Revisar cambios',
      input: '/review',
    },
    {
      id: 'bug',
      name: '/bug',
      description: 'Reportar bug',
      input: '/bug',
    },
  ],
};

export const DEFAULT_MODEL = 'opus';
