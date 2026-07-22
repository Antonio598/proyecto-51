import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';

export interface Seccion {
  titulo: string;
  parrafos?: string[];
  tabla?: { encabezados: string[]; filas: string[][] };
}

export interface DocumentoPdf {
  titulo: string;
  subtitulo?: string;
  secciones: Seccion[];
  piePagina?: string;
}

const MARCA = '#0f3d63';
const GRIS = '#64748b';
const BORDE = '#cbd5e1';

/**
 * Generación de PDF con pdfkit (sin navegador ni binarios externos,
 * para que el despliegue en el VPS no dependa de Chromium).
 */
@Injectable()
export class PdfService {
  async generar(doc: DocumentoPdf): Promise<Buffer> {
    const pdf = new PDFDocument({ size: 'LETTER', margin: 45, bufferPages: true });
    const chunks: Buffer[] = [];
    pdf.on('data', (c: Buffer) => chunks.push(c));
    const terminado = new Promise<Buffer>((resolve) => {
      pdf.on('end', () => resolve(Buffer.concat(chunks)));
    });

    this.encabezado(pdf, doc);
    for (const seccion of doc.secciones) {
      this.seccion(pdf, seccion);
    }
    this.pies(pdf, doc.piePagina);

    pdf.end();
    return terminado;
  }

  private encabezado(pdf: PDFKit.PDFDocument, doc: DocumentoPdf) {
    pdf.fillColor(MARCA).fontSize(18).font('Helvetica-Bold').text(doc.titulo);
    if (doc.subtitulo) {
      pdf.moveDown(0.2).fillColor(GRIS).fontSize(10).font('Helvetica').text(doc.subtitulo);
    }
    pdf
      .moveDown(0.5)
      .strokeColor(MARCA)
      .lineWidth(1.5)
      .moveTo(pdf.page.margins.left, pdf.y)
      .lineTo(pdf.page.width - pdf.page.margins.right, pdf.y)
      .stroke();
    pdf.moveDown(1);
  }

  private seccion(pdf: PDFKit.PDFDocument, seccion: Seccion) {
    this.saltoSiNecesario(pdf, 60);
    pdf.fillColor(MARCA).fontSize(12).font('Helvetica-Bold').text(seccion.titulo);
    pdf.moveDown(0.4);

    for (const parrafo of seccion.parrafos ?? []) {
      pdf
        .fillColor('#1e293b')
        .fontSize(10)
        .font('Helvetica')
        .text(parrafo, { align: 'justify', lineGap: 2 });
      pdf.moveDown(0.4);
    }

    if (seccion.tabla) {
      this.tabla(pdf, seccion.tabla.encabezados, seccion.tabla.filas);
    }
    pdf.moveDown(0.8);
  }

  /** Tabla con anchos uniformes, ajuste de altura por celda y salto de página. */
  private tabla(pdf: PDFKit.PDFDocument, encabezados: string[], filas: string[][]) {
    const izquierda = pdf.page.margins.left;
    const ancho = pdf.page.width - pdf.page.margins.left - pdf.page.margins.right;
    // La primera columna es la etiqueta y necesita más espacio.
    const anchoPrimera = encabezados.length > 1 ? ancho * 0.28 : ancho;
    const anchoResto =
      encabezados.length > 1 ? (ancho - anchoPrimera) / (encabezados.length - 1) : 0;
    const anchoDe = (i: number) => (i === 0 ? anchoPrimera : anchoResto);
    const xDe = (i: number) => izquierda + (i === 0 ? 0 : anchoPrimera + anchoResto * (i - 1));

    const alturaFila = (celdas: string[], negrita: boolean) => {
      pdf.fontSize(9).font(negrita ? 'Helvetica-Bold' : 'Helvetica');
      return (
        Math.max(
          ...celdas.map((c, i) => pdf.heightOfString(c || '—', { width: anchoDe(i) - 12 })),
        ) + 10
      );
    };

    const dibujarFila = (celdas: string[], negrita: boolean, fondo?: string) => {
      const alto = alturaFila(celdas, negrita);
      this.saltoSiNecesario(pdf, alto);
      const y = pdf.y;

      if (fondo) {
        pdf.rect(izquierda, y, ancho, alto).fill(fondo);
      }
      pdf.fontSize(9).font(negrita ? 'Helvetica-Bold' : 'Helvetica');
      celdas.forEach((celda, i) => {
        pdf
          .fillColor(negrita ? '#ffffff' : '#1e293b')
          .text(celda || '—', xDe(i) + 6, y + 5, { width: anchoDe(i) - 12 });
      });
      pdf
        .strokeColor(BORDE)
        .lineWidth(0.5)
        .rect(izquierda, y, ancho, alto)
        .stroke();
      pdf.y = y + alto;
    };

    dibujarFila(encabezados, true, MARCA);
    filas.forEach((fila, i) => dibujarFila(fila, false, i % 2 === 1 ? '#f8fafc' : undefined));
  }

  private saltoSiNecesario(pdf: PDFKit.PDFDocument, alto: number) {
    if (pdf.y + alto > pdf.page.height - pdf.page.margins.bottom) {
      pdf.addPage();
    }
  }

  /** Numera todas las páginas al final, cuando ya se conoce el total. */
  private pies(pdf: PDFKit.PDFDocument, texto?: string) {
    const rango = pdf.bufferedPageRange();
    for (let i = 0; i < rango.count; i++) {
      pdf.switchToPage(rango.start + i);
      const y = pdf.page.height - 35;
      pdf
        .fillColor(GRIS)
        .fontSize(8)
        .font('Helvetica')
        .text(
          `${texto ?? ''}${texto ? ' · ' : ''}Página ${i + 1} de ${rango.count}`,
          pdf.page.margins.left,
          y,
          { width: pdf.page.width - pdf.page.margins.left - pdf.page.margins.right, align: 'center' },
        );
    }
  }
}
