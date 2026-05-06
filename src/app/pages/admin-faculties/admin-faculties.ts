import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  AcademicService,
  Program,
  Faculty,
  FacultyTeacher,
} from '../../services/academic.service';
import { TeacherAccount, TeacherAccountService } from '../../services/teacher-account.service';
import Swal from 'sweetalert2';

interface FacultyRow {
  faculty: Faculty;
  assignments: FacultyTeacher[];
}

@Component({
  selector: 'app-admin-faculties',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-faculties.html',
  styleUrl: './admin-faculties.scss',
})
export class AdminFaculties implements OnInit {
  programs: Program[] = [];
  faculties: Faculty[] = [];
  facultyTeachers: FacultyTeacher[] = [];
  teachers: TeacherAccount[] = [];

  expandedProgramId: string | null = null;

  // program form
  newProgramName = '';
  editingProgramId: string | null = null;
  editingProgramName = '';

  // faculty form (one per program)
  newFacultyName: Record<string, string> = {};
  editingFacultyId: string | null = null;
  editingFacultyName = '';

  // teacher assignment
  addingTeacherFacultyId: string | null = null;
  selectedTeacherUID: Record<string, string> = {};

  loading = false;

  constructor(
    private readonly academic: AcademicService,
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
    await this.teacherService.reloadFromServer();
    this.teachers = this.teacherService.getAll();
    [this.programs, this.faculties, this.facultyTeachers] = await Promise.all([
      this.academic.getPrograms(),
      this.academic.getFaculties(),
      this.academic.getCourseSections().then(() => []).catch(() => []),
    ]);

    // reload faculty teachers separately
    const allFT: FacultyTeacher[] = [];
    for (const f of this.faculties) {
      const ft = await this.academic.getFacultyTeachers(f.id);
      allFT.push(...ft);
    }
    this.facultyTeachers = allFT;

    this.loading = false;
    this.cdr.detectChanges();
  }

  // ── helpers ──────────────────────────────────────────────────────────────────

  toggleProgram(id: string): void {
    this.expandedProgramId = this.expandedProgramId === id ? null : id;
  }

  facultyForProgram(programId: string): Faculty | null {
    return this.faculties.find(f => f.programId === programId) ?? null;
  }

  teachersInFaculty(facultyId: string): FacultyTeacher[] {
    return this.facultyTeachers.filter(ft => ft.facultyId === facultyId);
  }

  teacherName(uid: string): string {
    const t = this.teachers.find(t => t.UID === uid);
    return t ? `${t.firstname} ${t.lastname}`.trim() : uid;
  }

  unassignedTeachers(facultyId: string): TeacherAccount[] {
    const assigned = this.teachersInFaculty(facultyId).map(ft => ft.teacherUID);
    return this.teachers.filter(t => !assigned.includes(t.UID));
  }

  // ── programs ─────────────────────────────────────────────────────────────────

  async addProgram(): Promise<void> {
    const name = this.newProgramName.trim();
    if (!name) return;
    try {
      await this.academic.addProgram(name);
      this.newProgramName = '';
      await this.loadAll();
      this.toast('success', 'Program added');
    } catch { this.toast('error', 'Failed to add program'); }
  }

  startEditProgram(p: Program): void {
    this.editingProgramId = p.id;
    this.editingProgramName = p.name;
  }

  async saveEditProgram(id: string): Promise<void> {
    const name = this.editingProgramName.trim();
    if (!name) return;
    try {
      await this.academic.updateProgram(id, name);
      this.editingProgramId = null;
      await this.loadAll();
      this.toast('success', 'Program updated');
    } catch { this.toast('error', 'Failed to update program'); }
  }

  cancelEditProgram(): void { this.editingProgramId = null; }

  async deleteProgram(p: Program): Promise<void> {
    const res = await Swal.fire({
      icon: 'warning',
      title: `Delete ${p.name}?`,
      text: 'This will also delete its faculty, sections, courses, and enrollments.',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: '#ef4444',
    });
    if (!res.isConfirmed) return;
    try {
      await this.academic.deleteProgram(p.id);
      if (this.expandedProgramId === p.id) this.expandedProgramId = null;
      await this.loadAll();
      this.toast('success', 'Program deleted');
    } catch { this.toast('error', 'Failed to delete program'); }
  }

  // ── faculty ──────────────────────────────────────────────────────────────────

  async addFaculty(programId: string): Promise<void> {
    const name = (this.newFacultyName[programId] ?? '').trim();
    if (!name) return;
    try {
      await this.academic.addFaculty(name, programId);
      this.newFacultyName[programId] = '';
      await this.loadAll();
      this.toast('success', 'Faculty created');
    } catch { this.toast('error', 'Failed to create faculty'); }
  }

  startEditFaculty(f: Faculty): void {
    this.editingFacultyId = f.id;
    this.editingFacultyName = f.name;
  }

  async saveEditFaculty(id: string): Promise<void> {
    const name = this.editingFacultyName.trim();
    if (!name) return;
    try {
      await this.academic.updateFaculty(id, name);
      this.editingFacultyId = null;
      await this.loadAll();
      this.toast('success', 'Faculty updated');
    } catch { this.toast('error', 'Failed to update faculty'); }
  }

  cancelEditFaculty(): void { this.editingFacultyId = null; }

  async deleteFaculty(f: Faculty): Promise<void> {
    const res = await Swal.fire({
      icon: 'warning',
      title: `Delete ${f.name}?`,
      text: 'All teacher assignments to this faculty will be removed.',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: '#ef4444',
    });
    if (!res.isConfirmed) return;
    try {
      await this.academic.deleteFaculty(f.id);
      await this.loadAll();
      this.toast('success', 'Faculty deleted');
    } catch { this.toast('error', 'Failed to delete faculty'); }
  }

  // ── teacher assignments ───────────────────────────────────────────────────────

  toggleAddTeacher(facultyId: string): void {
    this.addingTeacherFacultyId =
      this.addingTeacherFacultyId === facultyId ? null : facultyId;
    this.selectedTeacherUID[facultyId] = '';
  }

  async assignTeacher(facultyId: string): Promise<void> {
    const uid = this.selectedTeacherUID[facultyId];
    if (!uid) return;
    try {
      await this.academic.assignTeacherToFaculty(facultyId, uid);
      this.selectedTeacherUID[facultyId] = '';
      this.addingTeacherFacultyId = null;
      await this.loadAll();
      this.toast('success', 'Teacher assigned');
    } catch { this.toast('error', 'Failed to assign teacher'); }
  }

  async removeTeacher(assignmentId: string, teacherName: string): Promise<void> {
    const res = await Swal.fire({
      icon: 'warning',
      title: `Remove ${teacherName} from faculty?`,
      showCancelButton: true,
      confirmButtonText: 'Remove',
      confirmButtonColor: '#ef4444',
    });
    if (!res.isConfirmed) return;
    try {
      await this.academic.removeTeacherFromFaculty(assignmentId);
      await this.loadAll();
      this.toast('success', 'Teacher removed from faculty');
    } catch { this.toast('error', 'Failed to remove teacher'); }
  }
}