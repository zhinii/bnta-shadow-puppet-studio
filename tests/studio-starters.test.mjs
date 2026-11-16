import test from 'node:test';
import assert from 'node:assert/strict';
import {createStarter,STARTERS} from '../public/studio-starters.mjs';
import {validateStudio,partTransforms,transformPoint,neutralProjectBounds} from '../public/studio-model.mjs';

test('all optional constructions have supported holes, simple cut shapes and usable rod points',()=>{
  for(const {id} of STARTERS){
    const p=createStarter(id);
    const errors=validateStudio(p).filter(issue=>issue.level==='error');
    assert.deepEqual(errors,[],id+': '+JSON.stringify(errors));
    assert.ok(p.parts.every(part=>part.polygon.length<=40));
    assert.equal(p.joints.length,p.parts.length-1);
    assert.equal(p.title,'');assert.equal(p.brief.keywords,'');assert.deepEqual(p.assets,[]);
  }
});

test('templates offer materially different part graphs and outlines',()=>{
  const projects=STARTERS.map(({id})=>createStarter(id));
  assert.ok(new Set(projects.map(p=>p.parts.length)).size>=3);
  assert.equal(projects.find(p=>p.parts.some(x=>x.id==='wing-left')).parts.filter(x=>x.id.startsWith('wing-')).length,2);
  assert.equal(projects.find(p=>p.parts.some(x=>x.id==='tentacle-1')).parts.filter(x=>x.id.startsWith('tentacle-')).length,6);
  const ratios=projects.map(p=>{const b=neutralProjectBounds(p);return Math.round(b.width/b.height*100);});
  assert.equal(new Set(ratios).size,projects.length);
});

test('template joints stay connected throughout their permitted rotation and scale stays constant',()=>{
  for(const {id} of STARTERS){
    const p=createStarter(id),neutral=neutralProjectBounds(p);
    p.joints.forEach((joint,i)=>{joint.angle=i%2?joint.max:joint.min;});
    const transforms=partTransforms(p);
    for(const j of p.joints){
      const a=transformPoint(transforms[j.parentId],j.parentAnchor),b=transformPoint(transforms[j.childId],j.childAnchor);
      assert.ok(Math.hypot(a[0]-b[0],a[1]-b[1])<1e-7,id+' / '+j.id);
    }
    assert.deepEqual(neutralProjectBounds(p),neutral);
  }
});

test('localized templates remain unnamed and reject an unsupported template',()=>{
  const p=createStarter('figure',{language:'zh'});
  assert.equal(p.language,'zh');assert.equal(p.title,'');
  assert.equal(p.parts.find(x=>x.id==='head').name,'头部');
  assert.throws(()=>createStarter('dragon'),/Unknown construction template/);
});
