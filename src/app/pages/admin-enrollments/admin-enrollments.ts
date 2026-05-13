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
}