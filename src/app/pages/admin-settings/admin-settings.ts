import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AcademicCalendarService, AcademicCalendar } from '../../services/academic-calendar.service';
import { ToastService } from '../../services/toast.service';

interface Settings {
  general: {
    portalName: string;
    supportEmail: string;
    academicYear: string;
    defaultNewAccountStatus: 'active' | 'inactive';
  };
  preferences: {
    darkSidebarTheme: boolean;
    emailOnTeacherActivity: boolean;
    emailOnStudentEnroll: boolean;
  };
}

@Component({
  selector: 'app-admin-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-settings.html',
  styleUrl: './admin-settings.scss',
})
export class AdminSettings implements OnInit {
  settings: Settings = {
    general: {
      portalName: 'StudyStack Admin Portal',
      supportEmail: 'support@example.com',
      academicYear: '2025–2026',
      defaultNewAccountStatus: 'active',
    },
    preferences: {
      darkSidebarTheme: true,
      emailOnTeacherActivity: false,
      emailOnStudentEnroll: false,
    },
  };

  calendar: AcademicCalendar | null = null;
  private originalCalendar: AcademicCalendar | null = null;
  private originalSettings: Settings | null = null;

  constructor(
    private readonly academicCalendarService: AcademicCalendarService,
    private readonly toast: ToastService,
  ) {}

  ngOnInit(): void {
    this.originalSettings = JSON.parse(JSON.stringify(this.settings));
    void this.loadCalendar();
  }

  private async loadCalendar(): Promise<void> {
    this.calendar = await this.academicCalendarService.get();
    if (this.calendar) {
      this.originalCalendar = JSON.parse(JSON.stringify(this.calendar));
    } else {
      // Initialize with empty calendar if none exists
      this.calendar = {
        id: 'config',
        academicYear: '',
        sem1Start: '',
        sem1End: '',
        sem2Start: '',
        sem2End: '',
        enrollmentOpen: '',
        enrollmentClose: '',
        updatedAt: '',
      };
    }
  }

  get hasChanges(): boolean {
    if (!this.originalSettings) return false;
    return JSON.stringify(this.settings) !== JSON.stringify(this.originalSettings);
  }

  get hasCalendarChanges(): boolean {
    if (!this.calendar || !this.originalCalendar) return false;
    const calendarCopy = { ...this.calendar };
    delete (calendarCopy as Partial<AcademicCalendar>).updatedAt;
    const originalCopy = { ...this.originalCalendar };
    delete (originalCopy as Partial<AcademicCalendar>).updatedAt;
    return JSON.stringify(calendarCopy) !== JSON.stringify(originalCopy);
  }

  saveSettings(): void {
    this.toast.success('Settings saved');
    this.originalSettings = JSON.parse(JSON.stringify(this.settings));
  }

  async saveCalendar(): Promise<void> {
    if (!this.calendar) return;

    try {
      await this.academicCalendarService.save({
        academicYear: this.calendar.academicYear,
        sem1Start: this.calendar.sem1Start,
        sem1End: this.calendar.sem1End,
        sem2Start: this.calendar.sem2Start,
        sem2End: this.calendar.sem2End,
        enrollmentOpen: this.calendar.enrollmentOpen,
        enrollmentClose: this.calendar.enrollmentClose,
      });

      this.originalCalendar = JSON.parse(JSON.stringify(this.calendar));
      this.toast.success('Academic calendar saved');
    } catch {
      this.toast.error('Failed to save calendar');
    }
  }

  async resetAcademicData(): Promise<void> {
    const value = await this.toast.prompt('Reset all academic data?', {
      text: 'This action cannot be undone. Type "RESET" to confirm.',
      placeholder: 'Type RESET to confirm',
      confirmText: 'Reset',
      confirmColor: '#ef4444',
      validator: (v) => (v === 'RESET' ? null : 'You must type "RESET" to confirm'),
    });

    if (value !== 'RESET') return;

    console.warn('Resetting all academic data...');
    this.toast.success('Academic data reset');
  }
}
