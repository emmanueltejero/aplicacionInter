import test from 'node:test';
import assert from 'node:assert/strict';
import { dateKey } from '../src/domain.ts';
import { calendarDate, calendarMonth, moveCalendarMonth, teamCalendarEvents } from '../src/teamCalendar.ts';

test('month grids use Monday first, real leap days and complete weeks without inventing dates', () => {
  const feb = calendarMonth('2024-02-15');
  assert.equal(feb.length, 5); assert.deepEqual(feb[0].slice(0, 4), [null,null,null,'2024-02-01']);
  assert.equal(feb.flat().filter(Boolean).length, 29); assert.ok(feb.flat().includes('2024-02-29'));
  assert.equal(calendarMonth('2026-02-01').flat().filter(Boolean).length,28);
  assert.equal(calendarMonth('2026-03-01').length,6);
  assert.equal(calendarMonth('2021-02-01').length,4);
  for (const invalid of ['2026-02-29','2026-11-31','0000-01-01','2026-1-01','invalid',null,['2026-11-10']]) assert.equal(calendarDate(invalid),null);
  assert.throws(() => calendarMonth('2026-02-30'),/fecha válida/);
});
test('month navigation clamps the day and crosses years without rolling into an extra month', () => {
  assert.equal(moveCalendarMonth('2026-01-31',1),'2026-02-28');
  assert.equal(moveCalendarMonth('2024-03-31',-1),'2024-02-29');
  assert.equal(moveCalendarMonth('2026-12-31',1),'2027-01-31');
  assert.equal(moveCalendarMonth('2026-01-10',-1),'2025-12-10');
  assert.equal(moveCalendarMonth('9999-12-31',1),null);assert.equal(moveCalendarMonth('0001-01-01',-1),null);
  assert.equal(moveCalendarMonth('2026-11-31',1),null);assert.equal(moveCalendarMonth('2026-11-10',NaN),null);
});
test('calendar days stay local in Canary Islands and negative-offset time zones across DST', () => {
  const previousZone = process.env.TZ;
  try {
    for (const zone of ['Atlantic/Canary','America/Los_Angeles']) {
      process.env.TZ = zone;
      const result = ['2026-03-29','2026-10-25'].map(day => ({day:dateKey(calendarDate(day)),hour:calendarDate(day).getHours(),days:calendarMonth(day).flat().filter(Boolean).length,next:moveCalendarMonth(day,1)}));
      assert.deepEqual(result,[{day:'2026-03-29',hour:12,days:31,next:'2026-04-29'},{day:'2026-10-25',hour:12,days:31,next:'2026-11-25'}]);
    }
  } finally { if (previousZone === undefined) delete process.env.TZ; else process.env.TZ = previousZone; }
});
test('same-day activities keep independent IDs, exclude archived/other-team plans and preserve source data', () => {
  const plan=(id,title,extra={})=>({id,teamId:'A',date:'2026-11-10',title,archivedAt:null,...extra});
  const plans=[plan('p2','Técnica'),plan('p1','Activación'),plan('archived','Archivado',{archivedAt:'2026-11-10T10:00:00Z'}),plan('other','Otro',{teamId:'B'}),plan('bad','Fecha incorrecta',{date:'2026-11-31'})];
  const matches=[{id:'m1',date:'2026-11-10',opponent:'Rival',played:false},{id:'m2',date:'2026-11-10',opponent:'Amistoso',played:true},{id:'m3',date:'2026-12-01',opponent:'Futuro',played:false}];
  const before=JSON.stringify({plans,matches}),days=teamCalendarEvents('A',plans,matches);
  assert.deepEqual(days['2026-11-10'].map(e=>e.kind==='training'?e.plan.id:e.match.id),['p1','p2','m2','m1']);
  assert.equal(days['2026-12-01'][0].match.id,'m3');assert.equal(Object.keys(days).length,2);
  assert.equal(JSON.stringify({plans,matches}),before);assert.deepEqual(teamCalendarEvents('A',[],[]),{});
});
