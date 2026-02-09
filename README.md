# CCRemote

Control remoto para sesiones de [Claude Code](https://claude.ai/claude-code) desde el navegador (escritorio y movil). Gestiona multiples sesiones de Claude Code en tu servidor via tmux y accede a ellas desde cualquier dispositivo de tu red Tailscale.

## Requisitos

- **Node.js** >= 18
- **tmux** >= 2.9
- **Tailscale** configurado y conectado
- **Claude Code** instalado (`claude` en PATH)

## Instalacion

```bash
git clone <repo-url> && cd CCRemote
npm install
npm run build
```

## Uso

### Arrancar el daemon

```bash
# En foreground (recomendado para desarrollo)
npx tsx packages/daemon/bin/ccremote.ts start -f

# En background (produccion)
npx tsx packages/daemon/bin/ccremote.ts start
```

### Conectar desde el movil

```bash
# Muestra un QR con la URL + token para escanear desde el movil
npx tsx packages/daemon/bin/ccremote.ts qr
```

### Gestionar sesiones (CLI)

```bash
# Crear sesion
npx tsx packages/daemon/bin/ccremote.ts new --project /ruta/al/proyecto

# Listar sesiones
npx tsx packages/daemon/bin/ccremote.ts list

# Conectar terminal nativa a una sesion
npx tsx packages/daemon/bin/ccremote.ts attach <sessionId>

# Matar sesion
npx tsx packages/daemon/bin/ccremote.ts kill <sessionId>

# Ver token de autenticacion
npx tsx packages/daemon/bin/ccremote.ts token

# Parar daemon
npx tsx packages/daemon/bin/ccremote.ts stop
```

### Gestionar sesiones (PWA)

Desde la PWA (accesible en `https://<tu-hostname>:9876`) puedes:

- Ver todas las sesiones activas con su estado
- Crear nuevas sesiones con navegador de directorios
- Interactuar con Claude Code via terminal integrada (xterm.js)
- Matar sesiones
- Navegar menus de opciones de Claude Code con la toolbar movil

## Arquitectura

```
CCRemote/
  shared/           Tipos TypeScript compartidos (protocolo WS, tipos de sesion)
  packages/daemon/   CLI + servidor WebSocket + gestion de sesiones tmux
  packages/pwa/      Frontend React (PWA) con xterm.js
```

### Flujo de datos

1. El **daemon** crea sesiones de Claude Code dentro de sesiones tmux
2. Un **reader PTY** de solo lectura se conecta a cada sesion tmux para detectar actividad
3. Al detectar actividad, `tmux capture-pane -p -e` captura un snapshot de la pantalla
4. El snapshot se envia via **WebSocket** a los clientes PWA conectados
5. **xterm.js** en la PWA renderiza el snapshot
6. El input del usuario se envia como `send_key` al daemon, que lo inyecta en tmux

### Multi-cliente

- Varios clientes PWA (movil + escritorio) pueden conectarse simultaneamente
- La sesion tmux usa `window-size largest`: si hay una terminal nativa conectada (via `ccremote attach`), esta siempre dicta el tamano
- El input del teclado movil incluye una toolbar con teclas especiales (flechas, Esc, Tab, PgUp/PgDn, Enter, Ctrl+C)
- `mouse on` esta habilitado en tmux para scroll con rueda del raton en terminales nativas

### Seguridad

- Todo el trafico viaja por tu red **Tailscale** (WireGuard cifrado end-to-end)
- HTTPS con certificados de Tailscale cuando estan disponibles
- Autenticacion por **token** en cada conexion WebSocket
- El daemon no expone puertos a internet publico

## Desarrollo

```bash
# Desarrollo con hot-reload
npm run dev:daemon    # Daemon con tsx watch
npm run dev:pwa       # PWA con Vite HMR
npm run dev           # Ambos en paralelo

# Build completo
npm run build         # shared -> daemon -> pwa (en orden)

# Tests
npm test              # Todos los tests (Vitest)
npm run test:daemon   # Solo daemon
npm run test:pwa      # Solo PWA
```

## Configuracion

El daemon almacena su configuracion en `~/.config/ccremote/`:
- `ccremote.db` — Base de datos SQLite (tokens, sesiones)
- `daemon.pid` — PID del proceso daemon

Los certificados HTTPS de Tailscale se buscan automaticamente en:
- `~/.local/share/tailscale/certs/`
- `/var/lib/tailscale/certs/`

## Stack

- **TypeScript** (strict mode, monorepo con workspaces)
- **React 18** + **Tailwind CSS** (PWA mobile-first, tema oscuro)
- **xterm.js** (emulador de terminal en el navegador)
- **ws** (servidor WebSocket)
- **better-sqlite3** (almacenamiento local)
- **node-pty** + **tmux** (gestion de sesiones de terminal)
- **Vite** + **vite-plugin-pwa** (build y service worker)
