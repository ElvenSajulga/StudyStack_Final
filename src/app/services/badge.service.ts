import { Injectable, ChangeDetectorRef } from '@angular/core';
import { ActivityService } from './activity.service';
import { AnnouncementService } from './announcement.service';
import { NotificationService } from './notification.service';
import { AuthService } from './auth.service';
import { StudentAccountService } from './student-account.service';
import { TeacherAccountService } from './teacher-account.service';
import { AcademicService } from './academic.service';

export interface StudentBadges {
  activities: number;
  grades: number;
  announcements: number;
}

export interface TeacherBadges {
  activities: number;
}

@Injectable({ providedIn: 'root' })
export class BadgeService {
  studentBadges: StudentBadges = { activities: 0, grades: 0, announcements: 0 };
  teacherBadges: TeacherBadges = { activities: 0 };

  private refreshTimer?: number;

  constructor(
    private readonly activityService: ActivityService,
    private readonly announcementService: AnnouncementService,
    private readonly notificationService: NotificationService,
    private readonly auth: AuthService,
    private readonly studentService: StudentAccountService,
    private readonly teacherService: TeacherAccountService,
    private readonly academicService: AcademicService,
  ) {}

  start(): void {
    void this.refresh();
    this.refreshTimer = window.setInterval(() => void this.refresh(), 30000);
  }

  stop(): void {
    if (this.refreshTimer) {
      window.clearInterval(this.refreshTimer);
    }
  }

  async refresh(): Promise<void> {
    const user = this.auth.getCurrentUser();
    if (!user) return;

    if (user.role === 'student') {
      await this.refreshStudentBadges(user.studentID!);
    } else if (user.role === 'teacher') {
      await this.refreshTeacherBadges(user.teacherID!);
    }
  }

  private async refreshStudentBadges(studentID: string): Promise<void> {
    // Get student UID for notifications
    const studentAccount = this.studentService.getAll().find(s => s.studentID === studentID);
    const studentUID = studentAccount?.UID;

    if (!studentUID) {
      this.studentBadges = { activities: 0, grades: 0, announcements: 0 };
      return;
    }

    // Pending activities: open activities not yet submitted
    const enrollments = await this.academicService.getEnrollmentsByStudentID(studentID);
    const enrolledTeacherUIDs = [...new Set(enrollments.map(e => e.teacherUID))];

    let pendingCount = 0;
    if (enrolledTeacherUIDs.length > 0) {
      const activities = await this.activityService.getActivitiesForEnrolledTeacherUIDs(enrolledTeacherUIDs);
      const submissions = await this.activityService.getSubmissionsForStudent(studentID);
      const submissionsByActivityId: Record<string, boolean> = {};
      for (const sub of submissions) {
        submissionsByActivityId[sub.activityId] = true;
      }

      const now = new Date();
      for (const a of activities) {
        if (now <= new Date(a.closeAt) && !submissionsByActivityId[a.id]) {
          pendingCount++;
        }
      }
    }

    // New grades: unread score-released notifications
    const notifications = await this.notificationService.getForUser(studentUID);
    const gradesCount = notifications.filter(n => !n.read && n.type === 'score-released').length;

    // New announcements: since last seen
    let announcementsCount = 0;
    if (enrolledTeacherUIDs.length > 0) {
      const perTeacher = await Promise.all(
        enrolledTeacherUIDs.map(uid => this.announcementService.getForTeacher(uid))
      );
      const seen = new Set<string | number>();
      const allAnnouncements = perTeacher
        .flat()
        .filter(a => { if (seen.has(a.id)) return false; seen.add(a.id); return true; });

      const lastSeenKey = `ss_ann_seen_${studentUID}`;
      const lastSeenStr = localStorage.getItem(lastSeenKey);
      const lastSeen = lastSeenStr ? new Date(lastSeenStr) : new Date(0);

      announcementsCount = allAnnouncements.filter(a => new Date(a.createdAt) > lastSeen).length;
    }

    this.studentBadges = {
      activities: pendingCount,
      grades: gradesCount,
      announcements: announcementsCount,
    };
  }

  private async refreshTeacherBadges(teacherID: string): Promise<void> {
    // Count submitted but ungraded submissions
    const activities = await this.activityService.getActivitiesForTeacher(teacherID);
    let ungradedCount = 0;

    for (const activity of activities) {
      // Released activities are explicitly closed-out by the teacher, so they
      // no longer count toward the "pending grading" badge even if individual
      // submissions weren't manually graded.
      if (activity.scoresReleased === true) continue;
      const submissions = await this.activityService.getSubmissionsForActivity(activity.id);
      for (const sub of submissions) {
        if (sub.submitted && !sub.graded) {
          ungradedCount++;
        }
      }
    }

    this.teacherBadges = { activities: ungradedCount };
  }

  markAnnouncementsSeen(studentUID: string): void {
    const lastSeenKey = `ss_ann_seen_${studentUID}`;
    localStorage.setItem(lastSeenKey, new Date().toISOString());
    this.studentBadges.announcements = 0;
  }

  markGradesSeen(studentUID: string): Promise<void> {
    // Just reset locally; notifications would be marked read on notification-panel open
    this.studentBadges.grades = 0;
    return Promise.resolve();
  }
}
