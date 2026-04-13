import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FirestoreService } from './firestore.service';
import { where } from '@angular/fire/firestore';

export type ActivityType = 'quiz' | 'output';

export interface Activity {
  id: string;
  title: string;
  description: string;
  type: ActivityType;
  teacherID: string;
  deadline: string;
  closeAt: string;
  maxPoints?: number;
  scoresReleased?: boolean;
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
  private readonly ACTIVITIES_URL = 'http://localhost:3000/activities';
  private readonly SUBMISSIONS_URL = 'http://localhost:3000/activitySubmissions';
  private readonly ACT_COLLECTION = 'activities';
  private readonly SUB_COLLECTION = 'activitySubmissions';

  constructor(
    private readonly http: HttpClient,
    private readonly firestoreService: FirestoreService,
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

  async createActivity(activity: Omit<Activity, 'id'>): Promise<Activity> {
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
    const nowIso = new Date().toISOString();
    const existing = await this.getSubmission(activityId, studentID);

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
        submittedAt: nowIso,
        lastEditedAt: nowIso,
        submitted: true,
        links: extra?.links ?? [],
        quizAnswers: extra?.quizAnswers ?? {},
        score: extra?.score ?? 0,
        graded: extra?.graded ?? false,
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
      submitted: true,
      links: extra?.links ?? existing.links ?? [],
      quizAnswers: extra?.quizAnswers ?? existing.quizAnswers ?? {},
      score: extra?.score ?? existing.score ?? 0,
      graded: extra?.graded ?? existing.graded ?? false,
    };

    try {
      await this.firestoreService.update(this.SUB_COLLECTION, existing.id, {
        content,
        lastEditedAt: nowIso,
        submitted: true,
        links: updated.links,
        quizAnswers: updated.quizAnswers,
        score: updated.score,
        graded: updated.graded,
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
        submitted: false,
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

  getAttendanceStatus(
    activity: Activity,
    submission?: ActivitySubmission
  ): AttendanceStatus {
    if (!submission || !submission.submitted) return 'absent';
    const deadline = new Date(activity.deadline);
    const closeAt = new Date(activity.closeAt);
    const submittedAt = new Date(submission.submittedAt);
    const lastEditedAt = new Date(submission.lastEditedAt);
    const submittedOnTime = submittedAt.getTime() <= deadline.getTime();
    const editedAfterDeadline =
      lastEditedAt.getTime() > deadline.getTime() &&
      lastEditedAt.getTime() <= closeAt.getTime();
    const submittedLate =
      submittedAt.getTime() > deadline.getTime() &&
      submittedAt.getTime() <= closeAt.getTime();
    if (submittedOnTime && !editedAfterDeadline) return 'present';
    if (submittedLate || editedAfterDeadline) return 'late';
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