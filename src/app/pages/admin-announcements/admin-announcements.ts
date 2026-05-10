import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Announcement, AnnouncementService } from '../../services/announcement.service';
import { AcademicService, Program } from '../../services/academic.service';
import { StudentAccount, StudentAccountService } from '../../services/student-account.service';
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

  // Audience targeting
  targetAudience: 'all' | 'all-students' | 'all-teachers' | 'program' | 'specific-teachers' | 'specific-students' = 'all-students';

  allPrograms: Program[] = [];
  allTeachers: any[] = [];
  allStudents: StudentAccount[] = [];

  selectedPrograms: Set<string> = new Set();
  selectedTeachers: Set<string> = new Set();
  selectedStudents: Set<string> = new Set();

  filteredTeachers: any[] = [];
  filteredStudents: StudentAccount[] = [];

  teacherSearchQuery = '';
  studentSearchQuery = '';
  messageTemplates = [
    { id: 'none', label: 'No template', title: '', message: '' },
    { id: 'maintenance', label: 'System Maintenance', title: 'System Maintenance Notice', message: 'Please be advised that the portal will undergo maintenance. Services may be temporarily unavailable during the maintenance window.' },
    { id: 'exam', label: 'Exam Reminder', title: 'Exam Reminder', message: 'This is a reminder to prepare for your upcoming examinations. Please check your course schedules and coordinate with your instructors.' },
    { id: 'deadline', label: 'Deadline Reminder', title: 'Important Deadline Reminder', message: 'Please complete and submit all pending academic requirements before the posted deadline to avoid penalties.' },
  ];
  selectedTemplate = 'none';

  constructor(
    private readonly announcementService: AnnouncementService,
    private readonly academic: AcademicService,
    private readonly teacherService: TeacherAccountService,
    private readonly studentService: StudentAccountService,
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
    await this.teacherService.reloadFromServer();
    this.announcements = await this.announcementService.getAllForStudents();
    this.programs = await this.academic.getPrograms();
    this.allPrograms = this.programs;
    await this.studentService.reloadFromServer();
    this.allStudents = this.studentService.getAll();
    this.filteredStudents = this.allStudents;
    this.allTeachers = this.teacherService.getAll();
    this.filteredTeachers = this.allTeachers;
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

      return { announcement, postedBy, dateFormatted, messageTruncated };
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
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
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

  // ── Audience targeting ────────────────────────────────────────────────────

  onAudienceChange(): void {
    this.selectedPrograms.clear();
    this.selectedTeachers.clear();
    this.selectedStudents.clear();
    this.teacherSearchQuery = '';
    this.studentSearchQuery = '';
  }

  applyTemplate(templateId: string): void {
    const template = this.messageTemplates.find(t => t.id === templateId);
    if (!template || template.id === 'none') return;
    if (!this.addForm.title) {
      this.addForm.title = template.title;
    }
    if (!this.addForm.message) {
      this.addForm.message = template.message;
    }
  }

  get selectedCount(): number {
    if (this.targetAudience === 'program') return this.selectedPrograms.size;
    if (this.targetAudience === 'specific-teachers') return this.selectedTeachers.size;
    if (this.targetAudience === 'specific-students') return this.selectedStudents.size;
    return 0;
  }

  toggleProgram(programId: string): void {
    if (this.selectedPrograms.has(programId)) {
      this.selectedPrograms.delete(programId);
    } else {
      this.selectedPrograms.add(programId);
    }
  }

  toggleTeacher(teacherUid: string): void {
    if (this.selectedTeachers.has(teacherUid)) {
      this.selectedTeachers.delete(teacherUid);
    } else {
      this.selectedTeachers.add(teacherUid);
    }
  }

  filterTeachers(): void {
    if (!this.teacherSearchQuery.trim()) {
      this.filteredTeachers = this.allTeachers;
      return;
    }
    const q = this.teacherSearchQuery.toLowerCase();
    this.filteredTeachers = this.allTeachers.filter(t =>
      t.firstname.toLowerCase().includes(q) ||
      t.lastname.toLowerCase().includes(q) ||
      t.email.toLowerCase().includes(q)
    );
  }

  filterStudents(): void {
    if (!this.studentSearchQuery.trim()) {
      this.filteredStudents = this.allStudents;
      return;
    }
    const q = this.studentSearchQuery.toLowerCase();
    this.filteredStudents = this.allStudents.filter(s =>
      s.firstname.toLowerCase().includes(q) ||
      s.lastname.toLowerCase().includes(q) ||
      s.studentID.toLowerCase().includes(q) ||
      s.email.toLowerCase().includes(q)
    );
  }

  toggleStudent(uid: string): void {
    if (this.selectedStudents.has(uid)) {
      this.selectedStudents.delete(uid);
    } else {
      this.selectedStudents.add(uid);
    }
  }

  isStudentSelected(uid: string): boolean {
    return this.selectedStudents.has(uid);
  }

  // ── Create announcement ───────────────────────────────────────────────────

  createAnnouncement(): void {
    const f = this.addForm;
    if (!f.title || !f.message) {
      this.toast('error', 'Please fill in title and message');
      return;
    }

    let recipients: string[] = [];

    switch (this.targetAudience) {
      case 'all':
        recipients = [...this.allTeachers.map((t: any) => t.uid || t.UID), ...this.allStudents.map(s => s.UID)];
        break;
      case 'all-students':
        recipients = this.allStudents.map(s => s.UID);
        break;
      case 'all-teachers':
        recipients = this.allTeachers.map((t: any) => t.uid || t.UID);
        break;
      case 'program':
        if (this.selectedPrograms.size === 0) {
          this.toast('error', 'Select at least one program');
          return;
        }
        const studentsInPrograms = this.allStudents.filter(s => this.selectedPrograms.has(s.program || ''));
        recipients = studentsInPrograms.map(s => s.UID);
        break;
      case 'specific-teachers':
        if (this.selectedTeachers.size === 0) {
          this.toast('error', 'Select at least one teacher');
          return;
        }
        recipients = Array.from(this.selectedTeachers);
        break;
      case 'specific-students':
        if (this.selectedStudents.size === 0) {
          this.toast('error', 'Select at least one student');
          return;
        }
        recipients = Array.from(this.selectedStudents);
        break;
    }

    this.announcementService.create('ADMIN', f.title, f.message).then(
      () => {
        this.addForm = this.emptyAddForm();
        this.targetAudience = 'all-students';
        this.selectedPrograms.clear();
        this.selectedTeachers.clear();
        this.selectedStudents.clear();
        this.teacherSearchQuery = '';
        this.studentSearchQuery = '';
        this.toast('success', 'Announcement created successfully');
        void this.loadAll();
      },
      (error: unknown) => {
        this.toast('error', (error as { message?: string })?.message ?? 'Failed to create announcement');
      },
    );
  }

  // ── Delete ────────────────────────────────────────────────────────────────

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
