import { Component, computed, ElementRef, HostListener, inject, signal } from '@angular/core';
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
import { APP_VERSION, IS_BETA } from './core/config/app-version';
import { I18nService } from './core/i18n/i18n.service';
import { TranslatePipe } from './core/i18n/translate.pipe';

@Component({
  imports: [RouterLink, RouterLinkActive, RouterOutlet, TranslatePipe],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly i18n = inject(I18nService);
  protected readonly auth = inject(AuthSessionService);
  private readonly router = inject(Router);
  private readonly hostRef = inject(ElementRef<HTMLElement>);

  protected readonly appVersion = APP_VERSION;
  protected readonly isBeta = IS_BETA;
  protected readonly accountMenuOpen = signal(false);

  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  /** Hide topbar, avatar, and bottom nav on public share links, login, or unauthenticated cloud states. */
  protected readonly hideAppChrome = computed(() => {
    const url = this.currentUrl();
    if (url.startsWith('/s/') || url.startsWith('/login')) {
      return true;
    }
    return this.auth.isFirebaseEnabled() && !this.auth.isAuthenticated();
  });

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

  protected async signOut(): Promise<void> {
    this.closeAccountMenu();
    await this.auth.signOut();
    await this.router.navigateByUrl('/login');
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    if (!this.accountMenuOpen()) {
      return;
    }
    const target = event.target as HTMLElement | null;
    const menuRoot = this.hostRef.nativeElement.querySelector('.account-menu-anchor');
    if (menuRoot && target && !menuRoot.contains(target)) {
      this.accountMenuOpen.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.accountMenuOpen()) {
      this.accountMenuOpen.set(false);
    }
  }
}
