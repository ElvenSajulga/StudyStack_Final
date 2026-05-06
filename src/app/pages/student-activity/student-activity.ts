import { Component, OnDestroy, OnInit, NgZone, inject, PLATFORM_ID, ChangeDetectorRef, } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Activity, ActivityService, ActivitySubmission, AttendanceStatus, } from '../../services/activity.service';
import { AuthService } from '../../services/auth.service';
import { AcademicService, Course, Enrollment } from '../../services/academic.service';

interface CourseCard {
  course: Course;
  enrollment: Enrollment;
  teacherUID: string;
  pendingCount: number;
}

@Component({
  selector: 'app-student-activity',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './student-activity.html',
  styleUrl: './student-activity.scss',
})
export class StudentActivity implements OnInit, OnDestroy {
  view: 'cards' | 'stream' | 'detail' = 'cards';

  courseCards: CourseCard[] = [];
  selectedCard: CourseCard | null = null;

  streamActivities: Activity[] = [];
  selectedActivity: Activity | null = null;

  submissions: Record<string, ActivitySubmission | undefined> = {};
  draftContent: Record<string, string> = {};

  loading = false;

  private readonly platformId = inject(PLATFORM_ID);
  private readonly zone = inject(NgZone);
  private refreshTimer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly activityService: ActivityService,
    private readonly auth: AuthService,
    private readonly academic: AcademicService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    void this.loadCourseCards();
    if (isPlatformBrowser(this.platformId)) {
      this.zone.runOutsideAngular(() => {
        this.refreshTimer = setInterval(() => {
          this.zone.run(() => void this.loadCourseCards());
        }, 30000);
      });
    }
  }

  private get studentID(): string | undefined {
    return this.auth.getCurrentUser()?.studentID;
  }

  private async loadCourseCards(): Promise<void> {
    const sid = this.studentID;
    if (!sid) return;

    this.loading = true;
    const [enrollments, courses] = await Promise.all([
      this.academic.getEnrollmentsByStudentID(sid),
      this.academic.getCourses(),
    ]);

    const subs = await this.activityService.getSubmissionsForStudent(sid);
    const submittedIds = new Set(subs.map(s => s.activityId));

    const cards: CourseCard[] = [];
    for (const e of enrollments) {
      const course = courses.find(c => c.id === e.courseId);
      if (!course) continue;

      const activities = await this.activityService
        .getActivitiesForTeacher(e.teacherUID);

      const now = new Date();
      const pending = activities.filter(
        a => !submittedIds.has(a.id) && new Date(a.closeAt) > now,
      ).length;

      cards.push({
        course,
        enrollment: e,
        teacherUID: e.teacherUID,
        pendingCount: pending,
      });
    }

    this.courseCards = cards;

    // store subs for later use
    for (const sub of subs) {
      this.submissions[sub.activityId] = sub;
      if (!this.draftContent[sub.activityId]) {
        this.draftContent[sub.activityId] = sub.content ?? '';
      }
    }

    this.loading = false;
    this.cdr.detectChanges();
  }

  // ── navigation ────────────────────────────────────────────────────────────────

  async openCourse(card: CourseCard): Promise<void> {
    this.selectedCard = card;
    this.view = 'stream';
    await this.loadStream(card);
  }

  private async loadStream(card: CourseCard): Promise<void> {
    this.loading = true;
    const all = await this.activityService
      .getActivitiesForTeacher(card.teacherUID);
    this.streamActivities = all.sort(
      (a, b) => new Date(b.deadline).getTime() - new Date(a.deadline).getTime(),
    );
    this.loading = false;
    this.cdr.detectChanges();
  }

  openActivity(activity: Activity): void {
    this.selectedActivity = activity;
    this.view = 'detail';
    if (!this.draftContent[activity.id]) {
      this.draftContent[activity.id] =
        this.submissions[activity.id]?.content ?? '';
    }
  }

  goBack(): void {
    if (this.view === 'detail') {
      this.view = 'stream';
      this.selectedActivity = null;
    } else if (this.view === 'stream') {
      this.view = 'cards';
      this.selectedCard = null;
      this.streamActivities = [];
    }
  }

  // ── helpers ───────────────────────────────────────────────────────────────────

  getAttendanceStatus(activity: Activity): AttendanceStatus {
    return this.activityService.getAttendanceStatus(
      activity, this.submissions[activity.id],
    );
  }

  isOpen(activity: Activity): boolean {
    return new Date() <= new Date(activity.closeAt);
  }

  isPastDeadline(activity: Activity): boolean {
    return new Date() > new Date(activity.deadline);
  }

  hasSubmission(activity: Activity): boolean {
    return !!this.submissions[activity.id];
  }

  // ── submit ────────────────────────────────────────────────────────────────────

  async submit(activity: Activity): Promise<void> {
    const user = this.auth.getCurrentUser();
    const sid = user?.studentID;
    const sUID = (user as unknown as { UID?: string })?.UID ?? sid ?? '';

    if (!sid) return;
    const content = this.draftContent[activity.id] ?? '';
    if (!content.trim()) {
      alert('Please enter your answer before submitting.');
      return;
    }
    if (!this.isOpen(activity)) {
      alert('This activity is already closed.');
      return;
    }
    const sub = await this.activityService.submitOrUpdateSubmission(
      activity.id, sid, sUID, content,
    );
    this.submissions[activity.id] = sub;
    this.cdr.detectChanges();
    alert('Submitted successfully!');
  }

  ngOnDestroy(): void {
    if (this.refreshTimer != null) clearInterval(this.refreshTimer);
  }
}