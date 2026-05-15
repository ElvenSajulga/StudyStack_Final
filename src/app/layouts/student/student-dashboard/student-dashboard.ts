import { Component, OnDestroy, OnInit, ChangeDetectorRef, NgZone, inject, PLATFORM_ID } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import {
  Activity,
  ActivityService,
  ActivitySubmission,
  AttendanceStatus,
} from '../../../services/activity.service';
import { Announcement, AnnouncementService } from '../../../services/announcement.service';
import { AcademicService, Course, Enrollment } from '../../../services/academic.service';
import { AuthService } from '../../../services/auth.service';
import { TeacherAccountService } from '../../../services/teacher-account.service';
import { CourseLookupService } from '../../../services/course-lookup.service';
import { isPlatformBrowser } from '@angular/common';
import { Subscription } from 'rxjs';

interface CalendarDay {
  date: Date;
  dateNum: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  activities: Activity[];
}

interface CourseProgress {
  courseId: string;
  courseName: string;
  teacherName: string;
  totalActivities: number;
  completedActivities: number;
  completionPercent: number;
  averageScore: number;
  attendanceRate: number;
  status: 'on-track' | 'attention' | 'at-risk';
}

@Component({
  selector: 'app-student-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './student-dashboard.html',
  styleUrl: './student-dashboard.scss',
})
export class StudentDashboard implements OnInit, OnDestroy {
  presentCount     = 0;
  lateCount        = 0;
  absentCount      = 0;
  openActivities   = 0;
  overallAveragePercent = 0;
  submissionsThisWeek = 0;
  nextDeadline: Activity | null = null;
  onTimeRate = 0;
  latestAnnouncements: Announcement[] = [];
  upcomingActivities: Activity[] = [];
  allUpcomingActivities: Activity[] = [];
  calendarDays: CalendarDay[] = [];
  currentMonth: Date = new Date();
  selectedDay: CalendarDay | null = null;
  courseProgress: CourseProgress[] = [];

  userName = '';
  today = new Date();
  private readonly platformId = inject(PLATFORM_ID);
  private readonly zone = inject(NgZone);
  private refreshTimer?: ReturnType<typeof setInterval>;
  private activitiesSub?: Subscription;
  private submissionsSub?: Subscription;
  private announcementsSub?: Subscription;
  private currentEnrollments: Enrollment[] = [];
  private currentTeacherUIDs: string[] = [];
  private allEnrolledActivities: Activity[] = [];
  private allSubmissions: ActivitySubmission[] = [];

  constructor(
    private readonly activityService: ActivityService,
    private readonly announcementService: AnnouncementService,
    private readonly academic: AcademicService,
    private readonly auth: AuthService,
    private readonly teacherAccountService: TeacherAccountService,
    private readonly courseLookup: CourseLookupService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  /** Resolves an activity's course name, preferring direct courseId, falling back via enrollments. */
  courseNameFor(activity: Activity): string {
    if (activity.courseId) {
      const name = this.courseLookup.name(activity.courseId, '');
      if (name) return name;
    }
    // Fallback: resolve via teacher → enrollment → courseId
    const teacher = this.teacherAccountService.getAll().find(
      t => t.teacherID === activity.teacherID || t.UID === activity.teacherUID,
    );
    if (teacher) {
      const enr = this.currentEnrollments.find(e => e.teacherUID === teacher.UID);
      if (enr) return this.courseLookup.name(enr.courseId, 'Unassigned');
    }
    return 'Unassigned';
  }

  ngOnInit(): void {
    const user = localStorage.getItem('currentUser');
    if (user) {
      const parsed = JSON.parse(user);
      this.userName = parsed.name || 'Student';
    }
    void this.courseLookup.ensureLoaded();
    void this.initRealtime();
  }

  ngOnDestroy(): void {
    if (this.refreshTimer != null) clearInterval(this.refreshTimer);
    this.activitiesSub?.unsubscribe();
    this.submissionsSub?.unsubscribe();
    this.announcementsSub?.unsubscribe();
  }

  /**
   * Sets up real-time listeners for activities and submissions so the dashboard
   * automatically reflects newly posted teacher activities, scores, and
   * submissions without a manual refresh.
   */
  private async initRealtime(): Promise<void> {
    const sid = this.studentID;
    if (!sid) return;

    try {
      this.currentEnrollments = await this.academic.getEnrollmentsByStudentID(sid);
      this.currentTeacherUIDs = [...new Set(this.currentEnrollments.map(e => e.teacherUID))];

      if (isPlatformBrowser(this.platformId)) {
        this.subscribeToAnnouncements();
        this.activitiesSub = this.activityService
          .watchActivitiesForEnrolledTeacherUIDs(this.currentTeacherUIDs)
          .subscribe({
            next: activities => {
              this.allEnrolledActivities = activities;
              this.recomputeFromState();
            },
            error: err => {
              console.error('[StudentDashboard] activities stream error:', err);
              void this.activityService
                .getActivitiesForEnrolledTeacherUIDsBulk(this.currentTeacherUIDs)
                .then(list => {
                  this.allEnrolledActivities = list;
                  this.recomputeFromState();
                });
            },
          });

        this.submissionsSub = this.activityService
          .watchSubmissionsForStudent(sid)
          .subscribe({
            next: subs => {
              this.allSubmissions = subs;
              this.recomputeFromState();
            },
          });

        // Safety-net: re-pull enrollments/announcements occasionally in case
        // the admin updates them.
        this.zone.runOutsideAngular(() => {
          this.refreshTimer = setInterval(() => {
            this.zone.run(() => void this.safetyNetRefresh());
          }, 60000);
        });
      } else {
        // SSR/no-browser fallback
        this.allEnrolledActivities = await this.activityService
          .getActivitiesForEnrolledTeacherUIDsBulk(this.currentTeacherUIDs);
        this.allSubmissions = await this.activityService.getSubmissionsForStudent(sid);
        await this.refreshAnnouncements();
        this.recomputeFromState();
      }
    } catch (e) {
      console.error('[StudentDashboard] initRealtime failed:', e);
    }
  }

  private async safetyNetRefresh(): Promise<void> {
    const sid = this.studentID;
    if (!sid) return;
    try {
      const enrollments = await this.academic.getEnrollmentsByStudentID(sid);
      const newUIDs = [...new Set(enrollments.map(e => e.teacherUID))];
      const changed =
        newUIDs.length !== this.currentTeacherUIDs.length ||
        newUIDs.some(u => !this.currentTeacherUIDs.includes(u));

      this.currentEnrollments = enrollments;

      if (changed) {
        this.currentTeacherUIDs = newUIDs;
        this.activitiesSub?.unsubscribe();
        this.activitiesSub = this.activityService
          .watchActivitiesForEnrolledTeacherUIDs(this.currentTeacherUIDs)
          .subscribe(activities => {
            this.allEnrolledActivities = activities;
            this.recomputeFromState();
          });
        this.subscribeToAnnouncements();
      }

      this.recomputeFromState();
    } catch (e) {
      console.warn('[StudentDashboard] safetyNetRefresh failed:', e);
    }
  }

  /**
   * Real-time announcement stream for the dashboard's "Recent Announcements"
   * card. Uses the resilient bulk matcher in AnnouncementService that handles
   * both `teacherUID` and `teacherID` (credential) shapes — calling
   * `getForTeacher(uid)` here historically returned nothing because that
   * method queries by credential, not UID.
   */
  private subscribeToAnnouncements(): void {
    this.announcementsSub?.unsubscribe();
    if (this.currentTeacherUIDs.length === 0) {
      this.latestAnnouncements = [];
      this.cdr.detectChanges();
      return;
    }
    this.announcementsSub = this.announcementService
      .watchForEnrolledTeacherUIDs(this.currentTeacherUIDs)
      .subscribe({
        next: list => {
          this.latestAnnouncements = list.slice(0, 3);
          this.cdr.detectChanges();
        },
        error: err => {
          console.warn('[StudentDashboard] announcement stream error:', err);
          void this.refreshAnnouncements();
        },
      });
  }

  /** SSR / stream-failure fallback: one-shot bulk fetch via the resilient matcher. */
  private async refreshAnnouncements(): Promise<void> {
    if (this.currentTeacherUIDs.length === 0) {
      this.latestAnnouncements = [];
      return;
    }
    try {
      const list = await this.announcementService
        .getForEnrolledTeacherUIDsBulk(this.currentTeacherUIDs);
      this.latestAnnouncements = list.slice(0, 3);
    } catch (e) {
      console.warn('refreshAnnouncements failed:', e);
    }
  }

  /**
   * Rebuilds all derived dashboard state (stats, calendar, course progress,
   * upcoming activities) from the latest cached enrollments + activities +
   * submissions. Cheap because everything is in-memory.
   */
  private recomputeFromState(): void {
    this.computeStatsFromCache();
    this.buildCourseProgressFromCache();

    // Activities the student has already submitted are dropped from the
    // dashboard's "upcoming" view (and the calendar dots / focus callout that
    // are derived from it). Open + un-submitted is the only thing that still
    // demands the student's attention.
    const submittedIds = new Set(
      this.allSubmissions
        .filter(s => s.submitted)
        .map(s => s.activityId)
    );

    const now = new Date();
    const openActivities = this.allEnrolledActivities.filter(
      a => now <= new Date(a.closeAt) && !submittedIds.has(a.id)
    );

    this.upcomingActivities = openActivities
      .slice()
      .sort((a, b) => new Date(a.closeAt).getTime() - new Date(b.closeAt).getTime())
      .slice(0, 5);

    this.allUpcomingActivities = openActivities
      .slice()
      .sort((a, b) => new Date(a.closeAt).getTime() - new Date(b.closeAt).getTime());

    this.buildCalendar();
    this.cdr.detectChanges();
  }

  getGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }

  private get studentID(): string | undefined {
    return this.auth.getCurrentUser()?.studentID;
  }


  getDaysLeft(closeAt: string): string {
    const now = new Date();
    const close = new Date(closeAt);
    const diff = close.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    if (days < 0) return 'Overdue';
    if (days === 0) return 'Today';
    if (days === 1) return 'Tomorrow';
    return `${days}d left`;
  }

  isUrgent(closeAt: string): boolean {
    const now = new Date();
    const close = new Date(closeAt);
    const diff = close.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return days <= 3;
  }

  getDeadlineUrgency(): 'urgent' | 'soon' | 'later' {
    if (!this.nextDeadline) return 'later';
    const now = new Date();
    const close = new Date(this.nextDeadline.closeAt);
    const diffMs = close.getTime() - now.getTime();
    const hours = Math.floor(diffMs / (1000 * 60 * 60));

    if (hours <= 24) return 'urgent';
    if (hours <= 72) return 'soon';
    return 'later';
  }

  hoursUntilDeadline(): number {
    if (!this.nextDeadline) return 0;
    const now = new Date();
    const close = new Date(this.nextDeadline.closeAt);
    const diffMs = close.getTime() - now.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60));
  }

  get monthLabel(): string {
    return this.currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  buildCalendar(): void {
    this.calendarDays = [];
    const year = this.currentMonth.getFullYear();
    const month = this.currentMonth.getMonth();

    // Get the first day of the month
    const firstDay = new Date(year, month, 1);
    const firstDayOfWeek = firstDay.getDay(); // 0 = Sunday, 6 = Saturday

    // Start from the Sunday before the first day (if needed)
    const startDate = new Date(firstDay);
    startDate.setDate(firstDay.getDate() - firstDayOfWeek);

    // Generate 6 weeks × 7 days = 42 days
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < 42; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      const dateStr = date.toDateString();

      const isCurrentMonth = date.getMonth() === month;
      const isToday = dateStr === today.toDateString();

      // Filter activities for this day
      const activitiesForDay = this.allUpcomingActivities.filter(a => {
        const activityDate = new Date(a.closeAt);
        return activityDate.toDateString() === dateStr;
      });

      this.calendarDays.push({
        date,
        dateNum: date.getDate(),
        isCurrentMonth,
        isToday,
        activities: activitiesForDay,
      });
    }
  }

  prevMonth(): void {
    const date = new Date(this.currentMonth);
    date.setMonth(date.getMonth() - 1);
    this.currentMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    this.selectedDay = null;
    this.buildCalendar();
  }

  nextMonth(): void {
    const date = new Date(this.currentMonth);
    date.setMonth(date.getMonth() + 1);
    this.currentMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    this.selectedDay = null;
    this.buildCalendar();
  }

  selectDay(day: CalendarDay): void {
    if (day.activities.length > 0) {
      this.selectedDay = day;
    }
  }

  closeSelectedDay(): void {
    this.selectedDay = null;
  }

  /**
   * Builds course-progress cards from already-cached activities/submissions.
   * Uses the resilient teacher matcher so cards still appear even when
   * UID↔teacherID mapping is partially missing.
   */
  private buildCourseProgressFromCache(): void {
    if (this.currentEnrollments.length === 0) {
      this.courseProgress = [];
      return;
    }

    const teachers = this.teacherAccountService.getAll();
    const uidToTeacherName: Record<string, string> = {};
    const uidToTeacherID: Record<string, string> = {};
    for (const teacher of teachers) {
      const fullName = `${teacher.firstname} ${teacher.lastname}`.trim();
      uidToTeacherName[teacher.UID] = fullName || teacher.name || 'Unknown';
      uidToTeacherID[teacher.UID] = teacher.teacherID;
    }

    void (async () => {
      let courses: Course[];
      try {
        courses = await this.academic.getCourses();
      } catch {
        courses = [];
      }
      const courseIdToName: Record<string, string> = {};
      for (const course of courses) courseIdToName[course.id] = course.name;

      const progress: CourseProgress[] = [];
      const now = new Date();

      for (const enrollment of this.currentEnrollments) {
        const courseName = courseIdToName[enrollment.courseId] || 'Unknown';
        const teacherName = uidToTeacherName[enrollment.teacherUID] || 'Unknown';
        const teacherID = uidToTeacherID[enrollment.teacherUID];

        const teacherActivities = this.allEnrolledActivities.filter(a => {
          const teacherMatch =
            (a.teacherUID && a.teacherUID === enrollment.teacherUID) ||
            (teacherID && a.teacherID === teacherID) ||
            a.teacherID === enrollment.teacherUID;
          if (!teacherMatch) return false;
          // Activities with explicit course/section must match the enrollment;
          // legacy rows without those fields fall through (visible everywhere).
          if (a.courseId && a.courseId !== enrollment.courseId) return false;
          if (a.sectionId && a.sectionId !== enrollment.sectionId) return false;
          return true;
        });
        const closedActivities = teacherActivities.filter(a => new Date(a.closeAt) < now);
        const totalActivities = closedActivities.length;
        if (totalActivities === 0) continue;

        const courseSubmissions = this.allSubmissions.filter(s =>
          closedActivities.some(a => a.id === s.activityId) && s.submitted
        );
        const completedActivities = courseSubmissions.length;
        const completionPercent = (completedActivities / totalActivities) * 100;

        const gradedSubmissions = courseSubmissions.filter(s => s.graded && s.score != null);
        let averageScore = 0;
        if (gradedSubmissions.length > 0) {
          const scores = gradedSubmissions.map(s => {
            const activity = closedActivities.find(a => a.id === s.activityId);
            if (!activity || !activity.maxPoints) return 0;
            return (s.score! / activity.maxPoints) * 100;
          });
          averageScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
        }

        let presentCount = 0;
        let lateCount = 0;
        let totalCount = 0;
        for (const activity of closedActivities) {
          const sub = this.allSubmissions.find(s => s.activityId === activity.id);
          const status = this.activityService.getAttendanceStatus(activity, sub);
          if (status === 'present') presentCount++;
          if (status === 'late') lateCount++;
          totalCount++;
        }
        const attendanceRate = totalCount > 0 ? ((presentCount + lateCount) / totalCount) * 100 : 0;

        let status: 'on-track' | 'attention' | 'at-risk';
        if (averageScore >= 80) status = 'on-track';
        else if (averageScore >= 60) status = 'attention';
        else status = 'at-risk';

        progress.push({
          courseId: enrollment.courseId,
          courseName,
          teacherName,
          totalActivities,
          completedActivities,
          completionPercent,
          averageScore,
          attendanceRate,
          status,
        });
      }
      this.courseProgress = progress;
      this.cdr.detectChanges();
    })();
  }

  /**
   * Computes stat tiles (open count, attendance, on-time rate, next deadline)
   * directly from the cached activities + submissions. Synchronous: no
   * network access — runs whenever the streams emit.
   */
  private computeStatsFromCache(): void {
    this.presentCount = 0;
    this.lateCount = 0;
    this.absentCount = 0;
    this.openActivities = 0;
    this.overallAveragePercent = 0;
    this.submissionsThisWeek = 0;

    const submissionsByActivityId: Record<string, ActivitySubmission | undefined> = {};
    for (const sub of this.allSubmissions) {
      submissionsByActivityId[sub.activityId] = sub;
    }

    const now = new Date();
    for (const a of this.allEnrolledActivities) {
      const sub = submissionsByActivityId[a.id];
      // "Open" reflects what the dashboard surfaces to the student — items
      // still demanding action. Once submitted, an activity is no longer
      // counted as open even if its closeAt is in the future.
      if (now <= new Date(a.closeAt) && !sub?.submitted) this.openActivities++;
      const status: AttendanceStatus = this.activityService.getAttendanceStatus(a, sub);
      if (status === 'present') this.presentCount++;
      if (status === 'late') this.lateCount++;
      if (status === 'absent') this.absentCount++;
    }

    const graded = this.allSubmissions.filter(s => s.graded && s.score != null);
    if (graded.length > 0 && this.allEnrolledActivities.length > 0) {
      const percentages = graded.map(s => {
        const a = this.allEnrolledActivities.find(x => x.id === s.activityId);
        if (!a || !a.maxPoints) return 0;
        return (s.score! / a.maxPoints) * 100;
      });
      this.overallAveragePercent = percentages.reduce((sum, p) => sum + p, 0) / percentages.length;
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    this.submissionsThisWeek = this.allSubmissions
      .filter(s => s.submitted && new Date(s.submittedAt) >= sevenDaysAgo).length;

    // Next deadline is the soonest upcoming activity the student hasn't yet
    // submitted — submitted items are off the dashboard per Issue #1.
    const upcoming = this.allEnrolledActivities
      .filter(a => new Date(a.closeAt) > now && !submissionsByActivityId[a.id]?.submitted)
      .sort((a, b) => new Date(a.closeAt).getTime() - new Date(b.closeAt).getTime());
    this.nextDeadline = upcoming[0] ?? null;

    const totalActivities = this.presentCount + this.lateCount + this.absentCount;
    this.onTimeRate = totalActivities > 0 ? (this.presentCount / totalActivities) * 100 : 0;
  }
}