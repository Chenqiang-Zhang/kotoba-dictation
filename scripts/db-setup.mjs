import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
// Wrangler and the Vite Cloudflare plugin both use state/v3/d1 and this UUID.
const root=fileURLToPath(new URL('..',import.meta.url));
await mkdir(resolve(root,'.wrangler'),{recursive:true});
const config=resolve(root,'.wrangler/local-db.json');
await writeFile(config,JSON.stringify({name:'kotoba-dictation-local',compatibility_date:'2026-05-15',d1_databases:[{binding:'DB',database_name:'kotoba-dictation-local',database_id:'00000000-0000-4000-8000-000000000000',migrations_dir:'../drizzle'}]},null,2));
const result=spawnSync(process.execPath,[resolve(root,'node_modules/wrangler/bin/wrangler.js'),'d1','migrations','apply','DB','--local','--persist-to',resolve(root,process.env.KOTOBA_STATE_PATH??'.wrangler/state'),'--config',config],{cwd:root,stdio:'inherit',env:{...process.env,WRANGLER_SEND_METRICS:'false',CLOUDFLARE_CF_FETCH_ENABLED:'false'}});
if(result.error)throw result.error;
process.exit(result.status??1);
