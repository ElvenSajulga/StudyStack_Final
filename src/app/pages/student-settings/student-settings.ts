import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import Swal from 'sweetalert2';

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

  constructor(private readonly auth: AuthService) {}

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
      void Swal.fire({
        icon: 'success',
        title: 'Settings saved',
        timer: 1500,
        showConfirmButton: false,
      });
    } catch {
      void Swal.fire({
        icon: 'error',
        title: 'Failed to save settings',
        timer: 1500,
        showConfirmButton: false,
      });
    }
  }

  sendPasswordReset(): void {
    void Swal.fire({
      icon: 'info',
      title: 'Password reset email sent',
      text: 'Check your inbox for further instructions.',
      timer: 2500,
      showConfirmButton: false,
    });
  }
}
