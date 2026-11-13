import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT, decodeJwt } from 'jose';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createClubMcp } from '../server.ts';
import { playerSummary, clubToday } from '../data.ts';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const base='https://club.example.supabase.co',resource=base+'/functions/v1/club-mcp',now=new Date('2026-11-13T12:00:00Z');
const {privateKey,publicKey}=await generateKeyPair('ES256'),jwk={...await exportJWK(publicKey),alg:'ES256',kid:'local-test'};
const jwks=createLocalJWKSet({keys:[jwk]});
async function token(overrides={}){return new SignJWT({role:'club_mcp_reader',client_id:id(90),club_mcp_read:true,...overrides}).setProtectedHeader({alg:'ES256',kid:'local-test'}).setSubject(id(2)).setIssuer(base+'/auth/v1').setAudience(resource).setIssuedAt(Math.floor(now.getTime()/1000)).setExpirationTime(Math.floor(now.getTime()/1000)+3600).sign(privateKey);}
const good=await token();
const roster=[{id:id(50),name:'Jugador ficticio Álex',number:7},{id:id(51),name:'Jugador ficticio Iván',number:8},{id:id(52),name:'Archivado ficticio',number:9,archivedAt:'2026-11-10T12:00:00Z'}];
const team={id:id(10),name:'Alevín B ficticio',category:'Alevín',archived_at:null};
const snapshot={team,roster,attendance:[{date:'2026-11-01',player_id:id(50),status:'present'},{date:'2026-11-01',player_id:id(52),status:'absent'},{date:'2026-11-02',player_id:id(50),status:'absent'},{date:'2026-11-03',player_id:id(50),status:'excused'}],matches:[50,0,30,null].map((minutes,i)=>({id:id(100+i),date:`2026-11-0${i+1}`,opponent:'Rival ficticio',duration:60,venue:'home',played:true,players:[{playerId:id(50),minutes},{playerId:id(51),minutes:null}]}))};
function harness(){const calls=[];let authorized=true,fail=false;const handle=createClubMcp({supabaseUrl:base,resourceUrl:resource,publicKey:'sb_publishable_local-test',jwks,now:()=>now,fetcher:async(url,init)=>{
 calls.push({url,method:init.method,args:init.body?JSON.parse(init.body):null});assert.equal(init.headers.apikey,'sb_publishable_local-test');assert.equal(decodeJwt(init.headers.Authorization.slice(7)).role,'club_mcp_reader');
 if(fail)return Response.json({error:'simulated'},{status:503});
 if(url.endsWith('/rpc/club_mcp_authorized'))return Response.json(authorized);
 if(url.includes('/teams?'))return Response.json([team]);
 if(url.endsWith('/rpc/club_mcp_read_team')){const p=JSON.parse(init.body);if(p.p_team!==id(10))return Response.json({error:'denied'},{status:403});const data=structuredClone(snapshot);if(!p.p_include_archived)data.roster=data.roster.filter(p=>!p.archivedAt);data.attendance=p.p_attendance?data.attendance.filter(r=>(!p.p_from||r.date>=p.p_from)&&(!p.p_to||r.date<=p.p_to)&&r.date<=p.p_as_of):[];data.matches=p.p_matches?data.matches.filter(m=>(!p.p_from||m.date>=p.p_from)&&(!p.p_to||m.date<=p.p_to)&&m.date<=p.p_as_of):[];return Response.json(data);}
 throw new Error('Unexpected backend endpoint');
 }});return {handle,calls,disable:()=>authorized=false,fail:()=>fail=true};}
async function client(h,access=good){const c=new Client({name:'local-verification',version:'1.0.0'});await c.connect(new StreamableHTTPClientTransport(new URL(resource),{requestInit:{headers:{Authorization:'Bearer '+access}},fetch:async(input,init)=>h.handle(new Request(input,init))}));return c;}
const post=(access,body,extra={})=>new Request(resource,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream',...(access?{Authorization:'Bearer '+access}:{}),...extra},body:JSON.stringify(body)});

test('OAuth discovery and token validation fail closed before loading any data',async()=>{
 const h=harness();let r=await h.handle(post(null,{}));assert.equal(r.status,401);assert.match(r.headers.get('www-authenticate'),/resource_metadata="https:\/\/club.example.supabase.co\/functions\/v1\/club-mcp/);assert.equal(r.headers.get('cache-control'),'no-store');
 r=await h.handle(new Request(resource+'/.well-known/oauth-protected-resource'));const metadata=await r.json();assert.equal(metadata.resource,resource);assert.deepEqual(metadata.authorization_servers,[base+'/auth/v1']);
 const wrongAudience=await new SignJWT({role:'club_mcp_reader',client_id:id(90),club_mcp_read:true}).setProtectedHeader({alg:'ES256',kid:'local-test'}).setSubject(id(2)).setIssuer(base+'/auth/v1').setAudience('authenticated').setIssuedAt().setExpirationTime('1h').sign(privateKey);
 const wrongIssuer=await new SignJWT({role:'club_mcp_reader',client_id:id(90),club_mcp_read:true}).setProtectedHeader({alg:'ES256',kid:'local-test'}).setSubject(id(2)).setIssuer('https://wrong.example/auth/v1').setAudience(resource).setIssuedAt(Math.floor(now.getTime()/1000)).setExpirationTime(Math.floor(now.getTime()/1000)+3600).sign(privateKey);
 const expired=await new SignJWT({role:'club_mcp_reader',client_id:id(90),club_mcp_read:true}).setProtectedHeader({alg:'ES256',kid:'local-test'}).setSubject(id(2)).setIssuer(base+'/auth/v1').setAudience(resource).setIssuedAt(0).setExpirationTime(10).sign(privateKey);
 for(const t of ['forged',wrongAudience,wrongIssuer,expired,await token({role:'authenticated'}),await token({role:'service_role'}),await token({club_mcp_read:false}),await token({client_id:'not-a-client'})])assert.equal((await h.handle(post(t,{}))).status,401);
 assert.equal(h.calls.length,0);
 assert.equal((await h.handle(post(good,{}, {Origin:'https://untrusted.example'}))).status,403);assert.equal(h.calls.length,0);
 h.disable();assert.equal((await h.handle(post(good,{}))).status,403);
});
test('official MCP client negotiates, lists exactly five read-only tools and reads live scoped summaries/details',async()=>{
 const h=harness(),c=await client(h);
 try{
  const {tools}=await c.listTools();assert.deepEqual(tools.map(t=>t.name).sort(),['list_teams','get_roster','get_player_summary','get_attendance','get_match_minutes'].sort());for(const t of tools){assert.equal(t.annotations.readOnlyHint,true);assert.equal(t.annotations.destructiveHint,false);assert.ok(t._meta.securitySchemes);}
  const call=async(name,args={})=>{const result=await c.callTool({name,arguments:args});assert.ok(!result.isError,JSON.stringify(result));return result.structuredContent;};
  const teams=await call('list_teams');assert.equal(teams.teams[0].id,id(10));assert.equal(teams.as_of,'2026-11-13');
  const summary=await call('get_player_summary',{team_id:id(10),from:'2026-11-01',to:'2026-11-30'});
  assert.equal(summary.team.name,team.name);assert.equal(summary.as_of,'2026-11-13');assert.deepEqual(summary.period,{from:'2026-11-01',to:'2026-11-30',inclusive:true});assert.ok(Math.abs(summary.players[0].attendance.percentage-100/3)<1e-10);assert.equal(summary.players[0].matches.played,2);assert.equal(summary.players[0].matches.minutes,80);assert.equal(summary.players[0].matches.average_minutes,40);assert.equal(summary.players[0].matches.pending_minutes,1);assert.equal(summary.players[1].attendance.percentage,null);assert.equal(summary.players[1].matches.minutes,null);
  const detail=await call('get_match_minutes',{team_id:id(10),match_id:id(103)});assert.equal(detail.items[0].players[0].minutes,null);assert.equal(detail.items[0].players[0].pending,true);assert.equal(detail.pending.match_minute_entries,2);
  const zero=await call('get_match_minutes',{team_id:id(10),match_id:id(101),player_id:id(50)});assert.equal(zero.items[0].players[0].minutes,0);assert.equal(zero.items[0].players[0].counts_as_played,false);
  const attendance=await call('get_attendance',{team_id:id(10),page_size:1});assert.equal(attendance.items.length,1);assert.equal(attendance.pagination.has_more,true);assert.equal(attendance.items[0].players[1].status,'unmarked');
  const unmarked=await call('get_attendance',{team_id:id(10),player_id:id(51)});assert.equal(unmarked.items.length,3);assert.equal(unmarked.items[0].players[0].status,'unmarked');assert.equal(unmarked.pending.unmarked_on_recorded_training_dates,3);
  const older=await call('get_player_summary',{team_id:id(10),as_of:'2026-11-01'});assert.equal(older.players[0].matches.minutes,50);assert.equal(older.players[0].attendance.percentage,100);
  const denied=await c.callTool({name:'get_player_summary',arguments:{team_id:id(20)}});assert.equal(denied.isError,true);assert.match(denied.content[0].text,/ACCESS_DENIED/);
  for(const args of [{team_id:id(10),as_of:'2026-11-14'},{team_id:id(10),from:'2026-02-30'},{team_id:id(10),from:'2026-12-01',to:'2026-11-01'}])assert.equal((await c.callTool({name:'get_player_summary',arguments:args})).isError,true);
  const count=h.calls.length;const attack=await c.callTool({name:'get_roster',arguments:{team_id:id(10),sql:'DELETE FROM players'}});assert.equal(attack.isError,true);assert.equal(h.calls.length,count+1); // Only live authorization runs; no snapshot/query forwarding.
  assert.ok(h.calls.every(c=>c.method==='GET'||c.url.endsWith('/rpc/club_mcp_read_team')));
 }finally{await c.close()}
});
test('transport accepts 2025 ChatGPT initialize and rejects unavailable backend rather than reporting zeros',async()=>{
 const h=harness();const r=await h.handle(post(good,{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'legacy-test',version:'1'}}}));assert.equal(r.status,200);assert.match(await r.text(),/2025-11-25/);
 const tools=await h.handle(post(good,{jsonrpc:'2.0',id:2,method:'tools/list',params:{}},{'MCP-Protocol-Version':'2025-11-25'}));assert.equal(tools.status,200);assert.match(await tools.text(),/get_player_summary/);
 const summary=await h.handle(post(good,{jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'get_player_summary',arguments:{team_id:id(10)}}},{'MCP-Protocol-Version':'2025-11-25'}));assert.equal(summary.status,200);assert.match(await summary.text(),/average_minutes/);
 h.fail();assert.equal((await h.handle(post(good,{}))).status,503);
});
test('shared app rules exclude future/planned matches, preserve archives and use Canary dates across DST',()=>{
 const data=structuredClone(snapshot);data.matches.push({...data.matches[0],id:id(200),date:'2026-11-14'},{...data.matches[0],id:id(201),played:false});
 const result=playerSummary(data,{from:'',to:'',as_of:'2026-11-13',includeArchived:true},now);assert.equal(result.players[0].matches.minutes,80);assert.equal(result.matches_played,4);assert.equal(result.players.length,3);
 assert.equal(clubToday(new Date('2026-07-01T23:30:00Z')),'2026-07-02');assert.equal(clubToday(new Date('2026-11-01T23:30:00Z')),'2026-11-01');
});
