import { Component, OnInit, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AdminNotificationService, AdminNotification, NotificationType } from '../../services/admin-notification.service';
import { interval, Subscription } from 'rxjs';

@Component({
  selector: 'app-admin-notification-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-notification-panel.html',
  styleUrl: './admin-notification-panel.scss',
})
export class AdminNotificationPanel implements OnInit, OnDestroy {
  notifications: AdminNotification[] = [];
  unreadCount = 0;
  isOpen = false;
  private refreshSubscription?: Subscription;

  constructor(
    private readonly notificationService: AdminNotificationService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    void this.loadNotifications();
    // Refresh every 30 seconds
    this.refreshSubscription = interval(30000).subscribe(() => {
      void this.loadNotifications();
    });
  }

  ngOnDestroy(): void {
    if (this.refreshSubscription) {
      this.refreshSubscription.unsubscribe();
    }
  }

  async loadNotifications(): Promise<void> {
    this.notifications = await this.notificationService.getNotifications();
    this.unreadCount = await this.notificationService.getUnreadCount();
    this.cdr.detectChanges();
  }

  togglePanel(): void {
    this.isOpen = !this.isOpen;
  }

  closePanel(): void {
    this.isOpen = false;
  }

  async markAsRead(notification: AdminNotification): Promise<void> {
    if (!notification.isRead) {
      await this.notificationService.markAsRead(notification.id);
      await this.loadNotifications();
    }
  }

  async markAllAsRead(): Promise<void> {
    await this.notificationService.markAllAsRead();
    await this.loadNotifications();
  }

  getNotificationIcon(type: NotificationType): string {
    switch (type) {
      case 'student_registered': return 'ti-user-plus';
      case 'teacher_registered': return 'ti-user-check';
      case 'course_no_teacher': return 'ti-alert-circle';
      default: return 'ti-bell';
    }
  }

  getNotificationTitle(notification: AdminNotification): string {
    switch (notification.type) {
      case 'student_registered': return `New student registered`;
      case 'teacher_registered': return `New teacher registered`;
      case 'course_no_teacher': return `Course needs teacher`;
      default: return notification.title;
    }
  }

  getRelativeTime(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  }
}
