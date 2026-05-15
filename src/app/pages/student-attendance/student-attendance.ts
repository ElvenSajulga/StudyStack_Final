import { Component, OnDestroy, OnInit, inject, PLATFORM_ID, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Activity, ActivityService, ActivitySubmission, AttendanceStatus } from '../../services/activity.service';
import { AuthService } from '../../services/auth.service';
import { AcademicService, Enrollment } from '../../services/academic.service';
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
    const sid = this.studentID;
    this.submissionsByActivityId = {};
    if (!sid) {
      this.allActivities = [];
      this.availableCourses = [];
      this.activityToCourseId = {};
      this.computeStats();
      this.cdr.detectChanges();
      return;
    }

    // ── Scope activities to the student's enrolled teachers ─────────────────
    // The previous implementation pulled every activity in the system and only
    // mapped some to courses, which surfaced unrelated activities and could
    // leave the table feeling empty when the teacher cache was cold. Using the
    // resilient bulk fetcher (same one the dashboard uses) keeps attendance
    // honest: every row is something the student is actually enrolled in.
    let enrollments: Enrollment[] = [];
    try {
      enrollments = await this.academic.getEnrollmentsByStudentID(sid);
    } catch {
      enrollments = [];
    }
    const teacherUIDs = [...new Set(enrollments.map(e => e.teacherUID))];

    try {
      this.allActivities = teacherUIDs.length > 0
        ? await this.activityService.getActivitiesForEnrolledTeacherUIDsBulk(teacherUIDs)
        : [];
    } catch {
      this.allActivities = [];
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

    // ── Build course mapping (resilient: prefer activity.courseId, fall back
    //    to teacher→course via enrollments, and respect per-section scoping) ─
    try {
      const courses = await this.academic.getCourses();
      const teachers = this.teacherAccountService.getAll();

      // Build maps for both UID-based and teacherID-based teacher lookup
      const uidToCourseId: Record<string, string> = {};
      const uidToSectionId: Record<string, string> = {};
      const teacherIdToCourseId: Record<string, string> = {};
      const teacherIdToSectionId: Record<string, string> = {};
      for (const e of enrollments) {
        uidToCourseId[e.teacherUID] = e.courseId;
        uidToSectionId[e.teacherUID] = e.sectionId;
        const teacher = teachers.find(t => t.UID === e.teacherUID);
        if (teacher) {
          teacherIdToCourseId[teacher.teacherID] = e.courseId;
          teacherIdToSectionId[teacher.teacherID] = e.sectionId;
        }
      }

      const courseIdToName: Record<string, string> = {};
      for (const course of courses) courseIdToName[course.id] = course.name;

      // Filter out activities scoped to a section the student isn't enrolled
      // in, and build the activity→courseId map for the filter dropdown.
      const visibleActivities: Activity[] = [];
      this.activityToCourseId = {};
      const courseIdSet = new Set<string>();

      for (const activity of this.allActivities) {
        // Resolve courseId — direct field wins, fall back via teacher mapping.
        let courseId = activity.courseId
          || uidToCourseId[activity.teacherUID ?? '']
          || teacherIdToCourseId[activity.teacherID];

        // Section scoping: if the activity targets a specific section, only
        // show it when the student is enrolled in that section of the course.
        if (activity.sectionId) {
          const enrolledSection =
            uidToSectionId[activity.teacherUID ?? ''] ||
            teacherIdToSectionId[activity.teacherID];
          if (enrolledSection !== activity.sectionId) continue;
        }

        if (!courseId) continue;
        visibleActivities.push(activity);
        this.activityToCourseId[activity.id] = courseId;
        courseIdSet.add(courseId);
      }

      this.allActivities = visibleActivities;
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