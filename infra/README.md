# infra/ · Relay EVC Team Relay para `Org/`

Sincroniza la carpeta `Org/` entre los baúles del equipo con [EVC Team Relay](https://github.com/entire-vc/evc-team-relay) (CRDT, self-hosted). Los valores de este directorio salen del `infra/` oficial (v1.12.0) y de su documentación; las diferencias están en `docs/decisiones.md` (D-013 a D-016).

## Servicios

| Servicio | Imagen | Función |
|---|---|---|
| `postgres` | `postgres:16` | Usuarios, shares, miembros, tokens |
| `minio` + `minio-init` | `minio/minio`, `minio/mc` | Documentos CRDT y adjuntos (bucket `relay`) |
| `control-plane-migrate` | `ghcr.io/entire-vc/evc-team-relay/control-plane` | Migraciones; debe terminar antes de arrancar la API |
| `control-plane` | ídem | API REST, panel `/admin-ui/`, emisión de tokens Ed25519 |
| `relay-server` | `ghcr.io/entire-vc/evc-relay-server:0.9.12` | WebSocket CRDT (fork de y-sweet) |
| `caddy` | `caddy:2` | Ingress. Local: HTTP `:8000`/`:8080`. Prod: TLS automático en 80/443 |

Datos persistentes en `infra/data/` (ignorado por git). Secretos en `infra/.env` y `infra/relay/relay.toml` (ignorados, permisos 600).

## Modo local (LAN, sin dominio)

```bash
cd infra
./setup.sh local            # detecta la IP de la máquina; o ./setup.sh local 192.168.1.10
docker compose up -d
docker compose ps           # todo "healthy"; minio-init y control-plane-migrate terminan en "exited (0)"
curl http://<IP>:8000/health          # {"ok":true}
curl http://<IP>:8000/health/ready    # comprueba la BD
```

- Control plane: `http://<IP>:8000` · panel admin: `http://<IP>:8000/admin-ui/` (usuario y contraseña que imprime `setup.sh`).
- Relay: `ws://<IP>:8080` (el plugin lo recibe automáticamente en la respuesta del token).
- Otros dispositivos de la red usan la misma IP. Si el firewall de macOS pregunta, permitir Docker.

## Modo producción (VPS)

Requisitos: Docker Engine 24+, Compose 2.20+, 2 CPU / 4 GB RAM, dominio con DNS.

```bash
# DNS: org.latinovation.com  A  <IP-VPS>   y   cp.org.latinovation.com  A  <IP-VPS>
git clone <repo> /opt/latinovation-org-vault && cd /opt/latinovation-org-vault/infra
./setup.sh prod org.latinovation.com ops@latinovation.com
docker compose up -d
curl https://cp.org.latinovation.com/health
```

Backup diario (cron del host) y prueba de restauración:

```bash
30 2 * * * /opt/latinovation-org-vault/infra/backup.sh >> /var/log/org-vault-backup.log 2>&1
./restore.sh backups/pg_<fecha>.sql.gz backups/data_<fecha>.tar.gz   # en un entorno de prueba
```

`BACKUP_REMOTE` en `.env` copia los archivos fuera del VPS (`rclone:<remote>:<bucket>` o `usuario@host:/ruta`).

## Alta de personas y share de `Org/`

1. Panel admin → Users → crear usuario (email + contraseña) para cada persona. O por API: `POST /v1/admin/users`.
2. En Obsidian, la persona instala el plugin (ver `docs/onboarding.md`), añade el servidor con la URL del control plane e inicia sesión.
3. El curador, desde su Obsidian: clic derecho en `Org` → **Share** → invitar a cada persona por email con rol `editor` (D-016). Alternativa por API: `POST /v1/shares` con `{"kind":"folder","path":"/Org","visibility":"private"}` y `POST /v1/shares/{id}/members` con `{"email":…,"role":"editor"}`.
4. Cada persona acepta el share; la carpeta `Org/` aparece en su baúl y se sincroniza en ambos sentidos.

Opción por carpeta (si el piloto lo exige): un share para `Org/canónico` (viewer para todos, editor para el curador) y uno por `Org/aportes/<persona>` (editor para su dueño, viewer para el resto).

## Verificación (criterio de aceptación fase 2)

- [ ] Dos máquinas con el plugin ven el cambio de la otra en < 10 s.
- [ ] Edición simultánea de la misma nota no genera archivos de conflicto.
- [ ] Un adjunto pegado en una nota de `Org/` aparece en la otra máquina.
- [ ] `backup.sh` produce `pg_*.sql.gz` y `data_*.tar.gz` y `restore.sh` los restaura en un entorno de prueba.

## Problemas conocidos

- **WebSocket falla sin mensaje:** `RELAY_AUDIENCE` (.env) y `[server].url` (relay.toml) no son idénticos. `setup.sh` los escribe juntos; no editar uno sin el otro.
- **Nunca reescribir el token en las rutas `/doc/ws/*` y `/d/*/ws/*` de Caddy:** relay-server solo lo lee del query string ahí (incidente #137 upstream). Ambos Caddyfiles ya lo excluyen.
- **Cambiar `RELAY_PRIVATE_KEY`** invalida todos los tokens emitidos y exige actualizar `relay.toml`.
- **Actualizar imágenes:** cambiar `CP_VERSION` / `RELAY_VERSION` en `.env` y `docker compose up -d`; las migraciones corren solas.
