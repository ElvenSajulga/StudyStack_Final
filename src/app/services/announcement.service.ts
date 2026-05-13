import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FirestoreService } from './firestore.service';
import { TeacherAccountService } from './teacher-account.service';
import { where } from '@angular/fire/firestore';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

/**
 * Announcement record.
 *
 * Identifier semantics — read this carefully:
 *   - `teacherID` is the teacher's *credential* (e.g. "T-0001"), matching
 *     `TeacherAccount.teacherID`. This is what `create()` writes.
 *   - `teacherUID` is the teacher's *account UID* (e.g. "teacher1"), matching
 *     `TeacherAccount.UID` and `Enrollment.teacherUID`. Newly-created records
 *     write this too, so student-side reads can match either field.
 *
 * Older records may only have `teacherID`. The resilient lookups below
 * (`getForEnrolledTeacherUIDsBulk` / `watchForEnrolledTeacherUIDs`) handle
 * both shapes by resolving UID↔teacherID via `TeacherAccountService`.
 */
export interface Announcement {
  id: string | number;
  title: string;
  message: string;
  createdAt: string; // ISO
  teacherID: string;  // teacher's credential ("T-0001")
  teacherUID?: string; // teacher's account UID ("teacher1") — present on new records
  courseId?: string;   // course this announcement targets, if any
}

@Injectable({
  providedIn: 'root',
})
export class AnnouncementService {
  private readonly API_URL = 'http://localhost:3000/announcements';
  private readonly COLLECTION = 'announcements';
  private useFirestore = true;

  constructor(
    private readonly http: HttpClient,
    private readonly firestoreService: FirestoreService,
    private readonly teacherAccountService: TeacherAccountService,
  ) {}

  /** Fetch announcements written by a single teacher, identified by credential. */
  async getForTeacher(teacherID: string): Promise<Announcement[]> {
    try {
      const list = await this.firestoreService.getAll<Announcement>(
        this.COLLECTION,
        [where('teacherID', '==', teacherID)]
      );
      return this.sortByDateDesc(list);
    } catch {
      this.useFirestore = false;
    }

    try {
      const list = await this.http
        .get<Announcement[]>(
          `${this.API_URL}?teacherID=${encodeURIComponent(teacherID)}&_sort=-createdAt`
        )
        .toPromise();
      return list ?? [];
    } catch {
      return [];
    }
  }

  async getAllForStudents(): Promise<Announcement[]> {
    try {
      const list = await this.firestoreService.getAll<Announcement>(this.COLLECTION);
      return this.sortByDateDesc(list);
    } catch {
      this.useFirestore = false;
    }

    try {
      const list = await this.http
        .get<Announcement[]>(`${this.API_URL}?_sort=-createdAt`)
        .toPromise();
      return list ?? [];
    } catch {
      return [];
    }
  }

  /**
   * Bulk resilient fetch for the student view: returns every announcement
   * authored by any of the given teacher UIDs, regardless of whether the
   * record stored the teacher under `teacherUID`, `teacherID` (credential),
   * or — for legacy records — `teacherID` accidentally storing a UID.
   *
   * Mirrors `ActivityService.getActivitiesForEnrolledTeacherUIDsBulk`.
   */
  async getForEnrolledTeacherUIDsBulk(teacherUIDs: string[]): Promise<Announcement[]> {
    if (teacherUIDs.length === 0) return [];

    try { await this.teacherAccountService.reloadFromServer(); } catch { /* keep cache */ }
    const matcher = this.buildMatcher(teacherUIDs);

    const all = await this.getAllForStudents();
    return this.sortByDateDesc(all.filter(matcher));
  }

  /**
   * Real-time stream of announcements visible to a student given their
   * enrolled teacher UIDs. Emits immediately with the current snapshot and
   * again whenever any announcement is created/updated/deleted.
   */
  watchForEnrolledTeacherUIDs(teacherUIDs: string[]): Observable<Announcement[]> {
    if (teacherUIDs.length === 0) return of([]);

    // Fire-and-forget refresh so the first snapshot has a fresh teacher map.
    void this.teacherAccountService.reloadFromServer().catch(() => undefined);

    return this.firestoreService.watchAll<Announcement>(this.COLLECTION).pipe(
      map(all => {
        const matcher = this.buildMatcher(teacherUIDs);
        return this.sortByDateDesc(all.filter(matcher));
      }),
      catchError(err => {
        console.warn('watchForEnrolledTeacherUIDs failed:', err);
        return of([] as Announcement[]);
      }),
    );
  }

  /**
   * Create an announcement.
   * Both `teacherID` (credential) and `teacherUID` (account UID) are
   * persisted when available so student-side reads can match either.
   */
  async create(
    teacherID: string,
    title: string,
    message: string,
    courseId?: string,
    teacherUID?: string,
  ): Promise<Announcement> {
    const payload: Record<string, unknown> = {
      title,
      message,
      teacherID,
      createdAt: new Date().toISOString(),
    };

    if (teacherUID) payload['teacherUID'] = teacherUID;
    if (courseId) payload['courseId'] = courseId;

    if (this.useFirestore) {
      try {
        const id = await this.firestoreService.add(this.COLLECTION, payload);
        return { id, ...payload } as Announcement;
      } catch {
        this.useFirestore = false;
      }
    }

    const created = await this.http
      .post<Announcement>(this.API_URL, payload)
      .toPromise();
    return created as Announcement;
  }

  async delete(id: string | number): Promise<void> {
    if (this.useFirestore) {
      try {
        await this.firestoreService.delete(this.COLLECTION, String(id));
        return;
      } catch {
        this.useFirestore = false;
      }
    }

    await this.http
      .delete<void>(`${this.API_URL}/${id}`)
      .toPromise();
  }

  // ─── internals ────────────────────────────────────────────────────────────

  private buildMatcher(teacherUIDs: string[]): (a: Announcement) => boolean {
    const enrolledUIDSet = new Set(teacherUIDs);
    const teachers = this.teacherAccountService.getAll();
    const uidToTeacherID = new Map<string, string>();
    for (const t of teachers) {
      if (t.UID) uidToTeacherID.set(t.UID, t.teacherID);
    }
    const enrolledTeacherIDSet = new Set<string>();
    for (const uid of teacherUIDs) {
      const tid = uidToTeacherID.get(uid);
      if (tid) enrolledTeacherIDSet.add(tid);
    }

    return (a: Announcement) => {
      if (a.teacherUID && enrolledUIDSet.has(a.teacherUID)) return true;
      if (a.teacherID && enrolledTeacherIDSet.has(a.teacherID)) return true;
      // Legacy/edge-case: teacherID field accidentally stored a UID
      if (a.teacherID && enrolledUIDSet.has(a.teacherID)) return true;
      return false;
    };
  }

  private sortByDateDesc(list: Announcement[]): Announcement[] {
    return [...list].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }
}
