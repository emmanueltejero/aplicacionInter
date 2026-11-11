import { Asset } from 'expo-asset';
import type { TrainingPlan } from './trainingPlans';
import { createTrainingPdf } from './trainingPdf';
import { trainingPdfFilename, trainingPrintHtml } from './trainingDocument';
import { clubCrestData } from './clubCrestData';
import { trainingImages } from './data/exerciseImages';

let fonts: Promise<{ font: string; boldFont: string }> | undefined;
async function fontBase64(module: number | string) {
  const response = await fetch(Asset.fromModule(module).uri);
  if (!response.ok) throw new Error('No se pudo cargar la tipografía del PDF. Revisa la conexión e inténtalo de nuevo.');
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = '';
  for (let start = 0; start < bytes.length; start += 8192) binary += String.fromCharCode(...bytes.subarray(start, start + 8192));
  return btoa(binary);
}
export async function saveTrainingPdf(plan: TrainingPlan, teamName: string): Promise<void> {
  fonts ??= Promise.all([fontBase64(require('../assets/fonts/DejaVuSans.ttf')), fontBase64(require('../assets/fonts/DejaVuSans-Bold.ttf'))])
    .then(([font, boldFont]) => ({ font, boldFont })).catch(error => { fonts = undefined; throw error; });
  const pdf = createTrainingPdf(plan, teamName, { ...await fonts, crest: clubCrestData, images: await trainingImages(plan) });
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
