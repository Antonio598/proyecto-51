#!/bin/sh
# Arranca backend y frontend en el mismo contenedor.
#
# Importante: NO usamos `set -e`. Si algo falla queremos explicar qué pasó
# en los logs; con `set -e` el contenedor moría en silencio y sólo se veía
# un reinicio en bucle sin causa aparente.

BACKEND_PORT="${BACKEND_PORT:-3001}"
PORT="${PORT:-3000}"

echo "═══════════════════════════════════════════════════════"
echo " CRM Seguros de Flotas — iniciando"
echo "═══════════════════════════════════════════════════════"

# ── 1. Variables mínimas ────────────────────────────────────────────────
if [ -z "$DATABASE_URL" ]; then
  echo "✗ ERROR: falta la variable DATABASE_URL."
  echo "  Es la cadena de conexión de Supabase (pooler, puerto 6543)."
  echo "  Defínela en las variables de entorno del servicio y vuelve a desplegar."
  exit 1
fi

if [ -z "$JWT_SECRET" ]; then
  echo "✗ ERROR: falta la variable JWT_SECRET (secreto para firmar sesiones)."
  exit 1
fi

# ── 2. Migraciones ──────────────────────────────────────────────────────
echo "▶ Aplicando migraciones de Prisma…"
if ! npx prisma migrate deploy --schema prisma/schema.prisma; then
  echo ""
  echo "✗ ERROR: fallaron las migraciones. Causas habituales:"
  echo "  · DATABASE_URL incorrecta, o le falta ?pgbouncer=true"
  echo "  · Aplicaste supabase-setup.sql a mano sin correr después:"
  echo "        npm run prisma:resolve"
  echo "  · La base no acepta conexiones desde este servidor."
  exit 1
fi
echo "✓ Migraciones al día."

# ── 3. Backend ──────────────────────────────────────────────────────────
echo "▶ Iniciando backend (puerto interno ${BACKEND_PORT})…"
node dist/main.js &
BACKEND_PID=$!

echo "▶ Esperando a que el backend responda…"
LISTO=0
i=0
while [ $i -lt 40 ]; do
  # Si el proceso ya murió, no tiene sentido seguir esperando.
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    echo ""
    echo "✗ ERROR: el backend terminó durante el arranque."
    echo "  Revisa los mensajes de arriba: suelen indicar qué variable falta"
    echo "  o qué conexión falló."
    exit 1
  fi
  if node -e "fetch('http://127.0.0.1:${BACKEND_PORT}/api/health').then(()=>process.exit(0)).catch(()=>process.exit(1))" 2>/dev/null; then
    LISTO=1
    break
  fi
  i=$((i + 1))
  sleep 2
done

if [ "$LISTO" -ne 1 ]; then
  echo "✗ ERROR: el backend no respondió tras 80 segundos."
  kill "$BACKEND_PID" 2>/dev/null
  exit 1
fi
echo "✓ Backend listo."

# ── 4. Panel ────────────────────────────────────────────────────────────
echo "▶ Iniciando panel (puerto ${PORT})…"
cd /app/web || exit 1
HOSTNAME=0.0.0.0 PORT="$PORT" node apps/frontend/server.js &
FRONTEND_PID=$!
cd /app || exit 1

echo "═══════════════════════════════════════════════════════"
echo " ✓ Sistema arriba. Panel en el puerto ${PORT}."
echo "═══════════════════════════════════════════════════════"

terminar() {
  echo "▶ Deteniendo…"
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null
  exit 0
}
trap terminar TERM INT

# ── 5. Vigilancia ───────────────────────────────────────────────────────
# Si cualquiera de los dos muere, cerramos el contenedor para que el
# orquestador lo reinicie: es preferible a quedarse a medias sin avisar.
while kill -0 "$BACKEND_PID" 2>/dev/null && kill -0 "$FRONTEND_PID" 2>/dev/null; do
  sleep 5
done

if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
  echo "✗ El backend se detuvo de forma inesperada."
else
  echo "✗ El panel se detuvo de forma inesperada."
fi

kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null
exit 1
