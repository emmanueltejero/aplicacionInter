import { trainingTotals } from './trainingPlans.ts';
import type { TrainingPlan } from './trainingPlans';
import { exerciseImageBytes, exerciseVideoUrl } from './exerciseMedia.ts';

export type TrainingDocument = { title: string; team: string; date: string; sections: { heading: string; paragraphs: string[]; imagePath?: string | null; videoUrl?: string | null }[] };
export function trainingDocument(plan: TrainingPlan, teamName: string): TrainingDocument {
  const totals = trainingTotals(plan.entries, plan.playerCount);
  const range = totals.minPlayers! <= totals.maxPlayers! ? `${totals.minPlayers}–${totals.maxPlayers} jugadores` : 'Sin un rango común de jugadores entre las fichas.';
  return { title: plan.title, team: teamName, date: plan.date, sections: [
    { heading: 'Preparación del entrenamiento', paragraphs: [
      `${totals.minutes} minutos · ${plan.entries.length} ${plan.entries.length === 1 ? 'ejercicio' : 'ejercicios'} · ${plan.playerCount} jugadores previstos${plan.archivedAt ? ' · Plan archivado' : ''}`,
      `Rango común de las fichas: ${range}`,
      `Espacio común: ${totals.spaceLength} × ${totals.spaceWidth} m (${totals.spaceLength * totals.spaceWidth} m²). Largo y ancho máximos, sin rotar los espacios.`,
      'Ejercicios consecutivos. El material se reutiliza: se toma la cantidad máxima de cada tipo, sin multiplicar por grupos.',
    ] },
    { heading: 'Material para preparar', paragraphs: totals.materials.length ? totals.materials.map(item => `${item.quantity} × ${item.name}`) : ['Sin material.'] },
    ...(totals.mismatches.length ? [{ heading: 'Revisar los grupos', paragraphs: [
      `${plan.playerCount} jugadores no encajan en estas fichas. Si divides al equipo, ajusta el material y el espacio.`,
      ...totals.mismatches.map(item => `${item.title}: ${item.minPlayers}–${item.maxPlayers} jugadores.`),
    ] }] : []),
    { heading: 'Secuencia de la sesión', paragraphs: totals.timeline.map((item, index) => `${index + 1}. Minuto ${item.start}–${item.end} · ${plan.entries[index].duration} min · ${item.title}`) },
    ...(plan.notes ? [{ heading: 'Notas del entrenamiento', paragraphs: [plan.notes] }] : []),
    ...plan.entries.map((entry, index) => ({ heading: `${index + 1}. ${entry.title}`, imagePath: entry.imagePath, videoUrl: exerciseVideoUrl(entry.videoUrl), paragraphs: [
      `Minuto ${totals.timeline[index].start}–${totals.timeline[index].end} · ${entry.duration} minutos · ${entry.categories.join(' · ')}`,
      `${entry.minPlayers}–${entry.maxPlayers} jugadores · Espacio: ${entry.spaceLength} × ${entry.spaceWidth} m`,
      entry.description,
      `Material: ${entry.materials.map(item => `${item.quantity} ${item.name}`).join(' · ') || 'Sin material'}`,
    ] })),
  ] };
}
export function trainingPdfFilename(plan: Pick<TrainingPlan, 'title' | 'date'>) {
  const title = plan.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'entrenamiento';
  return `inter-${plan.date}-${title}.pdf`;
}
export const escapeTrainingHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
export function trainingPrintHtml(plan: TrainingPlan, teamName: string, crestData: string, images: Record<string, string> = {}): string {
  const document = trainingDocument(plan, teamName), escape = escapeTrainingHtml;
  for (const section of document.sections) if (section.imagePath) {
    if (!images[section.imagePath]) throw new Error('Falta cargar una imagen del entrenamiento.');
    exerciseImageBytes(images[section.imagePath]);
  }
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(document.title)}</title><style>
    @page { size: A4; margin: 16mm; } * { box-sizing: border-box; } body { margin: 0; color: #17212d; font: 11pt/1.5 Arial, sans-serif; overflow-wrap: anywhere; }
    header { display: flex; gap: 14px; align-items: center; border-bottom: 2px solid #176ba0; padding-bottom: 12px; } header img { width: 64px; height: 64px; object-fit: contain; }
    .club { color: #176ba0; font-weight: bold; letter-spacing: 1px; } h1 { font-size: 22pt; line-height: 1.25; } h2 { color: #176ba0; font-size: 13pt; margin-top: 22px; break-after: avoid; page-break-after: avoid; }
    p { margin: 7px 0; orphans: 3; widows: 3; white-space: pre-wrap; } .exercise-image {display:block;max-width:100%;max-height:100mm;object-fit:contain;break-inside:avoid;margin:12px auto} footer { margin-top: 24px; padding-top: 10px; border-top: 1px solid #dae2eb; color: #61758a; font-size: 9pt; }
  </style></head><body><header><img alt="Escudo del Inter Playa Honda" src="${escape(crestData)}"><div><div class="club">INTER PLAYA HONDA</div><div>${escape(document.team)}</div><div>Plan de entrenamiento · ${escape(document.date)}</div></div></header>
  <h1>${escape(document.title)}</h1>${document.sections.map(section => `<section><h2>${escape(section.heading)}</h2>${section.paragraphs.map(text => `<p>${escape(text)}</p>`).join('')}${section.imagePath ? `<img class="exercise-image" alt="Imagen o esquema del ejercicio" src="${escape(images[section.imagePath])}">` : ''}${section.videoUrl ? `<p><a href="${escape(section.videoUrl)}">Ver vídeo del ejercicio</a></p>` : ''}</section>`).join('')}
  <footer>Inter Playa Honda · Las fichas se conservan como se guardaron en este plan.</footer></body></html>`;
}
