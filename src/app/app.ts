import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from './services/auth.service';
import { BadgeService, StudentBadges, TeacherBadges } from './services/badge.service';
import { ThemeService } from './services/theme.service';
import { NotificationPanel } from './components/notification-panel/notification-panel';
import { AdminNotificationPanel } from './components/admin-notification-panel/admin-notification-panel';
import { TeacherNotificationPanel } from './components/teacher-notification-panel/teacher-notification-panel';
import { AdminGlobalSearch } from './components/admin-global-search/admin-global-search';
import { ToastService } from './services/toast.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, NotificationPanel, AdminNotificationPanel, TeacherNotificationPanel, AdminGlobalSearch],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit, OnDestroy {
  academicOpen = false;
  sidebarOpen = false;
  studentBadges: StudentBadges = { activities: 0, grades: 0, announcements: 0 };
  teacherBadges: TeacherBadges = { activities: 0 };
  userEmail = '';

  constructor(
    public readonly auth: AuthService,
    private readonly router: Router,
    private readonly badgeService: BadgeService,
    public readonly themeService: ThemeService,
    private readonly toast: ToastService,
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

  toggleSidebar(): void {
    this.sidebarOpen = !this.sidebarOpen;
  }

  closeSidebar(): void {
    this.sidebarOpen = false;
  }

  toggleDarkMode(): void {
    this.themeService.toggleTheme();
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    this.closeSidebar();
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    if (window.innerWidth > 1024 && this.sidebarOpen) {
      this.sidebarOpen = false;
    }
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
      const studentAccounts = (this as any).badgeService.constructor.name;
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
    const ok = await this.toast.confirm('Logout?', {
      text: 'Are you sure you want to logout?',
      confirmText: 'Logout',
      confirmColor: '#ef4444',
    });

    if (!ok) return;

    this.auth.clear();
    await this.router.navigate(['/login']);

    this.toast.success('Logged out');
  }
}
