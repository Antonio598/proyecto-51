/**
 * Algoritmo de puntuación para conciliar un comprobante de pago contra los
 * cortes abiertos del cliente.
 *
 * Función pura y sin dependencias para poder probarla exhaustivamente:
 * es la lógica de la que depende que un pago se aplique a la póliza correcta.
 */

/** Tolerancia al comparar el importe del comprobante con el monto esperado. */
export const TOLERANCIA_MONTO = 0.02; // 2%

/** A partir de este puntaje se considera coincidencia fuerte. */
export const UMBRAL_COINCIDENCIA = 0.9;

/** Por debajo de este puntaje el candidato ni siquiera se propone. */
export const UMBRAL_DESCARTE = 0.3;

/** Ventana (en días) dentro de la cual la fecha del pago bonifica el puntaje. */
export const DIAS_CERCANIA = 15;

export interface CorteCandidato {
  id: string;
  polizaId: string;
  periodo: string;
  montoEsperado: number;
  fechaProximoPago: Date;
  folio: string | null;
  aseguradora: string;
}

export interface CandidatoConciliacion {
  corteId: string;
  polizaId: string;
  folio: string | null;
  aseguradora: string;
  periodo: string;
  montoEsperado: number;
  diferencia: number;
  puntaje: number;
}

/**
 * Puntúa cada corte abierto contra el importe leído del comprobante.
 * El importe manda; la cercanía de la fecha sólo desempata.
 *
 * @param monto importe leído del comprobante
 * @param fechaPago fecha del comprobante (opcional; si es inválida se ignora)
 */
export function puntuarCandidatos(
  cortes: CorteCandidato[],
  monto: number,
  fechaPago?: Date | null,
): CandidatoConciliacion[] {
  const fechaValida =
    fechaPago && !Number.isNaN(fechaPago.getTime()) ? fechaPago : null;

  return cortes
    .map((c) => {
      const diferencia = Math.abs(c.montoEsperado - monto);
      const desviacion = c.montoEsperado > 0 ? diferencia / c.montoEsperado : 1;

      // Importe dentro de tolerancia → 0.9; fuera, el puntaje decae con la desviación.
      let puntaje =
        desviacion <= TOLERANCIA_MONTO ? UMBRAL_COINCIDENCIA : Math.max(0, 0.9 - desviacion);

      // Bonificación si el pago cae cerca del vencimiento.
      if (fechaValida) {
        const dias = Math.abs(
          (fechaValida.getTime() - c.fechaProximoPago.getTime()) / 86_400_000,
        );
        if (dias <= DIAS_CERCANIA) puntaje += 0.1;
      }

      return {
        corteId: c.id,
        polizaId: c.polizaId,
        folio: c.folio,
        aseguradora: c.aseguradora,
        periodo: c.periodo,
        montoEsperado: c.montoEsperado,
        diferencia: Number(diferencia.toFixed(2)),
        puntaje: Number(Math.min(1, puntaje).toFixed(3)),
      };
    })
    .filter((c) => c.puntaje > UMBRAL_DESCARTE)
    .sort((a, b) => b.puntaje - a.puntaje);
}

/**
 * Devuelve el candidato único sólo cuando hay exactamente una coincidencia
 * fuerte. Con cero o con varias devuelve null: en ese caso un humano confirma,
 * nunca se adivina en silencio.
 */
export function matchUnico(
  candidatos: CandidatoConciliacion[],
): CandidatoConciliacion | null {
  const fuertes = candidatos.filter((c) => c.puntaje >= UMBRAL_COINCIDENCIA);
  return fuertes.length === 1 ? fuertes[0] : null;
}
