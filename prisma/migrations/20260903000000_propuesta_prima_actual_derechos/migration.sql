-- Datos extra por oferta para el comparativo (prima vigente y derechos de póliza).
ALTER TABLE "PropuestaAseguradora"
  ADD COLUMN "primaActual" DECIMAL(14,2),
  ADD COLUMN "derechosPoliza" DECIMAL(14,2);
