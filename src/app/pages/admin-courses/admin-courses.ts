import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  AcademicService,
  Program,
  Course,
  Section,
  CourseSection,
  YearLevel,
} from '../../services/academic.service';
import { TeacherAccount, TeacherAccountService } from '../../services/teacher-account.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-admin-courses',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-courses.html',
  styleUrl: './admin-courses.scss',
})
export class AdminCourses implements OnInit {
  programs: Program[] = [];
  courses: Course[] = [];
  sections: Section[] = [];
  yearLevels: YearLevel[] = [];
  courseSections: CourseSection[] = [];
  teachers: TeacherAccount[] = [];

  expandedCourseId: string | null = null;

  // course form
  showCourseForm = false;
  editingCourseId: string | null = null;
  courseForm: Omit<Course, 'id'> = this.emptyCourseForm();

  // section-teacher assignment form
  assignForm: Record<string, { sectionId: string; teacherUID: string }> = {};

  loading = false;
  filterProgramId = '';

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

  private emptyCourseForm(): Omit<Course, 'id'> {
    return {
      name: '',
      units: 3,
      schedule: '',
      semester: '',
      programId: '',
    };
  }

  private async loadAll(): Promise<void> {
    this.loading = true;
    await this.teacherService.reloadFromServer();
    this.teachers = this.teacherService.getAll();

    [this.programs, this.courses, this.sections, this.courseSections] =
      await Promise.all([
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

    this.loading = false;
    this.cdr.detectChanges();
  }

  // ── helpers ───────────────────────────────────────────────────────────────────

  get filteredCourses(): Course[] {
    if (!this.filterProgramId) return this.courses;
    return this.courses.filter(c => c.programId === this.filterProgramId);
  }

  programName(id: string): string {
    return this.programs.find(p => p.id === id)?.name ?? '—';
  }

  teacherName(uid: string): string {
    const t = this.teachers.find(t => t.UID === uid);
    return t ? `${t.firstname} ${t.lastname}`.trim() : uid;
  }

  sectionName(id: string): string {
    return this.sections.find(s => s.id === id)?.name ?? '—';
  }

  yearLevelName(yearLevelId: string): string {
    return this.yearLevels.find(yl => yl.id === yearLevelId)?.name ?? '—';
  }

  sectionsForProgram(programId: string): Section[] {
    return this.sections.filter(s => s.programId === programId);
  }

  teachersForProgram(programId: string): TeacherAccount[] {
    return this.teachers;
  }

  assignmentsForCourse(courseId: string): CourseSection[] {
    return this.courseSections.filter(cs => cs.courseId === courseId);
  }

  unassignedSections(courseId: string, programId: string): Section[] {
    const assigned = this.assignmentsForCourse(courseId).map(cs => cs.sectionId);
    return this.sectionsForProgram(programId).filter(
      s => !assigned.includes(s.id),
    );
  }

  toggleCourse(id: string): void {
    this.expandedCourseId = this.expandedCourseId === id ? null : id;
    if (!this.assignForm[id]) {
      this.assignForm[id] = { sectionId: '', teacherUID: '' };
    }
  }

  // ── course CRUD ───────────────────────────────────────────────────────────────

  openAddCourse(): void {
    this.editingCourseId = null;
    this.courseForm = this.emptyCourseForm();
    this.showCourseForm = true;
  }

  openEditCourse(c: Course): void {
    this.editingCourseId = c.id;
    this.courseForm = {
      name: c.name,
      units: c.units,
      schedule: c.schedule,
      semester: c.semester,
      programId: c.programId,
    };
    this.showCourseForm = true;
  }

  cancelCourseForm(): void {
    this.showCourseForm = false;
    this.editingCourseId = null;
    this.courseForm = this.emptyCourseForm();
  }

  async saveCourse(): Promise<void> {
    const { name, units, schedule, semester, programId } = this.courseForm;
    if (!name.trim() || !units || !semester.trim() || !programId) {
      this.toast('error', 'Please fill in all required fields');
      return;
    }
    try {
      if (this.editingCourseId) {
        await this.academic.updateCourse(this.editingCourseId, {
          name: name.trim(), units: Number(units),
          schedule: schedule.trim(), semester: semester.trim(), programId,
        });
        this.toast('success', 'Course updated');
      } else {
        await this.academic.addCourse({
          name: name.trim(), units: Number(units),
          schedule: schedule.trim(), semester: semester.trim(), programId,
        });
        this.toast('success', 'Course created');
      }
      this.cancelCourseForm();
      await this.loadAll();
    } catch { this.toast('error', 'Failed to save course'); }
  }

  async deleteCourse(c: Course): Promise<void> {
    const res = await Swal.fire({
      icon: 'warning',
      title: `Delete ${c.name}?`,
      text: 'All section assignments and enrollments for this course will be removed.',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: '#ef4444',
    });
    if (!res.isConfirmed) return;
    try {
      await this.academic.deleteCourse(c.id);
      if (this.expandedCourseId === c.id) this.expandedCourseId = null;
      await this.loadAll();
      this.toast('success', 'Course deleted');
    } catch { this.toast('error', 'Failed to delete course'); }
  }

  // ── section-teacher assignments ───────────────────────────────────────────────

  async assignSection(courseId: string, programId: string): Promise<void> {
    const form = this.assignForm[courseId];
    if (!form?.sectionId || !form?.teacherUID) {
      this.toast('error', 'Please select both a section and a teacher');
      return;
    }
    try {
      await this.academic.assignSectionToTeacher(
        courseId, form.sectionId, form.teacherUID,
      );
      this.assignForm[courseId] = { sectionId: '', teacherUID: '' };
      await this.loadAll();
      this.toast('success', 'Section assigned');
    } catch { this.toast('error', 'Failed to assign section'); }
  }

  async removeAssignment(cs: CourseSection): Promise<void> {
    const res = await Swal.fire({
      icon: 'warning',
      title: 'Remove assignment?',
      text: `Remove ${this.sectionName(cs.sectionId)} from ${this.teacherName(cs.teacherUID)}?`,
      showCancelButton: true,
      confirmButtonText: 'Remove',
      confirmButtonColor: '#ef4444',
    });
    if (!res.isConfirmed) return;
    try {
      await this.academic.removeCourseSection(cs.id);
      await this.loadAll();
      this.toast('success', 'Assignment removed');
    } catch { this.toast('error', 'Failed to remove assignment'); }
  }
}