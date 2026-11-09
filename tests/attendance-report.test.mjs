import test from 'node:test';
import assert from 'node:assert/strict';
import { attendanceReport, isCalendarDate } from '../src/attendanceReport.ts';
import { initialReportFilters } from '../src/domain.ts';

const roster=[{id:'a',name:'Jugador A',number:7},{id:'b',name:'Jugador B',number:8},{id:'c',name:'Archivado',number:9,archivedAt:'2026-11-05T10:00:00Z'}];
const register={
 '2026-10-31':{a:'present'},
 '2026-11-01':{a:'present',c:'present'},
 '2026-11-02':{a:'absent'},
 '2026-11-03':{a:'excused'},
 '2026-11-04':{c:'absent'},
 '2026-11-05':{},
 '2026-11-06':{otherTeam:'present'},
 '2026-11-07':{a:'present'},
 '2026-11-10':{a:'absent'},
};
const filters={from:'2026-11-01',to:'2026-11-30',includeArchived:true};

test('report includes both date boundaries, excludes future dates and uses completed player records',()=>{
 const report=attendanceReport(roster,register,filters,'2026-11-09');
 assert.equal(report.dates,5);
 assert.deepEqual(report.totals,{present:3,absent:2,excused:1,recorded:6});
 const a=report.rows.find(row=>row.player.id==='a');
 assert.equal(a.percentage,50);assert.equal(a.recorded,4);
 const unmarked=report.rows.find(row=>row.player.id==='b');
 assert.equal(unmarked.recorded,0);assert.equal(unmarked.percentage,null);
 const onlyFirst=attendanceReport(roster,register,{...filters,to:'2026-11-01'},'2026-11-09');
 assert.equal(onlyFirst.rows[0].percentage,100);
 assert.equal(onlyFirst.dates,1);
});
test('archive filtering retains recorded history without manufacturing absent marks',()=>{
 const all=attendanceReport(roster,register,filters,'2026-11-09');
 assert.equal(all.rows.find(row=>row.player.id==='c').percentage,50);
 const active=attendanceReport(roster,register,{...filters,includeArchived:false},'2026-11-09');
 assert.equal(active.rows.length,2);assert.equal(active.dates,4);assert.equal(active.rows[0].absent,1);
 assert.equal(active.rows[1].absent,0);
});
test('empty intervals are distinct from a recorded 0% attendance rate',()=>{
 const empty=attendanceReport(roster,register,{...filters,from:'2026-11-08',to:'2026-11-09'},'2026-11-09');
 assert.equal(empty.dates,0);assert.equal(empty.rows[0].percentage,null);
 const absent=attendanceReport(roster,register,{...filters,from:'2026-11-02',to:'2026-11-02'},'2026-11-09');
 assert.equal(absent.rows[0].percentage,0);
});
test('all-time ranges include historical data and keep fractional percentages precise',()=>{
 const all=attendanceReport(roster,register,{from:'',to:'',includeArchived:true},'2026-11-09');
 assert.equal(all.rows[0].recorded,5);assert.equal(all.rows[0].percentage,60);
 const third=attendanceReport([roster[0]],{'2026-11-01':{a:'present'},'2026-11-02':{a:'absent'},'2026-11-03':{a:'excused'}},filters,'2026-11-09');
 assert.ok(Math.abs(third.rows[0].percentage-100/3)<1e-12);
});
test('calendar validation catches impossible dates and reversed ranges',()=>{
 for(const date of ['2026-02-29','2026-11-31','2026-13-01','2026-1-01','invalid'])assert.equal(isCalendarDate(date),false);
 assert.equal(isCalendarDate('2024-02-29'),true);
 assert.throws(()=>attendanceReport(roster,register,{...filters,from:'2026-11-20',to:'2026-11-10'},'2026-11-09'),/anterior/);
 assert.throws(()=>attendanceReport(roster,register,{...filters,from:'2026-11'},'2026-11-09'),/fechas válidas/);
 assert.equal(initialReportFilters(new Date(2026,0,1)).from,'2026-01-01');
});
