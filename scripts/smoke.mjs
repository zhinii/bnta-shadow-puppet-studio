import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import worker from '../dist/server/index.js';
for(const [path,type] of [['/','text/html'],['/legacy.html','text/html'],['/app.mjs','text/javascript'],['/model.mjs','text/javascript'],['/render.mjs','text/javascript'],['/agent.mjs','text/javascript'],['/style.css','text/css'],['/studio-app.mjs','text/javascript'],['/studio-model.mjs','text/javascript'],['/studio-render.mjs','text/javascript'],['/studio-ai.mjs','text/javascript'],['/studio-storage.mjs','text/javascript'],['/studio-starters.mjs','text/javascript'],['/studio.css','text/css'],['/studio-parametric.mjs','text/javascript'],['/studio-image-tools.mjs','text/javascript'],['/studio-construction.mjs','text/javascript'],['/studio-joint-plan.mjs','text/javascript'],['/studio-joint-ai.mjs','text/javascript'],['/studio-joint-markers.mjs','text/javascript']]){
 const response=await worker.fetch(new Request('https://studio.test'+path),{});
 assert.equal(response.status,200,path);assert.ok(response.headers.get('content-type').startsWith(type));assert.ok((await response.text()).length>100);
}
assert.equal((await worker.fetch(new Request('https://studio.test/not-found'),{})).status,404);
const status=await(await worker.fetch(new Request('https://studio.test/api/status'),{})).json();
assert.equal(status.relay,true);assert.equal(status.configured,false);
const studioStatus=await(await worker.fetch(new Request('https://studio.test/api/studio/status'),{})).json();
assert.equal(studioStatus.version,2);assert.equal(studioStatus.text,false);assert.equal(studioStatus.imageGeneration,false);
const preflight=await worker.fetch(new Request('https://studio.test/api/studio',{method:'OPTIONS',headers:{Origin:'https://zhinii.github.io'}}),{});assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),'https://zhinii.github.io');
assert.equal((await worker.fetch(new Request('https://studio.test/api/studio',{method:'POST',headers:{Origin:'https://untrusted.test'}}),{})).status,403);
const viewport=await worker.fetch(new Request('https://studio.test/studio-viewport.mjs'),{});assert.equal(viewport.status,200);assert.match(await viewport.text(),/zoomViewBox/);
const uiState=await worker.fetch(new Request('https://studio.test/studio-ui-state.mjs'),{});assert.equal(uiState.status,200);assert.match(await uiState.text(),/captureUIState/);
for(const path of ['/studio-app.mjs?v=0.7.4','/studio-storage.mjs?v=0.7.4','/studio-render.mjs?v=0.7.4','/studio.css?v=0.7.4'])assert.equal((await worker.fetch(new Request('https://studio.test'+path),{})).status,200,path);
const portable=await readFile(new URL('../START-HERE.html',import.meta.url),'utf8'),pages=await readFile(new URL('../index.html',import.meta.url),'utf8'),legacy=await readFile(new URL('../public/legacy.html',import.meta.url),'utf8');
assert.doesNotMatch(portable,/<script\b[^>]*\bsrc=/i,'Portable studio must embed its module script even when the source URL has a version query.');
assert.doesNotMatch(portable,/<link\b[^>]*href="\.\/studio\.css/i,'Portable studio must embed its stylesheet.');
assert.match(portable,/function clearStoredStudioSession/,'Versioned storage import must be linked into the portable app.');
assert.match(portable,/https:\/\/zhinii\.github\.io\/bnta-shadow-puppet-studio\/public\/legacy\.html\?v=0\.7\.4/);
assert.doesNotMatch(portable,/new URL\('\.\/legacy\.html/,'Portable classic-editor navigation must not depend on import.meta.url.');
assert.match(pages,/href="\.\/public\/studio\.css\?v=0\.7\.4"/);
assert.match(pages,/src="\.\/public\/studio-app\.mjs\?v=0\.7\.4"/);
assert.match(legacy,/src="\.\/app\.mjs\?v=0\.7\.4"/);
console.log('Built Worker smoke test passed: 22 assets, versioned entry/dependencies, standalone portable HTML, both API status routes, CORS and missing route.');
