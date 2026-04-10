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
}

export type AttendanceStatus = 'present' | 'late' | 'absent';

export interface ActivitySubmission {
  id: string;
  activityId: string;
  studentID: string;
  submittedAt: string;
  lastEditedAt: string;
  content: string;
  score?: number;
}

@Injectable({
  providedIn: 'root',
})
export class ActivityService {
  private readonly ACTIVITIES_URL = 'http://localhost:3000/activities';
  private readonly SUBMISSIONS_URL = 'http://localhost:3000/activitySubmissions';
  private readonly ACT_COLLECTION = 'activities';
  private readonly SUB_COLLECTION = 'activitySubmissions';
  private useFirestore = true;

  constructor(
    private readonly http: HttpClient,
    private readonly firestoreService: FirestoreService,
  ) {}

  // ─── Activities ───────────────────────────────────────────────────────────

  async getAllActivities(): Promise<Activity[]> {
    try {
      const list = await this.firestoreService.getAll<Activity>(this.ACT_COLLECTION);
      this.useFirestore = true;
      return list.sort(
        (a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
      );
    } catch {
      this.useFirestore = false;
    }

    const list = await this.http
      .get<Activity[]>(`${this.ACTIVITIES_URL}?_sort=deadline`)
      .toPromise();
    return list ?? [];
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
    } catch {
      this.useFirestore = false;
    }

    const list = await this.http
      .get<Activity[]>(
        `${this.ACTIVITIES_URL}?teacherID=${encodeURIComponent(teacherID)}&_sort=deadline`
      )
      .toPromise();
    return list ?? [];
  }

  async getActivityById(id: string): Promise<Activity | undefined> {
    try {
      return await this.firestoreService.getById<Activity>(this.ACT_COLLECTION, id);
    } catch {
      // fallback
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

    const newActivity: Activity = { ...activity, id };

    if (this.useFirestore) {
      try {
        await this.firestoreService.set(this.ACT_COLLECTION, id, { ...newActivity });
        return newActivity;
      } catch {
        this.useFirestore = false;
      }
    }

    const created = await this.http
      .post<Activity>(this.ACTIVITIES_URL, newActivity)
      .toPromise();
    return created ?? newActivity;
  }

  async updateActivity(id: string, changes: Partial<Activity>): Promise<void> {
    if (this.useFirestore) {
      try {
        await this.firestoreService.update(this.ACT_COLLECTION, id, changes);
        return;
      } catch {
        this.useFirestore = false;
      }
    }

    await this.http
      .patch<void>(`${this.ACTIVITIES_URL}/${encodeURIComponent(id)}`, changes)
      .toPromise();
  }

  async deleteActivity(id: string): Promise<void> {
    // Delete related submissions first
    const subs = await this.getSubmissionsForActivity(id);

    if (this.useFirestore) {
      try {
        await Promise.all(
          subs.map(s => this.firestoreService.delete(this.SUB_COLLECTION, s.id))
        );
        await this.firestoreService.delete(this.ACT_COLLECTION, id);
        return;
      } catch {
        this.useFirestore = false;
      }
    }

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
  }

  // ─── Submissions ──────────────────────────────────────────────────────────

  async getSubmissionsForActivity(activityId: string): Promise<ActivitySubmission[]> {
    try {
      return await this.firestoreService.getAll<ActivitySubmission>(
        this.SUB_COLLECTION,
        [where('activityId', '==', activityId)]
      );
    } catch { /* fallback */ }

    const list = await this.http
      .get<ActivitySubmission[]>(
        `${this.SUBMISSIONS_URL}?activityId=${encodeURIComponent(activityId)}`
      )
      .toPromise();
    return list ?? [];
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
    } catch { /* fallback */ }

    const list = await this.http
      .get<ActivitySubmission[]>(
        `${this.SUBMISSIONS_URL}?activityId=${encodeURIComponent(activityId)}&studentID=${encodeURIComponent(studentID)}`
      )
      .toPromise();
    return list && list.length > 0 ? list[0] : undefined;
  }

  async getSubmissionsForStudent(studentID: string): Promise<ActivitySubmission[]> {
    try {
      return await this.firestoreService.getAll<ActivitySubmission>(
        this.SUB_COLLECTION,
        [where('studentID', '==', studentID)]
      );
    } catch { /* fallback */ }

    const list = await this.http
      .get<ActivitySubmission[]>(
        `${this.SUBMISSIONS_URL}?studentID=${encodeURIComponent(studentID)}`
      )
      .toPromise();
    return list ?? [];
  }

  async getSubmissionsForActivities(activityIds: string[]): Promise<ActivitySubmission[]> {
    if (activityIds.length === 0) return [];

    // Firestore doesn't support OR queries easily, so we fetch all and filter
    try {
      const all = await this.firestoreService.getAll<ActivitySubmission>(this.SUB_COLLECTION);
      return all.filter(s => activityIds.includes(s.activityId));
    } catch { /* fallback */ }

    const query = activityIds
      .map(id => `activityId=${encodeURIComponent(id)}`)
      .join('&');
    const list = await this.http
      .get<ActivitySubmission[]>(`${this.SUBMISSIONS_URL}?${query}`)
      .toPromise();
    return list ?? [];
  }

  async submitOrUpdateSubmission(
    activityId: string,
    studentID: string,
    content: string
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
        content,
        submittedAt: nowIso,
        lastEditedAt: nowIso,
      };

      if (this.useFirestore) {
        try {
          await this.firestoreService.set(this.SUB_COLLECTION, id, { ...submission });
          return submission;
        } catch {
          this.useFirestore = false;
        }
      }

      const created = await this.http
        .post<ActivitySubmission>(this.SUBMISSIONS_URL, submission)
        .toPromise();
      return created ?? submission;
    }

    // Update existing
    const updated: ActivitySubmission = {
      ...existing,
      content,
      lastEditedAt: nowIso,
    };

    if (this.useFirestore) {
      try {
        await this.firestoreService.update(this.SUB_COLLECTION, existing.id, {
          content,
          lastEditedAt: nowIso,
        });
        return updated;
      } catch {
        this.useFirestore = false;
      }
    }

    await this.http
      .patch<void>(
        `${this.SUBMISSIONS_URL}/${encodeURIComponent(existing.id)}`,
        { content, lastEditedAt: nowIso }
      )
      .toPromise();
    return updated;
  }

  async gradeSubmission(submissionId: string, score: number): Promise<void> {
    if (this.useFirestore) {
      try {
        await this.firestoreService.update(this.SUB_COLLECTION, submissionId, { score });
        return;
      } catch {
        this.useFirestore = false;
      }
    }

    await this.http
      .patch<void>(`${this.SUBMISSIONS_URL}/${encodeURIComponent(submissionId)}`, { score })
      .toPromise();
  }

  // ─── Attendance logic ─────────────────────────────────────────────────────

  getAttendanceStatus(
    activity: Activity,
    submission?: ActivitySubmission
  ): AttendanceStatus {
    if (!submission) return 'absent';

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

  async getAttendanceSummary(
    activityId: string
  ): Promise<{ studentID: string; status: AttendanceStatus }[]> {
    const activity = await this.getActivityById(activityId);
    if (!activity) return [];
    const subs = await this.getSubmissionsForActivity(activityId);
    return subs.map(sub => ({
      studentID: sub.studentID,
      status: this.getAttendanceStatus(activity, sub),
    }));
  }
}