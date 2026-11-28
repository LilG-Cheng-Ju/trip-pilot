import { WORLD_LAND_POLYGONS } from '../../core/constants/world-land-contours';
import { TravelStats } from '../../core/models/tripilot.models';
import { buildHeroGeoPlot, HERO_VIEW_H, HERO_VIEW_W } from './hero-geo-plot.utils';

function baseStats(overrides: Partial<TravelStats> = {}): TravelStats {
  return {
    year: null,
    scope: 'all',
    home_country_code: 'TW',
    home_currency: 'TWD',
    available_years: [2026, 2025],
    total_trips: 4,
    domestic_trips: 0,
    international_trips: 4,
    countries_visited: ['TW', 'CZ', 'JP', 'US', 'NZ'],
    country_visit_counts: { TW: 1, CZ: 1, JP: 2, US: 1, NZ: 1 },
    total_travel_days: 30,
    flight_count: 8,
    total_flight_distance_km: 52000,
    total_ground_distance_km: 2400,
    total_spend_home: '210000',
    avg_spend_per_day: '7000',
    spend_by_category: { FLIGHT: '120000', STAY: '90000' },
    trips: [],
    ...overrides,
  };
}

describe('buildHeroGeoPlot', () => {
  it('unwraps Pacific crossings cleanly for global multi-hemisphere networks including California and New Zealand', () => {
    const plot = buildHeroGeoPlot(
      baseStats({
        flight_routes: [
          {
            origin_iata: 'TPE',
            dest_iata: 'SFO',
            origin_country_code: 'TW',
            dest_country_code: 'US',
            origin_lat: 25.0777,
            origin_lng: 121.233,
            dest_lat: 37.6213,
            dest_lng: -122.379,
            count: 2,
          },
          {
            origin_iata: 'TPE',
            dest_iata: 'AKL',
            origin_country_code: 'TW',
            dest_country_code: 'NZ',
            origin_lat: 25.0777,
            origin_lng: 121.233,
            dest_lat: -37.0082,
            dest_lng: 174.785,
            count: 2,
          },
          {
            origin_iata: 'TPE',
            dest_iata: 'PRG',
            origin_country_code: 'TW',
            dest_country_code: 'CZ',
            origin_lat: 25.0777,
            origin_lng: 121.233,
            dest_lat: 50.1008,
            dest_lng: 14.26,
            count: 2,
          },
          {
            origin_iata: 'TPE',
            dest_iata: 'KIX',
            origin_country_code: 'TW',
            dest_country_code: 'JP',
            origin_lat: 25.0777,
            origin_lng: 121.233,
            dest_lat: 34.4273,
            dest_lng: 135.244,
            count: 2,
          },
        ],
      }),
    );

    expect(plot.mode).toBe('routes');
    expect(plot.arcs.length).toBe(4);
    expect(plot.landPaths.length).toBeGreaterThanOrEqual(18);
    expect(plot.landPaths.length).toBeLessThanOrEqual(WORLD_LAND_POLYGONS.length);

    const byCode = new Map(plot.nodes.map((n) => [n.code, n]));
    const tpe = byCode.get('TPE')!;
    const sfo = byCode.get('SFO')!;
    const akl = byCode.get('AKL')!;
    const prg = byCode.get('PRG')!;

    expect(prg.x).toBeLessThan(tpe.x);
    expect(sfo.x).toBeGreaterThan(tpe.x);
    expect(akl.y).toBeGreaterThan(tpe.y);
    expect(sfo.x - prg.x).toBeGreaterThan(260);
    expect(plot.graticule.some((g) => g.isEquator)).toBe(true);

    for (const node of plot.nodes) {
      expect(node.x).toBeGreaterThanOrEqual(56);
      expect(node.x).toBeLessThanOrEqual(484);
      expect(node.y).toBeGreaterThanOrEqual(34);
      expect(node.y).toBeLessThanOrEqual(166);
      if (node.labelX !== null && node.labelY !== null) {
        expect(node.labelX).toBeGreaterThanOrEqual(18);
        expect(node.labelX).toBeLessThanOrEqual(HERO_VIEW_W - 18);
        expect(node.labelY).toBeGreaterThanOrEqual(16);
        expect(node.labelY).toBeLessThanOrEqual(HERO_VIEW_H - 10);
      }
    }
  });

  it('labels isolated long-haul hubs like SFO alongside Europe, Asia, and Oceania in 9-airport networks', () => {
    const plot = buildHeroGeoPlot(
      baseStats({
        flight_routes: [
          { origin_iata: 'TPE', dest_iata: 'KIX', origin_country_code: 'TW', dest_country_code: 'JP', origin_lat: 25.0777, origin_lng: 121.233, dest_lat: 34.4273, dest_lng: 135.244, count: 3 },
          { origin_iata: 'TPE', dest_iata: 'PRG', origin_country_code: 'TW', dest_country_code: 'CZ', origin_lat: 25.0777, origin_lng: 121.233, dest_lat: 50.1008, dest_lng: 14.26, count: 2 },
          { origin_iata: 'TPE', dest_iata: 'PUS', origin_country_code: 'TW', dest_country_code: 'KR', origin_lat: 25.0777, origin_lng: 121.233, dest_lat: 35.1795, dest_lng: 128.938, count: 2 },
          { origin_iata: 'TPE', dest_iata: 'NRT', origin_country_code: 'TW', dest_country_code: 'JP', origin_lat: 25.0777, origin_lng: 121.233, dest_lat: 35.7647, dest_lng: 140.386, count: 2 },
          { origin_iata: 'TPE', dest_iata: 'SFO', origin_country_code: 'TW', dest_country_code: 'US', origin_lat: 25.0777, origin_lng: 121.233, dest_lat: 37.6213, dest_lng: -122.379, count: 2 },
          { origin_iata: 'TPE', dest_iata: 'AKL', origin_country_code: 'TW', dest_country_code: 'NZ', origin_lat: 25.0777, origin_lng: 121.233, dest_lat: -37.0082, dest_lng: 174.785, count: 2 },
          { origin_iata: 'TSA', dest_iata: 'MZG', origin_country_code: 'TW', dest_country_code: 'TW', origin_lat: 25.0694, origin_lng: 121.552, dest_lat: 23.5687, dest_lng: 119.628, count: 2 },
        ],
      }),
    );

    const labeledCodes = new Set(
      plot.nodes.filter((n) => n.labelX !== null && n.labelY !== null).map((n) => n.code),
    );
    expect(labeledCodes.has('TPE')).toBe(true);
    expect(labeledCodes.has('PRG')).toBe(true);
    expect(labeledCodes.has('SFO')).toBe(true);
    expect(labeledCodes.has('AKL')).toBe(true);
  });

  it('places the home label below the node away from northern Eurasia arcs', () => {
    const plot = buildHeroGeoPlot(
      baseStats({
        countries_visited: ['AT', 'CZ', 'JP', 'TW'],
        flight_routes: [
          {
            origin_iata: 'TPE',
            dest_iata: 'PRG',
            origin_country_code: 'TW',
            dest_country_code: 'CZ',
            origin_lat: 25.0777,
            origin_lng: 121.233,
            dest_lat: 50.1008,
            dest_lng: 14.26,
            count: 2,
          },
          {
            origin_iata: 'TPE',
            dest_iata: 'KIX',
            origin_country_code: 'TW',
            dest_country_code: 'JP',
            origin_lat: 25.0777,
            origin_lng: 121.233,
            dest_lat: 34.4273,
            dest_lng: 135.244,
            count: 1,
          },
        ],
      }),
    );

    const tpe = plot.nodes.find((n) => n.code === 'TPE')!;
    expect(tpe.labelY).toBeGreaterThan(tpe.y);
  });

  it('renders domestic graduated ruler and empty regional land context cleanly', () => {
    const domestic = buildHeroGeoPlot(
      baseStats({
        scope: 'domestic',
        total_trips: 1,
        flight_routes: [],
        total_flight_distance_km: 0,
        total_ground_distance_km: 420,
      }),
    );
    expect(domestic.mode).toBe('domestic');
    expect(domestic.ruler?.scaleMaxKm).toBe(500);

    const empty = buildHeroGeoPlot(null);
    expect(empty.mode).toBe('empty');
    expect(empty.landPaths.length).toBeGreaterThan(0);
    expect(empty.nodes[0].code).toBe('TW');
  });
});
