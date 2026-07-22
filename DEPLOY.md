# Despliegue en EasyPanel

Todo el sistema va en **un solo servicio**. La imagen incluye backend y panel:
Next.js sirve la interfaz y reenvía `/api` al backend interno, así que sólo se
expone un puerto y no hay que configurar URLs cruzadas.

La base de datos y el almacenamiento son de Supabase — no hay que levantar
Postgres ni MinIO.

---

## 0. Antes de empezar

Aplica primero el esquema a Supabase (una de las dos):

```bash
npm run prisma:deploy          # desde tu máquina
```
…o pega [`supabase-setup.sql`](supabase-setup.sql) en el SQL Editor de Supabase
y luego corre `npm run prisma:resolve`.

Ten a la mano:

| Dato | Dónde se obtiene |
|---|---|
| `DATABASE_URL` y `DIRECT_URL` | Supabase → Project Settings → Database → Connection string |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API |
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| URL y API key de Evolution | Tu instancia actual |

---

## 1. Crear el servicio

EasyPanel → tu proyecto → **+ Service** → **App**

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
| Dockerfile Path | `Dockerfile` |
| Build Context | `/` |

> El `Dockerfile` está en la raíz del repo. No hace falta configurar build
> arguments: la URL de la API es relativa al propio dominio.

### Domains
| Campo | Valor |
|---|---|
| Host | `crm.tudominio.com` |
| Port | **3000** |
| HTTPS | Activado |

---

## 2. Variables de entorno

Pégalas en **Environment**, sustituyendo los valores de ejemplo:

```env
# ── Base de datos (Supabase) ──
DATABASE_URL=postgresql://postgres.xxxx:PASSWORD@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
DIRECT_URL=postgresql://postgres.xxxx:PASSWORD@aws-0-us-east-1.pooler.supabase.com:5432/postgres

# ── Almacenamiento de documentos ──
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...
SUPABASE_BUCKET=documentos

# ── Sesiones ──
JWT_SECRET=cZ0RwOSHoTuLKuUSy8rWCnbr58ducnRYDd80eaWA07KAItpWA4f2BdqDqKFYJq4L
JWT_EXPIRES_IN=1d
JWT_REFRESH_EXPIRES_IN=7d

# ── IA (extracción de documentos y redacción de propuestas) ──
ANTHROPIC_API_KEY=sk-ant-xxxx
CLAUDE_MODEL=claude-opus-4-8

# ── WhatsApp (Evolution API) ──
EVOLUTION_API_URL=https://evolution.tudominio.com
EVOLUTION_API_KEY=tu_api_key_de_evolution
EVOLUTION_INSTANCE=despacho
EVOLUTION_WEBHOOK_TOKEN=qp3k9nqaDSPGEul0ztTRjyDX0amGyypo

# ── Cron de cobranza (n8n) ──
N8N_SERVICE_TOKEN=ZVKfSXiAMtWYS3uT8HSa6HZR3qEJ1Lyh
```

**No necesitas definir** `PORT`, `BACKEND_PORT` ni `NEXT_PUBLIC_API_URL`:
la imagen ya trae valores correctos.

> `EVOLUTION_WEBHOOK_TOKEN` y `N8N_SERVICE_TOKEN` deben coincidir exactamente
> con los que configures en Evolution y n8n. Los de arriba están generados
> y puedes usarlos tal cual.

---

## 3. Desplegar y comprobar

Pulsa **Deploy**. El primer build tarda unos minutos (compila backend y panel).

Al arrancar, el contenedor:
1. Aplica las migraciones de Prisma
2. Levanta el backend en el puerto interno 3001
3. Espera a que responda y levanta el panel en el 3000

**Comprueba:**

1. `https://crm.tudominio.com/api/health`
   → `{"estado":"ok","baseDatos":"ok",...}`
   Si dice `"baseDatos":"error"`, revisa `DATABASE_URL`.

2. `https://crm.tudominio.com`
   → Entra con `admin@despacho.mx` / `cambiar123` y **cambia la contraseña
   de inmediato**: ese hash está en el repositorio.

---

## 4. Conectar Evolution API

En tu instancia de Evolution, configura el webhook:

| Campo | Valor |
|---|---|
| URL | `https://crm.tudominio.com/api/webhooks/evolution` |
| Header | `x-webhook-token: qp3k9nqaDSPGEul0ztTRjyDX0amGyypo` |
| Evento | `messages.upsert` |

Prueba enviando un archivo por WhatsApp desde un número registrado en la ficha
de un cliente (en formato E.164, ej. `+525512345678`). Debe aparecer en
**Documentos por procesar**.

---

## 5. Conectar n8n

Importa [`n8n/cobranza-recurrente.json`](n8n/cobranza-recurrente.json) y define
en n8n estas variables:

| Variable | Valor |
|---|---|
| `CRM_API_URL` | `https://crm.tudominio.com` |
| `N8N_SERVICE_TOKEN` | `ZVKfSXiAMtWYS3uT8HSa6HZR3qEJ1Lyh` |

Pruébalo sin molestar a clientes reales (`enviarRecordatorios: false` recalcula
estados pero no manda WhatsApp):

```bash
curl -X POST https://crm.tudominio.com/api/cobranza/procesar \
  -H "x-service-token: ZVKfSXiAMtWYS3uT8HSa6HZR3qEJ1Lyh" \
  -H "Content-Type: application/json" \
  -d '{"enviarRecordatorios": false}'
```

---

## Problemas frecuentes

| Síntoma | Causa y solución |
|---|---|
| `exec ./docker-entrypoint.sh: no such file or directory` | El script se subió con finales de línea CRLF. El `.gitattributes` del repo lo evita; si lo editaste en Windows, verifica que se guardó con LF. |
| El contenedor reinicia en bucle | Mira los logs. Si el error es de migraciones diciendo que las tablas ya existen, corriste el SQL a mano sin `npm run prisma:resolve`. |
| `"baseDatos":"error"` en `/api/health` | `DATABASE_URL` incorrecta, o le falta `?pgbouncer=true` a la cadena del pooler (puerto 6543). |
| El panel carga pero el login da error de red | Revisa los logs: probablemente el backend no arrancó. El panel funciona igual porque son procesos distintos. |
| Los adjuntos de WhatsApp no llegan | El webhook debe apuntar a `/api/webhooks/evolution` y el token coincidir con `EVOLUTION_WEBHOOK_TOKEN`. |
| Llega el adjunto pero sin cliente asignado | El número de WhatsApp del cliente debe estar en E.164 (`+52...`) en su ficha. |
| El build falla por memoria | Compila dos aplicaciones; si el VPS es pequeño, súbele RAM temporalmente o añade swap. |

---

## Actualizar

`git push` a `main` → **Deploy** en EasyPanel (o activa auto-deploy con el
webhook de GitHub). Las migraciones nuevas se aplican solas al arrancar.

---

## Alternativa: backend y panel por separado

Si algún día quieres escalarlos de forma independiente, existen
`apps/backend/Dockerfile` y `apps/frontend/Dockerfile`. En ese caso el panel
**sí** necesita `NEXT_PUBLIC_API_URL` como **build argument** (Next.js incrusta
las variables `NEXT_PUBLIC_*` al compilar, no las lee en ejecución).
