import { jsPDF } from 'jspdf';
import { summaryColumns } from './summaryDocument.ts';
import type { SummaryDocument } from './summaryDocument';
import type { TrainingPdfAssets } from './trainingPdf';

export function createSummaryPdf(document: SummaryDocument, assets: TrainingPdfAssets): jsPDF {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true, putOnlyUsedFonts: true });
  pdf.addFileToVFS('InterSans.ttf', assets.font); pdf.addFont('InterSans.ttf', 'InterSans', 'normal');
  pdf.addFileToVFS('InterSans-Bold.ttf', assets.boldFont); pdf.addFont('InterSans-Bold.ttf', 'InterSans', 'bold');
  pdf.setProperties({ title: `Resumen · ${document.team}`, subject: document.period, author: 'Inter Playa Honda', creator: 'Inter Playa Honda' });
  const left = 12, right = 285, bottom = 194, widths = [13, 67, 18, 16, 18, 20, 22, 25, 26, 26, 22];
  let y = 0;
  function text(value: string, size = 9, bold = false, color = '#17212D') {
    pdf.setFont('InterSans', bold ? 'bold' : 'normal'); pdf.setFontSize(size); pdf.setTextColor(color);
    const lines = pdf.splitTextToSize(value, right - left) as string[];
    for (const line of lines) {
      if (y + 4.5 > bottom) { pdf.addPage(); header(); pdf.setFont('InterSans', bold ? 'bold' : 'normal'); pdf.setFontSize(size); pdf.setTextColor(color); }
      pdf.text(line, left, y); y += 4.5;
    }
    y += 1.5;
  }
  function header() {
    pdf.addImage(assets.crest, 'JPEG', left, 9, 13, 13);
    pdf.setFont('InterSans', 'bold'); pdf.setFontSize(10); pdf.setTextColor('#176BA0'); pdf.text('INTER PLAYA HONDA · RESUMEN POR JUGADOR', 29, 13);
    pdf.setFont('InterSans', 'normal'); pdf.setFontSize(9); pdf.setTextColor('#17212D');
    const teamLines = pdf.splitTextToSize(document.team, right - 29) as string[];
    pdf.text(teamLines, 29, 19); y = Math.max(27, 20 + teamLines.length * 4);
    pdf.setDrawColor('#176BA0'); pdf.line(left, y - 2, right, y - 2); y += 3;
    text(`${document.period} · ${document.archiveFilter}`, 8);
    text(`Fecha de corte: ${document.asOf} · Se excluyen fechas futuras.`, 8, false, '#4F6880');
  }
  function cells(values: string[], heading = false, stripe = false) {
    pdf.setFont('InterSans', heading ? 'bold' : 'normal'); pdf.setFontSize(heading ? 7 : 8);
    const lines = values.map((value, i) => pdf.splitTextToSize(value, widths[i] - 3) as string[]);
    const height = Math.max(9, ...lines.map(cell => cell.length * 3.5 + 5));
    let x = left;
    values.forEach((_, i) => {
      pdf.setFillColor(heading ? '#176BA0' : stripe ? '#F1F6FA' : '#FFFFFF'); pdf.setDrawColor('#DAE2EB'); pdf.rect(x, y, widths[i], height, 'FD');
      pdf.setTextColor(heading ? '#FFFFFF' : '#17212D');
      pdf.text(lines[i], i === 1 ? x + 1.5 : x + widths[i] / 2, y + 4, { align: i === 1 ? 'left' : 'center' }); x += widths[i];
    });
    y += height;
  }
  header(); text(document.overview, 8); y += 2; cells(summaryColumns, true);
  document.rows.forEach((row, index) => {
    pdf.setFont('InterSans', 'normal'); pdf.setFontSize(8);
    const height = Math.max(9, ...row.map((value, i) => (pdf.splitTextToSize(value, widths[i] - 3) as string[]).length * 3.5 + 5));
    if (y + height > bottom) { pdf.addPage(); header(); y += 2; cells(summaryColumns, true); }
    cells(row, false, index % 2 === 1);
  });
  y += 6;
  if (!document.rows.length) text('No hay jugadores para mostrar con este filtro.');
  for (const note of document.notes) text(note, 8, false, '#4F6880');
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page); pdf.setDrawColor('#DAE2EB'); pdf.line(left, 198, right, 198);
    pdf.setFont('InterSans', 'normal'); pdf.setFontSize(7); pdf.setTextColor('#61758A');
    pdf.text('Inter Playa Honda · Resumen del equipo', left, 203); pdf.text(`${page} / ${pages}`, right, 203, { align: 'right' });
  }
  return pdf;
}
