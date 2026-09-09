/**
 * Cálculo de los esquemas de pago del comparativo (contado / semestral /
 * trimestral / mensual) a partir de la prima neta y los derechos de póliza de
 * cada oferta. Misma lógica que el motor de parcialidades:
 *  - IVA sobre (prima + derechos), tasa estándar 16%.
 *  - El primer pago carga los derechos completos; los subsecuentes solo prima
 *    proporcional. La suma de cada esquema iguala la Prima Total de Contado.
 */

const round2 = (x: number): number => Math.round((x + Number.EPSILON) * 100) / 100;

export interface EsquemaPago {
  n: number;
  primerPago: number;
  subsecuente: number; // 0 cuando es de contado
  total: number;
}

export interface EsquemasPago {
  primaNeta: number;
  derechos: number;
  iva: number;
  totalContado: number;
  contado: EsquemaPago;
  semestral: EsquemaPago;
  trimestral: EsquemaPago;
  mensual: EsquemaPago;
}

export function calcularEsquemas(
  prima: number | null | undefined,
  derechos: number | null | undefined,
  tasaIva = 0.16,
): EsquemasPago {
  const primaNeta = prima ?? 0;
  const der = derechos ?? 0;
  const iva = round2((primaNeta + der) * tasaIva);
  const totalContado = round2(primaNeta + der + iva);

  const calc = (n: number): EsquemaPago => {
    const proporcional = primaNeta / n;
    const primerPago = round2((proporcional + der) * (1 + tasaIva));
    const subsecuente = n > 1 ? round2(proporcional * (1 + tasaIva)) : 0;
    const total = round2(primerPago + subsecuente * (n - 1));
    return { n, primerPago, subsecuente, total };
  };

  return {
    primaNeta,
    derechos: der,
    iva,
    totalContado,
    contado: calc(1),
    semestral: calc(2),
    trimestral: calc(4),
    mensual: calc(12),
  };
}
