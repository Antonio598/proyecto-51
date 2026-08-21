-- Notas de crédito (ligadas por IA a cliente/factura) + UUID en factura.

-- AlterTable
ALTER TABLE "Factura" ADD COLUMN "uuid" TEXT;

-- CreateIndex
CREATE INDEX "Factura_uuid_idx" ON "Factura"("uuid");

-- CreateTable
CREATE TABLE "NotaCredito" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT,
    "facturaId" TEXT,
    "uuidRelacionado" TEXT,
    "importe" DECIMAL(14,2),
    "storageDocId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotaCredito_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotaCredito_clienteId_idx" ON "NotaCredito"("clienteId");

-- CreateIndex
CREATE INDEX "NotaCredito_facturaId_idx" ON "NotaCredito"("facturaId");

-- AddForeignKey
ALTER TABLE "NotaCredito" ADD CONSTRAINT "NotaCredito_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotaCredito" ADD CONSTRAINT "NotaCredito_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "Factura"("id") ON DELETE SET NULL ON UPDATE CASCADE;
