import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { trainingDocument, trainingPdfFilename, trainingPrintHtml } from '../src/trainingDocument.ts';
import { createTrainingPdf } from '../src/trainingPdf.ts';
import { clubCrestData } from '../src/clubCrestData.ts';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const entry = { id: id(1), exerciseId: id(100), exerciseRevision: 1, title: 'Posesión y finalización', description: 'Álex controla el balón, pasa a Iván y finaliza.\nRotar después de cada acción.', categories: ['Técnica', 'Posesión'], duration: 15, minPlayers: 6, maxPlayers: 12, spaceLength: 30, spaceWidth: 20, materials: [{ name: 'Conos', quantity: 4 }, { name: 'Balones', quantity: 6 }] };
const plan = { id: id(50), teamId: id(10), createdBy: id(2), revision: 1, archivedAt: null, title: 'Entrenamiento del miércoles', date: '2026-11-11', playerCount: 10, notes: 'Objetivo: controlar y pasar.\nDespués, finalización.', entries: [entry, { ...entry, id: id(2), title: 'Vuelta a la calma', duration: 5, materials: [{ name: 'Conos', quantity: 2 }] }] };
test('document includes saved notes, full exercise development, timeline and reusable quantities', () => {
  const document = trainingDocument(plan, 'Juvenil'), text = JSON.stringify(document);
  for (const value of ['20 minutos', '6 × Balones', '4 × Conos', 'Minuto 15–20', '600 m²', 'Álex controla', 'Después, finalización.']) assert.ok(text.includes(value));
  assert.equal(document.team, 'Juvenil'); assert.equal(document.date, '2026-11-11');
  const warning = trainingDocument({ ...plan, playerCount: 20, archivedAt: '2026-11-10T12:00:00Z' }, 'Juvenil');
  assert.ok(warning.sections.some(section => section.heading === 'Revisar los grupos'));
  assert.ok(JSON.stringify(warning).includes('Plan archivado'));
});
test('print HTML escapes all coach-entered fields and embeds only the local crest', () => {
  const attack = '</title><script>alert(1)</script><img src=x onerror=alert(2)> & "hola"';
  const html = trainingPrintHtml({ ...plan, title: attack, notes: attack, entries: [{ ...entry, description: attack }] }, attack, clubCrestData);
  assert.equal(html.includes('<script>'), false); assert.equal(html.includes('<img src=x'), false);
  assert.ok(html.includes('&lt;script&gt;')); assert.ok(html.includes('&amp;')); assert.ok(html.includes('data:image/jpeg;base64,'));
  assert.ok(html.includes('@page { size: A4;')); assert.equal(html.includes('https://'), false);
  assert.match(trainingPdfFilename({ title: '../../Álex: sesión / 1', date: plan.date }), /^inter-2026-11-11-alex-sesion-1\.pdf$/);
});
test('PDF generator produces embedded-font A4 files and paginates long complete sessions', () => {
  const assets = { font: readFileSync(new URL('../assets/fonts/DejaVuSans.ttf', import.meta.url)).toString('base64'), boldFont: readFileSync(new URL('../assets/fonts/DejaVuSans-Bold.ttf', import.meta.url)).toString('base64'), crest: clubCrestData };
  const pdf = createTrainingPdf(plan, 'Juvenil', assets);
  assert.ok(Math.abs(pdf.internal.pageSize.getWidth() - 210) < 0.1);
  assert.equal(pdf.getNumberOfPages(), 1);
  assert.match(Buffer.from(pdf.output('arraybuffer')).subarray(0, 8).toString(), /^%PDF-/);
  const long = createTrainingPdf({ ...plan, entries: Array.from({ length: 12 }, (_, index) => ({ ...entry, id: id(index + 1), description: 'Pase y control con precisión. '.repeat(150) + 'FIN_DEL_EJERCICIO' })) }, 'Juvenil', assets);
  assert.ok(long.getNumberOfPages() > 3);
  assert.ok(Buffer.from(long.output('arraybuffer')).length > 10000);
});
