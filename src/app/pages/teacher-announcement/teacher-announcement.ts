import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Announcement, AnnouncementService } from '../../services/announcement.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-teacher-announcement',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './teacher-announcement.html',
  styleUrl: './teacher-announcement.scss',
})
export class TeacherAnnouncement implements OnInit {
  announcements: Announcement[] = [];
  title = '';
  message = '';

  constructor(
    private readonly announcementService: AnnouncementService,
    private readonly auth: AuthService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    void this.loadAnnouncements();
  }

  private get teacherID(): string | undefined {
    return this.auth.getCurrentUser()?.teacherID;
  }

  private async loadAnnouncements(): Promise<void> {
    const id = this.teacherID;
    if (!id) {
      this.announcements = [];
      this.cdr.detectChanges();
      return;
    }
    this.announcements = await this.announcementService.getForTeacher(id);
    this.cdr.detectChanges();
  }

  async createAnnouncement(): Promise<void> {
    const id = this.teacherID;
    if (!id) {
      alert('You must be logged in as a teacher.');
      return;
    }

    if (!this.title.trim() || !this.message.trim()) {
      alert('Please enter a title and message.');
      return;
    }

    await this.announcementService.create(id, this.title.trim(), this.message.trim());
    this.title = '';
    this.message = '';
    await this.loadAnnouncements();
  }

  async deleteAnnouncement(id: string | number): Promise<void> {
    if (!confirm('Delete this announcement?')) return;
    await this.announcementService.delete(id);
    await this.loadAnnouncements();
  }
}