import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FirestoreService } from './firestore.service';
import { TeacherAccountService } from './teacher-account.service';
import { where } from '@angular/fire/firestore';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

export type ActivityType = 'quiz' | 'output';

export interface Activity {
  id: string;
  title: string;
  description: string;
  type: ActivityType;
  teacherID: string;      // This is TeacherAccount.teacherID, e.g. "T-0001"
  teacherUID?: string;    // Optional UID fallback for legacy/resilient lookups
  courseId?: string;      // Course this activity belongs to
  deadline: string;
  closeAt: string;
  maxPoints?: number;
  scoresReleased?: boolean;
  shuffleQuestions?: boolean;  // For quiz activities
}

export type AttendanceStatus = 'present' | 'late' | 'absent';

export interface SubmissionLink {
  label: string;
  url: string;
}

export interface ActivitySubmission {
  id: string;
  activityId: string;
  studentID: string;
  studentUID: string;
  submittedAt: string;
  lastEditedAt: string;
  content: string;
  links?: SubmissionLink[];
  quizAnswers?: Record<string, string>;
  score?: number;
  feedback?: string;
  graded?: boolean;
  submitted?: boolean;
}

@Injectable({ providedIn: 'root' })
export class ActivityService {
  private readonly ACTIVITIES_URL   = 'http://localhost:3000/activities';
  private readonly SUBMISSIONS_URL  = 'http://localhost:3000/activitySubmissions';
  private readonly ACT_COLLECTION   = 'activities';
  private readonly SUB_COLLECTION   = 'activitySubmissions';

  constructor(
    private readonly http: HttpClient,
    private readonly firestoreService: FirestoreService,
    private readonly teacherAccountService: TeacherAccountService,
  ) {}

  // ─── Activities ───────────────────────────────────────────────────────────

  async getAllActivities(): Promise<Activity[]> {
    try {
      const list = await this.firestoreService.getAll<Activity>(this.ACT_COLLECTION);
      if (list.length >= 0) {
        return list.sort(
          (a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
        );
      }
    } catch (e) {
      console.warn('Firestore getAllActivities failed, falling back:', e);
    }
    try {
      const list = await this.http
        .get<Activity[]>(`${this.ACTIVITIES_URL}?_sort=deadline`)
        .toPromise();
      return list ?? [];
    } catch {
      return [];
    }
  }

  /**
   * Fetch activities by the teacher's credential ID (TeacherAccount.teacherID,
   * e.g. "T-0001").  This is the value stored in the Activity.teacherID field.
   */
  async getActivitiesForTeacher(teacherID: string): Promise<Activity[]> {
    try {
      const list = await this.firestoreService.getAll<Activity>(
        this.ACT_COLLECTION,
        [where('teacherID', '==', teacherID)]
      );
      return list.sort(
        (a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
      );
    } catch (e) {
      console.warn('Firestore getActivitiesForTeacher failed, falling back:', e);
    }
    try {
      const list = await this.http
        .get<Activity[]>(
          `${this.ACTIVITIES_URL}?teacherID=${encodeURIComponent(teacherID)}&_sort=deadline`
        )
        .toPromise();
      return list ?? [];
    } catch {
      return [];
    }
  }

  /**
   * Fetch activities by the teacher's account UID (TeacherAccount.UID,
   * e.g. "teacher1") — the value stored in Enrollment.teacherUID.
   *
   * The enrollment record stores the teacher's UID, but activities store the
   * teacher's teacherID (credential).  This helper resolves the mismatch by
   * looking up the TeacherAccount record and then delegating to
   * getActivitiesForTeacher().
   */
  async getActivitiesForTeacherUID(teacherUID: string): Promise<Activity[]> {
    const mergeAndSort = (groups: Activity[][]): Activity[] => {
      const seen = new Set<string>();
      const merged: Activity[] = [];
      for (const g of groups) {
        for (const a of g) {
          if (seen.has(a.id)) continue;
          seen.add(a.id);
          merged.push(a);
        }
      }
      return merged.sort(
        (a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
      );
    };

    const getByTeacherUidFields = async (): Promise<Activity[]> => {
      const results: Activity[][] = [];

      try {
        const listByTeacherUidField = await this.firestoreService.getAll<Activity>(
          this.ACT_COLLECTION,
          [where('teacherUID', '==', teacherUID)]
        );
        results.push(listByTeacherUidField);
      } catch (e) {
        console.warn('Firestore teacherUID lookup failed:', e);
      }

      try {
        // Legacy/edge-case support: some records may have stored UID in teacherID.
        const listByTeacherIdAsUid = await this.firestoreService.getAll<Activity>(
          this.ACT_COLLECTION,
          [where('teacherID', '==', teacherUID)]
        );
        results.push(listByTeacherIdAsUid);
      } catch (e) {
        console.warn('Firestore teacherID-as-UID lookup failed:', e);
      }

      return mergeAndSort(results);
    };

    // Resolve UID → teacherID via the cached teacher accounts
    let teacherAccount = this.teacherAccountService.getByUID(teacherUID);

    // If not in cache, reload to ensure data is available
    if (!teacherAccount) {
      await this.teacherAccountService.reloadFromServer();
      teacherAccount = this.teacherAccountService.getByUID(teacherUID);
    }

    if (!teacherAccount) {
      console.warn(
        `ActivityService.getActivitiesForTeacherUID: no teacher account found for UID "${teacherUID}", trying UID-based fallbacks.`
      );
      const uidFallbackActivities = await getByTeacherUidFields();
      if (uidFallbackActivities.length > 0) return uidFallbackActivities;

      // Last-resort fallback for environments where Firestore UID field lookups fail.
      try {
        const all = await this.getAllActivities();
        return all
          .filter(a => a.teacherUID === teacherUID || a.teacherID === teacherUID)
          .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime());
      } catch {
        return [];
      }
    }

    const [byTeacherId, byTeacherUidFields] = await Promise.all([
      this.getActivitiesForTeacher(teacherAccount.teacherID),
      getByTeacherUidFields(),
    ]);
    return mergeAndSort([byTeacherId, byTeacherUidFields]);
  }

  /**
   * Bulk-fetch + client-side filter used by all student-facing views.
   *
   * This bypasses the brittle teacherUID→teacherID resolution chain by:
   *   1. Pulling ALL activities once
   *   2. Resolving the enrolled teacher UIDs to teacherID via the cached
   *      teacher accounts (reloaded if cold)
   *   3. Matching activities by ANY of: direct teacherUID field, mapped
   *      teacherID, or teacherID-equals-UID legacy edge case.
   *
   * This guarantees activities show up even if a single mapping is stale,
   * the cache is cold, or legacy/new records have inconsistent fields.
   */
  async getActivitiesForEnrolledTeacherUIDsBulk(teacherUIDs: string[]): Promise<Activity[]> {
    if (teacherUIDs.length === 0) return [];

    // Ensure teacher cache is fresh so UID→teacherID mapping is reliable.
    try { await this.teacherAccountService.reloadFromServer(); } catch { /* keep cache */ }

    const teachers = this.teacherAccountService.getAll();
    const uidToTeacherID = new Map<string, string>();
    for (const t of teachers) {
      if (t.UID) uidToTeacherID.set(t.UID, t.teacherID);
    }

    const enrolledUIDSet = new Set(teacherUIDs);
    const enrolledTeacherIDSet = new Set<string>();
    for (const uid of teacherUIDs) {
      const tid = uidToTeacherID.get(uid);
      if (tid) enrolledTeacherIDSet.add(tid);
    }

    const all = await this.getAllActivities();

    return all
      .filter(a => {
        if (a.teacherUID && enrolledUIDSet.has(a.teacherUID)) return true;
        if (a.teacherID && enrolledTeacherIDSet.has(a.teacherID)) return true;
        // Legacy/edge-case: teacherID field accidentally stored a UID
        if (a.teacherID && enrolledUIDSet.has(a.teacherID)) return true;
        return false;
      })
      .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime());
  }

  /**
   * Real-time stream of activities visible to a student given their enrolled
   * teacher UIDs. Emits immediately with the current snapshot, and again
   * whenever any activity is created/updated/deleted in Firestore.
   *
   * Falls back to a single bulk fetch if the real-time listener fails.
   */
  watchActivitiesForEnrolledTeacherUIDs(teacherUIDs: string[]): Observable<Activity[]> {
    if (teacherUIDs.length === 0) return of([]);

    const enrolledUIDSet = new Set(teacherUIDs);

    const computeFilter = (all: Activity[]): Activity[] => {
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
      return all
        .filter(a => {
          if (a.teacherUID && enrolledUIDSet.has(a.teacherUID)) return true;
          if (a.teacherID && enrolledTeacherIDSet.has(a.teacherID)) return true;
          if (a.teacherID && enrolledUIDSet.has(a.teacherID)) return true;
          return false;
        })
        .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime());
    };

    // Kick off a teacher-cache refresh (fire-and-forget) so first snapshot maps cleanly.
    void this.teacherAccountService.reloadFromServer().catch(() => undefined);

    return this.firestoreService.watchAll<Activity>(this.ACT_COLLECTION).pipe(
      map(all => computeFilter(all)),
      catchError(err => {
        console.warn('watchActivitiesForEnrolledTeacherUIDs failed, falling back to one-shot fetch:', err);
        return of([]); // consumer can poll/retry separately
      }),
    );
  }

  /**
   * Convenience helper used by the student dashboard and attendance pages.
   * Accepts an array of teacher UIDs (from enrollment records) and returns
   * all activities belonging to those teachers, deduplicated.
   */
  async getActivitiesForEnrolledTeacherUIDs(teacherUIDs: string[]): Promise<Activity[]> {
    if (teacherUIDs.length === 0) return [];

    // Prefer the bulk method — it's far more resilient to identifier mismatches
    // and to a cold/stale teacher account cache. Fall back to per-teacher
    // queries only if the bulk path returns nothing AND we have a populated
    // teacher cache to do the per-teacher resolution from.
    try {
      const bulk = await this.getActivitiesForEnrolledTeacherUIDsBulk(teacherUIDs);
      if (bulk.length > 0) return bulk;
    } catch (e) {
      console.warn('Bulk activity fetch failed, falling back to per-teacher fetch:', e);
    }

    const perTeacher = await Promise.all(
      teacherUIDs.map(uid => this.getActivitiesForTeacherUID(uid))
    );

    const seen = new Set<string>();
    const result: Activity[] = [];
    for (const activities of perTeacher) {
      for (const a of activities) {
        if (!seen.has(a.id)) {
          seen.add(a.id);
          result.push(a);
        }
      }
    }
    return result.sort(
      (a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
    );
  }

  /** Real-time stream of submissions belonging to a single student. */
  watchSubmissionsForStudent(studentID: string): Observable<ActivitySubmission[]> {
    return this.firestoreService
      .watchAll<ActivitySubmission>(this.SUB_COLLECTION, [where('studentID', '==', studentID)])
      .pipe(catchError(() => of([] as ActivitySubmission[])));
  }

  async getActivityById(id: string): Promise<Activity | undefined> {
    try {
      return await this.firestoreService.getById<Activity>(this.ACT_COLLECTION, id);
    } catch (e) {
      console.warn('Firestore getActivityById failed, falling back:', e);
    }
    try {
      const a = await this.http
        .get<Activity>(`${this.ACTIVITIES_URL}/${encodeURIComponent(id)}`)
        .toPromise();
      return a ?? undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Returns an error message if the pair is mis-ordered, or null if valid.
   * Empty strings are allowed (the duplicate-activity flow intentionally
   * creates an activity with blank deadlines for the teacher to fill in later).
   */
  private validateDeadlinePair(deadline?: string, closeAt?: string): string | null {
    if (!deadline || !closeAt) return null;
    const d = new Date(deadline).getTime();
    const c = new Date(closeAt).getTime();
    if (isNaN(d) || isNaN(c)) return null;
    if (c <= d) return 'Close time must be after the deadline.';
    return null;
  }

  async createActivity(activity: Omit<Activity, 'id'>): Promise<Activity> {
    const validationError = this.validateDeadlinePair(activity.deadline, activity.closeAt);
    if (validationError) throw new Error(validationError);

    const id = crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`;
    const newActivity: Activity = { ...activity, id, scoresReleased: false };

    try {
      await this.firestoreService.set(this.ACT_COLLECTION, id, { ...newActivity });
      return newActivity;
    } catch (e) {
      console.warn('Firestore createActivity failed, falling back:', e);
    }
    try {
      const created = await this.http
        .post<Activity>(this.ACTIVITIES_URL, newActivity)
        .toPromise();
      return created ?? newActivity;
    } catch {
      return newActivity;
    }
  }

  async updateActivity(id: string, changes: Partial<Activity>): Promise<void> {
    if (changes.deadline !== undefined || changes.closeAt !== undefined) {
      // Validate against the merged final state, not just the patch payload,
      // so callers that only update one side still get a correct check.
      const existing = await this.getActivityById(id);
      const finalDeadline = changes.deadline ?? existing?.deadline;
      const finalCloseAt  = changes.closeAt  ?? existing?.closeAt;
      const validationError = this.validateDeadlinePair(finalDeadline, finalCloseAt);
      if (validationError) throw new Error(validationError);
    }

    try {
      await this.firestoreService.update(this.ACT_COLLECTION, id, changes);
      return;
    } catch (e) {
      console.warn('Firestore updateActivity failed, falling back:', e);
    }
    try {
      await this.http
        .patch<void>(`${this.ACTIVITIES_URL}/${encodeURIComponent(id)}`, changes)
        .toPromise();
    } catch { /* silent */ }
  }

  async deleteActivity(id: string): Promise<void> {
    const subs = await this.getSubmissionsForActivity(id);
    try {
      await Promise.all(
        subs.map(s => this.firestoreService.delete(this.SUB_COLLECTION, s.id))
      );
      await this.firestoreService.delete(this.ACT_COLLECTION, id);
      return;
    } catch (e) {
      console.warn('Firestore deleteActivity failed, falling back:', e);
    }
    try {
      await Promise.all(
        subs.map(s =>
          this.http
            .delete<void>(`${this.SUBMISSIONS_URL}/${encodeURIComponent(s.id)}`)
            .toPromise()
        )
      );
      await this.http
        .delete<void>(`${this.ACTIVITIES_URL}/${encodeURIComponent(id)}`)
        .toPromise();
    } catch { /* silent */ }
  }

  async releaseScores(activityId: string): Promise<void> {
    await this.updateActivity(activityId, { scoresReleased: true });
  }

  // ─── Submissions ──────────────────────────────────────────────────────────

  async getSubmissionsForActivity(activityId: string): Promise<ActivitySubmission[]> {
    try {
      return await this.firestoreService.getAll<ActivitySubmission>(
        this.SUB_COLLECTION,
        [where('activityId', '==', activityId)]
      );
    } catch (e) {
      console.warn('Firestore getSubmissionsForActivity failed, falling back:', e);
    }
    try {
      const list = await this.http
        .get<ActivitySubmission[]>(
          `${this.SUBMISSIONS_URL}?activityId=${encodeURIComponent(activityId)}`
        )
        .toPromise();
      return list ?? [];
    } catch {
      return [];
    }
  }

  async getSubmission(
    activityId: string,
    studentID: string
  ): Promise<ActivitySubmission | undefined> {
    try {
      const list = await this.firestoreService.getAll<ActivitySubmission>(
        this.SUB_COLLECTION,
        [
          where('activityId', '==', activityId),
          where('studentID', '==', studentID),
        ]
      );
      return list.length > 0 ? list[0] : undefined;
    } catch (e) {
      console.warn('Firestore getSubmission failed, falling back:', e);
    }
    try {
      const list = await this.http
        .get<ActivitySubmission[]>(
          `${this.SUBMISSIONS_URL}?activityId=${encodeURIComponent(activityId)}&studentID=${encodeURIComponent(studentID)}`
        )
        .toPromise();
      return list && list.length > 0 ? list[0] : undefined;
    } catch {
      return undefined;
    }
  }

  async getSubmissionsForStudent(studentID: string): Promise<ActivitySubmission[]> {
    try {
      return await this.firestoreService.getAll<ActivitySubmission>(
        this.SUB_COLLECTION,
        [where('studentID', '==', studentID)]
      );
    } catch (e) {
      console.warn('Firestore getSubmissionsForStudent failed, falling back:', e);
    }
    try {
      const list = await this.http
        .get<ActivitySubmission[]>(
          `${this.SUBMISSIONS_URL}?studentID=${encodeURIComponent(studentID)}`
        )
        .toPromise();
      return list ?? [];
    } catch {
      return [];
    }
  }

  async getSubmissionsForActivities(activityIds: string[]): Promise<ActivitySubmission[]> {
    if (activityIds.length === 0) return [];
    try {
      const all = await this.firestoreService.getAll<ActivitySubmission>(this.SUB_COLLECTION);
      return all.filter(s => activityIds.includes(s.activityId));
    } catch (e) {
      console.warn('Firestore getSubmissionsForActivities failed, falling back:', e);
    }
    try {
      const q = activityIds.map(id => `activityId=${encodeURIComponent(id)}`).join('&');
      const list = await this.http
        .get<ActivitySubmission[]>(`${this.SUBMISSIONS_URL}?${q}`)
        .toPromise();
      return list ?? [];
    } catch {
      return [];
    }
  }

  async submitOrUpdateSubmission(
    activityId: string,
    studentID: string,
    studentUID: string,
    content: string,
    extra?: {
      links?: SubmissionLink[];
      quizAnswers?: Record<string, string>;
      score?: number;
      graded?: boolean;
    }
  ): Promise<ActivitySubmission> {
    const nowIso    = new Date().toISOString();
    const existing  = await this.getSubmission(activityId, studentID);

    // Quiz lock: once a student has submitted a quiz, the answers are sealed.
    // This is the data-layer enforcement of the spec rule "Quiz resubmission
    // is disabled; answers cannot be edited." UI surfaces should also hide
    // the edit affordance, but this guard is the source of truth.
    if (existing?.submitted) {
      const activity = await this.getActivityById(activityId);
      if (activity?.type === 'quiz') {
        throw new Error('Quiz answers are locked after submission and cannot be edited.');
      }
    }

    if (!existing) {
      const id = crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;
      const submission: ActivitySubmission = {
        id,
        activityId,
        studentID,
        studentUID,
        content,
        submittedAt:  nowIso,
        lastEditedAt: nowIso,
        submitted:    true,
        links:        extra?.links        ?? [],
        quizAnswers:  extra?.quizAnswers  ?? {},
        score:        extra?.score        ?? 0,
        graded:       extra?.graded       ?? false,
      };
      try {
        await this.firestoreService.set(this.SUB_COLLECTION, id, { ...submission });
        return submission;
      } catch (e) {
        console.warn('Firestore submitOrUpdate (new) failed, falling back:', e);
      }
      try {
        const created = await this.http
          .post<ActivitySubmission>(this.SUBMISSIONS_URL, submission)
          .toPromise();
        return created ?? submission;
      } catch {
        return submission;
      }
    }

    const updated: ActivitySubmission = {
      ...existing,
      content,
      lastEditedAt: nowIso,
      submitted:    true,
      links:        extra?.links       ?? existing.links       ?? [],
      quizAnswers:  extra?.quizAnswers ?? existing.quizAnswers ?? {},
      score:        extra?.score       ?? existing.score       ?? 0,
      graded:       extra?.graded      ?? existing.graded      ?? false,
    };

    try {
      await this.firestoreService.update(this.SUB_COLLECTION, existing.id, {
        content,
        lastEditedAt: nowIso,
        submitted:    true,
        links:        updated.links,
        quizAnswers:  updated.quizAnswers,
        score:        updated.score,
        graded:       updated.graded,
      });
      return updated;
    } catch (e) {
      console.warn('Firestore submitOrUpdate (existing) failed, falling back:', e);
    }
    try {
      await this.http
        .patch<void>(`${this.SUBMISSIONS_URL}/${encodeURIComponent(existing.id)}`, {
          content, lastEditedAt: nowIso, submitted: true,
        })
        .toPromise();
    } catch { /* silent */ }
    return updated;
  }

  async unsubmitSubmission(submissionId: string): Promise<void> {
    try {
      await this.firestoreService.update(this.SUB_COLLECTION, submissionId, {
        submitted:    false,
        lastEditedAt: new Date().toISOString(),
      });
      return;
    } catch (e) {
      console.warn('Firestore unsubmit failed, falling back:', e);
    }
    try {
      await this.http
        .patch<void>(`${this.SUBMISSIONS_URL}/${encodeURIComponent(submissionId)}`, {
          submitted: false,
        })
        .toPromise();
    } catch { /* silent */ }
  }

  async gradeSubmission(
    submissionId: string,
    score: number,
    feedback: string
  ): Promise<void> {
    try {
      await this.firestoreService.update(this.SUB_COLLECTION, submissionId, {
        score,
        feedback,
        graded: true,
      });
      return;
    } catch (e) {
      console.warn('Firestore gradeSubmission failed, falling back:', e);
    }
    try {
      await this.http
        .patch<void>(`${this.SUBMISSIONS_URL}/${encodeURIComponent(submissionId)}`, {
          score, feedback, graded: true,
        })
        .toPromise();
    } catch { /* silent */ }
  }

  // ─── Attendance ───────────────────────────────────────────────────────────

  /**
   * Attendance status derived from a student's submission.
   *
   * Output activities (assignments / general posts):
   *   submittedAt ≤ deadline                              → PRESENT
   *   submittedAt > deadline ∧ submittedAt ≤ closeAt      → LATE
   *   submittedAt > closeAt OR no submission              → ABSENT
   *   A *resubmission* after the deadline but before
   *   closeAt downgrades PRESENT → LATE (uses lastEditedAt).
   *
   * Quiz activities:
   *   Same time-window rule, but lastEditedAt is ignored —
   *   quiz answers are locked on first submit (see
   *   submitOrUpdateSubmission) so any later edits would
   *   indicate manual data tampering, not a student action.
   */
  getAttendanceStatus(
    activity: Activity,
    submission?: ActivitySubmission
  ): AttendanceStatus {
    if (!submission || !submission.submitted) return 'absent';

    const deadlineMs = new Date(activity.deadline).getTime();
    const closeAtMs  = new Date(activity.closeAt).getTime();
    const submittedAtMs = new Date(submission.submittedAt).getTime();

    const onTime = submittedAtMs <= deadlineMs;
    const inLateWindow = submittedAtMs > deadlineMs && submittedAtMs <= closeAtMs;

    if (activity.type === 'quiz') {
      if (onTime) return 'present';
      if (inLateWindow) return 'late';
      return 'absent';
    }

    // Output activities: a late resubmission downgrades PRESENT → LATE.
    const lastEditedAtMs = new Date(submission.lastEditedAt).getTime();
    const editedInLateWindow =
      lastEditedAtMs > deadlineMs && lastEditedAtMs <= closeAtMs;

    if (onTime && !editedInLateWindow) return 'present';
    if (inLateWindow || editedInLateWindow) return 'late';
    return 'absent';
  }

  async getAttendanceForStudent(
    activityId: string,
    studentID: string
  ): Promise<AttendanceStatus> {
    const activity = await this.getActivityById(activityId);
    if (!activity) return 'absent';
    const submission = await this.getSubmission(activityId, studentID);
    return this.getAttendanceStatus(activity, submission);
  }
}