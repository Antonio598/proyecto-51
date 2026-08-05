-- Campos adicionales de la unidad, según el layout de flota del despacho.
ALTER TABLE "Unidad" ADD COLUMN "aseguradoNombre" TEXT;
ALTER TABLE "Unidad" ADD COLUMN "numeroEconomico" TEXT;
ALTER TABLE "Unidad" ADD COLUMN "placas" TEXT;
ALTER TABLE "Unidad" ADD COLUMN "numeroMotor" TEXT;
ALTER TABLE "Unidad" ADD COLUMN "usoUnidad" TEXT;
ALTER TABLE "Unidad" ADD COLUMN "tipoCobertura" TEXT;
ALTER TABLE "Unidad" ADD COLUMN "dobleRemolque" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Unidad" ADD COLUMN "tipoAdaptacion" TEXT;
ALTER TABLE "Unidad" ADD COLUMN "coberturaAdaptacion" TEXT;
ALTER TABLE "Unidad" ADD COLUMN "sumaAseguradaAdaptacion" DECIMAL(14,2);
