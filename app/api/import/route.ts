import {db,identity,ingest,failure,ensureSeed} from '../../lib/store';
export async function GET(){try{
 await identity();await ensureSeed();
 const metadata=await db().prepare("SELECT value FROM settings WHERE key='import'").first<{value:string}>();
 const count=await db().prepare('SELECT count(*) AS count FROM catalog').first<{count:number}>();
 return Response.json({count:count?.count??0,metadata:metadata?JSON.parse(metadata.value):null});
}catch(e){return failure(e);}}
export async function POST(req:Request){try{await identity();return Response.json(await ingest(await req.json()));}catch(e){return failure(e);}}
