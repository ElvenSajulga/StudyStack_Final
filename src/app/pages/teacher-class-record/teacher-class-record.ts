import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Activity, ActivityService, ActivitySubmission } from '../../services/activity.service';
import { AuthService } from '../../services/auth.service';
import { StudentAccount, StudentAccountService } from '../../services/student-account.service';
import {
  AcademicService,
  Course,
  CourseSection,
  Enrollment,
  Section,
} from '../../services/academic.service';

/**
 * One (course, section) the teacher teaches. The class record lets the
 * teacher pick a group; the table below renders only that group's students
 * and activities. Without this, a multi-section teacher saw every student in
 * the system mixed in with everyone else's data — Issue #5.
 */
interface CourseGroup {
  courseSection: CourseSection;
  course: Course;
  sectionName: string;
  studentCount: number;
  activityCount: number;
}

@Component({
  selector: 'app-teacher-class-record',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './teacher-class-record.html',
  styleUrl: './teacher-class-record.scss',
})
export class TeacherClassRecord implements OnInit {
  /** Every (course, section) the teacher teaches — used to populate the selector. */
  groups: CourseGroup[] = [];
  selectedGroupId: string = '';

  /** Activities + students for the currently selected group. */
  activities: Activity[] = [];
  students: StudentAccount[] = [];

  searchQuery: string = '';
  sortActivityId: string | null = null;
  sortDir: 'asc' | 'desc' = 'desc';

  loading = false;

  // Internal lookup state — kept off the template.
  private allTeacherActivities: Activity[] = [];
  private allEnrollments: Enrollment[] = [];
  private allCourses: Course[] = [];
  private allSections: Section[] = [];
  private allCourseSections: CourseSection[] = [];
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

  private get teacherUID(): string | undefined {
    return (this.auth.getCurrentUser() as { UID?: string } | null)?.UID;
  }

  private get teacherID(): string | undefined {
    return this.auth.getCurrentUser()?.teacherID;
  }

  private submissionKey(activityId: string, studentID: string): string {
    return `${activityId}::${studentID}`;
  }

  private async loadData(): Promise<void> {
    const uid = this.teacherUID;
    const tid = this.teacherID;
    if (!uid || !tid) {
      this.resetState();
      this.cdr.detectChanges();
      return;
    }

    this.loading = true;

    // Fetch everything we need in parallel — the teacher's course/section
    // assignments, enrollments under them, the course/section catalogs, and
    // every activity the teacher owns.
    await this.studentService.reloadFromServer();
    const [courseSections, courses, sections, enrollments, activities] = await Promise.all([
      this.academicService.getCourseSectionsByTeacher(uid),
      this.academicService.getCourses(),
      this.academicService.getSections(),
      this.academicService.getEnrollmentsByTeacher(uid),
      this.activityService.getActivitiesForTeacher(tid),
    ]);

    this.allCourseSections = courseSections;
    this.allCourses = courses;
    this.allSections = sections;
    this.allEnrollments = enrollments;
    this.allTeacherActivities = activities;

    this.groups = courseSections
      .map<CourseGroup | null>(cs => {
        const course = courses.find(c => c.id === cs.courseId);
        if (!course) return null;
        const section = sections.find(s => s.id === cs.sectionId);
        const sectionName = section?.name ?? '';

        const studentCount = new Set(
          enrollments
            .filter(e => e.courseId === cs.courseId && e.sectionId === cs.sectionId)
            .map(e => e.studentUID),
        ).size;

        // Legacy activities (no sectionId) belong to every section of their
        // course, matching how teacher-activity.ts already buckets them.
        const activityCount = activities.filter(a =>
          a.courseId === cs.courseId && (!a.sectionId || a.sectionId === cs.sectionId),
        ).length;

        return {
          courseSection: cs,
          course,
          sectionName,
          studentCount,
          activityCount,
        };
      })
      .filter((g): g is CourseGroup => g !== null)
      .sort((a, b) => {
        const byCourse = a.course.name.localeCompare(b.course.name);
        if (byCourse !== 0) return byCourse;
        return a.sectionName.localeCompare(b.sectionName);
      });

    // Default to the first group; preserve the existing selection if it's
    // still valid (the teacher may have re-loaded after editing assignments).
    if (!this.groups.some(g => g.courseSection.id === this.selectedGroupId)) {
      this.selectedGroupId = this.groups[0]?.courseSection.id ?? '';
    }

    await this.applySelection();

    this.loading = false;
    this.cdr.detectChanges();
  }

  /**
   * Rebuilds `activities` + `students` + submission cache for whichever group
   * is currently selected. Called on initial load and whenever the user picks
   * a different course/section from the selector.
   */
  async applySelection(): Promise<void> {
    const group = this.groups.find(g => g.courseSection.id === this.selectedGroupId);
    if (!group) {
      this.activities = [];
      this.students = [];
      this.submissionsByKey = {};
      this.cdr.detectChanges();
      return;
    }

    // Activities for this (course, section). Legacy rows (no sectionId) fall
    // through to every section of their course.
    this.activities = this.allTeacherActivities.filter(a =>
      a.courseId === group.course.id &&
      (!a.sectionId || a.sectionId === group.courseSection.sectionId),
    );

    // Students = those actually enrolled in this (course, section) under this
    // teacher. Previously the page listed every student in the system.
    const enrolledUIDs = new Set(
      this.allEnrollments
        .filter(
          e =>
            e.courseId === group.course.id &&
            e.sectionId === group.courseSection.sectionId,
        )
        .map(e => e.studentUID),
    );
    const allStudents = this.studentService.getAll();
    this.students = allStudents
      .filter(s => enrolledUIDs.has(s.UID))
      .sort((a, b) => (a.lastname ?? '').localeCompare(b.lastname ?? ''));

    const activityIds = this.activities.map(a => a.id);
    const subs = activityIds.length === 0
      ? []
      : await this.activityService.getSubmissionsForActivities(activityIds);
    this.submissionsByKey = {};
    for (const sub of subs) {
      this.submissionsByKey[this.submissionKey(sub.activityId, sub.studentID)] = sub;
    }

    this.cdr.detectChanges();
  }

  onGroupChange(): void {
    this.searchQuery = '';
    this.sortActivityId = null;
    void this.applySelection();
  }

  private resetState(): void {
    this.groups = [];
    this.selectedGroupId = '';
    this.activities = [];
    this.students = [];
    this.allTeacherActivities = [];
    this.allEnrollments = [];
    this.allCourses = [];
    this.allSections = [];
    this.allCourseSections = [];
    this.submissionsByKey = {};
  }

  // ── Selection-derived getters used by the template ──────────────────────

  get selectedGroup(): CourseGroup | undefined {
    return this.groups.find(g => g.courseSection.id === this.selectedGroupId);
  }

  get courseName(): string {
    return this.selectedGroup?.course.name ?? '';
  }

  get courseSectionName(): string {
    return this.selectedGroup?.sectionName ?? '';
  }

  // ── Data helpers ────────────────────────────────────────────────────────

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

  averageScore(student: StudentAccount): number {
    const totalEarned = this.totalScoreForStudent(student);
    const totalPossible = this.activities.reduce((sum, a) => sum + (a.maxPoints ?? 0), 0);
    if (totalPossible <= 0) return 0;
    return (totalEarned / totalPossible) * 100;
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

  async exportPdf(): Promise<void> {
    const head = [
      'Student ID',
      'Last Name',
      'First Name',
      ...this.activities.map(a => a.title),
      'Total',
      'Average (%)',
    ];

    const body: (string | number)[][] = [];
    for (const s of this.filteredStudents) {
      body.push([
        s.studentID ?? '',
        s.lastname ?? '',
        s.firstname ?? '',
        ...this.activities.map(a => {
          const score = this.scoreFor(s, a);
          return score === undefined ? '—' : score;
        }),
        this.totalScoreForStudent(s),
        this.averageScore(s).toFixed(1),
      ]);
    }

    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;

    const slug = [this.courseName, this.courseSectionName]
      .filter(Boolean)
      .join('-')
      .replace(/[^a-zA-Z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'class';

    const subtitleParts = [this.courseName, this.courseSectionName].filter(Boolean) as string[];
    const subtitle = subtitleParts.length ? subtitleParts.join(' • ') : 'Class record';

    const { jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');

    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('Class Record', 40, 40);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(90);
    doc.text(subtitle, 40, 58);
    doc.text(`Generated ${dateStr}`, pageWidth - 40, 58, { align: 'right' });
    doc.setTextColor(0);

    autoTable(doc, {
      head: [head],
      body,
      startY: 72,
      margin: { left: 40, right: 40 },
      styles: { fontSize: 8, cellPadding: 4, overflow: 'linebreak', valign: 'middle' },
      headStyles: { fillColor: [24, 201, 138], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      didDrawPage: data => {
        const pageCount = doc.getNumberOfPages();
        const current = data.pageNumber;
        doc.setFontSize(8);
        doc.setTextColor(120);
        doc.text(
          `Page ${current} of ${pageCount}`,
          pageWidth - 40,
          doc.internal.pageSize.getHeight() - 20,
          { align: 'right' },
        );
      },
    });

    doc.save(`class-record-${slug}-${dateStr}.pdf`);
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
