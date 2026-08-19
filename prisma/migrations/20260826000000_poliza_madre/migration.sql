-- Rediseño de cobranza: Póliza Madre (una por cliente+aseguradora) + parcialidades.
-- La cobranza pasa de vivir por póliza (Corte) a concentrarse en la Madre (CorteMadre).
-- El modelo Corte por póliza se conserva como historial; deja de ser la unidad activa.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- CreateEnum
CREATE TYPE "Periodicidad" AS ENUM ('de_contado', 'mensual', 'bimestral', 'trimestral');

-- CreateTable
CREATE TABLE "PolizaMadre" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "aseguradoraId" TEXT NOT NULL,
    "periodicidad" "Periodicidad" NOT NULL DEFAULT 'mensual',
    "numeroPagos" INTEGER NOT NULL DEFAULT 12,
    "fechaEmision" TIMESTAMP(3),
    "primeraFechaPago" TIMESTAMP(3),
    "primaNeta" DECIMAL(14,2),
    "financiamiento" DECIMAL(14,2),
    "gastosExpedicion" DECIMAL(14,2),
    "iva" DECIMAL(14,2),
    "primaTotal" DECIMAL(14,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PolizaMadre_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorteMadre" (
    "id" TEXT NOT NULL,
    "polizaMadreId" TEXT NOT NULL,
    "numeroParcialidad" INTEGER NOT NULL,
    "periodo" TEXT NOT NULL,
    "fechaCorte" TIMESTAMP(3) NOT NULL,
    "fechaVencimiento" TIMESTAMP(3) NOT NULL,
    "montoEsperado" DECIMAL(14,2),
    "esPrimerPago" BOOLEAN NOT NULL DEFAULT false,
    "estado" "EstadoCobranza" NOT NULL DEFAULT 'vigente',
    "pagadoEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CorteMadre_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Poliza" ADD COLUMN "polizaMadreId" TEXT;
ALTER TABLE "Poliza" ADD COLUMN "financiamiento" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "Pago" ADD COLUMN "corteMadreId" TEXT;

-- CreateIndex
CREATE INDEX "PolizaMadre_clienteId_idx" ON "PolizaMadre"("clienteId");

-- CreateIndex
CREATE UNIQUE INDEX "PolizaMadre_clienteId_aseguradoraId_key" ON "PolizaMadre"("clienteId", "aseguradoraId");

-- CreateIndex
CREATE INDEX "CorteMadre_estado_idx" ON "CorteMadre"("estado");

-- CreateIndex
CREATE INDEX "CorteMadre_fechaVencimiento_idx" ON "CorteMadre"("fechaVencimiento");

-- CreateIndex
CREATE UNIQUE INDEX "CorteMadre_polizaMadreId_numeroParcialidad_key" ON "CorteMadre"("polizaMadreId", "numeroParcialidad");

-- CreateIndex
CREATE INDEX "Poliza_polizaMadreId_idx" ON "Poliza"("polizaMadreId");

-- AddForeignKey
ALTER TABLE "PolizaMadre" ADD CONSTRAINT "PolizaMadre_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolizaMadre" ADD CONSTRAINT "PolizaMadre_aseguradoraId_fkey" FOREIGN KEY ("aseguradoraId") REFERENCES "Aseguradora"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorteMadre" ADD CONSTRAINT "CorteMadre_polizaMadreId_fkey" FOREIGN KEY ("polizaMadreId") REFERENCES "PolizaMadre"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Poliza" ADD CONSTRAINT "Poliza_polizaMadreId_fkey" FOREIGN KEY ("polizaMadreId") REFERENCES "PolizaMadre"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_corteMadreId_fkey" FOREIGN KEY ("corteMadreId") REFERENCES "CorteMadre"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────
-- Backfill: agrupar las pólizas existentes en su Póliza Madre.
-- ─────────────────────────────────────────────────────────────

-- 1. Una Madre por cada (cliente, aseguradora) que ya tenga pólizas.
INSERT INTO "PolizaMadre" (
    "id", "clienteId", "aseguradoraId", "periodicidad", "numeroPagos",
    "fechaEmision", "primeraFechaPago", "createdAt", "updatedAt"
)
SELECT
    gen_random_uuid()::text,
    p."clienteId",
    p."aseguradoraId",
    'mensual',
    12,
    MIN(p."vigenciaInicio") FILTER (WHERE p."estado" = 'emitida'),
    MIN(p."vigenciaInicio") FILTER (WHERE p."estado" = 'emitida') + interval '10 days',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Poliza" p
GROUP BY p."clienteId", p."aseguradoraId";

-- 2. Vincular cada hija a su Madre.
UPDATE "Poliza" p
SET "polizaMadreId" = m."id"
FROM "PolizaMadre" m
WHERE m."clienteId" = p."clienteId" AND m."aseguradoraId" = p."aseguradoraId";

-- 3. Consolidar los cortes abiertos existentes en una parcialidad de la Madre,
--    preservando fechas y sumando importes para no romper la continuidad de cobranza.
INSERT INTO "CorteMadre" (
    "id", "polizaMadreId", "numeroParcialidad", "periodo",
    "fechaCorte", "fechaVencimiento", "montoEsperado", "esPrimerPago",
    "estado", "createdAt", "updatedAt"
)
SELECT
    gen_random_uuid()::text,
    m."id",
    1,
    to_char(MIN(c."fechaCorte"), 'YYYY-MM'),
    MIN(c."fechaCorte"),
    MIN(c."fechaProximoPago"),
    SUM(c."montoEsperado"),
    true,
    'vigente',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Corte" c
JOIN "Poliza" p ON p."id" = c."polizaId"
JOIN "PolizaMadre" m ON m."clienteId" = p."clienteId" AND m."aseguradoraId" = p."aseguradoraId"
WHERE c."estado" <> 'pagado'
GROUP BY m."id";
