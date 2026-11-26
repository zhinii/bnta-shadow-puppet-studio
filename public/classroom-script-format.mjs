// Script text stays plain text. These ranges are presentation only, never HTML.
const MAX_FORMATS = 1000;
const FLAGS = ['bold','italic','underline'];
const hex = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
const sameStyle = (a,b) => FLAGS.every(key=>a[key]===b[key]) && a.color===b.color;
const styled = value => FLAGS.some(key=>value[key]) || !!value.color;
const escape = value => String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function append(rows,start,end,style) {
  if(end<=start || !styled(style))return;
  const previous=rows.at(-1);
  if(previous?.end===start && sameStyle(previous,style))previous.end=end;
  else rows.push({start,end,...style});
}
function styleOf(value) {
  const result={};
  for(const key of FLAGS)if(value?.[key]===true)result[key]=true;
  if(hex(value?.color))result.color=value.color.toLowerCase();
  return result;
}
function ranges(script,values) {
  if(values==null)return [];
  if(!Array.isArray(values)||values.length>MAX_FORMATS)throw new Error('Too many or invalid script formatting ranges.');
  const length=String(script??'').length;
  return values.flatMap(value=>{
    if(!value||typeof value!=='object'||!Number.isInteger(value.start)||!Number.isInteger(value.end))return [];
    const start=Math.max(0,Math.min(length,value.start)),end=Math.max(0,Math.min(length,value.end)),style=styleOf(value);
    return end>start&&styled(style)?[{start,end,...style}]:[];
  });
}

/** Produces bounded, non-overlapping runs. Overlapping imported flags combine;
 * the last imported color wins. Invalid styling never becomes executable CSS. */
export function normalizeScriptFormats(script,values=[]) {
  const input=ranges(script,values),points=[...new Set(input.flatMap(row=>[row.start,row.end]))].sort((a,b)=>a-b),output=[];
  for(let index=0;index<points.length-1;index++){
    const start=points[index],end=points[index+1],style={};
    for(const row of input)if(row.start<=start&&row.end>=end)Object.assign(style,styleOf(row));
    append(output,start,end,style);
  }
  if(output.length>MAX_FORMATS)throw new Error('Script formatting is too complex. Clear some formatting first.');
  return output;
}

/** Applies a style to a textarea selection (UTF-16 offsets, like selectionStart).
 * An omitted boolean value toggles it. null/empty color removes text color. */
export function formatScriptSelection(script,values,{start,end,format,value}={}) {
  const text=String(script??''),rows=normalizeScriptFormats(text,values);
  if(!FLAGS.includes(format)&&format!=='color')throw new Error('Choose bold, italic, underline or color.');
  if(!Number.isInteger(start)||!Number.isInteger(end))return rows;
  start=Math.max(0,Math.min(text.length,start));end=Math.max(start,Math.min(text.length,end));
  if(start===end)return rows;
  if(format==='color'&&value!=null&&value!==''&&!hex(value))throw new Error('Choose a six-digit hex text color.');
  const points=[...new Set([0,text.length,start,end,...rows.flatMap(row=>[row.start,row.end])])].sort((a,b)=>a-b);
  const fullyApplied=FLAGS.includes(format)&&points.slice(0,-1).every((point,index)=>point<start||point>=end||rows.some(row=>row.start<=point&&row.end>=points[index+1]&&row[format]));
  const next=FLAGS.includes(format)?(typeof value==='boolean'?value:!fullyApplied):(hex(value)?value.toLowerCase():null),output=[];
  for(let index=0;index<points.length-1;index++){
    const a=points[index],b=points[index+1],style=styleOf(rows.find(row=>row.start<=a&&row.end>=b));
    if(a>=start&&b<=end){if(next)style[format]=next;else delete style[format];}
    append(output,a,b,style);
  }
  return normalizeScriptFormats(text,output);
}

/** Retains styling only on unchanged prefix/suffix characters. Replacement text
 * starts plain: AI rewrites cannot attach old emphasis to unrelated dialogue. */
export function rebaseScriptFormats(before,after,values=[]) {
  before=String(before??'');after=String(after??'');
  const rows=normalizeScriptFormats(before,values);
  if(before===after)return rows;
  let prefix=0,suffix=0;
  while(prefix<before.length&&prefix<after.length&&before[prefix]===after[prefix])prefix++;
  while(suffix<before.length-prefix&&suffix<after.length-prefix&&before[before.length-1-suffix]===after[after.length-1-suffix])suffix++;
  const oldEnd=before.length-suffix,shift=after.length-before.length,output=[];
  for(const row of rows){
    append(output,row.start,Math.min(row.end,prefix),styleOf(row));
    append(output,Math.max(row.start,oldEnd)+shift,row.end+shift,styleOf(row));
  }
  return normalizeScriptFormats(after,output);
}

/** Safe HTML for a read-only preview; render inside a white-space:pre-wrap node. */
export function renderScriptPreview(script,values=[]) {
  const text=String(script??''),rows=normalizeScriptFormats(text,values);let cursor=0,html='';
  for(const row of rows){
    html+=escape(text.slice(cursor,row.start));let run=escape(text.slice(row.start,row.end));
    if(row.bold)run='<strong>'+run+'</strong>';
    if(row.italic)run='<em>'+run+'</em>';
    if(row.underline)run='<u>'+run+'</u>';
    if(row.color)run='<span style="color:'+row.color+'">'+run+'</span>';
    html+=run;cursor=row.end;
  }
  return html+escape(text.slice(cursor));
}
