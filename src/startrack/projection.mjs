// Map the four corners of the HTML player onto the projected 3D screen.
export function playerMatrix(points, width, height) {
  if (!Array.isArray(points) || points.length !== 4 || width <= 0 || height <= 0) return null;
  const source = [[0, 0], [width, 0], [width, height], [0, height]];
  const rows = [];
  for (let i = 0; i < 4; i++) {
    const [u, v] = source[i], { x, y } = points[i];
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    rows.push([u, v, 1, 0, 0, 0, -x * u, -x * v, x]);
    rows.push([0, 0, 0, u, v, 1, -y * u, -y * v, y]);
  }
  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let row = col + 1; row < 8; row++) if (Math.abs(rows[row][col]) > Math.abs(rows[pivot][col])) pivot = row;
    if (Math.abs(rows[pivot][col]) < 1e-10) return null;
    [rows[col], rows[pivot]] = [rows[pivot], rows[col]];
    const div = rows[col][col];
    for (let k = col; k < 9; k++) rows[col][k] /= div;
    for (let row = 0; row < 8; row++) if (row !== col) {
      const factor = rows[row][col];
      for (let k = col; k < 9; k++) rows[row][k] -= factor * rows[col][k];
    }
  }
  const [a, c, e, b, d, f, g, h] = rows.map((r) => r[8]);
  const m = [a, b, 0, g, c, d, 0, h, 0, 0, 1, 0, e, f, 0, 1];
  return m.every(Number.isFinite) ? m : null;
}

// Keep the homogeneous coordinates until after clipping. A screen corner can
// pass behind the camera while another part of the screen is still visible.
export function playerClipProjection(points, width, height, viewportWidth, viewportHeight, worldWidth = viewportWidth) {
  if (!Array.isArray(points) || points.length !== 4 || width <= 0 || height <= 0 || viewportWidth <= 0 || viewportHeight <= 0 || worldWidth <= 0) return null;
  if (points.some((p) => ![p.x, p.y, p.z, p.w].every(Number.isFinite))) return null;
  const [tl, tr, , bl] = points;
  const component = (p) => ({ x: viewportWidth * (p.x + p.w) / 2, y: viewportHeight * (p.w - p.y) / 2, w: p.w });
  const a = component(tl), b = component(tr), d = component(bl);
  const matrix = [(b.x - a.x) / width, (b.y - a.y) / width, 0, (b.w - a.w) / width,
    (d.x - a.x) / height, (d.y - a.y) / height, 0, (d.w - a.w) / height,
    0, 0, 1, 0, a.x, a.y, 0, a.w];
  if (!matrix.every(Number.isFinite)) return null;

  const planes = [(p) => p.x + p.w, (p) => p.w - p.x, (p) => p.y + p.w,
    (p) => p.w - p.y, (p) => p.z + p.w, (p) => p.w - p.z];
  let clipped = points.map((p) => ({ ...p }));
  for (const distance of planes) {
    const output = [];
    for (let i = 0; i < clipped.length; i++) {
      const p = clipped[i], q = clipped[(i + 1) % clipped.length], dp = distance(p), dq = distance(q);
      if (dp >= 0) output.push(p);
      if ((dp >= 0) !== (dq >= 0)) {
        const t = dp / (dp - dq);
        output.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t, z: p.z + (q.z - p.z) * t, w: p.w + (q.w - p.w) * t });
      }
    }
    clipped = output;
    if (!clipped.length) return null;
  }
  const pixel = (p) => ({ x: (p.x / p.w + 1) * viewportWidth / 2, y: (1 - p.y / p.w) * viewportHeight / 2 });
  const corners = clipped.filter((p) => p.w > 0).map(pixel);
  if (corners.length < 3) return null;
  const area = (p) => Math.abs(p.reduce((sum, v, i) => { const n = p[(i + 1) % p.length]; return sum + v.x * n.y - n.x * v.y; }, 0)) / 2;
  if (area(corners) < 1e-6) return null;
  const fullyInDepth = points.every((p) => p.w > 0 && p.z >= -p.w && p.z <= p.w);
  // With a corner behind the near plane, the projected player is unbounded.
  // It remains visible but must not initiate automatic playback.
  const visible = fullyInDepth ? visibleFraction(points.map(pixel), Math.min(worldWidth, viewportWidth), viewportHeight) : Number.EPSILON;
  const boundPoints = fullyInDepth ? points.map(pixel) : corners;
  const bounds = { left: Math.min(...boundPoints.map((p) => p.x)), right: Math.max(...boundPoints.map((p) => p.x)), top: Math.min(...boundPoints.map((p) => p.y)), bottom: Math.max(...boundPoints.map((p) => p.y)) };
  return { matrix, corners, bounds, visible };
}

// The iframe can move partly outside the browser viewport without moving off the 3D screen.
export function visibleFraction(points, width, height) {
  if (!Array.isArray(points) || points.length < 3 || width <= 0 || height <= 0) return 0;
  const area = (p) => Math.abs(p.reduce((sum, a, i) => { const b = p[(i + 1) % p.length]; return sum + a.x * b.y - b.x * a.y; }, 0)) / 2;
  const total = area(points);
  if (!Number.isFinite(total) || total < 1e-6) return 0;
  let clipped = points.map(({ x, y }) => ({ x, y }));
  const edges = [
    { inside: (p) => p.x >= 0, cross: (a, b) => ({ x: 0, y: a.y + (b.y - a.y) * (0 - a.x) / (b.x - a.x) }) },
    { inside: (p) => p.x <= width, cross: (a, b) => ({ x: width, y: a.y + (b.y - a.y) * (width - a.x) / (b.x - a.x) }) },
    { inside: (p) => p.y >= 0, cross: (a, b) => ({ x: a.x + (b.x - a.x) * (0 - a.y) / (b.y - a.y), y: 0 }) },
    { inside: (p) => p.y <= height, cross: (a, b) => ({ x: a.x + (b.x - a.x) * (height - a.y) / (b.y - a.y), y: height }) },
  ];
  for (const edge of edges) {
    if (!clipped.length) break;
    const output = [];
    for (let i = 0; i < clipped.length; i++) {
      const a = clipped[i], b = clipped[(i + 1) % clipped.length], insideA = edge.inside(a), insideB = edge.inside(b);
      if (insideA && insideB) output.push(b);
      else if (insideA && !insideB) output.push(edge.cross(a, b));
      else if (!insideA && insideB) output.push(edge.cross(a, b), b);
    }
    clipped = output;
  }
  return clipped.length >= 3 ? Math.min(1, area(clipped) / total) : 0;
}

// A bounding rectangle can overlap a UI panel even when the tilted screen itself does not.
export function screenIntersectsRect(points, rect, viewportWidth, viewportHeight) {
  const left = Math.max(0, rect.left), top = Math.max(0, rect.top);
  const right = Math.min(viewportWidth, rect.right), bottom = Math.min(viewportHeight, rect.bottom);
  if (right <= left || bottom <= top) return false;
  const shifted = points.map(({ x, y }) => ({ x: x - left, y: y - top }));
  return visibleFraction(shifted, right - left, bottom - top) > 0;
}
