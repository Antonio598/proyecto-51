-- Póliza Madre por flota: cada flota se cobra por separado (cliente + flota + aseguradora).
-- Las Madres existentes quedan con flotaId NULL (el agrupado por flota aplica a nuevas emisiones).

-- AlterTable
ALTER TABLE "PolizaMadre" ADD COLUMN "flotaId" TEXT;

-- Reemplazar el índice único (cliente, aseguradora) por (cliente, flota, aseguradora).
DROP INDEX "PolizaMadre_clienteId_aseguradoraId_key";
CREATE UNIQUE INDEX "PolizaMadre_clienteId_flotaId_aseguradoraId_key" ON "PolizaMadre"("clienteId", "flotaId", "aseguradoraId");

-- CreateIndex
CREATE INDEX "PolizaMadre_flotaId_idx" ON "PolizaMadre"("flotaId");

-- AddForeignKey
ALTER TABLE "PolizaMadre" ADD CONSTRAINT "PolizaMadre_flotaId_fkey" FOREIGN KEY ("flotaId") REFERENCES "Flota"("id") ON DELETE SET NULL ON UPDATE CASCADE;
