import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';

export interface HojaExcel {
  nombre: string;
  titulo?: string;
  encabezados: string[];
  filas: (string | number | null)[][];
  /** Columnas (índice 0-based) que deben formatearse como moneda MXN. */
  columnasMoneda?: number[];
}

const MARCA = 'FF0F3D63';

/** Generación de los Excel de salida (comparativos, desgloses de costos). */
@Injectable()
export class ExcelService {
  async generar(hojas: HojaExcel[]): Promise<Buffer> {
    const libro = new ExcelJS.Workbook();
    libro.creator = 'CRM Seguros de Flotas';
    libro.created = new Date();

    for (const hoja of hojas) {
      this.construirHoja(libro, hoja);
    }

    const buffer = await libro.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private construirHoja(libro: ExcelJS.Workbook, hoja: HojaExcel) {
    const ws = libro.addWorksheet(hoja.nombre.slice(0, 31));
    let filaActual = 1;

    if (hoja.titulo) {
      ws.mergeCells(1, 1, 1, Math.max(hoja.encabezados.length, 1));
      const celda = ws.getCell(1, 1);
      celda.value = hoja.titulo;
      celda.font = { bold: true, size: 14, color: { argb: MARCA } };
      celda.alignment = { vertical: 'middle' };
      ws.getRow(1).height = 24;
      filaActual = 3;
    }

    const filaEncabezado = ws.getRow(filaActual);
    filaEncabezado.values = hoja.encabezados;
    filaEncabezado.eachCell((celda) => {
      celda.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MARCA } };
      celda.alignment = { vertical: 'middle', wrapText: true };
      celda.border = { bottom: { style: 'thin' } };
    });
    filaEncabezado.height = 22;

    hoja.filas.forEach((fila, i) => {
      const row = ws.getRow(filaActual + 1 + i);
      row.values = fila as ExcelJS.CellValue[];
      row.eachCell((celda, col) => {
        celda.alignment = { vertical: 'top', wrapText: true };
        if (hoja.columnasMoneda?.includes(col - 1) && typeof celda.value === 'number') {
          celda.numFmt = '"$"#,##0.00';
        }
      });
      if (i % 2 === 1) {
        row.eachCell((celda) => {
          celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        });
      }
    });

    // Ancho automático aproximado según el contenido más largo de cada columna.
    hoja.encabezados.forEach((encabezado, i) => {
      const largos = hoja.filas.map((f) => String(f[i] ?? '').length);
      const ancho = Math.min(Math.max(encabezado.length, ...largos, 10) + 4, 45);
      ws.getColumn(i + 1).width = ancho;
    });
  }
}
