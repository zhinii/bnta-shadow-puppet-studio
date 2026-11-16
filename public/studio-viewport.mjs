// Camera values affect only the SVG viewBox, never the puppet or print scale.
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 6;

export function fitBox(box, padding = 0) {
  if (!Array.isArray(box) || box.length !== 4 || !box.every(Number.isFinite) || box[2] <= 0 || box[3] <= 0) {
    throw new TypeError('A viewport requires finite x, y, positive width and height.');
  }
  if (!Number.isFinite(padding) || padding < 0) throw new TypeError('Viewport padding must be finite and non-negative.');
  return [box[0] - padding, box[1] - padding, box[2] + padding * 2, box[3] + padding * 2];
}

export function normalizeCamera(camera = {}) {
  return {
    zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number.isFinite(camera?.zoom) ? camera.zoom : 1)),
    x: Number.isFinite(camera?.x) ? camera.x : 0,
    y: Number.isFinite(camera?.y) ? camera.y : 0,
  };
}

export function zoomViewBox(baseBox, camera = {}) {
  const [x, y, width, height] = fitBox(baseBox);
  const view = normalizeCamera(camera);
  const w = width / view.zoom, h = height / view.zoom;
  return [x + (width - w) / 2 + view.x, y + (height - h) / 2 + view.y, w, h];
}

// Positive offsets move the camera right/down. For a "grab" drag pass the
// negative pointer displacement after converting CSS pixels to world units.
export function panCamera(camera, dxWorld, dyWorld) {
  if (!Number.isFinite(dxWorld) || !Number.isFinite(dyWorld)) throw new TypeError('Pan distances must be finite.');
  const view = normalizeCamera(camera);
  return {...view, x: view.x + dxWorld, y: view.y + dyWorld};
}

// SVG uses xMidYMid meet: the larger units-per-pixel ratio includes letterboxing.
// Multiplying this value by a desired CSS-pixel radius keeps handles touchable.
export function screenUnitScale(viewBox, viewportWidth, viewportHeight) {
  const [, , width, height] = fitBox(viewBox);
  if (!Number.isFinite(viewportWidth) || !Number.isFinite(viewportHeight) || viewportWidth <= 0 || viewportHeight <= 0) {
    return 1; // An unmeasured/hidden surface must not produce NaN or infinity.
  }
  return Math.max(width / viewportWidth, height / viewportHeight);
}
