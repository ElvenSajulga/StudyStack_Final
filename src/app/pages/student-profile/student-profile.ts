import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService, User } from '../../services/auth.service';

@Component({
  selector: 'app-student-profile',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './student-profile.html',
  styleUrl: './student-profile.scss',
})
export class StudentProfile {
  readonly user: User | undefined;

  constructor(private readonly auth: AuthService) {
    this.user = this.auth.getCurrentUser();
  }

  get studentID(): string | undefined {
    return this.user?.studentID;
  }

  get initials(): string {
    const name = this.user?.name?.trim();
    if (!name) return 'S';

    const parts = name.split(' ').filter(Boolean);
    if (!parts.length) return 'S';
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();

    const first = parts[0].charAt(0);
    const last = parts[parts.length - 1].charAt(0);
    return (first + last).toUpperCase();
  }
}