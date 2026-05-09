import {
  Component,
  OnInit,
  OnDestroy,
  ElementRef,
  HostListener,
  inject,
  PLATFORM_ID,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { AppNotification, NotificationService } from '../../services/notification.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-teacher-notification-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './teacher-notification-panel.html',
  styleUrl: './teacher-notification-panel.scss',
})
export class TeacherNotificationPanel implements OnInit, OnDestroy {
  notifications: AppNotification[] = [];
  isOpen = false;
  private readonly platformId = inject(PLATFORM_ID);
  private refreshTimer?: number;

  constructor(
    private readonly notificationService: NotificationService,
    private readonly auth: AuthService,
    private readonly elementRef: ElementRef<HTMLElement>,
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

  private get teacherUID(): string | undefined {
    const user = this.auth.getCurrentUser() as unknown as { UID?: string; role?: string } | null;
    if (!user || user.role !== 'teacher') return undefined;
    return user.UID;
  }

  async loadNotifications(): Promise<void> {
    const uid = this.teacherUID;
    if (!uid) {
      this.notifications = [];
      this.cdr.detectChanges();
      return;
    }
    this.notifications = await this.notificationService.getForUser(uid);
    this.cdr.detectChanges();
  }

  get unreadCount(): number {
    return this.notifications.filter(n => !n.read).length;
  }

  togglePanel(): void {
    this.isOpen = !this.isOpen;
  }

  async markAllRead(): Promise<void> {
    const uid = this.teacherUID;
    if (!uid) return;
    await this.notificationService.markAllAsRead(uid);
    this.notifications = this.notifications.map(n => ({ ...n, read: true }));
    this.cdr.detectChanges();
  }

  async onItemClick(n: AppNotification): Promise<void> {
    if (n.read) return;
    await this.notificationService.markAsRead(n.id);
    n.read = true;
    this.cdr.detectChanges();
  }

  iconForType(type: AppNotification['type']): string {
    switch (type) {
      case 'submission-received': return 'ti-file-check';
      case 'grading-pending':     return 'ti-clock-exclamation';
      case 'score-released':      return 'ti-award';
      case 'activity-created':    return 'ti-clipboard-list';
      case 'announcement':        return 'ti-speakerphone';
      default:                    return 'ti-bell';
    }
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
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  }

  trackById(_: number, n: AppNotification): string {
    return n.id;
  }

  @HostListener('document:click', ['$event'])
  handleDocumentClick(event: MouseEvent): void {
    if (!this.isOpen) return;
    const target = event.target as Node | null;
    if (target && !this.elementRef.nativeElement.contains(target)) {
      this.isOpen = false;
      this.cdr.detectChanges();
    }
  }
}
