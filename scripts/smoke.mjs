import assert from 'node:assert/strict';
import worker from '../dist/server/index.js';
for(const [path,type] of [['/','text/html'],['/app.mjs','text/javascript'],['/model.mjs','text/javascript'],['/render.mjs','text/javascript'],['/agent.mjs','text/javascript'],['/style.css','text/css']]){
 const response=await worker.fetch(new Request('https://studio.test'+path),{});
 assert.equal(response.status,200,path);assert.ok(response.headers.get('content-type').startsWith(type));assert.ok((await response.text()).length>100);
}
assert.equal((await worker.fetch(new Request('https://studio.test/not-found'),{})).status,404);
const status=await(await worker.fetch(new Request('https://studio.test/api/status'),{})).json();
assert.equal(status.relay,true);assert.equal(status.configured,false);
console.log('Built Worker smoke test passed: six assets, missing route, API status.');
