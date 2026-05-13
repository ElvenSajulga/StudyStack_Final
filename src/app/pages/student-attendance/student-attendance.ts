import { Component, OnDestroy, OnInit, inject, PLATFORM_ID, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Activity, ActivityService, ActivitySubmission, AttendanceStatus } from '../../services/activity.service';
import { AuthService } from '../../services/auth.service';
import { AcademicService } from '../../services/academic.service';
import { TeacherAccountService } from '../../services/teacher-account.service';
import { CourseLookupService } from '../../services/course-lookup.service';

@Component({
  selector: 'app-student-attendance',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './student-attendance.html',
  styleUrl: './student-attendance.scss',
})
export class StudentAttendance implements OnInit, OnDestroy {
  allActivities: Activity[] = [];
  availableCourses: { id: string; name: string }[] = [];
  selectedCourseId = '';
  presentCount = 0;
  lateCount = 0;
  absentCount = 0;
  attendanceRate = 0;
  private submissionsByActivityId: Record<string, ActivitySubmission | undefined> = {};
  private activityToCourseId: Record<string, string> = {};
  private readonly platformId = inject(PLATFORM_ID);
  private refreshTimer?: ReturnType<typeof setInterval>;

  private readonly onVisibility = () => {
    if (document.visibilityState === 'visible') {
      this.zone.run(() => void this.loadActivities());
    }
  };

  constructor(
    private readonly activityService: ActivityService,
    private readonly auth: AuthService,
    private readonly academic: AcademicService,
    private readonly teacherAccountService: TeacherAccountService,
    private readonly courseLookup: CourseLookupService,
    private readonly cdr: ChangeDetectorRef,
    private readonly zone: NgZone,
  ) {}

  ngOnInit(): void {
    void this.courseLookup.ensureLoaded();
    void this.loadActivities();

    if (isPlatformBrowser(this.platformId)) {
      document.addEventListener('visibilitychange', this.onVisibility);
      this.zone.runOutsideAngular(() => {
        this.refreshTimer = setInterval(() => {
          this.zone.run(() => void this.loadActivities());
        }, 30000);
      });
    }
  }

  private get studentID(): string | undefined {
    return this.auth.getCurrentUser()?.studentID;
  }

  private async loadActivities(): Promise<void> {
    try {
      this.allActivities = await this.activityService.getAllActivities();
    } catch {
      this.allActivities = [];
    }

    const sid = this.studentID;
    this.submissionsByActivityId = {};
    if (!sid) {
      this.computeStats();
      this.cdr.detectChanges();
      return;
    }

    let subs: ActivitySubmission[] = [];
    try {
      subs = await this.activityService.getSubmissionsForStudent(sid);
    } catch {
      subs = [];
    }
    for (const sub of subs) {
      this.submissionsByActivityId[sub.activityId] = sub;
    }

    // ── Build course mapping ────────────────────────────────────────────────
    try {
      const enrollments = await this.academic.getEnrollmentsByStudentID(sid);
      const courses = await this.academic.getCourses();
      const teachers = this.teacherAccountService.getAll();

      // Build map: teacherID → courseId
      const teacherIdToCourseId: Record<string, string> = {};
      for (const enrollment of enrollments) {
        const teacher = teachers.find(t => t.UID === enrollment.teacherUID);
        if (teacher) {
          teacherIdToCourseId[teacher.teacherID] = enrollment.courseId;
        }
      }

      // Build courseId → courseName map
      const courseIdToName: Record<string, string> = {};
      for (const course of courses) {
        courseIdToName[course.id] = course.name;
      }

      // Build activity → courseId map
      this.activityToCourseId = {};
      const courseIdSet = new Set<string>();
      for (const activity of this.allActivities) {
        const courseId = teacherIdToCourseId[activity.teacherID];
        if (courseId) {
          this.activityToCourseId[activity.id] = courseId;
          courseIdSet.add(courseId);
        }
      }

      // Build availableCourses from unique courseIds, sorted by name
      this.availableCourses = Array.from(courseIdSet)
        .map(id => ({ id, name: courseIdToName[id] || 'Unknown' }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      this.activityToCourseId = {};
      this.availableCourses = [];
    }

    this.computeStats();
    this.cdr.detectChanges();
  }

  get activities(): Activity[] {
    if (!this.selectedCourseId) return this.allActivities;
    return this.allActivities.filter(a => this.activityToCourseId[a.id] === this.selectedCourseId);
  }

  private computeStats(): void {
    this.presentCount = 0;
    this.lateCount = 0;
    this.absentCount = 0;

    for (const activity of this.activities) {
      const status = this.attendanceStatus(activity);
      if (status === 'present') this.presentCount++;
      else if (status === 'late') this.lateCount++;
      else if (status === 'absent') this.absentCount++;
    }

    const total = this.presentCount + this.lateCount + this.absentCount;
    this.attendanceRate = total > 0 ? (this.presentCount / total) * 100 : 0;
  }

  onFilterChange(): void {
    this.computeStats();
  }

  attendanceStatus(activity: Activity): AttendanceStatus {
    const sub = this.submissionsByActivityId[activity.id];
    return this.activityService.getAttendanceStatus(activity, sub);
  }

  statusClass(activity: Activity): string {
    return this.attendanceStatus(activity);
  }

  courseName(activity: Activity): string {
    const direct = activity.courseId ? this.courseLookup.name(activity.courseId, '') : '';
    if (direct) return direct;
    const mapped = this.activityToCourseId[activity.id];
    return mapped ? this.courseLookup.name(mapped, 'Unassigned') : 'Unassigned';
  }

  getRateColorClass(): string {
    if (this.attendanceRate >= 80) return 'high';
    if (this.attendanceRate >= 60) return 'mid';
    return 'low';
  }

  ngOnDestroy(): void {
    if (isPlatformBrowser(this.platformId)) {
      if (this.refreshTimer != null) clearInterval(this.refreshTimer);
      document.removeEventListener('visibilitychange', this.onVisibility);
    }
  }
}