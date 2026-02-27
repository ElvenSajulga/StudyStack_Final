import { Component, OnDestroy, inject } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Activity, ActivityService, ActivitySubmission, AttendanceStatus } from '../../services/activity.service';
import { AuthService } from '../../services/auth.service';
import { PLATFORM_ID } from '@angular/core';

@Component({
  selector: 'app-student-attendance',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './student-attendance.html',
  styleUrl: './student-attendance.scss',
})
export class StudentAttendance implements OnDestroy {
  activities: Activity[] = [];
  private submissionsByActivityId: Record<string, ActivitySubmission | undefined> = {};
  private readonly platformId = inject(PLATFORM_ID);
  private refreshTimer?: number;
  private readonly onVisibility = () => {
    if (document.visibilityState === 'visible') void this.loadActivities();
  };

  constructor(
    private readonly activityService: ActivityService,
    private readonly auth: AuthService,
  ) {
    void this.loadActivities();

    if (isPlatformBrowser(this.platformId)) {
      document.addEventListener('visibilitychange', this.onVisibility);
      this.refreshTimer = window.setInterval(() => {
        void this.loadActivities();
      }, 1000);
    }
  }

  private get studentID(): string | undefined {
    return this.auth.getCurrentUser()?.studentID;
  }

  private async loadActivities(): Promise<void> {
    try {
      this.activities = await this.activityService.getAllActivities();
    } catch {
      this.activities = [];
    }

    const sid = this.studentID;
    this.submissionsByActivityId = {};
    if (!sid) return;

    let subs: ActivitySubmission[] = [];
    try {
      subs = await this.activityService.getSubmissionsForStudent(sid);
    } catch {
      subs = [];
    }
    for (const sub of subs) {
      this.submissionsByActivityId[sub.activityId] = sub;
    }
  }

  attendanceStatus(activity: Activity): AttendanceStatus {
    const sub = this.submissionsByActivityId[activity.id];
    return this.activityService.getAttendanceStatus(activity, sub);
  }

  ngOnDestroy(): void {
    if (isPlatformBrowser(this.platformId)) {
      if (this.refreshTimer != null) window.clearInterval(this.refreshTimer);
      document.removeEventListener('visibilitychange', this.onVisibility);
    }
  }
}
