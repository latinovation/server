# Despliegue de Org Vault en VPS con Coolify

Esta guía explica paso a paso cómo desplegar el **Relay Server EVC** (backend de sincronización CRDT de Latinovation) en tu VPS gestionado por **Coolify**.

---

## 1. Requisitos Previos

1. **VPS con Coolify v4 instalado y funcionando.**
2. **Puertos 80 y 443 abiertos** en el firewall del VPS.
3. **Dominio configurado con dos registros DNS tipo A** apuntando a la IP pública de tu VPS:
   - `cp.org.latinovation.com` → IP del VPS (para el Control Plane y Panel Admin).
   - `org.latinovation.com` → IP del VPS (para el Relay WebSocket CRDT).

---

## 2. Generar Secretos y Claves Criptográficas

En tu computadora local (Windows PowerShell o Linux/Mac):

```powershell
# En Windows (PowerShell):
cd infra
.\setup.ps1 prod org.latinovation.com admin@latinovation.com --force
```

```bash
# En Linux, macOS o Git Bash:
cd infra
./setup.sh prod org.latinovation.com admin@latinovation.com --force
```

Esto generará automáticamente:
- Las contraseñas aleatorias de Postgres y MinIO.
- El secreto JWT.
- El par de claves asimétricas **Ed25519** (`RELAY_PRIVATE_KEY` y `RELAY_PUBLIC_KEY`).
- El archivo `infra/relay/relay.toml` con la clave pública y el endpoint de MinIO ya rellenados.
- El archivo `infra/.env` con todas las variables requeridas para Coolify.

---

## 3. Crear el Recurso en Coolify

Hay dos formas sencillas de crearlo en Coolify:

### Opción A (Recomendada): Desde el Repositorio Git
1. En el panel de Coolify, entra a tu **Proyecto** y **Environment**.
2. Haz clic en **+ New Resource** → **Public Repository** (o Private Repository si es privado).
3. Pega la URL de tu repositorio de Git.
4. En **Build Pack**, selecciona **Docker Compose**.
5. En **Docker Compose Location**, escribe:  
   `infra/docker-compose.coolify.yml`
6. En la pestaña **Environment Variables**, pega las variables generadas en `infra/.env` (en Developer View / Bulk Edit).
7. Haz clic en **Deploy**.  
   *(El archivo `infra/relay/relay.toml` se monta automáticamente desde el repositorio Git, sin necesidad de tocar la pestaña Storages).*

---

### Opción B: Mediante Docker Compose Directo
1. En Coolify, haz clic en **+ New Resource** → **Docker Compose**.
2. Pega el contenido de `infra/docker-compose.coolify.yml`.
3. En la pestaña **Environment Variables**, añade las variables de `infra/.env`.
4. Haz clic en **Deploy**.

---

## 4. Asignación de Dominios en Coolify

En la configuración del recurso en Coolify:

1. **Servicio `control-plane`**:
   - Asigna el dominio: `https://cp.org.latinovation.com`
   - Puerto del contenedor: `8000`
2. **Servicio `relay-server`**:
   - Asigna el dominio: `https://org.latinovation.com`
   - Puerto del contenedor: `8080`
   - *Asegúrate de que Traefik/Coolify permita conexiones WebSocket (activado por defecto).*

Coolify solicitará automáticamente los certificados SSL válidos de **Let's Encrypt** mediante HTTPS.

---

## 5. Verificación de Salud en Producción

Una vez que Coolify marque el despliegue como **Healthy**, abre tu navegador o terminal y verifica:

```bash
# 1. Verificar API y Base de Datos del Control Plane
curl -s https://cp.org.latinovation.com/health/ready
# Respuesta esperada: {"status":"healthy","database":"healthy","relay_keys":"healthy"}

# 2. Verificar Relay WebSocket
curl -s https://org.latinovation.com/ready
# Respuesta esperada: {"ok":true}
```

Accede al panel de administración para gestionar usuarios en:  
👉 `https://cp.org.latinovation.com/admin-ui/`  
*(Inicia sesión con `BOOTSTRAP_ADMIN_EMAIL` y `BOOTSTRAP_ADMIN_PASSWORD`).*

---

## 6. Conectar los Obsidian del Equipo al VPS

Cada miembro del equipo solo debe seguir los pasos de [docs/onboarding.md](onboarding.md) usando la URL de producción:

1. En Obsidian → Ajustes → **Team Relay** → **Add Server**:
   - **Control Plane URL:** `https://cp.org.latinovation.com`
   - **Email:** `usuario@latinovation.com`
   - **Password:** `<su-contraseña>`
2. Aceptar la invitación al share `Org`.

A partir de ese momento, la sincronización funcionará desde cualquier lugar del mundo (fuera de la oficina o en casa) con cifrado TLS seguro.

---

## 7. Backups Diarios en el VPS

En el VPS (vía SSH), programa el script de backup en el cron del sistema:

```bash
sudo crontab -e
```

Añade la siguiente línea para ejecutar el respaldo todos los días a las 02:30 AM:

```bash
30 2 * * * /ruta/al/proyecto/infra/backup.sh >> /var/log/org-vault-backup.log 2>&1
```
