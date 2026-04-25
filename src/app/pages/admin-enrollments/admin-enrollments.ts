import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  AcademicService,
  Enrollment,
  Subject,
  Section,
} from '../../services/academic.service';
import { StudentAccount, StudentAccountService } from '../../services/student-account.service';
import { TeacherAccount, TeacherAccountService } from '../../services/teacher-account.service';
import Swal from 'sweetalert2';

interface EnrollmentRow {
  enrollment: Enrollment;
  studentName: string;
  studentID: string;
  subjectName: string;
  teacherName: string;
  sectionName: string;
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
  subjects: Subject[] = [];
  sections: Section[] = [];
  rows: EnrollmentRow[] = [];

  filterSubjectId = '';
  filterTeacherUID = '';

  showForm = false;
  form = { studentUID: '', subjectId: '', sectionId: '' };
  selectedSubject: Subject | null = null;

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
      toast: true,
      position: 'top-end',
      icon,
      title,
      showConfirmButton: false,
      timer: 2000,
      timerProgressBar: true,
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
    [this.enrollments, this.subjects, this.sections] = await Promise.all([
      this.academic.getEnrollments(),
      this.academic.getSubjects(),
      this.academic.getSections(),
    ]);
    this.buildRows();
    this.loading = false;
    this.cdr.detectChanges();
  }

  private buildRows(): void {
    this.rows = this.enrollments.map(e => {
      const student = this.students.find(s => s.UID === e.studentUID);
      const subject = this.subjects.find(s => s.id === e.subjectId);
      const teacher = this.teachers.find(t => t.UID === e.teacherUID);
      const section = this.sections.find(s => s.id === e.sectionId);
      return {
        enrollment: e,
        studentName: student
          ? `${student.lastname}, ${student.firstname} ${student.middlename ?? ''}`.trim()
          : e.studentUID,
        studentID: student?.studentID ?? e.studentID,
        subjectName: subject?.name ?? '—',
        teacherName: teacher
          ? `${teacher.firstname} ${teacher.lastname}`.trim()
          : '—',
        sectionName: section?.name ?? '—',
      };
    });
  }

  get filteredRows(): EnrollmentRow[] {
    return this.rows.filter(r => {
      const matchSubject = !this.filterSubjectId || r.enrollment.subjectId === this.filterSubjectId;
      const matchTeacher = !this.filterTeacherUID || r.enrollment.teacherUID === this.filterTeacherUID;
      return matchSubject && matchTeacher;
    });
  }

  get sectionsForSelectedSubject(): Section[] {
    return this.sections;
  }

  onSubjectChange(): void {
    this.selectedSubject = this.subjects.find(s => s.id === this.form.subjectId) ?? null;
    this.form.sectionId = '';
  }

  teacherForSubject(subjectId: string): string {
    const subject = this.subjects.find(s => s.id === subjectId);
    if (!subject) return '—';
    const teacher = this.teachers.find(t => t.UID === subject.teacherUID);
    return teacher ? `${teacher.firstname} ${teacher.lastname}`.trim() : '—';
  }

  alreadyEnrolled(studentUID: string, subjectId: string): boolean {
    return this.enrollments.some(
      e => e.studentUID === studentUID && e.subjectId === subjectId,
    );
  }

  openForm(): void {
    this.form = { studentUID: '', subjectId: '', sectionId: '' };
    this.selectedSubject = null;
    this.showForm = true;
  }

  cancelForm(): void {
    this.showForm = false;
  }

  async enroll(): Promise<void> {
    const { studentUID, subjectId, sectionId } = this.form;
    if (!studentUID || !subjectId) {
      this.toast('error', 'Please select a student and a subject');
      return;
    }
    if (this.alreadyEnrolled(studentUID, subjectId)) {
      this.toast('error', 'Student is already enrolled in that subject');
      return;
    }
    const subject = this.subjects.find(s => s.id === subjectId);
    const student = this.students.find(s => s.UID === studentUID);
    if (!subject || !student) return;

    try {
      await this.academic.enrollStudent({
        studentUID,
        studentID: student.studentID,
        subjectId,
        teacherUID: subject.teacherUID,
        sectionId: sectionId || undefined,
      });
      this.showForm = false;
      await this.loadAll();
      this.toast('success', 'Student enrolled successfully');
    } catch {
      this.toast('error', 'Failed to enroll student');
    }
  }

  async removeEnrollment(id: string, studentName: string, subjectName: string): Promise<void> {
    const res = await Swal.fire({
      icon: 'warning',
      title: 'Remove enrollment?',
      text: `Remove ${studentName} from ${subjectName}?`,
      showCancelButton: true,
      confirmButtonText: 'Remove',
      confirmButtonColor: '#ef4444',
    });
    if (!res.isConfirmed) return;
    try {
      await this.academic.removeEnrollment(id);
      await this.loadAll();
      this.toast('success', 'Enrollment removed');
    } catch {
      this.toast('error', 'Failed to remove enrollment');
    }
  }
}