import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { StudentAccount, StudentAccountService } from '../../services/student-account.service';
import { AcademicService, Course, Section } from '../../services/academic.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-admin-students',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-students.html',
  styleUrl: './admin-students.scss',
})
export class AdminStudents implements OnInit {
  students: StudentAccount[] = [];
  courses: Course[] = [];
  sections: Section[] = [];

  addForm: Partial<StudentAccount> & { courseId?: string; sectionId?: string } = this.emptyAddForm();

  showEditModal = false;
  editForm: Partial<StudentAccount> & { courseId?: string; sectionId?: string } = {};
  editingUID = '';

  loading = false;

  constructor(
    private readonly studentService: StudentAccountService,
    private readonly academic: AcademicService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    void this.loadAll();
  }

  private emptyAddForm() {
    return {
      UID: '',
      name: '',
      course: '',
      courseId: '',
      sectionId: '',
      studentID: '',
      password: '',
      email: '',
      status: 'active' as const,
      lastname: '',
      firstname: '',
      middlename: '',
    };
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
    await this.studentService.reloadFromServer();
    this.students = this.studentService.getAll();
    [this.courses, this.sections] = await Promise.all([
      this.academic.getCourses(),
      this.academic.getSections(),
    ]);
    this.loading = false;
    this.cdr.detectChanges();
  }

  get totalStudents(): number {
    return this.studentService.getCount();
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  sectionsForCourse(courseId: string): Section[] {
    return this.sections.filter(s => s.courseId === courseId);
  }

  courseNameById(courseId: string): string {
    return this.courses.find(c => c.id === courseId)?.name ?? '';
  }

  sectionNameById(sectionId: string): string {
    return this.sections.find(s => s.id === sectionId)?.name ?? '';
  }

  onAddCourseChange(): void {
    this.addForm.sectionId = '';
    this.addForm.course = this.courseNameById(this.addForm.courseId ?? '');
  }

  onEditCourseChange(): void {
    this.editForm.sectionId = '';
    this.editForm.course = this.courseNameById(this.editForm.courseId ?? '');
  }

  // ── add ───────────────────────────────────────────────────────────────────

  addStudent(): void {
    const f = this.addForm;
    if (!f.UID || !f.password || !f.studentID || !f.lastname || !f.firstname) {
      this.toast('error', 'Please fill in UID, Password, Student ID, Lastname, and Firstname');
      return;
    }

    f.name = `${f.firstname} ${f.lastname}`.trim();
    f.course = this.courseNameById(f.courseId ?? '');

    try {
      this.studentService.add(f as StudentAccount).subscribe({
        next: () => {
          this.addForm = this.emptyAddForm();
          this.toast('success', 'Student added successfully');
          void this.loadAll();
        },
        error: (e: unknown) => {
          this.toast('error', (e as { message?: string })?.message ?? 'Failed to add student');
        },
      });
    } catch (e: unknown) {
      this.toast('error', (e as { message?: string })?.message ?? 'Failed to add student');
    }
  }

  // ── edit ──────────────────────────────────────────────────────────────────

  openEdit(s: StudentAccount): void {
    this.editingUID = s.UID;
    const matchedCourse = this.courses.find(c => c.name === s.course);
    this.editForm = {
      UID: s.UID,
      studentID: s.studentID,
      firstname: s.firstname,
      lastname: s.lastname,
      middlename: s.middlename,
      email: s.email,
      course: s.course,
      courseId: matchedCourse?.id ?? '',
      sectionId: '',
      status: s.status,
      password: s.password,
    };
    this.showEditModal = true;
    this.cdr.detectChanges();
  }

  closeEdit(): void {
    this.showEditModal = false;
    this.editingUID = '';
  }

  saveEdit(): void {
    const f = this.editForm;
    if (!f.firstname || !f.lastname || !f.studentID) {
      this.toast('error', 'Firstname, Lastname, and Student ID are required');
      return;
    }

    const changes: Partial<StudentAccount> = {
      firstname: f.firstname,
      lastname: f.lastname,
      middlename: f.middlename ?? '',
      name: `${f.firstname} ${f.lastname}`.trim(),
      studentID: f.studentID ?? '',
      email: f.email ?? '',
      course: this.courseNameById(f.courseId ?? '') || f.course || '',
      status: f.status ?? 'active',
      password: f.password ?? '',
    };

    try {
      this.studentService.update(this.editingUID, changes);
      this.toast('success', 'Student updated successfully');
      this.closeEdit();
      void this.loadAll();
    } catch {
      this.toast('error', 'Failed to update student');
    }
  }

  // ── remove ────────────────────────────────────────────────────────────────

  async removeStudent(uid: string): Promise<void> {
    const res = await Swal.fire({
      icon: 'warning',
      title: 'Remove student?',
      text: 'This action cannot be undone.',
      showCancelButton: true,
      confirmButtonText: 'Remove',
      confirmButtonColor: '#ef4444',
    });
    if (!res.isConfirmed) return;

    this.studentService.remove(uid).subscribe({
      next: () => {
        this.toast('success', 'Student removed');
        void this.loadAll();
      },
      error: (e: unknown) => {
        this.toast('error', (e as { message?: string })?.message ?? 'Failed to remove student');
      },
    });
  }
}