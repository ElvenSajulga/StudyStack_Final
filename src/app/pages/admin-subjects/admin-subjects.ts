import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AcademicService, Course, Program } from '../../services/academic.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-admin-subjects',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-subjects.html',
  styleUrl: './admin-subjects.scss',
})
export class AdminSubjects implements OnInit {
  courses: Course[] = [];
  programs: Program[] = [];

  filterProgramId = '';
  showForm = false;
  editingId: string | null = null;

  form: {
    name: string;
    units: number | null;
    schedule: string;
    semester: string;
    programId: string;
  } = this.emptyForm();

  loading = false;

  constructor(
    private readonly academic: AcademicService,
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
      programId: '',
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
    [this.courses, this.programs] = await Promise.all([
      this.academic.getCourses(),
      this.academic.getPrograms(),
    ]);
    this.loading = false;
    this.cdr.detectChanges();
  }

  get filteredCourses(): Course[] {
    if (!this.filterProgramId) return this.courses;
    return this.courses.filter(c => c.programId === this.filterProgramId);
  }

  programName(id: string): string {
    return this.programs.find(p => p.id === id)?.name ?? '—';
  }

  openAddForm(): void {
    this.editingId = null;
    this.form = this.emptyForm();
    this.showForm = true;
  }

  openEditForm(c: Course): void {
    this.editingId = c.id;
    this.form = {
      name: c.name,
      units: c.units,
      schedule: c.schedule,
      semester: c.semester,
      programId: c.programId,
    };
    this.showForm = true;
  }

  cancelForm(): void {
    this.showForm = false;
    this.editingId = null;
    this.form = this.emptyForm();
  }

  async saveCourse(): Promise<void> {
    const { name, units, schedule, semester, programId } = this.form;
    if (!name.trim() || !units || !semester.trim() || !programId) {
      this.toast('error', 'Please fill in all required fields');
      return;
    }

    const payload: Omit<Course, 'id'> = {
      name: name.trim(),
      units: Number(units),
      schedule: schedule.trim(),
      semester: semester.trim(),
      programId,
    };

    try {
      if (this.editingId) {
        await this.academic.updateCourse(this.editingId, payload);
        this.toast('success', 'Course updated');
      } else {
        await this.academic.addCourse(payload);
        this.toast('success', 'Course created');
      }
      this.cancelForm();
      await this.loadAll();
    } catch {
      this.toast('error', 'Failed to save course');
    }
  }

  async deleteCourse(id: string): Promise<void> {
    const res = await Swal.fire({
      icon: 'warning',
      title: 'Delete course?',
      text: 'All section assignments and enrollments will also be removed.',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: '#ef4444',
    });
    if (!res.isConfirmed) return;
    try {
      await this.academic.deleteCourse(id);
      await this.loadAll();
      this.toast('success', 'Course deleted');
    } catch {
      this.toast('error', 'Failed to delete course');
    }
  }
}