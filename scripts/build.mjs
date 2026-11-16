import {readFile,mkdir,writeFile,copyFile,readdir} from 'node:fs/promises';
import {resolve,dirname,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
const files=(await readdir(resolve(root,'public'))).filter(f=>/\.(html|mjs|css)$/.test(f));
const assets={};for(const file of files)assets['/'+file]=await readFile(resolve(root,'public',file),'utf8');

// Small static linker: keep module scopes separate in the portable HTML/Worker.
// All imports are our checked-in local named ES modules. No runtime eval/imports.
async function bundle(entries){
 const modules=new Map(),chunks=[];
 async function visit(path){
  path=resolve(root,path);if(modules.has(path))return modules.get(path);
  const name='__module'+modules.size;modules.set(path,name);
  let source=await readFile(path,'utf8');
  const imports=[...source.matchAll(/^import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?\s*$/gm)];
  for(const match of imports){if(!match[2].startsWith('.'))throw Error('Only local imports are supported in '+path);const dependency=await visit(resolve(dirname(path),match[2]));const names=match[1].replace(/\b(\w+)\s+as\s+(\w+)/g,'$1:$2');source=source.replace(match[0],'const {'+names+'}='+dependency+';');}
  const exports=[...source.matchAll(/^export\s+(?:async\s+)?(?:function|const|let|class)\s+(\w+)/gm)].map(m=>m[1]);
  source=source.replace(/^export\s+/gm,'');
  chunks.push('// '+relative(root,path).split(sep).join('/')+'\nconst '+name+'=(()=>{\n'+source+'\nreturn {'+exports.join(',')+'};\n})();');return name;
 }
 const names=[];for(const entry of entries)names.push(await visit(entry));return {source:chunks.join('\n'),names};
}
function check(source){const result=spawnSync(process.execPath,['--check','--input-type=module'],{input:source,encoding:'utf8'});if(result.status!==0)throw Error(result.stderr||'Bundle syntax check failed.');}
const server=await bundle(['server/api.mjs','server/studio-api.mjs']);
const code=server.source+'\nconst ASSETS='+JSON.stringify(assets)+';\n'+`export default {async fetch(request,env){const url=new URL(request.url);if(url.pathname.startsWith('/api/studio'))return ${server.names[1]}.handleStudioApi(request,env);if(url.pathname.startsWith('/api/'))return ${server.names[0]}.handleApi(request,env);if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});const path=url.pathname==='/'?'/index.html':url.pathname,body=ASSETS[path];if(body===undefined)return new Response('Not found',{status:404});return new Response(request.method==='HEAD'?null:body,{headers:{'Content-Type':path.endsWith('.html')?'text/html; charset=utf-8':path.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8','X-Content-Type-Options':'nosniff','Cache-Control':'no-cache','Referrer-Policy':'strict-origin-when-cross-origin'}});}};`;
check(code);
await mkdir(resolve(root,'dist/server'),{recursive:true});await mkdir(resolve(root,'dist/.openai'),{recursive:true});
await writeFile(resolve(root,'dist/server/index.js'),code);await copyFile(resolve(root,'.openai/hosting.json'),resolve(root,'dist/.openai/hosting.json'));
console.log('Built dependency-free Worker and '+files.length+' embedded assets.');
const app=await bundle(['public/studio-app.mjs']);check(app.source);
const portableScript=app.source.replace("new URL('./legacy.html',import.meta.url).href","'https://zhinii.github.io/bnta-shadow-puppet-studio/public/legacy.html'");
const offline=assets['/index.html'].replace('<link rel="stylesheet" href="./studio.css">',()=>'<style>'+assets['/studio.css']+'</style>').replace('<script type="module" src="./studio-app.mjs"></script>',()=>'<script type="module">'+portableScript.replace(/<\/script/gi,'<\\/script')+'</script>');
await writeFile(resolve(root,'START-HERE.html'),offline);
const pages=assets['/index.html'].replace('href="./studio.css"','href="./public/studio.css"').replace('src="./studio-app.mjs"','src="./public/studio-app.mjs"');
await writeFile(resolve(root,'index.html'),pages);await writeFile(resolve(root,'.nojekyll'),'');
console.log('Built portable studio and GitHub Pages entry.');
