-- ═══════════════════════════════════════════════════════════════════════════
--  CRM Seguros de Flotas — Script de instalación en Supabase
--
--  Pégalo completo en:  Supabase → SQL Editor → New query → Run
--  Es idempotente en lo posible: puedes releerlo, pero NO lo corras dos veces
--  sobre una base que ya tenga las tablas (fallará en los CREATE TYPE).
--
--  ⚠️ IMPORTANTE — después de correr esto, ejecuta UNA VEZ en tu máquina:
--       npx prisma migrate resolve --applied 20260722000000_init
--     Eso le dice a Prisma que la migración ya está aplicada. Si lo omites,
--     el `prisma migrate deploy` del arranque intentará crear las tablas otra
--     vez y el backend no levantará.
--
--     (Si prefieres evitar todo esto: no pegues nada aquí y corre
--      `npx prisma migrate deploy` desde tu máquina. Hace lo mismo y deja
--      el registro sincronizado solo.)
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
--  PARTE 1 — Tipos enumerados
-- ───────────────────────────────────────────────────────────────────────────

CREATE TYPE "Rol" AS ENUM ('captura', 'tecnico', 'comercial', 'administracion', 'admin');
CREATE TYPE "EstadoExpediente" AS ENUM ('en_captura', 'en_analisis_tecnico', 'en_revision_comercial', 'ajustado', 'aprobado', 'enviado_a_cliente');
CREATE TYPE "TipoUnidad" AS ENUM ('camion', 'tractocamion', 'remolque', 'otro');
CREATE TYPE "TipoDocumento" AS ENUM ('recibido', 'comparativo', 'propuesta', 'desglose', 'poliza', 'factura', 'complemento', 'comprobante_pago');
CREATE TYPE "OrigenDocumento" AS ENUM ('whatsapp', 'generado', 'manual_upload');
CREATE TYPE "EstadoRevision" AS ENUM ('pendiente', 'aprobado', 'corregido');
CREATE TYPE "EstadoPoliza" AS ENUM ('pendiente_emision', 'emitida', 'cancelada');
CREATE TYPE "EstadoCobranza" AS ENUM ('vigente', 'por_vencer', 'vencido', 'pagado');
CREATE TYPE "FormaPago" AS ENUM ('transferencia', 'efectivo', 'cheque', 'tarjeta', 'otro');


-- ───────────────────────────────────────────────────────────────────────────
--  PARTE 2 — Tablas
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "rol" "Rol" NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Notificacion" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT,
    "rolDestino" "Rol",
    "titulo" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "enlace" TEXT,
    "leida" BOOLEAN NOT NULL DEFAULT false,
    "expedienteId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notificacion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL,
    "razonSocial" TEXT NOT NULL,
    "rfc" TEXT,
    "datosFiscales" JSONB,
    "contactoNombre" TEXT,
    "contactoEmail" TEXT,
    "whatsappNumber" TEXT,
    "notas" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Unidad" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "tipo" "TipoUnidad" NOT NULL DEFAULT 'otro',
    "vin" TEXT,
    "anio" INTEGER,
    "marca" TEXT,
    "modelo" TEXT,
    "descripcion" TEXT,
    "tipoCarga" TEXT,
    "valorAsegurado" DECIMAL(14,2),
    "camposExtra" JSONB,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Unidad_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Aseguradora" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "contacto" TEXT,
    "notasPortal" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Aseguradora_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Expediente" (
    "id" TEXT NOT NULL,
    "folioInterno" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "estado" "EstadoExpediente" NOT NULL DEFAULT 'en_captura',
    "siniestralidad" TEXT,
    "aseguradorasSolicitadas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expediente_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Comentario" (
    "id" TEXT NOT NULL,
    "expedienteId" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "contenido" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comentario_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Documento" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT,
    "expedienteId" TEXT,
    "polizaId" TEXT,
    "tipo" "TipoDocumento" NOT NULL,
    "origen" "OrigenDocumento" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mime" TEXT,
    "nombreOriginal" TEXT,
    "procesado" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Documento_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Extraccion" (
    "id" TEXT NOT NULL,
    "documentoId" TEXT NOT NULL,
    "camposExtraidos" JSONB NOT NULL,
    "confianzaPorCampo" JSONB NOT NULL,
    "estadoRevision" "EstadoRevision" NOT NULL DEFAULT 'pendiente',
    "revisadoPorId" TEXT,
    "modeloUsado" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revisadoEn" TIMESTAMP(3),

    CONSTRAINT "Extraccion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PropuestaAseguradora" (
    "id" TEXT NOT NULL,
    "expedienteId" TEXT NOT NULL,
    "aseguradoraId" TEXT NOT NULL,
    "coberturas" JSONB NOT NULL,
    "prima" DECIMAL(14,2),
    "deducibles" JSONB,
    "condiciones" TEXT,
    "siniestralidad" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropuestaAseguradora_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Comparativo" (
    "id" TEXT NOT NULL,
    "expedienteId" TEXT NOT NULL,
    "datosTabla" JSONB NOT NULL,
    "pdfDocId" TEXT,
    "excelDocId" TEXT,
    "generadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comparativo_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PropuestaCliente" (
    "id" TEXT NOT NULL,
    "expedienteId" TEXT NOT NULL,
    "contenido" JSONB NOT NULL,
    "pdfDocId" TEXT,
    "enviadaEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PropuestaCliente_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Poliza" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "unidadId" TEXT NOT NULL,
    "aseguradoraId" TEXT NOT NULL,
    "expedienteId" TEXT,
    "folio" TEXT,
    "vigenciaInicio" TIMESTAMP(3),
    "vigenciaFin" TIMESTAMP(3),
    "prima" DECIMAL(14,2),
    "estado" "EstadoPoliza" NOT NULL DEFAULT 'pendiente_emision',
    "pdfDocId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Poliza_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Corte" (
    "id" TEXT NOT NULL,
    "polizaId" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "fechaCorte" TIMESTAMP(3) NOT NULL,
    "fechaProximoPago" TIMESTAMP(3) NOT NULL,
    "montoEsperado" DECIMAL(14,2),
    "estado" "EstadoCobranza" NOT NULL DEFAULT 'vigente',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Corte_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Pago" (
    "id" TEXT NOT NULL,
    "polizaId" TEXT NOT NULL,
    "corteId" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL,
    "monto" DECIMAL(14,2) NOT NULL,
    "forma" "FormaPago" NOT NULL DEFAULT 'transferencia',
    "comprobanteDocId" TEXT,
    "aplicadoEnPortal" BOOLEAN NOT NULL DEFAULT false,
    "registradoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pago_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Factura" (
    "id" TEXT NOT NULL,
    "polizaId" TEXT NOT NULL,
    "tipo" "TipoDocumento" NOT NULL,
    "storageDocId" TEXT,
    "enviadoAlClienteEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Factura_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidadId" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "actorUserId" TEXT,
    "diff" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- Reservada para el módulo futuro de Siniestros (sin lógica en esta fase).
CREATE TABLE "Siniestro" (
    "id" TEXT NOT NULL,
    "polizaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Siniestro_pkey" PRIMARY KEY ("id")
);


-- ───────────────────────────────────────────────────────────────────────────
--  PARTE 3 — Índices
-- ───────────────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "Notificacion_usuarioId_leida_idx" ON "Notificacion"("usuarioId", "leida");
CREATE INDEX "Notificacion_rolDestino_leida_idx" ON "Notificacion"("rolDestino", "leida");
CREATE UNIQUE INDEX "Cliente_whatsappNumber_key" ON "Cliente"("whatsappNumber");
CREATE INDEX "Cliente_razonSocial_idx" ON "Cliente"("razonSocial");
CREATE INDEX "Unidad_clienteId_idx" ON "Unidad"("clienteId");
CREATE INDEX "Unidad_vin_idx" ON "Unidad"("vin");
CREATE UNIQUE INDEX "Aseguradora_nombre_key" ON "Aseguradora"("nombre");
CREATE UNIQUE INDEX "Expediente_folioInterno_key" ON "Expediente"("folioInterno");
CREATE INDEX "Expediente_clienteId_idx" ON "Expediente"("clienteId");
CREATE INDEX "Expediente_estado_idx" ON "Expediente"("estado");
CREATE INDEX "Comentario_expedienteId_idx" ON "Comentario"("expedienteId");
CREATE INDEX "Documento_clienteId_idx" ON "Documento"("clienteId");
CREATE INDEX "Documento_origen_procesado_idx" ON "Documento"("origen", "procesado");
CREATE UNIQUE INDEX "Extraccion_documentoId_key" ON "Extraccion"("documentoId");
CREATE INDEX "Extraccion_estadoRevision_idx" ON "Extraccion"("estadoRevision");
CREATE INDEX "PropuestaAseguradora_expedienteId_idx" ON "PropuestaAseguradora"("expedienteId");
CREATE UNIQUE INDEX "PropuestaAseguradora_expedienteId_aseguradoraId_key" ON "PropuestaAseguradora"("expedienteId", "aseguradoraId");
CREATE INDEX "Comparativo_expedienteId_idx" ON "Comparativo"("expedienteId");
CREATE UNIQUE INDEX "PropuestaCliente_expedienteId_key" ON "PropuestaCliente"("expedienteId");
CREATE INDEX "Poliza_clienteId_idx" ON "Poliza"("clienteId");
CREATE INDEX "Poliza_estado_idx" ON "Poliza"("estado");
CREATE INDEX "Corte_estado_idx" ON "Corte"("estado");
CREATE INDEX "Corte_fechaProximoPago_idx" ON "Corte"("fechaProximoPago");
CREATE UNIQUE INDEX "Corte_polizaId_periodo_key" ON "Corte"("polizaId", "periodo");
CREATE INDEX "Pago_polizaId_idx" ON "Pago"("polizaId");
CREATE INDEX "Factura_polizaId_idx" ON "Factura"("polizaId");
CREATE INDEX "AuditLog_entidad_entidadId_idx" ON "AuditLog"("entidad", "entidadId");
CREATE INDEX "AuditLog_timestamp_idx" ON "AuditLog"("timestamp");
CREATE INDEX "Siniestro_polizaId_idx" ON "Siniestro"("polizaId");


-- ───────────────────────────────────────────────────────────────────────────
--  PARTE 4 — Llaves foráneas
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE "Notificacion" ADD CONSTRAINT "Notificacion_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Notificacion" ADD CONSTRAINT "Notificacion_expedienteId_fkey" FOREIGN KEY ("expedienteId") REFERENCES "Expediente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Unidad" ADD CONSTRAINT "Unidad_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Expediente" ADD CONSTRAINT "Expediente_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Expediente" ADD CONSTRAINT "Expediente_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Comentario" ADD CONSTRAINT "Comentario_expedienteId_fkey" FOREIGN KEY ("expedienteId") REFERENCES "Expediente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Comentario" ADD CONSTRAINT "Comentario_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Documento" ADD CONSTRAINT "Documento_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Documento" ADD CONSTRAINT "Documento_expedienteId_fkey" FOREIGN KEY ("expedienteId") REFERENCES "Expediente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Documento" ADD CONSTRAINT "Documento_polizaId_fkey" FOREIGN KEY ("polizaId") REFERENCES "Poliza"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Extraccion" ADD CONSTRAINT "Extraccion_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "Documento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Extraccion" ADD CONSTRAINT "Extraccion_revisadoPorId_fkey" FOREIGN KEY ("revisadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PropuestaAseguradora" ADD CONSTRAINT "PropuestaAseguradora_expedienteId_fkey" FOREIGN KEY ("expedienteId") REFERENCES "Expediente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PropuestaAseguradora" ADD CONSTRAINT "PropuestaAseguradora_aseguradoraId_fkey" FOREIGN KEY ("aseguradoraId") REFERENCES "Aseguradora"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Comparativo" ADD CONSTRAINT "Comparativo_expedienteId_fkey" FOREIGN KEY ("expedienteId") REFERENCES "Expediente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PropuestaCliente" ADD CONSTRAINT "PropuestaCliente_expedienteId_fkey" FOREIGN KEY ("expedienteId") REFERENCES "Expediente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Poliza" ADD CONSTRAINT "Poliza_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Poliza" ADD CONSTRAINT "Poliza_unidadId_fkey" FOREIGN KEY ("unidadId") REFERENCES "Unidad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Poliza" ADD CONSTRAINT "Poliza_aseguradoraId_fkey" FOREIGN KEY ("aseguradoraId") REFERENCES "Aseguradora"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Poliza" ADD CONSTRAINT "Poliza_expedienteId_fkey" FOREIGN KEY ("expedienteId") REFERENCES "Expediente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Corte" ADD CONSTRAINT "Corte_polizaId_fkey" FOREIGN KEY ("polizaId") REFERENCES "Poliza"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_polizaId_fkey" FOREIGN KEY ("polizaId") REFERENCES "Poliza"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_corteId_fkey" FOREIGN KEY ("corteId") REFERENCES "Corte"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Factura" ADD CONSTRAINT "Factura_polizaId_fkey" FOREIGN KEY ("polizaId") REFERENCES "Poliza"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Siniestro" ADD CONSTRAINT "Siniestro_polizaId_fkey" FOREIGN KEY ("polizaId") REFERENCES "Poliza"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ───────────────────────────────────────────────────────────────────────────
--  PARTE 5 — Bucket de documentos (Supabase Storage)
--  PRIVADO: los archivos sólo se sirven con URLs firmadas desde el backend.
-- ───────────────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('documentos', 'documentos', false)
ON CONFLICT (id) DO NOTHING;

-- No se crean políticas de acceso público a propósito: el backend usa la
-- service_role key, que omite RLS. Ningún cliente debe leer el bucket directo.


-- ───────────────────────────────────────────────────────────────────────────
--  PARTE 6 — Datos iniciales
--  Usuarios (contraseña: cambiar123) y catálogo de aseguradoras.
--  ⚠️ Cambia las contraseñas antes de usarlo en producción.
-- ───────────────────────────────────────────────────────────────────────────

INSERT INTO "User" ("id", "nombre", "email", "passwordHash", "rol", "updatedAt") VALUES
  ('usr_admin',    'Admin General',        'admin@despacho.mx',    '$2a$10$9R/Rwf9MU5m6WHrWD2fbNOhTKUEre89EoTBZJ71VhKUCoCbaoh.5u', 'admin',          CURRENT_TIMESTAMP),
  ('usr_captura',  'Ana Captura',          'captura@despacho.mx',  '$2a$10$9R/Rwf9MU5m6WHrWD2fbNOhTKUEre89EoTBZJ71VhKUCoCbaoh.5u', 'captura',        CURRENT_TIMESTAMP),
  ('usr_tecnico',  'Tomás Técnico',        'tecnico@despacho.mx',  '$2a$10$9R/Rwf9MU5m6WHrWD2fbNOhTKUEre89EoTBZJ71VhKUCoCbaoh.5u', 'tecnico',        CURRENT_TIMESTAMP),
  ('usr_comercial','Carla Comercial',      'comercial@despacho.mx','$2a$10$9R/Rwf9MU5m6WHrWD2fbNOhTKUEre89EoTBZJ71VhKUCoCbaoh.5u', 'comercial',      CURRENT_TIMESTAMP),
  ('usr_admon',    'Adán Administración',  'admon@despacho.mx',    '$2a$10$9R/Rwf9MU5m6WHrWD2fbNOhTKUEre89EoTBZJ71VhKUCoCbaoh.5u', 'administracion', CURRENT_TIMESTAMP)
ON CONFLICT ("email") DO NOTHING;

INSERT INTO "Aseguradora" ("id", "nombre", "contacto", "notasPortal", "updatedAt") VALUES
  ('asg_axa',      'AXA',      'Portal AXA Seguros', 'Capturar primero datos fiscales del contratante, luego unidad por unidad.', CURRENT_TIMESTAMP),
  ('asg_qualitas', 'Qualitas', 'Portal Qualitas',    NULL, CURRENT_TIMESTAMP)
ON CONFLICT ("nombre") DO NOTHING;


-- ═══════════════════════════════════════════════════════════════════════════
--  LISTO.
--
--  Siguientes pasos:
--    1. En tu máquina:  npx prisma migrate resolve --applied 20260722000000_init
--    2. Entra al panel con  admin@despacho.mx / cambiar123  y cambia la contraseña.
--    3. Opcional — datos de demo (cliente con flota, expediente aprobado y un
--       cobro vencido):  npm run prisma:seed
-- ═══════════════════════════════════════════════════════════════════════════
