import { jsPDF } from 'jspdf';
import { trainingDocument } from './trainingDocument.ts';
import type { TrainingPlan } from './trainingPlans';
import { exerciseImageBytes, jpegDimensions } from './exerciseMedia.ts';

export type TrainingPdfAssets = { font: string; boldFont: string; crest: string; images?: Record<string, string> };
export function createTrainingPdf(plan: TrainingPlan, teamName: string, assets: TrainingPdfAssets): jsPDF {
  const content = trainingDocument(plan, teamName);
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true, putOnlyUsedFonts: true });
  pdf.addFileToVFS('InterSans.ttf', assets.font); pdf.addFont('InterSans.ttf', 'InterSans', 'normal');
  pdf.addFileToVFS('InterSans-Bold.ttf', assets.boldFont); pdf.addFont('InterSans-Bold.ttf', 'InterSans', 'bold');
  pdf.setProperties({ title: content.title, subject: `Entrenamiento · ${content.team} · ${content.date}`, author: 'Inter Playa Honda', creator: 'Inter Playa Honda' });
  const left = 16, width = 178, bottom = 277;
  let y = 38;
  function header() {
    pdf.addImage(assets.crest, 'JPEG', left, 12, 15, 15);
    pdf.setFont('InterSans', 'bold'); pdf.setFontSize(10); pdf.setTextColor('#176BA0'); pdf.text('INTER PLAYA HONDA', 35, 17);
    pdf.setFont('InterSans', 'normal'); pdf.setFontSize(8); pdf.setTextColor('#4F6880');
    pdf.text(pdf.splitTextToSize(content.team, 158), 35, 22);
    pdf.setDrawColor('#176BA0'); pdf.line(left, 32, 194, 32);
    y = 39;
  }
  function nextPage() { pdf.addPage(); header(); }
  function paragraph(value: string, size = 10, bold = false, color = '#17212D') {
    pdf.setFont('InterSans', bold ? 'bold' : 'normal'); pdf.setFontSize(size); pdf.setTextColor(color);
    const lineHeight = size * 0.46;
    const lines = pdf.splitTextToSize(value.replace(/\t/g, '    '), width) as string[];
    for (const line of lines) {
      if (y + lineHeight > bottom) { nextPage(); pdf.setFont('InterSans', bold ? 'bold' : 'normal'); pdf.setFontSize(size); pdf.setTextColor(color); }
      pdf.text(line, left, y); y += lineHeight;
    }
    y += 2;
  }
  header();
  paragraph(content.title, 18, true);
  paragraph(`Plan de entrenamiento · ${content.date}`, 10, false, '#4F6880');
  for (const section of content.sections) {
    pdf.setFont('InterSans', 'bold'); pdf.setFontSize(12);
    const headingLines = (pdf.splitTextToSize(section.heading, width) as string[]).length;
    if (y + headingLines * 6 + 14 > bottom) nextPage();
    y += 3; paragraph(section.heading, 12, true, '#176BA0');
    for (const text of section.paragraphs) paragraph(text);
    if (section.imagePath) {
      const data = assets.images?.[section.imagePath];
      if (!data) throw new Error('Falta cargar una imagen del entrenamiento.');
      const dimensions = jpegDimensions(exerciseImageBytes(data));
      const scale = Math.min(width / dimensions.width, 100 / dimensions.height), w = dimensions.width * scale, h = dimensions.height * scale;
      if (y + h + 4 > bottom) nextPage();
      pdf.addImage(data, 'JPEG', left + (width - w) / 2, y, w, h, section.imagePath); y += h + 5;
    }
    if (section.videoUrl) {
      if (y + 8 > bottom) nextPage();
      pdf.setFont('InterSans', 'normal'); pdf.setFontSize(10); pdf.setTextColor('#176BA0');
      pdf.textWithLink('Ver vídeo del ejercicio', left, y, { url: section.videoUrl }); y += 8;
    }
  }
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page); pdf.setDrawColor('#DAE2EB'); pdf.line(left, 282, 194, 282);
    pdf.setFont('InterSans', 'normal'); pdf.setFontSize(7); pdf.setTextColor('#61758A');
    pdf.text('Inter Playa Honda · Plan guardado', left, 287); pdf.text(`${page} / ${pages}`, 194, 287, { align: 'right' });
  }
  return pdf;
}
