import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivityService, ActivitySubmission, AttendanceStatus } from '../../../services/activity.service';
import { Announcement, AnnouncementService } from '../../../services/announcement.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-student-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './student-dashboard.html',
  styleUrl: './student-dashboard.scss',
})
export class StudentDashboard implements OnInit {
  presentCount = 0;
  lateCount = 0;
  absentCount = 0;
  openActivities = 0;
  latestAnnouncements: Announcement[] = [];

  constructor(
    private readonly activityService: ActivityService,
    private readonly announcementService: AnnouncementService,
    private readonly auth: AuthService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    void this.init();
  }

  private get studentID(): string | undefined {
    return this.auth.getCurrentUser()?.studentID;
  }

  private async init(): Promise<void> {
    await this.computeStats();
    const all = await this.announcementService.getAllForStudents();
    this.latestAnnouncements = all.slice(0, 3);
    this.cdr.detectChanges();
  }

  private async computeStats(): Promise<void> {
    const sid = this.studentID;
    const activities = await this.activityService.getAllActivities();

    this.presentCount = 0;
    this.lateCount = 0;
    this.absentCount = 0;
    this.openActivities = 0;

    const now = new Date();
    const submissionsByActivityId: Record<string, ActivitySubmission | undefined> = {};
    if (sid) {
      const subs = await this.activityService.getSubmissionsForStudent(sid);
      for (const sub of subs) {
        submissionsByActivityId[sub.activityId] = sub;
      }
    }

    for (const a of activities) {
      const closeAt = new Date(a.closeAt);
      if (now <= closeAt) {
        this.openActivities++;
      }

      if (!sid) continue;
      const status: AttendanceStatus = this.activityService.getAttendanceStatus(a, submissionsByActivityId[a.id]);
      if (status === 'present') this.presentCount++;
      if (status === 'late') this.lateCount++;
      if (status === 'absent') this.absentCount++;
    }
  }
}
