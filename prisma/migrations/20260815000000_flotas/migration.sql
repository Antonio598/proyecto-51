-- Flotas: agrupan unidades de un cliente; se crean solas al extraer documentos.
CREATE TABLE "Flota" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "folio" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Flota_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Flota_clienteId_idx" ON "Flota"("clienteId");

ALTER TABLE "Flota" ADD CONSTRAINT "Flota_clienteId_fkey"
    FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Unidad: liga a su flota y folio propio (que aparece en la póliza).
ALTER TABLE "Unidad" ADD COLUMN "flotaId" TEXT;
ALTER TABLE "Unidad" ADD COLUMN "folio" TEXT;

CREATE INDEX "Unidad_flotaId_idx" ON "Unidad"("flotaId");

ALTER TABLE "Unidad" ADD CONSTRAINT "Unidad_flotaId_fkey"
    FOREIGN KEY ("flotaId") REFERENCES "Flota"("id") ON DELETE SET NULL ON UPDATE CASCADE;
