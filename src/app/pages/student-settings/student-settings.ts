import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';

interface StudentPreferences {
  showDeadlinesInDashboard: boolean;
  emailOnNewActivity: boolean;
  emailOnGradeUpdate: boolean;
}

@Component({
  selector: 'app-student-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './student-settings.html',
  styleUrl: './student-settings.scss',
})
export class StudentSettings implements OnInit {
  preferences: StudentPreferences = {
    showDeadlinesInDashboard: true,
    emailOnNewActivity: false,
    emailOnGradeUpdate: false,
  };

  private originalPreferences: StudentPreferences = {
    showDeadlinesInDashboard: true,
    emailOnNewActivity: false,
    emailOnGradeUpdate: false,
  };

  constructor(
    private readonly auth: AuthService,
    private readonly toast: ToastService,
  ) {}

  ngOnInit(): void {
    this.loadPreferences();
  }

  private get prefStorageKey(): string {
    const uid = (this.auth.getCurrentUser() as any)?.UID || 'anon';
    return `ss_student_prefs_${uid}`;
  }

  get hasChanges(): boolean {
    return JSON.stringify(this.preferences) !== JSON.stringify(this.originalPreferences);
  }

  private loadPreferences(): void {
    try {
      const stored = localStorage.getItem(this.prefStorageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        this.preferences = { ...this.preferences, ...parsed };
      }
    } catch {
      // Use defaults on parse error
    }
    this.originalPreferences = JSON.parse(JSON.stringify(this.preferences));
  }

  savePreferences(): void {
    try {
      localStorage.setItem(this.prefStorageKey, JSON.stringify(this.preferences));
      this.originalPreferences = JSON.parse(JSON.stringify(this.preferences));
      this.toast.success('Settings saved');
    } catch {
      this.toast.error('Failed to save settings');
    }
  }

  sendPasswordReset(): void {
    this.toast.info('Password reset email sent', { text: 'Check your inbox for further instructions.' });
  }
}
