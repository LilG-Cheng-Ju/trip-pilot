import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  input,
  OnDestroy,
  output,
  untracked,
  viewChild,
} from '@angular/core';
import maplibregl from 'maplibre-gl';

import { COORDINATE_EPSILON } from '../../core/constants/app-limits';

export interface MapPin {
  id: string;
  order: number;
  title: string;
  lat: number;
  lng: number;
  type?: string;
}

export interface StayMapPin {
  id: string;
  title: string;
  lat: number;
  lng: number;
}

interface TrackedMarker {
  el: HTMLButtonElement;
  type: string;
  isStay: boolean;
}

const POSITRON_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
const ROUTE_SOURCE_ID = 'day-route-source';
const ROUTE_LAYER_ID = 'day-route-layer';
const STAY_LEG_SOURCE_ID = 'stay-leg-source';
const STAY_LEG_LAYER_ID = 'stay-leg-layer';

/** Lazy-rendered MapLibre GL JS map showing numbered daily pins, basecamp stay, and route lines. */
@Component({
  selector: 'app-itinerary-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="map-shell">
      <div #mapContainer class="map-canvas"></div>
      @if (pins().length === 0 && !stayPin() && !departureStayPin()) {
        <div class="map-empty">
          <span class="ms-icon lg" aria-hidden="true">map</span>
          <p>{{ emptyText() }}</p>
        </div>
      }
    </div>
  `,
  styles: `
    .map-shell {
      position: relative;
      width: 100%;
      height: 100%;
      min-height: 320px;
      border-radius: var(--radius-md);
      overflow: hidden;
      border: 1px solid var(--color-border);
      background: var(--color-surface-muted);
    }
    .map-canvas {
      width: 100%;
      height: 100%;
    }
    .map-empty {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--space-2);
      background: rgba(248, 247, 244, 0.88);
      color: var(--color-text-secondary);
      text-align: center;
      padding: var(--space-4);
      pointer-events: none;
    }
    .map-empty p {
      margin: 0;
      font-size: 0.875rem;
      max-width: 260px;
    }
  `,
})
export class ItineraryMapComponent implements AfterViewInit, OnDestroy {
  readonly pins = input<MapPin[]>([]);
  readonly routePath = input<[number, number][]>([]);
  readonly departureStayPin = input<StayMapPin | null>(null);
  readonly stayPin = input<StayMapPin | null>(null);
  readonly connectFromStay = input(true);
  readonly connectToStay = input(true);
  readonly selectedPinId = input<string | null>(null);
  readonly emptyText = input('');

  readonly pinSelected = output<string>();

  private readonly mapContainer = viewChild<ElementRef<HTMLDivElement>>('mapContainer');
  private map: maplibregl.Map | null = null;
  private markers: maplibregl.Marker[] = [];
  private readonly markerEls = new Map<string, TrackedMarker>();
  private styleLoaded = false;

  constructor() {
    // Rebuild markers and fit bounds only when route or pin geometry changes.
    effect(() => {
      const currentPins = this.pins();
      const path = this.routePath();
      const depStay = this.departureStayPin();
      const stay = this.stayPin();
      const fromStay = this.connectFromStay();
      const toStay = this.connectToStay();
      if (this.map && this.styleLoaded) {
        this.renderPinsAndRoute(currentPins, path, depStay, stay, fromStay, toStay);
        this.updateMarkerSelection(untracked(() => this.selectedPinId()));
      }
    });

    // Update marker highlight styles in-place on selection changes without DOM rebuilds.
    effect(() => {
      const selected = this.selectedPinId();
      if (this.map && this.styleLoaded) {
        this.updateMarkerSelection(selected);
      }
    });
  }

  ngAfterViewInit(): void {
    const container = this.mapContainer()?.nativeElement;
    if (!container) {
      return;
    }

    try {
      this.map = new maplibregl.Map({
        container,
        style: POSITRON_STYLE_URL,
        center: [139.7671, 35.6812],
        zoom: 11,
        attributionControl: false,
      });
      this.map.addControl(
        new maplibregl.NavigationControl({ showCompass: false }),
        'top-right',
      );
      this.map.on('load', () => {
        this.styleLoaded = true;
        this.map?.resize();
        this.renderPinsAndRoute(
          this.pins(),
          this.routePath(),
          this.departureStayPin(),
          this.stayPin(),
          this.connectFromStay(),
          this.connectToStay(),
        );
        this.updateMarkerSelection(this.selectedPinId());
      });
    } catch {
      // Gracefully degrade in headless/WebGL-less test environments.
      this.map = null;
    }
  }

  ngOnDestroy(): void {
    this.clearMarkers();
    this.map?.remove();
    this.map = null;
  }

  private resolveCssToken(name: string, fallback: string): string {
    if (typeof window === 'undefined') {
      return fallback;
    }
    const val = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return val || fallback;
  }

  private pinColorForType(type?: string): string {
    switch (type) {
      case 'FOOD':
        return 'var(--item-food, #d45d42)';
      case 'SPOT':
        return 'var(--item-spot, #2e7d62)';
      case 'STAY':
        return 'var(--item-stay, #c4924c)';
      case 'RESERVED_TRANSIT':
        return 'var(--item-reserved, #2f5fb3)';
      case 'FLIGHT':
      default:
        return 'var(--item-flight, #162136)';
    }
  }

  private clearMarkers(): void {
    for (const marker of this.markers) {
      marker.remove();
    }
    this.markers = [];
    this.markerEls.clear();
  }

  private applyMarkerStyle(tracked: TrackedMarker, isSelected: boolean): void {
    const { el, type, isStay } = tracked;
    if (isStay) {
      el.style.width = isSelected ? '38px' : '34px';
      el.style.height = isSelected ? '38px' : '34px';
      el.style.boxShadow = isSelected
        ? '0 0 0 3px var(--color-primary, #162136), 0 6px 16px rgba(20, 24, 31, 0.32)'
        : '0 4px 12px rgba(20, 24, 31, 0.28)';
      el.style.zIndex = isSelected ? '5' : '2';
      return;
    }

    el.style.boxShadow = isSelected
      ? '0 0 0 3px var(--color-accent, #c4924c), 0 6px 16px rgba(20, 24, 31, 0.34)'
      : '0 3px 10px rgba(20, 24, 31, 0.28)';
    el.style.zIndex = isSelected ? '5' : '1';

    if (type === 'FLIGHT') {
      el.style.width = isSelected ? '36px' : '32px';
      el.style.height = isSelected ? '36px' : '32px';
    } else if (type === 'RESERVED_TRANSIT') {
      el.style.height = isSelected ? '34px' : '30px';
    } else {
      el.style.width = isSelected ? '34px' : '28px';
      el.style.height = isSelected ? '34px' : '28px';
    }
  }

  private updateMarkerSelection(selectedId: string | null): void {
    for (const [id, tracked] of this.markerEls.entries()) {
      this.applyMarkerStyle(tracked, id === selectedId);
    }
  }

  private renderPinsAndRoute(
    pins: MapPin[],
    routePath: [number, number][],
    departureStay: StayMapPin | null,
    stay: StayMapPin | null,
    fromStay: boolean,
    toStay: boolean,
  ): void {
    if (!this.map) {
      return;
    }
    this.clearMarkers();
    const activeSelectedId = untracked(() => this.selectedPinId());

    const addStayMarker = (targetStay: StayMapPin, isDepartureOnly: boolean): void => {
      const stayEl = document.createElement('button');
      stayEl.type = 'button';
      stayEl.title = targetStay.title;
      stayEl.setAttribute('aria-label', targetStay.title);
      stayEl.innerHTML =
        '<span class="ms-icon" style="font-size:18px;color:#FFFFFF;">hotel</span>';
      stayEl.style.display = 'grid';
      stayEl.style.placeItems = 'center';
      stayEl.style.borderRadius = '9999px';
      stayEl.style.border = isDepartureOnly
        ? '2.5px solid var(--color-primary, #162136)'
        : '2.5px solid #FFFFFF';
      stayEl.style.background = isDepartureOnly
        ? 'var(--color-primary-soft, #253552)'
        : 'var(--item-stay, #c4924c)';
      stayEl.style.cursor = 'pointer';
      stayEl.style.transition = 'width 140ms ease, height 140ms ease, box-shadow 140ms ease';
      stayEl.addEventListener('click', () => this.pinSelected.emit(targetStay.id));

      const tracked: TrackedMarker = { el: stayEl, type: 'STAY', isStay: true };
      this.applyMarkerStyle(tracked, targetStay.id === activeSelectedId);
      this.markerEls.set(targetStay.id, tracked);

      const stayMarker = new maplibregl.Marker({ element: stayEl })
        .setLngLat([targetStay.lng, targetStay.lat])
        .addTo(this.map!);
      this.markers.push(stayMarker);
    };

    const isHotelChange =
      departureStay !== null && stay !== null && departureStay.id !== stay.id;

    // On hotel-change days, render both morning departure hotel and tonight's check-in hotel.
    if (isHotelChange && departureStay) {
      addStayMarker(departureStay, true);
    }
    if (stay) {
      addStayMarker(stay, false);
    } else if (departureStay) {
      addStayMarker(departureStay, true);
    }

    for (const pin of pins) {
      const pinType = pin.type ?? 'SPOT';
      const el = document.createElement('button');
      el.type = 'button';
      el.title = pin.title;
      el.setAttribute('aria-label', pin.title);
      el.style.display = 'inline-flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
      el.style.gap = '2px';
      el.style.border =
        pinType === 'FLIGHT'
          ? '2px solid var(--color-accent, #c4924c)'
          : '2px solid #FFFFFF';
      el.style.background = this.pinColorForType(pinType);
      el.style.color = '#FFFFFF';
      el.style.fontWeight = '600';
      el.style.fontSize = '12px';
      el.style.cursor = 'pointer';
      el.style.transition = 'width 140ms ease, height 140ms ease, box-shadow 140ms ease';

      if (pinType === 'FLIGHT') {
        el.innerHTML =
          '<span class="ms-icon" style="font-size:17px;color:#FFFFFF;">flight</span>';
        el.style.borderRadius = '9999px';
      } else if (pinType === 'RESERVED_TRANSIT') {
        el.innerHTML = `<span class="ms-icon" style="font-size:15px;color:#FFFFFF;">train</span><span>${pin.order}</span>`;
        el.style.padding = '0 8px';
        el.style.borderRadius = '10px';
      } else {
        el.textContent = String(pin.order);
        el.style.borderRadius = '9999px';
      }

      const tracked: TrackedMarker = { el, type: pinType, isStay: false };
      this.applyMarkerStyle(tracked, pin.id === activeSelectedId);
      this.markerEls.set(pin.id, tracked);

      el.addEventListener('click', () => this.pinSelected.emit(pin.id));

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([pin.lng, pin.lat])
        .addTo(this.map);
      this.markers.push(marker);
    }

    const lineCoords: [number, number][] =
      routePath.length >= 2
        ? routePath
        : pins.map((p): [number, number] => [p.lng, p.lat]);

    const routeGeoJson = {
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'LineString' as const,
        coordinates: lineCoords,
      },
    };

    const existingSource = this.map.getSource(ROUTE_SOURCE_ID) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (existingSource) {
      existingSource.setData(routeGeoJson);
    } else {
      this.map.addSource(ROUTE_SOURCE_ID, {
        type: 'geojson',
        data: routeGeoJson,
      });
      this.map.addLayer({
        id: ROUTE_LAYER_ID,
        type: 'line',
        source: ROUTE_SOURCE_ID,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': this.resolveCssToken('--color-primary', '#162136'),
          'line-width': 3,
          'line-opacity': 0.78,
        },
      });
    }

    // Subtle champagne-gold dashed connectors: morning leg from departureStay, evening leg to arrivalStay.
    const stayLegs: [number, number][][] = [];
    const samePoint = (pt: [number, number], target: StayMapPin | null): boolean =>
      target !== null &&
      Math.abs(pt[0] - target.lng) < COORDINATE_EPSILON &&
      Math.abs(pt[1] - target.lat) < COORDINATE_EPSILON;

    if (lineCoords.length > 0) {
      if (fromStay && departureStay && !samePoint(lineCoords[0], departureStay)) {
        stayLegs.push([[departureStay.lng, departureStay.lat], lineCoords[0]]);
      }
      if (toStay && stay && !samePoint(lineCoords[lineCoords.length - 1], stay)) {
        stayLegs.push([lineCoords[lineCoords.length - 1], [stay.lng, stay.lat]]);
      }
    }

    const stayLegsGeoJson = {
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'MultiLineString' as const,
        coordinates: stayLegs,
      },
    };

    const existingStaySource = this.map.getSource(STAY_LEG_SOURCE_ID) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (existingStaySource) {
      existingStaySource.setData(stayLegsGeoJson);
    } else {
      this.map.addSource(STAY_LEG_SOURCE_ID, {
        type: 'geojson',
        data: stayLegsGeoJson,
      });
      this.map.addLayer({
        id: STAY_LEG_LAYER_ID,
        type: 'line',
        source: STAY_LEG_SOURCE_ID,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': this.resolveCssToken('--color-accent', '#c4924c'),
          'line-width': 2.5,
          'line-opacity': 0.85,
          'line-dasharray': [1.5, 2.5],
        },
      });
    }

    const allPoints: [number, number][] = [
      ...pins.map((p): [number, number] => [p.lng, p.lat]),
      ...(departureStay ? [[departureStay.lng, departureStay.lat] as [number, number]] : []),
      ...(stay ? [[stay.lng, stay.lat] as [number, number]] : []),
    ];

    if (allPoints.length === 1) {
      this.map.flyTo({ center: allPoints[0], zoom: 13, duration: 500 });
    } else if (allPoints.length > 1) {
      const bounds = new maplibregl.LngLatBounds();
      for (const pt of allPoints) {
        bounds.extend(pt);
      }
      this.map.fitBounds(bounds, { padding: 48, maxZoom: 14, duration: 500 });
    }
  }
}
