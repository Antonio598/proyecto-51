-- Proceso del expediente por flota: propuestas, comparativo y propuesta al cliente
-- se etiquetan por flota (todo dentro del mismo expediente).

-- PropuestaAseguradora: flota + unique por (expediente, flota, aseguradora).
ALTER TABLE "PropuestaAseguradora" ADD COLUMN "flotaId" TEXT;
DROP INDEX "PropuestaAseguradora_expedienteId_aseguradoraId_key";
CREATE UNIQUE INDEX "PropuestaAseguradora_expedienteId_flotaId_aseguradoraId_key" ON "PropuestaAseguradora"("expedienteId", "flotaId", "aseguradoraId");

-- Comparativo por flota.
ALTER TABLE "Comparativo" ADD COLUMN "flotaId" TEXT;

-- PropuestaCliente: flota + unique por (expediente, flota) en lugar de solo expediente.
ALTER TABLE "PropuestaCliente" ADD COLUMN "flotaId" TEXT;
DROP INDEX "PropuestaCliente_expedienteId_key";
CREATE UNIQUE INDEX "PropuestaCliente_expedienteId_flotaId_key" ON "PropuestaCliente"("expedienteId", "flotaId");
