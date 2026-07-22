# CRM Seguros de Flotas

Sistema de gestión integral (CRM a medida) para un despacho que coloca y administra pólizas de seguro para flotas de transporte de carga. Reemplaza por completo el CRM actual del despacho.

> **Criterio rector:** las aseguradoras (AXA y similares) no tienen API — su portal es manual y así se queda. **No se construye RPA sobre esos portales.** Todo lo demás bajo control del despacho se automatiza al máximo. Los dos únicos puntos de captura manual son: teclear datos en el portal para cotizar/emitir, y marcar un pago como aplicado.

## Stack

| Capa | Tecnología |
|---|---|
| Backend | NestJS + TypeScript (API REST) |
| Base de datos | **Supabase** (PostgreSQL) + Prisma |
| Documentos | **Supabase Storage** |
| Frontend | Next.js (App Router) + Tailwind |
| Auth | JWT + RBAC (roles: captura, técnico, comercial, administración, admin) |
| IA | Claude API (`claude-opus-4-8`) — extracción con salida estructurada y visión |
| WhatsApp | Evolution API *(ya existente)* |
| Orquestación | n8n *(ya existente)* |

## Estructura

```
apps/backend     API NestJS
  src/auth           JWT + RBAC
  src/clientes       Módulo 1 — clientes y flotas
  src/whatsapp       Módulo 2 — Evolution API (webhook de entrada + envío)
  src/ia             Módulo 3 — extracción y redacción con Claude
  src/documentos     Bandeja, revisión y aprobación de extracciones
  src/expedientes    Módulos 4–6 — propuestas, comparativo, aprobación, propuesta al cliente
  src/polizas        Módulo 7 — emisión y checklists de captura en el portal
  src/cobranza       Módulos 8–9 — desglose de costos y cobranza recurrente
  src/pagos          Módulo 10 — conciliación de comprobantes y registro de pagos
  src/facturas       Módulo 11 — facturas y complementos
  src/generacion     Generación de PDF (pdfkit) y Excel (exceljs)
  src/notificaciones Avisos internos entre áreas
  src/storage        Supabase Storage
apps/frontend    Panel Next.js (español)
prisma/          Esquema de datos completo + seed
n8n/             Workflows exportados y versionados
```

## Instalación de la base de datos

Dos caminos equivalentes — **elige uno**:

**A) Desde tu máquina (recomendado).** Deja el registro de migraciones sincronizado solo:

```bash
npm run prisma:deploy
```

**B) Pegando SQL en Supabase.** Abre [`supabase-setup.sql`](supabase-setup.sql), pégalo en
*SQL Editor → New query → Run*. Incluye tablas, índices, llaves foráneas, el bucket de
Storage y los usuarios iniciales. Después ejecuta **una vez**:

```bash
npm run prisma:resolve
```

> ⚠️ Ese último paso no es opcional en el camino B: le dice a Prisma que la migración ya
> está aplicada. Si lo omites, el `prisma migrate deploy` del arranque intentará crear las
> tablas otra vez y el backend no levantará.

## Configuración de Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. **Base de datos** — Project Settings → Database → Connection string:
   - `DATABASE_URL` → *Transaction pooler* (puerto **6543**), la usa el backend en runtime.
   - `DIRECT_URL` → *Direct connection* (puerto **5432**), la usa Prisma para migrar.
3. **Storage** — crea un bucket **privado** llamado `documentos`.
4. **API keys** — Project Settings → API: copia la `service_role` key a `SUPABASE_SERVICE_ROLE_KEY`.
   Es secreta y omite RLS: solo va en el backend, **nunca** en el frontend.

## Arranque en local

Requisitos: Node 20+, un proyecto de Supabase y una API key de Claude.

```bash
cp .env.example .env      # edita credenciales
npm install

npm run prisma:generate
npm run prisma:migrate     # crea las tablas en Supabase
npm run prisma:seed        # usuarios/aseguradoras/clientes de prueba

npm run dev:backend        # http://localhost:3001/api
npm run dev:frontend       # http://localhost:3000
```

### Datos de prueba (seed)

Además de usuarios, aseguradoras y dos clientes con flota, el seed deja estado listo
para probar las fases C y D sin construirlo a mano:

- Un **expediente ya aprobado** con dos propuestas capturadas (AXA y Qualitas) → puedes
  generar la propuesta al cliente y preparar la emisión de inmediato.
- Una **póliza emitida con un cobro vencido** → el dashboard de cobranza y el cron de n8n
  tienen algo real que mostrar desde el primer arranque.

Contraseña para todos los usuarios: `cambiar123`

| Rol | Correo |
|---|---|
| admin | admin@despacho.mx |
| captura | captura@despacho.mx |
| técnico | tecnico@despacho.mx |
| comercial | comercial@despacho.mx |
| administración | admon@despacho.mx |

## Conectar WhatsApp (Evolution API)

En tu instancia de Evolution, configura el webhook apuntando al backend:

- **URL:** `https://TU_BACKEND/api/webhooks/evolution`
- **Header:** `x-webhook-token: <EVOLUTION_WEBHOOK_TOKEN>`
- **Evento:** `messages.upsert`

El sistema descarga los adjuntos, los guarda en Supabase Storage y los asocia al cliente
por su `whatsappNumber` (formato E.164, ej. `+525512345678`).

## Despliegue (VPS con Docker)

```bash
docker compose up -d --build
```

Solo levanta `backend` y `frontend` — la base de datos y el almacenamiento son de Supabase.
El backend aplica migraciones al arrancar (`prisma migrate deploy`).

## Roadmap por fases

- **Fase A — Fundamentos (lista):** modelo de datos completo, auth + RBAC, módulo 1 (clientes y flotas), auditoría, seed y despliegue.
- **Fase B — Entrada y extracción (lista):** módulo 2 (recepción por WhatsApp) + módulo 3 (extracción IA con confianza por campo y pantalla de revisión).
- **Fase C — Técnico → aprobación → propuesta (lista):** módulos 4–6 (comparativo automático, aprobación interna con comentarios, propuesta al cliente enviada por WhatsApp).
- **Fase D — Emisión y cobranza (lista):** módulos 7–11 (checklists de emisión, desglose, cobranza recurrente en n8n, conciliación automática de pagos, facturación).

El módulo de **Siniestros** queda reservado en el modelo de datos (`Poliza -> Siniestro[]`), sin implementar.

## Verificación end-to-end

**Fase A**
1. Inicia sesión con cada rol; confirma que `captura`/`admin` pueden crear clientes y `comercial` no (RBAC).
2. Crea un cliente, agrega unidades y revisa el bloque de **Auditoría** en su detalle.

**Fase B**
1. Registra tu número de prueba en un cliente (campo WhatsApp, formato `+52...`).
2. Envía un Excel, PDF o foto de las unidades a la instancia de Evolution.
3. Ve a **Documentos por procesar**: el archivo debe aparecer asociado al cliente.
4. Abre el documento → **Extraer con IA** → verifica que los campos de baja confianza salen
   resaltados en ámbar y que las notas reportan lo ambiguo.
5. Corrige lo que falte y pulsa **Aprobar**: las unidades se crean en la flota del cliente
   y el documento sale de la bandeja.

**Fase C**
1. Como **técnico**, crea un expediente: elige cliente, captura la siniestralidad y marca
   **a qué aseguradoras se solicitó propuesta** (esto es lo que dispara el comparativo).
2. Captura la propuesta de la primera aseguradora → el expediente pasa a *análisis técnico*.
3. Captura la **última** propuesta pendiente → el comparativo se genera solo (PDF + Excel),
   el expediente pasa a *revisión comercial* y aparece una notificación para ese rol.
4. Entra como **comercial**: abre la notificación, revisa el PDF, deja un comentario y
   pulsa **Aprobar** (o *Solicitar ajustes*, que lo devuelve a Técnico).
5. Entra como **administración**: elige la aseguradora ganadora → **Generar propuesta**
   (Claude redacta los textos; las cifras salen de la base) → **Enviar por WhatsApp**.

**Fase D**
1. En un expediente aprobado, elige la aseguradora y pulsa **Preparar emisión**: se crea
   una póliza por unidad y se notifica al área de captura.
2. En **Pólizas** → *Ver checklist*: los campos salen en el orden en que el portal los pide.
   Teclea en el portal (único paso manual), vuelve y pulsa **Marcar emitida** con el folio.
   Al hacerlo se abre automáticamente el primer corte de cobranza a 30 días.
3. En la ficha del cliente, **Generar desglose** y **Enviar por WhatsApp** (Excel + los PDF
   de las pólizas emitidas).
4. Corre el cron de cobranza a mano para probar (ver `n8n/README.md`) y revisa el
   dashboard en **Cobranza**.
5. Envía un comprobante de pago por WhatsApp desde el número del cliente: el sistema lo lee
   con Claude y propone la póliza/periodo que coincide. En **Pagos** confirma cuál es,
   revisa el checklist del portal, aplícalo allá y pulsa **Ya lo apliqué** — el sistema cierra
   el corte, abre el siguiente y lo saca de pendientes.
6. Abre una póliza desde **Pólizas** para adjuntar su carátula en PDF (Claude sugiere el folio)
   y para subir **facturas y complementos**, que se envían al cliente por WhatsApp.

`npm run prisma:studio` para inspeccionar los datos directamente.

## Pruebas

```bash
npm test --workspace @crm/backend
```

Cubren la lógica de la que depende que el dinero se aplique bien:

| Archivo | Qué protege |
|---|---|
| `src/pagos/puntuacion.spec.ts` | Conciliación de comprobantes: tolerancia del 2%, desempate por fecha, y que **dos pólizas con el mismo importe no se concilien solas** (exige confirmación humana). |
| `src/expedientes/transiciones.spec.ts` | Máquina de estados: no se puede aprobar sin revisión comercial ni enviar al cliente sin aprobación. |
| `src/polizas/fechas.spec.ts` | Cortes a 30 días **naturales** (no meses calendario): cruce de año, años bisiestos y no mutación de fechas. |

## Estado de salud

`GET /api/health` devuelve el estado del servicio y de la conexión a Supabase.
Docker Compose lo usa como `healthcheck` del contenedor del backend.

## Cobranza automática (n8n)

El cron vive en [`n8n/cobranza-recurrente.json`](n8n/cobranza-recurrente.json) — impórtalo en tu
instancia de n8n y define `CRM_API_URL` y `N8N_SERVICE_TOKEN`. Corre a diario: recalcula
estados de cobranza, envía recordatorios por WhatsApp y avisa al despacho si hay vencidos.
Instrucciones completas en [`n8n/README.md`](n8n/README.md).

## Nota sobre el uso de Claude

El modelo **no inventa cifras**. En la extracción devuelve `null` + confianza baja cuando un dato
no es legible, y en la propuesta al cliente redacta únicamente los textos narrativos: sumas
aseguradas, deducibles y primas se insertan desde la base de datos en tablas aparte.
