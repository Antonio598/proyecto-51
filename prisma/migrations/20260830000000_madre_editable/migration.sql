-- Edición manual: totales de la Póliza Madre y fecha de vencimiento de parcialidades.
ALTER TABLE "PolizaMadre" ADD COLUMN "totalesManual" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CorteMadre" ADD COLUMN "fechaManual" BOOLEAN NOT NULL DEFAULT false;
