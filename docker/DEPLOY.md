# Despliegue de Educathing en VPS

Guía mínima para poner la solución en producción sobre un VPS Linux
(Ubuntu recomendado, se prueba con Ubuntu 22.04+ y 24.04).

## Requisitos del servidor

- Ubuntu Linux con acceso `root` o usuario con `sudo`.
- 2 vCPU / 4 GB RAM mínimo (holgado en el VPS institucional del CFT).
- Puertos 80 y 443 abiertos hacia internet.
- Registro DNS `A` apuntando al VPS (por ejemplo `educathing.cft.cl`).

## Instalación en un comando

```bash
curl -fsSL https://raw.githubusercontent.com/meiklabs/educathing-llm/main/install.sh | sudo bash
```

El script:

1. Instala Docker si falta.
2. Crea `/opt/educathing` con `docker-compose.yml`, `Caddyfile` y `.env`.
3. Genera secretos aleatorios fuertes (`SIG_KEY`, `SIG_SALT`, `JWT_SECRET`).
4. Descarga la imagen `ghcr.io/meiklabs/educathing-llm:latest`.
5. Levanta el stack (app + Caddy con HTTPS automático).

Si preferís revisar antes de correr, cloná el repo y ejecutá `sudo bash install.sh`.

## Configuración post-instalación

Editar `/opt/educathing/.env` y setear al menos:

| Variable | Valor |
|---|---|
| `DOMAIN` | Hostname público (ej. `educathing.cft.cl`) |
| `ACME_EMAIL` | Correo para avisos de Let's Encrypt |
| `OPENROUTER_API_KEY` | Key de OpenRouter para acceso a los LLM |

Recargar el stack:

```bash
cd /opt/educathing && sudo docker compose up -d
```

Caddy provisiona el certificado TLS en la primera request al dominio.

## Verificación

```bash
cd /opt/educathing
sudo docker compose ps            # Estado de los servicios
sudo docker compose logs -f       # Logs en vivo
curl -I https://<DOMAIN>/         # 200 OK una vez que Caddy emitió el cert
```

Al abrir `https://<DOMAIN>/` por primera vez, se ejecuta el wizard de
onboarding: se crea el usuario administrador y se activa multi-user mode.

## Actualizar

```bash
cd /opt/educathing
sudo docker compose pull
sudo docker compose up -d
```

## Backup

Todo el estado persistente vive bajo `/opt/educathing/`:

- `storage/` — base SQLite, documentos vectorizados, archivos generados.
- `hotdir/`, `outputs/` — bandejas del colector de documentos.
- `.env` — secretos y configuración.

Backup mínimo (nightly cron):

```bash
tar czf educathing-$(date +%F).tgz -C /opt educathing
```

## Modelos con OpenRouter (free + paid)

- El `.env` deja `LLM_PROVIDER=openrouter` y `OPENROUTER_MODEL_PREF=openrouter/auto`
  como default seguro.
- Los modelos por workspace y el ruteo dinámico (free para tareas simples,
  paid para diseño curricular complejo) se configuran desde
  `Settings → AI Providers → Model Router` en la UI, sin tocar el `.env`.
