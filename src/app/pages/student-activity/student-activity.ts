import { Component, OnDestroy, OnInit, inject, PLATFORM_ID, ChangeDetectorRef } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Activity, ActivityService, ActivitySubmission, AttendanceStatus } from '../../services/activity.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-student-activity',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './student-activity.html',
  styleUrl: './student-activity.scss',
})
export class StudentActivity implements OnInit, OnDestroy {
  activities: Activity[] = [];
  submissions: Record<string, ActivitySubmission | undefined> = {};
  draftContent: Record<string, string> = {};
  private readonly platformId = inject(PLATFORM_ID);
  private refreshTimer?: number;
  private readonly onVisibility = () => {
    if (document.visibilityState === 'visible') void this.loadActivities();
  };

  constructor(
    private readonly activityService: ActivityService,
    private readonly auth: AuthService,
    private readonly cdr: ChangeDetectorRef,
  ) {
    if (isPlatformBrowser(this.platformId)) {
      document.addEventListener('visibilitychange', this.onVisibility);
      this.refreshTimer = window.setInterval(() => {
        void this.loadActivities();
      }, 1000);
    }
  }

  ngOnInit(): void {
    void this.loadActivities();
  }

  private get studentID(): string | undefined {
    return this.auth.getCurrentUser()?.studentID;
  }

  private async loadActivities(): Promise<void> {
    // For now, all activities are visible to all students.
    // You can later filter by course/section.
    const sid = this.studentID;
    let nextActivities: Activity[] = [];
    try {
      nextActivities = await this.activityService.getAllActivities();
    } catch {
      nextActivities = [];
    }
    this.activities = nextActivities;

    if (!sid) {
      for (const a of this.activities) {
        this.draftContent[a.id] = this.draftContent[a.id] ?? '';
      }
      return;
    }

    let subs: ActivitySubmission[] = [];
    try {
      subs = await this.activityService.getSubmissionsForStudent(sid);
    } catch {
      subs = [];
    }

    // Update submissions but never overwrite draft when the user has entered something.
    for (const sub of subs) {
      this.submissions[sub.activityId] = sub;
      const currentDraft = (this.draftContent[sub.activityId] ?? '').trim();
      if (currentDraft.length > 0) {
        this.draftContent[sub.activityId] = this.draftContent[sub.activityId] ?? '';
      } else {
        this.draftContent[sub.activityId] = sub.content ?? '';
      }
    }

    for (const a of this.activities) {
      this.draftContent[a.id] = this.draftContent[a.id] ?? '';
    }
    this.cdr.detectChanges();
  }

  getAttendanceStatus(activity: Activity): AttendanceStatus {
    const sub = this.submissions[activity.id];
    return this.activityService.getAttendanceStatus(activity, sub);
  }

  async submit(activity: Activity): Promise<void> {
    const sid = this.studentID;
    if (!sid) {
      alert('You must be logged in as a student.');
      return;
    }

    const content = this.draftContent[activity.id] ?? '';
    if (!content.trim()) {
      alert('Please enter your answer or output before submitting.');
      return;
    }

    const now = new Date();
    const closeAt = new Date(activity.closeAt);
    if (now > closeAt) {
      alert('This activity is already closed. You cannot submit anymore.');
      return;
    }

    const submission = await this.activityService.submitOrUpdateSubmission(
      activity.id,
      sid,
      content,
    );
    this.submissions[activity.id] = submission;
  }

  ngOnDestroy(): void {
    if (isPlatformBrowser(this.platformId)) {
      if (this.refreshTimer != null) window.clearInterval(this.refreshTimer);
      document.removeEventListener('visibilitychange', this.onVisibility);
    }
  }
}
