-- RFC como llave del cliente: normaliza, deduplica de forma segura y crea el índice único.

-- 1. Normalizar: mayúsculas, sin espacios; cadena vacía -> NULL.
UPDATE "Cliente" SET "rfc" = NULLIF(UPPER(TRIM("rfc")), '') WHERE "rfc" IS NOT NULL;

-- 2. Deduplicar sin borrar clientes: si dos clientes comparten RFC, se conserva
--    el más antiguo con el RFC y a los posteriores se les deja el RFC en NULL
--    (para revisión/mezcla manual). Evita que el índice único falle en el deploy.
WITH duplicados AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "rfc" ORDER BY "createdAt" ASC) AS rn
  FROM "Cliente"
  WHERE "rfc" IS NOT NULL
)
UPDATE "Cliente" c
SET "rfc" = NULL
FROM duplicados d
WHERE c."id" = d."id" AND d.rn > 1;

-- 3. Índice único (Postgres permite múltiples NULL).
CREATE UNIQUE INDEX "Cliente_rfc_key" ON "Cliente"("rfc");
