import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Activity, ActivityService, ActivitySubmission } from '../../services/activity.service';
import { AuthService } from '../../services/auth.service';
import { StudentAccount, StudentAccountService } from '../../services/student-account.service';

@Component({
  selector: 'app-teacher-class-record',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './teacher-class-record.html',
  styleUrl: './teacher-class-record.scss',
})
export class TeacherClassRecord {
  activities: Activity[] = [];
  students: StudentAccount[] = [];
  private submissionsByKey: Record<string, ActivitySubmission | undefined> = {};

  constructor(
    private readonly activityService: ActivityService,
    private readonly auth: AuthService,
    private readonly studentService: StudentAccountService,
  ) {
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
      return;
    }
    this.activities = await this.activityService.getActivitiesForTeacher(id);
    this.students = this.studentService.getAll();

    const activityIds = this.activities.map(a => a.id);
    const subs = await this.activityService.getSubmissionsForActivities(activityIds);
    this.submissionsByKey = {};
    for (const sub of subs) {
      this.submissionsByKey[this.submissionKey(sub.activityId, sub.studentID)] = sub;
    }
  }

  submissionsForStudent(student: StudentAccount): ActivitySubmission[] {
    return this.activities
      .map(a => this.submissionsByKey[this.submissionKey(a.id, student.studentID)])
      .filter((s): s is ActivitySubmission => !!s);
  }

  totalScoreForStudent(student: StudentAccount): number {
    return this.submissionsForStudent(student)
      .reduce((sum, s) => sum + (s.score ?? 0), 0);
  }

  scoreFor(student: StudentAccount, activity: Activity): number | undefined {
    return this.submissionsByKey[this.submissionKey(activity.id, student.studentID)]?.score;
  }
}
