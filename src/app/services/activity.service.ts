import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export type ActivityType = 'quiz' | 'output';

export interface Activity {
    id: string;
    title: string;
    description: string;
    type: ActivityType;
    teacherID: string;
    // ISO strings for easier storage
    deadline: string;
    closeAt: string;
    maxPoints?: number;
}

export type AttendanceStatus = 'present' | 'late' | 'absent';

export interface ActivitySubmission {
    id: string;
    activityId: string;
    studentID: string;
    submittedAt: string;   // ISO
    lastEditedAt: string;  // ISO
    content: string;
    score?: number;
}

@Injectable({
    providedIn: 'root'
})
export class ActivityService {
    // Talk directly to json-server on port 3000
    private readonly ACTIVITIES_URL = 'http://localhost:3000/activities';
    private readonly SUBMISSIONS_URL = 'http://localhost:3000/activitySubmissions';

    constructor(private readonly http: HttpClient) {}

    // Activities
    getAllActivities(): Promise<Activity[]> {
        return this.http
            // json-server v1 sorts via `_sort=field` (asc) or `_sort=-field` (desc)
            .get<Activity[]>(`${this.ACTIVITIES_URL}?_sort=deadline`)
            .toPromise()
            .then(list => list ?? []);
    }

    getActivitiesForTeacher(teacherID: string): Promise<Activity[]> {
        return this.http
            .get<Activity[]>(
                `${this.ACTIVITIES_URL}?teacherID=${encodeURIComponent(teacherID)}&_sort=deadline`,
            )
            .toPromise()
            .then(list => list ?? []);
    }

    getActivityById(id: string): Promise<Activity | undefined> {
        return this.http
            .get<Activity>(`${this.ACTIVITIES_URL}/${encodeURIComponent(id)}`)
            .toPromise()
            .then(a => a ?? undefined)
            .catch(() => undefined);
    }

    async createActivity(activity: Omit<Activity, 'id'>): Promise<Activity> {
        const newActivity: Activity = {
            ...activity,
            id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
        };
        const created = await this.http
            .post<Activity>(this.ACTIVITIES_URL, newActivity)
            .toPromise();
        return created ?? newActivity;
    }

    async updateActivity(id: string, changes: Partial<Activity>): Promise<void> {
        await this.http
            .patch<void>(`${this.ACTIVITIES_URL}/${encodeURIComponent(id)}`, changes)
            .toPromise();
    }

    async deleteActivity(id: string): Promise<void> {
        // delete related submissions first (json-server has no cascade)
        const subs = await this.getSubmissionsForActivity(id);
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

    // Submissions
    getSubmissionsForActivity(activityId: string): Promise<ActivitySubmission[]> {
        return this.http
            .get<ActivitySubmission[]>(
                `${this.SUBMISSIONS_URL}?activityId=${encodeURIComponent(activityId)}`
            )
            .toPromise()
            .then(list => list ?? []);
    }

    getSubmission(activityId: string, studentID: string): Promise<ActivitySubmission | undefined> {
        return this.http
            .get<ActivitySubmission[]>(
                `${this.SUBMISSIONS_URL}?activityId=${encodeURIComponent(activityId)}&studentID=${encodeURIComponent(studentID)}`
            )
            .toPromise()
            .then(list => (list && list.length > 0 ? list[0] : undefined));
    }

    getSubmissionsForStudent(studentID: string): Promise<ActivitySubmission[]> {
        return this.http
            .get<ActivitySubmission[]>(
                `${this.SUBMISSIONS_URL}?studentID=${encodeURIComponent(studentID)}`
            )
            .toPromise()
            .then(list => list ?? []);
    }

    getSubmissionsForActivities(activityIds: string[]): Promise<ActivitySubmission[]> {
        if (activityIds.length === 0) return Promise.resolve([]);
        const query = activityIds.map(id => `activityId=${encodeURIComponent(id)}`).join('&');
        return this.http
            .get<ActivitySubmission[]>(`${this.SUBMISSIONS_URL}?${query}`)
            .toPromise()
            .then(list => list ?? []);
    }

    async submitOrUpdateSubmission(
        activityId: string,
        studentID: string,
        content: string,
    ): Promise<ActivitySubmission> {
        const nowIso = new Date().toISOString();
        const existing = await this.getSubmission(activityId, studentID);

        if (!existing) {
            const submission: ActivitySubmission = {
                id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
                activityId,
                studentID,
                content,
                submittedAt: nowIso,
                lastEditedAt: nowIso,
            };
            const created = await this.http
                .post<ActivitySubmission>(this.SUBMISSIONS_URL, submission)
                .toPromise();
            return created ?? submission;
        }

        const updated: ActivitySubmission = {
            ...existing,
            content,
            lastEditedAt: nowIso,
        };

        await this.http
            .patch<void>(`${this.SUBMISSIONS_URL}/${encodeURIComponent(existing.id)}`, {
                content,
                lastEditedAt: nowIso,
            })
            .toPromise();

        return updated;
    }

    async gradeSubmission(submissionId: string, score: number): Promise<void> {
        await this.http
            .patch<void>(`${this.SUBMISSIONS_URL}/${encodeURIComponent(submissionId)}`, { score })
            .toPromise();
    }

    // Attendance logic based on submission timing
    getAttendanceStatus(activity: Activity, submission?: ActivitySubmission): AttendanceStatus {
        const deadline = new Date(activity.deadline);
        const closeAt = new Date(activity.closeAt);

        if (!submission) {
            return 'absent';
        }

        const submittedAt = new Date(submission.submittedAt);
        const lastEditedAt = new Date(submission.lastEditedAt);

        const submittedOnTime = submittedAt.getTime() <= deadline.getTime();
        const editedAfterDeadline =
            lastEditedAt.getTime() > deadline.getTime() &&
            lastEditedAt.getTime() <= closeAt.getTime();
        const submittedLate =
            submittedAt.getTime() > deadline.getTime() &&
            submittedAt.getTime() <= closeAt.getTime();

        if (submittedOnTime && !editedAfterDeadline) {
            return 'present';
        }

        if (submittedLate || editedAfterDeadline) {
            return 'late';
        }

        // Any submission or edit after closeAt will be treated as absent
        return 'absent';
    }

    async getAttendanceForStudent(activityId: string, studentID: string): Promise<AttendanceStatus> {
        const activity = await this.getActivityById(activityId);
        if (!activity) return 'absent';

        const submission = await this.getSubmission(activityId, studentID);
        return this.getAttendanceStatus(activity, submission);
    }

    async getAttendanceSummary(activityId: string): Promise<{ studentID: string; status: AttendanceStatus }[]> {
        const activity = await this.getActivityById(activityId);
        if (!activity) return [];

        const subs = await this.getSubmissionsForActivity(activityId);
        return subs.map(sub => ({
            studentID: sub.studentID,
            status: this.getAttendanceStatus(activity, sub),
        }));
    }
}

