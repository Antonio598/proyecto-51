import { DIAS_ENTRE_CORTES, sumarDias } from './polizas.service';

describe('cálculo de cortes de cobranza', () => {
  it('el corte es a 30 días naturales, no un mes calendario', () => {
    expect(DIAS_ENTRE_CORTES).toBe(30);
    // Febrero: 30 días naturales desde el 1 caen en marzo, no el 1 de marzo.
    const corte = new Date('2026-02-01T00:00:00');
    expect(sumarDias(corte, DIAS_ENTRE_CORTES).toISOString().slice(0, 10)).toBe('2026-03-03');
  });

  it('cruza correctamente el fin de año', () => {
    const corte = new Date('2026-12-15T00:00:00');
    expect(sumarDias(corte, DIAS_ENTRE_CORTES).toISOString().slice(0, 10)).toBe('2027-01-14');
  });

  it('maneja años bisiestos', () => {
    // 2028 es bisiesto: febrero tiene 29 días.
    const corte = new Date('2028-02-01T00:00:00');
    expect(sumarDias(corte, DIAS_ENTRE_CORTES).toISOString().slice(0, 10)).toBe('2028-03-02');
  });

  it('no muta la fecha original', () => {
    const original = new Date('2026-07-15T00:00:00');
    const copia = new Date(original);
    sumarDias(original, 30);
    expect(original.getTime()).toBe(copia.getTime());
  });

  it('encadena cortes sucesivos cada 30 días', () => {
    let fecha = new Date('2026-01-01T00:00:00');
    const fechas: string[] = [];
    for (let i = 0; i < 3; i++) {
      fecha = sumarDias(fecha, DIAS_ENTRE_CORTES);
      fechas.push(fecha.toISOString().slice(0, 10));
    }
    expect(fechas).toEqual(['2026-01-31', '2026-03-02', '2026-04-01']);
  });
});
