import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { StudentAccount, StudentAccountService } from '../../services/student-account.service';
import { AcademicService, Program, Section } from '../../services/academic.service';
import { AuditLogService } from '../../services/audit-log.service';
import { AuthService } from '../../services/auth.service';
import { AdminNotificationService } from '../../services/admin-notification.service';
import { CSVImportModal, CSVImportRow, CSVImportConfig } from '../../components/csv-import-modal/csv-import-modal';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-admin-students',
  standalone: true,
  imports: [CommonModule, FormsModule, CSVImportModal],
  templateUrl: './admin-students.html',
  styleUrl: './admin-students.scss',
})
export class AdminStudents implements OnInit {
  students: StudentAccount[] = [];
  programs: Program[] = [];
  sections: Section[] = [];

  addForm: Partial<StudentAccount> & { programId?: string; sectionId?: string } = this.emptyAddForm();

  showEditModal = false;
  editForm: Partial<StudentAccount> & { programId?: string; sectionId?: string } = {};
  editingUID = '';

  loading = false;

  // Search, Sort, and Pagination
  searchQuery = '';
  statusFilter: 'all' | 'active' | 'inactive' = 'all';
  programFilter = '';
  sortField = 'lastname';
  sortDir: 'asc' | 'desc' = 'asc';
  pageSizeOptions = [10, 15, 25, 50];
  pageSize = 15;
  currentPage = 1;

  // CSV Import
  showImportModal = false;
  csvImportConfig: CSVImportConfig = {
    templateFileName: 'students-template.csv',
    templateHeaders: ['firstname', 'lastname', 'middlename', 'studentID', 'email', 'status'],
    requiredFields: ['firstname', 'lastname', 'studentID', 'status'],
    entityType: 'student',
  };

  // Bulk status management
  selectedStudentUIDs = new Set<string>();

  constructor(
    private readonly studentService: StudentAccountService,
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
      program: '',
      programId: '',
      sectionId: '',
      studentID: '',
      password: '',
      email: '',
      status: 'active' as const,
      lastname: '',
      firstname: '',
      middlename: '',
    };
  }

  private toast(icon: 'success' | 'error', title: string): void {
    if (icon === 'success') this.toastService.success(title);
    else this.toastService.error(title);
  }

  private async loadAll(): Promise<void> {
    this.loading = true;
    await this.studentService.reloadFromServer();
    this.students = this.studentService.getAll();
    [this.programs, this.sections] = await Promise.all([
      this.academic.getPrograms(),
      this.academic.getSections(),
    ]);
    this.loading = false;
    this.cdr.detectChanges();
  }

  get totalStudents(): number {
    return this.studentService.getCount();
  }

  // Getters for search, sort, and pagination
  get filteredRecords(): StudentAccount[] {
    const query = this.searchQuery.toLowerCase().trim();
    return this.students.filter(s => {
      const matchesQuery = !query ||
        s.firstname.toLowerCase().includes(query) ||
        s.lastname.toLowerCase().includes(query) ||
        s.studentID.toLowerCase().includes(query);
      const matchesStatus = this.statusFilter === 'all' || s.status === this.statusFilter;
      const matchesProgram = !this.programFilter || s.program === this.programNameById(this.programFilter);
      return matchesQuery && matchesStatus && matchesProgram;
    });
  }

  get sortedRecords(): StudentAccount[] {
    const records = [...this.filteredRecords];
    const field = this.sortField as keyof StudentAccount;

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

  get paginatedRecords(): StudentAccount[] {
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

  sectionsForProgram(programId: string): Section[] {
    return this.sections.filter(s => s.programId === programId);
  }

  programNameById(programId: string): string {
    return this.programs.find(p => p.id === programId)?.name ?? '';
  }

  sectionNameById(sectionId: string): string {
    return this.sections.find(s => s.id === sectionId)?.name ?? '';
  }

  onAddProgramChange(): void {
    this.addForm.sectionId = '';
    this.addForm.program = this.programNameById(this.addForm.programId ?? '');
  }

  onEditProgramChange(): void {
    this.editForm.sectionId = '';
    this.editForm.program = this.programNameById(this.editForm.programId ?? '');
  }

  addStudent(): void {
    const f = this.addForm;
    if (!f.UID || !f.password || !f.studentID || !f.lastname || !f.firstname) {
      this.toast('error', 'Please fill in UID, Password, Student ID, Lastname, and Firstname.');
      return;
    }

    f.name = `${f.firstname} ${f.lastname}`.trim();
    f.program = this.programNameById(f.programId ?? '');

    try {
      this.studentService.add(f as StudentAccount).subscribe({
        next: () => {
          const actor = this.auth.getCurrentUser();
          void this.auditLog.log({
            actorUID: actor?.UID ?? 'unknown',
            actorName: actor?.name ?? 'Unknown Admin',
            action: 'create',
            entityType: 'student',
            entityId: f.UID ?? '',
            description: `Added student ${f.firstname} ${f.lastname} (ID: ${f.studentID})`,
            timestamp: new Date().toISOString(),
          });
          void this.adminNotification.createNotification({
            recipientUID: 'admin',
            type: 'student_registered',
            title: 'New student registered',
            message: `${f.firstname} ${f.lastname} (${f.studentID}) has been registered`,
            isRead: false,
            relatedId: f.UID,
            relatedName: `${f.firstname} ${f.lastname}`,
          });
          this.addForm = this.emptyAddForm();
          this.toast('success', 'Student added');
          void this.loadAll();
        },
        error: () => {
          this.toast('error', 'Failed to add student');
        },
      });
    } catch {
      this.toast('error', 'Failed to add student');
    }
  }

  openEdit(s: StudentAccount): void {
    this.editingUID = s.UID;
    const matchedProgram = this.programs.find(p => p.name === s.program);
    this.editForm = {
      UID: s.UID,
      studentID: s.studentID,
      firstname: s.firstname,
      lastname: s.lastname,
      middlename: s.middlename,
      email: s.email,
      program: s.program,
      programId: matchedProgram?.id ?? '',
      sectionId: '',
      status: s.status,
      password: s.password,
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
    if (!f.firstname || !f.lastname || !f.studentID) {
      this.toast('error', 'Firstname, Lastname, and Student ID are required.');
      return;
    }

    const changes: Partial<StudentAccount> = {
      firstname: f.firstname,
      lastname: f.lastname,
      middlename: f.middlename ?? '',
      name: `${f.firstname} ${f.lastname}`.trim(),
      studentID: f.studentID ?? '',
      email: f.email ?? '',
      program: this.programNameById(f.programId ?? '') || f.program || '',
      status: f.status ?? 'active',
      password: f.password ?? '',
    };

    this.studentService.update(this.editingUID, changes);
    this.toast('success', 'Student updated');
    this.closeEdit();
    void this.loadAll();
  }

  removeStudent(uid: string): void {
    void this.toastService.confirmDestructive('Remove student?', { confirmText: 'Remove' }).then(ok => {
      if (!ok) return;
      const student = this.students.find(s => s.UID === uid);
      this.studentService.remove(uid).subscribe({
        next: () => {
          const actor = this.auth.getCurrentUser();
          void this.auditLog.log({
            actorUID: actor?.UID ?? 'unknown',
            actorName: actor?.name ?? 'Unknown Admin',
            action: 'delete',
            entityType: 'student',
            entityId: uid,
            description: `Removed student ${student?.firstname} ${student?.lastname} (ID: ${student?.studentID})`,
            timestamp: new Date().toISOString(),
          });
          this.toast('success', 'Student removed');
          void this.loadAll();
        },
        error: () => this.toast('error', 'Failed to remove student'),
      });
    });
  }

  // ── CSV Import ────────────────────────────────────────────────────────────

  async onCSVImport(rows: CSVImportRow[]): Promise<void> {
    let imported = 0;
    let skipped = 0;

    for (const row of rows) {
      try {
        const form: Partial<StudentAccount> & { programId?: string; sectionId?: string } = {
          UID: `STU-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          name: `${row.data['firstname']} ${row.data['lastname']}`.trim(),
          firstname: row.data['firstname'],
          lastname: row.data['lastname'],
          middlename: row.data['middlename'] || '',
          studentID: row.data['studentid'],
          email: row.data['email'] || '',
          status: (row.data['status'] || 'active') as 'active' | 'inactive',
          password: `${row.data['studentid']}@initial`,
          program: '',
          programId: '',
          sectionId: '',
        };

        await new Promise<void>((resolve) => {
          this.studentService.add(form as StudentAccount).subscribe({
            next: () => {
              const actor = this.auth.getCurrentUser();
              void this.auditLog.log({
                actorUID: actor?.UID ?? 'unknown',
                actorName: actor?.name ?? 'Unknown Admin',
                action: 'create',
                entityType: 'student',
                entityId: form.UID ?? '',
                description: `Bulk imported student ${form.firstname} ${form.lastname} (ID: ${form.studentID})`,
                timestamp: new Date().toISOString(),
              });
              void this.adminNotification.createNotification({
                recipientUID: 'admin',
                type: 'student_registered',
                title: 'New student registered',
                message: `${form.firstname} ${form.lastname} (${form.studentID}) has been registered`,
                isRead: false,
                relatedId: form.UID,
                relatedName: `${form.firstname} ${form.lastname}`,
              });
              imported++;
              resolve();
            },
            error: () => {
              skipped++;
              resolve();
            },
          });
        });
      } catch {
        skipped++;
      }
    }

    await this.loadAll();
    void this.toastService.alert('Import complete', {
      html: `<p><strong>${imported}</strong> students imported</p>${skipped > 0 ? `<p><strong>${skipped}</strong> students skipped</p>` : ''}`,
    }, 'success');
  }

  // ── Bulk Status Management ─────────────────────────────────────────────────

  toggleSelectStudent(uid: string): void {
    if (this.selectedStudentUIDs.has(uid)) {
      this.selectedStudentUIDs.delete(uid);
    } else {
      this.selectedStudentUIDs.add(uid);
    }
  }

  toggleSelectAll(): void {
    if (this.selectedStudentUIDs.size === this.paginatedRecords.length && this.selectedStudentUIDs.size > 0) {
      this.selectedStudentUIDs.clear();
    } else {
      this.paginatedRecords.forEach(s => this.selectedStudentUIDs.add(s.UID));
    }
  }

  get isAllSelectedOnPage(): boolean {
    return this.paginatedRecords.length > 0 && this.paginatedRecords.every(s => this.selectedStudentUIDs.has(s.UID));
  }

  async bulkSetStatus(status: 'active' | 'inactive'): Promise<void> {
    if (this.selectedStudentUIDs.size === 0) return;

    const ok = await this.toastService.confirm(
      `Set ${this.selectedStudentUIDs.size} student(s) to ${status}?`,
      { confirmColor: status === 'inactive' ? '#ef4444' : '#22c55e' },
    );

    if (!ok) return;

    try {
      const count = this.selectedStudentUIDs.size;
      for (const uid of Array.from(this.selectedStudentUIDs)) {
        this.studentService.update(uid, { status });
      }
      this.selectedStudentUIDs.clear();
      await this.loadAll();
      this.toast('success', `${count} student(s) updated`);
    } catch {
      this.toast('error', 'Failed to update students');
    }
  }

  // ── Individual Status & Password ────────────────────────────────────────────

  async toggleStudentStatus(student: StudentAccount): Promise<void> {
    const newStatus = student.status === 'active' ? 'inactive' : 'active';
    const ok = await this.toastService.confirm(
      `Set ${student.firstname} ${student.lastname} to ${newStatus}?`,
      { confirmColor: newStatus === 'inactive' ? '#ef4444' : '#22c55e' },
    );

    if (!ok) return;

    try {
      this.studentService.update(student.UID, { status: newStatus });
      await this.loadAll();
      this.toast('success', `Student status changed to ${newStatus}`);
    } catch {
      this.toast('error', 'Failed to update student status');
    }
  }

  async resetStudentPassword(student: StudentAccount): Promise<void> {
    const newPassword = await this.toastService.prompt('Reset password', {
      html: `<p>Enter a temporary password for <strong>${student.firstname} ${student.lastname}</strong></p>`,
      inputType: 'password',
      placeholder: 'Minimum 6 characters',
      inputAttributes: { minlength: '6' },
      confirmText: 'Reset',
    });

    if (!newPassword) return;

    try {
      this.studentService.update(student.UID, { password: newPassword });
      this.toast('success', 'Password reset successfully');
    } catch {
      this.toast('error', 'Failed to reset password');
    }
  }
}