-- Historial de recordatorios de cobranza enviados por correo (idempotencia por clave).

-- CreateTable
CREATE TABLE "RecordatorioCobranza" (
    "id" TEXT NOT NULL,
    "corteMadreId" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "canal" TEXT NOT NULL DEFAULT 'correo',
    "destino" TEXT,
    "asunto" TEXT,
    "diasRestantes" INTEGER,
    "enviadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecordatorioCobranza_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecordatorioCobranza_corteMadreId_idx" ON "RecordatorioCobranza"("corteMadreId");

-- CreateIndex
CREATE UNIQUE INDEX "RecordatorioCobranza_corteMadreId_clave_key" ON "RecordatorioCobranza"("corteMadreId", "clave");

-- AddForeignKey
ALTER TABLE "RecordatorioCobranza" ADD CONSTRAINT "RecordatorioCobranza_corteMadreId_fkey" FOREIGN KEY ("corteMadreId") REFERENCES "CorteMadre"("id") ON DELETE CASCADE ON UPDATE CASCADE;
