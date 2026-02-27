import { Component, OnDestroy, OnInit, inject, PLATFORM_ID, ChangeDetectorRef } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Announcement, AnnouncementService } from '../../services/announcement.service';

@Component({
  selector: 'app-student-announcement',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './student-announcement.html',
  styleUrl: './student-announcement.scss',
})
export class StudentAnnouncement implements OnInit, OnDestroy {
  announcements: Announcement[] = [];
  private readonly platformId = inject(PLATFORM_ID);
  private refreshTimer?: number;
  private readonly onVisibility = () => {
    if (document.visibilityState === 'visible') void this.loadAnnouncements();
  };

  constructor(
    private readonly announcementService: AnnouncementService,
    private readonly cdr: ChangeDetectorRef,
  ) {
    if (isPlatformBrowser(this.platformId)) {
      document.addEventListener('visibilitychange', this.onVisibility);
      this.refreshTimer = window.setInterval(() => {
        void this.loadAnnouncements();
      }, 1000);
    }
  }

  ngOnInit(): void {
    void this.loadAnnouncements();
  }

  private async loadAnnouncements(): Promise<void> {
    try {
      this.announcements = await this.announcementService.getAllForStudents();
    } catch {
      this.announcements = [];
    }
    this.cdr.detectChanges();
  }

  ngOnDestroy(): void {
    if (isPlatformBrowser(this.platformId)) {
      if (this.refreshTimer != null) window.clearInterval(this.refreshTimer);
      document.removeEventListener('visibilitychange', this.onVisibility);
    }
  }
}
