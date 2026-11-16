import {readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
for(const folder of ['public','server','scripts'])for(const file of await readdir(new URL('../'+folder+'/',import.meta.url))){if(!file.endsWith('.mjs'))continue;const result=spawnSync(process.execPath,['--check',fileURLToPath(new URL('../'+folder+'/'+file,import.meta.url))],{encoding:'utf8'});if(result.status!==0){console.error(result.stderr);process.exit(1);}}
const result=spawnSync(process.execPath,['--check',fileURLToPath(new URL('../server.mjs',import.meta.url))],{encoding:'utf8'});if(result.status!==0){console.error(result.stderr);process.exit(1);}
console.log('All application, server and build modules parse.');
