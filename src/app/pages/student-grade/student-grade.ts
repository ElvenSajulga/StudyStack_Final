import { Component, OnDestroy, OnInit, inject, PLATFORM_ID, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Activity, ActivityService, ActivitySubmission } from '../../services/activity.service';
import { AuthService } from '../../services/auth.service';
import { AcademicService } from '../../services/academic.service';
import { TeacherAccountService } from '../../services/teacher-account.service';

interface GradeRow {
  activity: Activity;
  submission?: ActivitySubmission;
  courseId: string;
  courseName: string;
  percent: number | null;
}

interface CourseAverage {
  courseId: string;
  courseName: string;
  activitiesCount: number;
  gradedCount: number;
  averagePercent: number;
  trend: 'up' | 'down' | 'stable';
}

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
  gradeRows: GradeRow[] = [];
  availableCourses: { id: string; name: string }[] = [];
  selectedCourseId = '';
  expandedFeedbackIds: Set<string> = new Set();
  courseAverages: CourseAverage[] = [];
  overallAveragePercent = 0;
  scoreHistory: { date: string; percent: number }[] = [];
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
    private readonly academic: AcademicService,
    private readonly teacherAccountService: TeacherAccountService,
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
      this.gradeRows = [];
      this.availableCourses = [];
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

    // ── Build gradeRows with course info ────────────────────────────────────
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

      // Build gradeRows
      this.gradeRows = [];
      const courseIdSet = new Set<string>();
      for (const activity of this.activities) {
        const courseId = teacherIdToCourseId[activity.teacherID];
        if (!courseId) continue; // Activity not for enrolled course

        const submission = this.submissionsByActivityId[activity.id];
        const courseName = courseIdToName[courseId] || 'Unknown';
        let percent: number | null = null;
        if (submission?.score != null && activity.maxPoints) {
          percent = (submission.score / activity.maxPoints) * 100;
        }

        this.gradeRows.push({
          activity,
          submission,
          courseId,
          courseName,
          percent,
        });

        courseIdSet.add(courseId);
      }

      // Build availableCourses from unique courseIds, sorted by name
      this.availableCourses = Array.from(courseIdSet)
        .map(id => ({ id, name: courseIdToName[id] || 'Unknown' }))
        .sort((a, b) => a.name.localeCompare(b.name));

      // ── Compute grade analytics ───────────────────────────────────────────
      // Per-course averages and trends
      this.courseAverages = [];
      for (const courseId of courseIdSet) {
        const courseRows = this.gradeRows.filter(row => row.courseId === courseId);
        const gradedRows = courseRows.filter(row => row.submission?.graded && row.submission?.score != null && row.activity.maxPoints);
        const activitiesCount = courseRows.length;
        const gradedCount = gradedRows.length;

        let averagePercent = 0;
        if (gradedCount > 0) {
          const percents = gradedRows.map(row => (row.submission!.score! / row.activity.maxPoints!) * 100);
          averagePercent = percents.reduce((sum, p) => sum + p, 0) / percents.length;
        }

        // Calculate trend: compare last 3 graded scores
        let trend: 'up' | 'down' | 'stable' = 'stable';
        if (gradedRows.length >= 3) {
          const lastThree = gradedRows.slice(-3);
          const percents = lastThree.map(row => (row.submission!.score! / row.activity.maxPoints!) * 100);
          if (percents[1] > percents[0] && percents[2] > percents[1]) {
            trend = 'up';
          } else if (percents[1] < percents[0] && percents[2] < percents[1]) {
            trend = 'down';
          }
        }

        this.courseAverages.push({
          courseId,
          courseName: courseIdToName[courseId] || 'Unknown',
          activitiesCount,
          gradedCount,
          averagePercent,
          trend,
        });
      }

      // Overall average
      const allGradedRows = this.gradeRows.filter(row => row.submission?.graded && row.submission?.score != null && row.activity.maxPoints);
      if (allGradedRows.length > 0) {
        const percents = allGradedRows.map(row => (row.submission!.score! / row.activity.maxPoints!) * 100);
        this.overallAveragePercent = percents.reduce((sum, p) => sum + p, 0) / percents.length;
      } else {
        this.overallAveragePercent = 0;
      }

      // Score history: last 10 graded submissions sorted by date
      const historySubs = subs
        .filter(s => s.graded && s.score != null && s.submittedAt)
        .sort((a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime())
        .slice(-10);

      this.scoreHistory = historySubs.map(sub => {
        const activity = this.activities.find(a => a.id === sub.activityId);
        const percent = activity && activity.maxPoints ? (sub.score! / activity.maxPoints) * 100 : 0;
        return {
          date: sub.submittedAt,
          percent,
        };
      });
    } catch (e) {
      console.warn('Analytics computation failed:', e);
      this.gradeRows = [];
      this.availableCourses = [];
      this.courseAverages = [];
      this.overallAveragePercent = 0;
      this.scoreHistory = [];
    }

    this.cdr.detectChanges();
  }

  scoreForActivity(activity: Activity): number | undefined {
    return this.submissionsByActivityId[activity.id]?.score;
  }

  get totalScore(): number {
    return this.submissions.reduce((sum, s) => sum + (s.score ?? 0), 0);
  }

  get filteredRows(): GradeRow[] {
    if (!this.selectedCourseId) return this.gradeRows;
    return this.gradeRows.filter(row => row.courseId === this.selectedCourseId);
  }

  get rowsByCourse(): Map<string, GradeRow[]> {
    const map = new Map<string, GradeRow[]>();
    const courseOrder: Record<string, number> = {};

    for (const row of this.filteredRows) {
      if (!map.has(row.courseId)) {
        map.set(row.courseId, []);
        const courseIndex = this.availableCourses.findIndex(c => c.id === row.courseId);
        courseOrder[row.courseId] = courseIndex >= 0 ? courseIndex : 999;
      }
      map.get(row.courseId)!.push(row);
    }

    // Sort map by course order
    const sorted = new Map<string, GradeRow[]>();
    Array.from(map.keys())
      .sort((a, b) => courseOrder[a] - courseOrder[b])
      .forEach(key => sorted.set(key, map.get(key)!));

    return sorted;
  }

  courseAverageFor(courseId: string): number {
    const courseRows = this.gradeRows.filter(row => row.courseId === courseId && row.percent != null);
    if (courseRows.length === 0) return 0;
    const sum = courseRows.reduce((acc, row) => acc + (row.percent ?? 0), 0);
    return sum / courseRows.length;
  }

  getColorClass(percent: number | null): 'high' | 'mid' | 'low' {
    if (percent == null) return 'low';
    if (percent >= 80) return 'high';
    if (percent >= 60) return 'mid';
    return 'low';
  }

  toggleFeedback(activityId: string): void {
    if (this.expandedFeedbackIds.has(activityId)) {
      this.expandedFeedbackIds.delete(activityId);
    } else {
      this.expandedFeedbackIds.add(activityId);
    }
  }

  isFeedbackExpanded(activityId: string): boolean {
    return this.expandedFeedbackIds.has(activityId);
  }

  hasFeedback(activityId: string): boolean {
    const sub = this.submissionsByActivityId[activityId];
    return !!(sub?.feedback && sub.feedback.trim());
  }

  feedbackForActivity(activityId: string): string | undefined {
    return this.submissionsByActivityId[activityId]?.feedback;
  }

  ngOnDestroy(): void {
    if (isPlatformBrowser(this.platformId)) {
      if (this.refreshTimer != null) clearInterval(this.refreshTimer);
      document.removeEventListener('visibilitychange', this.onVisibility);
    }
  }
}