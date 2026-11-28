import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  signal,
} from '@angular/core';

import { SupportedLocale } from '../../core/i18n/i18n.service';
import {
  LOGIN_PREVIEW_SLIDES,
  LoginPreviewSlide,
  shufflePreviewSlides,
} from './login-preview-slides';

/** Presentational artifact stage rotating curated boarding passes and day-chapter snippets. */
@Component({
  selector: 'app-login-artifact-showcase',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="artifact-stage">
      @for (slide of [activeSlide()]; track slide.code) {
        @let copy = slide.copy[locale()];
        <div class="artifact-flight artifact-fade tabular-nums">
          <div class="artifact-flight-top">
            <span class="artifact-flight-no">
              <span class="ms-icon sm" aria-hidden="true">flight</span>
              <span>{{ slide.flightNo }}</span>
            </span>
            <span class="artifact-ref font-mono">{{ slide.bookingRef }}</span>
          </div>
          <div class="artifact-flight-route">
            <div class="artifact-port">
              <span class="artifact-iata">{{ slide.originIata }}</span>
              <span class="artifact-time">{{ slide.originTime }}</span>
            </div>
            <div class="artifact-arc">
              <span class="artifact-arc-line"></span>
              <span class="artifact-km">{{ slide.distanceKm }}</span>
            </div>
            <div class="artifact-port right">
              <span class="artifact-iata">{{ slide.destIata }}</span>
              <span class="artifact-time">{{ slide.destTime }}</span>
            </div>
          </div>
        </div>

        <div class="artifact-paper artifact-fade">
          <div class="artifact-chapter-row">
            <div class="artifact-chapter-meta">
              <span class="artifact-day font-display-italic">{{ slide.dayLabel }}</span>
              <span class="artifact-rule"></span>
              <span class="artifact-date font-mono">{{ slide.dateLabel }}</span>
            </div>
            <div class="artifact-plan-tabs">
              <span class="artifact-plan active">
                <span class="artifact-plan-dot"></span>
                <span>{{ copy.planA }}</span>
              </span>
              <span class="artifact-plan">{{ copy.planB }}</span>
            </div>
          </div>

          <div class="artifact-theme font-display">{{ copy.dayTheme }}</div>

          <div class="artifact-venue">
            <div class="artifact-venue-head">
              <span class="artifact-pin" [style.background]="slide.pinColor">
                {{ slide.pinOrder }}
              </span>
              <span class="artifact-venue-time font-mono">{{ slide.timeRange }}</span>
            </div>
            <div class="artifact-venue-title">{{ copy.spotTitle }}</div>
            <div class="artifact-local-row">
              <span class="ms-icon sm" aria-hidden="true">content_copy</span>
              <span>{{ slide.localName }}</span>
            </div>
            <div class="artifact-choices">
              <span class="artifact-choice active">
                <span class="artifact-choice-dot"></span>
                <span>{{ copy.alt1 }}</span>
              </span>
              <span class="artifact-choice">{{ copy.alt2 }}</span>
            </div>
          </div>
        </div>
      }

      <div class="artifact-switcher" role="tablist" aria-label="Sample destinations">
        @for (slide of slides(); track slide.code; let idx = $index) {
          <button
            type="button"
            role="tab"
            class="artifact-switch-btn font-mono"
            [class.active]="activeSlideIndex() === idx"
            [attr.aria-selected]="activeSlideIndex() === idx"
            (click)="selectSlide(idx)"
          >
            {{ slide.code }}
          </button>
        }
      </div>
    </div>
  `,
  styles: `
    .artifact-stage {
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-width: 396px;
    }
    .artifact-fade {
      animation: artifact-fade 200ms ease;
    }
    @keyframes artifact-fade {
      from {
        opacity: 0;
        transform: translateY(3px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .artifact-fade {
        animation: none;
      }
    }
    .artifact-flight {
      padding: 10px 13px;
      border-radius: var(--radius-md);
      background: rgba(12, 19, 34, 0.76);
      border: 1px solid rgba(248, 247, 244, 0.14);
      color: var(--color-text-on-primary);
    }
    .artifact-flight-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 6px;
      font-size: 0.72rem;
      font-weight: 600;
    }
    .artifact-flight-no {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      color: rgba(248, 247, 244, 0.92);
    }
    .artifact-ref {
      font-size: 0.66rem;
      color: rgba(248, 247, 244, 0.56);
      letter-spacing: 0.04em;
    }
    .artifact-flight-route {
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      gap: 10px;
    }
    .artifact-port {
      display: flex;
      flex-direction: column;
    }
    .artifact-port.right {
      text-align: right;
    }
    .artifact-iata {
      font-size: 1.06rem;
      font-weight: 600;
      letter-spacing: 0.04em;
      line-height: 1.1;
    }
    .artifact-time {
      font-size: 0.7rem;
      opacity: 0.72;
    }
    .artifact-arc {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 3px;
    }
    .artifact-arc-line {
      width: 100%;
      height: 1px;
      background: var(--color-accent-border);
    }
    .artifact-km {
      font-size: 0.66rem;
      font-weight: 600;
      color: var(--color-accent);
    }
    .artifact-paper {
      display: none;
      padding: 14px 16px;
      border-radius: var(--radius-md);
      background: var(--color-surface);
      color: var(--color-text-primary);
      border: 1px solid rgba(20, 24, 31, 0.12);
      box-shadow: 0 18px 40px rgba(8, 13, 24, 0.34);
    }
    .artifact-switcher {
      display: inline-flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px;
      align-self: flex-start;
    }
    .artifact-switch-btn {
      padding: 3px 8px;
      border: 1px solid rgba(248, 247, 244, 0.14);
      border-radius: var(--radius-xs);
      background: rgba(248, 247, 244, 0.04);
      color: rgba(248, 247, 244, 0.62);
      font-size: 0.66rem;
      font-weight: 600;
      letter-spacing: 0.06em;
      cursor: pointer;
      transition: background-color 140ms ease, border-color 140ms ease, color 140ms ease;
    }
    .artifact-switch-btn:hover:not(.active) {
      background: rgba(248, 247, 244, 0.1);
      color: rgba(248, 247, 244, 0.9);
    }
    .artifact-switch-btn.active {
      background: rgba(196, 146, 76, 0.18);
      border-color: var(--color-accent-border);
      color: var(--color-accent-light);
    }
    .artifact-chapter-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 4px;
    }
    .artifact-chapter-meta {
      display: inline-flex;
      align-items: baseline;
      gap: 6px;
    }
    .artifact-day {
      font-size: 0.84rem;
      font-weight: 500;
      color: var(--color-accent);
    }
    .artifact-rule {
      width: 12px;
      height: 1px;
      background: var(--color-accent-border);
      transform: translateY(-0.24em);
    }
    .artifact-date {
      font-size: 0.7rem;
      color: var(--color-text-muted);
    }
    .artifact-plan-tabs {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 0.68rem;
      font-weight: 600;
    }
    .artifact-plan {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding-bottom: 2px;
      color: var(--color-text-muted);
      border-bottom: 1.5px solid transparent;
    }
    .artifact-plan.active {
      color: var(--color-primary);
      border-bottom-color: var(--color-accent);
    }
    .artifact-plan-dot {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: var(--color-accent);
    }
    .artifact-theme {
      font-size: 1.04rem;
      font-weight: 600;
      color: var(--color-primary);
      margin-bottom: 10px;
    }
    .artifact-venue {
      padding-top: 10px;
      border-top: 1px solid var(--color-border-soft);
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .artifact-venue-head {
      display: flex;
      align-items: center;
      gap: 7px;
    }
    .artifact-pin {
      display: inline-grid;
      place-items: center;
      width: 19px;
      height: 19px;
      border-radius: 50%;
      background: var(--item-spot);
      color: #ffffff;
      font-size: 0.66rem;
      font-weight: 600;
    }
    .artifact-venue-time {
      font-size: 0.7rem;
      color: var(--color-text-muted);
    }
    .artifact-venue-title {
      font-size: 0.88rem;
      font-weight: 600;
      color: var(--color-text-primary);
    }
    .artifact-local-row {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 0.72rem;
      color: var(--color-text-secondary);
    }
    .artifact-local-row .ms-icon {
      font-size: 13px;
    }
    .artifact-choices {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 6px;
      padding-left: 8px;
      border-left: 2px solid var(--color-accent-border);
    }
    .artifact-choice {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 7px;
      border-radius: var(--radius-sm);
      background: var(--color-surface-alt);
      color: var(--color-text-secondary);
      font-size: 0.68rem;
      font-weight: 600;
    }
    .artifact-choice.active {
      background: var(--color-accent-soft);
      color: var(--color-accent-ink);
      border: 1px solid var(--color-accent-border);
    }
    .artifact-choice-dot {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: var(--color-accent);
    }
    @media (min-width: 900px) {
      .artifact-stage {
        gap: 10px;
      }
      .artifact-flight {
        padding: 13px 16px;
      }
      .artifact-flight-top {
        margin-bottom: 10px;
        font-size: 0.74rem;
      }
      .artifact-iata {
        font-size: 1.22rem;
      }
      .artifact-paper {
        display: block;
      }
    }
  `,
})
export class LoginArtifactShowcaseComponent {
  readonly locale = input.required<SupportedLocale>();
  readonly slides = input<readonly LoginPreviewSlide[]>(
    shufflePreviewSlides(LOGIN_PREVIEW_SLIDES),
  );

  protected readonly activeSlideIndex = signal(0);
  private readonly rotationSeed = signal(0);
  protected readonly activeSlide = computed(() => {
    const list = this.slides();
    return list[this.activeSlideIndex()] ?? list[0];
  });

  constructor() {
    effect((onCleanup) => {
      this.rotationSeed();
      if (
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      ) {
        return;
      }
      const timer = setInterval(() => {
        const len = this.slides().length;
        if (len > 1) {
          this.activeSlideIndex.update((idx) => (idx + 1) % len);
        }
      }, 6000);
      onCleanup(() => clearInterval(timer));
    });
  }

  protected selectSlide(index: number): void {
    this.activeSlideIndex.set(index);
    this.rotationSeed.update((s) => s + 1);
  }
}
