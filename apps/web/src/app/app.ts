import { CdkConnectedOverlay, CdkOverlayOrigin } from '@angular/cdk/overlay';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { filter, map } from 'rxjs';

import { AuthSessionService } from './core/auth/auth-session.service';
import { SessionCleanupService } from './core/auth/session-cleanup.service';
import { APP_VERSION, IS_BETA } from './core/config/app-version';
import { RELEASE_NOTES, ReleaseNoteEntry } from './core/config/release-notes.generated';
import { I18nService } from './core/i18n/i18n.service';
import { TranslatePipe } from './core/i18n/translate.pipe';
import { BackendWakeService } from './core/network/backend-wake.service';
import { NetworkStatusService } from './core/network/network-status.service';
import { PwaUpdateService } from './core/pwa/pwa-update.service';
import {
  injectMenuCloseScrollStrategy,
  isClickInsideElement,
  MENU_OVERLAY_POSITIONS,
} from './core/utils/overlay-positions';
import { AppBackendWakeOverlayComponent } from './shared/backend-wake-overlay.component';
import { MobileBottomNavComponent } from './shared/mobile-bottom-nav.component';
import { AppReleaseNotesModalComponent } from './shared/release-notes-modal.component';
import { AppUpdateToastComponent } from './shared/update-toast.component';
import { AuthStore } from './state/auth.store';

const LAST_SEEN_VERSION_KEY = 'tripilot:last_seen_version';

function readLastSeenVersion(): string | null {
  try {
    return typeof localStorage !== 'undefined'
      ? localStorage.getItem(LAST_SEEN_VERSION_KEY)
      : null;
  } catch {
    return null;
  }
}

function writeLastSeenVersion(version: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LAST_SEEN_VERSION_KEY, version);
    }
  } catch {
    // Ignore storage quota / private-browsing failures.
  }
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AppBackendWakeOverlayComponent,
    AppReleaseNotesModalComponent,
    AppUpdateToastComponent,
    CdkConnectedOverlay,
    CdkOverlayOrigin,
    MobileBottomNavComponent,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    TranslatePipe,
  ],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly i18n = inject(I18nService);
  protected readonly auth = inject(AuthSessionService);
  protected readonly authStore = inject(AuthStore);
  protected readonly backendWake = inject(BackendWakeService);
  protected readonly network = inject(NetworkStatusService);
  protected readonly pwaUpdate = inject(PwaUpdateService);
  private readonly sessionCleanup = inject(SessionCleanupService);
  private readonly router = inject(Router);
  private readonly avatarBtn = viewChild<ElementRef<HTMLButtonElement>>('avatarBtn');

  protected readonly accountOverlayPositions = MENU_OVERLAY_POSITIONS;
  protected readonly accountScrollStrategy = injectMenuCloseScrollStrategy();

  protected readonly appVersion = APP_VERSION;
  protected readonly isBeta = IS_BETA;
  protected readonly accountMenuOpen = signal(false);
  protected readonly releaseNotesOpen = signal(false);
  protected readonly whatsNewDismissed = signal(false);
  private readonly lastSeenVersion = signal<string | null>(readLastSeenVersion());

  protected readonly hasUnseenRelease = computed(
    () => this.lastSeenVersion() !== this.appVersion,
  );

  protected readonly activeUpdateNotice = computed<{
    mode: 'update-ready' | 'whats-new';
    note: ReleaseNoteEntry | null;
  } | null>(() => {
    if (this.hideAppChrome() || this.releaseNotesOpen()) {
      return null;
    }
    const pending = this.pwaUpdate.pendingUpdate();
    if (pending && !this.pwaUpdate.dismissedUpdate()) {
      return { mode: 'update-ready', note: pending.note };
    }
    const seen = this.lastSeenVersion();
    if (seen !== null && seen !== this.appVersion && !this.whatsNewDismissed()) {
      const currentNote =
        RELEASE_NOTES.find((entry) => entry.version === this.appVersion) ??
        RELEASE_NOTES[0] ??
        null;
      return { mode: 'whats-new', note: currentNote };
    }
    return null;
  });

  protected readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  /** Hide topbar, avatar, and bottom nav on public share links, auth/invite gates, or signed-out cloud states. */
  protected readonly hideAppChrome = computed(() => {
    const url = this.currentUrl();
    if (url.startsWith('/s/') || url.startsWith('/login') || url.startsWith('/invite')) {
      return true;
    }
    return this.auth.isFirebaseEnabled() && !this.auth.isAuthenticated();
  });

  constructor() {
    effect(() => {
      if (
        !this.hideAppChrome() &&
        this.auth.isAuthenticated() &&
        !this.authStore.profile()
      ) {
        void this.authStore.ensureProfileLoaded();
      }
    });
  }

  protected readonly avatarInitial = computed(() => {
    const label = this.auth.userDisplayName() || this.auth.userEmail() || 'T';
    return label.trim().charAt(0).toUpperCase() || 'T';
  });

  protected toggleAccountMenu(event: Event): void {
    event.stopPropagation();
    this.accountMenuOpen.update((v) => !v);
  }

  protected closeAccountMenu(): void {
    this.accountMenuOpen.set(false);
  }

  protected openReleaseNotes(): void {
    this.closeAccountMenu();
    this.releaseNotesOpen.set(true);
    this.markCurrentVersionSeen();
  }

  protected closeReleaseNotes(): void {
    this.releaseNotesOpen.set(false);
  }

  protected onUpdateToastReload(): void {
    void this.pwaUpdate.applyUpdate((version) => {
      this.lastSeenVersion.set(version);
      writeLastSeenVersion(version);
    });
  }

  protected onUpdateToastChangelog(): void {
    this.whatsNewDismissed.set(true);
    this.openReleaseNotes();
  }

  protected onUpdateToastDismiss(): void {
    const notice = this.activeUpdateNotice();
    if (notice?.mode === 'update-ready') {
      this.pwaUpdate.dismissPendingUpdate();
      return;
    }
    this.whatsNewDismissed.set(true);
    this.markCurrentVersionSeen();
  }

  private markCurrentVersionSeen(): void {
    this.lastSeenVersion.set(this.appVersion);
    writeLastSeenVersion(this.appVersion);
  }

  protected async signOut(): Promise<void> {
    this.closeAccountMenu();
    await this.sessionCleanup.signOutAndRedirect();
  }

  protected onAccountOutsideClick(event: MouseEvent): void {
    if (!isClickInsideElement(event, this.avatarBtn()?.nativeElement)) {
      this.accountMenuOpen.set(false);
    }
  }

  protected onAccountOverlayKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.accountMenuOpen.set(false);
    }
  }
}
