import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AcademicCalendarService, AcademicCalendar } from '../../services/academic-calendar.service';
import Swal from 'sweetalert2';

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

  constructor(private readonly academicCalendarService: AcademicCalendarService) {}

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
    // Simulate saving to backend
    void Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'success',
      title: 'Settings saved',
      showConfirmButton: false,
      timer: 2000,
      timerProgressBar: true,
    });

    // Update the original settings snapshot
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

      void Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: 'Academic calendar saved',
        showConfirmButton: false,
        timer: 2000,
        timerProgressBar: true,
      });
    } catch {
      void Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'error',
        title: 'Failed to save calendar',
        showConfirmButton: false,
        timer: 2000,
        timerProgressBar: true,
      });
    }
  }

  async resetAcademicData(): Promise<void> {
    const result = await Swal.fire({
      icon: 'warning',
      title: 'Reset all academic data?',
      text: 'This action cannot be undone. Type "RESET" to confirm.',
      input: 'text',
      inputPlaceholder: 'Type RESET to confirm',
      showCancelButton: true,
      confirmButtonText: 'Reset',
      confirmButtonColor: '#ef4444',
      inputValidator: (value) => {
        if (!value || value !== 'RESET') {
          return 'You must type "RESET" to confirm';
        }
        return null;
      },
    });

    if (!result.isConfirmed) return;

    // Placeholder for actual implementation
    console.warn('Resetting all academic data...');

    void Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'success',
      title: 'Academic data reset',
      showConfirmButton: false,
      timer: 2000,
      timerProgressBar: true,
    });
  }
}
