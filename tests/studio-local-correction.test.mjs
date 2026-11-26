import test from 'node:test';
import assert from 'node:assert/strict';
import {createStudioProject,makePart,normalizeStudioProject,mirrorPart,resizePart,transformPoint,assertLockedPartsUnchanged} from '../public/studio-model.mjs';
import {addArtworkPatch,removeArtworkPatch,localArtworkSampleAt} from '../public/studio-image-repair.mjs';
import {renderStudioSvg,exportSheetSvg,exportPrintHtml} from '../public/studio-render.mjs';
import {serializeStudioProject,parseStudioProject} from '../public/studio-storage.mjs';
import {splitPart} from '../public/studio-construction.mjs';
const PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const region=[[45,110],[110,110],[110,145],[45,145]];
function fixture(){const p=createStudioProject();p.assets=[{id:'art',name:'Shared red and green clothing',dataUrl:PNG,width:200,height:200}];p.parts=[{...makePart('Green top',[[40,20],[120,20],[120,100],[40,100]],'art'),id:'top'},{...makePart('Red trousers',[[40,100],[120,100],[120,180],[40,180]],'art'),id:'leg'}];p.joints=[{id:'hip',parentId:'top',childId:'leg',parentAnchor:[80,100],childAnchor:[80,100],padRadius:20,min:-90,max:90,angle:0}];return normalizeStudioProject(p);}

test('local correction affects only marked artwork of selected piece and keeps all geometry and shared assets',()=>{
 const before=fixture(),next=addArtworkPatch(before,'leg',region,{color:'#22aa44'}),patch=next.parts[1].artworkPatches[0];
 assert.equal(patch.kind,'color');assert.deepEqual(patch.polygon,region);assert.equal(patch.color,'#22aa44');
 assert.equal(before.parts[1].artworkPatches,undefined);assert.deepEqual(next.parts[0],before.parts[0]);assert.deepEqual(next.assets,before.assets);assert.deepEqual(next.joints,before.joints);
 const changed=structuredClone(next.parts[1]);delete changed.artworkPatches;assert.deepEqual(changed,before.parts[1]);
 assert.deepEqual(removeArtworkPatch(next,'leg',patch.id),before);
});

test('texture sample must originate inside selected piece with enough margin for the entire patch',()=>{
 const p=fixture(),next=addArtworkPatch(p,'leg',region,{samplePoint:[80,160],sampleSize:12});
 assert.deepEqual(next.parts[1].artworkPatches[0].sample,{center:[80,160],size:12});
 assert.throws(()=>addArtworkPatch(p,'leg',region,{samplePoint:[80,50]}),/inside the selected piece/);
 assert.throws(()=>localArtworkSampleAt(p,'leg',[41,160],{size:12}),/smaller sample/);
 assert.throws(()=>addArtworkPatch(p,'leg',[[0,0],[110,110],[110,150]],{color:'#ff0000'}),/inside the selected piece/);
 assert.throws(()=>addArtworkPatch(p,'leg',[[50,110],[110,150],[50,150],[110,110]],{color:'#ff0000'}),/without crossing/);
 assert.throws(()=>addArtworkPatch(p,'leg',region,{color:'url(https://example.com)'}),/Choose a color/);
});

test('corrections follow mirror, parametric resize and split and round-trip in portable JSON',()=>{
 const before=addArtworkPatch(fixture(),'leg',region,{samplePoint:[80,160],sampleSize:12});
 for(const changed of [mirrorPart(before,'leg','horizontal'),resizePart(before,'leg',{width:1.4,length:.8}),parseStudioProject(serializeStudioProject(before))]){
  assert.deepEqual(changed.parts[1].artworkPatches,before.parts[1].artworkPatches);
  assert.deepEqual(changed.joints.map(j=>j.id),before.joints.map(j=>j.id));
 }
 const mirrored=mirrorPart(before,'leg','horizontal');const mapped=mirrored.parts[1].artworkPatches[0].polygon.map(p=>transformPoint(mirrored.parts[1].artworkMatrix,p));
 assert.ok(mapped[0][0]>mapped[1][0],'repair follows the reversed printed artwork');
 const split=splitPart(before,'leg',[30,140],[130,140]);
 assert.equal(split.project.parts.filter(p=>p.artworkPatches?.length).length,2,'each child clips the retained source correction to its own contour');
 assert.deepEqual(parseStudioProject(serializeStudioProject(split.project)),split.project);
});

test('preview and printed artwork include source alpha and piece/pin-hole clipping; cut SVG is unchanged',()=>{
 const before=fixture(),next=addArtworkPatch(before,'leg',region,{color:'#22aa44'});
 for(const markup of [renderStudioSvg(next),exportSheetSvg(next),exportPrintHtml(next)]){
  assert.match(markup,/data-correction-piece="leg" clip-path="url\(#[^"]+-artwork\)"/);
  assert.doesNotMatch(markup,/data-correction-piece="top"/);
  assert.match(markup,/style="mask-type:alpha"/);assert.match(markup,/data-correction-kind="color"[^>]+fill="#22aa44"/);
  assert.match(markup,/mask="url\(#[^"]+-holes\)"/);
 }
 const stable=s=>s.replace(/sheet-\d+/g,'sheet');assert.equal(stable(exportSheetSvg(next,{cutOnly:true})),stable(exportSheetSvg(before,{cutOnly:true})));
 assert.doesNotMatch(renderStudioSvg(next,{showArt:false}),/data-artwork-correction/);
 const texture=addArtworkPatch(before,'leg',region,{samplePoint:[80,160],sampleSize:12});
 assert.match(exportSheetSvg(texture),/width="12" height="12" viewBox="74 154 12 12"/);
});

test('locked layers and malformed imports cannot bypass correction validation',()=>{
 const before=fixture();before.parts[0].locked=true;const next=addArtworkPatch(before,'leg',region,{color:'#22aa44'});assert.deepEqual(next.parts[0],before.parts[0]);
 next.parts[1].locked=true;assert.throws(()=>addArtworkPatch(next,'leg',region,{color:'#ff0000'}),/Unlock/);
 const mutated=structuredClone(next);mutated.parts[1].artworkPatches[0].color='#ff0000';assert.throws(()=>assertLockedPartsUnchanged(next,mutated),/locked part/);
 const bad=fixture();bad.parts[1].artworkPatches=[{id:'bad',kind:'texture',polygon:region,sample:{center:[190,190],size:40}}];assert.throws(()=>normalizeStudioProject(bad),/inside the artwork/);
 delete bad.parts[1].artworkPatches[0].sample.size;assert.throws(()=>normalizeStudioProject(bad),/pattern sample/);
 const plain=fixture();plain.parts[1].assetId=null;assert.throws(()=>addArtworkPatch(plain,'leg',region,{samplePoint:[80,160]}),/printed artwork/);assert.ok(addArtworkPatch(plain,'leg',region,{color:'#22aa44'}).parts[1].artworkPatches);
});
