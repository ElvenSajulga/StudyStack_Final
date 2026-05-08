import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StudentAccount, StudentAccountService } from '../../../services/student-account.service';
import { TeacherAccount, TeacherAccountService } from '../../../services/teacher-account.service';
import { Activity, ActivityService } from '../../../services/activity.service';
import { Announcement, AnnouncementService } from '../../../services/announcement.service';
import { AcademicService } from '../../../services/academic.service';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-dashboard.html',
  styleUrl: './admin-dashboard.scss',
})
export class AdminDashboard implements OnInit {
  totalStudents = 0;
  totalTeachers = 0;
  totalPrograms = 0;

  recentStudents: StudentAccount[] = [];
  recentTeachers: TeacherAccount[] = [];
  recentActivities: Activity[] = [];
  recentAnnouncements: Announcement[] = [];

  userName = '';
  today = new Date();

  constructor(
    private readonly students: StudentAccountService,
    private readonly teachers: TeacherAccountService,
    private readonly activities: ActivityService,
    private readonly announcements: AnnouncementService,
    private readonly academic: AcademicService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    const user = localStorage.getItem('currentUser');
    if (user) {
      const parsed = JSON.parse(user);
      this.userName = parsed.name || 'Admin';
    }
    void this.loadStats();
  }

  getGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }

  private async loadStats(): Promise<void> {
    await this.students.reloadFromServer();
    await this.teachers.reloadFromServer();

    this.totalStudents = this.students.getCount();
    this.totalTeachers = this.teachers.getCount();
    const allPrograms = await this.academic.getPrograms();
    this.totalPrograms = allPrograms.length;
    const allAnnouncements = await this.announcements.getAllForStudents();

    this.recentStudents = this.students.getAll().slice(0, 5);
    this.recentTeachers = this.teachers.getAll().slice(0, 5);
    this.recentActivities = (await this.activities.getAllActivities()).slice(0, 5);
    this.recentAnnouncements = allAnnouncements.slice(0, 5);

    this.cdr.detectChanges();
  }
}
