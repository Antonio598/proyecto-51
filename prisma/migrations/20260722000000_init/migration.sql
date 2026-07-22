-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('captura', 'tecnico', 'comercial', 'administracion', 'admin');

-- CreateEnum
CREATE TYPE "EstadoExpediente" AS ENUM ('en_captura', 'en_analisis_tecnico', 'en_revision_comercial', 'ajustado', 'aprobado', 'enviado_a_cliente');

-- CreateEnum
CREATE TYPE "TipoUnidad" AS ENUM ('camion', 'tractocamion', 'remolque', 'otro');

-- CreateEnum
CREATE TYPE "TipoDocumento" AS ENUM ('recibido', 'comparativo', 'propuesta', 'desglose', 'poliza', 'factura', 'complemento', 'comprobante_pago');

-- CreateEnum
CREATE TYPE "OrigenDocumento" AS ENUM ('whatsapp', 'generado', 'manual_upload');

-- CreateEnum
CREATE TYPE "EstadoRevision" AS ENUM ('pendiente', 'aprobado', 'corregido');

-- CreateEnum
CREATE TYPE "EstadoPoliza" AS ENUM ('pendiente_emision', 'emitida', 'cancelada');

-- CreateEnum
CREATE TYPE "EstadoCobranza" AS ENUM ('vigente', 'por_vencer', 'vencido', 'pagado');

-- CreateEnum
CREATE TYPE "FormaPago" AS ENUM ('transferencia', 'efectivo', 'cheque', 'tarjeta', 'otro');

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
CREATE TABLE "Comentario" (
    "id" TEXT NOT NULL,
    "expedienteId" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "contenido" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comentario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
CREATE TABLE "Comparativo" (
    "id" TEXT NOT NULL,
    "expedienteId" TEXT NOT NULL,
    "datosTabla" JSONB NOT NULL,
    "pdfDocId" TEXT,
    "excelDocId" TEXT,
    "generadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comparativo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropuestaCliente" (
    "id" TEXT NOT NULL,
    "expedienteId" TEXT NOT NULL,
    "contenido" JSONB NOT NULL,
    "pdfDocId" TEXT,
    "enviadaEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PropuestaCliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
CREATE TABLE "Factura" (
    "id" TEXT NOT NULL,
    "polizaId" TEXT NOT NULL,
    "tipo" "TipoDocumento" NOT NULL,
    "storageDocId" TEXT,
    "enviadoAlClienteEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Factura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
CREATE TABLE "Siniestro" (
    "id" TEXT NOT NULL,
    "polizaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Siniestro_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Notificacion_usuarioId_leida_idx" ON "Notificacion"("usuarioId", "leida");

-- CreateIndex
CREATE INDEX "Notificacion_rolDestino_leida_idx" ON "Notificacion"("rolDestino", "leida");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_whatsappNumber_key" ON "Cliente"("whatsappNumber");

-- CreateIndex
CREATE INDEX "Cliente_razonSocial_idx" ON "Cliente"("razonSocial");

-- CreateIndex
CREATE INDEX "Unidad_clienteId_idx" ON "Unidad"("clienteId");

-- CreateIndex
CREATE INDEX "Unidad_vin_idx" ON "Unidad"("vin");

-- CreateIndex
CREATE UNIQUE INDEX "Aseguradora_nombre_key" ON "Aseguradora"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Expediente_folioInterno_key" ON "Expediente"("folioInterno");

-- CreateIndex
CREATE INDEX "Expediente_clienteId_idx" ON "Expediente"("clienteId");

-- CreateIndex
CREATE INDEX "Expediente_estado_idx" ON "Expediente"("estado");

-- CreateIndex
CREATE INDEX "Comentario_expedienteId_idx" ON "Comentario"("expedienteId");

-- CreateIndex
CREATE INDEX "Documento_clienteId_idx" ON "Documento"("clienteId");

-- CreateIndex
CREATE INDEX "Documento_origen_procesado_idx" ON "Documento"("origen", "procesado");

-- CreateIndex
CREATE UNIQUE INDEX "Extraccion_documentoId_key" ON "Extraccion"("documentoId");

-- CreateIndex
CREATE INDEX "Extraccion_estadoRevision_idx" ON "Extraccion"("estadoRevision");

-- CreateIndex
CREATE INDEX "PropuestaAseguradora_expedienteId_idx" ON "PropuestaAseguradora"("expedienteId");

-- CreateIndex
CREATE UNIQUE INDEX "PropuestaAseguradora_expedienteId_aseguradoraId_key" ON "PropuestaAseguradora"("expedienteId", "aseguradoraId");

-- CreateIndex
CREATE INDEX "Comparativo_expedienteId_idx" ON "Comparativo"("expedienteId");

-- CreateIndex
CREATE UNIQUE INDEX "PropuestaCliente_expedienteId_key" ON "PropuestaCliente"("expedienteId");

-- CreateIndex
CREATE INDEX "Poliza_clienteId_idx" ON "Poliza"("clienteId");

-- CreateIndex
CREATE INDEX "Poliza_estado_idx" ON "Poliza"("estado");

-- CreateIndex
CREATE INDEX "Corte_estado_idx" ON "Corte"("estado");

-- CreateIndex
CREATE INDEX "Corte_fechaProximoPago_idx" ON "Corte"("fechaProximoPago");

-- CreateIndex
CREATE UNIQUE INDEX "Corte_polizaId_periodo_key" ON "Corte"("polizaId", "periodo");

-- CreateIndex
CREATE INDEX "Pago_polizaId_idx" ON "Pago"("polizaId");

-- CreateIndex
CREATE INDEX "Factura_polizaId_idx" ON "Factura"("polizaId");

-- CreateIndex
CREATE INDEX "AuditLog_entidad_entidadId_idx" ON "AuditLog"("entidad", "entidadId");

-- CreateIndex
CREATE INDEX "AuditLog_timestamp_idx" ON "AuditLog"("timestamp");

-- CreateIndex
CREATE INDEX "Siniestro_polizaId_idx" ON "Siniestro"("polizaId");

-- AddForeignKey
ALTER TABLE "Notificacion" ADD CONSTRAINT "Notificacion_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notificacion" ADD CONSTRAINT "Notificacion_expedienteId_fkey" FOREIGN KEY ("expedienteId") REFERENCES "Expediente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unidad" ADD CONSTRAINT "Unidad_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expediente" ADD CONSTRAINT "Expediente_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expediente" ADD CONSTRAINT "Expediente_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comentario" ADD CONSTRAINT "Comentario_expedienteId_fkey" FOREIGN KEY ("expedienteId") REFERENCES "Expediente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comentario" ADD CONSTRAINT "Comentario_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Documento" ADD CONSTRAINT "Documento_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Documento" ADD CONSTRAINT "Documento_expedienteId_fkey" FOREIGN KEY ("expedienteId") REFERENCES "Expediente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Documento" ADD CONSTRAINT "Documento_polizaId_fkey" FOREIGN KEY ("polizaId") REFERENCES "Poliza"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Extraccion" ADD CONSTRAINT "Extraccion_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "Documento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Extraccion" ADD CONSTRAINT "Extraccion_revisadoPorId_fkey" FOREIGN KEY ("revisadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropuestaAseguradora" ADD CONSTRAINT "PropuestaAseguradora_expedienteId_fkey" FOREIGN KEY ("expedienteId") REFERENCES "Expediente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropuestaAseguradora" ADD CONSTRAINT "PropuestaAseguradora_aseguradoraId_fkey" FOREIGN KEY ("aseguradoraId") REFERENCES "Aseguradora"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comparativo" ADD CONSTRAINT "Comparativo_expedienteId_fkey" FOREIGN KEY ("expedienteId") REFERENCES "Expediente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropuestaCliente" ADD CONSTRAINT "PropuestaCliente_expedienteId_fkey" FOREIGN KEY ("expedienteId") REFERENCES "Expediente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Poliza" ADD CONSTRAINT "Poliza_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Poliza" ADD CONSTRAINT "Poliza_unidadId_fkey" FOREIGN KEY ("unidadId") REFERENCES "Unidad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Poliza" ADD CONSTRAINT "Poliza_aseguradoraId_fkey" FOREIGN KEY ("aseguradoraId") REFERENCES "Aseguradora"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Poliza" ADD CONSTRAINT "Poliza_expedienteId_fkey" FOREIGN KEY ("expedienteId") REFERENCES "Expediente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Corte" ADD CONSTRAINT "Corte_polizaId_fkey" FOREIGN KEY ("polizaId") REFERENCES "Poliza"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_polizaId_fkey" FOREIGN KEY ("polizaId") REFERENCES "Poliza"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_corteId_fkey" FOREIGN KEY ("corteId") REFERENCES "Corte"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Factura" ADD CONSTRAINT "Factura_polizaId_fkey" FOREIGN KEY ("polizaId") REFERENCES "Poliza"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Siniestro" ADD CONSTRAINT "Siniestro_polizaId_fkey" FOREIGN KEY ("polizaId") REFERENCES "Poliza"("id") ON DELETE CASCADE ON UPDATE CASCADE;

