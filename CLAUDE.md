# CCRemote

## Instrucciones generales
- Este proyecto usa TypeScript estricto en todo el monorepo.
- Seguir TDD obligatoriamente (skill: test-driven-development).
- Antes de implementar cualquier funcionalidad, planificar (skill: writing-plans).
- El OutputParser es el componente más crítico: testearlo exhaustivamente.
- Mobile-first: la PWA se diseña primero para móvil.
- Tema oscuro por defecto.

## Estructura
Monorepo con workspaces: shared/, packages/daemon/, packages/pwa/

## Testing
- Daemon: Vitest
- PWA: Vitest + Testing Library
- E2E: Playwright (cuando haya integración daemon-PWA)

## Comandos útiles
```bash
# Desarrollo
npm run dev:daemon    # Arranca daemon en modo desarrollo
npm run dev:pwa       # Arranca PWA en modo desarrollo
npm run dev           # Arranca ambos

# Build
npm run build         # Build de todo el monorepo

# Tests
npm test              # Ejecuta todos los tests
npm run test:daemon   # Tests del daemon
npm run test:pwa      # Tests de la PWA
```

## Arquitectura
- **shared/**: Tipos TypeScript compartidos entre daemon y PWA
- **packages/daemon/**: CLI + WebSocket server que gestiona sesiones de Claude Code
- **packages/pwa/**: Frontend React para controlar sesiones desde el móvil
