import { CONFIG } from '../game/config';
import { newPlayer, plantHome, processFix, World, areaOf } from '../game/engine';
import { offset, LngLat } from '../game/geo';
import { emptyBadges, trackLaps } from '../game/badges';
import { makePlace } from '../game/places';
const assert=(c:any,m:string)=>{ if(!c){console.error('FAIL',m);process.exitCode=1} else console.log('ok',m)};
const O:LngLat=[-95.37,29.76];
function walk(world:World,id:string,pts:LngLat[],t0:number,speed=1.4,stepM=4){
  let t=t0, ev:any[]=[]; let cur=world.players[id].pos ?? pts[0];
  for(const target of pts){
    // interpolate
    const dx=(target[0]-cur[0]), dy=(target[1]-cur[1]);
    const d=Math.hypot(dx*Math.cos(29.76*Math.PI/180)*111320, dy*110574);
    const n=Math.max(1,Math.ceil(d/stepM));
    for(let i=1;i<=n;i++){ const p:LngLat=[cur[0]+dx*i/n,cur[1]+dy*i/n]; t+= (d/n)/speed*1000; ev.push(...processFix(world,id,{lng:p[0],lat:p[1],accuracy:5,t})); }
    cur=target;
  }
  return {ev,t};
}
// 1. home + square excursion claims
let w:World={players:{}}; const me=newPlayer('me','Me','#3dd6ff',false); w.players.me=me; plantHome(me,O);
processFix(w,'me',{lng:O[0],lat:O[1],accuracy:5,t:0});
const a0=areaOf(me);
let r=walk(w,'me',[offset(O,0,0),offset(O,50,0),offset(O,50,50),offset(O,0,50),offset(O,0,0)],0);
const claims=r.ev.filter(e=>e.type==='claim');
assert(claims.length===1,'one claim from square loop '+JSON.stringify(claims));
assert(areaOf(me)>2600 && areaOf(me)<3000,'area = 50x50 loop + home: '+areaOf(me).toFixed(0)+' (home '+a0.toFixed(0)+')');
// 2. speed gate: driving
r=walk(w,'me',[offset(O,30,0),offset(O,300,0),offset(O,300,300),offset(O,0,300),offset(O,0,0)],r.t,12);
assert(r.ev.some(e=>e.type==='trail-broken'&&e.reason==='too-fast') || r.ev.filter(e=>e.type==='claim').length===0,'driving loop does not claim');
assert(!r.ev.some(e=>e.type==='claim'),'no claim while driving');
// 3. self-loop with no territory using grace snap (doesn't exactly cross)
let w2:World={players:{}}; const p2=newPlayer('p','P','#f00',false); w2.players.p=p2;
const B=offset(O,500,500);
processFix(w2,'p',{lng:B[0],lat:B[1],t:0});
r=walk(w2,'p',[offset(B,40,0),offset(B,40,40),offset(B,0,40),offset(B,-3,6)],0);
assert(r.ev.some(e=>e.type==='claim'),'grace snap closes near-miss loop; area '+areaOf(p2).toFixed(0));
// 4. stealing + shields
let w3:World={players:{}}; const A=newPlayer('a','A','#0f0',false), Bp=newPlayer('b','B','#00f',false); w3.players.a=A; w3.players.b=Bp;
plantHome(A,O); const hb=offset(O,80,0); plantHome(Bp,hb);
processFix(w3,'a',{lng:O[0],lat:O[1],t:0}); processFix(w3,'b',{lng:hb[0],lat:hb[1],t:0});
r=walk(w3,'a',[offset(O,60,-20),offset(O,60,20),O],0);  // A claims a strip toward B
const aArea=areaOf(A);
// B immediately raids A's fresh land: shielded
let rb=walk(w3,'b',[offset(O,40,-30),offset(O,40,30),hb],r.t);
const st1=rb.ev.find(e=>e.type==='claim');
assert(st1 && st1.stolen.length===0,'fresh land shielded: '+JSON.stringify(st1));
// after shield expiry
const later=rb.t+CONFIG.SHIELD_MS+1000;
processFix(w3,'b',{lng:hb[0]+0.00001,lat:hb[1],t:later-200000});
rb=walk(w3,'b',[offset(O,30,-35),offset(O,30,35),hb],later);
const st2=rb.ev.find(e=>e.type==='claim');
assert(st2 && st2.stolen.some((s:any)=>s.from==='a'&&s.area>50),'steal after shield expiry: '+JSON.stringify(st2));
assert(areaOf(A)<aArea,'A lost land '+aArea.toFixed(0)+' -> '+areaOf(A).toFixed(0));
// home never stolen
assert(areaOf(A)>=Math.PI*144*0.95,'home kept');
// 5. crossing someone's trail does NOT erase it (no paper.io deaths)
let w4:World={players:{}}; const c1=newPlayer('c1','c','#0',false), c2=newPlayer('c2','d','#1',false); w4.players.c1=c1; w4.players.c2=c2;
plantHome(c1,O); processFix(w4,'c1',{lng:O[0],lat:O[1],t:0}); walk(w4,'c1',[offset(O,0,60)],0);
const before=c1.trail.length;
const s2=offset(O,-20,30); processFix(w4,'c2',{lng:s2[0],lat:s2[1],t:0}); walk(w4,'c2',[offset(O,20,30)],0);
assert(before>3 && c1.trail.length===before,'trail survives someone walking across it');
// 6. laps
const st=emptyBadges(); const place=makePlace({name:"McDonald's",cls:'amenity',sub:'fast_food',lng:O[0],lat:O[1]});
let laps:any[]=[];
for(let k=0;k<=2*72+3;k++){ const a=k*Math.PI*2/72; const p=offset(O,Math.cos(a)*30+(Math.random()-.5)*4,Math.sin(a)*30+(Math.random()-.5)*4); laps.push(...trackLaps(st,p,[place],k)); }
assert(laps.length===2 && laps[0].tierUp?.name==='Bronze' && place.brand==="McDonald's",'two laps counted, bronze, brand '+laps.length);
