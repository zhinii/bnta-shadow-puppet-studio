import test from 'node:test';
import assert from 'node:assert/strict';
import {captureUIState, restoreUIState} from '../public/studio-ui-state.mjs';

function element(tag, attrs = {}, text = '') {
  return {
    tagName: tag.toUpperCase(), attributes: Object.entries(attrs).map(([name, value]) => ({name, value})),
    textContent: text, children: [], open: false, disabled: false,
    getAttribute(name) { return attrs[name] ?? null; },
    focus(options) { this.ownerDocument.activeElement = this; this.focusOptions = options; },
    setSelectionRange(start, end, direction) { this.selectionStart = start; this.selectionEnd = end; this.selectionDirection = direction; }
  };
}
function detail(label, attrs = {class: 'advanced-controls'}) {
  const result = element('details', attrs);
  result.children = [element('summary', {}, label)];
  return result;
}
function root(details, controls) {
  const ownerDocument = {activeElement: null};
  for (const item of [...details, ...controls]) item.ownerDocument = ownerDocument;
  return {ownerDocument, querySelectorAll(selector) { return selector === 'details' ? details : controls; }};
}

test('open details survive a DOM refresh by identity rather than position', () => {
  const parent = detail('Suggest a pivot connection', {class: 'connection-suggestion'});
  const advanced = detail('Joint settings');
  parent.open = true;
  const before = root([parent, advanced], []), snapshot = captureUIState(before);
  const newAdvanced = detail('Joint settings'), newParent = detail('Suggest a pivot connection', {class: 'connection-suggestion'});
  newAdvanced.open = true;
  restoreUIState(root([newAdvanced, newParent], []), snapshot);
  assert.equal(newParent.open, true);
  assert.equal(newAdvanced.open, false);
  const explicit = detail('Different translated heading', {'data-preserve-key': 'joint-settings'});
  explicit.open = true;
  const translated = detail('关节设置', {'data-preserve-key': 'joint-settings'});
  restoreUIState(root([translated], []), captureUIState(root([explicit], [])));
  assert.equal(translated.open, true);
});

test('focus and caret restore to the same duplicate title field without restoring its value', () => {
  const title = element('input', {'data-field': 'title'}), menuTitle = element('input', {'data-field': 'title'});
  menuTitle.value = 'Previous title'; menuTitle.selectionStart = 2; menuTitle.selectionEnd = 6; menuTitle.selectionDirection = 'forward';
  const before = root([], [title, menuTitle]); before.ownerDocument.activeElement = menuTitle;
  const snapshot = captureUIState(before);
  const nextTitle = element('input', {'data-field': 'title'}), nextMenuTitle = element('input', {'data-field': 'title'});
  nextMenuTitle.value = 'Application-owned title';
  const after = root([], [nextTitle, nextMenuTitle]); restoreUIState(after, snapshot);
  assert.equal(after.ownerDocument.activeElement, nextMenuTitle);
  assert.equal(nextMenuTitle.value, 'Application-owned title');
  assert.deepEqual([nextMenuTitle.selectionStart, nextMenuTitle.selectionEnd, nextMenuTitle.selectionDirection], [2, 6, 'forward']);
  assert.deepEqual(nextMenuTitle.focusOptions, {preventScroll: true});
});

test('data-field number controls keep focus and review may suppress focus restoration', () => {
  const min = element('input', {type: 'number', 'data-joint-field': 'min'}), max = element('input', {type: 'number', 'data-joint-field': 'max'});
  const before = root([], [min, max]); before.ownerDocument.activeElement = min;
  const snapshot = captureUIState(before), nextMax = element('input', {type: 'number', 'data-joint-field': 'max'}), nextMin = element('input', {type: 'number', 'data-joint-field': 'min'});
  const after = root([], [nextMax, nextMin]); restoreUIState(after, snapshot);
  assert.equal(after.ownerDocument.activeElement, nextMin);
  after.ownerDocument.activeElement = nextMax;
  restoreUIState(after, snapshot, {focus: false});
  assert.equal(after.ownerDocument.activeElement, nextMax);
  nextMin.disabled = true;
  restoreUIState(after, snapshot);
  assert.equal(after.ownerDocument.activeElement, nextMax);
});
