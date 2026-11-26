import test from 'node:test';
import assert from 'node:assert/strict';
import {classroomServiceBase,classroomTeacherUrl,CLASSROOM_HOSTED_URL,createClassroomClient} from '../public/classroom-client.mjs';
test('existing GitHub studio uses published classroom service without third-party cookies',async()=>{
 const location={hostname:'zhinii.github.io',pathname:'/bnta-shadow-puppet-studio/'};
 assert.equal(classroomServiceBase(location),CLASSROOM_HOSTED_URL+'/api/classroom');
 assert.equal(classroomTeacherUrl(location),CLASSROOM_HOSTED_URL+'/?teacher=1');
 let options;const c=createClassroomClient({base:classroomServiceBase(location),fetcher:async(url,init)=>{options=init;assert.equal(url,CLASSROOM_HOSTED_URL+'/api/classroom/capabilities');return Response.json({available:true});}});
 assert.equal((await c.capabilities()).available,true);assert.equal(options.credentials,'same-origin');
});
test('hosted, local and unrelated sites keep their own backend and never forward class credentials',()=>{
 for(const location of [{hostname:'localhost',pathname:'/'},{hostname:'bnta-shadow-puppet-studio.zhinii.chatgpt.site',pathname:'/'},{hostname:'zhinii.github.io',pathname:'/unrelated/'},{hostname:'evil.example',pathname:'/bnta-shadow-puppet-studio/'}]){assert.equal(classroomServiceBase(location),'/api/classroom');assert.equal(classroomTeacherUrl(location),null);}
});
