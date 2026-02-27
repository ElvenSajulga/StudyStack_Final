import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivityService } from '../../../services/activity.service';
import { AnnouncementService } from '../../../services/announcement.service';
import { StudentAccountService } from '../../../services/student-account.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-teacher-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './teacher-dashboard.html',
  styleUrl: './teacher-dashboard.scss',
})
export class TeacherDashboard {
  totalStudents = 0;
  totalActivities = 0;
  totalAnnouncements = 0;
  upcomingActivities = 0;

  constructor(
    private readonly activityService: ActivityService,
    private readonly announcementService: AnnouncementService,
    private readonly studentService: StudentAccountService,
    private readonly auth: AuthService,
  ) {
    void this.computeStats();
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

    await this.studentService.reloadFromServer();
    this.totalStudents = this.studentService.getCount();

    this.totalAnnouncements = teacherID
      ? (await this.announcementService.getForTeacher(teacherID)).length
      : 0;
  }
}
