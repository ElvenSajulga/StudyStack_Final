import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Announcement, AnnouncementService } from '../../services/announcement.service';
import { AcademicService, Program } from '../../services/academic.service';
import { TeacherAccountService } from '../../services/teacher-account.service';
import Swal from 'sweetalert2';

interface AnnouncementRow {
  announcement: Announcement;
  postedBy: string;
  dateFormatted: string;
  messageTruncated: string;
}

@Component({
  selector: 'app-admin-announcements',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-announcements.html',
  styleUrl: './admin-announcements.scss',
})
export class AdminAnnouncements implements OnInit {
  announcements: Announcement[] = [];
  programs: Program[] = [];
  rows: AnnouncementRow[] = [];

  addForm = this.emptyAddForm();
  loading = false;

  constructor(
    private readonly announcementService: AnnouncementService,
    private readonly academic: AcademicService,
    private readonly teacherService: TeacherAccountService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    void this.loadAll();
  }

  private emptyAddForm() {
    return {
      title: '',
      message: '',
      audience: 'all-students' as 'all-students' | 'all-teachers' | 'program',
      programId: '',
    };
  }

  private toast(icon: 'success' | 'error', title: string): void {
    void Swal.fire({
      toast: true,
      position: 'top-end',
      icon,
      title,
      showConfirmButton: false,
      timer: 2000,
      timerProgressBar: true,
    });
  }

  private async loadAll(): Promise<void> {
    this.loading = true;
    this.announcements = await this.announcementService.getAllForStudents();
    this.programs = await this.academic.getPrograms();
    this.buildRows();
    this.loading = false;
    this.cdr.detectChanges();
  }

  private buildRows(): void {
    this.rows = this.announcements.map(announcement => {
      const postedBy = announcement.teacherID === 'ADMIN' ? 'System Admin' : this.getTeacherName(announcement.teacherID);
      const dateFormatted = this.formatDate(announcement.createdAt);
      const messageTruncated = announcement.message.length > 80
        ? announcement.message.substring(0, 80) + '...'
        : announcement.message;

      return {
        announcement,
        postedBy,
        dateFormatted,
        messageTruncated,
      };
    });
  }

  private getTeacherName(teacherID: string): string {
    const teacher = this.teacherService.getAll().find(t => t.teacherID === teacherID);
    return teacher ? `${teacher.firstname} ${teacher.lastname}` : teacherID;
  }

  private formatDate(isoString: string): string {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  }

  get totalAnnouncements(): number {
    return this.announcements.length;
  }

  programName(programId: string): string {
    if (!programId) return '—';
    return this.programs.find(p => p.id === programId)?.name ?? '—';
  }

  // ── add ───────────────────────────────────────────────────────────────────

  createAnnouncement(): void {
    const f = this.addForm;
    if (!f.title || !f.message) {
      this.toast('error', 'Please fill in title and message');
      return;
    }

    this.announcementService.create('ADMIN', f.title, f.message).then(
      () => {
        this.addForm = this.emptyAddForm();
        this.toast('success', 'Announcement created successfully');
        void this.loadAll();
      },
      (error: unknown) => {
        this.toast('error', (error as { message?: string })?.message ?? 'Failed to create announcement');
      },
    );
  }

  // ── delete ────────────────────────────────────────────────────────────────

  async deleteAnnouncement(id: string | number): Promise<void> {
    const res = await Swal.fire({
      icon: 'warning',
      title: 'Delete announcement?',
      text: 'This action cannot be undone.',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: '#ef4444',
    });
    if (!res.isConfirmed) return;

    try {
      await this.announcementService.delete(id);
      this.toast('success', 'Announcement deleted');
      void this.loadAll();
    } catch (error: unknown) {
      this.toast('error', (error as { message?: string })?.message ?? 'Failed to delete announcement');
    }
  }
}
