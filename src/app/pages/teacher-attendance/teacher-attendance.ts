import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Activity, ActivityService, ActivitySubmission, AttendanceStatus } from '../../services/activity.service';
import { AuthService } from '../../services/auth.service';
import { StudentAccount, StudentAccountService } from '../../services/student-account.service';
import { AcademicService, CourseSection, Enrollment } from '../../services/academic.service';

interface CourseFilterOption {
  courseId: string;
  courseName: string;
  sectionName: string;
  sectionId: string;
}

interface StudentAttendanceSummary {
  student: StudentAccount;
  present: number;
  late: number;
  absent: number;
  total: number;
  rate: number;
}

@Component({
  selector: 'app-teacher-attendance',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './teacher-attendance.html',
  styleUrl: './teacher-attendance.scss',
})
export class TeacherAttendance implements OnInit {
  activities: Activity[] = [];
  students: StudentAccount[] = [];
  courseFilters: CourseFilterOption[] = [];
  selectedCourseId: string = '';
  attendanceView: 'by-activity' | 'by-student' = 'by-activity';
  rateSortDir: 'asc' | 'desc' | null = null;

  private allActivities: Activity[] = [];
  private allStudents: StudentAccount[] = [];
  private enrollmentsBySection: Map<string, Enrollment[]> = new Map();
  private submissionsByKey: Record<string, ActivitySubmission | undefined> = {};

  constructor(
    private readonly activityService: ActivityService,
    private readonly auth: AuthService,
    private readonly studentService: StudentAccountService,
    private readonly academicService: AcademicService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    void this.loadData();
  }

  private submissionKey(activityId: string, studentID: string): string {
    return `${activityId}::${studentID}`;
  }

  private async loadData(): Promise<void> {
    const teacherUID = (this.auth.getCurrentUser() as any)?.UID;
    if (!teacherUID) {
      this.activities = [];
      this.students = [];
      this.courseFilters = [];
      this.selectedCourseId = '';
      this.allActivities = [];
      this.allStudents = [];
      this.submissionsByKey = {};
      this.cdr.detectChanges();
      return;
    }

    await this.studentService.reloadFromServer();

    const [courseSections, courses, sections, enrollments] = await Promise.all([
      this.academicService.getCourseSectionsByTeacher(teacherUID),
      this.academicService.getCourses(),
      this.academicService.getSections(),
      this.academicService.getEnrollments(),
    ]);

    // Build course filter options
    this.courseFilters = courseSections.map(cs => {
      const course = courses.find(c => c.id === cs.courseId);
      const section = sections.find(s => s.id === cs.sectionId);
      return {
        courseId: cs.courseId,
        courseName: course?.name || 'Unknown',
        sectionName: section?.name || 'Unknown',
        sectionId: cs.sectionId,
      };
    });

    // Filter enrollments to only those for this teacher
    const teacherEnrollments = enrollments.filter(e => e.teacherUID === teacherUID);

    // Build map of enrollments by section
    this.enrollmentsBySection.clear();
    for (const enrollment of teacherEnrollments) {
      const key = enrollment.sectionId;
      if (!this.enrollmentsBySection.has(key)) {
        this.enrollmentsBySection.set(key, []);
      }
      this.enrollmentsBySection.get(key)!.push(enrollment);
    }

    // Get enrolled student UIDs
    const enrolledStudentUIDs = new Set(teacherEnrollments.map(e => e.studentUID));
    const allStudents = this.studentService.getAll();
    this.allStudents = allStudents.filter(s => enrolledStudentUIDs.has(s.UID));

    // Load activities
    this.allActivities = await this.activityService.getActivitiesForTeacher(teacherUID);

    // Load submissions
    const activityIds = this.allActivities.map(a => a.id);
    const subs = await this.activityService.getSubmissionsForActivities(activityIds);
    this.submissionsByKey = {};
    for (const sub of subs) {
      this.submissionsByKey[this.submissionKey(sub.activityId, sub.studentID)] = sub;
    }

    this.applyFilter();
    this.cdr.detectChanges();
  }

  private applyFilter(): void {
    if (this.selectedCourseId === '') {
      this.activities = [...this.allActivities];
      this.students = [...this.allStudents];
    } else {
      const courseFilter = this.courseFilters.find(cf => cf.courseId === this.selectedCourseId);
      if (!courseFilter) {
        this.activities = [];
        this.students = [];
        return;
      }

      // Filter activities by courseId
      this.activities = this.allActivities.filter(a => a.courseId === this.selectedCourseId);

      // Filter students to those enrolled in this section
      const sectionEnrollments = this.enrollmentsBySection.get(courseFilter.sectionId) || [];
      const sectionStudentUIDs = new Set(sectionEnrollments.map(e => e.studentUID));
      this.students = this.allStudents.filter(s => sectionStudentUIDs.has(s.UID));
    }
  }

  onCourseFilterChange(): void {
    this.applyFilter();
    this.cdr.detectChanges();
  }

  attendanceStatus(activity: Activity, student: StudentAccount): AttendanceStatus {
    const submission = this.submissionsByKey[this.submissionKey(activity.id, student.studentID)];
    return this.activityService.getAttendanceStatus(activity, submission);
  }

  setAttendanceView(view: 'by-activity' | 'by-student'): void {
    this.attendanceView = view;
    this.cdr.detectChanges();
  }

  toggleRateSort(): void {
    if (this.rateSortDir === null) {
      this.rateSortDir = 'desc';
    } else if (this.rateSortDir === 'desc') {
      this.rateSortDir = 'asc';
    } else {
      this.rateSortDir = null;
    }
  }

  get studentSummaries(): StudentAttendanceSummary[] {
    const summaries: StudentAttendanceSummary[] = this.students.map(student => {
      let present = 0;
      let late = 0;
      let absent = 0;

      for (const activity of this.activities) {
        const status = this.attendanceStatus(activity, student);
        if (status === 'present') present++;
        else if (status === 'late') late++;
        else if (status === 'absent') absent++;
      }

      const total = this.activities.length;
      const rate = total > 0
        ? Math.round(((present + late) / total) * 1000) / 10
        : 0;

      return { student, present, late, absent, total, rate };
    });

    if (this.rateSortDir !== null) {
      const dir = this.rateSortDir;
      summaries.sort((a, b) => dir === 'asc' ? a.rate - b.rate : b.rate - a.rate);
    } else {
      summaries.sort((a, b) =>
        (a.student.lastname ?? '').localeCompare(b.student.lastname ?? '')
      );
    }

    return summaries;
  }

  rateClass(rate: number): string {
    if (rate >= 80) return 'rate-high';
    if (rate >= 60) return 'rate-mid';
    return 'rate-low';
  }

  get totalsRow(): { present: number; late: number; absent: number; total: number; rate: number } {
    const summaries = this.studentSummaries;
    const present = summaries.reduce((sum, s) => sum + s.present, 0);
    const late = summaries.reduce((sum, s) => sum + s.late, 0);
    const absent = summaries.reduce((sum, s) => sum + s.absent, 0);
    const total = summaries.reduce((sum, s) => sum + s.total, 0);
    const rate = summaries.length > 0
      ? Math.round((summaries.reduce((sum, s) => sum + s.rate, 0) / summaries.length) * 10) / 10
      : 0;
    return { present, late, absent, total, rate };
  }

  exportAttendanceCsv(): void {
    let rows: (string | number)[][] = [];

    if (this.attendanceView === 'by-student') {
      const headers = [
        'Student ID',
        'Last Name',
        'First Name',
        'Present',
        'Late',
        'Absent',
        'Total Activities',
        'Attendance Rate (%)',
      ];
      rows.push(headers);

      for (const summary of this.studentSummaries) {
        const s = summary.student;
        rows.push([
          s.studentID ?? '',
          s.lastname ?? '',
          s.firstname ?? '',
          summary.present,
          summary.late,
          summary.absent,
          summary.total,
          summary.rate.toFixed(1),
        ]);
      }
    } else {
      const headers = [
        'Student ID',
        'Last Name',
        'First Name',
        ...this.activities.map(a => a.title),
      ];
      rows.push(headers);

      for (const s of this.students) {
        rows.push([
          s.studentID ?? '',
          s.lastname ?? '',
          s.firstname ?? '',
          ...this.activities.map(a => this.attendanceStatus(a, s)),
        ]);
      }
    }

    const escapeCell = (value: string | number): string => {
      const str = String(value ?? '');
      const escaped = str.replace(/"/g, '""');
      return `"${escaped}"`;
    };

    const csvContent = rows
      .map(row => row.map(escapeCell).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;
    const filename = `attendance-${dateStr}.csv`;

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }
}