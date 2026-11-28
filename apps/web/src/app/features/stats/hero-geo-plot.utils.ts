import { getCountryCenter } from '../../core/constants/travel-options';
import { WORLD_LAND_POLYGONS } from '../../core/constants/world-land-contours';
import { TravelStats } from '../../core/models/tripilot.models';

export const HERO_VIEW_W = 540;
export const HERO_VIEW_H = 200;

// Mid-latitude longitude aspect multiplier so 1:1 scaling preserves natural continent shapes.
const LNG_ASPECT = 0.88;
const BLEED_X = 24;
const BLEED_Y = 24;

export interface HeroGraticuleLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  isEquator?: boolean;
}

export interface HeroGeoNode {
  code: string;
  x: number;
  y: number;
  radius: number;
  opacity: number;
  isHome: boolean;
  labelX: number | null;
  labelY: number | null;
  textAnchor: 'start' | 'middle' | 'end';
}

export interface HeroGeoArc {
  id: string;
  path: string;
  strokeWidth: number;
  opacity: number;
}

export interface HeroGeoRuler {
  homeCode: string;
  fillWidth: number;
  scaleMaxKm: number;
  ticks: readonly { x: number; major: boolean }[];
}

export interface HeroGeoPlot {
  mode: 'routes' | 'domestic' | 'empty';
  homeCode: string;
  graticule: readonly HeroGraticuleLine[];
  landPaths: readonly string[];
  nodes: readonly HeroGeoNode[];
  arcs: readonly HeroGeoArc[];
  ruler: HeroGeoRuler | null;
}

interface GeoPointInput {
  code: string;
  lat: number;
  lng: number;
  isHome: boolean;
  count: number;
}

interface GeoEdgeInput {
  id: string;
  from: string;
  to: string;
  count: number;
}

const RULER_STEPS_KM: readonly number[] = [250, 500, 1000, 2500, 5000, 10000, 25000, 50000];

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function unwrapLongitude(lng: number, refLng: number): number {
  let d = lng - refLng;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return refLng + d;
}

function projectLandPolygons(
  minRx: number,
  minRy: number,
  scale: number,
  offsetX: number,
  offsetY: number,
  refLng: number,
): string[] {
  const paths: string[] = [];
  for (const ring of WORLD_LAND_POLYGONS) {
    // Shift each landmass once into [refLng - 180, refLng + 180] so no continent ever duplicates.
    const meanLng = ring.reduce((sum, [lng]) => sum + lng, 0) / ring.length;
    const bestShift = Math.round((refLng - meanLng) / 360) * 360;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    const pts: string[] = [];

    for (const [lng, lat] of ring) {
      const rx = (lng + bestShift) * LNG_ASPECT;
      const x = round1(offsetX + (rx - minRx) * scale);
      const y = round1(offsetY + (-lat - minRy) * scale);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      pts.push(`${x} ${y}`);
    }

    if (
      maxX >= -BLEED_X &&
      minX <= HERO_VIEW_W + BLEED_X &&
      maxY >= -BLEED_Y &&
      minY <= HERO_VIEW_H + BLEED_Y
    ) {
      paths.push(`M ${pts.join(' L ')} Z`);
    }
  }
  return paths;
}

function projectGraticule(
  minRx: number,
  minRy: number,
  scale: number,
  offsetX: number,
  offsetY: number,
  refLng: number,
): HeroGraticuleLine[] {
  const lines: HeroGraticuleLine[] = [];
  const startLng = Math.ceil((refLng - 180) / 30) * 30;
  const endLng = refLng + 180;
  const worldMinX = Math.max(-BLEED_X, round1(offsetX + ((refLng - 180) * LNG_ASPECT - minRx) * scale));
  const worldMaxX = Math.min(HERO_VIEW_W + BLEED_X, round1(offsetX + ((refLng + 180) * LNG_ASPECT - minRx) * scale));

  for (let lng = startLng; lng <= endLng; lng += 30) {
    const x = round1(offsetX + (lng * LNG_ASPECT - minRx) * scale);
    if (x >= -BLEED_X && x <= HERO_VIEW_W + BLEED_X) {
      lines.push({ x1: x, y1: -BLEED_Y, x2: x, y2: HERO_VIEW_H + BLEED_Y });
    }
  }
  for (const lat of [-60, -30, 0, 30, 60]) {
    const y = round1(offsetY + (-lat - minRy) * scale);
    if (y >= -BLEED_Y && y <= HERO_VIEW_H + BLEED_Y && worldMaxX > worldMinX) {
      lines.push({
        x1: worldMinX,
        y1: y,
        x2: worldMaxX,
        y2: y,
        isEquator: lat === 0,
      });
    }
  }
  return lines;
}

interface LabelPlacement {
  labelX: number | null;
  labelY: number | null;
  textAnchor: 'start' | 'middle' | 'end';
}

function buildArcsAndTangents(
  edges: readonly GeoEdgeInput[],
  posByCode: ReadonlyMap<string, { x: number; y: number }>,
): { arcs: HeroGeoArc[]; tangentSumByCode: Map<string, { vx: number; vy: number }> } {
  const maxEdgeCount = Math.max(1, ...edges.map((e) => e.count));
  const arcs: HeroGeoArc[] = [];
  const tangentSumByCode = new Map<string, { vx: number; vy: number }>();

  const addTangent = (
    code: string,
    from: { x: number; y: number },
    to: { x: number; y: number },
  ): void => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const prev = tangentSumByCode.get(code) ?? { vx: 0, vy: 0 };
    tangentSumByCode.set(code, { vx: prev.vx + dx / len, vy: prev.vy + dy / len });
  };

  for (const edge of edges) {
    const a = posByCode.get(edge.from);
    const b = posByCode.get(edge.to);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy) || 1;
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    let nx = -dy / dist;
    let ny = dx / dist;
    if (ny > 0) {
      nx = -nx;
      ny = -ny;
    }
    const lift = Math.min(28, Math.max(10, dist * 0.14));
    const ctrl = { x: round1(midX + nx * lift), y: round1(Math.max(12, midY + ny * lift)) };

    addTangent(edge.from, a, ctrl);
    addTangent(edge.to, b, ctrl);

    const weight = edge.count / maxEdgeCount;
    arcs.push({
      id: edge.id,
      path: `M ${a.x} ${a.y} Q ${ctrl.x} ${ctrl.y} ${b.x} ${b.y}`,
      strokeWidth: Math.round((1.2 + weight * 0.85) * 100) / 100,
      opacity: Math.round((0.48 + weight * 0.44) * 100) / 100,
    });
  }

  return { arcs, tangentSumByCode };
}

function placeNodeLabels(
  points: readonly GeoPointInput[],
  posByCode: ReadonlyMap<string, { x: number; y: number }>,
  tangentSumByCode: ReadonlyMap<string, { vx: number; vy: number }>,
  anchorCode: string,
): Map<string, LabelPlacement> {
  const allPos = Array.from(posByCode.entries()).map(([code, pos]) => ({ code, ...pos }));
  const anchorPos = posByCode.get(anchorCode) ?? allPos[0];

  // Prioritize the home anchor, then frequent hubs, then distant landmarks (e.g. SFO, AKL, PRG)
  // so crowded nearby domestic airports never crowd out long-haul destinations.
  const sortedForLabels = [...points].sort((a, b) => {
    const aAnchor = Number(a.code === anchorCode);
    const bAnchor = Number(b.code === anchorCode);
    if (aAnchor !== bAnchor) return bAnchor - aAnchor;
    if (b.count !== a.count) return b.count - a.count;
    const aPos = posByCode.get(a.code)!;
    const bPos = posByCode.get(b.code)!;
    const aDist = Math.hypot(aPos.x - anchorPos.x, aPos.y - anchorPos.y);
    const bDist = Math.hypot(bPos.x - anchorPos.x, bPos.y - anchorPos.y);
    if (Math.abs(bDist - aDist) > 1) return bDist - aDist;
    return a.code.localeCompare(b.code);
  });

  const labelOffsets: { dx: number; dy: number; anchor: 'start' | 'middle' | 'end' }[] = [
    { dx: 0, dy: 13.5, anchor: 'middle' },
    { dx: 0, dy: -7.5, anchor: 'middle' },
    { dx: -8, dy: 3.2, anchor: 'end' },
    { dx: 8, dy: 3.2, anchor: 'start' },
    { dx: -6, dy: 12.5, anchor: 'end' },
    { dx: 6, dy: 12.5, anchor: 'start' },
    { dx: -6, dy: -7, anchor: 'end' },
    { dx: 6, dy: -7, anchor: 'start' },
  ];

  const placedLabels: { cx: number; cy: number }[] = [];
  const placements = new Map<string, LabelPlacement>();

  for (const pt of sortedForLabels) {
    if (placedLabels.length >= 10) {
      placements.set(pt.code, { labelX: null, labelY: null, textAnchor: 'middle' });
      continue;
    }
    const pos = posByCode.get(pt.code)!;
    const sum = tangentSumByCode.get(pt.code) ?? { vx: 0, vy: -1 };
    const mag = Math.hypot(sum.vx, sum.vy);
    const awayX = mag > 0.05 ? -sum.vx / mag : 0;
    const awayY = mag > 0.05 ? -sum.vy / mag : 1;

    const candidates = labelOffsets
      .map((opt) => {
        const candLen = Math.hypot(opt.dx, opt.dy - 2) || 1;
        const align = (opt.dx * awayX + (opt.dy - 2) * awayY) / candLen;
        return { ...opt, align };
      })
      .sort((a, b) => b.align - a.align);

    let chosen: (LabelPlacement & { cx: number; cy: number }) | null = null;
    for (const c of candidates) {
      const lx = round1(Math.min(522, Math.max(18, pos.x + c.dx)));
      const ly = round1(pos.y + c.dy);
      if (ly < 16 || ly > 190) continue;

      const boxCx = c.anchor === 'start' ? lx + 11 : c.anchor === 'end' ? lx - 11 : lx;
      const boxCy = ly - 3.2;

      if (boxCx < 16 || boxCx > 524) continue;
      const hitsLabel = placedLabels.some(
        (l) => Math.abs(l.cx - boxCx) < 28 && Math.abs(l.cy - boxCy) < 12,
      );
      const hitsNode = allPos.some(
        (n) => n.code !== pt.code && Math.abs(n.x - boxCx) < 13 && Math.abs(n.y - boxCy) < 8,
      );
      if (!hitsLabel && !hitsNode) {
        chosen = { labelX: lx, labelY: ly, textAnchor: c.anchor, cx: boxCx, cy: boxCy };
        break;
      }
    }

    if (chosen) {
      placedLabels.push({ cx: chosen.cx, cy: chosen.cy });
      placements.set(pt.code, {
        labelX: chosen.labelX,
        labelY: chosen.labelY,
        textAnchor: chosen.textAnchor,
      });
    } else {
      placements.set(pt.code, { labelX: null, labelY: null, textAnchor: 'middle' });
    }
  }

  return placements;
}

function projectRouteNetwork(
  points: readonly GeoPointInput[],
  edges: readonly GeoEdgeInput[],
  refLng: number,
  anchorCode: string,
  homeCode: string,
): HeroGeoPlot {
  const raw = points.map((p) => ({
    ...p,
    rx: unwrapLongitude(p.lng, refLng) * LNG_ASPECT,
    ry: -p.lat,
  }));

  const minRx = Math.min(...raw.map((p) => p.rx));
  const maxRx = Math.max(...raw.map((p) => p.rx));
  const minRy = Math.min(...raw.map((p) => p.ry));
  const maxRy = Math.max(...raw.map((p) => p.ry));

  const stageLeft = 56;
  const stageTop = 34;
  const stageWidth = 428;
  const stageHeight = 132;

  const spanX = Math.max(12, maxRx - minRx);
  const spanY = Math.max(10, maxRy - minRy);
  const scale = Math.min(stageWidth / spanX, stageHeight / spanY);
  const offsetX = stageLeft + (stageWidth - (maxRx - minRx) * scale) / 2;
  const offsetY = stageTop + (stageHeight - (maxRy - minRy) * scale) / 2;

  const landPaths = projectLandPolygons(minRx, minRy, scale, offsetX, offsetY, refLng);
  const graticule = projectGraticule(minRx, minRy, scale, offsetX, offsetY, refLng);

  const posByCode = new Map<string, { x: number; y: number }>();
  for (const pt of raw) {
    posByCode.set(pt.code, {
      x: round1(offsetX + (pt.rx - minRx) * scale),
      y: round1(offsetY + (pt.ry - minRy) * scale),
    });
  }

  const { arcs, tangentSumByCode } = buildArcsAndTangents(edges, posByCode);
  const labelPlacementByCode = placeNodeLabels(raw, posByCode, tangentSumByCode, anchorCode);
  const maxNodeCount = Math.max(1, ...raw.map((p) => p.count));
  const nodes: HeroGeoNode[] = raw.map((pt) => {
    const pos = posByCode.get(pt.code)!;
    const weight = pt.count / maxNodeCount;
    const placement = labelPlacementByCode.get(pt.code)!;
    return {
      code: pt.code,
      x: pos.x,
      y: pos.y,
      radius: pt.isHome ? 4.4 : round1(2.8 + weight * 1.3),
      opacity: pt.isHome ? 1 : Math.round((0.55 + weight * 0.42) * 100) / 100,
      isHome: pt.isHome,
      labelX: placement.labelX,
      labelY: placement.labelY,
      textAnchor: placement.textAnchor,
    };
  });

  return { mode: 'routes', homeCode, graticule, landPaths, nodes, arcs, ruler: null };
}

function buildRegionalContext(homeCoords: readonly [number, number] | null): {
  graticule: HeroGraticuleLine[];
  landPaths: string[];
} {
  if (!homeCoords) return { graticule: [], landPaths: [] };
  const scale = 6.4;
  const refLng = homeCoords[0];
  const minRx = refLng * LNG_ASPECT - HERO_VIEW_W / (2 * scale);
  const minRy = -homeCoords[1] - HERO_VIEW_H / (2 * scale);
  return {
    graticule: projectGraticule(minRx, minRy, scale, 0, 0, refLng),
    landPaths: projectLandPolygons(minRx, minRy, scale, 0, 0, refLng),
  };
}

/** Projects real flight routes, country-center fallback arcs, or a domestic ruler into SVG geometry. */
export function buildHeroGeoPlot(stats: TravelStats | null): HeroGeoPlot {
  const homeCode = (stats?.home_country_code || 'TW').toUpperCase();
  const homeCoords = getCountryCenter(homeCode);

  if (!stats || stats.total_trips === 0) {
    const ctx = buildRegionalContext(homeCoords);
    return {
      mode: 'empty',
      homeCode,
      graticule: ctx.graticule,
      landPaths: ctx.landPaths,
      nodes: [
        {
          code: homeCode,
          x: 270,
          y: 100,
          radius: 4.2,
          opacity: 0.72,
          isHome: true,
          labelX: 270,
          labelY: 115,
          textAnchor: 'middle',
        },
      ],
      arcs: [],
      ruler: null,
    };
  }

  // Prefer recorded flight pairs so overland border-crossing countries never fabricate flight arcs.
  const flightRoutes = (stats.flight_routes ?? []).slice(0, 10);
  if (flightRoutes.length > 0) {
    const pointMap = new Map<string, GeoPointInput>();
    const edges: GeoEdgeInput[] = [];

    for (const r of flightRoutes) {
      const originCode = r.origin_iata.toUpperCase();
      const destCode = r.dest_iata.toUpperCase();
      const existingOrigin = pointMap.get(originCode);
      pointMap.set(originCode, {
        code: originCode,
        lat: r.origin_lat,
        lng: r.origin_lng,
        isHome: r.origin_country_code.toUpperCase() === homeCode,
        count: (existingOrigin?.count ?? 0) + r.count,
      });
      const existingDest = pointMap.get(destCode);
      pointMap.set(destCode, {
        code: destCode,
        lat: r.dest_lat,
        lng: r.dest_lng,
        isHome: r.dest_country_code.toUpperCase() === homeCode,
        count: (existingDest?.count ?? 0) + r.count,
      });
      edges.push({ id: `${originCode}-${destCode}`, from: originCode, to: destCode, count: r.count });
    }

    const points = Array.from(pointMap.values());
    const anchor =
      points
        .filter((p) => p.isHome)
        .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code))[0] ??
      points.sort((a, b) => b.count - a.count)[0];

    return projectRouteNetwork(points, edges, anchor.lng, anchor.code, homeCode);
  }

  // Fallback for international trips without FLIGHT items logged yet.
  const countMap = stats.country_visit_counts ?? {};
  const candidateCodes = new Set<string>([
    ...Object.keys(countMap),
    ...(stats.countries_visited ?? []),
  ]);
  const foreignDests = Array.from(candidateCodes)
    .map((raw) => raw.toUpperCase())
    .filter((code) => code !== homeCode && getCountryCenter(code) !== null)
    .map((code) => ({
      code,
      count: Math.max(1, countMap[code] ?? 1),
      coords: getCountryCenter(code)!,
    }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code))
    .slice(0, 8);

  if (stats.scope !== 'domestic' && homeCoords && foreignDests.length > 0) {
    const points: GeoPointInput[] = [
      { code: homeCode, lat: homeCoords[1], lng: homeCoords[0], isHome: true, count: 999 },
      ...foreignDests.map((d) => ({
        code: d.code,
        lat: d.coords[1],
        lng: d.coords[0],
        isHome: false,
        count: d.count,
      })),
    ];
    const edges: GeoEdgeInput[] = foreignDests.map((d) => ({
      id: `${homeCode}-${d.code}`,
      from: homeCode,
      to: d.code,
      count: d.count,
    }));
    return projectRouteNetwork(points, edges, homeCoords[0], homeCode, homeCode);
  }

  const ctx = buildRegionalContext(homeCoords);
  const totalKm = stats.total_flight_distance_km + stats.total_ground_distance_km;
  const scaleMaxKm =
    RULER_STEPS_KM.find((step) => step >= Math.max(1, totalKm)) ??
    Math.ceil(totalKm / 10000) * 10000;
  const rulerWidth = 468;
  const fillWidth = Math.max(8, Math.round(Math.min(1, totalKm / scaleMaxKm) * rulerWidth));
  const ticks = Array.from({ length: 9 }, (_, i) => ({
    x: round1(36 + (i * rulerWidth) / 8),
    major: i % 2 === 0,
  }));

  return {
    mode: 'domestic',
    homeCode,
    graticule: ctx.graticule,
    landPaths: ctx.landPaths,
    nodes: [],
    arcs: [],
    ruler: { homeCode, fillWidth, scaleMaxKm, ticks },
  };
}
