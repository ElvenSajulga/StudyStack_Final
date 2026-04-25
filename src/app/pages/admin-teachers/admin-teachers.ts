import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TeacherAccount, TeacherAccountService } from '../../services/teacher-account.service';
import { AcademicService, Faculty } from '../../services/academic.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-admin-teachers',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-teachers.html',
  styleUrl: './admin-teachers.scss',
})
export class AdminTeachers implements OnInit {
  teachers: TeacherAccount[] = [];
  faculties: Faculty[] = [];

  addForm: Partial<TeacherAccount> & { facultyId?: string } = this.emptyAddForm();

  showEditModal = false;
  editingUID = '';
  editForm: Partial<TeacherAccount> & { facultyId?: string } = {};

  loading = false;

  constructor(
    private readonly teacherService: TeacherAccountService,
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
      teacherID: '',
      password: '',
      email: '',
      status: 'active' as const,
      lastname: '',
      firstname: '',
      middlename: '',
      facultyId: '',
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
    await this.teacherService.reloadFromServer();
    this.teachers = this.teacherService.getAll();
    this.faculties = await this.academic.getFaculties();
    this.loading = false;
    this.cdr.detectChanges();
  }

  get totalTeachers(): number {
    return this.teacherService.getCount();
  }

  facultyName(facultyId?: string): string {
    if (!facultyId) return '—';
    return this.faculties.find(f => f.id === facultyId)?.name ?? '—';
  }

  // ── add ───────────────────────────────────────────────────────────────────

  addTeacher(): void {
    const f = this.addForm;
    if (!f.UID || !f.password || !f.teacherID || !f.lastname || !f.firstname) {
      this.toast('error', 'Please fill in UID, Password, Teacher ID, Lastname, and Firstname');
      return;
    }

    f.name = `${f.firstname} ${f.lastname}`.trim();

    try {
      this.teacherService.add(f as TeacherAccount).subscribe({
        next: () => {
          this.addForm = this.emptyAddForm();
          this.toast('success', 'Teacher added successfully');
          void this.loadAll();
        },
        error: (e: unknown) => {
          this.toast('error', (e as { message?: string })?.message ?? 'Failed to add teacher');
        },
      });
    } catch (e: unknown) {
      this.toast('error', (e as { message?: string })?.message ?? 'Failed to add teacher');
    }
  }

  // ── edit ──────────────────────────────────────────────────────────────────

  openEdit(t: TeacherAccount): void {
    this.editingUID = t.UID;
    this.editForm = {
      UID: t.UID,
      teacherID: t.teacherID,
      firstname: t.firstname,
      lastname: t.lastname,
      middlename: t.middlename,
      email: t.email,
      status: t.status,
      password: t.password,
      facultyId: t.facultyId ?? '',
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
    if (!f.firstname || !f.lastname || !f.teacherID) {
      this.toast('error', 'Firstname, Lastname, and Teacher ID are required');
      return;
    }

    const changes: Partial<TeacherAccount> & { facultyId?: string } = {
      firstname: f.firstname,
      lastname: f.lastname,
      middlename: f.middlename ?? '',
      name: `${f.firstname} ${f.lastname}`.trim(),
      teacherID: f.teacherID ?? '',
      email: f.email ?? '',
      status: f.status ?? 'active',
      password: f.password ?? '',
      facultyId: f.facultyId ?? '',
    };

    try {
      this.teacherService.update(this.editingUID, changes);
      this.toast('success', 'Teacher updated successfully');
      this.closeEdit();
      void this.loadAll();
    } catch {
      this.toast('error', 'Failed to update teacher');
    }
  }

  // ── remove ────────────────────────────────────────────────────────────────

  async removeTeacher(uid: string): Promise<void> {
    const res = await Swal.fire({
      icon: 'warning',
      title: 'Remove teacher?',
      text: 'This action cannot be undone.',
      showCancelButton: true,
      confirmButtonText: 'Remove',
      confirmButtonColor: '#ef4444',
    });
    if (!res.isConfirmed) return;

    this.teacherService.remove(uid).subscribe({
      next: () => {
        this.toast('success', 'Teacher removed');
        void this.loadAll();
      },
      error: (e: unknown) => {
        this.toast('error', (e as { message?: string })?.message ?? 'Failed to remove teacher');
      },
    });
  }
}