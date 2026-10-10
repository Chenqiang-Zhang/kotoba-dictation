export type Word = {sourceId:string;word:string;reading:string;meaning:string;example:string|null;exampleSource:string|null;sourceScore:number|null;sourceCycle:number|null;learnedAt:string|null;observedAt:string|null};
export type Mark = {wordId:string;wrong:boolean;category?:string;incorrectWriting?:string;note?:string};
export type Event = Mark & {id:string;sessionId:string;attemptDay:string;createdAt:string;sequence?:number};
export function jstDay(date = new Date()) { return new Date(date.getTime()+9*3600000).toISOString().slice(0,10); }
export function addDays(day:string,n:number) { return new Date(Date.parse(day+'T00:00:00Z')+n*86400000).toISOString().slice(0,10); }
export function recompute(events:Event[]) {
 const latest = new Map<string,Event>();
 for (const e of [...events].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||(a.sequence??0)-(b.sequence??0)||a.id.localeCompare(b.id))) latest.set(e.sessionId,e);
 let streak=0, due:string|null=null, wrong=false, mistakes=0;
 const timeline=[...latest.values()].sort((a,b)=>a.attemptDay.localeCompare(b.attemptDay)||a.createdAt.localeCompare(b.createdAt));
 for(const e of timeline) { if(e.wrong){streak=0;wrong=true;mistakes++;due=addDays(e.attemptDay,1);} else if(wrong){due=addDays(e.attemptDay,[3,7,14,30][Math.min(streak,3)]);streak++;} }
 return {streak,due,wrong:timeline.at(-1)?.wrong??false,mistakes,timeline};
}
export function selectBatch(words:Word[],events:Event[],day:string) {
 const unique=words.filter((w,i,all)=>all.findIndex(x=>x.sourceId===w.sourceId)===i);
 const states=new Map(unique.map(w=>[w.sourceId,recompute(events.filter(e=>e.wordId===w.sourceId))]));
 const due=unique.filter(w=>{const s=states.get(w.sourceId)!;return s.due&&s.due<=day;}).sort((a,b)=>states.get(a.sourceId)!.due!.localeCompare(states.get(b.sourceId)!.due!)||a.sourceId.localeCompare(b.sourceId));
 const scoreOrder=(a:Word,b:Word)=>(a.sourceScore??100)-(b.sourceScore??100)||(b.learnedAt??b.observedAt??'').localeCompare(a.learnedAt??a.observedAt??'')||a.sourceId.localeCompare(b.sourceId);
 const lastAttempt=(w:Word)=>states.get(w.sourceId)!.timeline.at(-1)?.attemptDay??'';
 const fresh=unique.filter(w=>!states.get(w.sourceId)!.due).sort((a,b)=>{
   const aDay=lastAttempt(a),bDay=lastAttempt(b);
   if(!aDay&&bDay)return -1;if(aDay&&!bDay)return 1;
   return aDay.localeCompare(bDay)||scoreOrder(a,b);
 });
 const primaryDue=due.slice(0,8);
 // Fresh/unseen words rotate ahead of already successful words. Only supplement
 // beyond eight due words when there are too few eligible fresh words.
 return [...primaryDue,...fresh,...due.slice(8)].slice(0,20);
}
export function authenticatedIdentity(h:Headers){return h.get('oai-authenticated-user-id')&&h.get('oai-authenticated-user-email')?h.get('oai-authenticated-user-id'):null;}

export function serviceImportAllowed(authenticated:boolean,_headers:Headers){return authenticated;}
export function validSubmission(value:unknown):value is {sessionId:string;submissionId:string;marks:Mark[];correction?:boolean}{
 if(!value||typeof value!=='object')return false;
 const v=value as Record<string,unknown>;
 if(typeof v.sessionId!=='string'||typeof v.submissionId!=='string'||!v.submissionId||v.submissionId.length>100||!Array.isArray(v.marks)||v.marks.length>20||(v.correction!==undefined&&typeof v.correction!=='boolean'))return false;
 return v.marks.every(m=>m&&typeof m.wordId==='string'&&m.wordId.length<=300&&typeof m.wrong==='boolean'&&(m.category===undefined||['','想不起来','听辨','汉字'].includes(m.category))&&(m.incorrectWriting===undefined||(typeof m.incorrectWriting==='string'&&m.incorrectWriting.length<=300))&&(m.note===undefined||(typeof m.note==='string'&&m.note.length<=2000)));
}

export type ImportPayload = { source:string; words:Word[]; mode:'replace'|'merge' };
const isRecord = (v:unknown):v is Record<string,unknown> => !!v && typeof v==='object' && !Array.isArray(v);
function text(v:unknown,max:number,required=false):string|null {
 if(v===undefined||v===null){if(required)throw new Error('Required text is missing');return null;}
 if(typeof v!=='string'||v.length>max||(required&&!v.trim()))throw new Error('Invalid text field');
 return v;
}
function timestamp(v:unknown):string|null {
 if(v===undefined||v===null)return null;
 if(typeof v!=='string'||v.length>40||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(v)||!Number.isFinite(Date.parse(v)))throw new Error('Invalid timestamp');
 const date=v.slice(0,10);if(new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw new Error('Invalid calendar date');return v;
}
function boundedNumber(v:unknown,max:number,integer=false):number|null {
 if(v===undefined||v===null)return null;
 if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>max||(integer&&!Number.isInteger(v)))throw new Error('Invalid study number');return v;
}
export function validateImport(value:unknown):ImportPayload {
 if(!isRecord(value)||!Array.isArray(value.words)||value.words.length>10000)throw new Error('Invalid import format');
 const source=text(value.source,200,true)!;
 const mode=value.mode??'replace';if(mode!=='replace'&&mode!=='merge')throw new Error('Invalid import mode');
 const ids=new Set<string>();
 const words=value.words.map((v:unknown)=>{
  if(!isRecord(v))throw new Error('Invalid word');
  const sourceId=text(v.sourceId,300,true)!;if(ids.has(sourceId))throw new Error('Duplicate sourceId');ids.add(sourceId);
  return {sourceId,word:text(v.word,300,true)!,reading:text(v.reading,300,true)!,meaning:text(v.meaning,2000,true)!,example:text(v.example,2000),exampleSource:text(v.exampleSource,300),sourceScore:boundedNumber(v.sourceScore,100),sourceCycle:boundedNumber(v.sourceCycle,10000,true),learnedAt:timestamp(v.learnedAt),observedAt:timestamp(v.observedAt)};
 });
 return {source,mode,words};
}
