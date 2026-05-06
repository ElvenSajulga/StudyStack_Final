import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { StudentAccount, StudentAccountService } from '../../services/student-account.service';
import { AcademicService, Program, Section } from '../../services/academic.service';
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
  programs: Program[] = [];
  sections: Section[] = [];

  addForm: Partial<StudentAccount> & { programId?: string; sectionId?: string } = this.emptyAddForm();

  showEditModal = false;
  editForm: Partial<StudentAccount> & { programId?: string; sectionId?: string } = {};
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
      program: '',
      programId: '',
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
      toast: true, position: 'top-end', icon, title,
      showConfirmButton: false, timer: 2000, timerProgressBar: true,
    });
  }

  private async loadAll(): Promise<void> {
    this.loading = true;
    await this.studentService.reloadFromServer();
    this.students = this.studentService.getAll();
    [this.programs, this.sections] = await Promise.all([
      this.academic.getPrograms(),
      this.academic.getSections(),
    ]);
    this.loading = false;
    this.cdr.detectChanges();
  }

  get totalStudents(): number {
    return this.studentService.getCount();
  }

  sectionsForProgram(programId: string): Section[] {
    return this.sections.filter(s => s.programId === programId);
  }

  programNameById(programId: string): string {
    return this.programs.find(p => p.id === programId)?.name ?? '';
  }

  sectionNameById(sectionId: string): string {
    return this.sections.find(s => s.id === sectionId)?.name ?? '';
  }

  onAddProgramChange(): void {
    this.addForm.sectionId = '';
    this.addForm.program = this.programNameById(this.addForm.programId ?? '');
  }

  onEditProgramChange(): void {
    this.editForm.sectionId = '';
    this.editForm.program = this.programNameById(this.editForm.programId ?? '');
  }

  addStudent(): void {
    const f = this.addForm;
    if (!f.UID || !f.password || !f.studentID || !f.lastname || !f.firstname) {
      this.toast('error', 'Please fill in UID, Password, Student ID, Lastname, and Firstname.');
      return;
    }

    f.name = `${f.firstname} ${f.lastname}`.trim();
    f.program = this.programNameById(f.programId ?? '');

    try {
      this.studentService.add(f as StudentAccount).subscribe({
        next: () => {
          this.addForm = this.emptyAddForm();
          this.toast('success', 'Student added');
          void this.loadAll();
        },
        error: () => {
          this.toast('error', 'Failed to add student');
        },
      });
    } catch {
      this.toast('error', 'Failed to add student');
    }
  }

  openEdit(s: StudentAccount): void {
    this.editingUID = s.UID;
    const matchedProgram = this.programs.find(p => p.name === s.program);
    this.editForm = {
      UID: s.UID,
      studentID: s.studentID,
      firstname: s.firstname,
      lastname: s.lastname,
      middlename: s.middlename,
      email: s.email,
      program: s.program,
      programId: matchedProgram?.id ?? '',
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
      this.toast('error', 'Firstname, Lastname, and Student ID are required.');
      return;
    }

    const changes: Partial<StudentAccount> = {
      firstname: f.firstname,
      lastname: f.lastname,
      middlename: f.middlename ?? '',
      name: `${f.firstname} ${f.lastname}`.trim(),
      studentID: f.studentID ?? '',
      email: f.email ?? '',
      program: this.programNameById(f.programId ?? '') || f.program || '',
      status: f.status ?? 'active',
      password: f.password ?? '',
    };

    this.studentService.update(this.editingUID, changes);
    this.toast('success', 'Student updated');
    this.closeEdit();
    void this.loadAll();
  }

  removeStudent(uid: string): void {
    void Swal.fire({
      icon: 'warning',
      title: 'Remove student?',
      showCancelButton: true,
      confirmButtonText: 'Remove',
      confirmButtonColor: '#ef4444',
    }).then(res => {
      if (!res.isConfirmed) return;
      this.studentService.remove(uid).subscribe({
        next: () => {
          this.toast('success', 'Student removed');
          void this.loadAll();
        },
        error: () => this.toast('error', 'Failed to remove student'),
      });
    });
  }
}