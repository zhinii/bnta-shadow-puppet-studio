import {readFile,mkdir,writeFile,copyFile} from 'node:fs/promises';
const files=['index.html','style.css','app.mjs','model.mjs','render.mjs','agent.mjs'];
const assets={};for(const file of files)assets['/'+file]=await readFile(new URL('../public/'+file,import.meta.url),'utf8');
let model=assets['/model.mjs'].replace(/^export /gm,'');
let agent=assets['/agent.mjs'].replace(/^import .*?;\r?\n/gm,'').replace(/^export /gm,'');
let api=(await readFile(new URL('../server/api.mjs',import.meta.url),'utf8')).replace(/^import .*?;\r?\n/gm,'').replace(/^export /gm,'');
const code=model+'\n'+agent+'\n'+api+'\nconst ASSETS='+JSON.stringify(assets)+';\n'+`export default {async fetch(request,env){const url=new URL(request.url);if(url.pathname.startsWith('/api/'))return handleApi(request,env);if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});const path=url.pathname==='/'?'/index.html':url.pathname,body=ASSETS[path];if(body===undefined)return new Response('Not found',{status:404});return new Response(request.method==='HEAD'?null:body,{headers:{'Content-Type':path.endsWith('.html')?'text/html; charset=utf-8':path.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8','X-Content-Type-Options':'nosniff','Cache-Control':'no-cache','Referrer-Policy':'strict-origin-when-cross-origin'}});}};`;
await mkdir(new URL('../dist/server/',import.meta.url),{recursive:true});await mkdir(new URL('../dist/.openai/',import.meta.url),{recursive:true});
await writeFile(new URL('../dist/server/index.js',import.meta.url),code);await copyFile(new URL('../.openai/hosting.json',import.meta.url),new URL('../dist/.openai/hosting.json',import.meta.url));
console.log('Built dependency-free Worker and '+files.length+' embedded assets.');
const stripModule=source=>source.replace(/^import .*?;\r?\n/gm,'').replace(/^export /gm,'');
const offlineJs=stripModule(assets['/model.mjs'])+'\nconst e=escapeXml;\n'+stripModule(assets['/render.mjs'])+'\n'+stripModule(assets['/agent.mjs'])+'\n'+stripModule(assets['/app.mjs']);
// Parse the combined source so a duplicate identifier cannot break the offline copy.
new Function(offlineJs);
const offline=assets['/index.html'].replace('<link rel="stylesheet" href="./style.css">',()=>'<style>'+assets['/style.css']+'</style>').replace('<script type="module" src="./app.mjs"></script>',()=>'<script type="module">'+offlineJs.replace(/<\/script/gi,'<\\/script')+'</script>');
await writeFile(new URL('../START-HERE.html',import.meta.url),offline);
console.log('Built START-HERE.html: self-contained manual editor, with the same protected AI connection.');
// Commit this entry page so GitHub Pages can serve main / (root) without a build workflow.
const pages=assets['/index.html'].replace('href="./style.css"','href="./public/style.css"').replace('src="./app.mjs"','src="./public/app.mjs"');
await writeFile(new URL('../index.html',import.meta.url),pages);
await writeFile(new URL('../.nojekyll',import.meta.url),'');
console.log('Updated repository-root entry for branch-based GitHub Pages.');
