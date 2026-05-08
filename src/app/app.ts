import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from './services/auth.service';
import { BadgeService, StudentBadges, TeacherBadges } from './services/badge.service';
import { NotificationPanel } from './components/notification-panel/notification-panel';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, NotificationPanel],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit, OnDestroy {
  academicOpen = false;
  studentBadges: StudentBadges = { activities: 0, grades: 0, announcements: 0 };
  teacherBadges: TeacherBadges = { activities: 0 };
  userEmail = '';

  constructor(
    public readonly auth: AuthService,
    private readonly router: Router,
    private readonly badgeService: BadgeService,
  ) {
    this.loadUserEmail();
  }

  ngOnInit(): void {
    this.badgeService.start();
    this.syncBadges();
  }

  ngOnDestroy(): void {
    this.badgeService.stop();
  }

  private loadUserEmail(): void {
    const userStr = localStorage.getItem('currentUser');
    if (userStr) {
      const user = JSON.parse(userStr);
      this.userEmail = user.email || '';
    }
  }

  toggleAcademic(): void {
    this.academicOpen = !this.academicOpen;
  }

  private syncBadges(): void {
    setInterval(() => {
      this.studentBadges = this.badgeService.studentBadges;
      this.teacherBadges = this.badgeService.teacherBadges;
    }, 1000);
  }

  getInitials(name: string | undefined): string {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/);
    return parts.map(p => p[0]).join('').toUpperCase().slice(0, 2);
  }

  onAnnouncementsClick(): void {
    const user = this.auth.getCurrentUser();
    if (user?.role === 'student' && user.studentID) {
      const studentAccounts = (this as any).badgeService.constructor.name; // Quick way to check
      // Mark announcements as seen - this will be called when user navigates to announcements
      // The component will also call this
    }
  }

  navigateToProfile(role: string): void {
    switch (role) {
      case 'student':
        void this.router.navigate(['/student-profile']);
        break;
      case 'teacher':
        void this.router.navigate(['/teacher-profile']);
        break;
      case 'admin':
        void this.router.navigate(['/admin-profile']);
        break;
    }
  }

  async logout(): Promise<void> {
    const res = await Swal.fire({
      icon: 'question',
      title: 'Logout?',
      text: 'Are you sure you want to logout?',
      showCancelButton: true,
      confirmButtonText: 'Logout',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#ef4444',
    });

    if (!res.isConfirmed) return;

    this.auth.clear();
    await this.router.navigate(['/login']);

    void Swal.fire({
      icon: 'success',
      title: 'Logged out',
      toast: true,
      position: 'top-end',
      timer: 1400,
      showConfirmButton: false,
      timerProgressBar: true,
    });
  }
}