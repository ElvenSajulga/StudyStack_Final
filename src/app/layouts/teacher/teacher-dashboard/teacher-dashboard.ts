import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Activity, ActivityService } from '../../../services/activity.service';
import { Announcement, AnnouncementService } from '../../../services/announcement.service';
import { StudentAccountService } from '../../../services/student-account.service';
import { AuthService } from '../../../services/auth.service';
import { AcademicService } from '../../../services/academic.service';

interface CourseStats {
  courseId: string;
  courseName: string;
  semester: string;
  studentCount: number;
  openActivities: number;
  pendingGrading: number;
}

@Component({
  selector: 'app-teacher-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './teacher-dashboard.html',
  styleUrl: './teacher-dashboard.scss',
})
export class TeacherDashboard implements OnInit {
  totalStudents = 0;
  totalActivities = 0;
  totalAnnouncements = 0;
  upcomingActivities = 0;
  activitiesClosingThisWeek = 0;

  courseStats: CourseStats[] = [];
  needsGrading: { activity: Activity; ungraded: number }[] = [];

  recentActivities: Activity[] = [];
  recentAnnouncements: Announcement[] = [];

  userName = '';
  today = new Date();

  constructor(
    private readonly activityService: ActivityService,
    private readonly announcementService: AnnouncementService,
    private readonly studentService: StudentAccountService,
    private readonly auth: AuthService,
    private readonly academic: AcademicService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    const user = localStorage.getItem('currentUser');
    if (user) {
      const parsed = JSON.parse(user);
      this.userName = parsed.name || 'Teacher';
    }
    void this.computeStats();
  }

  getGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }

  private get teacherID(): string | undefined {
    return this.auth.getCurrentUser()?.teacherID;
  }

  private async computeStats(): Promise<void> {
    const teacherID = this.teacherID;
    const activities = teacherID
      ? await this.activityService.getActivitiesForTeacher(teacherID)
      : [];

    this.totalActivities = activities.length;
    const now = new Date();
    this.upcomingActivities = activities.filter(a => new Date(a.deadline) >= now).length;

    // Calculate activities closing this week (within 7 days)
    const oneWeekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    this.activitiesClosingThisWeek = activities.filter(a => {
      const deadline = new Date(a.deadline);
      return deadline >= now && deadline <= oneWeekFromNow;
    }).length;

    this.recentActivities = activities.slice(0, 5);

    await this.studentService.reloadFromServer();
    this.totalStudents = this.studentService.getCount();

    const announcements = teacherID
      ? await this.announcementService.getForTeacher(teacherID)
      : [];
    this.totalAnnouncements = announcements.length;
    this.recentAnnouncements = announcements
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 3);

    // Load course stats
    if (teacherID) {
      await this.loadCourseStats(teacherID, activities);
      await this.loadNeedsGrading(activities);
    } else {
      this.courseStats = [];
      this.needsGrading = [];
    }

    this.cdr.detectChanges();
  }

  private async loadCourseStats(teacherID: string, activities: Activity[]): Promise<void> {
    try {
      const [courseSections, courses, enrollments] = await Promise.all([
        this.academic.getCourseSectionsByTeacher(teacherID),
        this.academic.getCourses(),
        this.academic.getEnrollments(),
      ]);

      const courseById = new Map(courses.map(c => [c.id, c]));
      const now = new Date();

      const stats: CourseStats[] = [];
      const seenCourseIds = new Set<string>();

      for (const section of courseSections) {
        if (seenCourseIds.has(section.courseId)) continue;
        seenCourseIds.add(section.courseId);

        const course = courseById.get(section.courseId);
        if (!course) continue;

        // Count students in this course for this teacher
        const courseEnrollments = enrollments.filter(
          e => e.courseId === section.courseId && e.teacherUID === teacherID
        );
        const studentCount = new Set(courseEnrollments.map(e => e.studentUID)).size;

        // Count open activities (closeAt > now)
        const openCount = activities.filter(a => {
          const closeAt = new Date(a.closeAt || a.deadline);
          return a.courseId === section.courseId && closeAt > now;
        }).length;

        // Count pending grading (closed activities with ungraded submissions)
        let pendingCount = 0;
        const closedActivities = activities.filter(a => {
          const closeAt = new Date(a.closeAt || a.deadline);
          return a.courseId === section.courseId && closeAt <= now;
        });

        for (const activity of closedActivities) {
          const submissions = await this.activityService.getSubmissionsForActivity(activity.id);
          const ungradedCount = submissions.filter((s: any) => !s.graded && s.submitted).length;
          if (ungradedCount > 0) {
            pendingCount += 1;
          }
        }

        stats.push({
          courseId: section.courseId,
          courseName: course.name,
          semester: course.semester || 'N/A',
          studentCount,
          openActivities: openCount,
          pendingGrading: pendingCount,
        });
      }

      this.courseStats = stats;
    } catch (error) {
      console.error('Error loading course stats:', error);
      this.courseStats = [];
    }
  }

  private async loadNeedsGrading(activities: Activity[]): Promise<void> {
    try {
      const now = new Date();
      const needsGrading: { activity: Activity; ungraded: number }[] = [];

      // Filter to closed activities
      const closedActivities = activities.filter(a => {
        const closeAt = new Date(a.closeAt || a.deadline);
        return closeAt <= now;
      });

      // For each closed activity, count ungraded submissions
      for (const activity of closedActivities) {
        const submissions = await this.activityService.getSubmissionsForActivity(activity.id);
        const ungradedCount = submissions.filter((s: any) => s.submitted && !s.graded).length;

        if (ungradedCount > 0) {
          needsGrading.push({ activity, ungraded: ungradedCount });
        }
      }

      // Sort by deadline ASC and take top 5
      needsGrading.sort((a, b) => {
        const dateA = new Date(a.activity.deadline).getTime();
        const dateB = new Date(b.activity.deadline).getTime();
        return dateA - dateB;
      });

      this.needsGrading = needsGrading.slice(0, 5);
    } catch (error) {
      console.error('Error loading needs grading:', error);
      this.needsGrading = [];
    }
  }

  isActivityUpcoming(deadline: string): boolean {
    const now = new Date();
    const deadlineDate = new Date(deadline);
    const diff = deadlineDate.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return days <= 7 && days > 0;
  }
}