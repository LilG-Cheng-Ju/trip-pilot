import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  input,
  model,
  OnDestroy,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import maplibregl from 'maplibre-gl';

import { COORDINATE_EPSILON } from '../../core/constants/app-limits';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import {
  DayMapRoutes,
  EMPTY_DAY_MAP_ROUTES,
  MapRouteMode,
} from '../../core/utils/travel-format.utils';

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
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="map-shell">
      <div #mapContainer class="map-canvas"></div>
      @if (showModeToggle()) {
        <div
          class="route-mode-toggle"
          role="group"
          [attr.aria-label]="'map.modeAria' | t"
        >
          <button
            type="button"
            class="route-mode-btn"
            [class.active]="effectiveMode() === 'schematic'"
            (click)="routeMode.set('schematic')"
          >
            {{ 'map.modeSchematic' | t }}
          </button>
          <button
            type="button"
            class="route-mode-btn"
            [class.active]="effectiveMode() === 'road'"
            (click)="routeMode.set('road')"
          >
            {{ 'map.modeRoad' | t }}
          </button>
        </div>
      }
      @if (pins().length === 0 && !stayPin() && !departureStayPin()) {
        <div class="map-empty">
          <span class="ms-icon lg" aria-hidden="true">map</span>
          <p>{{ emptyText() }}</p>
        </div>
      }
      <div class="map-attrib" [class.open]="attributionOpen()">
        @if (attributionOpen()) {
          <span class="map-attrib-links">
            <a href="https://openfreemap.org" target="_blank" rel="noopener noreferrer">
              © OpenFreeMap
            </a>
            <span aria-hidden="true">·</span>
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noopener noreferrer"
            >
              © OpenStreetMap
            </a>
          </span>
        }
        <button
          type="button"
          class="map-attrib-btn"
          [attr.aria-label]="'map.attribAria' | t"
          [attr.aria-expanded]="attributionOpen()"
          (click)="toggleAttribution()"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.4" />
            <circle cx="8" cy="4.9" r="0.85" fill="currentColor" />
            <path d="M8 7.3V11.3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
          </svg>
        </button>
      </div>
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
    .route-mode-toggle {
      position: absolute;
      top: var(--space-3);
      left: var(--space-3);
      z-index: 4;
      display: inline-flex;
      align-items: center;
      gap: 2px;
      padding: 3px;
      border-radius: 9999px;
      background: rgba(255, 255, 255, 0.92);
      backdrop-filter: blur(8px);
      border: 1px solid var(--color-border);
      box-shadow: 0 2px 10px rgba(20, 24, 31, 0.12);
    }
    .route-mode-btn {
      border: 0;
      background: transparent;
      color: var(--color-text-secondary);
      font-size: 0.75rem;
      font-weight: 600;
      line-height: 1;
      padding: 6px 10px;
      border-radius: 9999px;
      cursor: pointer;
      transition: background-color 140ms ease, color 140ms ease;
    }
    .route-mode-btn:hover:not(.active) {
      color: var(--color-text-primary);
    }
    .route-mode-btn.active {
      background: var(--color-primary, #162136);
      color: #ffffff;
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
    .map-attrib {
      position: absolute;
      right: 8px;
      bottom: 8px;
      z-index: 3;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      max-width: calc(100% - 16px);
      border-radius: 9999px;
      background: rgba(255, 255, 255, 0.84);
      backdrop-filter: blur(6px);
      border: 1px solid rgba(20, 24, 31, 0.1);
      box-shadow: 0 1px 4px rgba(20, 24, 31, 0.08);
    }
    .map-attrib.open {
      padding-left: 9px;
      background: rgba(255, 255, 255, 0.94);
    }
    .map-attrib-links {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 0.6875rem;
      line-height: 1;
      color: var(--color-text-secondary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .map-attrib-links a {
      color: inherit;
      text-decoration: none;
    }
    .map-attrib-links a:hover {
      color: var(--color-primary);
      text-decoration: underline;
    }
    .map-attrib-btn {
      display: grid;
      place-items: center;
      flex-shrink: 0;
      width: 22px;
      height: 22px;
      padding: 0;
      border: 0;
      border-radius: 9999px;
      background: transparent;
      color: var(--color-text-muted, #64748b);
      cursor: pointer;
      transition: color 140ms ease, background-color 140ms ease;
    }
    .map-attrib-btn:hover {
      color: var(--color-primary, #162136);
      background: rgba(20, 24, 31, 0.05);
    }
  `,
})
export class ItineraryMapComponent implements AfterViewInit, OnDestroy {
  readonly pins = input<MapPin[]>([]);
  readonly schematicRoutes = input<DayMapRoutes>(EMPTY_DAY_MAP_ROUTES);
  readonly roadRoutes = input<DayMapRoutes>(EMPTY_DAY_MAP_ROUTES);
  readonly allowModeToggle = input(false);
  readonly routeMode = model<MapRouteMode>('schematic');
  readonly departureStayPin = input<StayMapPin | null>(null);
  readonly stayPin = input<StayMapPin | null>(null);
  readonly selectedPinId = input<string | null>(null);
  readonly fallbackCenter = input<readonly [number, number]>([121.5654, 25.033]);
  readonly emptyText = input('');

  readonly pinSelected = output<string>();

  protected readonly attributionOpen = signal(false);

  protected readonly showModeToggle = computed(
    () =>
      this.allowModeToggle() &&
      (this.schematicRoutes().mainLegs.length > 0 ||
        this.schematicRoutes().stayLegs.length > 0),
  );
  protected readonly effectiveMode = computed<MapRouteMode>(() =>
    this.allowModeToggle() && this.routeMode() === 'road' ? 'road' : 'schematic',
  );
  protected readonly activeRoutes = computed<DayMapRoutes>(() =>
    this.effectiveMode() === 'road' ? this.roadRoutes() : this.schematicRoutes(),
  );

  private readonly mapContainer = viewChild<ElementRef<HTMLDivElement>>('mapContainer');
  private map: maplibregl.Map | null = null;
  private markers: maplibregl.Marker[] = [];
  private readonly markerEls = new Map<string, TrackedMarker>();
  private styleLoaded = false;

  constructor() {
    // Rebuild markers and fit bounds only when structural pins or stay geometry change.
    effect(() => {
      const currentPins = this.pins();
      const depStay = this.departureStayPin();
      const stay = this.stayPin();
      this.fallbackCenter();
      this.schematicRoutes();
      if (this.map && this.styleLoaded) {
        this.renderPinsAndRoute(
          currentPins,
          untracked(() => this.activeRoutes()),
          depStay,
          stay,
          untracked(() => this.effectiveMode()),
        );
        this.updateMarkerSelection(untracked(() => this.selectedPinId()));
      }
    });

    // Update route GeoJSON sources in-place when toggling Overview/Driving mode.
    effect(() => {
      const routes = this.activeRoutes();
      const mode = this.effectiveMode();
      if (this.map && this.styleLoaded) {
        this.updateRouteLayers(routes, mode);
      }
    });

    // Update marker highlight styles in-place and pan if selection sits outside viewport.
    effect(() => {
      const selected = this.selectedPinId();
      if (this.map && this.styleLoaded) {
        this.updateMarkerSelection(selected);
      }
      if (selected && this.map) {
        this.panToSelectedIfOutOfBounds(selected);
      }
    });
  }

  ngAfterViewInit(): void {
    const container = this.mapContainer()?.nativeElement;
    if (!container) {
      return;
    }

    try {
      const initialCenter = this.fallbackCenter();
      this.map = new maplibregl.Map({
        container,
        style: POSITRON_STYLE_URL,
        center: [initialCenter[0], initialCenter[1]],
        zoom: 10,
        attributionControl: false,
      });
      this.map.addControl(
        new maplibregl.NavigationControl({ showCompass: false }),
        'top-right',
      );
      this.map.on('movestart', () => this.attributionOpen.set(false));
      this.map.on('load', () => {
        this.styleLoaded = true;
        this.map?.resize();
        this.renderPinsAndRoute(
          this.pins(),
          this.activeRoutes(),
          this.departureStayPin(),
          this.stayPin(),
          this.effectiveMode(),
        );
        this.updateMarkerSelection(this.selectedPinId());
      });
    } catch {
      // Gracefully degrade in headless/WebGL-less test environments.
      this.map = null;
    }
  }

  protected toggleAttribution(): void {
    this.attributionOpen.update((open) => !open);
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

  private findSelectedPinCoords(selectedId: string): { lng: number; lat: number } | null {
    const pin = untracked(() => this.pins().find((p) => p.id === selectedId));
    if (pin && Number.isFinite(pin.lng) && Number.isFinite(pin.lat)) {
      return pin;
    }
    const stay = untracked(() => this.stayPin());
    if (stay && stay.id === selectedId && Number.isFinite(stay.lng) && Number.isFinite(stay.lat)) {
      return stay;
    }
    const depStay = untracked(() => this.departureStayPin());
    if (
      depStay &&
      depStay.id === selectedId &&
      Number.isFinite(depStay.lng) &&
      Number.isFinite(depStay.lat)
    ) {
      return depStay;
    }
    return null;
  }

  private panToSelectedIfOutOfBounds(selectedId: string): void {
    if (
      !this.map ||
      typeof this.map.getBounds !== 'function' ||
      typeof this.map.easeTo !== 'function'
    ) {
      return;
    }
    const pin = this.findSelectedPinCoords(selectedId);
    if (!pin) {
      return;
    }
    const bounds = this.map.getBounds();
    if (bounds && typeof bounds.contains === 'function' && !bounds.contains([pin.lng, pin.lat])) {
      this.map.easeTo({ center: [pin.lng, pin.lat], duration: 450 });
    }
  }

  private samePoint(pt: [number, number], target: StayMapPin | null): boolean {
    return (
      target !== null &&
      Math.abs(pt[0] - target.lng) < COORDINATE_EPSILON &&
      Math.abs(pt[1] - target.lat) < COORDINATE_EPSILON
    );
  }

  private hasHotelChange(departureStay: StayMapPin | null, stay: StayMapPin | null): boolean {
    return (
      departureStay !== null &&
      stay !== null &&
      departureStay.id !== stay.id &&
      !this.samePoint([departureStay.lng, departureStay.lat], stay)
    );
  }

  private updateRouteLayers(routes: DayMapRoutes, mode: MapRouteMode): void {
    if (!this.map) {
      return;
    }

    const lineWidth = mode === 'road' ? 3 : 2.5;
    const stayWidth = mode === 'road' ? 2.8 : 2.5;
    const stayDash = mode === 'road' ? [2, 2] : [1.5, 2.5];

    const routeGeoJson = {
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'MultiLineString' as const,
        coordinates: routes.mainLegs,
      },
    };

    const existingSource = this.map.getSource(ROUTE_SOURCE_ID) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (existingSource) {
      existingSource.setData(routeGeoJson);
      if (this.map.getLayer(ROUTE_LAYER_ID)) {
        this.map.setPaintProperty(ROUTE_LAYER_ID, 'line-width', lineWidth);
      }
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
          'line-width': lineWidth,
          'line-opacity': 0.78,
        },
      });
    }

    // Subtle champagne-gold dashed connectors for airport/basecamp hotel transfers.
    const stayLegsGeoJson = {
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'MultiLineString' as const,
        coordinates: routes.stayLegs,
      },
    };

    const existingStaySource = this.map.getSource(STAY_LEG_SOURCE_ID) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (existingStaySource) {
      existingStaySource.setData(stayLegsGeoJson);
      if (this.map.getLayer(STAY_LEG_LAYER_ID)) {
        this.map.setPaintProperty(STAY_LEG_LAYER_ID, 'line-width', stayWidth);
        this.map.setPaintProperty(STAY_LEG_LAYER_ID, 'line-dasharray', stayDash);
      }
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
          'line-width': stayWidth,
          'line-opacity': 0.85,
          'line-dasharray': stayDash,
        },
      });
    }
  }

  private renderPinsAndRoute(
    pins: MapPin[],
    routes: DayMapRoutes,
    departureStay: StayMapPin | null,
    stay: StayMapPin | null,
    mode: MapRouteMode,
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

    const isHotelChange = this.hasHotelChange(departureStay, stay);

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

    this.updateRouteLayers(routes, mode);

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
    } else {
      const center = untracked(() => this.fallbackCenter());
      this.map.jumpTo?.({ center: [center[0], center[1]], zoom: 10 });
    }
  }
}
