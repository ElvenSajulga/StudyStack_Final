import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';

interface TeacherPreferences {
  showUpcomingActivities: boolean;
  emailOnSubmit: boolean;
  emailOnClose: boolean;
}

@Component({
  selector: 'app-teacher-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './teacher-settings.html',
  styleUrl: './teacher-settings.scss',
})
export class TeacherSettings implements OnInit {
  preferences: TeacherPreferences = {
    showUpcomingActivities: true,
    emailOnSubmit: false,
    emailOnClose: false,
  };
  originalPreferences: TeacherPreferences = { ...this.preferences };

  constructor(
    private readonly auth: AuthService,
    private readonly toast: ToastService,
  ) {}

  ngOnInit(): void {
    this.loadPreferences();
  }

  private get teacherUID(): string | undefined {
    return (this.auth.getCurrentUser() as unknown as { UID?: string })?.UID;
  }

  get hasChanges(): boolean {
    return JSON.stringify(this.preferences) !== JSON.stringify(this.originalPreferences);
  }

  loadPreferences(): void {
    const uid = this.teacherUID;
    if (!uid) return;

    const key = `ss_teacher_prefs_${uid}`;
    const stored = localStorage.getItem(key);

    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        this.preferences = { ...this.preferences, ...parsed };
        this.originalPreferences = { ...this.preferences };
      } catch {
        // Keep defaults on parse error
        this.originalPreferences = { ...this.preferences };
      }
    } else {
      this.originalPreferences = { ...this.preferences };
    }
  }

  savePreferences(): void {
    const uid = this.teacherUID;
    if (!uid) return;

    const key = `ss_teacher_prefs_${uid}`;
    localStorage.setItem(key, JSON.stringify(this.preferences));
    this.originalPreferences = { ...this.preferences };
    this.toast.success('Settings saved');
  }

  sendPasswordReset(): void {
    this.toast.info('Password reset email sent', {
      text: 'Check your email for instructions on how to reset your password.',
    });
  }

  getThumbClass(value: boolean): string {
    return value ? 'thumb-on' : 'thumb-off';
  }
}
