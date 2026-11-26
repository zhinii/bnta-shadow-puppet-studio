const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clone = value => structuredClone(value);

/** Move one object past its visual neighbour, including when imported z values tie. */
export function reorderStageObjects(objects = [], objectId, direction) {
  const ordered = objects.map((object, index) => ({object: clone(object), index}))
    .sort((a, b) => finite(a.object.z) - finite(b.object.z) || a.index - b.index);
  const index = ordered.findIndex(item => item.object.id === objectId);
  const offset = direction === 'forward' ? 1 : direction === 'backward' ? -1 : 0;
  const neighbour = index + offset;
  if (index >= 0 && offset && neighbour >= 0 && neighbour < ordered.length) {
    [ordered[index], ordered[neighbour]] = [ordered[neighbour], ordered[index]];
  }
  return ordered.map(({object}, z) => ({...object, z}));
}

/** Permit an object to enter/leave the scene, but retain a selectable visible edge. */
export function clampStageObjectPosition(stage, object, x, y) {
  const stageWidth = Math.max(1, finite(stage?.width, 960));
  const stageHeight = Math.max(1, finite(stage?.height, 540));
  const width = Math.max(1, finite(object?.width, 160));
  const height = Math.max(1, finite(object?.height, 220));
  const visibleX = Math.min(24, width, stageWidth);
  const visibleY = Math.min(24, height, stageHeight);
  return {
    x: Math.max(visibleX - width, Math.min(stageWidth - visibleX, finite(x, finite(object?.x)))),
    y: Math.max(visibleY - height, Math.min(stageHeight - visibleY, finite(y, finite(object?.y))))
  };
}

/** Arrow keys move in stage coordinates; Shift makes the same action ten times larger. */
export function nudgeStageObject(stage, objectId, key, {shiftKey = false, step = 1} = {}) {
  const next = clone(stage);
  const object = next?.objects?.find(item => item.id === objectId);
  const vector = {ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]}[key];
  if (!object || !vector) return next;
  const distance = Math.max(0, finite(step, 1)) * (shiftKey ? 10 : 1);
  Object.assign(object, clampStageObjectPosition(next, object,
    finite(object.x) + vector[0] * distance, finite(object.y) + vector[1] * distance));
  return next;
}
