import { Injectable, OnDestroy } from '@angular/core';
import { AcademicService, Course } from './academic.service';
import { FirestoreService } from './firestore.service';
import { Observable, ReplaySubject, Subscription } from 'rxjs';

/**
 * Cached, real-time lookup of courses by id.
 *
 * Components should prefer the synchronous `name(id)` / `course(id)` helpers
 * for template rendering. Call `ensureLoaded()` once during page init so the
 * cache is warm before the first paint.
 */
@Injectable({ providedIn: 'root' })
export class CourseLookupService implements OnDestroy {
  private cache = new Map<string, Course>();
  private readonly courses$ = new ReplaySubject<Course[]>(1);
  private loadPromise: Promise<void> | null = null;
  private watchSub: Subscription | null = null;

  constructor(
    private readonly academic: AcademicService,
    private readonly firestore: FirestoreService,
  ) {}

  /** Resolves once the cache has been populated at least once. Idempotent. */
  ensureLoaded(): Promise<void> {
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = (async () => {
      try {
        const courses = await this.academic.getCourses();
        this.applySnapshot(courses);
      } catch (e) {
        console.warn('CourseLookupService initial load failed:', e);
      }
      this.startWatch();
    })();
    return this.loadPromise;
  }

  private startWatch(): void {
    if (this.watchSub) return;
    this.watchSub = this.firestore.watchAll<Course>('courses').subscribe({
      next: courses => this.applySnapshot(courses),
      error: err => console.warn('CourseLookupService watch failed:', err),
    });
  }

  private applySnapshot(courses: Course[]): void {
    const next = new Map<string, Course>();
    for (const c of courses) next.set(c.id, c);
    this.cache = next;
    this.courses$.next(courses);
  }

  /** Synchronous lookup. Returns undefined if the cache hasn't been warmed yet. */
  course(id: string | undefined | null): Course | undefined {
    if (!id) return undefined;
    return this.cache.get(id);
  }

  /**
   * Synchronous course name. Returns `fallback` if the course is not in the
   * cache (legacy activities without a courseId, deleted courses, or the
   * cache hasn't been warmed yet).
   */
  name(id: string | undefined | null, fallback = 'Unassigned'): string {
    const c = this.course(id);
    return c?.name ?? fallback;
  }

  /** Real-time observable of the full course list. */
  watch(): Observable<Course[]> {
    return this.courses$.asObservable();
  }

  ngOnDestroy(): void {
    this.watchSub?.unsubscribe();
  }
}
