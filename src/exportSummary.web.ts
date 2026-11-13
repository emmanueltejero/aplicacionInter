import { createSummaryPdf } from './summaryPdf';
import { summaryPdfFilename, summaryPrintHtml } from './summaryDocument';
import type { SummaryDocument } from './summaryDocument';
import type { SummaryExportMode } from './exportSummary';
import { loadPdfAssets } from './pdfAssets';
import { clubCrestData } from './clubCrestData';

export async function exportSummary(content: SummaryDocument, mode: SummaryExportMode): Promise<string> {
  if (mode === 'print') {
    const frame = document.createElement('iframe'); frame.title = 'Imprimir resumen del equipo';
    Object.assign(frame.style, { position: 'fixed', width: '1px', height: '1px', opacity: '0', border: '0', bottom: '0' });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { frame.remove(); reject(new Error('No se pudo preparar la impresión. Guarda el PDF e imprímelo desde su visor.')); }, 15000);
      frame.onload = () => {
        clearTimeout(timer);
        try {
          const target = frame.contentWindow; if (!target) throw new Error('No se pudo abrir la impresión.');
          target.addEventListener('afterprint', () => frame.remove(), { once: true });
          target.focus(); target.print(); setTimeout(() => frame.remove(), 60000); resolve();
        } catch { frame.remove(); reject(new Error('El navegador no pudo abrir la impresión. Guarda el PDF e imprímelo desde su visor.')); }
      };
      frame.srcdoc = summaryPrintHtml(content, clubCrestData); document.body.appendChild(frame);
    });
    return 'Si no aparece la impresión en el móvil, guarda el PDF y ábrelo en su visor para imprimirlo.';
  }
  // Reserve the preview during the tap so asynchronous font loading does not block it.
  const preview = mode === 'view' ? window.open('', '_blank') : null;
  if (preview) { preview.opener = null; preview.document.title = 'Resumen del equipo'; preview.document.body.textContent = 'Preparando PDF…'; }
  try {
    const pdf = createSummaryPdf(content, await loadPdfAssets());
    const url = URL.createObjectURL(pdf.output('blob'));
    if (preview && !preview.closed) {
      preview.location.replace(url); setTimeout(() => URL.revokeObjectURL(url), 60000);
      return 'PDF abierto en otra pestaña. Desde su visor puedes guardarlo o imprimirlo.';
    }
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = summaryPdfFilename(content);
    document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
    return mode === 'view' ? 'El navegador no abrió otra pestaña. Se ha descargado el PDF; ábrelo desde Descargas para verlo o imprimirlo.' : 'PDF preparado. Busca el archivo en Descargas para verlo o imprimirlo.';
  } catch (error) { preview?.close(); throw error; }
}
