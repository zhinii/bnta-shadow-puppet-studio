// Preserve transient interface state across the studio's DOM refreshes.
// Project values remain owned by the application; this never restores input values.
const FOCUSABLE = 'button,input,select,textarea,a,summary,[tabindex]';
const list = (root, selector) => Array.from(root?.querySelectorAll?.(selector) || []);
const attribute = (element, name) => element?.getAttribute?.(name) ?? null;

function detailsKey(element) {
  const explicit = attribute(element, 'data-preserve-key');
  if (explicit) return 'key:' + explicit;
  const summary = Array.from(element.children || []).find(child => child.tagName?.toLowerCase() === 'summary') || element.querySelector?.('summary');
  const classes = (attribute(element, 'class') || '').split(/\s+/).filter(Boolean).sort().join(' ');
  return 'details:' + classes + ':' + (summary?.textContent || '').replace(/\s+/g, ' ').trim();
}

function detailsEntries(root) {
  const occurrences = new Map();
  return list(root, 'details').map(element => {
    const key = detailsKey(element), index = occurrences.get(key) || 0;
    occurrences.set(key, index + 1);
    return {element, key, index};
  });
}

function controlIdentity(element) {
  const attributes = Array.from(element.attributes || [])
    .filter(attr => attr.name === 'id' || attr.name === 'name' || attr.name === 'type' || attr.name === 'href' || attr.name.startsWith('data-'))
    .map(attr => [attr.name, attr.value]).sort(([a], [b]) => a.localeCompare(b));
  const tag = element.tagName?.toLowerCase() || '';
  return {tag, attributes, text: attributes.length ? null : (element.textContent || '').replace(/\s+/g, ' ').trim()};
}

function matchesIdentity(element, identity) {
  if ((element.tagName?.toLowerCase() || '') !== identity.tag) return false;
  if (!identity.attributes.every(([name, value]) => attribute(element, name) === value)) return false;
  return identity.text === null || (element.textContent || '').replace(/\s+/g, ' ').trim() === identity.text;
}

export function captureUIState(root) {
  const details = detailsEntries(root).map(({element, key, index}) => ({key, index, open: Boolean(element.open)}));
  const active = root?.ownerDocument?.activeElement || globalThis.document?.activeElement;
  const controls = list(root, FOCUSABLE);
  if (!active || !controls.includes(active)) return {details, focus: null};
  const identity = controlIdentity(active), index = controls.filter(element => matchesIdentity(element, identity)).indexOf(active);
  let selection = null;
  try {
    if (typeof active.selectionStart === 'number' && typeof active.selectionEnd === 'number') {
      selection = {start: active.selectionStart, end: active.selectionEnd, direction: active.selectionDirection || 'none'};
    }
  } catch { /* Number/color inputs and SVG controls do not expose a caret. */ }
  return {details, focus: {...identity, index, selection}};
}

export function restoreUIState(root, snapshot, {focus = true} = {}) {
  if (!snapshot) return;
  const openStates = new Map((snapshot.details || []).map(item => [JSON.stringify([item.key, item.index]), item.open]));
  for (const {element, key, index} of detailsEntries(root)) {
    const id = JSON.stringify([key, index]);
    if (openStates.has(id)) element.open = openStates.get(id);
  }
  if (!focus || !snapshot.focus) return;
  const saved = snapshot.focus;
  const element = list(root, FOCUSABLE).filter(candidate => matchesIdentity(candidate, saved))[saved.index];
  if (!element || element.disabled) return;
  element.focus?.({preventScroll: true});
  if (saved.selection) {
    try { element.setSelectionRange?.(saved.selection.start, saved.selection.end, saved.selection.direction); }
    catch { /* The replacement control may use a non-text input type. */ }
  }
}
