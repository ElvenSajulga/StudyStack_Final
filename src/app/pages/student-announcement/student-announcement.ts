import { Component, OnDestroy, inject } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Announcement, AnnouncementService } from '../../services/announcement.service';
import { PLATFORM_ID } from '@angular/core';

@Component({
  selector: 'app-student-announcement',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './student-announcement.html',
  styleUrl: './student-announcement.scss',
})
export class StudentAnnouncement implements OnDestroy {
  announcements: Announcement[] = [];
  private readonly platformId = inject(PLATFORM_ID);
  private refreshTimer?: number;
  private readonly onVisibility = () => {
    if (document.visibilityState === 'visible') void this.loadAnnouncements();
  };

  constructor(private readonly announcementService: AnnouncementService) {
    void this.loadAnnouncements();

    if (isPlatformBrowser(this.platformId)) {
      document.addEventListener('visibilitychange', this.onVisibility);
      this.refreshTimer = window.setInterval(() => {
        void this.loadAnnouncements();
      }, 1000);
    }
  }

  private async loadAnnouncements(): Promise<void> {
    try {
      this.announcements = await this.announcementService.getAllForStudents();
    } catch {
      this.announcements = [];
    }
  }

  ngOnDestroy(): void {
    if (isPlatformBrowser(this.platformId)) {
      if (this.refreshTimer != null) window.clearInterval(this.refreshTimer);
      document.removeEventListener('visibilitychange', this.onVisibility);
    }
  }
}
