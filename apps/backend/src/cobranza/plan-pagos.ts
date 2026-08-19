import { Periodicidad } from '@prisma/client';

/**
 * Motor de parcialidades (función pura, sin dependencias de Nest/Prisma).
 *
 * A partir de los importes capturados a mano y la periodicidad, calcula el
 * calendario de pagos:
 *  - El PRIMER pago carga la prima neta proporcional + financiamiento +
 *    gastos de expedición + IVA (sobre su suma gravable).
 *  - Los pagos SUBSECUENTES cargan solo la prima neta proporcional + IVA.
 *  - "De contado" es una sola parcialidad = prima total.
 *
 * La suma de las parcialidades se reconcilia con `primaTotal`: el redondeo
 * sobrante se ajusta en la última parcialidad.
 */

export interface EntradaPlan {
  primaNeta: number;
  financiamiento: number;
  gastosExpedicion: number;
  iva: number; // IVA total capturado (para derivar la tasa y reconciliar)
  primaTotal: number;
  periodicidad: Periodicidad;
  fechaEmision: Date;
}

export interface Parcialidad {
  numeroParcialidad: number;
  periodo: string; // "YYYY-MM"
  fechaVencimiento: Date;
  montoEsperado: number;
  esPrimerPago: boolean;
}

/** Número de pagos al año según la periodicidad. */
export function numeroPagosDe(p: Periodicidad): number {
  switch (p) {
    case Periodicidad.de_contado:
      return 1;
    case Periodicidad.mensual:
      return 12;
    case Periodicidad.bimestral:
      return 6;
    case Periodicidad.trimestral:
      return 4;
    default:
      return 12;
  }
}

/** Meses entre una parcialidad y la siguiente. */
export function mesesEntrePagos(p: Periodicidad): number {
  switch (p) {
    case Periodicidad.de_contado:
      return 0;
    case Periodicidad.mensual:
      return 1;
    case Periodicidad.bimestral:
      return 2;
    case Periodicidad.trimestral:
      return 3;
    default:
      return 1;
  }
}

const round2 = (x: number): number => Math.round((x + Number.EPSILON) * 100) / 100;

/** Suma meses a una fecha, recortando el día al último del mes destino. */
export function sumarMeses(fecha: Date, meses: number): Date {
  const r = new Date(fecha);
  const diaOriginal = r.getDate();
  r.setDate(1);
  r.setMonth(r.getMonth() + meses);
  const ultimoDia = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(diaOriginal, ultimoDia));
  return r;
}

/** Suma días naturales. */
export function sumarDiasNaturales(fecha: Date, dias: number): Date {
  const r = new Date(fecha);
  r.setDate(r.getDate() + dias);
  return r;
}

function periodoDe(fecha: Date): string {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
}

/** Días entre la emisión y el primer pago. */
export const DIAS_A_PRIMER_PAGO = 10;

/**
 * Genera el calendario completo de parcialidades. Devuelve [] si no hay datos
 * suficientes (sin primaTotal).
 */
export function generarCalendario(entrada: EntradaPlan): Parcialidad[] {
  const n = numeroPagosDe(entrada.periodicidad);
  const primaTotal = entrada.primaTotal || 0;
  if (primaTotal <= 0 || n <= 0) return [];

  const primeraFecha = sumarDiasNaturales(entrada.fechaEmision, DIAS_A_PRIMER_PAGO);
  const pasoMeses = mesesEntrePagos(entrada.periodicidad);

  const fechaDe = (k: number): Date => sumarMeses(primeraFecha, (k - 1) * pasoMeses);
  const armar = (montos: number[]): Parcialidad[] => {
    // Ajuste de redondeo en la última parcialidad para cuadrar con primaTotal.
    const suma = round2(montos.reduce((s, m) => s + m, 0));
    const ajuste = round2(primaTotal - suma);
    if (montos.length > 0) montos[montos.length - 1] = round2(montos[montos.length - 1] + ajuste);
    return montos.map((monto, i) => {
      const fecha = fechaDe(i + 1);
      return {
        numeroParcialidad: i + 1,
        periodo: periodoDe(fecha),
        fechaVencimiento: fecha,
        montoEsperado: monto,
        esPrimerPago: i === 0,
      };
    });
  };

  // De contado: una sola parcialidad = total.
  if (n === 1) {
    return armar([primaTotal]);
  }

  const primaNeta = entrada.primaNeta || 0;

  // Modo degradado: si no se capturó la prima neta, se reparte el total en
  // parcialidades iguales (comportamiento anterior primaTotal / numeroPagos).
  if (primaNeta <= 0) {
    const base = round2(primaTotal / n);
    return armar(Array.from({ length: n }, () => base));
  }

  const financiamiento = entrada.financiamiento || 0;
  const gastosExpedicion = entrada.gastosExpedicion || 0;
  const gravableAnual = primaNeta + financiamiento + gastosExpedicion;
  // Tasa de IVA derivada de lo capturado; si no hay, 16% (estándar nacional).
  const tasaIva = entrada.iva > 0 && gravableAnual > 0 ? entrada.iva / gravableAnual : 0.16;

  const primaProporcional = primaNeta / n;
  const montos: number[] = [];
  for (let k = 1; k <= n; k++) {
    const extras = k === 1 ? financiamiento + gastosExpedicion : 0;
    const gravable = primaProporcional + extras;
    montos.push(round2(gravable * (1 + tasaIva)));
  }
  return armar(montos);
}
