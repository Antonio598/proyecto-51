# Workflows de n8n

n8n **sólo orquesta**: dispara el cron y llama a la API. Toda la lógica de negocio
(cálculo de cortes, estados de cobranza, textos de los recordatorios) vive en el backend,
para que se pueda probar y auditar en un solo lugar.

## Importar

1. En n8n: **Workflows → Import from File** → selecciona `cobranza-recurrente.json`.
2. Define estas variables de entorno en n8n (Settings → Variables, o en el `.env` del contenedor):

   | Variable | Valor |
   |---|---|
   | `CRM_API_URL` | URL del backend, ej. `http://backend:3001` si comparten red Docker |
   | `N8N_SERVICE_TOKEN` | El mismo valor que `N8N_SERVICE_TOKEN` del backend |

3. Activa el workflow.

## Qué hace `cobranza-recurrente`

Corre **todos los días a las 9:00** (zona horaria `America/Mexico_City`):

1. `POST /api/cobranza/asegurar-cortes` — red de seguridad: crea el corte inicial de
   cualquier póliza emitida que se haya quedado sin uno.
2. `POST /api/cobranza/procesar` — recalcula el estado de cada corte
   (`vigente` → `por_vencer` a 5 días → `vencido`) y envía **un recordatorio por cliente**
   por WhatsApp (no uno por unidad, para no saturarlo).
3. Si hubo vencidos, dispara una alerta interna. **Sustituye el nodo `Alerta al despacho`**
   por tu canal real (correo, Slack o el WhatsApp interno del despacho).

## Autenticación

Estos endpoints no usan JWT de usuario: se autentican con el header
`x-service-token`. Si el token no coincide con `N8N_SERVICE_TOKEN` del backend,
la llamada se rechaza con 401.

## Ejecutar a mano para probar

```bash
curl -X POST http://localhost:3001/api/cobranza/procesar \
  -H "x-service-token: TU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"enviarRecordatorios": false}'
```

Con `enviarRecordatorios: false` recalcula los estados **sin** mandar WhatsApp —
útil para probar sin molestar a clientes reales.
