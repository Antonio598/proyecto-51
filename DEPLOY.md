# Despliegue en EasyPanel

Todo el sistema va en **un solo servicio**. La imagen incluye backend y panel:
Next.js sirve la interfaz y reenvía `/api` al backend interno, así que sólo se
expone un puerto y no hay que configurar URLs cruzadas.

---

## 0. Antes de empezar

Necesitas un Supabase funcionando (en la nube o auto-alojado) y aplicar el
esquema. Si puedes conectarte desde tu máquina:

```bash
npm run prisma:deploy
```

…o pega [`supabase-setup.sql`](supabase-setup.sql) en el SQL Editor de Supabase
y luego corre `npm run prisma:resolve`.

> Si no aplicas el esquema, el contenedor lo intentará al arrancar. Funciona
> igual, siempre que la cadena de conexión permita crear tablas.

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
| Host | tu dominio, p. ej. `crm.tudominio.com` |
| Port | **3000** |
| HTTPS | Activado |

---

## 2. Conexión a Supabase

Las cadenas son **distintas** según dónde corra tu Supabase. Elige tu caso.

### Caso A — Supabase auto-alojado (en tu propio EasyPanel)

Conexión directa al contenedor de Postgres. **No** hay pooler, ni project ref,
ni `?pgbouncer=true`. `DIRECT_URL` es idéntica a `DATABASE_URL`.

```env
DATABASE_URL=postgresql://postgres:TU_PASSWORD@HOST_INTERNO:5432/postgres?schema=public
DIRECT_URL=postgresql://postgres:TU_PASSWORD@HOST_INTERNO:5432/postgres?schema=public
```

Dónde sacar cada dato en EasyPanel:

| Dato | Dónde |
|---|---|
| `HOST_INTERNO` | Nombre del servicio de la base dentro del proyecto de Supabase (`db`, `supabase-db`…). En EasyPanel se alcanza como `proyecto_servicio`, p. ej. `supabase_db`. |
| `TU_PASSWORD` | Variable `POSTGRES_PASSWORD` del stack de Supabase. |
| `SUPABASE_URL` | La URL pública de tu Supabase, p. ej. `https://supabase-supabase.tuservidor.easypanel.host` |
| `SUPABASE_SERVICE_ROLE_KEY` | Variable `SERVICE_ROLE_KEY` del stack (**no** la `ANON_KEY`). |

> El CRM y Supabase deben estar en el **mismo proyecto** de EasyPanel para verse
> por el hostname interno. Si están en proyectos distintos, conéctalos a la misma
> red o expón el puerto 5432 del Postgres.

**Crea el bucket:** en tu Studio → **Storage** → *New bucket* → nombre
`documentos`, **privado** (sin marcar "Public bucket").

### Caso B — Supabase Cloud (supabase.com)

> **`TU-PROJECT-REF` y `TU-REGION` son marcadores: hay que sustituirlos.**
> Si los dejas tal cual, falla con
> `FATAL: (ENOTFOUND) tenant/user postgres.TU-PROJECT-REF not found`.
>
> Lo más seguro es **no escribirlas a mano**: cópialas de Supabase → botón
> **Connect** → pestaña **ORMs** → **Prisma**. Vienen con tu project ref y tu
> región ya puestos; sólo sustituye la contraseña.
>
> Tu project ref es la parte que aparece en `SUPABASE_URL`:
> `https://`**`abcdefghijklm`**`.supabase.co`

```env
DATABASE_URL=postgresql://postgres.TU-PROJECT-REF:TU-PASSWORD@aws-0-TU-REGION.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
DIRECT_URL=postgresql://postgres.TU-PROJECT-REF:TU-PASSWORD@aws-0-TU-REGION.pooler.supabase.com:5432/postgres

SUPABASE_URL=https://TU-PROJECT-REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...
```

> Usa el **Session pooler** (5432) para `DIRECT_URL`, no la "Direct connection"
> (`db.xxx.supabase.co`): esa sólo acepta IPv6 y la mayoría de servidores no lo
> tienen, así que daría un timeout sin explicación.

### En ambos casos

Si la contraseña lleva `@`, `#`, `/`, `?` o `:`, hay que codificarla
(`@` → `%40`, `#` → `%23`). Lo más simple es ponerle una alfanumérica larga
sin símbolos.

---

## 3. Variables de entorno

Pégalas en **Environment** del servicio del CRM. Las cuatro primeras salen del
apartado anterior según tu caso:

```env
DATABASE_URL=...
DIRECT_URL=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_BUCKET=documentos

# Sesiones
JWT_SECRET=cZ0RwOSHoTuLKuUSy8rWCnbr58ducnRYDd80eaWA07KAItpWA4f2BdqDqKFYJq4L
JWT_EXPIRES_IN=1d
JWT_REFRESH_EXPIRES_IN=7d

# IA (extracción de documentos y redacción de propuestas)
ANTHROPIC_API_KEY=sk-ant-xxxx
CLAUDE_MODEL=claude-opus-4-8

# WhatsApp (Evolution API)
EVOLUTION_API_URL=https://evolution.tudominio.com
EVOLUTION_API_KEY=tu_api_key_de_evolution
EVOLUTION_INSTANCE=despacho
EVOLUTION_WEBHOOK_TOKEN=qp3k9nqaDSPGEul0ztTRjyDX0amGyypo

# Cron de cobranza (n8n)
N8N_SERVICE_TOKEN=ZVKfSXiAMtWYS3uT8HSa6HZR3qEJ1Lyh
```

**No necesitas definir** `PORT`, `BACKEND_PORT` ni `NEXT_PUBLIC_API_URL`:
la imagen ya trae valores correctos.

> `EVOLUTION_WEBHOOK_TOKEN` y `N8N_SERVICE_TOKEN` deben coincidir exactamente
> con los que configures en Evolution y n8n. Los de arriba están generados y
> puedes usarlos tal cual.

---

## 4. Desplegar y comprobar

Pulsa **Deploy**. El primer build tarda unos minutos (compila backend y panel).

Al arrancar, el contenedor:
1. Aplica las migraciones de Prisma
2. Levanta el backend en el puerto interno 3001
3. Espera a que responda y levanta el panel en el 3000

**Comprueba:**

1. `https://tudominio.com/api/health`
   → `{"estado":"ok","baseDatos":"ok",...}`
   Si dice `"baseDatos":"error"`, revisa `DATABASE_URL`.

2. `https://tudominio.com`
   → Entra con `admin@despacho.mx` / `cambiar123` y **cambia la contraseña
   de inmediato**: ese hash está en el repositorio.

---

## 5. Conectar Evolution API

En tu instancia de Evolution, configura el webhook:

| Campo | Valor |
|---|---|
| URL | `https://tudominio.com/api/webhooks/evolution` |
| Header | `x-webhook-token: qp3k9nqaDSPGEul0ztTRjyDX0amGyypo` |
| Evento | `messages.upsert` |

Prueba enviando un archivo por WhatsApp desde un número registrado en la ficha
de un cliente (en formato E.164, ej. `+525512345678`). Debe aparecer en
**Documentos por procesar**.

---

## 6. Conectar n8n

Importa [`n8n/cobranza-recurrente.json`](n8n/cobranza-recurrente.json) y define
en n8n estas variables:

| Variable | Valor |
|---|---|
| `CRM_API_URL` | `https://tudominio.com` |
| `N8N_SERVICE_TOKEN` | `ZVKfSXiAMtWYS3uT8HSa6HZR3qEJ1Lyh` |

Pruébalo sin molestar a clientes reales (`enviarRecordatorios: false` recalcula
estados pero no manda WhatsApp):

```bash
curl -X POST https://tudominio.com/api/cobranza/procesar \
  -H "x-service-token: ZVKfSXiAMtWYS3uT8HSa6HZR3qEJ1Lyh" \
  -H "Content-Type: application/json" \
  -d '{"enviarRecordatorios": false}'
```

---

## El contenedor se reinicia en bucle

**Mira los logs del servicio.** El arranque dice exactamente qué falta: busca
una línea que empiece con `✗ ERROR:`.

| Mensaje en el log | Solución |
|---|---|
| `falta la variable DATABASE_URL` | Defínela en Environment (apartado 2). |
| `falta la variable JWT_SECRET` | Defínela en Environment (cualquier cadena aleatoria larga). |
| `fallaron las migraciones` | Mira el error de Prisma justo encima; los cuatro más comunes están abajo. |
| `FATAL: (ENOTFOUND) tenant/user postgres.XXX not found` | Estás usando una cadena de Supabase Cloud. Si tu Supabase es auto-alojado, usa el **Caso A**: usuario `postgres` a secas, sin project ref ni pooler. |
| `getaddrinfo ENOTFOUND <host>` | El hostname no se resuelve. En auto-alojado, el CRM y Supabase deben estar en el mismo proyecto de EasyPanel. |
| `password authentication failed` | Contraseña incorrecta, o con símbolos sin codificar (`@` → `%40`). |
| `prepared statement "s0" already exists` | Falta `?pgbouncer=true` en `DATABASE_URL` (sólo aplica a Supabase Cloud). |
| `P3005: The database schema is not empty` | Aplicaste `supabase-setup.sql` a mano y no corriste después `npm run prisma:resolve`. |
| `el backend terminó durante el arranque` | Justo encima aparece la lista de variables obligatorias que faltan. |
| `el backend no respondió tras 80 segundos` | La conexión a la base se queda colgada. Verifica el hostname y que el puerto sea alcanzable. |

Si el sistema arranca pero avisa de variables **recomendadas** que faltan, no es
un error: el panel funciona, pero esas funciones concretas fallarán al usarse
(por ejemplo, sin `SUPABASE_URL` no se pueden subir documentos).

---

## Otros problemas frecuentes

| Síntoma | Causa y solución |
|---|---|
| `exec ./docker-entrypoint.sh: no such file or directory` | El script se subió con finales de línea CRLF. El `.gitattributes` del repo lo evita; si lo editaste en Windows, verifica que se guardó con LF. |
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
