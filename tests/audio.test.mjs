import assert from 'node:assert/strict';
import test from 'node:test';
import {PreparedAudio,sessionClips,PlaybackSequence,questionTexts,questionClips} from '../app/lib/audio.ts';
function harness(){let id=0;const pending=new Map(),played=[];let completed=0,failed=0,cancelled=0;const sequence=new PlaybackSequence((fn,ms)=>{const key=++id;pending.set(key,{fn,ms});return key;},key=>pending.delete(key));const play=(value,end,error)=>{played.push({value,end,error});return()=>cancelled++;};return {sequence,pending,played,start:(steps=['number','reading','example'])=>sequence.start(steps,play,700,6000,()=>completed++,()=>failed++),tick(){const [key,item]=pending.entries().next().value;pending.delete(key);item.fn();return item.ms;},get completed(){return completed;},get failed(){return failed;},get cancelled(){return cancelled;}};}
test('exact manifest keys preserve original example and omit absent examples',()=>{const w={reading:'かな',example:'これは例です。'};assert.deepEqual(questionTexts(0,w),['第1問。','かな。','これは例です。']);assert.deepEqual(questionTexts(19,{reading:'かな'}),['第20問。','かな。']);const manifest={voices:[],clips:{'第1問。':{metan:'/1'},'かな。':{metan:'/2'},'これは例です。':{metan:'/3'}}};assert.deepEqual(questionClips(manifest,'metan',0,w),['/1','/2','/3']);assert.throws(()=>questionClips(manifest,'tsumugi',0,w),/尚未生成/);assert.throws(()=>questionClips(manifest,'metan',1,w),/尚未生成/);});
test('actual end events, separate pauses and full writing gap gate completion',()=>{const h=harness();h.start();assert.equal(h.played.length,1);assert.equal(h.pending.size,0);h.played[0].end();h.played[0].end();assert.equal(h.pending.size,1);assert.equal(h.tick(),700);assert.equal(h.played[1].value,'reading');h.played[1].end();assert.equal(h.tick(),700);h.played[2].end();assert.equal(h.completed,0);assert.equal([...h.pending.values()][0].ms,6000);h.tick();assert.equal(h.completed,1);h.played[2].end();assert.equal(h.completed,1);});
test('pause cancels writing gap and ignores queued media events',()=>{const h=harness();h.start(['one']);const old=h.played[0];old.end();h.sequence.cancel();assert.equal(h.pending.size,0);old.end();old.error();assert.equal(h.completed,0);assert.equal(h.failed,0);assert.equal(h.cancelled,1);});
test('replay invalidates stale completion and error callbacks',()=>{const h=harness();h.start(['old']);const old=h.played[0];h.start(['new']);old.end();old.error();assert.equal(h.pending.size,0);h.played[1].end();h.tick();assert.equal(h.completed,1);assert.equal(h.failed,0);});
test('media failure cancels flow and never marks question complete',()=>{const h=harness();h.start();h.played[0].error();h.played[0].end();assert.equal(h.failed,1);assert.equal(h.pending.size,0);assert.equal(h.completed,0);});

function audioCache(fetchClip){let created=0;const revoked=[],blobs=[];return {cache:new PreparedAudio(fetchClip,blob=>{blobs.push(blob);return `blob:clip-${++created}`;},url=>revoked.push(url)),revoked,blobs};}
const mp3=()=>new Response(new Uint8Array([73,68,51,1]),{status:200,headers:{'Content-Type':'audio/mpeg'}});
test('default fetch keeps the browser global receiver and prepares local audio',async t=>{
 const requests=[];
 t.mock.method(globalThis,'fetch',async function(src,options){
  assert.equal(this,globalThis,'fetch requires its browser global receiver');
  requests.push({src,options});return mp3();
 });
 const cache=new PreparedAudio();
 try{
  assert.equal(await cache.prepare(['/one','/two','/one']),true);
  assert.deepEqual(requests.map(request=>request.src),['/one','/two']);
  assert.ok(requests.every(request=>request.options.signal instanceof AbortSignal&&request.options.headers===undefined));
  assert.match(cache.get('/one'),/^blob:/);
 }finally{cache.dispose();}
});
test('default timers keep the browser global receiver through advancement and cancellation',t=>{
 let id=0,completed=0,failed=0,cancelled=0;const pending=new Map(),played=[],cleared=[];
 t.mock.method(globalThis,'setTimeout',function(fn,ms){
  assert.equal(this,globalThis,'setTimeout requires its browser global receiver');
  const key=++id;pending.set(key,{fn,ms});return key;
 });
 t.mock.method(globalThis,'clearTimeout',function(key){
  assert.equal(this,globalThis,'clearTimeout requires its browser global receiver');
  cleared.push(key);pending.delete(key);
 });
 const sequence=new PlaybackSequence();
 const play=(value,end,error)=>{played.push({value,end,error});return()=>cancelled++;};
 const start=steps=>sequence.start(steps,play,700,6000,()=>completed++,()=>failed++);
 const tick=()=>{const [key,item]=pending.entries().next().value;pending.delete(key);item.fn();return item.ms;};
 start(['one','two']);played[0].end();assert.equal(tick(),700);assert.equal(played[1].value,'two');
 played[1].end();assert.equal(tick(),6000);assert.equal(completed,1);
 start(['cancelled']);const old=played[2];old.end();const [key,item]=pending.entries().next().value;
 sequence.cancel();assert.deepEqual(cleared,[key]);assert.equal(pending.size,0);assert.equal(cancelled,2);
 item.fn();old.end();old.error();assert.equal(completed,1);assert.equal(failed,0);assert.equal(pending.size,0);
});
test('full 200 audio with no range support prepares deduplicated local URLs before use',async()=>{
 const requests=[],progress=[];const h=audioCache(async(src,options)=>{requests.push({src,options});return mp3();});
 assert.throws(()=>h.cache.get('/one'),/尚未准备/);
 assert.equal(await h.cache.prepare(['/one','/two','/one'],(done,total)=>progress.push([done,total])),true);
 assert.equal(requests.length,2);assert.equal(requests[0].options.headers,undefined);assert.ok(requests[0].options.signal);
 assert.equal(h.cache.get('/one'),'blob:clip-1');assert.equal(h.blobs[0].type,'audio/mpeg');assert.equal(h.blobs[0].size,4);assert.deepEqual(progress,[[0,2],[1,2],[2,2]]);
 h.cache.dispose();assert.deepEqual(h.revoked,['blob:clip-1','blob:clip-2']);assert.throws(()=>h.cache.get('/one'),/尚未准备/);
});
test('failed load releases partial clips and explicit retry succeeds',async()=>{
 let fail=true;const h=audioCache(async src=>{if(src==='/bad'&&fail){await new Promise(r=>setTimeout(r,0));return new Response('',{status:503});}return mp3();});
 await assert.rejects(h.cache.prepare(['/ok','/bad']),/503/);assert.deepEqual(h.revoked,['blob:clip-1']);assert.throws(()=>h.cache.get('/ok'),/尚未准备/);
 fail=false;assert.equal(await h.cache.prepare(['/ok','/bad']),true);assert.equal(h.cache.get('/bad'),'blob:clip-3');h.cache.dispose();assert.equal(h.revoked.length,3);
});
test('disposal aborts pending work and ignores stale response even when transport ignores abort',async()=>{
 let resolve,signal;const progress=[];const h=audioCache((src,options)=>{signal=options.signal;return new Promise(r=>resolve=r);});
 const preparing=h.cache.prepare(['/one'],(done,total)=>progress.push([done,total]));h.cache.dispose();assert.equal(signal.aborted,true);resolve(mp3());assert.equal(await preparing,false);assert.equal(h.blobs.length,0);assert.deepEqual(progress,[[0,1]]);await assert.rejects(h.cache.prepare(['/one']),/已取消/);
});
test('re-preparation revokes prior URLs and stale blob completion cannot replace the current voice',async()=>{
 let resolveBlob;const oldSignal=[];const h=audioCache(async(src,options)=>{oldSignal.push(options.signal);return src==='/slow'?{ok:true,blob:()=>new Promise(r=>resolveBlob=r)}:mp3();});
 await h.cache.prepare(['/ready']);const slow=h.cache.prepare(['/slow']);await Promise.resolve();assert.deepEqual(h.revoked,['blob:clip-1']);
 const fresh=h.cache.prepare(['/new']);assert.equal(oldSignal[1].aborted,true);assert.equal(await fresh,true);resolveBlob(new Blob(['old'],{type:'audio/mpeg'}));assert.equal(await slow,false);assert.equal(h.cache.get('/new'),'blob:clip-2');assert.equal(h.blobs.length,2);h.cache.dispose();assert.deepEqual(h.revoked,['blob:clip-1','blob:clip-2']);
});
test('session preparation includes only selected voice and neutral sample; missing clips remain explicit',()=>{
 const manifest={voices:[{id:'metan',sample:'/sample'},{id:'other',sample:'/other-sample'}],clips:{'第1問。':{metan:'/number',other:'/other-number'},'かな。':{metan:'/reading'},'例。':{metan:'/example'}}};
 assert.deepEqual(sessionClips(manifest,'metan',[{reading:'かな',example:'例。'}]),['/sample','/number','/reading','/example']);assert.throws(()=>sessionClips(manifest,'other',[{reading:'かな'}]),/尚未生成/);
});
test('non-audio and empty responses fail explicitly without publishing URLs',async()=>{
 for(const response of [new Response('<html>sign in</html>',{headers:{'Content-Type':'text/html'}}),new Response('',{headers:{'Content-Type':'audio/mpeg'}})]){const h=audioCache(async()=>response);await assert.rejects(h.cache.prepare(['/clip']),/有效的语音/);assert.equal(h.blobs.length,0);}
});
