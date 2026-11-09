import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMatch, matchTotals, parseMatches, newMatchId } from '../src/matches.ts';
const roster=[{id:'a',name:'Jugador A',number:7},{id:'b',name:'Jugador B',number:8},{id:'c',name:'Archivado',number:9,archivedAt:'2026-11-01T10:00:00Z'}];
const draft={id:'00000000-0000-4000-8000-000000000010',date:'2026-11-01',opponent:'  Rival  ',duration:'60',venue:'home',played:true,players:{a:'60',b:''}};
const today='2026-11-09';
test('minutes distinguish pending from a recorded zero and allow simultaneous full-game players',()=>{
 const match=validateMatch(draft,roster,undefined,today);
 assert.equal(match.opponent,'Rival');assert.equal(match.players[0].minutes,60);assert.equal(match.players[1].minutes,null);
 assert.equal(validateMatch({...draft,players:{a:'0',b:'60'}},roster,undefined,today).players[0].minutes,0);
 assert.equal(validateMatch({...draft,players:{a:'60',b:'60'}},roster,undefined,today).players.length,2);
});
test('invalid dates, future played matches, invalid durations and out-of-range minutes are rejected',()=>{
 for(const change of [{date:'2026-02-30'},{date:'2026-11-10'},{duration:'0'},{duration:'241'},{duration:'1.5'},{opponent:' '},{players:{a:'61'}},{players:{a:'-1'}},{players:{a:'1.5'}}])assert.throws(()=>validateMatch({...draft,...change},roster,undefined,today));
 assert.doesNotThrow(()=>validateMatch({...draft,date:'2026-12-01',played:false},roster,undefined,today));
});
test('new call-ups reject other-team or archived players; historical archived participants remain editable',()=>{
 assert.throws(()=>validateMatch({...draft,players:{other:'10'}},roster,undefined,today));
 assert.throws(()=>validateMatch({...draft,players:{c:'10'}},roster,undefined,today));
 const previous={...validateMatch(draft,roster,undefined,today),players:[{playerId:'c',minutes:10}]};
 assert.equal(validateMatch({...draft,players:{c:'20'}},roster,previous,today).players[0].minutes,20);
});
test('totals include only played, non-future matches in the inclusive range',()=>{
 const match=validateMatch(draft,roster,undefined,today);
 const matches=[match,{...match,id:'second',date:'2026-11-02',players:[{playerId:'a',minutes:0},{playerId:'b',minutes:20}]},{...match,id:'future',date:'2026-12-01'},{...match,id:'planned',played:false},{...match,id:'old',date:'2026-10-31'}];
 const total=matchTotals(roster,matches,'2026-11-01','2026-11-30',today);
 assert.equal(total.matches,2);assert.deepEqual(total.rows[0],{player:roster[0],called:2,played:1,minutes:60,pending:0});assert.equal(total.rows[1].pending,1);assert.equal(total.rows[1].minutes,20);
 assert.throws(()=>matchTotals(roster,matches,'2026-11-09','2026-11-01',today));
});
test('stored match validation rejects corrupt and duplicate data, preserves empty state',()=>{
 const match=validateMatch(draft,roster,undefined,today);
 assert.deepEqual(parseMatches(null),[]);assert.deepEqual(parseMatches('[]'),[]);assert.deepEqual(parseMatches(JSON.stringify([match])),[match]);
 for(const value of ['null',JSON.stringify([match,match]),JSON.stringify([{...match,players:[{playerId:'a',minutes:61}]}]),JSON.stringify([{...match,players:[{playerId:'a',minutes:0},{playerId:'a',minutes:1}]}])])assert.throws(()=>parseMatches(value));
 assert.match(newMatchId(),/^[0-9a-f-]{36}$/i);
});
