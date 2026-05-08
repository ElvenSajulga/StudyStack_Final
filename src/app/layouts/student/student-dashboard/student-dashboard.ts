import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  Activity,
  ActivityService,
  ActivitySubmission,
  AttendanceStatus,
} from '../../../services/activity.service';
import { Announcement, AnnouncementService } from '../../../services/announcement.service';
import { AcademicService } from '../../../services/academic.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-student-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './student-dashboard.html',
  styleUrl: './student-dashboard.scss',
})
export class StudentDashboard implements OnInit {
  presentCount     = 0;
  lateCount        = 0;
  absentCount      = 0;
  openActivities   = 0;
  latestAnnouncements: Announcement[] = [];
  upcomingActivities: Activity[] = [];

  userName = '';
  today = new Date();

  constructor(
    private readonly activityService: ActivityService,
    private readonly announcementService: AnnouncementService,
    private readonly academic: AcademicService,
    private readonly auth: AuthService,
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
        this.upcomingActivities = enrolledActivities
          .filter(a => now <= new Date(a.closeAt))
          .sort((a, b) => new Date(a.closeAt).getTime() - new Date(b.closeAt).getTime())
          .slice(0, 5);
      } else {
        this.latestAnnouncements = [];
        this.upcomingActivities = [];
      }
    } else {
      this.latestAnnouncements = [];
      this.upcomingActivities = [];
    }

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
  }
}