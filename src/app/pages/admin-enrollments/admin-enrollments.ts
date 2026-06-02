import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  AcademicService,
  Enrollment,
  Course,
  Section,
  Program,
  CourseSection,
  YearLevel,
} from '../../services/academic.service';
import { StudentAccount, StudentAccountService } from '../../services/student-account.service';
import { TeacherAccount, TeacherAccountService } from '../../services/teacher-account.service';
import { AuditLogService } from '../../services/audit-log.service';
import { AuthService } from '../../services/auth.service';
import { AcademicCalendarService } from '../../services/academic-calendar.service';
import { FirestoreService } from '../../services/firestore.service';
import { ToastService } from '../../services/toast.service';

interface EnrollmentRow {
  enrollment: Enrollment;
  studentName: string;
  studentID: string;
  courseName: string;
  sectionName: string;
  teacherName: string;
  programName: string;
}

@Component({
  selector: 'app-admin-enrollments',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-enrollments.html',
  styleUrl: './admin-enrollments.scss',
})
export class AdminEnrollments implements OnInit {
  enrollments: Enrollment[] = [];
  students: StudentAccount[] = [];
  teachers: TeacherAccount[] = [];
  programs: Program[] = [];
  courses: Course[] = [];
  sections: Section[] = [];
  courseSections: CourseSection[] = [];
  yearLevels: YearLevel[] = [];
  rows: EnrollmentRow[] = [];

  filterProgramId = '';
  filterCourseId = '';

  showForm = false;
  form = {
    studentUID: '',
    programId: '',
    courseId: '',
    sectionId: '',
    teacherUID: '',
  };

  editingEnrollmentId: string | null = null;
  editTransferForm = {
    sectionId: '',
    teacherUID: '',
  };

  // ── bulk enroll ─────────────────────────────────────────────────────────────
  // New shape: pick ONE section, then pick MULTIPLE courses to enroll every
  // student currently in that section into.
  showBulkForm = false;
  bulkForm = {
    sectionId: '',
  };
  /** Course IDs the admin has ticked to enroll the section into. */
  bulkSelectedCourseIds = new Set<string>();
  bulkProcessing = false;
  /** Per-course result of the last bulk run. */
  bulkResults: Array<{
    courseId: string;
    courseName: string;
    status: 'enrolled' | 'skipped' | 'partial' | 'failed';
    enrolled: number;
    skipped: number;
    failed: number;
    reason?: string;
  }> = [];
  bulkProgressDone = 0;
  bulkProgressTotal = 0;

  loading = false;

  constructor(
    private readonly academic: AcademicService,
    private readonly studentService: StudentAccountService,
    private readonly teacherService: TeacherAccountService,
    private readonly auditLog: AuditLogService,
    private readonly auth: AuthService,
    private readonly academicCalendar: AcademicCalendarService,
    private readonly firestore: FirestoreService,
    private readonly toastService: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    void this.loadAll();
  }

  private toast(icon: 'success' | 'error', title: string): void {
    if (icon === 'success') this.toastService.success(title);
    else this.toastService.error(title);
  }

  private async loadAll(): Promise<void> {
    this.loading = true;
    await Promise.all([
      this.studentService.reloadFromServer(),
      this.teacherService.reloadFromServer(),
    ]);
    this.students = this.studentService.getAll();
    this.teachers = this.teacherService.getAll();

    [this.enrollments, this.programs, this.courses,
      this.sections, this.courseSections] = await Promise.all([
      this.academic.getEnrollments(),
      this.academic.getPrograms(),
      this.academic.getCourses(),
      this.academic.getSections(),
      this.academic.getCourseSections(),
    ]);

    const allYL: YearLevel[] = [];
    for (const p of this.programs) {
      const yl = await this.academic.getYearLevelsByProgram(p.id);
      allYL.push(...yl);
    }
    this.yearLevels = allYL;

    this.buildRows();
    this.loading = false;
    this.cdr.detectChanges();
  }

  private buildRows(): void {
    this.rows = this.enrollments.map(e => {
      const student = this.students.find(s => s.UID === e.studentUID);
      const course = this.courses.find(c => c.id === e.courseId);
      const section = this.sections.find(s => s.id === e.sectionId);
      const teacher = this.teachers.find(t => t.UID === e.teacherUID);
      const program = this.programs.find(p => p.id === course?.programId);
      return {
        enrollment: e,
        studentName: student
          ? `${student.lastname}, ${student.firstname}`.trim()
          : e.studentUID,
        studentID: student?.studentID ?? e.studentID,
        courseName: course?.name ?? '—',
        sectionName: section?.name ?? '—',
        teacherName: teacher
          ? `${teacher.firstname} ${teacher.lastname}`.trim()
          : '—',
        programName: program?.name ?? '—',
      };
    });
  }

  get filteredRows(): EnrollmentRow[] {
    return this.rows.filter(r => {
      const course = this.courses.find(c => c.id === r.enrollment.courseId);
      const matchProgram = !this.filterProgramId
        || course?.programId === this.filterProgramId;
      const matchCourse = !this.filterCourseId
        || r.enrollment.courseId === this.filterCourseId;
      return matchProgram && matchCourse;
    });
  }

  // ── form helpers ──────────────────────────────────────────────────────────────

  coursesForProgram(programId: string): Course[] {
    return this.courses.filter(c => c.programId === programId);
  }

  sectionsForCourse(courseId: string): Section[] {
    return this.courseSections
      .filter(cs => cs.courseId === courseId)
      .map(cs => this.sections.find(s => s.id === cs.sectionId))
      .filter((s): s is Section => !!s);
  }

  yearLevelName(yearLevelId: string): string {
    return this.yearLevels.find(yl => yl.id === yearLevelId)?.name ?? '';
  }

  onProgramChange(): void {
    this.form.courseId = '';
    this.form.sectionId = '';
    this.form.teacherUID = '';
  }

  onCourseChange(): void {
    this.form.sectionId = '';
    this.form.teacherUID = '';
  }

  onSectionChange(): void {
    // auto-fill teacher from courseSection assignment
    const cs = this.courseSections.find(
      cs => cs.courseId === this.form.courseId
        && cs.sectionId === this.form.sectionId,
    );
    this.form.teacherUID = cs?.teacherUID ?? '';
  }

  teacherNameForUID(uid: string): string {
    const t = this.teachers.find(t => t.UID === uid);
    return t ? `${t.firstname} ${t.lastname}`.trim() : '—';
  }

  alreadyEnrolled(studentUID: string, courseId: string, sectionId: string): boolean {
    return this.enrollments.some(
      e => e.studentUID === studentUID
        && e.courseId === courseId
        && e.sectionId === sectionId,
    );
  }

  openForm(): void {
    this.form = {
      studentUID: '', programId: '',
      courseId: '', sectionId: '', teacherUID: '',
    };
    this.showForm = true;
  }

  cancelForm(): void { this.showForm = false; }

  async enroll(): Promise<void> {
    const { studentUID, courseId, sectionId, teacherUID } = this.form;
    if (!studentUID || !courseId || !sectionId) {
      this.toast('error', 'Please select a student, course, and section');
      return;
    }
    if (!teacherUID) {
      this.toast('error', 'No teacher assigned to this section for this course');
      return;
    }
    if (this.alreadyEnrolled(studentUID, courseId, sectionId)) {
      this.toast('error', 'Student is already enrolled in this course and section');
      return;
    }

    const student = this.students.find(s => s.UID === studentUID);
    if (!student) return;

    try {
      const course = this.courses.find(c => c.id === courseId);
      const section = this.sections.find(s => s.id === sectionId);
      await this.academic.enrollStudent({
        studentUID,
        studentID: student.studentID,
        courseId,
        sectionId,
        teacherUID,
      });
      const actor = this.auth.getCurrentUser();
      void this.auditLog.log({
        actorUID: actor?.UID ?? 'unknown',
        actorName: actor?.name ?? 'Unknown Admin',
        action: 'create',
        entityType: 'enrollment',
        entityId: `${studentUID}-${courseId}-${sectionId}`,
        description: `Enrolled student ${student.firstname} ${student.lastname} in ${course?.name} (${section?.name})`,
        timestamp: new Date().toISOString(),
      });
      this.showForm = false;
      await this.loadAll();
      this.toast('success', 'Student enrolled successfully');

      // Check enrollment window
      const calendar = await this.academicCalendar.get();
      if (calendar && !this.academicCalendar.isEnrollmentOpen(calendar)) {
        const enrollOpen = new Date(calendar.enrollmentOpen).toLocaleDateString();
        const enrollClose = new Date(calendar.enrollmentClose).toLocaleDateString();
        void this.toastService.alert('Enrollment window closed', {
          html: `<p>Enrollment is currently outside the scheduled window.</p><p style="margin-top: 8px;"><strong>Enrollment period:</strong> ${enrollOpen} to ${enrollClose}</p>`,
        }, 'info');
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to enroll student';
      this.toastService.error('Failed to enroll student', { text: message });
    }
  }

  async removeEnrollment(r: EnrollmentRow): Promise<void> {
    const ok = await this.toastService.confirmDestructive('Remove enrollment?', {
      text: `Remove ${r.studentName} from ${r.courseName} (${r.sectionName})?`,
      confirmText: 'Remove',
    });
    if (!ok) return;
    try {
      await this.academic.removeEnrollment(r.enrollment.id);
      const actor = this.auth.getCurrentUser();
      void this.auditLog.log({
        actorUID: actor?.UID ?? 'unknown',
        actorName: actor?.name ?? 'Unknown Admin',
        action: 'delete',
        entityType: 'enrollment',
        entityId: r.enrollment.id,
        description: `Removed ${r.studentName} from ${r.courseName} (${r.sectionName})`,
        timestamp: new Date().toISOString(),
      });
      await this.loadAll();
      this.toast('success', 'Enrollment removed');
    } catch { this.toast('error', 'Failed to remove enrollment'); }
  }

  openTransfer(r: EnrollmentRow): void {
    this.editingEnrollmentId = r.enrollment.id;
    this.editTransferForm = {
      sectionId: r.enrollment.sectionId,
      teacherUID: r.enrollment.teacherUID,
    };
  }

  cancelTransfer(): void {
    this.editingEnrollmentId = null;
    this.editTransferForm = { sectionId: '', teacherUID: '' };
  }

  onTransferSectionChange(): void {
    const row = this.rows.find(r => r.enrollment.id === this.editingEnrollmentId);
    if (!row) return;
    const cs = this.courseSections.find(
      cs => cs.courseId === row.enrollment.courseId
        && cs.sectionId === this.editTransferForm.sectionId,
    );
    this.editTransferForm.teacherUID = cs?.teacherUID ?? '';
  }

  async saveTransfer(r: EnrollmentRow): Promise<void> {
    const newSection = this.sections.find(s => s.id === this.editTransferForm.sectionId);
    if (!newSection) {
      this.toast('error', 'Invalid section selected');
      return;
    }
    if (!this.editTransferForm.teacherUID) {
      this.toast('error', 'No teacher assigned to this section');
      return;
    }

    try {
      await this.firestore.update('enrollments', r.enrollment.id, {
        sectionId: this.editTransferForm.sectionId,
        teacherUID: this.editTransferForm.teacherUID,
        transferredAt: new Date().toISOString(),
      });

      const actor = this.auth.getCurrentUser();
      void this.auditLog.log({
        actorUID: actor?.UID ?? 'unknown',
        actorName: actor?.name ?? 'Unknown Admin',
        action: 'update',
        entityType: 'enrollment',
        entityId: r.enrollment.id,
        description: `Transferred ${r.studentName} to ${newSection.name}`,
        timestamp: new Date().toISOString(),
      });

      this.editingEnrollmentId = null;
      await this.loadAll();
      this.toast('success', `Student transferred to ${newSection.name}`);
    } catch { this.toast('error', 'Failed to transfer enrollment'); }
  }

  // ── bulk enroll ─────────────────────────────────────────────────────────────
  //
  // Flow: admin picks ONE section, then ticks multiple courses. We enroll every
  // student currently in that section into each ticked course. The section may
  // be empty (zero students) — the form is still submittable; the run is a
  // no-op for that course and is reported as such.

  openBulkForm(): void {
    this.bulkForm = { sectionId: '' };
    this.bulkSelectedCourseIds = new Set<string>();
    this.bulkResults = [];
    this.bulkProgressDone = 0;
    this.bulkProgressTotal = 0;
    this.showBulkForm = true;
  }

  cancelBulkForm(): void {
    if (this.bulkProcessing) return;
    this.showBulkForm = false;
    this.bulkResults = [];
  }

  onBulkSectionChange(): void {
    // Changing the section invalidates any previously-picked courses, since
    // course/section pairings are joined through `courseSections`.
    this.bulkSelectedCourseIds = new Set<string>();
    this.bulkResults = [];
  }

  /** All sections, sorted, available as bulk targets. */
  get bulkSectionOptions(): Section[] {
    return [...this.sections].sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Unique students currently enrolled in the given section (derived from
   *  enrollment records, since StudentAccount has no fixed sectionId). */
  studentsInSection(sectionId: string): StudentAccount[] {
    if (!sectionId) return [];
    const uids = new Set<string>();
    for (const e of this.enrollments) {
      if (e.sectionId === sectionId) uids.add(e.studentUID);
    }
    return this.students.filter(s => uids.has(s.UID));
  }

  studentCountForSection(sectionId: string): number {
    return this.studentsInSection(sectionId).length;
  }

  /** Courses that have a CourseSection record (i.e. a teacher assigned) for
   *  the picked section. Only these can be bulk-enrolled. */
  coursesForBulkSection(): Course[] {
    const sectionId = this.bulkForm.sectionId;
    if (!sectionId) return [];
    const courseIds = new Set(
      this.courseSections
        .filter(cs => cs.sectionId === sectionId)
        .map(cs => cs.courseId),
    );
    return this.courses
      .filter(c => courseIds.has(c.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Teacher assigned to teach this course in this section, if any. */
  bulkTeacherFor(courseId: string): string {
    const cs = this.courseSections.find(
      cs => cs.courseId === courseId && cs.sectionId === this.bulkForm.sectionId,
    );
    return cs?.teacherUID ?? '';
  }

  /** How many of the section's current students are already enrolled in
   *  (courseId, sectionId). Drives the per-course status badge. */
  enrolledInCourseCount(courseId: string): number {
    const sectionId = this.bulkForm.sectionId;
    if (!sectionId) return 0;
    const inSection = this.studentsInSection(sectionId);
    let n = 0;
    for (const s of inSection) {
      if (this.alreadyEnrolled(s.UID, courseId, sectionId)) n++;
    }
    return n;
  }

  /** Returns true when EVERY current student of the section is already
   *  enrolled in this course — that's the dup case the admin should not be
   *  allowed to re-trigger ("same courses for that specific section"). */
  isCourseFullyEnrolledForSection(courseId: string): boolean {
    const total = this.studentCountForSection(this.bulkForm.sectionId);
    if (total === 0) return false;
    return this.enrolledInCourseCount(courseId) === total;
  }

  isBulkCourseDisabled(courseId: string): boolean {
    return (
      this.isCourseFullyEnrolledForSection(courseId) ||
      !this.bulkTeacherFor(courseId)
    );
  }

  isBulkCourseSelected(courseId: string): boolean {
    return this.bulkSelectedCourseIds.has(courseId);
  }

  toggleBulkCourse(courseId: string): void {
    if (this.isBulkCourseDisabled(courseId)) return;
    if (this.bulkSelectedCourseIds.has(courseId)) {
      this.bulkSelectedCourseIds.delete(courseId);
    } else {
      this.bulkSelectedCourseIds.add(courseId);
    }
  }

  /** Total number of courses the admin can actually pick (excluding disabled). */
  get bulkSelectableCourseCount(): number {
    return this.coursesForBulkSection().filter(c => !this.isBulkCourseDisabled(c.id)).length;
  }

  get bulkSelectedCourseCount(): number {
    return this.bulkSelectedCourseIds.size;
  }

  /** True iff every selectable course is selected — drives "Select all". */
  get allSelectableCoursesSelected(): boolean {
    const selectable = this.coursesForBulkSection().filter(c => !this.isBulkCourseDisabled(c.id));
    if (selectable.length === 0) return false;
    return selectable.every(c => this.bulkSelectedCourseIds.has(c.id));
  }

  toggleSelectAllBulkCourses(): void {
    const selectable = this.coursesForBulkSection().filter(c => !this.isBulkCourseDisabled(c.id));
    if (this.allSelectableCoursesSelected) {
      for (const c of selectable) this.bulkSelectedCourseIds.delete(c.id);
    } else {
      for (const c of selectable) this.bulkSelectedCourseIds.add(c.id);
    }
  }

  clearBulkSelection(): void {
    this.bulkSelectedCourseIds.clear();
  }

  // Aggregated counts shown in the post-run summary.
  get bulkSuccessCount(): number {
    return this.bulkResults.reduce((n, r) => n + r.enrolled, 0);
  }

  get bulkSkippedCount(): number {
    return this.bulkResults.reduce((n, r) => n + r.skipped, 0);
  }

  get bulkFailedCount(): number {
    return this.bulkResults.reduce((n, r) => n + r.failed, 0);
  }

  /**
   * For each selected course, enroll every student currently in the picked
   * section into (course, section). Per-student schedule conflicts are
   * caught by `enrollStudent`. Duplicates are skipped via `alreadyEnrolled`.
   * Sections with zero students still complete successfully — the per-course
   * result just shows "no students to enroll".
   */
  async bulkEnroll(): Promise<void> {
    const sectionId = this.bulkForm.sectionId;
    if (!sectionId) {
      this.toast('error', 'Select a section first');
      return;
    }
    const courseIds = Array.from(this.bulkSelectedCourseIds);
    if (courseIds.length === 0) {
      this.toast('error', 'Pick at least one course to enroll the section into');
      return;
    }

    const section = this.sections.find(s => s.id === sectionId);
    const sectionStudents = this.studentsInSection(sectionId);

    this.bulkProcessing = true;
    this.bulkResults = [];
    this.bulkProgressDone = 0;
    this.bulkProgressTotal = courseIds.length;

    for (const courseId of courseIds) {
      const course = this.courses.find(c => c.id === courseId);
      const courseName = course?.name ?? courseId;
      const teacherUID = this.bulkTeacherFor(courseId);

      let enrolled = 0;
      let skipped = 0;
      let failed = 0;
      let reason: string | undefined;

      if (!teacherUID) {
        this.bulkResults.push({
          courseId, courseName,
          status: 'skipped', enrolled: 0, skipped: 0, failed: 0,
          reason: 'No teacher assigned to this section for this course',
        });
        this.bulkProgressDone++;
        this.cdr.detectChanges();
        continue;
      }

      if (sectionStudents.length === 0) {
        // Empty section is allowed — record as a no-op for this course.
        this.bulkResults.push({
          courseId, courseName,
          status: 'skipped', enrolled: 0, skipped: 0, failed: 0,
          reason: 'Section has no students yet',
        });
        this.bulkProgressDone++;
        this.cdr.detectChanges();
        continue;
      }

      for (const student of sectionStudents) {
        try {
          if (this.alreadyEnrolled(student.UID, courseId, sectionId)) {
            skipped++;
          } else {
            await this.academic.enrollStudent({
              studentUID: student.UID,
              studentID: student.studentID,
              courseId,
              sectionId,
              teacherUID,
            });
            enrolled++;
          }
        } catch (e) {
          failed++;
          if (!reason) reason = e instanceof Error ? e.message : 'Enrollment failed';
        }
      }

      let status: 'enrolled' | 'skipped' | 'partial' | 'failed';
      if (enrolled > 0 && failed === 0) {
        status = 'enrolled';
      } else if (enrolled > 0 && failed > 0) {
        status = 'partial';
      } else if (failed > 0) {
        status = 'failed';
      } else {
        status = 'skipped';
        if (!reason && skipped > 0) reason = 'All students were already enrolled';
      }

      this.bulkResults.push({
        courseId, courseName, status, enrolled, skipped, failed, reason,
      });
      this.bulkProgressDone++;
      this.cdr.detectChanges();
    }

    const actor = this.auth.getCurrentUser();
    void this.auditLog.log({
      actorUID: actor?.UID ?? 'unknown',
      actorName: actor?.name ?? 'Unknown Admin',
      action: 'create',
      entityType: 'enrollment',
      entityId: `bulk-section-${sectionId}`,
      description:
        `Bulk-enrolled section "${section?.name ?? sectionId}" into ${courseIds.length} ` +
        `course(s): ${this.bulkSuccessCount} enrollment(s) created, ` +
        `${this.bulkSkippedCount} skipped, ${this.bulkFailedCount} failed.`,
      timestamp: new Date().toISOString(),
    });

    this.bulkProcessing = false;
    this.bulkSelectedCourseIds.clear();
    await this.loadAll();

    if (this.bulkSuccessCount > 0) {
      const detail = this.bulkSkippedCount + this.bulkFailedCount > 0
        ? { text: `${this.bulkSkippedCount} skipped, ${this.bulkFailedCount} failed — see details below.` }
        : {};
      this.toastService.success(
        `${this.bulkSuccessCount} enrollment(s) created`,
        detail,
      );
    } else if (sectionStudents.length === 0) {
      this.toastService.success('Bulk operation complete', {
        text: 'Section has no students yet — no enrollments created.',
      });
    } else {
      this.toastService.error(
        'No new enrollments were created',
        { text: 'See per-course details below.' },
      );
    }
  }
}