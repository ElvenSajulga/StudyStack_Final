import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Activity, ActivityService } from '../../../services/activity.service';
import { Announcement, AnnouncementService } from '../../../services/announcement.service';
import { StudentAccountService } from '../../../services/student-account.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-teacher-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './teacher-dashboard.html',
  styleUrl: './teacher-dashboard.scss',
})
export class TeacherDashboard implements OnInit {
  totalStudents = 0;
  totalActivities = 0;
  totalAnnouncements = 0;
  upcomingActivities = 0;

  recentActivities: Activity[] = [];
  recentAnnouncements: Announcement[] = [];

  userName = '';
  today = new Date();

  constructor(
    private readonly activityService: ActivityService,
    private readonly announcementService: AnnouncementService,
    private readonly studentService: StudentAccountService,
    private readonly auth: AuthService,
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

    this.cdr.detectChanges();
  }

  isActivityUpcoming(deadline: string): boolean {
    const now = new Date();
    const deadlineDate = new Date(deadline);
    const diff = deadlineDate.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return days <= 7 && days > 0;
  }
}