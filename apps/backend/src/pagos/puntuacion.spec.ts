import {
  CorteCandidato,
  matchUnico,
  puntuarCandidatos,
  UMBRAL_COINCIDENCIA,
} from './puntuacion';

/** Corte de referencia: $8,000 con vencimiento el 15 de julio de 2026. */
function corte(over: Partial<CorteCandidato> = {}): CorteCandidato {
  return {
    id: 'corte-1',
    polizaId: 'poliza-1',
    periodo: '2026-07',
    montoEsperado: 8000,
    fechaProximoPago: new Date('2026-07-15'),
    folio: 'AXA-001',
    aseguradora: 'AXA',
    ...over,
  };
}

describe('puntuarCandidatos', () => {
  it('da coincidencia fuerte cuando el importe es exacto', () => {
    const [c] = puntuarCandidatos([corte()], 8000);
    expect(c.puntaje).toBeGreaterThanOrEqual(UMBRAL_COINCIDENCIA);
    expect(c.diferencia).toBe(0);
  });

  it('acepta diferencias dentro de la tolerancia del 2%', () => {
    // 7,850 está 1.875% por debajo de 8,000 → dentro de tolerancia.
    const [c] = puntuarCandidatos([corte()], 7850);
    expect(c.puntaje).toBeGreaterThanOrEqual(UMBRAL_COINCIDENCIA);
  });

  it('penaliza importes fuera de la tolerancia', () => {
    // 7,000 está 12.5% por debajo → deja de ser coincidencia fuerte.
    const [c] = puntuarCandidatos([corte()], 7000);
    expect(c.puntaje).toBeLessThan(UMBRAL_COINCIDENCIA);
  });

  it('descarta candidatos con importes muy alejados', () => {
    // Un importe del doble no debe proponerse siquiera.
    expect(puntuarCandidatos([corte()], 16000)).toHaveLength(0);
  });

  it('bonifica cuando la fecha del pago cae cerca del vencimiento', () => {
    const cercano = puntuarCandidatos([corte()], 7000, new Date('2026-07-14'))[0];
    const lejano = puntuarCandidatos([corte()], 7000, new Date('2026-01-01'))[0];
    expect(cercano.puntaje).toBeGreaterThan(lejano.puntaje);
  });

  it('ignora una fecha inválida en vez de romper', () => {
    const [c] = puntuarCandidatos([corte()], 8000, new Date('no-es-fecha'));
    expect(c.puntaje).toBeGreaterThanOrEqual(UMBRAL_COINCIDENCIA);
  });

  it('ordena los candidatos de mayor a menor puntaje', () => {
    const candidatos = puntuarCandidatos(
      [
        corte({ id: 'lejano', montoEsperado: 7000 }),
        corte({ id: 'exacto', montoEsperado: 8000 }),
      ],
      8000,
    );
    expect(candidatos[0].corteId).toBe('exacto');
  });

  it('no divide entre cero cuando el monto esperado es 0', () => {
    const candidatos = puntuarCandidatos([corte({ montoEsperado: 0 })], 8000);
    expect(candidatos.every((c) => Number.isFinite(c.puntaje))).toBe(true);
  });
});

describe('matchUnico', () => {
  it('devuelve el candidato cuando hay exactamente una coincidencia fuerte', () => {
    const candidatos = puntuarCandidatos(
      [corte({ id: 'a' }), corte({ id: 'b', montoEsperado: 5000 })],
      8000,
    );
    expect(matchUnico(candidatos)?.corteId).toBe('a');
  });

  it('devuelve null si dos cortes coinciden — debe confirmarlo un humano', () => {
    // Dos pólizas del mismo cliente con el mismo importe mensual: caso ambiguo real.
    const candidatos = puntuarCandidatos(
      [corte({ id: 'a', polizaId: 'p1' }), corte({ id: 'b', polizaId: 'p2' })],
      8000,
    );
    expect(candidatos).toHaveLength(2);
    expect(matchUnico(candidatos)).toBeNull();
  });

  it('devuelve null cuando ninguno alcanza el umbral', () => {
    expect(matchUnico(puntuarCandidatos([corte()], 7000))).toBeNull();
  });
});
