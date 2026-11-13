import type { TrainingPlan } from './trainingPlans';
import { createTrainingPdf } from './trainingPdf';
import { trainingPdfFilename, trainingPrintHtml } from './trainingDocument';
import { clubCrestData } from './clubCrestData';
import { trainingImages } from './data/exerciseImages';
import { loadPdfAssets } from './pdfAssets';

export async function saveTrainingPdf(plan: TrainingPlan, teamName: string): Promise<void> {
  const pdf = createTrainingPdf(plan, teamName, { ...await loadPdfAssets(), images: await trainingImages(plan) });
  const url = URL.createObjectURL(pdf.output('blob')), anchor = document.createElement('a');
  anchor.href = url; anchor.download = trainingPdfFilename(plan); document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export async function printTraining(plan: TrainingPlan, teamName: string): Promise<void> {
  const images = await trainingImages(plan);
  const frame = document.createElement('iframe');
  frame.title = 'Imprimir entrenamiento';
  Object.assign(frame.style, { position: 'fixed', width: '1px', height: '1px', opacity: '0', border: '0', bottom: '0' });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { frame.remove(); reject(new Error('No se pudo preparar la impresión. Descarga el PDF e imprímelo desde su visor.')); }, 15000);
    frame.onload = () => {
      clearTimeout(timer);
      try {
        const target = frame.contentWindow;
        if (!target) throw new Error('No se pudo abrir la impresión.');
        target.addEventListener('afterprint', () => frame.remove(), { once: true });
        target.focus(); target.print(); setTimeout(() => frame.remove(), 60000); resolve();
      } catch { frame.remove(); reject(new Error('El navegador no pudo abrir la impresión. Descarga el PDF e imprímelo desde su visor.')); }
    };
    frame.srcdoc = trainingPrintHtml(plan, teamName, clubCrestData, images); document.body.appendChild(frame);
  });
}
