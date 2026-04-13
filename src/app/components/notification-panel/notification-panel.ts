import { Component, OnInit, OnDestroy, inject, PLATFORM_ID, ChangeDetectorRef } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { AppNotification, NotificationService } from '../../services/notification.service';
import { AuthService } from '../../services/auth.service';
import { StudentAccountService } from '../../services/student-account.service';

@Component({
  selector: 'app-notification-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './notification-panel.html',
  styleUrl: './notification-panel.scss',
})
export class NotificationPanel implements OnInit, OnDestroy {
  notifications: AppNotification[] = [];
  isOpen = false;
  private readonly platformId = inject(PLATFORM_ID);
  private refreshTimer?: number;

  constructor(
    private readonly notificationService: NotificationService,
    private readonly auth: AuthService,
    private readonly studentService: StudentAccountService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    void this.loadNotifications();
    if (isPlatformBrowser(this.platformId)) {
      this.refreshTimer = window.setInterval(() => void this.loadNotifications(), 15000);
    }
  }

  ngOnDestroy(): void {
    if (isPlatformBrowser(this.platformId) && this.refreshTimer != null) {
      window.clearInterval(this.refreshTimer);
    }
  }

  private get userUID(): string | undefined {
    const user = this.auth.getCurrentUser();
    if (!user) return undefined;
    if (user.role === 'student') {
      const all = this.studentService.getAll();
      return all.find(s => s.studentID === user.studentID)?.UID;
    }
    return undefined; // only students get notifications for now
  }

  async loadNotifications(): Promise<void> {
    const uid = this.userUID;
    if (!uid) { this.notifications = []; return; }
    this.notifications = await this.notificationService.getForUser(uid);
    this.cdr.detectChanges();
  }

  get unreadCount(): number {
    return this.notifications.filter(n => !n.read).length;
  }

  togglePanel(): void {
    this.isOpen = !this.isOpen;
    if (this.isOpen && this.unreadCount > 0) {
      void this.markAllRead();
    }
  }

  async markAllRead(): Promise<void> {
    const uid = this.userUID;
    if (!uid) return;
    await this.notificationService.markAllAsRead(uid);
    this.notifications = this.notifications.map(n => ({ ...n, read: true }));
    this.cdr.detectChanges();
  }

  formatTime(iso: string): string {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    return d.toLocaleDateString();
  }
}