import { EstadoExpediente } from '@prisma/client';
import { puedeTransicionar, transicionesValidas } from './transiciones';

describe('máquina de estados del expediente', () => {
  it('sigue el camino feliz completo', () => {
    const camino: [EstadoExpediente, EstadoExpediente][] = [
      [EstadoExpediente.en_captura, EstadoExpediente.en_analisis_tecnico],
      [EstadoExpediente.en_analisis_tecnico, EstadoExpediente.en_revision_comercial],
      [EstadoExpediente.en_revision_comercial, EstadoExpediente.aprobado],
      [EstadoExpediente.aprobado, EstadoExpediente.enviado_a_cliente],
    ];
    for (const [desde, hacia] of camino) {
      expect(puedeTransicionar(desde, hacia)).toBe(true);
    }
  });

  it('no permite saltarse la revisión comercial', () => {
    expect(puedeTransicionar(EstadoExpediente.en_captura, EstadoExpediente.aprobado)).toBe(false);
    expect(
      puedeTransicionar(EstadoExpediente.en_analisis_tecnico, EstadoExpediente.aprobado),
    ).toBe(false);
  });

  it('permite devolver a Técnico para ajustes y volver a aprobar', () => {
    expect(
      puedeTransicionar(EstadoExpediente.en_revision_comercial, EstadoExpediente.ajustado),
    ).toBe(true);
    expect(
      puedeTransicionar(EstadoExpediente.ajustado, EstadoExpediente.en_analisis_tecnico),
    ).toBe(true);
    expect(puedeTransicionar(EstadoExpediente.ajustado, EstadoExpediente.aprobado)).toBe(true);
  });

  it('no permite enviar al cliente sin aprobación previa', () => {
    for (const estado of [
      EstadoExpediente.en_captura,
      EstadoExpediente.en_analisis_tecnico,
      EstadoExpediente.en_revision_comercial,
      EstadoExpediente.ajustado,
    ]) {
      expect(puedeTransicionar(estado, EstadoExpediente.enviado_a_cliente)).toBe(false);
    }
  });

  it('deja el expediente enviado como estado terminal', () => {
    expect(transicionesValidas(EstadoExpediente.enviado_a_cliente)).toHaveLength(0);
  });

  it('no permite retroceder desde aprobado a análisis técnico', () => {
    expect(
      puedeTransicionar(EstadoExpediente.aprobado, EstadoExpediente.en_analisis_tecnico),
    ).toBe(false);
  });

  it('define transiciones para todos los estados del enum', () => {
    for (const estado of Object.values(EstadoExpediente)) {
      expect(transicionesValidas(estado)).toBeDefined();
    }
  });
});
