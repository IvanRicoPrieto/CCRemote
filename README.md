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
# Instalar como servicio systemd (auto-start, auto-restart)
node packages/daemon/bin/ccremote.js install

# O arrancar manualmente en foreground (desarrollo)
node packages/daemon/bin/ccremote.js start -f

# O arrancar en background
node packages/daemon/bin/ccremote.js start
```

### Conectar desde el movil

```bash
# Muestra un QR con la URL + token para escanear desde el movil
node packages/daemon/bin/ccremote.js qr
```

### Gestionar sesiones (CLI)

```bash
# Crear sesion
node packages/daemon/bin/ccremote.js new --project /ruta/al/proyecto

# Listar sesiones
node packages/daemon/bin/ccremote.js list

# Ver estado del daemon
node packages/daemon/bin/ccremote.js status

# Conectar terminal nativa a una sesion
node packages/daemon/bin/ccremote.js attach <sessionId>

# Matar sesion
node packages/daemon/bin/ccremote.js kill <sessionId>

# Ver token de autenticacion
node packages/daemon/bin/ccremote.js token

# Parar daemon
node packages/daemon/bin/ccremote.js stop

# Desinstalar servicio systemd
node packages/daemon/bin/ccremote.js uninstall
```

### PWA

Desde la PWA (accesible en `https://<tu-hostname>:9876`) puedes:

- Ver todas las sesiones activas con su estado en tiempo real
- Crear nuevas sesiones con navegador de directorios y selector de modelo
- Interactuar con Claude Code via terminal integrada (xterm.js)
- **Explorador de archivos** con arbol de directorios, iconos por tipo de archivo y busqueda
- **Editor de codigo** con syntax highlighting (14 lenguajes), numeros de linea y tema oscuro
- Crear, renombrar y eliminar archivos y carpetas desde el explorador
- Menu contextual: abrir, copiar ruta, copiar ruta relativa, renombrar, eliminar
- Aviso de cambios sin guardar al cerrar el editor
- Matar sesiones (doble tap para confirmar)
- Toolbar movil con teclas especiales (flechas, Esc, Tab, PgUp/PgDn, Enter, Ctrl+C)
- Input movil con soporte para saltos de linea (textarea con envio por boton)
- Pull-to-refresh en la lista de sesiones
- Indicador de estado de conexion (conectado, reconectando, desconectado)
- Historial de scrollback bajo demanda

## Arquitectura

```
CCRemote/
  shared/           Tipos TypeScript compartidos (protocolo WS, tipos de sesion)
  packages/daemon/   CLI + servidor WebSocket + gestion de sesiones tmux
  packages/pwa/      Frontend React (PWA) con xterm.js + CodeMirror
```

### Flujo de datos

1. El **daemon** crea sesiones de Claude Code dentro de sesiones tmux
2. Un **reader PTY** de solo lectura se conecta a cada sesion tmux para detectar actividad
3. Al detectar actividad, `tmux capture-pane -p -e` captura un snapshot de la pantalla
4. El snapshot se envia via **WebSocket** a los clientes PWA conectados
5. **xterm.js** en la PWA renderiza el snapshot
6. El input del usuario se envia como `send_key` al daemon, que lo inyecta en tmux

### Explorador de archivos

1. El cliente envia `browse_files` con la ruta del directorio
2. El daemon lee el directorio con `readdir` (incluye archivos ocultos) y devuelve `file_listing`
3. El arbol se construye de forma lazy: solo se cargan los hijos al expandir una carpeta
4. Al abrir un archivo, se envia `read_file` y el contenido se muestra en CodeMirror
5. Las operaciones de escritura (`write_file`), creacion (`create_file`, `create_directory`), renombrado (`rename_file`) y eliminacion (`delete_file`) se validan contra la raiz del proyecto para prevenir path traversal

### Multi-cliente

- Varios clientes PWA (movil + escritorio) pueden conectarse simultaneamente
- La sesion tmux usa `window-size largest`: si hay una terminal nativa conectada (via `ccremote attach`), esta siempre dicta el tamano
- El input del teclado movil incluye una toolbar con teclas especiales
- `mouse on` esta habilitado en tmux para scroll con rueda del raton en terminales nativas

### Seguridad

- Todo el trafico viaja por tu red **Tailscale** (WireGuard cifrado end-to-end)
- HTTPS con certificados de Tailscale cuando estan disponibles
- Autenticacion por **token** en cada conexion WebSocket
- El daemon no expone puertos a internet publico
- Validacion de rutas en el explorador de archivos (no permite acceder fuera del proyecto)

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
- **CodeMirror 6** (editor de codigo con syntax highlighting, lazy-loaded)
- **material-file-icons** (iconos de archivo estilo VS Code)
- **ws** (servidor WebSocket)
- **better-sqlite3** (almacenamiento local)
- **node-pty** + **tmux** (gestion de sesiones de terminal)
- **Vite** + **vite-plugin-pwa** (build y service worker)
