import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  AcademicService,
  Faculty,
  Course,
  Section,
} from '../../services/academic.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-admin-faculties',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-faculties.html',
  styleUrl: './admin-faculties.scss',
})
export class AdminFaculties implements OnInit {
  faculties: Faculty[] = [];
  courses: Course[] = [];
  sections: Section[] = [];

  expandedFacultyId: string | null = null;
  expandedCourseId: string | null = null;

  editingFacultyId: string | null = null;
  editingFacultyName = '';
  editingCourseId: string | null = null;
  editingCourseName = '';
  editingSectionId: string | null = null;
  editingSectionName = '';

  newFacultyName = '';
  newCourseName: Record<string, string> = {};
  newSectionName: Record<string, string> = {};

  loading = false;

  constructor(
    private readonly academic: AcademicService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    void this.loadAll();
  }

  private async loadAll(): Promise<void> {
    this.loading = true;
    [this.faculties, this.courses, this.sections] = await Promise.all([
      this.academic.getFaculties(),
      this.academic.getCourses(),
      this.academic.getSections(),
    ]);
    this.loading = false;
    this.cdr.detectChanges();
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

  coursesFor(facultyId: string): Course[] {
    return this.courses.filter(c => c.facultyId === facultyId);
  }

  sectionsFor(courseId: string): Section[] {
    return this.sections.filter(s => s.courseId === courseId);
  }

  toggleFaculty(id: string): void {
    this.expandedFacultyId = this.expandedFacultyId === id ? null : id;
    this.expandedCourseId = null;
  }

  toggleCourse(id: string): void {
    this.expandedCourseId = this.expandedCourseId === id ? null : id;
  }

  // ── Faculty ───────────────────────────────────────────────────────────────

  async addFaculty(): Promise<void> {
    const name = this.newFacultyName.trim();
    if (!name) return;
    try {
      await this.academic.addFaculty(name);
      this.newFacultyName = '';
      await this.loadAll();
      this.toast('success', 'Faculty added');
    } catch {
      this.toast('error', 'Failed to add faculty');
    }
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
    } catch {
      this.toast('error', 'Failed to update faculty');
    }
  }

  cancelEditFaculty(): void {
    this.editingFacultyId = null;
  }

  async deleteFaculty(id: string): Promise<void> {
    const courseCount = this.coursesFor(id).length;
    const msg = courseCount
      ? `This faculty has ${courseCount} course(s). Deleting it will also remove all its courses and sections. Continue?`
      : 'Delete this faculty?';
    const res = await Swal.fire({
      icon: 'warning',
      title: 'Are you sure?',
      text: msg,
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: '#ef4444',
    });
    if (!res.isConfirmed) return;
    try {
      await this.academic.deleteFaculty(id);
      if (this.expandedFacultyId === id) this.expandedFacultyId = null;
      await this.loadAll();
      this.toast('success', 'Faculty deleted');
    } catch {
      this.toast('error', 'Failed to delete faculty');
    }
  }

  // ── Course ────────────────────────────────────────────────────────────────

  async addCourse(facultyId: string): Promise<void> {
    const name = (this.newCourseName[facultyId] ?? '').trim();
    if (!name) return;
    try {
      await this.academic.addCourse(name, facultyId);
      this.newCourseName[facultyId] = '';
      await this.loadAll();
      this.toast('success', 'Course added');
    } catch {
      this.toast('error', 'Failed to add course');
    }
  }

  startEditCourse(c: Course): void {
    this.editingCourseId = c.id;
    this.editingCourseName = c.name;
  }

  async saveEditCourse(id: string): Promise<void> {
    const name = this.editingCourseName.trim();
    if (!name) return;
    try {
      await this.academic.updateCourse(id, { name });
      this.editingCourseId = null;
      await this.loadAll();
      this.toast('success', 'Course updated');
    } catch {
      this.toast('error', 'Failed to update course');
    }
  }

  cancelEditCourse(): void {
    this.editingCourseId = null;
  }

  async deleteCourse(id: string): Promise<void> {
    const secCount = this.sectionsFor(id).length;
    const msg = secCount
      ? `This course has ${secCount} section(s). Deleting it will also remove all sections. Continue?`
      : 'Delete this course?';
    const res = await Swal.fire({
      icon: 'warning',
      title: 'Are you sure?',
      text: msg,
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: '#ef4444',
    });
    if (!res.isConfirmed) return;
    try {
      await this.academic.deleteCourse(id);
      if (this.expandedCourseId === id) this.expandedCourseId = null;
      await this.loadAll();
      this.toast('success', 'Course deleted');
    } catch {
      this.toast('error', 'Failed to delete course');
    }
  }

  // ── Section ───────────────────────────────────────────────────────────────

  async addSection(courseId: string): Promise<void> {
    const name = (this.newSectionName[courseId] ?? '').trim();
    if (!name) return;
    try {
      await this.academic.addSection(name, courseId);
      this.newSectionName[courseId] = '';
      await this.loadAll();
      this.toast('success', 'Section added');
    } catch {
      this.toast('error', 'Failed to add section');
    }
  }

  startEditSection(s: Section): void {
    this.editingSectionId = s.id;
    this.editingSectionName = s.name;
  }

  async saveEditSection(id: string): Promise<void> {
    const name = this.editingSectionName.trim();
    if (!name) return;
    try {
      await this.academic.updateSection(id, { name });
      this.editingSectionId = null;
      await this.loadAll();
      this.toast('success', 'Section updated');
    } catch {
      this.toast('error', 'Failed to update section');
    }
  }

  cancelEditSection(): void {
    this.editingSectionId = null;
  }

  async deleteSection(id: string): Promise<void> {
    const res = await Swal.fire({
      icon: 'warning',
      title: 'Delete section?',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: '#ef4444',
    });
    if (!res.isConfirmed) return;
    try {
      await this.academic.deleteSection(id);
      await this.loadAll();
      this.toast('success', 'Section deleted');
    } catch {
      this.toast('error', 'Failed to delete section');
    }
  }
}