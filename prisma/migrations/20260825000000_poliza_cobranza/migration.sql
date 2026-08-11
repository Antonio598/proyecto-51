-- Datos de cobranza capturados a mano en la póliza (no hay API con la aseguradora).
ALTER TABLE "Poliza" ADD COLUMN "primaNeta" DECIMAL(14,2);
ALTER TABLE "Poliza" ADD COLUMN "gastosExpedicion" DECIMAL(14,2);
ALTER TABLE "Poliza" ADD COLUMN "iva" DECIMAL(14,2);
ALTER TABLE "Poliza" ADD COLUMN "primaTotal" DECIMAL(14,2);
ALTER TABLE "Poliza" ADD COLUMN "numeroPagos" INTEGER;
