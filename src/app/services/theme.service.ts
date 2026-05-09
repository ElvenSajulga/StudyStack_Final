import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'ss-theme-preference';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly subject = new BehaviorSubject<Theme>(this.resolveInitialTheme());
  readonly theme$: Observable<Theme> = this.subject.asObservable();

  constructor() {
    this.applyTheme(this.subject.value);
    this.watchSystem();
  }

  getCurrentTheme(): Theme {
    return this.subject.value;
  }

  toggleTheme(): void {
    this.setTheme(this.subject.value === 'dark' ? 'light' : 'dark');
  }

  setTheme(theme: Theme): void {
    if (theme === this.subject.value) {
      this.applyTheme(theme);
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* ignore storage errors */
    }
    this.applyTheme(theme);
    this.subject.next(theme);
  }

  private resolveInitialTheme(): Theme {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as Theme | null;
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {
      /* ignore */
    }
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  }

  private applyTheme(theme: Theme): void {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-theme', theme);
  }

  private watchSystem(): void {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = (e: MediaQueryListEvent) => {
      try {
        if (localStorage.getItem(STORAGE_KEY)) return;
      } catch { /* ignore */ }
      const next: Theme = e.matches ? 'dark' : 'light';
      this.applyTheme(next);
      this.subject.next(next);
    };
    if (mql.addEventListener) mql.addEventListener('change', listener);
    else if ((mql as any).addListener) (mql as any).addListener(listener);
  }
}
