# Conectar a sesiones CCRemote por terminal

Las sesiones de CCRemote corren en tmux con el nombre `ccremote-<ID>`.

## Listar sesiones activas

```bash
tmux list-sessions
```

## Conectar a una sesión

```bash
tmux attach-session -t ccremote-<ID>
```

Ejemplo:

```bash
tmux attach-session -t ccremote-Rkxu71WYF0ss
```

## Desconectar sin cerrar la sesión

Desde dentro de la sesión tmux, pulsar:

```
Ctrl+B, luego D
```

## Matar una sesión concreta

```bash
tmux kill-session -t ccremote-<ID>
```

## Matar todas las sesiones

```bash
tmux kill-server
```
