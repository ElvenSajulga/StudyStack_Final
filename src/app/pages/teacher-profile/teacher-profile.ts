import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService, User } from '../../services/auth.service';

@Component({
  selector: 'app-teacher-profile',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './teacher-profile.html',
  styleUrl: './teacher-profile.scss',
})
export class TeacherProfile {
  readonly user: User | undefined;

  constructor(private readonly auth: AuthService) {
    this.user = this.auth.getCurrentUser();
  }

  get teacherID(): string | undefined {
    return this.user?.teacherID;
  }

  get initials(): string {
    const name = this.user?.name?.trim();
    if (!name) return 'T';

    const parts = name.split(' ').filter(Boolean);
    if (!parts.length) return 'T';
    if (parts.length === 1) {
      return parts[0].charAt(0).toUpperCase();
    }

    const first = parts[0].charAt(0);
    const last = parts[parts.length - 1].charAt(0);
    return (first + last).toUpperCase();
  }
}
