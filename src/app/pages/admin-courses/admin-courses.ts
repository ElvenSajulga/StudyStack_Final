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
import {
  DAY_CODES, DayCode, Meeting, ScheduleConflictService,
} from '../../services/schedule-conflict.service';
import { TeacherAccount, TeacherAccountService } from '../../services/teacher-account.service';
import { ToastService } from '../../services/toast.service';

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
  readonly dayOptions: readonly DayCode[] = DAY_CODES;
  readonly dayLabels: Record<DayCode, string> = {
    mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu',
    fri: 'Fri', sat: 'Sat', sun: 'Sun',
  };

  // section-teacher assignment form
  assignForm: Record<string, { sectionId: string; teacherUID: string }> = {};

  loading = false;
  filterProgramId = '';

  constructor(
    private readonly academic: AcademicService,
    private readonly teacherService: TeacherAccountService,
    private readonly scheduleConflict: ScheduleConflictService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    void this.loadAll();
  }

  private emptyCourseForm(): Omit<Course, 'id'> {
    return {
      name: '',
      units: 3,
      schedule: '',
      meetings: [],
      semester: '',
      programId: '',
    };
  }

  // ── meetings editor ──────────────────────────────────────────────────────

  addMeeting(): void {
    if (!this.courseForm.meetings) this.courseForm.meetings = [];
    this.courseForm.meetings.push({ day: 'mon', startTime: '08:00', endTime: '09:00' });
  }

  removeMeeting(index: number): void {
    if (!this.courseForm.meetings) return;
    this.courseForm.meetings.splice(index, 1);
  }

  trackMeeting(index: number): number {
    return index;
  }

  /** Filled in from `schedule` text when the form opens; updates `schedule` back when meetings change. */
  private regenerateScheduleString(): void {
    const formatted = this.scheduleConflict.formatMeetings(this.courseForm.meetings);
    // Only overwrite if the existing string is auto-formatted or empty;
    // preserves any custom human prose an admin typed manually.
    if (!this.courseForm.schedule.trim() || this.looksAutoFormatted(this.courseForm.schedule)) {
      this.courseForm.schedule = formatted;
    }
  }

  private looksAutoFormatted(s: string): boolean {
    // Auto-formatted strings look like "Mon 08:00–09:00 · Wed 08:00–09:00"
    return /·|^[A-Z][a-z]{2}\s+\d{2}:\d{2}/.test(s);
  }

  onMeetingChange(): void {
    this.regenerateScheduleString();
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

  get groupedCourses(): Array<{ program: Program; courses: Course[] }> {
    const filtered = this.filteredCourses;
    return this.programs
      .map(program => ({
        program,
        courses: filtered
          .filter(c => c.programId === program.id)
          .sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .filter(group => group.courses.length > 0);
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

  /**
   * Existing courses that share (name, programId, semester) with what the
   * admin is currently entering — i.e. the set the conflict check will scan.
   * Shown inline so the admin can plan meetings around them before submitting.
   */
  get siblingCourses(): Array<{ course: Course; meetingsLabel: string }> {
    const name = this.courseForm.name.trim().toLowerCase();
    const { programId, semester } = this.courseForm;
    if (!name || !programId || !semester) return [];
    return this.courses
      .filter(c =>
        c.id !== this.editingCourseId &&
        c.programId === programId &&
        c.semester === semester &&
        c.name.trim().toLowerCase() === name,
      )
      .map(course => {
        const meetings = course.meetings && course.meetings.length > 0
          ? course.meetings
          : this.scheduleConflict.parseScheduleString(course.schedule);
        return {
          course,
          meetingsLabel: this.scheduleConflict.formatMeetings(meetings) || '(no schedule)',
        };
      });
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
    const meetings = (c.meetings && c.meetings.length > 0)
      ? c.meetings.map(m => ({ ...m }))
      : this.scheduleConflict.parseScheduleString(c.schedule);
    this.courseForm = {
      name: c.name,
      units: c.units,
      schedule: c.schedule,
      meetings,
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
    const { name, units, schedule, semester, programId, meetings } = this.courseForm;
    if (!name.trim() || !units || !semester.trim() || !programId) {
      this.toast.warning('Fill in all required fields');
      return;
    }

    // Validate each meeting row: end must be after start.
    const cleanMeetings: Meeting[] = [];
    for (const m of (meetings ?? [])) {
      if (!m.startTime || !m.endTime) {
        this.toast.warning('Each meeting needs a start and end time');
        return;
      }
      if (m.endTime <= m.startTime) {
        this.toast.warning('Meeting end time must be after its start time');
        return;
      }
      cleanMeetings.push({ day: m.day, startTime: m.startTime, endTime: m.endTime });
    }

    const payload = {
      name: name.trim(),
      units: Number(units),
      schedule: schedule.trim(),
      meetings: cleanMeetings,
      semester: semester.trim(),
      programId,
    };

    try {
      if (this.editingCourseId) {
        await this.academic.updateCourse(this.editingCourseId, payload);
        this.toast.success('Course updated');
      } else {
        await this.academic.addCourse(payload);
        this.toast.success('Course created');
      }
      this.cancelCourseForm();
      await this.loadAll();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to save course';
      this.toast.error('Failed to save course', { text: message });
    }
  }

  async deleteCourse(c: Course): Promise<void> {
    const ok = await this.toast.confirmDestructive(`Delete ${c.name}?`, {
      text: 'All section assignments and enrollments for this course will be removed.',
    });
    if (!ok) return;
    try {
      await this.academic.deleteCourse(c.id);
      if (this.expandedCourseId === c.id) this.expandedCourseId = null;
      await this.loadAll();
      this.toast.success('Course deleted');
    } catch { this.toast.error('Failed to delete course'); }
  }

  // ── section-teacher assignments ───────────────────────────────────────────────

  async assignSection(courseId: string, programId: string): Promise<void> {
    const form = this.assignForm[courseId];
    if (!form?.sectionId || !form?.teacherUID) {
      this.toast.warning('Select both a section and a teacher');
      return;
    }
    try {
      await this.academic.assignSectionToTeacher(
        courseId, form.sectionId, form.teacherUID,
      );
      this.assignForm[courseId] = { sectionId: '', teacherUID: '' };
      await this.loadAll();
      this.toast.success('Section assigned');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to assign section';
      this.toast.error('Failed to assign section', { text: message });
    }
  }

  async removeAssignment(cs: CourseSection): Promise<void> {
    const ok = await this.toast.confirmDestructive('Remove assignment?', {
      text: `Remove ${this.sectionName(cs.sectionId)} from ${this.teacherName(cs.teacherUID)}?`,
      confirmText: 'Remove',
    });
    if (!ok) return;
    try {
      await this.academic.removeCourseSection(cs.id);
      await this.loadAll();
      this.toast.success('Assignment removed');
    } catch { this.toast.error('Failed to remove assignment'); }
  }
}