import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { TravelStats } from '../../core/models/tripilot.models';
import { formatMoney } from '../../core/utils/travel-format.utils';
import { buildHeroGeoPlot, HERO_VIEW_H, HERO_VIEW_W } from './hero-geo-plot.utils';

/** Presentational single-Earth SVG map pane for the Stats Hero showing coastlines, real flight arcs, or a domestic ruler. */
@Component({
  selector: 'app-stats-hero-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      class="hero-carto"
      [attr.viewBox]="viewBox"
      preserveAspectRatio="xMidYMid meet"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <clipPath id="hero-map-clip">
          <rect x="0" y="0" [attr.width]="viewW" [attr.height]="viewH" rx="4" />
        </clipPath>
      </defs>

      @let p = plot();
      <g clip-path="url(#hero-map-clip)">
        @if (p.graticule.length > 0) {
          <g class="hero-geo-grid">
            @for (g of p.graticule; track $index) {
              <line
                [attr.x1]="g.x1"
                [attr.y1]="g.y1"
                [attr.x2]="g.x2"
                [attr.y2]="g.y2"
                [attr.stroke]="
                  g.isEquator ? 'rgba(248, 247, 244, 0.12)' : 'rgba(248, 247, 244, 0.045)'
                "
                [attr.stroke-dasharray]="g.isEquator ? '3 4' : null"
                stroke-width="1"
              />
            }
          </g>
        }

        @if (p.landPaths.length > 0) {
          <g class="hero-geo-land">
            @for (d of p.landPaths; track $index) {
              <path [attr.d]="d" />
            }
          </g>
        }
      </g>

      @switch (p.mode) {
        @case ('routes') {
          @for (arc of p.arcs; track arc.id) {
            <path
              class="hero-geo-arc"
              [attr.d]="arc.path"
              stroke="#C4924C"
              [attr.stroke-width]="arc.strokeWidth"
              [attr.stroke-opacity]="arc.opacity"
              stroke-linecap="round"
            />
          }
          @for (node of p.nodes; track node.code) {
            @if (node.isHome) {
              <circle
                class="hero-geo-home"
                [attr.cx]="node.x"
                [attr.cy]="node.y"
                [attr.r]="node.radius"
                fill="#162136"
                stroke="#C4924C"
                stroke-width="1.8"
              />
            } @else {
              <circle
                class="hero-geo-node"
                [attr.cx]="node.x"
                [attr.cy]="node.y"
                [attr.r]="node.radius"
                fill="#F3D7A4"
                [attr.fill-opacity]="node.opacity"
              />
            }
            @if (node.labelX !== null && node.labelY !== null) {
              <text
                class="hero-geo-label"
                [class.home]="node.isHome"
                [attr.x]="node.labelX"
                [attr.y]="node.labelY"
                [attr.text-anchor]="node.textAnchor"
              >
                {{ node.code }}
              </text>
            }
          }
        }
        @case ('domestic') {
          @if (p.ruler; as r) {
            <g class="hero-ruler">
              <line
                x1="36"
                y1="100"
                x2="504"
                y2="100"
                stroke="rgba(248, 247, 244, 0.18)"
                stroke-width="2"
                stroke-linecap="round"
              />
              <rect
                x="36"
                y="98.5"
                [attr.width]="r.fillWidth"
                height="3"
                rx="1.5"
                fill="#C4924C"
                fill-opacity="0.9"
              />
              @for (tick of r.ticks; track $index) {
                <line
                  [attr.x1]="tick.x"
                  [attr.y1]="tick.major ? 92 : 95"
                  [attr.x2]="tick.x"
                  [attr.y2]="tick.major ? 108 : 105"
                  [attr.stroke]="
                    tick.major ? 'rgba(248, 247, 244, 0.3)' : 'rgba(248, 247, 244, 0.14)'
                  "
                  stroke-width="1"
                />
              }
              <text class="hero-geo-label home" x="36" y="82">{{ r.homeCode }}</text>
              <text class="hero-ruler-label" x="504" y="126" text-anchor="end">
                0 – {{ formatMoney(r.scaleMaxKm) }} km
              </text>
            </g>
          }
        }
        @default {
          @for (node of p.nodes; track node.code) {
            <circle
              class="hero-geo-home"
              [attr.cx]="node.x"
              [attr.cy]="node.y"
              [attr.r]="node.radius"
              fill="#162136"
              stroke="#C4924C"
              stroke-opacity="0.6"
              stroke-width="1.6"
            />
            <text
              class="hero-geo-label home"
              [attr.x]="node.labelX"
              [attr.y]="node.labelY"
              text-anchor="middle"
            >
              {{ node.code }}
            </text>
          }
        }
      }
    </svg>
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      width: 100%;
      height: 100%;
      pointer-events: none;
    }
    .hero-carto {
      display: block;
      width: 100%;
      height: 118px;
      overflow: hidden;
      -webkit-mask-image: linear-gradient(
        to right,
        transparent 0%,
        #000 4%,
        #000 96%,
        transparent 100%
      );
      mask-image: linear-gradient(
        to right,
        transparent 0%,
        #000 4%,
        #000 96%,
        transparent 100%
      );
    }
    .hero-geo-land path {
      fill: rgba(248, 247, 244, 0.065);
      stroke: rgba(248, 247, 244, 0.12);
      stroke-width: 0.6;
      stroke-linejoin: round;
    }
    .hero-geo-label,
    .hero-ruler-label {
      font-family: var(--font-mono);
      font-size: 9.5px;
      letter-spacing: 0.05em;
    }
    .hero-geo-label {
      font-weight: 600;
      fill: rgba(248, 247, 244, 0.88);
      paint-order: stroke;
      stroke: var(--color-primary);
      stroke-width: 3.5px;
      stroke-linejoin: round;
    }
    .hero-geo-label.home {
      fill: var(--color-accent-light);
    }
    .hero-ruler-label {
      fill: rgba(248, 247, 244, 0.56);
    }
    @media (min-width: 760px) {
      .hero-carto {
        height: 176px;
      }
    }
    @media (min-width: 960px) {
      .hero-carto {
        height: 190px;
      }
    }
  `,
})
export class StatsHeroMapComponent {
  readonly stats = input<TravelStats | null>(null);

  protected readonly viewW = HERO_VIEW_W;
  protected readonly viewH = HERO_VIEW_H;
  protected readonly viewBox = `0 0 ${HERO_VIEW_W} ${HERO_VIEW_H}`;
  protected readonly formatMoney = formatMoney;
  protected readonly plot = computed(() => buildHeroGeoPlot(this.stats()));
}
