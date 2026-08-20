-- Endosos (alta/baja/cancelación) + facturas ligadas por RFC al cliente.

-- CreateEnum
CREATE TYPE "MovimientoEndoso" AS ENUM ('alta', 'baja', 'cancelacion');

-- AlterTable: banderas de endoso en la póliza (la cancelada NO se borra).
ALTER TABLE "Poliza" ADD COLUMN "canceladaEn" TIMESTAMP(3);
ALTER TABLE "Poliza" ADD COLUMN "altaPorEndoso" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: factura ahora puede ligarse por RFC al cliente (póliza opcional).
ALTER TABLE "Factura" ALTER COLUMN "polizaId" DROP NOT NULL;
ALTER TABLE "Factura" ADD COLUMN "clienteId" TEXT;

-- CreateTable
CREATE TABLE "Endoso" (
    "id" TEXT NOT NULL,
    "movimiento" "MovimientoEndoso" NOT NULL,
    "serie" TEXT,
    "rfc" TEXT,
    "importe" DECIMAL(14,2),
    "polizaId" TEXT,
    "storageDocId" TEXT,
    "notas" TEXT,
    "aplicadoEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Endoso_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Factura_clienteId_idx" ON "Factura"("clienteId");

-- CreateIndex
CREATE INDEX "Endoso_polizaId_idx" ON "Endoso"("polizaId");

-- CreateIndex
CREATE INDEX "Endoso_serie_idx" ON "Endoso"("serie");

-- AddForeignKey
ALTER TABLE "Factura" ADD CONSTRAINT "Factura_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Endoso" ADD CONSTRAINT "Endoso_polizaId_fkey" FOREIGN KEY ("polizaId") REFERENCES "Poliza"("id") ON DELETE SET NULL ON UPDATE CASCADE;
