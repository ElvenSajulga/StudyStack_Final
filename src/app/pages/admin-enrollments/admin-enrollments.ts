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
import Swal from 'sweetalert2';

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

  loading = false;

  constructor(
    private readonly academic: AcademicService,
    private readonly studentService: StudentAccountService,
    private readonly teacherService: TeacherAccountService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    void this.loadAll();
  }

  private toast(icon: 'success' | 'error', title: string): void {
    void Swal.fire({
      toast: true, position: 'top-end', icon, title,
      showConfirmButton: false, timer: 2000, timerProgressBar: true,
    });
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
      await this.academic.enrollStudent({
        studentUID,
        studentID: student.studentID,
        courseId,
        sectionId,
        teacherUID,
      });
      this.showForm = false;
      await this.loadAll();
      this.toast('success', 'Student enrolled successfully');
    } catch { this.toast('error', 'Failed to enroll student'); }
  }

  async removeEnrollment(r: EnrollmentRow): Promise<void> {
    const res = await Swal.fire({
      icon: 'warning',
      title: 'Remove enrollment?',
      text: `Remove ${r.studentName} from ${r.courseName} (${r.sectionName})?`,
      showCancelButton: true,
      confirmButtonText: 'Remove',
      confirmButtonColor: '#ef4444',
    });
    if (!res.isConfirmed) return;
    try {
      await this.academic.removeEnrollment(r.enrollment.id);
      await this.loadAll();
      this.toast('success', 'Enrollment removed');
    } catch { this.toast('error', 'Failed to remove enrollment'); }
  }
}