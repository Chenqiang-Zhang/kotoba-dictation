import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

// A fresh isolated local DB: this check never modifies the owner's study data.
const root=fileURLToPath(new URL('..',import.meta.url));
const state=await mkdtemp(resolve(tmpdir(),'kotoba-acceptance-'));
const port=Number(process.env.KOTOBA_TEST_PORT??5187);
const base=`http://127.0.0.1:${port}`;
const env={...process.env,KOTOBA_STATE_PATH:state,WRANGLER_SEND_METRICS:'false',CLOUDFLARE_CF_FETCH_ENABLED:'false'};
let server,output='';
async function stop(){if(!server)return;const child=server;server=null;child.kill('SIGTERM');await Promise.race([new Promise(r=>child.once('exit',r)),delay(5000).then(()=>child.kill('SIGKILL'))]);}
async function start(){
 output='';server=spawn(process.execPath,[resolve(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',String(port)],{cwd:root,env,stdio:['ignore','pipe','pipe']});
 for(const stream of [server.stdout,server.stderr])stream.on('data',chunk=>{output=(output+chunk).slice(-16000);});
 for(let i=0;i<150;i++){
  if(server.exitCode!==null)throw new Error('Local server exited: '+output);
  try{if((await fetch(base+'/signin-with-chatgpt',{redirect:'manual'})).status===302)return;}catch{}
  await delay(200);
 }
 throw new Error('Local server did not start: '+output);
}
try{
 const setup=spawnSync(process.execPath,[resolve(root,'scripts/db-setup.mjs')],{cwd:root,env,encoding:'utf8'});
 assert.equal(setup.status,0,setup.stdout+setup.stderr);
 await start();
 const signIn=await fetch(base+'/signin-with-chatgpt?return_to=/',{redirect:'manual'});
 assert.equal(signIn.status,302);assert.ok(signIn.headers.get('set-cookie'));
 const headers={cookie:signIn.headers.get('set-cookie').split(';')[0],'content-type':'application/json'};
 async function call(path,body,status=200,override=headers){
  const response=await fetch(base+path,{headers:override,method:body===undefined?'GET':'POST',body:body===undefined?undefined:JSON.stringify(body)});
  const data=await response.json();assert.equal(response.status,status,JSON.stringify(data));return data;
 }
 for(const path of ['/api/state','/api/import'])await call(path,undefined,401,{'x-kotoba-sync':'moji-local'});
 const replacement={source:'Acceptance replacement',words:[{sourceId:'qa-one',word:'言葉',reading:'ことば',meaning:'word'}]};
 await call('/api/import',replacement,401,{'x-kotoba-sync':'moji-local','content-type':'application/json'});
 const spoof={'oai-authenticated-user-id':'forged','oai-authenticated-user-email':'forged@example.test','content-type':'application/json'};
 await call('/api/state',undefined,401,spoof);await call('/api/import',replacement,401,spoof);
 const initial=await call('/api/state');
 assert.equal(initial.words.length,20);assert.equal(initial.session.words.length,20);assert.equal(initial.events.length,0);assert.equal(initial.session.completed,0);
 const marks=initial.session.words.map((w,i)=>({wordId:w.sourceId,wrong:i===0,...(i===0?{category:'汉字',incorrectWriting:'誤答',note:'local acceptance'}:{})}));
 const grade={sessionId:initial.session.id,submissionId:crypto.randomUUID(),marks};
 await call('/api/session',{id:initial.session.id,progress:3});
 await call('/api/grade',grade,401,spoof);
 await call('/api/grade',grade);await call('/api/grade',grade);
 const saved=await call('/api/state');assert.equal(saved.events.length,20);assert.equal(saved.session.progress,3);assert.equal(saved.session.completed,1);
 const correction={...grade,submissionId:crypto.randomUUID(),correction:true,marks:marks.map(m=>({...m,wrong:false}))};
 await call('/api/grade',correction);await call('/api/grade',correction);
 const corrected=await call('/api/state');assert.equal(corrected.events.length,40);assert.equal(corrected.events.filter(e=>e.wrong).length,1);
 await stop();await start();
 const restarted=await call('/api/state');assert.deepEqual(restarted,corrected);
 const before=await call('/api/import');
 for(const bad of [{...replacement,words:[...replacement.words,...replacement.words]},{...replacement,words:[replacement.words[0],{...replacement.words[0],sourceId:'second',meaning:''}]},{...replacement,words:[{...replacement.words[0],sourceScore:101}]},{...replacement,mode:'oops'}]){
  await call('/api/import',bad,400);assert.deepEqual(await call('/api/import'),before);assert.deepEqual((await call('/api/state')).words,initial.words);
 }
 const imported=await call('/api/import',{...replacement,importedAt:'1999-01-01T00:00:00Z'});
 assert.equal(imported.imported,1);assert.equal(imported.count,1);assert.equal(imported.metadata.source,replacement.source);assert.notEqual(imported.metadata.importedAt,'1999-01-01T00:00:00Z');assert.equal(imported.metadata.coverage.imported,1);
 const replaced=await call('/api/state');assert.equal(replaced.words.length,1);assert.equal(replaced.words[0].sourceScore,null);assert.equal(replaced.words[0].learnedAt,null);assert.deepEqual(replaced.session,corrected.session);assert.deepEqual(replaced.events,corrected.events);
 const merged=await call('/api/import',{source:'Acceptance merge',mode:'merge',words:[{...replacement.words[0],sourceId:'qa-two'}]});assert.equal(merged.count,2);
 await call('/api/import',{source:'Acceptance empty',words:[]});assert.equal((await call('/api/state')).words.length,0);
 await stop();await start();const persisted=await call('/api/state');assert.equal(persisted.words.length,0);assert.deepEqual(persisted.session,corrected.session);assert.deepEqual(persisted.events,corrected.events);
 const signOut=await fetch(base+'/signout-with-chatgpt',{headers,redirect:'manual'});assert.equal(signOut.status,302);assert.match(signOut.headers.get('set-cookie'),/Max-Age=0/);
 console.log(JSON.stringify({ok:true,initialWords:20,initialEvents:0,auth:'cookie login; anonymous, forged identity and forged sync marker denied',grading:'idempotent with append-only corrections',imports:'validated atomically; replace/merge; preserved snapshots and grades',restart:'catalog, metadata, session, progress and grades persisted',dataScope:'fresh isolated local DB'}));
}catch(error){console.error(output);throw error;}
finally{await stop();await rm(state,{recursive:true,force:true});}
