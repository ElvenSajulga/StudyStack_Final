import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import {
  Activity,
  ActivityService,
  ActivitySubmission,
  AttendanceStatus,
} from '../../../services/activity.service';
import { Announcement, AnnouncementService } from '../../../services/announcement.service';
import { AcademicService } from '../../../services/academic.service';
import { AuthService } from '../../../services/auth.service';
import { TeacherAccountService } from '../../../services/teacher-account.service';

interface CalendarDay {
  date: Date;
  dateNum: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  activities: Activity[];
}

interface CourseProgress {
  courseId: string;
  courseName: string;
  teacherName: string;
  totalActivities: number;
  completedActivities: number;
  completionPercent: number;
  averageScore: number;
  attendanceRate: number;
  status: 'on-track' | 'attention' | 'at-risk';
}

@Component({
  selector: 'app-student-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './student-dashboard.html',
  styleUrl: './student-dashboard.scss',
})
export class StudentDashboard implements OnInit {
  presentCount     = 0;
  lateCount        = 0;
  absentCount      = 0;
  openActivities   = 0;
  overallAveragePercent = 0;
  submissionsThisWeek = 0;
  nextDeadline: Activity | null = null;
  onTimeRate = 0;
  latestAnnouncements: Announcement[] = [];
  upcomingActivities: Activity[] = [];
  allUpcomingActivities: Activity[] = [];
  calendarDays: CalendarDay[] = [];
  currentMonth: Date = new Date();
  selectedDay: CalendarDay | null = null;
  courseProgress: CourseProgress[] = [];

  userName = '';
  today = new Date();

  constructor(
    private readonly activityService: ActivityService,
    private readonly announcementService: AnnouncementService,
    private readonly academic: AcademicService,
    private readonly auth: AuthService,
    private readonly teacherAccountService: TeacherAccountService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    const user = localStorage.getItem('currentUser');
    if (user) {
      const parsed = JSON.parse(user);
      this.userName = parsed.name || 'Student';
    }
    void this.init();
  }

  getGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }

  private get studentID(): string | undefined {
    return this.auth.getCurrentUser()?.studentID;
  }

  private async init(): Promise<void> {
    await this.computeStats();
    await this.buildCourseProgress();

    // ── Announcements: only from teachers the student is enrolled under ──────
    const sid = this.studentID;
    if (sid) {
      const enrollments = await this.academic.getEnrollmentsByStudentID(sid);
      const teacherUIDs = [...new Set(enrollments.map(e => e.teacherUID))];

      if (teacherUIDs.length > 0) {
        const perTeacher = await Promise.all(
          teacherUIDs.map(uid => this.announcementService.getForTeacher(uid))
        );
        const seen = new Set<string | number>();
        const all = perTeacher
          .flat()
          .filter(a => { if (seen.has(a.id)) return false; seen.add(a.id); return true; })
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        this.latestAnnouncements = all.slice(0, 3);

        // ── Get upcoming activities (open activities) ──────────────────
        const enrolledActivities = await this.activityService
          .getActivitiesForEnrolledTeacherUIDs(teacherUIDs);
        const now = new Date();
        const openActivities = enrolledActivities.filter(a => now <= new Date(a.closeAt));

        this.upcomingActivities = openActivities
          .sort((a, b) => new Date(a.closeAt).getTime() - new Date(b.closeAt).getTime())
          .slice(0, 5);

        // ── Store ALL upcoming activities for calendar ──────────────────
        this.allUpcomingActivities = openActivities
          .sort((a, b) => new Date(a.closeAt).getTime() - new Date(b.closeAt).getTime());
      } else {
        this.latestAnnouncements = [];
        this.upcomingActivities = [];
        this.allUpcomingActivities = [];
      }
    } else {
      this.latestAnnouncements = [];
      this.upcomingActivities = [];
      this.allUpcomingActivities = [];
    }

    // ── Build calendar ────────────────────────────────────────────────────────
    this.buildCalendar();

    this.cdr.detectChanges();
  }

  getDaysLeft(closeAt: string): string {
    const now = new Date();
    const close = new Date(closeAt);
    const diff = close.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    if (days < 0) return 'Overdue';
    if (days === 0) return 'Today';
    if (days === 1) return 'Tomorrow';
    return `${days}d left`;
  }

  isUrgent(closeAt: string): boolean {
    const now = new Date();
    const close = new Date(closeAt);
    const diff = close.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return days <= 3;
  }

  getDeadlineUrgency(): 'urgent' | 'soon' | 'later' {
    if (!this.nextDeadline) return 'later';
    const now = new Date();
    const close = new Date(this.nextDeadline.closeAt);
    const diffMs = close.getTime() - now.getTime();
    const hours = Math.floor(diffMs / (1000 * 60 * 60));

    if (hours <= 24) return 'urgent';
    if (hours <= 72) return 'soon';
    return 'later';
  }

  hoursUntilDeadline(): number {
    if (!this.nextDeadline) return 0;
    const now = new Date();
    const close = new Date(this.nextDeadline.closeAt);
    const diffMs = close.getTime() - now.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60));
  }

  get monthLabel(): string {
    return this.currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  buildCalendar(): void {
    this.calendarDays = [];
    const year = this.currentMonth.getFullYear();
    const month = this.currentMonth.getMonth();

    // Get the first day of the month
    const firstDay = new Date(year, month, 1);
    const firstDayOfWeek = firstDay.getDay(); // 0 = Sunday, 6 = Saturday

    // Start from the Sunday before the first day (if needed)
    const startDate = new Date(firstDay);
    startDate.setDate(firstDay.getDate() - firstDayOfWeek);

    // Generate 6 weeks × 7 days = 42 days
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < 42; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      const dateStr = date.toDateString();

      const isCurrentMonth = date.getMonth() === month;
      const isToday = dateStr === today.toDateString();

      // Filter activities for this day
      const activitiesForDay = this.allUpcomingActivities.filter(a => {
        const activityDate = new Date(a.closeAt);
        return activityDate.toDateString() === dateStr;
      });

      this.calendarDays.push({
        date,
        dateNum: date.getDate(),
        isCurrentMonth,
        isToday,
        activities: activitiesForDay,
      });
    }
  }

  prevMonth(): void {
    const date = new Date(this.currentMonth);
    date.setMonth(date.getMonth() - 1);
    this.currentMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    this.selectedDay = null;
    this.buildCalendar();
  }

  nextMonth(): void {
    const date = new Date(this.currentMonth);
    date.setMonth(date.getMonth() + 1);
    this.currentMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    this.selectedDay = null;
    this.buildCalendar();
  }

  selectDay(day: CalendarDay): void {
    if (day.activities.length > 0) {
      this.selectedDay = day;
    }
  }

  closeSelectedDay(): void {
    this.selectedDay = null;
  }

  private async buildCourseProgress(): Promise<void> {
    const sid = this.studentID;
    if (!sid) {
      this.courseProgress = [];
      return;
    }

    try {
      const enrollments = await this.academic.getEnrollmentsByStudentID(sid);
      const courses = await this.academic.getCourses();
      const teachers = this.teacherAccountService.getAll();
      const submissions = await this.activityService.getSubmissionsForStudent(sid);

      // Build courseId → courseName map
      const courseIdToName: Record<string, string> = {};
      for (const course of courses) {
        courseIdToName[course.id] = course.name;
      }

      // Build UID → teacher name map
      const uidToTeacherName: Record<string, string> = {};
      for (const teacher of teachers) {
        const fullName = `${teacher.firstname} ${teacher.lastname}`.trim();
        uidToTeacherName[teacher.UID] = fullName || teacher.name || 'Unknown';
      }

      // Process each enrollment
      const progress: CourseProgress[] = [];
      for (const enrollment of enrollments) {
        const courseName = courseIdToName[enrollment.courseId] || 'Unknown';
        const teacherName = uidToTeacherName[enrollment.teacherUID] || 'Unknown';

        // Get activities for this teacher
        const enrolledActivities = await this.activityService
          .getActivitiesForEnrolledTeacherUIDs([enrollment.teacherUID]);

        // Count only closed activities (closeAt < now)
        const now = new Date();
        const closedActivities = enrolledActivities.filter(a => new Date(a.closeAt) < now);
        const totalActivities = closedActivities.length;

        if (totalActivities === 0) continue; // Skip if no closed activities

        // Count completed submissions
        const courseSubmissions = submissions.filter(s =>
          closedActivities.some(a => a.id === s.activityId) && s.submitted
        );
        const completedActivities = courseSubmissions.length;
        const completionPercent = totalActivities > 0 ? (completedActivities / totalActivities) * 100 : 0;

        // Calculate average score
        const gradedSubmissions = courseSubmissions.filter(s => s.graded && s.score != null);
        let averageScore = 0;
        if (gradedSubmissions.length > 0) {
          const scores = gradedSubmissions.map(s => {
            const activity = closedActivities.find(a => a.id === s.activityId);
            if (!activity || !activity.maxPoints) return 0;
            return (s.score! / activity.maxPoints) * 100;
          });
          averageScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
        }

        // Calculate attendance rate
        let attendanceRate = 0;
        let presentCount = 0;
        let lateCount = 0;
        let totalCount = 0;
        for (const activity of closedActivities) {
          const sub = submissions.find(s => s.activityId === activity.id);
          const status = this.activityService.getAttendanceStatus(activity, sub);
          if (status === 'present') presentCount++;
          if (status === 'late') lateCount++;
          totalCount++;
        }
        attendanceRate = totalCount > 0 ? ((presentCount + lateCount) / totalCount) * 100 : 0;

        // Determine status
        let status: 'on-track' | 'attention' | 'at-risk';
        if (averageScore >= 80) {
          status = 'on-track';
        } else if (averageScore >= 60) {
          status = 'attention';
        } else {
          status = 'at-risk';
        }

        progress.push({
          courseId: enrollment.courseId,
          courseName,
          teacherName,
          totalActivities,
          completedActivities,
          completionPercent,
          averageScore,
          attendanceRate,
          status,
        });
      }

      this.courseProgress = progress;
    } catch (e) {
      console.warn('buildCourseProgress failed:', e);
      this.courseProgress = [];
    }
  }

  private async computeStats(): Promise<void> {
    const sid = this.studentID;

    this.presentCount   = 0;
    this.lateCount      = 0;
    this.absentCount    = 0;
    this.openActivities = 0;

    if (!sid) return;

    // ── Step 1: Resolve the teachers this student is enrolled under ───────────
    // enrollments store teacherUID (the UID field of the teacher account,
    // e.g. "teacher1"), while activities are stored with teacherID (the
    // teacherID credential, e.g. "T-0001").  We need to resolve the mapping.
    const enrollments = await this.academic.getEnrollmentsByStudentID(sid);
    if (enrollments.length === 0) return;

    // Unique teacher UIDs from enrollments (e.g. "teacher1", "teacher2")
    const enrolledTeacherUIDs = [...new Set(enrollments.map(e => e.teacherUID))];

    // ── Step 2: Fetch all activities and keep only those whose teacherID
    //           belongs to one of the enrolled teachers.
    // Activities store teacherID as the TeacherAccount.teacherID value
    // (e.g. "T-0001"), NOT the UID.  The enrollment stores the teacher's UID.
    // The TeacherAccountService cache gives us the bridge: UID → teacherID.
    //
    // However, to stay service-layer clean we resolve this by fetching
    // activities per enrolled teacher using their teacherID, which requires
    // knowing the mapping.  The safest approach with the current architecture:
    // pull all activities, then cross-filter by matching teacherID to the
    // teacher accounts that correspond to enrolled UIDs.
    //
    // We use AcademicService.getEnrollmentsByStudentID which returns teacherUID.
    // The ActivityService.getActivitiesForTeacher(teacherID) expects the
    // TeacherAccount.teacherID field.  We resolve via the teacher cache.

    // Resolve enrolled UIDs → TeacherAccount.teacherID values
    // Import TeacherAccountService is intentionally avoided here to keep this
    // component lean; instead we fetch activities per enrolledTeacherUID via a
    // different path: since the enrollment record contains teacherUID, and the
    // activity record contains teacherID (the credential ID), we need the
    // mapping.  The cleanest fix is to fetch activities for EACH enrolled
    // teacher by their teacherID field, which we can obtain from the teacher
    // accounts cache already loaded globally.
    //
    // We delegate the resolution to the new helper on ActivityService.
    const enrolledActivities = await this.activityService
      .getActivitiesForEnrolledTeacherUIDs(enrolledTeacherUIDs);

    // ── Step 3: Count open activities ─────────────────────────────────────────
    const now = new Date();
    for (const a of enrolledActivities) {
      if (now <= new Date(a.closeAt)) {
        this.openActivities++;
      }
    }

    // ── Step 4: Attendance stats from this student's submissions ──────────────
    const submissionsByActivityId: Record<string, ActivitySubmission | undefined> = {};
    const subs = await this.activityService.getSubmissionsForStudent(sid);
    for (const sub of subs) {
      submissionsByActivityId[sub.activityId] = sub;
    }

    for (const a of enrolledActivities) {
      const status: AttendanceStatus = this.activityService.getAttendanceStatus(
        a,
        submissionsByActivityId[a.id],
      );
      if (status === 'present') this.presentCount++;
      if (status === 'late')    this.lateCount++;
      if (status === 'absent')  this.absentCount++;
    }

    // ── Calculate overall average percentage ──────────────────────────────────
    const graded = subs.filter(s => s.graded && s.score != null);
    if (graded.length > 0 && enrolledActivities.length > 0) {
      const percentages = graded.map(s => {
        const a = enrolledActivities.find(x => x.id === s.activityId);
        if (!a || !a.maxPoints) return 0;
        return (s.score! / a.maxPoints) * 100;
      });
      this.overallAveragePercent = percentages.reduce((sum, p) => sum + p, 0) / percentages.length;
    }

    // ── Count submissions from this week ──────────────────────────────────────
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    this.submissionsThisWeek = subs.filter(s => s.submitted && new Date(s.submittedAt) >= sevenDaysAgo).length;

    // ── Find next deadline (closest upcoming) ─────────────────────────────────
    const upcoming = enrolledActivities
      .filter(a => new Date(a.closeAt) > new Date())
      .sort((a, b) => new Date(a.closeAt).getTime() - new Date(b.closeAt).getTime());
    this.nextDeadline = upcoming[0] ?? null;

    // ── Calculate on-time rate ───────────────────────────────────────────────
    const totalActivities = this.presentCount + this.lateCount + this.absentCount;
    this.onTimeRate = totalActivities > 0 ? (this.presentCount / totalActivities) * 100 : 0;
  }
}