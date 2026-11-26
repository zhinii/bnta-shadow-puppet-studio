import {readFile,mkdir,writeFile,copyFile,readdir,rm} from 'node:fs/promises';
import {resolve,dirname,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
const files=(await readdir(resolve(root,'public'))).filter(f=>/\.(html|mjs|css)$/.test(f));
const assets={};for(const file of files)assets['/'+file]=await readFile(resolve(root,'public',file),'utf8');

// Small static linker: keep module scopes separate in the portable puppet HTML.
// All imports are our checked-in local named ES modules. No runtime eval/imports.
async function bundle(entries){
 const modules=new Map(),chunks=[];
 async function visit(path){
  path=resolve(root,path);if(modules.has(path))return modules.get(path);
  const name='__module'+modules.size;modules.set(path,name);
  let source=await readFile(path,'utf8');
  const imports=[...source.matchAll(/^import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?\s*$/gm)];
  for(const match of imports){if(!match[2].startsWith('.'))throw Error('Only local imports are supported in '+path);const localPath=match[2].split(/[?#]/,1)[0];const dependency=await visit(resolve(dirname(path),localPath));const names=match[1].replace(/\b(\w+)\s+as\s+(\w+)/g,'$1:$2');source=source.replace(match[0],'const {'+names+'}='+dependency+';');}
  const exports=[...source.matchAll(/^export\s+(?:async\s+)?(?:function|const|let|class)\s+(\w+)/gm)].map(m=>m[1]);
  source=source.replace(/^export\s+/gm,'');
  chunks.push('// '+relative(root,path).split(sep).join('/')+'\nconst '+name+'=(()=>{\n'+source+'\nreturn {'+exports.join(',')+'};\n})();');return name;
 }
 const names=[];for(const entry of entries)names.push(await visit(entry));return {source:chunks.join('\n'),names};
}
function check(source){const result=spawnSync(process.execPath,['--check','--input-type=module'],{input:source,encoding:'utf8'});if(result.status!==0)throw Error(result.stderr||'Bundle syntax check failed.');}
// The shipped platform is static. Rebuilding cannot leave an old server bundle
// or database declaration behind in the distributable directory.
const output=resolve(root,'dist');
if(output!==resolve(root)+sep+'dist')throw Error('Invalid build output directory.');
await rm(output,{recursive:true,force:true});await mkdir(output,{recursive:true});
for(const file of files)await copyFile(resolve(root,'public',file),resolve(output,file));
await writeFile(resolve(output,'.nojekyll'),'');
console.log('Built static distribution with '+files.length+' browser assets; no database or application server required.');
const app=await bundle(['public/studio-app.mjs']);check(app.source);
const portableScript=app.source.replace("new URL('./legacy.html?v=0.10.0',import.meta.url).href","'https://zhinii.github.io/bnta-shadow-puppet-studio/public/legacy.html?v=0.10.0'");
const offline=assets['/studio.html'].replace(/<link rel="stylesheet" href="\.\/studio\.css(?:[?#][^"]*)?">/,()=>'<style>'+assets['/studio.css']+'</style>').replace(/<script type="module" src="\.\/studio-app\.mjs(?:[?#][^"]*)?"><\/script>/,()=>'<script type="module">'+portableScript.replace(/<\/script/gi,'<\\/script')+'</script>');
await writeFile(resolve(root,'START-HERE.html'),offline);
const pages=assets['/index.html'].replace('href="./classroom.css','href="./public/classroom.css').replace('src="./classroom-app.mjs','src="./public/classroom-app.mjs');
await writeFile(resolve(root,'index.html'),pages);await writeFile(resolve(root,'.nojekyll'),'');
console.log('Built portable studio and GitHub Pages entry.');
