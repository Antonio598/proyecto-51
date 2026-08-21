import { Periodicidad } from '@prisma/client';
import { EntradaPlan, generarCalendario, numeroPagosDe } from './plan-pagos';

/** Recibo de referencia: prima neta 10,000 + financiamiento 500 + expedición 400 + IVA 16%. */
function entrada(over: Partial<EntradaPlan> = {}): EntradaPlan {
  return {
    primaNeta: 10000,
    financiamiento: 500,
    gastosExpedicion: 400,
    iva: 1744, // 16% de (10000 + 500 + 400)
    primaTotal: 12644,
    periodicidad: Periodicidad.mensual,
    fechaEmision: new Date('2026-08-17T00:00:00'),
    ...over,
  };
}

const suma = (montos: number[]) => Number(montos.reduce((s, m) => s + m, 0).toFixed(2));

describe('generarCalendario', () => {
  it('deriva el número de parcialidades de la periodicidad', () => {
    expect(numeroPagosDe(Periodicidad.de_contado)).toBe(1);
    expect(numeroPagosDe(Periodicidad.mensual)).toBe(12);
    expect(numeroPagosDe(Periodicidad.bimestral)).toBe(6);
    expect(numeroPagosDe(Periodicidad.trimestral)).toBe(4);
  });

  it('reconcilia la suma de parcialidades con la prima total en toda periodicidad', () => {
    for (const periodicidad of [
      Periodicidad.de_contado,
      Periodicidad.mensual,
      Periodicidad.bimestral,
      Periodicidad.trimestral,
    ]) {
      const cal = generarCalendario(entrada({ periodicidad }));
      expect(cal).toHaveLength(numeroPagosDe(periodicidad));
      expect(suma(cal.map((p) => p.montoEsperado))).toBe(12644);
    }
  });

  it('carga financiamiento y expedición solo en el primer pago', () => {
    const cal = generarCalendario(entrada({ periodicidad: Periodicidad.mensual }));
    // Subsecuente = (10000/12) * 1.16
    const subsecuente = Number(((10000 / 12) * 1.16).toFixed(2));
    expect(cal[0].esPrimerPago).toBe(true);
    expect(cal[1].montoEsperado).toBe(subsecuente);
    // La diferencia del primero es exactamente (500 + 400) * 1.16.
    expect(Number((cal[0].montoEsperado - subsecuente).toFixed(2))).toBe(
      Number((900 * 1.16).toFixed(2)),
    );
  });

  it('agenda el primer pago 10 días después de la emisión y respeta la periodicidad', () => {
    const cal = generarCalendario(entrada({ periodicidad: Periodicidad.trimestral }));
    expect(cal[0].fechaVencimiento.toISOString().slice(0, 10)).toBe('2026-08-27');
    expect(cal[1].fechaVencimiento.toISOString().slice(0, 10)).toBe('2026-11-25'); // +90 días
  });

  it('en mensual cada parcialidad vence 30 días después de la anterior', () => {
    const cal = generarCalendario(entrada({ periodicidad: Periodicidad.mensual }));
    expect(cal[0].fechaVencimiento.toISOString().slice(0, 10)).toBe('2026-08-27');
    expect(cal[1].fechaVencimiento.toISOString().slice(0, 10)).toBe('2026-09-26'); // +30 días
  });

  it('de contado es una sola parcialidad igual al total', () => {
    const cal = generarCalendario(entrada({ periodicidad: Periodicidad.de_contado }));
    expect(cal).toHaveLength(1);
    expect(cal[0].montoEsperado).toBe(12644);
  });

  it('sin prima total no genera calendario', () => {
    expect(generarCalendario(entrada({ primaTotal: 0 }))).toHaveLength(0);
  });

  it('reparte en partes iguales si no se capturó prima neta (modo degradado)', () => {
    const cal = generarCalendario(
      entrada({ primaNeta: 0, financiamiento: 0, gastosExpedicion: 0, iva: 0, periodicidad: Periodicidad.mensual }),
    );
    expect(cal).toHaveLength(12);
    expect(suma(cal.map((p) => p.montoEsperado))).toBe(12644);
  });
});
