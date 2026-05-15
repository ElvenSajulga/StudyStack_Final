import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Activity, ActivityService, ActivitySubmission, AttendanceStatus } from '../../services/activity.service';
import { AuthService } from '../../services/auth.service';
import { StudentAccount, StudentAccountService } from '../../services/student-account.service';
import { AcademicService, Course, Enrollment, Section } from '../../services/academic.service';
import { CourseLookupService } from '../../services/course-lookup.service';

interface CourseOption {
  id: string;
  name: string;
}

interface SectionOption {
  id: string;
  name: string;
  /** Course this section is paired with for the current teacher. Used to keep
   *  the section dropdown in sync when the user picks a specific course. */
  courseId: string;
}

interface StudentRow {
  /** Stable id across renders — `studentUID::sectionId` so a student enrolled
   *  in two of this teacher's sections shows up once per section. */
  rowId: string;
  student: StudentAccount;
  sectionId: string;
  sectionName: string;
  /** Course id of the row's enrollment — only used when no global course
   *  filter is applied, to scope the per-row attendance to that course. */
  courseId: string;
  courseName: string;
}

interface StudentAttendanceSummary {
  row: StudentRow;
  present: number;
  late: number;
  absent: number;
  total: number;
  rate: number;
}

type SortKey = 'name' | 'section' | 'course' | 'rate';
type SortDir = 'asc' | 'desc';

@Component({
  selector: 'app-teacher-attendance',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './teacher-attendance.html',
  styleUrl: './teacher-attendance.scss',
})
export class TeacherAttendance implements OnInit {
  /** Activities & student rows after the course + section filters are applied. */
  activities: Activity[] = [];
  studentRows: StudentRow[] = [];

  /** Filter dropdown contents. Section options cascade off the course pick. */
  courseOptions: CourseOption[] = [];
  sectionOptions: SectionOption[] = [];

  selectedCourseId = '';
  selectedSectionId = '';

  attendanceView: 'by-activity' | 'by-student' = 'by-activity';
  sortKey: SortKey = 'name';
  sortDir: SortDir = 'asc';

  // ── internal caches ────────────────────────────────────────────────────
  private allActivities: Activity[] = [];
  /** Every (student, section) pair this teacher teaches — pre-built so the
   *  filter step is just an array filter, no joins. */
  private allStudentRows: StudentRow[] = [];
  /** All sections the teacher teaches, paired with their course. The section
   *  dropdown is derived from this. */
  private allSectionOptions: SectionOption[] = [];
  private submissionsByKey: Record<string, ActivitySubmission | undefined> = {};

  constructor(
    private readonly activityService: ActivityService,
    private readonly auth: AuthService,
    private readonly studentService: StudentAccountService,
    private readonly academicService: AcademicService,
    private readonly courseLookup: CourseLookupService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    void this.courseLookup.ensureLoaded();
    void this.loadData();
  }

  courseNameFor(activity: Activity): string {
    return this.courseLookup.name(activity.courseId, 'Unassigned');
  }

  private submissionKey(activityId: string, studentID: string): string {
    return `${activityId}::${studentID}`;
  }

  private async loadData(): Promise<void> {
    const currentUser = this.auth.getCurrentUser();
    const teacherUID = (currentUser as { UID?: string } | null)?.UID;
    const teacherID = currentUser?.teacherID;
    if (!teacherUID) {
      this.resetState();
      this.cdr.detectChanges();
      return;
    }

    await this.studentService.reloadFromServer();

    const [courseSections, courses, sections, enrollments] = await Promise.all([
      this.academicService.getCourseSectionsByTeacher(teacherUID),
      this.academicService.getCourses(),
      this.academicService.getSections(),
      this.academicService.getEnrollments(),
    ]);

    // ── Build dropdown options from the teacher's course/section assignments
    const courseById = new Map<string, Course>(courses.map(c => [c.id, c]));
    const sectionById = new Map<string, Section>(sections.map(s => [s.id, s]));

    const courseOptionMap = new Map<string, CourseOption>();
    this.allSectionOptions = [];
    for (const cs of courseSections) {
      const course = courseById.get(cs.courseId);
      const section = sectionById.get(cs.sectionId);
      if (course && !courseOptionMap.has(course.id)) {
        courseOptionMap.set(course.id, { id: course.id, name: course.name });
      }
      // Same section can pair with multiple courses for one teacher — dedupe
      // by (courseId, sectionId) so the dropdown stays unique per pair.
      const exists = this.allSectionOptions.some(
        s => s.id === cs.sectionId && s.courseId === cs.courseId,
      );
      if (!exists) {
        this.allSectionOptions.push({
          id: cs.sectionId,
          name: section?.name ?? 'Unknown',
          courseId: cs.courseId,
        });
      }
    }
    this.courseOptions = [...courseOptionMap.values()]
      .sort((a, b) => a.name.localeCompare(b.name));
    this.allSectionOptions.sort((a, b) => a.name.localeCompare(b.name));

    // ── Build the full (student × section) row list once. Filters work on
    // this cache; we never re-join enrollments per render.
    const teacherEnrollments = enrollments.filter(e => e.teacherUID === teacherUID);
    const studentsById = new Map(this.studentService.getAll().map(s => [s.UID, s]));

    this.allStudentRows = [];
    const seenRows = new Set<string>();
    for (const e of teacherEnrollments) {
      const student = studentsById.get(e.studentUID);
      if (!student) continue;
      const rowId = `${e.studentUID}::${e.sectionId}::${e.courseId}`;
      if (seenRows.has(rowId)) continue;
      seenRows.add(rowId);
      this.allStudentRows.push({
        rowId,
        student,
        sectionId: e.sectionId,
        sectionName: sectionById.get(e.sectionId)?.name ?? 'Unknown',
        courseId: e.courseId,
        courseName: courseById.get(e.courseId)?.name ?? 'Unknown',
      });
    }

    // ── Load activities (use teacherID; see Issue #4 fix history) and pre-cache submissions
    this.allActivities = teacherID
      ? await this.activityService.getActivitiesForTeacher(teacherID)
      : await this.activityService.getActivitiesForTeacherUID(teacherUID);

    const activityIds = this.allActivities.map(a => a.id);
    const subs = activityIds.length === 0
      ? []
      : await this.activityService.getSubmissionsForActivities(activityIds);
    this.submissionsByKey = {};
    for (const sub of subs) {
      this.submissionsByKey[this.submissionKey(sub.activityId, sub.studentID)] = sub;
    }

    // Re-derive cascading section options and apply current filter
    this.refreshSectionOptions();
    this.applyFilter();
    this.cdr.detectChanges();
  }

  // ── Filter handlers ────────────────────────────────────────────────────

  /**
   * When a course is picked the section dropdown narrows to that course's
   * sections only. Picking "All courses" restores every section the teacher
   * teaches.
   */
  private refreshSectionOptions(): void {
    if (this.selectedCourseId === '') {
      // Dedupe by sectionId for the global view — a section paired with two
      // courses shouldn't appear twice.
      const seen = new Set<string>();
      this.sectionOptions = this.allSectionOptions
        .filter(s => (seen.has(s.id) ? false : (seen.add(s.id), true)))
        .sort((a, b) => a.name.localeCompare(b.name));
    } else {
      this.sectionOptions = this.allSectionOptions
        .filter(s => s.courseId === this.selectedCourseId)
        .sort((a, b) => a.name.localeCompare(b.name));
    }

    // If the active section is no longer valid under the new course, clear it.
    if (
      this.selectedSectionId &&
      !this.sectionOptions.some(s => s.id === this.selectedSectionId)
    ) {
      this.selectedSectionId = '';
    }
  }

  onCourseFilterChange(): void {
    this.refreshSectionOptions();
    this.applyFilter();
    this.cdr.detectChanges();
  }

  onSectionFilterChange(): void {
    this.applyFilter();
    this.cdr.detectChanges();
  }

  private applyFilter(): void {
    const courseId = this.selectedCourseId;
    const sectionId = this.selectedSectionId;

    // Activities: filter by courseId and sectionId when set. Legacy activities
    // (no sectionId field at all) fall through so historic data remains visible
    // — only freshly-section-scoped activities are excluded from other sections.
    this.activities = this.allActivities.filter(a => {
      if (courseId && a.courseId !== courseId) return false;
      if (sectionId && a.sectionId && a.sectionId !== sectionId) return false;
      return true;
    });

    this.studentRows = this.allStudentRows.filter(r => {
      if (courseId && r.courseId !== courseId) return false;
      if (sectionId && r.sectionId !== sectionId) return false;
      return true;
    });
  }

  attendanceStatus(activity: Activity, student: StudentAccount): AttendanceStatus {
    const submission = this.submissionsByKey[this.submissionKey(activity.id, student.studentID)];
    return this.activityService.getAttendanceStatus(activity, submission);
  }

  setAttendanceView(view: 'by-activity' | 'by-student'): void {
    this.attendanceView = view;
    this.cdr.detectChanges();
  }

  // ── Sorting ────────────────────────────────────────────────────────────

  /**
   * Toggle sort: clicking the same column flips direction, clicking another
   * column resets direction to its natural default (asc for text, desc for
   * the attendance rate so the best-performers float to the top first).
   */
  toggleSort(key: SortKey): void {
    if (this.sortKey === key) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortKey = key;
      this.sortDir = key === 'rate' ? 'desc' : 'asc';
    }
  }

  isSortedBy(key: SortKey): boolean {
    return this.sortKey === key;
  }

  sortIconFor(key: SortKey): string {
    if (!this.isSortedBy(key)) return 'ti-arrows-sort';
    return this.sortDir === 'asc' ? 'ti-sort-ascending' : 'ti-sort-descending';
  }

  // ── Summary table (by-student view) ─────────────────────────────────────

  get studentSummaries(): StudentAttendanceSummary[] {
    // For each (student, section) row, count statuses across the visible
    // activities. When a course filter is active, activities are already
    // narrowed to that course — when no course filter is active we additionally
    // scope each row to its own course so cross-course numbers don't mix.
    const summaries: StudentAttendanceSummary[] = this.studentRows.map(row => {
      const scopedActivities = this.selectedCourseId
        ? this.activities
        : this.activities.filter(a => !a.courseId || a.courseId === row.courseId);

      let present = 0;
      let late = 0;
      let absent = 0;

      for (const activity of scopedActivities) {
        const status = this.attendanceStatus(activity, row.student);
        if (status === 'present') present++;
        else if (status === 'late') late++;
        else if (status === 'absent') absent++;
      }

      const total = scopedActivities.length;
      const rate = total > 0
        ? Math.round(((present + late) / total) * 1000) / 10
        : 0;

      return { row, present, late, absent, total, rate };
    });

    const dir = this.sortDir === 'asc' ? 1 : -1;
    summaries.sort((a, b) => {
      switch (this.sortKey) {
        case 'rate':
          return (a.rate - b.rate) * dir;
        case 'section': {
          const cmp = a.row.sectionName.localeCompare(b.row.sectionName);
          if (cmp !== 0) return cmp * dir;
          return (a.row.student.lastname ?? '').localeCompare(b.row.student.lastname ?? '');
        }
        case 'course': {
          const cmp = a.row.courseName.localeCompare(b.row.courseName);
          if (cmp !== 0) return cmp * dir;
          return (a.row.student.lastname ?? '').localeCompare(b.row.student.lastname ?? '');
        }
        case 'name':
        default:
          return (a.row.student.lastname ?? '').localeCompare(b.row.student.lastname ?? '') * dir;
      }
    });

    return summaries;
  }

  rateClass(rate: number): string {
    if (rate >= 80) return 'rate-high';
    if (rate >= 60) return 'rate-mid';
    return 'rate-low';
  }

  get totalsRow(): { present: number; late: number; absent: number; total: number; rate: number } {
    const summaries = this.studentSummaries;
    const present = summaries.reduce((sum, s) => sum + s.present, 0);
    const late = summaries.reduce((sum, s) => sum + s.late, 0);
    const absent = summaries.reduce((sum, s) => sum + s.absent, 0);
    const total = summaries.reduce((sum, s) => sum + s.total, 0);
    const rate = summaries.length > 0
      ? Math.round((summaries.reduce((sum, s) => sum + s.rate, 0) / summaries.length) * 10) / 10
      : 0;
    return { present, late, absent, total, rate };
  }

  // ── By-activity view helpers ────────────────────────────────────────────

  /**
   * Rows visible under one activity card. When no course/section filter is
   * set we still want each activity to list only the students it could
   * apply to — i.e. students enrolled in the activity's course (and section,
   * if the activity is section-scoped). Legacy activities (no courseId/
   * sectionId) keep showing every visible row.
   */
  rowsForActivity(activity: Activity): StudentRow[] {
    return this.studentRows.filter(r => {
      if (activity.courseId && r.courseId !== activity.courseId) return false;
      if (activity.sectionId && r.sectionId !== activity.sectionId) return false;
      return true;
    });
  }

  // ── Reset / utility ─────────────────────────────────────────────────────

  private resetState(): void {
    this.activities = [];
    this.studentRows = [];
    this.courseOptions = [];
    this.sectionOptions = [];
    this.allSectionOptions = [];
    this.selectedCourseId = '';
    this.selectedSectionId = '';
    this.allActivities = [];
    this.allStudentRows = [];
    this.submissionsByKey = {};
  }

  hasFilters(): boolean {
    return !!this.selectedCourseId || !!this.selectedSectionId;
  }

  clearFilters(): void {
    this.selectedCourseId = '';
    this.selectedSectionId = '';
    this.refreshSectionOptions();
    this.applyFilter();
    this.cdr.detectChanges();
  }

  // ── Export ──────────────────────────────────────────────────────────────

  async exportAttendancePdf(): Promise<void> {
    let head: string[] = [];
    let body: (string | number)[][] = [];

    if (this.attendanceView === 'by-student') {
      head = [
        'Student ID',
        'Last Name',
        'First Name',
        'Course',
        'Section',
        'Present',
        'Late',
        'Absent',
        'Total',
        'Rate (%)',
      ];

      for (const summary of this.studentSummaries) {
        const s = summary.row.student;
        body.push([
          s.studentID ?? '',
          s.lastname ?? '',
          s.firstname ?? '',
          summary.row.courseName,
          summary.row.sectionName,
          summary.present,
          summary.late,
          summary.absent,
          summary.total,
          summary.rate.toFixed(1),
        ]);
      }
    } else {
      head = [
        'Student ID',
        'Last Name',
        'First Name',
        'Course',
        'Section',
        ...this.activities.map(a => a.title),
      ];

      for (const r of this.studentRows) {
        body.push([
          r.student.studentID ?? '',
          r.student.lastname ?? '',
          r.student.firstname ?? '',
          r.courseName,
          r.sectionName,
          ...this.activities.map(a => this.attendanceStatus(a, r.student)),
        ]);
      }
    }

    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;
    const titleSuffix = this.attendanceView === 'by-student' ? 'Summary' : 'By Activity';
    const subtitleParts = [
      this.courseOptions.find(c => c.id === this.selectedCourseId)?.name,
      this.sectionOptions.find(s => s.id === this.selectedSectionId)?.name,
    ].filter(Boolean) as string[];
    const subtitle = subtitleParts.length ? subtitleParts.join(' • ') : 'All courses & sections';

    const { jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');

    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(`Attendance Report — ${titleSuffix}`, 40, 40);

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

    doc.save(`attendance-${dateStr}.pdf`);
  }
}
