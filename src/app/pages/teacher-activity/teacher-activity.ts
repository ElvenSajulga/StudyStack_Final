import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Activity, ActivityService, ActivityType } from '../../services/activity.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-teacher-activity',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './teacher-activity.html',
  styleUrl: './teacher-activity.scss',
})
export class TeacherActivity implements OnInit {
  activities: Activity[] = [];

  form: {
    title: string;
    description: string;
    type: ActivityType;
    deadline: string;
    closeAt: string;
    maxPoints?: number;
  } = {
    title: '',
    description: '',
    type: 'quiz',
    deadline: '',
    closeAt: '',
  };

  constructor(
    private readonly activityService: ActivityService,
    private readonly auth: AuthService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    void this.loadActivities();
  }

  private get teacherID(): string | undefined {
    return this.auth.getCurrentUser()?.teacherID;
  }

  private async loadActivities(): Promise<void> {
    const id = this.teacherID;
    if (!id) {
      this.activities = [];
      this.cdr.detectChanges();
      return;
    }
    this.activities = await this.activityService.getActivitiesForTeacher(id);
    this.cdr.detectChanges();
  }

  async createActivity(): Promise<void> {
    const teacherID = this.teacherID;
    if (!teacherID) {
      alert('You must be logged in as a teacher.');
      return;
    }

    const title = (this.form.title ?? '').trim();
    const deadline = (this.form.deadline ?? '').trim();
    const closeAt = (this.form.closeAt ?? '').trim();
    if (!title || !deadline || !closeAt) {
      alert('Please fill in at least title, deadline, and close time.');
      return;
    }

    const deadlineDate = new Date(deadline);
    const closeAtDate = new Date(closeAt);

    if (closeAtDate <= deadlineDate) {
      alert('Close time must be after the deadline.');
      return;
    }

    await this.activityService.createActivity({
      title,
      description: (this.form.description ?? '').trim(),
      type: this.form.type,
      deadline: deadlineDate.toISOString(),
      closeAt: closeAtDate.toISOString(),
      teacherID,
      maxPoints: this.form.maxPoints,
    });

    this.form = {
      title: '',
      description: '',
      type: 'quiz',
      deadline: '',
      closeAt: '',
    };

    await this.loadActivities();
  }

  async deleteActivity(activityId: string): Promise<void> {
    if (!confirm('Delete this activity?')) return;
    await this.activityService.deleteActivity(activityId);
    await this.loadActivities();
  }
}
