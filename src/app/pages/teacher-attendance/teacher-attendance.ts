import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Activity, ActivityService, ActivitySubmission, AttendanceStatus } from '../../services/activity.service';
import { AuthService } from '../../services/auth.service';
import { StudentAccount, StudentAccountService } from '../../services/student-account.service';

@Component({
  selector: 'app-teacher-attendance',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './teacher-attendance.html',
  styleUrl: './teacher-attendance.scss',
})
export class TeacherAttendance implements OnInit {
  activities: Activity[] = [];
  students: StudentAccount[] = [];
  private submissionsByKey: Record<string, ActivitySubmission | undefined> = {};

  constructor(
    private readonly activityService: ActivityService,
    private readonly auth: AuthService,
    private readonly studentService: StudentAccountService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    void this.loadData();
  }

  private get teacherID(): string | undefined {
    return this.auth.getCurrentUser()?.teacherID;
  }

  private submissionKey(activityId: string, studentID: string): string {
    return `${activityId}::${studentID}`;
  }

  private async loadData(): Promise<void> {
    const id = this.teacherID;
    if (!id) {
      this.activities = [];
      this.students = [];
      this.submissionsByKey = {};
      this.cdr.detectChanges();
      return;
    }

    await this.studentService.reloadFromServer();
    this.activities = await this.activityService.getActivitiesForTeacher(id);
    this.students = this.studentService.getAll();

    const activityIds = this.activities.map(a => a.id);
    const subs = await this.activityService.getSubmissionsForActivities(activityIds);
    this.submissionsByKey = {};
    for (const sub of subs) {
      this.submissionsByKey[this.submissionKey(sub.activityId, sub.studentID)] = sub;
    }
    this.cdr.detectChanges();
  }

  attendanceStatus(activity: Activity, student: StudentAccount): AttendanceStatus {
    const submission = this.submissionsByKey[this.submissionKey(activity.id, student.studentID)];
    return this.activityService.getAttendanceStatus(activity, submission);
  }
}