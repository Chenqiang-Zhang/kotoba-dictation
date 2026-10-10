import { env } from 'cloudflare:workers';
import seed from '../../data/sample-words.json';
import { getChatGPTUser } from '../chatgpt-auth';
import { jstDay, selectBatch, validateImport, type Word, type Event } from './domain';
export function db(){if(!env.DB)throw new Error('云端数据库尚未连接');return env.DB;}
export async function identity(){const u=await getChatGPTUser();if(!u)throw new Error('UNAUTHORIZED');return u.userId;}
export async function ingest(value:unknown){
 const data=validateImport(value);
 const importedAt=new Date().toISOString();
 const metadata={source:data.source,importedAt,coverage:{imported:data.words.length}};
 // One D1 batch is transactional: catalog and receipt change together.
 const statements=[];
 if(data.mode==='replace')statements.push(db().prepare('DELETE FROM catalog'));
 for(const w of data.words)statements.push(db().prepare('INSERT INTO catalog(id,payload) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').bind(w.sourceId,JSON.stringify(w)));
 statements.push(db().prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind('import',JSON.stringify(metadata)));
 await db().batch(statements);
 const row=await db().prepare('SELECT count(*) AS count FROM catalog').first<{count:number}>();
 return {imported:data.words.length,count:row?.count??0,metadata};
}
export async function ensureSeed(){const row=await db().prepare("SELECT value FROM settings WHERE key='import'").first();if(!row)await ingest(seed);}
export async function catalogWords(){await ensureSeed();const r=await db().prepare('SELECT payload FROM catalog').all<{payload:string}>();return r.results.map(x=>JSON.parse(x.payload) as Word);}
export async function eventsFor(user:string){const r=await db().prepare('SELECT rowid AS sequence, * FROM grade_events WHERE user_id=? ORDER BY created_at,rowid').bind(user).all<any>();return r.results.map(x=>({...JSON.parse(x.payload),id:x.id,sessionId:x.session_id,attemptDay:x.attempt_day,createdAt:x.created_at,sequence:x.sequence})) as Event[];}
export async function today(user:string){const day=jstDay();const id=user+':'+day;const existing=await db().prepare('SELECT * FROM sessions WHERE id=? AND user_id=?').bind(id,user).first<any>();if(existing&&(JSON.parse(existing.words).length||existing.progress||existing.completed))return {...existing,words:JSON.parse(existing.words)};
 const words=selectBatch(await catalogWords(),await eventsFor(user),day);
 if(existing&&words.length)await db().prepare("UPDATE sessions SET words=? WHERE id=? AND user_id=? AND words='[]' AND progress=0 AND completed=0").bind(JSON.stringify(words),id,user).run();
 await db().prepare('INSERT OR IGNORE INTO sessions(id,user_id,day,words) VALUES(?,?,?,?)').bind(id,user,day,JSON.stringify(words)).run();const saved=await db().prepare('SELECT * FROM sessions WHERE id=? AND user_id=?').bind(id,user).first<any>();return {...saved,words:JSON.parse(saved.words)};}
export function failure(e:unknown){const message=e instanceof Error?e.message:'操作失败';return Response.json({error:message==='UNAUTHORIZED'?'请先登录':message},{status:message==='UNAUTHORIZED'?401:400});}
