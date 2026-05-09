import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuditLog, AuditLogService } from '../../services/audit-log.service';
import { AuthService } from '../../services/auth.service';

type ActionFilter = '' | 'create' | 'update' | 'delete';
type EntityTypeFilter = '' | 'student' | 'teacher' | 'enrollment' | 'announcement' | 'course' | 'section';

@Component({
  selector: 'app-admin-audit-log',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  templateUrl: './admin-audit-log.html',
  styleUrl: './admin-audit-log.scss',
})
export class AdminAuditLog implements OnInit {
  auditLogs: AuditLog[] = [];
  loading = false;

  filterAction: ActionFilter = '';
  filterEntityType: EntityTypeFilter = '';
  searchQuery = '';

  currentPage = 1;
  pageSize = 25;

  constructor(
    private readonly auditService: AuditLogService,
    private readonly auth: AuthService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    void this.loadAll();
  }

  private async loadAll(): Promise<void> {
    this.loading = true;
    try {
      this.auditLogs = await this.auditService.getAll();
      this.sortByTimestamp();
    } catch {
      this.auditLogs = [];
    }
    this.loading = false;
    this.cdr.detectChanges();
  }

  private sortByTimestamp(): void {
    this.auditLogs.sort((a, b) => {
      const dateA = new Date(a.timestamp).getTime();
      const dateB = new Date(b.timestamp).getTime();
      return dateB - dateA;
    });
  }

  get filteredLogs(): AuditLog[] {
    return this.auditLogs.filter(log => {
      const matchesAction = !this.filterAction || log.action === this.filterAction;
      const matchesEntityType = !this.filterEntityType || log.entityType === this.filterEntityType;
      const matchesSearch = !this.searchQuery || this.matchesSearchQuery(log);
      return matchesAction && matchesEntityType && matchesSearch;
    });
  }

  private matchesSearchQuery(log: AuditLog): boolean {
    const query = this.searchQuery.toLowerCase();
    return (
      log.actorName.toLowerCase().includes(query) ||
      log.description.toLowerCase().includes(query) ||
      log.entityId.toLowerCase().includes(query)
    );
  }

  get sortedLogs(): AuditLog[] {
    return this.filteredLogs;
  }

  get totalPages(): number {
    return Math.ceil(this.sortedLogs.length / this.pageSize);
  }

  get paginatedLogs(): AuditLog[] {
    const start = (this.currentPage - 1) * this.pageSize;
    const end = start + this.pageSize;
    return this.sortedLogs.slice(start, end);
  }

  get displayCount(): { start: number; end: number; total: number } {
    const total = this.sortedLogs.length;
    if (total === 0) return { start: 0, end: 0, total: 0 };
    const start = (this.currentPage - 1) * this.pageSize + 1;
    const end = Math.min(this.currentPage * this.pageSize, total);
    return { start, end, total };
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

  onFilterChange(): void {
    this.currentPage = 1;
  }

  getActionBadgeClass(action: string): string {
    switch (action) {
      case 'create': return 'badge-success';
      case 'update': return 'badge-info';
      case 'delete': return 'badge-danger';
      default: return 'badge-neutral';
    }
  }

  getActionLabel(action: string): string {
    switch (action) {
      case 'create': return 'Created';
      case 'update': return 'Updated';
      case 'delete': return 'Deleted';
      default: return action;
    }
  }

  getEntityTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      student: 'Student',
      teacher: 'Teacher',
      enrollment: 'Enrollment',
      announcement: 'Announcement',
      course: 'Course',
      section: 'Section',
    };
    return labels[type] ?? type;
  }
}
