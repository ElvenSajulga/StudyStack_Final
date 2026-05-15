import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TeacherAccount, TeacherAccountService } from '../../services/teacher-account.service';
import { AcademicService, Faculty } from '../../services/academic.service';
import { AuditLogService } from '../../services/audit-log.service';
import { AuthService } from '../../services/auth.service';
import { AdminNotificationService } from '../../services/admin-notification.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-admin-teachers',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-teachers.html',
  styleUrl: './admin-teachers.scss',
})
export class AdminTeachers implements OnInit {
  teachers: TeacherAccount[] = [];
  faculties: Faculty[] = [];

  addForm: Partial<TeacherAccount> & { facultyId?: string } = this.emptyAddForm();

  showEditModal = false;
  editingUID = '';
  editForm: Partial<TeacherAccount> & { facultyId?: string } = {};

  loading = false;

  // Search, Sort, and Pagination
  searchQuery = '';
  statusFilter: 'all' | 'active' | 'inactive' = 'all';
  facultyFilter = '';
  sortField = 'lastname';
  sortDir: 'asc' | 'desc' = 'asc';
  pageSizeOptions = [10, 15, 25, 50];
  pageSize = 15;
  currentPage = 1;

  // Bulk status management
  selectedTeacherUIDs = new Set<string>();

  constructor(
    private readonly teacherService: TeacherAccountService,
    private readonly academic: AcademicService,
    private readonly auditLog: AuditLogService,
    private readonly auth: AuthService,
    private readonly adminNotification: AdminNotificationService,
    private readonly toastService: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    void this.loadAll();
  }

  private emptyAddForm() {
    return {
      UID: '',
      name: '',
      teacherID: '',
      password: '', 
      email: '',
      status: 'active' as const,
      lastname: '',
      firstname: '',
      middlename: '',
      facultyId: '',
    };
  }

  private toast(icon: 'success' | 'error', title: string): void {
    if (icon === 'success') this.toastService.success(title);
    else this.toastService.error(title);
  }

  private async loadAll(): Promise<void> {
    this.loading = true;
    await this.teacherService.reloadFromServer();
    this.teachers = this.teacherService.getAll();
    this.faculties = await this.academic.getFaculties();
    this.loading = false;
    this.cdr.detectChanges();
  }

  get totalTeachers(): number {
    return this.teacherService.getCount();
  }

  // Getters for search, sort, and pagination
  get filteredRecords(): TeacherAccount[] {
    const query = this.searchQuery.toLowerCase().trim();
    return this.teachers.filter(t => {
      const matchesQuery = !query ||
        t.firstname.toLowerCase().includes(query) ||
        t.lastname.toLowerCase().includes(query) ||
        t.teacherID.toLowerCase().includes(query);
      const matchesStatus = this.statusFilter === 'all' || t.status === this.statusFilter;
      const matchesFaculty = !this.facultyFilter || t.facultyId === this.facultyFilter;
      return matchesQuery && matchesStatus && matchesFaculty;
    });
  }

  get sortedRecords(): TeacherAccount[] {
    const records = [...this.filteredRecords];
    const field = this.sortField as keyof TeacherAccount;

    records.sort((a, b) => {
      let aVal: any = a[field];
      let bVal: any = b[field];

      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;

      // Convert to lowercase for string comparison
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }

      if (aVal < bVal) return this.sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return this.sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return records;
  }

  get totalPages(): number {
    return Math.ceil(this.sortedRecords.length / this.pageSize);
  }

  get paginatedRecords(): TeacherAccount[] {
    const start = (this.currentPage - 1) * this.pageSize;
    const end = start + this.pageSize;
    return this.sortedRecords.slice(start, end);
  }

  get displayCount(): { start: number; end: number; total: number } {
    const total = this.sortedRecords.length;
    if (total === 0) return { start: 0, end: 0, total: 0 };
    const start = (this.currentPage - 1) * this.pageSize + 1;
    const end = Math.min(this.currentPage * this.pageSize, total);
    return { start, end, total };
  }

  sortBy(field: string): void {
    if (this.sortField === field) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortField = field;
      this.sortDir = 'asc';
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
    }
  }

  prevPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
    }
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
    }
  }

  onSearchChange(): void {
    this.currentPage = 1;
  }

  onFiltersChange(): void {
    this.currentPage = 1;
  }

  onPageSizeChange(): void {
    this.currentPage = 1;
  }

  facultyName(facultyId?: string): string {
    if (!facultyId) return '—';
    return this.faculties.find(f => f.id === facultyId)?.name ?? '—';
  }

  // ── add ───────────────────────────────────────────────────────────────────

  addTeacher(): void {
    const f = this.addForm;
    if (!f.UID || !f.password || !f.teacherID || !f.lastname || !f.firstname) {
      this.toast('error', 'Please fill in UID, Password, Teacher ID, Lastname, and Firstname');
      return;
    }

    f.name = `${f.firstname} ${f.lastname}`.trim();

    try {
      this.teacherService.add(f as TeacherAccount).subscribe({
        next: () => {
          const actor = this.auth.getCurrentUser();
          void this.auditLog.log({
            actorUID: actor?.UID ?? 'unknown',
            actorName: actor?.name ?? 'Unknown Admin',
            action: 'create',
            entityType: 'teacher',
            entityId: f.UID ?? '',
            description: `Added teacher ${f.firstname} ${f.lastname} (ID: ${f.teacherID})`,
            timestamp: new Date().toISOString(),
          });
          void this.adminNotification.createNotification({
            recipientUID: 'admin',
            type: 'teacher_registered',
            title: 'New teacher registered',
            message: `${f.firstname} ${f.lastname} (${f.teacherID}) has been registered`,
            isRead: false,
            relatedId: f.UID,
            relatedName: `${f.firstname} ${f.lastname}`,
          });
          this.addForm = this.emptyAddForm();
          this.toast('success', 'Teacher added successfully');
          void this.loadAll();
        },
        error: (e: unknown) => {
          this.toast('error', (e as { message?: string })?.message ?? 'Failed to add teacher');
        },
      });
    } catch (e: unknown) {
      this.toast('error', (e as { message?: string })?.message ?? 'Failed to add teacher');
    }
  }

  // ── edit ──────────────────────────────────────────────────────────────────

  openEdit(t: TeacherAccount): void {
    this.editingUID = t.UID;
    this.editForm = {
      UID: t.UID,
      teacherID: t.teacherID,
      firstname: t.firstname,
      lastname: t.lastname,
      middlename: t.middlename,
      email: t.email,
      status: t.status,
      password: t.password,
      facultyId: t.facultyId ?? '',
    };
    this.showEditModal = true;
    this.cdr.detectChanges();
  }

  closeEdit(): void {
    this.showEditModal = false;
    this.editingUID = '';
  }

  saveEdit(): void {
    const f = this.editForm;
    if (!f.firstname || !f.lastname || !f.teacherID) {
      this.toast('error', 'Firstname, Lastname, and Teacher ID are required');
      return;
    }

    const changes: Partial<TeacherAccount> & { facultyId?: string } = {
      firstname: f.firstname,
      lastname: f.lastname,
      middlename: f.middlename ?? '',
      name: `${f.firstname} ${f.lastname}`.trim(),
      teacherID: f.teacherID ?? '',
      email: f.email ?? '',
      status: f.status ?? 'active',
      password: f.password ?? '',
      facultyId: f.facultyId ?? '',
    };

    try {
      this.teacherService.update(this.editingUID, changes);
      this.toast('success', 'Teacher updated successfully');
      this.closeEdit();
      void this.loadAll();
    } catch {
      this.toast('error', 'Failed to update teacher');
    }
  }

  // ── remove ────────────────────────────────────────────────────────────────

  async removeTeacher(uid: string): Promise<void> {
    const ok = await this.toastService.confirmDestructive('Remove teacher?', {
      text: 'This action cannot be undone.',
      confirmText: 'Remove',
    });
    if (!ok) return;

    const teacher = this.teachers.find(t => t.UID === uid);
    this.teacherService.remove(uid).subscribe({
      next: () => {
        const actor = this.auth.getCurrentUser();
        void this.auditLog.log({
          actorUID: actor?.UID ?? 'unknown',
          actorName: actor?.name ?? 'Unknown Admin',
          action: 'delete',
          entityType: 'teacher',
          entityId: uid,
          description: `Removed teacher ${teacher?.firstname} ${teacher?.lastname} (ID: ${teacher?.teacherID})`,
          timestamp: new Date().toISOString(),
        });
        this.toast('success', 'Teacher removed');
        void this.loadAll();
      },
      error: (e: unknown) => {
        this.toast('error', (e as { message?: string })?.message ?? 'Failed to remove teacher');
      },
    });
  }

  // ── Bulk Status Management ─────────────────────────────────────────────────

  toggleSelectTeacher(uid: string): void {
    if (this.selectedTeacherUIDs.has(uid)) {
      this.selectedTeacherUIDs.delete(uid);
    } else {
      this.selectedTeacherUIDs.add(uid);
    }
  }

  toggleSelectAll(): void {
    if (this.selectedTeacherUIDs.size === this.paginatedRecords.length && this.selectedTeacherUIDs.size > 0) {
      this.selectedTeacherUIDs.clear();
    } else {
      this.paginatedRecords.forEach(t => this.selectedTeacherUIDs.add(t.UID));
    }
  }

  get isAllSelectedOnPage(): boolean {
    return this.paginatedRecords.length > 0 && this.paginatedRecords.every(t => this.selectedTeacherUIDs.has(t.UID));
  }

  async bulkSetStatus(status: 'active' | 'inactive'): Promise<void> {
    if (this.selectedTeacherUIDs.size === 0) return;

    const ok = await this.toastService.confirm(
      `Set ${this.selectedTeacherUIDs.size} teacher(s) to ${status}?`,
      { confirmColor: status === 'inactive' ? '#ef4444' : '#22c55e' },
    );

    if (!ok) return;

    try {
      for (const uid of Array.from(this.selectedTeacherUIDs)) {
        this.teacherService.update(uid, { status });
      }
      const count = this.selectedTeacherUIDs.size;
      this.selectedTeacherUIDs.clear();
      await this.loadAll();
      this.toast('success', `${count} teacher(s) updated`);
    } catch {
      this.toast('error', 'Failed to update teachers');
    }
  }

  // ── Individual Status & Password ────────────────────────────────────────────

  async toggleTeacherStatus(teacher: TeacherAccount): Promise<void> {
    const newStatus = teacher.status === 'active' ? 'inactive' : 'active';
    const ok = await this.toastService.confirm(
      `Set ${teacher.firstname} ${teacher.lastname} to ${newStatus}?`,
      { confirmColor: newStatus === 'inactive' ? '#ef4444' : '#22c55e' },
    );

    if (!ok) return;

    try {
      this.teacherService.update(teacher.UID, { status: newStatus });
      await this.loadAll();
      this.toast('success', `Teacher status changed to ${newStatus}`);
    } catch {
      this.toast('error', 'Failed to update teacher status');
    }
  }

  async resetTeacherPassword(teacher: TeacherAccount): Promise<void> {
    const newPassword = await this.toastService.prompt('Reset password', {
      html: `<p>Enter a temporary password for <strong>${teacher.firstname} ${teacher.lastname}</strong></p>`,
      inputType: 'password',
      placeholder: 'Minimum 6 characters',
      inputAttributes: { minlength: '6' },
      confirmText: 'Reset',
    });

    if (!newPassword) return;

    try {
      this.teacherService.update(teacher.UID, { password: newPassword });
      this.toast('success', 'Password reset successfully');
    } catch {
      this.toast('error', 'Failed to reset password');
    }
  }
}