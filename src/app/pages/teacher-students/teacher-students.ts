import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AcademicService, Course, Program, Section } from '../../services/academic.service';
import { ActivityService, ActivitySubmission } from '../../services/activity.service';
import { AuthService } from '../../services/auth.service';
import { StudentAccount, StudentAccountService } from '../../services/student-account.service';

interface StudentCourseEntry {
  courseId: string;
  courseName: string;
  sectionName: string;
}

interface StudentRow {
  student: StudentAccount;
  courses: StudentCourseEntry[];
  programName: string;
  enrolledAt: string;
  submissionCount: number;
}

type SortField = 'name' | 'submissions';

@Component({
  selector: 'app-teacher-students',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './teacher-students.html',
  styleUrl: './teacher-students.scss',
})
export class TeacherStudents implements OnInit {
  rows: StudentRow[] = [];
  loading = false;

  searchQuery = '';
  selectedSubject = 'all';
  sortField: SortField = 'name';
  sortDir: 'asc' | 'desc' = 'asc';

  totalStudents = 0;
  totalCourses = 0;

  constructor(
    private readonly academic: AcademicService,
    private readonly studentService: StudentAccountService,
    private readonly activityService: ActivityService,
    private readonly auth: AuthService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    void this.loadData();
  }

  private get teacherUID(): string | undefined {
    return (this.auth.getCurrentUser() as unknown as { UID?: string })?.UID;
  }

  async loadData(): Promise<void> {
    const teacherUID = this.teacherUID;
    if (!teacherUID) {
      this.rows = [];
      this.totalStudents = 0;
      this.totalCourses = 0;
      this.cdr.detectChanges();
      return;
    }

    this.loading = true;
    this.cdr.detectChanges();

    try {
      await this.studentService.reloadFromServer();

      const [courseSections, courses, sections, programs, allEnrollments] = await Promise.all([
        this.academic.getCourseSectionsByTeacher(teacherUID),
        this.academic.getCourses(),
        this.academic.getSections(),
        this.academic.getPrograms(),
        this.academic.getEnrollments(),
      ]);

      this.totalCourses = courseSections.length;

      const teacherEnrollments = allEnrollments.filter(e => e.teacherUID === teacherUID);

      // Group enrollments by studentUID
      const byStudent = new Map<string, typeof teacherEnrollments>();
      for (const enrollment of teacherEnrollments) {
        const list = byStudent.get(enrollment.studentUID) ?? [];
        list.push(enrollment);
        byStudent.set(enrollment.studentUID, list);
      }

      this.totalStudents = byStudent.size;

      const allStudents = this.studentService.getAll();
      const courseById = new Map<string, Course>(courses.map(c => [c.id, c]));
      const sectionById = new Map<string, Section>(sections.map(s => [s.id, s]));
      const programById = new Map<string, Program>(programs.map(p => [p.id, p]));

      const rows: StudentRow[] = [];
      const submissionCountPromises: Promise<void>[] = [];

      for (const [studentUID, enrollments] of byStudent.entries()) {
        const student = allStudents.find(s => s.UID === studentUID);
        if (!student) continue;

        const studentCourses: StudentCourseEntry[] = enrollments.map(e => ({
          courseId: e.courseId,
          courseName: courseById.get(e.courseId)?.name ?? 'Unknown course',
          sectionName: sectionById.get(e.sectionId)?.name ?? 'Unknown section',
        }));

        // Earliest enrolledAt across this student's enrollments with this teacher
        const enrolledAt = enrollments
          .map(e => e.enrolledAt)
          .filter((d): d is string => !!d)
          .sort()[0] ?? '';

        // Resolve program name from the first course's programId, falling back to student.program
        const firstCourse = courseById.get(enrollments[0].courseId);
        const programName = firstCourse
          ? programById.get(firstCourse.programId)?.name ?? student.program ?? ''
          : student.program ?? '';

        const row: StudentRow = {
          student,
          courses: studentCourses,
          programName,
          enrolledAt,
          submissionCount: 0,
        };
        rows.push(row);

        // Count submissions in parallel; populate when resolved
        submissionCountPromises.push(
          this.activityService.getSubmissionsForStudent(student.studentID).then(subs => {
            row.submissionCount = subs.filter((s: ActivitySubmission) => s.submitted).length;
          }).catch(() => { /* keep 0 on error */ })
        );
      }

      this.rows = rows;
      this.cdr.detectChanges();

      // Resolve submission counts in the background, then refresh
      await Promise.all(submissionCountPromises);
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  get filteredRows(): StudentRow[] {
    const query = this.searchQuery.trim().toLowerCase();
    let list = this.rows;

    if (this.selectedSubject !== 'all') {
      list = list.filter(r => r.courses.some(c => c.courseName === this.selectedSubject));
    }

    if (query) {
      list = list.filter(r => {
        const haystack = `${r.student.firstname ?? ''} ${r.student.lastname ?? ''} ${r.student.studentID ?? ''}`.toLowerCase();
        return haystack.includes(query);
      });
    }

    const sorted = [...list];
    const dir = this.sortDir === 'asc' ? 1 : -1;

    if (this.sortField === 'submissions') {
      sorted.sort((a, b) => (a.submissionCount - b.submissionCount) * dir);
    } else {
      sorted.sort((a, b) => {
        const aName = `${a.student.lastname ?? ''} ${a.student.firstname ?? ''}`.toLowerCase();
        const bName = `${b.student.lastname ?? ''} ${b.student.firstname ?? ''}`.toLowerCase();
        return aName.localeCompare(bName) * dir;
      });
    }

    return sorted;
  }

  get subjectCategories(): Array<{ name: string; count: number }> {
    const bySubject = new Map<string, Set<string>>();
    for (const row of this.rows) {
      for (const course of row.courses) {
        const current = bySubject.get(course.courseName) ?? new Set<string>();
        current.add(row.student.UID);
        bySubject.set(course.courseName, current);
      }
    }

    return Array.from(bySubject.entries())
      .map(([name, students]) => ({ name, count: students.size }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  setSubjectFilter(subjectName: string): void {
    this.selectedSubject = subjectName;
  }

  sortBy(field: SortField): void {
    if (this.sortField === field) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortField = field;
      this.sortDir = field === 'submissions' ? 'desc' : 'asc';
    }
  }

  isSorted(field: SortField): boolean {
    return this.sortField === field;
  }

  trackByUID(_: number, row: StudentRow): string {
    return row.student.UID;
  }
}
