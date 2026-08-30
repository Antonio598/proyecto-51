import { Injectable } from '@nestjs/common';
import { EstadoCobranza, EstadoPoliza } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const MESES = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
];

/** Suma exactamente 1 año a una fecha (vigencia estándar de las pólizas). */
function unAnioDespues(fecha: Date): Date {
  const f = new Date(fecha);
  f.setFullYear(f.getFullYear() + 1);
  return f;
}

/**
 * Métricas del negocio. Regla central: toda póliza vive 1 año desde su emisión;
 * si ya venció (y no se renovó) su prima neta deja de contar. La "prima neta
 * total" es la suma de las pólizas activas (equivale a la suma de las Pólizas
 * Madre, pero excluyendo las vencidas).
 */
@Injectable()
export class MetricasService {
  constructor(private readonly prisma: PrismaService) {}

  async resumen() {
    const hoy = new Date();
    const anio = hoy.getFullYear();

    // Sólo pólizas emitidas y no canceladas; el filtro de vigencia se aplica abajo
    // (la fecha fin puede estar null → se deriva como inicio + 1 año).
    const hijas = await this.prisma.poliza.findMany({
      where: { estado: EstadoPoliza.emitida, canceladaEn: null },
      select: { primaNeta: true, prima: true, vigenciaInicio: true, vigenciaFin: true },
    });

    // La prima neta por hija; si no hay desglose capturado, cae a la prima total.
    const montoDe = (h: { primaNeta: unknown; prima: unknown }) =>
      Number(h.primaNeta ?? h.prima ?? 0);

    // Vigencia (real o derivada) de cada hija.
    const finDe = (h: { vigenciaFin: Date | null; vigenciaInicio: Date | null }) =>
      h.vigenciaFin ?? (h.vigenciaInicio ? unAnioDespues(h.vigenciaInicio) : null);

    // Una póliza cuenta si su vigencia no ha pasado; "no vigente" = ya venció por
    // tiempo (1 año cumplido sin renovar).
    const activas = hijas.filter((h) => {
      const fin = finDe(h);
      return fin ? fin >= hoy : true;
    });
    const noVigentes = hijas.filter((h) => {
      const fin = finDe(h);
      return fin ? fin < hoy : false;
    });

    const primaNetaTotal = activas.reduce((s, h) => s + montoDe(h), 0);
    const primaNetaNoVigente = noVigentes.reduce((s, h) => s + montoDe(h), 0);

    // Vencidas por falta de pago: parcialidades abiertas (no pagadas) cuya fecha
    // límite ya pasó. Se cuentan las pólizas afectadas y el monto adeudado.
    const cortesVencidos = await this.prisma.corteMadre.findMany({
      where: { estado: { not: EstadoCobranza.pagado }, fechaVencimiento: { lt: hoy } },
      select: { montoEsperado: true, polizaMadreId: true },
    });
    const madresVencidas = new Set(cortesVencidos.map((c) => c.polizaMadreId));
    const montoVencido = cortesVencidos.reduce(
      (s, c) => s + (c.montoEsperado ? Number(c.montoEsperado) : 0),
      0,
    );
    const polizasVencidasPorPago = madresVencidas.size
      ? await this.prisma.poliza.count({
          where: {
            polizaMadreId: { in: [...madresVencidas] },
            estado: EstadoPoliza.emitida,
            canceladaEn: null,
          },
        })
      : 0;

    // Curva de crecimiento: prima neta activa acumulada mes a mes del año en curso.
    // Las pólizas de años anteriores (aún vigentes) cuentan desde enero; las de este
    // año cuentan desde el mes de su emisión.
    const porMes = MESES.map((mes, m) => {
      const finMes = new Date(anio, m + 1, 0, 23, 59, 59);
      let acumulado = 0;
      for (const h of activas) {
        const ini = h.vigenciaInicio;
        if (!ini || ini.getFullYear() < anio) {
          acumulado += montoDe(h);
        } else if (ini.getFullYear() === anio && ini <= finMes) {
          acumulado += montoDe(h);
        }
      }
      return { mes, acumulado };
    });

    return {
      primaNetaTotal,
      polizasActivas: activas.length,
      anio,
      porMes,
      // Pólizas que ya cumplieron su año de vigencia sin renovarse.
      noVigentes: { cantidad: noVigentes.length, primaNeta: primaNetaNoVigente },
      // Pólizas con cobranza vencida (parcialidad no pagada y fuera de fecha).
      vencidasPorPago: {
        cantidad: polizasVencidasPorPago,
        madres: madresVencidas.size,
        monto: montoVencido,
      },
    };
  }
}
