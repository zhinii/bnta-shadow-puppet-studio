import test from 'node:test';
import assert from 'node:assert/strict';
import {handleApi} from '../server/api.mjs';
import {PLAN_RELAY,IMAGE_RELAY,planRelayEndpoint,imageRelayEndpoint,studioEndpoint,getStudioCapabilities} from '../public/studio-ai.mjs';
import {requestClassroomHelp,requestStageImage} from '../public/classroom-ai.mjs';
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN8cAAAAASUVORK5CYII=';
const imageRequest=(body={},headers={})=>new Request('https://classroom.test/api/puppet/image',{method:'POST',headers:{'Content-Type':'application/json','cf-connecting-ip':crypto.randomUUID(),...headers},body:JSON.stringify({application:'shadow-puppet-studio',kind:'reference',prompt:'A quiet mountain stage',...body})});

test('hosted image proxy forwards only validated fields to its pinned relay and strips credentials',async()=>{
  let calls=0;
  const r=await handleApi(imageRequest({endpoint:'http://127.0.0.1/admin',token:'private-class-token',reference:'https://private/file'},{Authorization:'Bearer private-auth','oai-authenticated-user-id':'private-person',Origin:'https://classroom.test'}),{ALIBABA_API_KEY:'private-server-key'},async(url,options)=>{
    calls++;assert.equal(url,IMAGE_RELAY);assert.deepEqual(options.headers,{'Content-Type':'application/json'});assert.deepEqual(JSON.parse(options.body),{application:'shadow-puppet-studio',kind:'reference',prompt:'A quiet mountain stage'});assert.equal(options.redirect,'manual');assert.ok(options.signal instanceof AbortSignal);
    return Response.json({dataUrl:png,model:'test-image-model',secret:'upstream-secret',url:'http://private'});
  });
  assert.equal(r.status,200);const data=await r.json();assert.deepEqual(data,{dataUrl:png,kind:'reference',model:'test-image-model'});assert.equal(calls,1);
});

test('image proxy rejects invalid prompts, remote results, oversized bodies and foreign origins',async()=>{
  let calls=0;const fetcher=async()=>{calls++;return Response.json({dataUrl:'https://untrusted/image.png'});};
  assert.equal((await handleApi(imageRequest({prompt:'x'.repeat(801)}),{},fetcher)).status,400);
  assert.equal((await handleApi(imageRequest({}, {Origin:'https://foreign.test'}),{},fetcher)).status,403);
  assert.equal((await handleApi(imageRequest({extra:'x'.repeat(7000)}),{},fetcher)).status,413);
  assert.equal(calls,0);
  assert.equal((await handleApi(imageRequest(),{},fetcher)).status,502);assert.equal(calls,1);
  assert.equal((await handleApi(imageRequest(),{},async()=>Response.json({dataUrl:'data:image/png;base64,SGVsbG8='}))).status,502);
  const huge=await handleApi(imageRequest(),{},async()=>new Response('{}',{headers:{'content-length':'21000001'}}));assert.equal(huge.status,413);
});

test('image proxy reports service failures once without exposing upstream messages or secrets',async()=>{
  let calls=0;const r=await handleApi(imageRequest(),{},async()=>{calls++;return Response.json({error:'secret account details'},{status:403});});assert.equal(r.status,403);assert.equal(calls,1);assert.ok(!(await r.text()).includes('secret'));
  const timeout=await handleApi(imageRequest(),{},async()=>{throw new DOMException('Contains private service address','TimeoutError');});assert.equal(timeout.status,502);assert.deepEqual(await timeout.json(),{error:'connection',kind:'timeout'});
});

test('hosted status proxy retains configuration boundary without inventing image editing or vision',async()=>{
  const r=await handleApi(new Request('https://classroom.test/api/puppet/status'),{},async(url,options)=>{assert.equal(url,'https://6ilmssim2bz2s.kimi.site/api/status');assert.deepEqual(options.headers,{Accept:'application/json'});return Response.json({service:'Shadow Puppet Studio',configured:true,key:'should-not-leak'});});
  const status=await r.json();assert.equal(status.configured,true);assert.equal(status.vision,false);assert.equal(status.imageEditing,false);assert.equal(status.verification,'relay-configuration-only');assert.ok(!JSON.stringify(status).includes('should-not-leak'));
  const unavailable=await handleApi(new Request('https://classroom.test/api/puppet/status'),{},async()=>Response.json({error:'down'},{status:503}));assert.equal(unavailable.status,502);
});

test('endpoint selection preserves GitHub/file relay access and uses same-origin hosted routes',async()=>{
  for(const page of [new URL('https://zhinii.github.io/bnta-shadow-puppet-studio/'),new URL('file:///C:/START-HERE.html')]){assert.equal(planRelayEndpoint(page),PLAN_RELAY);assert.equal(imageRelayEndpoint(page),IMAGE_RELAY);}
  assert.equal(planRelayEndpoint(new URL('https://classroom.test/')),'https://classroom.test/api/puppet');
  assert.equal(imageRelayEndpoint(new URL('http://127.0.0.1:4237/')),'http://127.0.0.1:4237/api/puppet/image');
  const previous=globalThis.location;globalThis.location=new URL('https://classroom.test/');
  try{
    assert.equal(studioEndpoint(),'https://classroom.test/api/studio');const calls=[];
    const caps=await getStudioCapabilities({fetcher:async url=>{calls.push(url);return url.endsWith('/api/studio/status')?Response.json({version:2,text:false,vision:false,imageGeneration:false,imageEditing:false}):Response.json({service:'Shadow Puppet Studio',configured:true});}});
    assert.deepEqual(calls,['https://classroom.test/api/studio/status','https://classroom.test/api/puppet/status']);assert.equal(caps.endpoint,'https://classroom.test/api/puppet');assert.equal(caps.imageEndpoint,'https://classroom.test/api/puppet/image');assert.equal(caps.vision,false);
    await requestClassroomHelp({task:'story',prompt:'A student story'},{fetcher:async url=>{assert.equal(url,'https://classroom.test/api/puppet');return Response.json({choices:[{message:{content:JSON.stringify({reply:JSON.stringify({reply:'Review',proposal:{story:{plot:'A student story'}}})})}}]});}});
    await requestStageImage({prompt:'A mountain stage'},{fetcher:async url=>{assert.equal(url,'https://classroom.test/api/puppet/image');return Response.json({dataUrl:png});},artworkReader:async()=>({id:'test',name:'test',mime:'image/png',dataUrl:png,width:1,height:1})});
  }finally{if(previous===undefined)delete globalThis.location;else globalThis.location=previous;}
});
