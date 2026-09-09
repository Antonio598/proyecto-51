import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import * as ExcelJS from 'exceljs';
import {
  Coberturas,
  Deducibles,
  formatearMoneda,
  formatearPorcentaje,
  normalizarDeduciblePar,
} from '../expedientes/coberturas';
import { EsquemasPago } from '../expedientes/esquemas-pago';

const MARCA = 'FF0F3D63';
const LOGO = join(__dirname, '..', 'assets', 'arc-navy.png');

/** Color de encabezado por aseguradora (aproximado a su marca). */
function colorAseguradora(nombre: string): string {
  const n = nombre.toLowerCase();
  if (n.includes('qualitas') || n.includes('quálitas')) return 'FFE6007E';
  if (n.includes('gnp')) return 'FFF07800';
  if (n.includes('ana')) return 'FFCC0000';
  if (n.includes('axa')) return 'FF00008F';
  if (n.includes('afirme')) return 'FF00843D';
  return MARCA;
}

export interface OfertaComparativo {
  nombre: string;
  prima: number | null;
  primaActual: number | null;
  derechos: number | null;
  coberturas: Coberturas | null;
  deducibles: Deducibles | null;
  esquemas: EsquemasPago;
}

export interface UnidadComparativo {
  tipo: string;
  marca: string | null;
  modelo: string | null;
  anio: number | null;
  vin: string | null;
  valorAsegurado: number | null;
}

export interface DatosComparativo {
  cliente: string;
  folio: string;
  unidades: UnidadComparativo[];
  ofertas: OfertaComparativo[];
}

function celdaTitulo(ws: ExcelJS.Worksheet, cell: string, texto: string, argb: string) {
  const c = ws.getCell(cell);
  c.value = texto;
  c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
  c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
}

function money(ws: ExcelJS.Worksheet, cell: string, valor: number | null, negrita = false) {
  const c = ws.getCell(cell);
  if (valor === null || valor === undefined) {
    c.value = '—';
  } else {
    c.value = valor;
    c.numFmt = '"$"#,##0.00';
  }
  c.font = { bold: negrita };
  c.alignment = { horizontal: 'right' };
}

/** Construye el libro Excel del comparativo con el formato del despacho. */
export async function construirComparativoExcel(datos: DatosComparativo): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'CRM Seguros de Flotas';
  libro.created = new Date();

  let logoId: number | null = null;
  if (existsSync(LOGO)) {
    try {
      logoId = libro.addImage({ buffer: readFileSync(LOGO) as unknown as ExcelJS.Buffer, extension: 'png' });
    } catch {
      logoId = null;
    }
  }

  construirResumen(libro, datos, logoId);
  construirCoberturas(libro, datos);
  construirParque(libro, datos);

  const buffer = await libro.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// ── Hoja RESUMEN ──
function construirResumen(libro: ExcelJS.Workbook, datos: DatosComparativo, logoId: number | null) {
  const ws = libro.addWorksheet('RESUMEN');
  const { ofertas } = datos;
  // Columnas: A=Concepto, B=#UND, C=ACTUAL ANUALIZADA, D..=ofertas.
  ws.getColumn(1).width = 32;
  ws.getColumn(2).width = 8;
  ws.getColumn(3).width = 20;
  ofertas.forEach((_, i) => (ws.getColumn(4 + i).width = 20));

  if (logoId !== null) {
    ws.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 160, height: 50 } });
  }
  ws.mergeCells(1, 4, 1, Math.max(4, 3 + ofertas.length));
  const tit = ws.getCell(1, 4);
  tit.value = `Comparativo — ${datos.cliente}`;
  tit.font = { bold: true, size: 14, color: { argb: MARCA } };
  ws.getRow(1).height = 40;

  // Encabezados (fila 3).
  const fEnc = 3;
  celdaTitulo(ws, `A${fEnc}`, 'Tipo Unidad', MARCA);
  celdaTitulo(ws, `B${fEnc}`, '#UND', MARCA);
  celdaTitulo(ws, `C${fEnc}`, 'ACTUAL ANUALIZADA', MARCA);
  ofertas.forEach((o, i) => {
    const col = String.fromCharCode(68 + i); // D, E, F...
    celdaTitulo(ws, `${col}${fEnc}`, `OFERTA ${o.nombre.toUpperCase()}`, colorAseguradora(o.nombre));
  });
  ws.getRow(fEnc).height = 28;

  const actual = ofertas.map((o) => o.primaActual).find((v) => v != null) ?? null;
  const colDe = (i: number) => String.fromCharCode(68 + i);

  let r = fEnc + 1;
  // UNIDADES: #und, actual, prima neta por oferta.
  ws.getCell(`A${r}`).value = 'UNIDADES';
  ws.getCell(`A${r}`).font = { bold: true };
  ws.getCell(`B${r}`).value = datos.unidades.length;
  ws.getCell(`B${r}`).alignment = { horizontal: 'center' };
  money(ws, `C${r}`, actual, true);
  ofertas.forEach((o, i) => money(ws, `${colDe(i)}${r}`, o.prima, true));

  r += 1; // Total
  ws.getCell(`A${r}`).value = 'Total';
  ws.getCell(`A${r}`).font = { bold: true };
  money(ws, `C${r}`, actual, true);
  ofertas.forEach((o, i) => money(ws, `${colDe(i)}${r}`, o.esquemas.primaNeta, true));

  r += 1; // Derechos de póliza
  ws.getCell(`A${r}`).value = 'Derechos de Póliza';
  ofertas.forEach((o, i) => money(ws, `${colDe(i)}${r}`, o.esquemas.derechos));

  r += 1; // IVA
  ws.getCell(`A${r}`).value = 'IVA 16%';
  ofertas.forEach((o, i) => money(ws, `${colDe(i)}${r}`, o.esquemas.iva));

  r += 1; // Prima Total Contado
  ws.getCell(`A${r}`).value = 'Prima Total Contado';
  ws.getCell(`A${r}`).font = { bold: true };
  ofertas.forEach((o, i) => money(ws, `${colDe(i)}${r}`, o.esquemas.totalContado, true));

  // Bloques de esquemas de pago.
  const bloque = (
    titulo1: string,
    titulo2: string,
    tituloTotal: string,
    sel: (e: EsquemasPago) => { primerPago: number; subsecuente: number; total: number },
  ) => {
    r += 2;
    ws.getCell(`A${r}`).value = titulo1;
    ofertas.forEach((o, i) => money(ws, `${colDe(i)}${r}`, sel(o.esquemas).primerPago));
    r += 1;
    ws.getCell(`A${r}`).value = titulo2;
    ofertas.forEach((o, i) => money(ws, `${colDe(i)}${r}`, sel(o.esquemas).subsecuente));
    r += 1;
    ws.getCell(`A${r}`).value = tituloTotal;
    ws.getCell(`A${r}`).font = { bold: true };
    ofertas.forEach((o, i) => money(ws, `${colDe(i)}${r}`, sel(o.esquemas).total, true));
  };

  bloque('1er. Pago Semestral', '1 Rec. Subsecuente Semestral', 'Prima Total Semestral', (e) => e.semestral);
  bloque('1er. Pago Trimestral', '3 Rec. Subsecuentes Trimestrales', 'Prima Total Trimestral', (e) => e.trimestral);
  bloque('1er. Pago Mensual', '11 Rec. Subsecuentes Mensuales', 'Prima Total Mensual', (e) => e.mensual);
}

// ── Hoja COBERTURAS ──
function construirCoberturas(libro: ExcelJS.Workbook, datos: DatosComparativo) {
  const ws = libro.addWorksheet('COBERTURAS');
  const { ofertas } = datos;
  ws.getColumn(1).width = 34;
  ofertas.forEach((_, i) => {
    ws.getColumn(2 + i * 2).width = 16;
    ws.getColumn(3 + i * 2).width = 16;
  });

  // Encabezado: COBERTURAS + por aseguradora dos columnas (Camión / Remolque).
  celdaTitulo(ws, 'A1', 'COBERTURAS', MARCA);
  ws.mergeCells(1, 1, 2, 1);
  ofertas.forEach((o, i) => {
    const c1 = 2 + i * 2;
    ws.mergeCells(1, c1, 1, c1 + 1);
    const cab = ws.getCell(1, c1);
    cab.value = o.nombre.toUpperCase();
    cab.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cab.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colorAseguradora(o.nombre) } };
    cab.alignment = { horizontal: 'center', vertical: 'middle' };
    const sub1 = ws.getCell(2, c1);
    sub1.value = 'Camión-Tracto';
    const sub2 = ws.getCell(2, c1 + 1);
    sub2.value = 'Remolque';
    [sub1, sub2].forEach((s) => {
      s.font = { bold: true, size: 9 };
      s.alignment = { horizontal: 'center' };
    });
  });

  const par = (o: OfertaComparativo, campo: 'danosMateriales' | 'roboTotal' | 'reduccionAsistencia') =>
    normalizarDeduciblePar((o.deducibles as Deducibles | null)?.[campo]);
  const cov = (o: OfertaComparativo, campo: keyof Coberturas) => (o.coberturas as Coberturas | null)?.[campo];

  let r = 3;
  const filaPar = (
    etiqueta: string,
    campo: 'danosMateriales' | 'roboTotal' | 'reduccionAsistencia',
  ) => {
    ws.getCell(`A${r}`).value = etiqueta;
    ws.getCell(`A${r}`).font = { bold: true };
    ofertas.forEach((o, i) => {
      const p = par(o, campo);
      ws.getCell(r, 2 + i * 2).value = formatearPorcentaje(p.camion);
      ws.getCell(r, 3 + i * 2).value = formatearPorcentaje(p.remolque);
    });
    r += 1;
  };
  const filaValor = (etiqueta: string, texto: (o: OfertaComparativo) => string) => {
    ws.getCell(`A${r}`).value = etiqueta;
    ws.getCell(`A${r}`).font = { bold: true };
    ofertas.forEach((o, i) => {
      ws.mergeCells(r, 2 + i * 2, r, 3 + i * 2);
      const c = ws.getCell(r, 2 + i * 2);
      c.value = texto(o);
      c.alignment = { horizontal: 'center' };
    });
    r += 1;
  };

  filaPar('Daños materiales', 'danosMateriales');
  filaPar('Robo total', 'roboTotal');
  filaPar('Reducción de deducible por asistencia', 'reduccionAsistencia');
  filaValor('Responsabilidad Civil', (o) => formatearMoneda(cov(o, 'responsabilidadCivil') as number | null));
  filaValor('Gastos Médicos', (o) => formatearMoneda(cov(o, 'gastosMedicosOcupantes') as number | null));
  filaValor('RC carga transportada', (o) => formatearMoneda(cov(o, 'responsabilidadCivilCarga') as number | null));
  filaValor('Accidentes al conductor', (o) => formatearMoneda(cov(o, 'accidentesConductor') as number | null));
  filaValor('Asistencia Vial Plus', (o) => (cov(o, 'asistenciaVial') ? 'AMPARADA' : 'No incluida'));
  filaValor('Daños por la carga', (o) => (cov(o, 'danosCarga') ? 'AMPARADA' : 'No incluida'));
  filaValor('RC Cruzada', (o) => (cov(o, 'rcCruzada') ? 'AMPARADA' : 'No incluida'));
  filaValor('Asistencia Legal', (o) => (cov(o, 'asistenciaLegal') ? 'AMPARADA' : 'No incluida'));
}

// ── Hoja PARQUE ──
function construirParque(libro: ExcelJS.Workbook, datos: DatosComparativo) {
  const ws = libro.addWorksheet('PARQUE');
  const enc = ['Tipo', 'Marca / Modelo', 'Año', 'No. de serie (VIN)', 'Valor asegurado'];
  const fila = ws.getRow(1);
  fila.values = enc;
  fila.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MARCA } };
  });
  datos.unidades.forEach((u, i) => {
    const row = ws.getRow(2 + i);
    row.values = [
      u.tipo,
      [u.marca, u.modelo].filter(Boolean).join(' ') || '—',
      u.anio ?? '—',
      u.vin ?? '—',
      u.valorAsegurado ?? null,
    ];
    const val = row.getCell(5);
    if (typeof val.value === 'number') val.numFmt = '"$"#,##0.00';
  });
  ws.getColumn(1).width = 14;
  ws.getColumn(2).width = 28;
  ws.getColumn(3).width = 8;
  ws.getColumn(4).width = 24;
  ws.getColumn(5).width = 18;
}
