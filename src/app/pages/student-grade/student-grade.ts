import { Component, OnDestroy, OnInit, inject, PLATFORM_ID, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Activity, ActivityService, ActivitySubmission } from '../../services/activity.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-student-grade',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './student-grade.html',
  styleUrl: './student-grade.scss',
})
export class StudentGrade implements OnInit, OnDestroy {
  activities: Activity[] = [];
  submissions: ActivitySubmission[] = [];
  private submissionsByActivityId: Record<string, ActivitySubmission | undefined> = {};
  private readonly platformId = inject(PLATFORM_ID);
  private refreshTimer?: ReturnType<typeof setInterval>;

  private readonly onVisibility = () => {
    if (document.visibilityState === 'visible') {
      this.zone.run(() => void this.loadData());
    }
  };

  constructor(
    private readonly activityService: ActivityService,
    private readonly auth: AuthService,
    private readonly cdr: ChangeDetectorRef,
    private readonly zone: NgZone,
  ) {}

  ngOnInit(): void {
    void this.loadData();

    if (isPlatformBrowser(this.platformId)) {
      document.addEventListener('visibilitychange', this.onVisibility);
      this.zone.runOutsideAngular(() => {
        this.refreshTimer = setInterval(() => {
          this.zone.run(() => void this.loadData());
        }, 30000);
      });
    }
  }

  private get studentID(): string | undefined {
    return this.auth.getCurrentUser()?.studentID;
  }

  reload(): void {
    void this.loadData();
  }

  private async loadData(): Promise<void> {
    const sid = this.studentID;
    if (!sid) {
      this.activities = [];
      this.submissions = [];
      this.submissionsByActivityId = {};
      return;
    }

    try {
      this.activities = await this.activityService.getAllActivities();
    } catch {
      this.activities = [];
    }

    let subs: ActivitySubmission[] = [];
    try {
      subs = await this.activityService.getSubmissionsForStudent(sid);
    } catch {
      subs = [];
    }

    this.submissionsByActivityId = {};
    for (const sub of subs) {
      this.submissionsByActivityId[sub.activityId] = sub;
    }

    this.submissions = this.activities
      .map(a => this.submissionsByActivityId[a.id])
      .filter((s): s is ActivitySubmission => !!s);

    this.cdr.detectChanges();
  }

  scoreForActivity(activity: Activity): number | undefined {
    return this.submissionsByActivityId[activity.id]?.score;
  }

  get totalScore(): number {
    return this.submissions.reduce((sum, s) => sum + (s.score ?? 0), 0);
  }

  ngOnDestroy(): void {
    if (isPlatformBrowser(this.platformId)) {
      if (this.refreshTimer != null) clearInterval(this.refreshTimer);
      document.removeEventListener('visibilitychange', this.onVisibility);
    }
  }
}