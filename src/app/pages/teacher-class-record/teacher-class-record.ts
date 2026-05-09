import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Activity, ActivityService, ActivitySubmission } from '../../services/activity.service';
import { AuthService } from '../../services/auth.service';
import { StudentAccount, StudentAccountService } from '../../services/student-account.service';
import { AcademicService } from '../../services/academic.service';

@Component({
  selector: 'app-teacher-class-record',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './teacher-class-record.html',
  styleUrl: './teacher-class-record.scss',
})
export class TeacherClassRecord implements OnInit {
  activities: Activity[] = [];
  students: StudentAccount[] = [];
  searchQuery: string = '';
  sortActivityId: string | null = null;
  sortDir: 'asc' | 'desc' = 'desc';
  courseName: string = '';
  courseSection: string = '';
  private submissionsByKey: Record<string, ActivitySubmission | undefined> = {};

  constructor(
    private readonly activityService: ActivityService,
    private readonly auth: AuthService,
    private readonly studentService: StudentAccountService,
    private readonly academicService: AcademicService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    void this.loadData();
  }

  private get teacherID(): string | undefined {
    return this.auth.getCurrentUser()?.teacherID;
  }

  private submissionKey(activityId: string, studentID: string): string {
    return `${activityId}::${studentID}`;
  }

  private async loadData(): Promise<void> {
    const id = this.teacherID;
    if (!id) {
      this.activities = [];
      this.students = [];
      this.courseName = '';
      this.courseSection = '';
      this.submissionsByKey = {};
      this.cdr.detectChanges();
      return;
    }

    await this.studentService.reloadFromServer();
    this.activities = await this.activityService.getActivitiesForTeacher(id);
    this.students = this.studentService.getAll();

    const activityIds = this.activities.map(a => a.id);
    const subs = await this.activityService.getSubmissionsForActivities(activityIds);
    this.submissionsByKey = {};
    for (const sub of subs) {
      this.submissionsByKey[this.submissionKey(sub.activityId, sub.studentID)] = sub;
    }

    // Resolve course name and section from teacher's course assignments
    await this.resolveCourseInfo();

    this.cdr.detectChanges();
  }

  private async resolveCourseInfo(): Promise<void> {
    const teacherUID = (this.auth.getCurrentUser() as any)?.UID;
    const courseIdsFromActivities = Array.from(
      new Set(this.activities.map(a => a.courseId).filter((id): id is string => !!id))
    );

    try {
      const [courses, sections] = await Promise.all([
        this.academicService.getCourses(),
        this.academicService.getSections(),
      ]);

      // Try to resolve via teacher's course-section assignments first
      let resolvedCourseName = '';
      let resolvedSectionName = '';

      if (teacherUID) {
        const courseSections = await this.academicService.getCourseSectionsByTeacher(teacherUID);
        if (courseSections.length > 0) {
          const cs = courseSections[0];
          const course = courses.find(c => c.id === cs.courseId);
          const section = sections.find(s => s.id === cs.sectionId);
          if (course) resolvedCourseName = course.name;
          if (section) resolvedSectionName = section.name;
        }
      }

      // Fallback: look up via the first activity's courseId
      if (!resolvedCourseName && courseIdsFromActivities.length > 0) {
        const course = courses.find(c => c.id === courseIdsFromActivities[0]);
        if (course) resolvedCourseName = course.name;
      }

      this.courseName = resolvedCourseName;
      this.courseSection = resolvedSectionName;
    } catch (e) {
      console.warn('Failed to resolve course info:', e);
      this.courseName = '';
      this.courseSection = '';
    }
  }

  submissionsForStudent(student: StudentAccount): ActivitySubmission[] {
    return this.activities
      .map(a => this.submissionsByKey[this.submissionKey(a.id, student.studentID)])
      .filter((s): s is ActivitySubmission => !!s);
  }

  totalScoreForStudent(student: StudentAccount): number {
    return this.submissionsForStudent(student)
      .reduce((sum, s) => sum + (s.score ?? 0), 0);
  }

  scoreFor(student: StudentAccount, activity: Activity): number | undefined {
    return this.submissionsByKey[this.submissionKey(activity.id, student.studentID)]?.score;
  }

  get filteredStudents(): StudentAccount[] {
    const query = this.searchQuery.trim().toLowerCase();
    let filtered = this.students;

    if (query) {
      filtered = filtered.filter(s => {
        const haystack = `${s.firstname ?? ''} ${s.lastname ?? ''} ${s.studentID ?? ''}`.toLowerCase();
        return haystack.includes(query);
      });
    }

    const sorted = [...filtered];

    if (this.sortActivityId === null) {
      sorted.sort((a, b) => (a.lastname ?? '').localeCompare(b.lastname ?? ''));
    } else {
      const activity = this.activities.find(act => act.id === this.sortActivityId);
      if (activity) {
        sorted.sort((a, b) => {
          const scoreA = this.scoreFor(a, activity);
          const scoreB = this.scoreFor(b, activity);

          // undefined scores go last regardless of direction
          if (scoreA === undefined && scoreB === undefined) return 0;
          if (scoreA === undefined) return 1;
          if (scoreB === undefined) return -1;

          return this.sortDir === 'asc' ? scoreA - scoreB : scoreB - scoreA;
        });
      }
    }

    return sorted;
  }

  sortByActivity(activityId: string): void {
    if (this.sortActivityId === activityId) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortActivityId = activityId;
      this.sortDir = 'desc';
    }
  }

  isSortedBy(activityId: string): boolean {
    return this.sortActivityId === activityId;
  }

  sortDirFor(activityId: string): 'asc' | 'desc' | null {
    return this.isSortedBy(activityId) ? this.sortDir : null;
  }

  averageScore(student: StudentAccount): number {
    const totalEarned = this.totalScoreForStudent(student);
    const totalPossible = this.activities.reduce((sum, a) => sum + (a.maxPoints ?? 0), 0);
    if (totalPossible <= 0) return 0;
    return (totalEarned / totalPossible) * 100;
  }

  exportCsv(): void {
    const headers = [
      'Student ID',
      'Last Name',
      'First Name',
      ...this.activities.map(a => a.title),
      'Total Score',
      'Average (%)',
    ];

    const rows: (string | number)[][] = [headers];

    for (const s of this.filteredStudents) {
      const row: (string | number)[] = [
        s.studentID ?? '',
        s.lastname ?? '',
        s.firstname ?? '',
        ...this.activities.map(a => {
          const score = this.scoreFor(s, a);
          return score === undefined ? '' : score;
        }),
        this.totalScoreForStudent(s),
        this.averageScore(s).toFixed(1),
      ];
      rows.push(row);
    }

    const escapeCell = (value: string | number): string => {
      const str = String(value ?? '');
      const escaped = str.replace(/"/g, '""');
      return `"${escaped}"`;
    };

    const csvContent = rows
      .map(row => row.map(escapeCell).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;

    const courseSlug = (this.courseName || 'class').replace(/[^a-zA-Z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
    const filename = `class-record-${courseSlug}-${dateStr}.csv`;

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  printView(): void {
    window.print();
  }

  get printDate(): string {
    const today = new Date();
    return today.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }
}