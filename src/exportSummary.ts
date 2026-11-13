import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { summaryPrintHtml } from './summaryDocument';
import type { SummaryDocument } from './summaryDocument';
import { clubCrestData } from './clubCrestData';

export type SummaryExportMode = 'view' | 'save' | 'print';
export async function exportSummary(document: SummaryDocument, mode: SummaryExportMode): Promise<string> {
  const html = summaryPrintHtml(document, clubCrestData);
  if (mode === 'print' || !await Sharing.isAvailableAsync()) {
    await Print.printAsync({ html, width: 842, height: 595, orientation: Print.Orientation.landscape });
    return 'Si no aparece la impresión, guarda el PDF y ábrelo en su visor para imprimirlo.';
  }
  const file = await Print.printToFileAsync({ html, width: 842, height: 595 });
  await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Abrir o guardar resumen del equipo' });
  return 'PDF preparado. Puedes guardarlo o abrirlo con tu visor desde el menú de compartir.';
}
