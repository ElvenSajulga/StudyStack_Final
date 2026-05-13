import { Injectable } from '@angular/core';
import { FirestoreService } from './firestore.service';
import { TeacherAccountService } from './teacher-account.service';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

/**
 * Learning material posted by a teacher for a specific course.
 *
 * Two flavours per D14:
 *   - kind='link' → external URL (no payload stored)
 *   - kind='file' → small base64 data URL inlined in Firestore (≤700 KB encoded,
 *     enforced by `fileToBase64DataUrl`).
 *
 * Identifier semantics mirror Announcement: both `teacherID` (credential) and
 * `teacherUID` (account UID) are written so student-side reads can match either.
 */
export interface LearningMaterial {
  id: string | number;
  title: string;
  description?: string;
  kind: 'link' | 'file';

  // Link payload
  linkUrl?: string;

  // File payload
  fileDataUrl?: string;
  fileName?: string;
  fileMimeType?: string;
  fileSize?: number; // encoded bytes

  // Ownership / scope
  teacherID: string;     // teacher credential ("T-0001")
  teacherUID?: string;   // teacher account UID ("teacher1")
  courseId: string;
  createdAt: string;     // ISO
}

@Injectable({ providedIn: 'root' })
export class LearningMaterialService {
  private readonly COLLECTION = 'learning-materials';

  constructor(
    private readonly fs: FirestoreService,
    private readonly teacherAccountService: TeacherAccountService,
  ) {}

  /** All materials posted by one teacher (credential). */
  async getForTeacher(teacherID: string): Promise<LearningMaterial[]> {
    try {
      const list = await this.fs.getAll<LearningMaterial>(this.COLLECTION);
      return this.sortByDateDesc(list.filter(m => m.teacherID === teacherID));
    } catch {
      return [];
    }
  }

  /** Real-time stream of all materials posted by one teacher (credential). */
  watchForTeacher(teacherID: string): Observable<LearningMaterial[]> {
    return this.fs.watchAll<LearningMaterial>(this.COLLECTION).pipe(
      map(all => this.sortByDateDesc(all.filter(m => m.teacherID === teacherID))),
      catchError(err => {
        console.warn('watchForTeacher (materials) failed:', err);
        return of([] as LearningMaterial[]);
      }),
    );
  }

  /**
   * Real-time stream of materials visible to a student given their enrolled
   * teacher UIDs. Matches against both `teacherUID` (modern) and
   * `teacherID` resolved through `TeacherAccountService` (legacy / cross-shape).
   */
  watchForEnrolledTeacherUIDs(teacherUIDs: string[]): Observable<LearningMaterial[]> {
    if (teacherUIDs.length === 0) return of([]);
    void this.teacherAccountService.reloadFromServer().catch(() => undefined);

    return this.fs.watchAll<LearningMaterial>(this.COLLECTION).pipe(
      map(all => {
        const matcher = this.buildMatcher(teacherUIDs);
        return this.sortByDateDesc(all.filter(matcher));
      }),
      catchError(err => {
        console.warn('watchForEnrolledTeacherUIDs (materials) failed:', err);
        return of([] as LearningMaterial[]);
      }),
    );
  }

  /** Bulk (non-stream) fetch for student-side initial render or sort. */
  async getForEnrolledTeacherUIDsBulk(teacherUIDs: string[]): Promise<LearningMaterial[]> {
    if (teacherUIDs.length === 0) return [];
    try { await this.teacherAccountService.reloadFromServer(); } catch { /* keep cache */ }

    try {
      const all = await this.fs.getAll<LearningMaterial>(this.COLLECTION);
      const matcher = this.buildMatcher(teacherUIDs);
      return this.sortByDateDesc(all.filter(matcher));
    } catch {
      return [];
    }
  }

  async create(
    material: Omit<LearningMaterial, 'id' | 'createdAt'>,
  ): Promise<LearningMaterial> {
    const payload = {
      ...material,
      createdAt: new Date().toISOString(),
    };
    const id = await this.fs.add(this.COLLECTION, payload);
    return { id, ...payload } as LearningMaterial;
  }

  async delete(id: string | number): Promise<void> {
    await this.fs.delete(this.COLLECTION, String(id));
  }

  // ─── internals ────────────────────────────────────────────────────────────

  private buildMatcher(teacherUIDs: string[]): (m: LearningMaterial) => boolean {
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

    return (m: LearningMaterial) => {
      if (m.teacherUID && enrolledUIDSet.has(m.teacherUID)) return true;
      if (m.teacherID && enrolledTeacherIDSet.has(m.teacherID)) return true;
      if (m.teacherID && enrolledUIDSet.has(m.teacherID)) return true;
      return false;
    };
  }

  private sortByDateDesc(list: LearningMaterial[]): LearningMaterial[] {
    return [...list].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }
}
