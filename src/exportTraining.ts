import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { TrainingPlan } from './trainingPlans';
import { trainingPrintHtml } from './trainingDocument';
import { clubCrestData } from './clubCrestData';
import { trainingImages } from './data/exerciseImages';

export async function saveTrainingPdf(plan: TrainingPlan, teamName: string): Promise<void> {
  const html = trainingPrintHtml(plan, teamName, clubCrestData, await trainingImages(plan));
  if (!await Sharing.isAvailableAsync()) { await Print.printAsync({ html, width: 595, height: 842 }); return; }
  const file = await Print.printToFileAsync({ html, width: 595, height: 842 });
  await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Guardar o compartir entrenamiento' });
}
export async function printTraining(plan: TrainingPlan, teamName: string): Promise<void> {
  await Print.printAsync({ html: trainingPrintHtml(plan, teamName, clubCrestData, await trainingImages(plan)), width: 595, height: 842 });
}
