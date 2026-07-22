#!/bin/sh
# Arranca backend y frontend en el mismo contenedor.
# Si cualquiera de los dos muere, termina el contenedor entero para que
# EasyPanel lo reinicie — es preferible a quedarse a medias sin avisar.
set -e

echo "▶ Aplicando migraciones de Prisma…"
npx prisma migrate deploy --schema prisma/schema.prisma

echo "▶ Iniciando backend en el puerto ${BACKEND_PORT:-3001}…"
node dist/main.js &
BACKEND_PID=$!

# Espera a que el backend responda antes de levantar el frontend, para que
# las primeras peticiones del panel no fallen con 502.
echo "▶ Esperando al backend…"
i=0
while [ $i -lt 30 ]; do
  if node -e "fetch('http://127.0.0.1:${BACKEND_PORT:-3001}/api/health').then(()=>process.exit(0)).catch(()=>process.exit(1))" 2>/dev/null; then
    echo "✓ Backend listo."
    break
  fi
  i=$((i + 1))
  sleep 2
done

echo "▶ Iniciando panel en el puerto ${PORT:-3000}…"
cd /app/web
HOSTNAME=0.0.0.0 node apps/frontend/server.js &
FRONTEND_PID=$!
cd /app

terminar() {
  echo "▶ Deteniendo…"
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
  exit 0
}
trap terminar TERM INT

# Vigila ambos procesos.
while kill -0 "$BACKEND_PID" 2>/dev/null && kill -0 "$FRONTEND_PID" 2>/dev/null; do
  sleep 5
done

echo "✗ Un proceso terminó de forma inesperada; cerrando el contenedor."
kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
exit 1
