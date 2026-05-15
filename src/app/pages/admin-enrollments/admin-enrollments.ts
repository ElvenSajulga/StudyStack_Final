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
  showBulkForm = false;
  bulkForm = {
    programId: '',
    courseId: '',
    sectionId: '',
    teacherUID: '',
  };
  bulkSelectedUIDs = new Set<string>();
  bulkSearch = '';
  bulkProgramFilter = '';
  bulkProcessing = false;
  bulkResults: Array<{
    studentName: string;
    studentID: string;
    status: 'enrolled' | 'skipped' | 'failed';
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

  openBulkForm(): void {
    this.bulkForm = {
      programId: '', courseId: '', sectionId: '', teacherUID: '',
    };
    this.bulkSelectedUIDs = new Set<string>();
    this.bulkSearch = '';
    this.bulkProgramFilter = '';
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

  onBulkProgramChange(): void {
    this.bulkForm.courseId = '';
    this.bulkForm.sectionId = '';
    this.bulkForm.teacherUID = '';
  }

  onBulkCourseChange(): void {
    this.bulkForm.sectionId = '';
    this.bulkForm.teacherUID = '';
  }

  onBulkSectionChange(): void {
    const cs = this.courseSections.find(
      cs => cs.courseId === this.bulkForm.courseId
        && cs.sectionId === this.bulkForm.sectionId,
    );
    this.bulkForm.teacherUID = cs?.teacherUID ?? '';
  }

  /** Distinct program names found across student records — used for the filter dropdown. */
  get bulkStudentPrograms(): string[] {
    const set = new Set<string>();
    for (const s of this.students) {
      if (s.program) set.add(s.program);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }

  get filteredBulkStudents(): StudentAccount[] {
    const q = this.bulkSearch.trim().toLowerCase();
    const programFilter = this.bulkProgramFilter.trim().toLowerCase();
    return this.students.filter(s => {
      if (programFilter && (s.program ?? '').toLowerCase() !== programFilter) return false;
      if (!q) return true;
      const haystack = [
        s.firstname, s.lastname, s.studentID, s.email, s.program, s.UID,
      ].map(v => (v ?? '').toLowerCase()).join(' ');
      return haystack.includes(q);
    });
  }

  isBulkSelected(uid: string): boolean {
    return this.bulkSelectedUIDs.has(uid);
  }

  toggleBulkSelect(uid: string): void {
    if (this.bulkSelectedUIDs.has(uid)) this.bulkSelectedUIDs.delete(uid);
    else this.bulkSelectedUIDs.add(uid);
  }

  /** True iff every currently-visible student is in the selection set. */
  get allVisibleSelected(): boolean {
    const visible = this.filteredBulkStudents;
    if (visible.length === 0) return false;
    return visible.every(s => this.bulkSelectedUIDs.has(s.UID));
  }

  toggleSelectAllVisible(): void {
    const visible = this.filteredBulkStudents;
    if (this.allVisibleSelected) {
      for (const s of visible) this.bulkSelectedUIDs.delete(s.UID);
    } else {
      for (const s of visible) this.bulkSelectedUIDs.add(s.UID);
    }
  }

  clearBulkSelection(): void {
    this.bulkSelectedUIDs.clear();
  }

  get bulkSelectedCount(): number {
    return this.bulkSelectedUIDs.size;
  }

  get bulkSuccessCount(): number {
    return this.bulkResults.filter(r => r.status === 'enrolled').length;
  }

  get bulkSkippedCount(): number {
    return this.bulkResults.filter(r => r.status === 'skipped').length;
  }

  get bulkFailedCount(): number {
    return this.bulkResults.filter(r => r.status === 'failed').length;
  }

  /**
   * Enroll every selected student into the target (course, section).
   * Each call re-uses `enrollStudent`, so the per-student validations
   * already in place (schedule conflict, missing course) still apply.
   * Results are collected per student so the admin can see exactly who
   * succeeded and why anyone failed.
   */
  async bulkEnroll(): Promise<void> {
    const { courseId, sectionId, teacherUID } = this.bulkForm;
    if (!courseId || !sectionId) {
      this.toast('error', 'Select a course and section first');
      return;
    }
    if (!teacherUID) {
      this.toast('error', 'No teacher assigned to this section for this course');
      return;
    }
    const selected = this.students.filter(s => this.bulkSelectedUIDs.has(s.UID));
    if (selected.length === 0) {
      this.toast('error', 'Pick at least one student to enroll');
      return;
    }

    const course = this.courses.find(c => c.id === courseId);
    const section = this.sections.find(s => s.id === sectionId);

    this.bulkProcessing = true;
    this.bulkResults = [];
    this.bulkProgressDone = 0;
    this.bulkProgressTotal = selected.length;

    for (const student of selected) {
      const displayName = `${student.lastname}, ${student.firstname}`.trim();
      try {
        if (this.alreadyEnrolled(student.UID, courseId, sectionId)) {
          this.bulkResults.push({
            studentName: displayName,
            studentID: student.studentID,
            status: 'skipped',
            reason: 'Already enrolled in this section',
          });
        } else {
          await this.academic.enrollStudent({
            studentUID: student.UID,
            studentID: student.studentID,
            courseId,
            sectionId,
            teacherUID,
          });
          this.bulkResults.push({
            studentName: displayName,
            studentID: student.studentID,
            status: 'enrolled',
          });
        }
      } catch (e) {
        const reason = e instanceof Error ? e.message : 'Unknown error';
        this.bulkResults.push({
          studentName: displayName,
          studentID: student.studentID,
          status: 'failed',
          reason,
        });
      }
      this.bulkProgressDone++;
      this.cdr.detectChanges();
    }

    const actor = this.auth.getCurrentUser();
    void this.auditLog.log({
      actorUID: actor?.UID ?? 'unknown',
      actorName: actor?.name ?? 'Unknown Admin',
      action: 'create',
      entityType: 'enrollment',
      entityId: `bulk-${courseId}-${sectionId}`,
      description:
        `Bulk-enrolled ${this.bulkSuccessCount} of ${selected.length} students into ` +
        `${course?.name ?? courseId} (${section?.name ?? sectionId}). ` +
        `${this.bulkSkippedCount} skipped, ${this.bulkFailedCount} failed.`,
      timestamp: new Date().toISOString(),
    });

    this.bulkProcessing = false;
    this.bulkSelectedUIDs.clear();
    await this.loadAll();

    if (this.bulkSuccessCount > 0) {
      const detail = this.bulkSkippedCount + this.bulkFailedCount > 0
        ? { text: `${this.bulkSkippedCount} skipped, ${this.bulkFailedCount} failed — see details below.` }
        : {};
      this.toastService.success(`${this.bulkSuccessCount} student(s) enrolled`, detail);
    } else {
      this.toastService.error(
        'No students were enrolled',
        { text: 'See per-student details below.' },
      );
    }
  }
}