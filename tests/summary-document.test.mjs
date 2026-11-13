import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { summaryDocument, summaryPrintHtml, summaryPdfFilename, summaryColumns } from '../src/summaryDocument.ts';
import { createSummaryPdf } from '../src/summaryPdf.ts';
import { clubCrestData } from '../src/clubCrestData.ts';

const roster = [{ id: 'a', name: 'Álex Martín', number: 7 }, { id: 'b', name: 'Iván Sin Marcar', number: 8 }, { id: 'c', name: 'Archivado Ñandú', number: 9, archivedAt: '2026-11-10T12:00:00Z' }];
const register = { '2026-10-31': { a: 'present' }, '2026-11-01': { a: 'present', c: 'absent' }, '2026-11-02': { a: 'absent' }, '2026-11-03': { a: 'excused' }, '2026-11-14': { a: 'present' } };
const match = (id, date, players, played = true) => ({ id, date, players, played, opponent: 'Rival', duration: 60, venue: 'home' });
const matches = [match('1', '2026-11-01', [{ playerId: 'a', minutes: 50 }, { playerId: 'b', minutes: null }, { playerId: 'c', minutes: 0 }]), match('2', '2026-11-02', [{ playerId: 'a', minutes: 0 }]), match('3', '2026-11-03', [{ playerId: 'a', minutes: 30 }]), match('4', '2026-11-04', [{ playerId: 'a', minutes: null }]), match('5', '2026-11-14', [{ playerId: 'a', minutes: 60 }]), match('6', '2026-11-05', [{ playerId: 'a', minutes: 60 }], false)];
const filters = { from: '2026-11-01', to: '2026-11-30', includeArchived: true };
const make = (range = filters) => summaryDocument('Alevín B', roster, register, range, matches, '2026-11-13');

test('export keeps attendance percentages and match averages, pending and zero distinct', () => {
  const input = structuredClone({ roster, register, filters, matches });
  const document = make();
  assert.equal(document.team, 'Alevín B'); assert.equal(document.period, 'Del 01/11/2026 al 30/11/2026'); assert.equal(document.asOf, '13/11/2026');
  assert.match(document.overview, /3 jugadores · 3 fechas de entrenamiento · 4 registros completados · 4 partidos disputados/);
  assert.deepEqual(document.rows[0], ['#7', 'Álex Martín', '3', '1', '1', '1', '33,3%', '2', '80', '40', '1 partido']);
  assert.deepEqual(document.rows[1], ['#8', 'Iván Sin Marcar', '0', '0', '0', '0', 'Sin datos', '0', '—', '—', '1 partido']);
  assert.deepEqual(document.rows[2], ['#9', 'Archivado Ñandú (archivado)', '1', '0', '1', '0', '0%', '0', '0', '—', '—']);
  assert.deepEqual({ roster, register, filters, matches }, input);
});
test('export applies both inclusive date boundaries and archive filter to the same roster', () => {
  const document = make({ from: '2026-11-02', to: '2026-11-03', includeArchived: false });
  assert.equal(document.rows.length, 2); assert.equal(document.archiveFilter, 'Solo jugadores activos');
  assert.deepEqual(document.rows[0].slice(2), ['2', '0', '1', '1', '0%', '1', '30', '30', '—']);
  const all = make({ from: '', to: '', includeArchived: true });
  assert.equal(all.period, 'Todo el historial'); assert.equal(all.rows[0][2], '4'); assert.equal(all.rows[0][6], '50%');
  assert.equal(make({ ...filters, from: '' }).period, 'Hasta 30/11/2026'); assert.equal(make({ ...filters, to: '' }).period, 'Desde 01/11/2026');
  assert.throws(() => make({ ...filters, from: '2026-02-30' }), /válidas/);
  assert.throws(() => make({ ...filters, from: '2026-12-01' }), /anterior/);
  const empty = summaryDocument('Sin jugadores', [], {}, filters, [], '2026-11-13');
  assert.deepEqual(empty.rows, []); assert.match(summaryPrintHtml(empty, clubCrestData), /No hay jugadores/);
});
test('print includes all columns, inline crest, safe names, filter scope and table header repetition', () => {
  const attack = '</title><script>alert(1)</script><img src=x onerror=alert(2)> & "hola"';
  const document = summaryDocument(attack, [{ ...roster[0], name: attack }], register, filters, matches, '2026-11-13');
  const html = summaryPrintHtml(document, clubCrestData);
  assert.equal(html.includes('<script>'), false); assert.equal(html.includes('<img src=x'), false);
  assert.ok(html.includes('&lt;script&gt;')); assert.ok(html.includes('&amp;')); assert.ok(html.includes('data:image/jpeg;base64,'));
  assert.ok(html.includes('@page { size: A4 landscape;')); assert.ok(html.includes('table-header-group')); assert.equal(html.includes('https://'), false);
  for (const heading of summaryColumns) assert.ok(html.includes(heading));
  assert.ok(html.includes(document.period)); assert.ok(html.includes(document.archiveFilter));
  assert.match(summaryPdfFilename({ ...document, team: '../../Álevín B: /' }), /^inter-resumen-alevin-b-2026-11-13\.pdf$/);
});
test('PDF is landscape A4, embeds fonts, and paginates long rosters with complete rows', () => {
  const assets = { font: readFileSync(new URL('../assets/fonts/DejaVuSans.ttf', import.meta.url)).toString('base64'), boldFont: readFileSync(new URL('../assets/fonts/DejaVuSans-Bold.ttf', import.meta.url)).toString('base64'), crest: clubCrestData };
  const pdf = createSummaryPdf(make(), assets);
  assert.ok(Math.abs(pdf.internal.pageSize.getWidth() - 297) < .1); assert.ok(Math.abs(pdf.internal.pageSize.getHeight() - 210) < .1);
  assert.match(Buffer.from(pdf.output('arraybuffer')).subarray(0, 8).toString(), /^%PDF-/); assert.equal(pdf.getNumberOfPages(), 1);
  const longRoster = Array.from({ length: 100 }, (_, i) => ({ id: `long-${i}`, number: i % 100, name: `Jugador ${i + 1} con nombre y dos apellidos largos Hernández Rodríguez`, archivedAt: i % 2 ? '2026-11-01T12:00:00Z' : null }));
  const long = createSummaryPdf(summaryDocument('Equipo con un nombre largo '.repeat(3), longRoster, {}, filters, [], '2026-11-13'), assets);
  assert.ok(long.getNumberOfPages() >= 6); assert.ok(Buffer.from(long.output('arraybuffer')).length > 10000);
});
