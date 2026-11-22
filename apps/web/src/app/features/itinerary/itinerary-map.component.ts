import {
  AfterViewInit,
  Component,
  effect,
  ElementRef,
  input,
  OnDestroy,
  output,
  viewChild,
} from '@angular/core';
import maplibregl from 'maplibre-gl';

import { TranslatePipe } from '../../core/i18n/translate.pipe';

export interface MapPin {
  id: string;
  order: number;
  title: string;
  lat: number;
  lng: number;
  type: string;
}

export interface StayMapPin {
  id: string;
  title: string;
  lat: number;
  lng: number;
}

const POSITRON_STYLE_URL =
  'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

/** Isolated MapLibre GL JS adapter supporting numbered stops and basecamp Stay loop. */
@Component({
  selector: 'app-itinerary-map',
  imports: [TranslatePipe],
  template: `
    <div class="map-shell">
      <div #mapContainer class="map-canvas"></div>
      @if (pins().length === 0 && !stayPin()) {
        <div class="map-empty-overlay">
          <p>{{ 'itinerary.map.empty' | t }}</p>
        </div>
      }
    </div>
  `,
  styles: `
    .map-shell {
      position: relative;
      width: 100%;
      height: 100%;
      min-height: 380px;
      border-radius: var(--radius-md);
      overflow: hidden;
      background: var(--color-surface-muted);
      border: 1px solid var(--color-border);
    }
    .map-canvas {
      width: 100%;
      height: 100%;
    }
    .map-empty-overlay {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      padding: var(--space-5);
      background: rgba(247, 246, 242, 0.82);
      text-align: center;
      color: var(--color-text-secondary);
      font-size: 0.875rem;
      pointer-events: none;
    }
  `,
})
export class ItineraryMapComponent implements AfterViewInit, OnDestroy {
  readonly pins = input<MapPin[]>([]);
  readonly stayPin = input<StayMapPin | null>(null);
  readonly connectFromStay = input(true);
  readonly connectToStay = input(true);
  readonly selectedPinId = input<string | null>(null);
  readonly pinSelected = output<string>();

  private readonly mapContainer =
    viewChild.required<ElementRef<HTMLDivElement>>('mapContainer');
  private map: maplibregl.Map | null = null;
  private markers: maplibregl.Marker[] = [];
  private styleLoaded = false;

  constructor() {
    effect(() => {
      const currentPins = this.pins();
      const stay = this.stayPin();
      const fromStay = this.connectFromStay();
      const toStay = this.connectToStay();
      const selectedId = this.selectedPinId();
      if (this.map) {
        this.renderPinsAndRoute(currentPins, stay, fromStay, toStay, selectedId);
      }
    });
  }

  ngAfterViewInit(): void {
    try {
      this.map = new maplibregl.Map({
        container: this.mapContainer().nativeElement,
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
        this.renderPinsAndRoute(
          this.pins(),
          this.stayPin(),
          this.connectFromStay(),
          this.connectToStay(),
          this.selectedPinId(),
        );
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

  private clearMarkers(): void {
    for (const marker of this.markers) {
      marker.remove();
    }
    this.markers = [];
  }

  private renderPinsAndRoute(
    pins: MapPin[],
    stay: StayMapPin | null,
    fromStay: boolean,
    toStay: boolean,
    selectedId: string | null,
  ): void {
    if (!this.map) {
      return;
    }
    this.clearMarkers();

    // Render dedicated Warm Champagne Gold hotel marker for the active basecamp Stay.
    if (stay) {
      const stayEl = document.createElement('button');
      stayEl.type = 'button';
      stayEl.title = stay.title;
      stayEl.innerHTML =
        '<span class="ms-icon" style="font-size:18px;color:#FFFFFF;">hotel</span>';
      stayEl.style.display = 'grid';
      stayEl.style.placeItems = 'center';
      stayEl.style.width = '34px';
      stayEl.style.height = '34px';
      stayEl.style.borderRadius = '9999px';
      stayEl.style.border = '2.5px solid #1B2A4A';
      stayEl.style.background = '#C89B5B';
      stayEl.style.cursor = 'pointer';
      stayEl.style.boxShadow = '0 4px 12px rgba(27, 42, 74, 0.35)';
      stayEl.addEventListener('click', () => this.pinSelected.emit(stay.id));

      const stayMarker = new maplibregl.Marker({ element: stayEl })
        .setLngLat([stay.lng, stay.lat])
        .addTo(this.map);
      this.markers.push(stayMarker);
    }

    for (const pin of pins) {
      const isSelected = pin.id === selectedId;
      const el = document.createElement('button');
      el.type = 'button';
      el.title = pin.title;
      el.style.display = 'inline-flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
      el.style.gap = '2px';
      el.style.border = '2px solid #FFFFFF';
      el.style.background = isSelected ? '#C89B5B' : '#1B2A4A';
      el.style.color = '#FFFFFF';
      el.style.fontWeight = '700';
      el.style.fontSize = '12px';
      el.style.cursor = 'pointer';
      el.style.boxShadow = '0 3px 10px rgba(27, 42, 74, 0.35)';

      if (pin.type === 'FLIGHT') {
        el.innerHTML =
          '<span class="ms-icon" style="font-size:17px;color:#FFFFFF;">flight</span>';
        el.style.width = isSelected ? '36px' : '32px';
        el.style.height = isSelected ? '36px' : '32px';
        el.style.borderRadius = '9999px';
        el.style.border = '2px solid #C89B5B';
      } else if (pin.type === 'RESERVED_TRANSIT') {
        el.innerHTML = `<span class="ms-icon" style="font-size:15px;color:#FFFFFF;">train</span><span>${pin.order}</span>`;
        el.style.height = isSelected ? '34px' : '30px';
        el.style.padding = '0 8px';
        el.style.borderRadius = '10px';
      } else {
        el.textContent = String(pin.order);
        el.style.width = isSelected ? '34px' : '28px';
        el.style.height = isSelected ? '34px' : '28px';
        el.style.borderRadius = '9999px';
      }

      el.addEventListener('click', () => this.pinSelected.emit(pin.id));

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([pin.lng, pin.lat])
        .addTo(this.map);
      this.markers.push(marker);
    }

    if (this.styleLoaded) {
      // Primary stop-to-stop route (Deep Navy), excluding FLIGHT airport pins.
      const groundPins = pins.filter((p) => p.type !== 'FLIGHT');
      const stopCoords = groundPins.map((p) => [p.lng, p.lat]);
      const stopGeojson = {
        type: 'Feature' as const,
        properties: {},
        geometry: { type: 'LineString' as const, coordinates: stopCoords },
      };
      this.upsertLineLayer('tripilot-route', 'tripilot-route-line', stopGeojson, {
        'line-color': '#1B2A4A',
        'line-width': 3,
        'line-opacity': 0.78,
      });

      // Stay departure / return dashed connectors (Warm Champagne Gold).
      const stayLegs: number[][][] = [];
      if (stay && groundPins.length > 0) {
        if (fromStay) {
          stayLegs.push([
            [stay.lng, stay.lat],
            [groundPins[0].lng, groundPins[0].lat],
          ]);
        }
        if (toStay) {
          const last = groundPins[groundPins.length - 1];
          stayLegs.push([
            [last.lng, last.lat],
            [stay.lng, stay.lat],
          ]);
        }
      }
      const stayGeojson = {
        type: 'Feature' as const,
        properties: {},
        geometry: { type: 'MultiLineString' as const, coordinates: stayLegs },
      };
      this.upsertLineLayer('tripilot-stay-legs', 'tripilot-stay-legs-line', stayGeojson, {
        'line-color': '#C89B5B',
        'line-width': 2.5,
        'line-opacity': 0.85,
        'line-dasharray': [2.5, 2],
      });
    }

    const allPoints: [number, number][] = [
      ...pins.map((p): [number, number] => [p.lng, p.lat]),
      ...(stay ? ([[stay.lng, stay.lat]] as [number, number][]) : []),
    ];
    if (allPoints.length === 1) {
      this.map.flyTo({ center: allPoints[0], zoom: 13, duration: 500 });
    } else if (allPoints.length > 1) {
      const bounds = new maplibregl.LngLatBounds();
      for (const pt of allPoints) {
        bounds.extend(pt);
      }
      this.map.fitBounds(bounds, { padding: 56, maxZoom: 14, duration: 500 });
    }
  }

  private upsertLineLayer(
    sourceId: string,
    layerId: string,
    data: object,
    paint: maplibregl.LineLayerSpecification['paint'],
  ): void {
    if (!this.map) return;
    const existing = this.map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
    if (existing) {
      existing.setData(data as never);
      return;
    }
    this.map.addSource(sourceId, { type: 'geojson', data: data as never });
    this.map.addLayer({
      id: layerId,
      type: 'line',
      source: sourceId,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint,
    });
  }
}
