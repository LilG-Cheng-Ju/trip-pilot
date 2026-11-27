import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';

import { I18nService } from '../core/i18n/i18n.service';
import { TranslatePipe } from '../core/i18n/translate.pipe';
import {
  BACKEND_WAKE_MESSAGES,
  pickNextWakeIndex,
  WakeMessage,
} from './backend-wake-messages';

const AUTO_ROTATE_INTERVAL_MS = 5800;

/** Editorial cold-start lock overlay with flight-track animation and rotating travel tips/jokes. */
@Component({
  selector: 'app-backend-wake-overlay',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  template: `
    @if (active()) {
      <div
        class="wake-backdrop"
        [class.full-screen]="!hasTopbar()"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <section class="wake-card">
          <div class="wake-head">
            <div class="wake-title-wrap">
              <span class="wake-pulse" aria-hidden="true"></span>
              <h2 class="wake-title font-display">{{ 'wake.title' | t }}</h2>
            </div>
            @if (previewMode()) {
              <button
                type="button"
                class="preview-exit-btn"
                (click)="previewDismissed.emit()"
              >
                {{ 'wake.closePreview' | t }}
              </button>
            }
          </div>

          <p class="wake-sub">{{ 'wake.subtitle' | t }}</p>

          <div class="flight-track" aria-hidden="true">
            <div class="flight-rail">
              <div class="flight-beam"></div>
            </div>
            <span class="flight-dot start"></span>
            <span class="flight-dot end"></span>
            <span class="ms-icon sm flight-plane">flight</span>
          </div>

          <div class="wake-note">
            <span class="wake-tag" [class.fun]="currentMessage().kind === 'fun'">
              {{ currentMessage().tag[i18n.locale()] }}
            </span>
            <p class="wake-copy">{{ currentMessage().text[i18n.locale()] }}</p>
            <div class="wake-note-foot">
              <button type="button" class="wake-next-btn" (click)="nextMessage()">
                <span class="ms-icon sm" aria-hidden="true">refresh</span>
                <span>{{ 'wake.next' | t }}</span>
              </button>
            </div>
          </div>
        </section>
      </div>
    }
  `,
  styles: `
    .wake-backdrop {
      position: fixed;
      inset: var(--topbar-height) 0 0 0;
      z-index: 40;
      display: grid;
      place-items: center;
      padding: var(--space-3);
      background: rgba(248, 247, 244, 0.88);
      backdrop-filter: blur(10px);
      animation: wake-fade-in 180ms ease;
    }
    .wake-backdrop.full-screen {
      inset: 0;
    }
    .wake-card {
      width: min(420px, 100%);
      padding: var(--space-4);
      border-radius: var(--radius-lg);
      border: 1px solid var(--color-border);
      background: var(--color-surface);
      box-shadow: var(--shadow-float);
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .wake-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .wake-title-wrap {
      display: inline-flex;
      align-items: center;
      gap: 9px;
      min-width: 0;
    }
    .wake-pulse {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: var(--color-accent);
      box-shadow: 0 0 0 4px var(--color-accent-tint);
      animation: wake-dot-pulse 1.5s ease-in-out infinite;
      flex-shrink: 0;
    }
    .wake-title {
      margin: 0;
      font-size: 1.1rem;
      font-weight: 600;
      line-height: 1.2;
      color: var(--color-primary);
    }
    .preview-exit-btn {
      padding: 4px 10px;
      border-radius: var(--radius-pill);
      border: 1px solid var(--color-border);
      background: var(--color-surface-alt);
      color: var(--color-text-secondary);
      font: inherit;
      font-size: 0.72rem;
      font-weight: 600;
      cursor: pointer;
    }
    .preview-exit-btn:hover {
      border-color: var(--color-primary);
      color: var(--color-primary);
    }
    .wake-sub {
      margin: 0;
      font-size: 0.76rem;
      line-height: 1.4;
      color: var(--color-text-secondary);
    }
    .flight-track {
      position: relative;
      height: 22px;
      display: flex;
      align-items: center;
      margin: 2px 0;
    }
    .flight-rail {
      position: relative;
      width: 100%;
      height: 2px;
      border-radius: var(--radius-pill);
      background: var(--color-surface-muted);
      overflow: hidden;
    }
    .flight-beam {
      position: absolute;
      inset: 0 auto 0 0;
      width: 42%;
      border-radius: var(--radius-pill);
      background: linear-gradient(
        90deg,
        transparent 0%,
        var(--color-accent) 60%,
        var(--color-primary) 100%
      );
      animation: flight-beam-slide 2.2s ease-in-out infinite;
    }
    .flight-dot {
      position: absolute;
      top: 50%;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      transform: translateY(-50%);
      background: var(--color-border-strong);
    }
    .flight-dot.start {
      left: 0;
      background: var(--color-accent);
    }
    .flight-dot.end {
      right: 0;
    }
    .flight-plane {
      position: absolute;
      top: 50%;
      left: 0;
      font-size: 17px;
      color: var(--color-primary);
      transform: translate(-50%, -50%) rotate(90deg);
      animation: flight-plane-glide 2.2s ease-in-out infinite;
      filter: drop-shadow(0 1px 2px rgba(255, 255, 255, 0.9));
    }
    .wake-note {
      padding: 10px 12px;
      border-radius: var(--radius-md);
      background: var(--color-bg);
      border: 1px solid var(--color-border-soft);
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .wake-tag {
      align-self: flex-start;
      padding: 2px 8px;
      border-radius: var(--radius-pill);
      background: var(--color-primary-tint);
      color: var(--color-primary);
      font-size: 0.7rem;
      font-weight: 600;
      letter-spacing: 0.02em;
    }
    .wake-tag.fun {
      background: var(--color-accent-soft);
      color: var(--color-accent-ink);
    }
    .wake-copy {
      margin: 0;
      font-size: 0.8125rem;
      line-height: 1.5;
      color: var(--color-text-primary);
    }
    .wake-note-foot {
      display: flex;
      justify-content: flex-end;
    }
    .wake-next-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 9px;
      border-radius: var(--radius-sm);
      border: 1px solid var(--color-border);
      background: var(--color-surface);
      color: var(--color-text-secondary);
      font: inherit;
      font-size: 0.72rem;
      font-weight: 600;
      cursor: pointer;
      transition: border-color 140ms ease, color 140ms ease;
    }
    .wake-next-btn:hover {
      border-color: var(--color-primary);
      color: var(--color-primary);
    }
    @media (min-width: 640px) {
      .wake-backdrop {
        padding: var(--space-4);
      }
      .wake-card {
        padding: var(--space-5);
        gap: var(--space-3);
      }
      .wake-title {
        font-size: 1.22rem;
      }
      .wake-sub {
        font-size: 0.8125rem;
      }
      .wake-note {
        padding: 12px 14px;
        gap: 8px;
      }
      .wake-copy {
        font-size: 0.85rem;
        line-height: 1.55;
      }
      .wake-next-btn {
        padding: 4px 10px;
        font-size: 0.74rem;
      }
    }
    @keyframes wake-fade-in {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }
    @keyframes wake-dot-pulse {
      0%,
      100% {
        transform: scale(1);
        opacity: 1;
      }
      50% {
        transform: scale(1.18);
        opacity: 0.72;
      }
    }
    @keyframes flight-beam-slide {
      0% {
        left: -42%;
      }
      100% {
        left: 100%;
      }
    }
    @keyframes flight-plane-glide {
      0% {
        left: 4%;
        opacity: 0.4;
      }
      15% {
        opacity: 1;
      }
      85% {
        opacity: 1;
      }
      100% {
        left: 96%;
        opacity: 0.4;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .wake-backdrop,
      .wake-pulse,
      .flight-beam,
      .flight-plane {
        animation: none;
      }
      .flight-plane {
        left: 50%;
      }
      .flight-beam {
        left: 0;
        width: 50%;
      }
    }
  `,
})
export class AppBackendWakeOverlayComponent {
  protected readonly i18n = inject(I18nService);

  readonly active = input.required<boolean>();
  readonly hasTopbar = input(true);
  readonly previewMode = input(false);
  readonly previewDismissed = output<void>();

  private readonly currentIndex = signal(0);
  private readonly rotationSeed = signal(0);
  private wasActive = false;

  protected readonly currentMessage = computed<WakeMessage>(
    () => BACKEND_WAKE_MESSAGES[this.currentIndex()] ?? BACKEND_WAKE_MESSAGES[0],
  );

  constructor() {
    effect((onCleanup) => {
      const isActive = this.active();
      this.rotationSeed();

      if (!isActive) {
        this.wasActive = false;
        return;
      }

      if (!this.wasActive) {
        this.wasActive = true;
        untracked(() => {
          this.currentIndex.set(
            pickNextWakeIndex(BACKEND_WAKE_MESSAGES.length, this.currentIndex()),
          );
        });
      }

      const timer = setInterval(() => {
        this.currentIndex.update((idx) =>
          pickNextWakeIndex(BACKEND_WAKE_MESSAGES.length, idx),
        );
      }, AUTO_ROTATE_INTERVAL_MS);

      onCleanup(() => clearInterval(timer));
    });
  }

  protected nextMessage(): void {
    this.currentIndex.update((idx) => pickNextWakeIndex(BACKEND_WAKE_MESSAGES.length, idx));
    this.rotationSeed.update((s) => s + 1);
  }
}
