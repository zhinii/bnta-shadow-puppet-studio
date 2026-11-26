import assert from 'node:assert/strict';
import {readFile,readdir,access} from 'node:fs/promises';
import {dirname,resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=path=>readFile(resolve(root,path),'utf8');
const exists=path=>access(resolve(root,path)).then(()=>true,()=>false);
const pages=await read('index.html'),entry=await read('dist/index.html'),portable=await read('START-HERE.html');
assert.match(pages,/href="\.\/public\/classroom\.css\?v=0\.10\.0"/);
assert.match(pages,/src="\.\/public\/classroom-app\.mjs\?v=0\.10\.0"/);
assert.match(entry,/src="\.\/classroom-app\.mjs\?v=0\.10\.0"/);
for(const file of ['classroom-client.mjs','server/index.js','.openai/hosting.json'])assert.equal(await exists('dist/'+file),false,'Static distribution must not contain '+file);

// Walk the actual static import graph, including the embedded puppet editor.
// Missing assets or accidental server imports would break GitHub Pages startup.
const seen=new Set();
async function walk(path){
  path=resolve(root,path);if(seen.has(path))return;seen.add(path);
  const source=await readFile(path,'utf8');
  assert.ok(source.length>0,relative(root,path));
  for(const match of source.matchAll(/^\s*import\s+[^;\n]+from\s*['"]([^'"]+)['"]/gm)){
    assert.ok(match[1].startsWith('.'),'Static modules must use local browser imports: '+match[1]);
    const dependency=resolve(dirname(path),match[1].split(/[?#]/,1)[0]);
    assert.ok(dependency.startsWith(resolve(root,'dist')),'Browser module imported outside static distribution');
    await walk(dependency);
  }
}
await walk('dist/classroom-app.mjs');await walk('dist/studio-app.mjs');
for(const file of await readdir(resolve(root,'dist'))){
  if(!/\.(html|mjs|css)$/.test(file))continue;
  const source=await read('dist/'+file);
  assert.doesNotMatch(source,/bnta-shadow-puppet-studio\.zhinii\.chatgpt\.site|\/api\/classroom|signin-with-chatgpt/,'Static asset retained shared-service dependency: '+file);
}
assert.doesNotMatch(portable,/<script\b[^>]*\bsrc=/i,'Portable puppet studio embeds its module script.');
assert.doesNotMatch(portable,/<link\b[^>]*href="\.\/studio\.css/i,'Portable puppet studio embeds its stylesheet.');
assert.match(portable,/function clearStoredStudioSession/);
assert.match(portable,/https:\/\/zhinii\.github\.io\/bnta-shadow-puppet-studio\/public\/legacy\.html\?v=0\.10\.0/);
assert.doesNotMatch(portable,/new URL\('\.\/legacy\.html/);
assert.match(await read('dist/studio.html'),/studio-app\.mjs/);
console.log('Static smoke check passed: GitHub entry, '+seen.size+' browser modules, JSON workflow assets and portable puppet editor; no classroom service or database dependencies.');
