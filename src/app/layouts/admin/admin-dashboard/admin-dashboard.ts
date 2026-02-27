import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StudentAccountService } from '../../../services/student-account.service';
import { TeacherAccountService } from '../../../services/teacher-account.service';
import { ActivityService } from '../../../services/activity.service';
import { AnnouncementService } from '../../../services/announcement.service';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-dashboard.html',
  styleUrl: './admin-dashboard.scss',
})
export class AdminDashboard {
  totalStudents = 0;
  totalTeachers = 0;
  totalActivities = 0;
  totalAnnouncements = 0;

  constructor(
    private readonly students: StudentAccountService,
    private readonly teachers: TeacherAccountService,
    private readonly activities: ActivityService,
    private readonly announcements: AnnouncementService,
  ) {
    void this.loadStats();
  }

  private async loadStats(): Promise<void> {
    await this.students.reloadFromServer();
    await this.teachers.reloadFromServer();

    this.totalStudents = this.students.getCount();
    this.totalTeachers = this.teachers.getCount();
    const allActivities = await this.activities.getAllActivities();
    this.totalActivities = allActivities.length;
    const all = await this.announcements.getAllForStudents();
    this.totalAnnouncements = all.length;
  }
}
