type Point = [number, number];

const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];
const norm = (v: Point): Point => {
  const len = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / len, v[1] / len];
};
const add = (a: Point, v: Point, k: number): Point => [a[0] + v[0] * k, a[1] + v[1] * k];
const fmt = (p: Point): string => `${p[0].toFixed(3)} ${p[1].toFixed(3)}`;

/**
 * Build an SVG path for a polygon with radiused corners. Used for the warning
 * triangle so its points match the softness of the success circle.
 */
export const roundedPolygon = (points: Point[], radius: number, sweep = 1): string => {
  const n = points.length;
  let d = '';

  for (let i = 0; i < n; i++) {
    const vertex = points[i];
    const prev = points[(i - 1 + n) % n];
    const next = points[(i + 1) % n];

    // Clamp the radius so adjacent corners can never overrun each other.
    const r = Math.min(
      radius,
      Math.hypot(...sub(prev, vertex)) / 2,
      Math.hypot(...sub(next, vertex)) / 2,
    );

    const entry = add(vertex, norm(sub(prev, vertex)), r);
    const exit = add(vertex, norm(sub(next, vertex)), r);

    d += `${i === 0 ? 'M' : 'L'} ${fmt(entry)} A ${r.toFixed(3)} ${r.toFixed(3)} 0 0 ${sweep} ${fmt(exit)} `;
  }

  return `${d}Z`;
};

export const TRIANGLE_PATH = roundedPolygon(
  [
    [60, 12],
    [113, 102],
    [7, 102],
  ],
  15,
);
