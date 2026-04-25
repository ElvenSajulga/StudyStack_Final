import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AcademicService, Faculty, Subject } from '../../services/academic.service';
import { TeacherAccount, TeacherAccountService } from '../../services/teacher-account.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-admin-subjects',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-subjects.html',
  styleUrl: './admin-subjects.scss',
})
export class AdminSubjects implements OnInit {
  subjects: Subject[] = [];
  faculties: Faculty[] = [];
  teachers: TeacherAccount[] = [];

  filterFacultyId = '';

  showForm = false;
  editingId: string | null = null;

  form: {
    name: string;
    units: number | null;
    schedule: string;
    semester: string;
    facultyId: string;
    teacherUID: string;
  } = this.emptyForm();

  loading = false;

  constructor(
    private readonly academic: AcademicService,
    private readonly teacherService: TeacherAccountService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    void this.loadAll();
  }

  private emptyForm() {
    return {
      name: '',
      units: null as number | null,
      schedule: '',
      semester: '',
      facultyId: '',
      teacherUID: '',
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
    [this.subjects, this.faculties] = await Promise.all([
      this.academic.getSubjects(),
      this.academic.getFaculties(),
    ]);
    this.teachers = this.teacherService.getAll();
    this.loading = false;
    this.cdr.detectChanges();
  }

  get filteredSubjects(): Subject[] {
    if (!this.filterFacultyId) return this.subjects;
    return this.subjects.filter(s => s.facultyId === this.filterFacultyId);
  }

  facultyName(id: string): string {
    return this.faculties.find(f => f.id === id)?.name ?? '—';
  }

  teacherName(uid: string): string {
    const t = this.teachers.find(t => t.UID === uid);
    if (!t) return '—';
    return `${t.firstname} ${t.lastname}`.trim();
  }

  get availableTeachers(): TeacherAccount[] {
    return this.teachers;
  }

  openAddForm(): void {
    this.editingId = null;
    this.form = this.emptyForm();
    this.showForm = true;
  }

  openEditForm(s: Subject): void {
    this.editingId = s.id;
    this.form = {
      name: s.name,
      units: s.units,
      schedule: s.schedule,
      semester: s.semester,
      facultyId: s.facultyId,
      teacherUID: s.teacherUID,
    };
    this.showForm = true;
  }

  cancelForm(): void {
    this.showForm = false;
    this.editingId = null;
    this.form = this.emptyForm();
  }

  async saveSubject(): Promise<void> {
    const { name, units, schedule, semester, facultyId, teacherUID } = this.form;
    if (!name.trim() || !units || !schedule.trim() || !semester.trim() || !facultyId || !teacherUID) {
      this.toast('error', 'Please fill in all fields');
      return;
    }

    const teacher = this.teachers.find(t => t.UID === teacherUID);
    const teacherName = teacher
      ? `${teacher.firstname} ${teacher.lastname}`.trim()
      : '';

    const payload = {
      name: name.trim(),
      units: Number(units),
      schedule: schedule.trim(),
      semester: semester.trim(),
      facultyId,
      teacherUID,
      teacherName,
    };

    try {
      if (this.editingId) {
        await this.academic.updateSubject(this.editingId, payload);
        this.toast('success', 'Subject updated');
      } else {
        await this.academic.addSubject(payload);
        this.toast('success', 'Subject created');
      }
      this.cancelForm();
      await this.loadAll();
    } catch {
      this.toast('error', 'Failed to save subject');
    }
  }

  async deleteSubject(id: string): Promise<void> {
    const res = await Swal.fire({
      icon: 'warning',
      title: 'Delete subject?',
      text: 'All enrollments for this subject will also be removed.',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: '#ef4444',
    });
    if (!res.isConfirmed) return;
    try {
      await this.academic.deleteSubject(id);
      await this.loadAll();
      this.toast('success', 'Subject deleted');
    } catch {
      this.toast('error', 'Failed to delete subject');
    }
  }
}