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

const POSITRON_STYLE_URL =
  'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

/** Isolated MapLibre GL JS adapter; keeps map SDK types out of stores and features. */
@Component({
  selector: 'app-itinerary-map',
  imports: [TranslatePipe],
  template: `
    <div class="map-shell">
      <div #mapContainer class="map-canvas"></div>
      @if (pins().length === 0) {
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
  readonly selectedPinId = input<string | null>(null);
  readonly pinSelected = output<string>();

  private readonly mapContainer = viewChild.required<ElementRef<HTMLDivElement>>('mapContainer');
  private map: maplibregl.Map | null = null;
  private markers: maplibregl.Marker[] = [];
  private styleLoaded = false;

  constructor() {
    effect(() => {
      const currentPins = this.pins();
      const selectedId = this.selectedPinId();
      if (this.map) {
        this.renderPinsAndRoute(currentPins, selectedId);
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

      this.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      this.map.on('load', () => {
        this.styleLoaded = true;
        this.renderPinsAndRoute(this.pins(), this.selectedPinId());
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

  private renderPinsAndRoute(pins: MapPin[], selectedId: string | null): void {
    if (!this.map) {
      return;
    }
    this.clearMarkers();

    for (const pin of pins) {
      const isSelected = pin.id === selectedId;
      const el = document.createElement('button');
      el.type = 'button';
      el.textContent = String(pin.order);
      el.title = pin.title;
      el.style.width = isSelected ? '34px' : '28px';
      el.style.height = isSelected ? '34px' : '28px';
      el.style.borderRadius = '9999px';
      el.style.border = '2px solid #FFFFFF';
      el.style.background = isSelected ? '#C89B5B' : '#1B2A4A';
      el.style.color = '#FFFFFF';
      el.style.fontWeight = '700';
      el.style.fontSize = '12px';
      el.style.cursor = 'pointer';
      el.style.boxShadow = '0 3px 10px rgba(27, 42, 74, 0.35)';
      el.addEventListener('click', () => this.pinSelected.emit(pin.id));

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([pin.lng, pin.lat])
        .addTo(this.map);
      this.markers.push(marker);
    }

    if (this.styleLoaded) {
      const coords = pins.map((p) => [p.lng, p.lat]);
      const geojson = {
        type: 'Feature' as const,
        properties: {},
        geometry: { type: 'LineString' as const, coordinates: coords },
      };

      const existing = this.map.getSource('tripilot-route') as maplibregl.GeoJSONSource | undefined;
      if (existing) {
        existing.setData(geojson);
      } else {
        this.map.addSource('tripilot-route', { type: 'geojson', data: geojson });
        this.map.addLayer({
          id: 'tripilot-route-line',
          type: 'line',
          source: 'tripilot-route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': '#1B2A4A',
            'line-width': 3,
            'line-opacity': 0.72,
            'line-dasharray': [2, 1.5],
          },
        });
      }
    }

    if (pins.length === 1) {
      this.map.flyTo({ center: [pins[0].lng, pins[0].lat], zoom: 13, duration: 500 });
    } else if (pins.length > 1) {
      const bounds = new maplibregl.LngLatBounds();
      for (const pin of pins) {
        bounds.extend([pin.lng, pin.lat]);
      }
      this.map.fitBounds(bounds, { padding: 56, maxZoom: 14, duration: 500 });
    }
  }
}
