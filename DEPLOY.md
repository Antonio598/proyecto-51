# Despliegue en EasyPanel

Se despliegan **dos servicios** desde este mismo repositorio: `backend` y `frontend`.
La base de datos y el almacenamiento son de Supabase, así que no hay que levantar
Postgres ni MinIO.

---

## 0. Antes de empezar

Ten a la mano:

| Dato | Dónde se obtiene |
|---|---|
| Cadenas de conexión de Supabase | Supabase → Project Settings → Database → Connection string |
| `service_role` key de Supabase | Supabase → Project Settings → API |
| API key de Anthropic | console.anthropic.com |
| URL y API key de Evolution | Tu instancia actual |

Y decide dos subdominios, por ejemplo:

- **Frontend:** `crm.tudominio.com`
- **Backend:** `api.tudominio.com`

Aplica el esquema a Supabase primero (ver `supabase-setup.sql` o `npm run prisma:deploy`).

---

## 1. Servicio `backend`

**Crear:** EasyPanel → tu proyecto → **+ Service** → **App**

### Source
| Campo | Valor |
|---|---|
| Type | GitHub |
| Repository | `Antonio598/proyecto-51` |
| Branch | `main` |

### Build
| Campo | Valor |
|---|---|
| Method | **Dockerfile** |
| Dockerfile Path | `apps/backend/Dockerfile` |
| Build Context | `/` |

> El contexto **debe** ser la raíz del repo, no `apps/backend`: el Dockerfile necesita
> el `package.json` raíz y la carpeta `prisma/`.

### Environment

```env
DATABASE_URL=postgresql://postgres.xxxx:PASSWORD@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
DIRECT_URL=postgresql://postgres.xxxx:PASSWORD@aws-0-us-east-1.pooler.supabase.com:5432/postgres

SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...
SUPABASE_BUCKET=documentos

BACKEND_PORT=3001
FRONTEND_ORIGIN=https://crm.tudominio.com

JWT_SECRET=cZ0RwOSHoTuLKuUSy8rWCnbr58ducnRYDd80eaWA07KAItpWA4f2BdqDqKFYJq4L
JWT_EXPIRES_IN=1d
JWT_REFRESH_EXPIRES_IN=7d

ANTHROPIC_API_KEY=sk-ant-xxxx
CLAUDE_MODEL=claude-opus-4-8

EVOLUTION_API_URL=https://evolution.tudominio.com
EVOLUTION_API_KEY=tu_api_key_de_evolution
EVOLUTION_INSTANCE=despacho
EVOLUTION_WEBHOOK_TOKEN=qp3k9nqaDSPGEul0ztTRjyDX0amGyypo

N8N_SERVICE_TOKEN=ZVKfSXiAMtWYS3uT8HSa6HZR3qEJ1Lyh
```

> Los tres secretos ya vienen generados. Si prefieres otros, cualquier cadena
> aleatoria larga sirve — pero `N8N_SERVICE_TOKEN` y `EVOLUTION_WEBHOOK_TOKEN`
> deben coincidir con los que configures en n8n y Evolution.

### Domains
| Campo | Valor |
|---|---|
| Host | `api.tudominio.com` |
| Port | `3001` |
| HTTPS | Activado |

El contenedor aplica las migraciones de Prisma al arrancar (`prisma migrate deploy`).

---

## 2. Servicio `frontend`

**Crear:** otro **App** en el mismo proyecto.

### Source
Igual que el backend: repo `Antonio598/proyecto-51`, branch `main`.

### Build
| Campo | Valor |
|---|---|
| Method | **Dockerfile** |
| Dockerfile Path | `apps/frontend/Dockerfile` |
| Build Context | `/` |

### ⚠️ Build Arguments — el paso que más se olvida

En EasyPanel: **Build → Build Arguments** (no en Environment):

```
NEXT_PUBLIC_API_URL=https://api.tudominio.com
```

> Next.js **incrusta** las variables `NEXT_PUBLIC_*` durante la compilación, no las
> lee en tiempo de ejecución. Si la pones sólo en *Environment*, el panel compilará
> apuntando a `localhost:3001` y **no podrá hablar con el backend** — verás la pantalla
> de login pero fallará al iniciar sesión. Si cambias el dominio del backend después,
> tienes que **reconstruir** el frontend, no basta con reiniciar.

### Environment
```env
PORT=3000
```

### Domains
| Campo | Valor |
|---|---|
| Host | `crm.tudominio.com` |
| Port | `3000` |
| HTTPS | Activado |

---

## 3. Después del primer despliegue

1. **Verifica el backend:** abre `https://api.tudominio.com/api/health`
   → debe responder `{"estado":"ok","baseDatos":"ok",...}`.
   Si dice `"baseDatos":"error"`, revisa `DATABASE_URL`.

2. **Entra al panel:** `https://crm.tudominio.com` con `admin@despacho.mx` / `cambiar123`
   y **cambia la contraseña de inmediato** — ese hash es público, está en el repo.

3. **Conecta Evolution API.** En tu instancia, configura el webhook:
   - URL: `https://api.tudominio.com/api/webhooks/evolution`
   - Header: `x-webhook-token: qp3k9nqaDSPGEul0ztTRjyDX0amGyypo`
   - Evento: `messages.upsert`

4. **Conecta n8n.** Importa `n8n/cobranza-recurrente.json` y define en n8n:
   - `CRM_API_URL` = `https://api.tudominio.com`
   - `N8N_SERVICE_TOKEN` = `ZVKfSXiAMtWYS3uT8HSa6HZR3qEJ1Lyh`

   Pruébalo sin molestar clientes reales:
   ```bash
   curl -X POST https://api.tudominio.com/api/cobranza/procesar \
     -H "x-service-token: ZVKfSXiAMtWYS3uT8HSa6HZR3qEJ1Lyh" \
     -H "Content-Type: application/json" \
     -d '{"enviarRecordatorios": false}'
   ```

---

## Problemas frecuentes

| Síntoma | Causa |
|---|---|
| El login falla con error de red | `NEXT_PUBLIC_API_URL` no se puso como **build argument**, o apunta mal. Reconstruye el frontend. |
| Error de CORS en el navegador | `FRONTEND_ORIGIN` del backend no coincide **exactamente** con el dominio del panel (incluye `https://`, sin barra final). |
| Backend reinicia en bucle | Migraciones. Mira los logs: si dice que las tablas ya existen, corriste el SQL a mano sin `npm run prisma:resolve`. |
| `"baseDatos":"error"` en health | `DATABASE_URL` mal, o falta `?pgbouncer=true` en la cadena del pooler. |
| Los adjuntos de WhatsApp no llegan | Revisa que el webhook apunte a `/api/webhooks/evolution` y que el token coincida. |
| Llega el adjunto pero sin cliente | El número del cliente en su ficha debe estar en E.164 (`+525512345678`). |

---

## Actualizar el sistema

`git push` a `main` → en EasyPanel pulsa **Deploy** en cada servicio (o activa
auto-deploy con el webhook de GitHub). Recuerda: si cambia el dominio del backend,
el frontend necesita **rebuild**, no sólo restart.
