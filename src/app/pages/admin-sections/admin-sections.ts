import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  AcademicService,
  Program,
  YearLevel,
  Section,
} from '../../services/academic.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-admin-sections',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-sections.html',
  styleUrl: './admin-sections.scss',
})
export class AdminSections implements OnInit {
  programs: Program[] = [];
  yearLevels: YearLevel[] = [];
  sections: Section[] = [];

  expandedProgramId: string | null = null;
  expandedYearLevelId: string | null = null;

  // year level form
  newYearLevelName: Record<string, string> = {};
  editingYearLevelId: string | null = null;
  editingYearLevelName = '';

  // section form
  newSectionName: Record<string, string> = {};
  editingSectionId: string | null = null;
  editingSectionName = '';

  loading = false;

  constructor(
    private readonly academic: AcademicService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    void this.loadAll();
  }

  private toast(icon: 'success' | 'error', title: string): void {
    void Swal.fire({
      toast: true, position: 'top-end', icon, title,
      showConfirmButton: false, timer: 2000, timerProgressBar: true,
    });
  }

  private async loadAll(): Promise<void> {
    this.loading = true;
    [this.programs, this.sections] = await Promise.all([
      this.academic.getPrograms(),
      this.academic.getSections(),
    ]);

    // load year levels for all programs
    const allYL: YearLevel[] = [];
    for (const p of this.programs) {
      const yl = await this.academic.getYearLevelsByProgram(p.id);
      allYL.push(...yl);
    }
    this.yearLevels = allYL;

    this.loading = false;
    this.cdr.detectChanges();
  }

  // ── helpers ───────────────────────────────────────────────────────────────────

  toggleProgram(id: string): void {
    this.expandedProgramId = this.expandedProgramId === id ? null : id;
    this.expandedYearLevelId = null;
  }

  toggleYearLevel(id: string): void {
    this.expandedYearLevelId = this.expandedYearLevelId === id ? null : id;
  }

  yearLevelsForProgram(programId: string): YearLevel[] {
    return this.yearLevels
      .filter(yl => yl.programId === programId)
      .sort((a, b) => a.order - b.order);
  }

  sectionsForYearLevel(yearLevelId: string): Section[] {
    return this.sections.filter(s => s.yearLevelId === yearLevelId);
  }

  nextOrder(programId: string): number {
    const existing = this.yearLevelsForProgram(programId);
    return existing.length > 0
      ? Math.max(...existing.map(yl => yl.order)) + 1
      : 1;
  }

  // ── seed default year levels ───────────────────────────────────────────────────

  async seedDefaults(programId: string): Promise<void> {
    const existing = this.yearLevelsForProgram(programId);
    if (existing.length > 0) return;
    try {
      await this.academic.seedYearLevels(programId);
      await this.loadAll();
      this.toast('success', 'Default year levels added');
    } catch { this.toast('error', 'Failed to seed year levels'); }
  }

  // ── year levels ───────────────────────────────────────────────────────────────

  async addYearLevel(programId: string): Promise<void> {
    const name = (this.newYearLevelName[programId] ?? '').trim();
    if (!name) return;
    const order = this.nextOrder(programId);
    try {
      await this.academic.addYearLevel(name, programId, order);
      this.newYearLevelName[programId] = '';
      await this.loadAll();
      this.toast('success', 'Year level added');
    } catch { this.toast('error', 'Failed to add year level'); }
  }

  startEditYearLevel(yl: YearLevel): void {
    this.editingYearLevelId = yl.id;
    this.editingYearLevelName = yl.name;
  }

  async saveEditYearLevel(id: string): Promise<void> {
    const name = this.editingYearLevelName.trim();
    if (!name) return;
    try {
      await this.academic.updateSection(id, { name });
      this.editingYearLevelId = null;
      await this.loadAll();
      this.toast('success', 'Year level updated');
    } catch { this.toast('error', 'Failed to update year level'); }
  }

  cancelEditYearLevel(): void { this.editingYearLevelId = null; }

  async deleteYearLevel(yl: YearLevel): Promise<void> {
    const count = this.sectionsForYearLevel(yl.id).length;
    const res = await Swal.fire({
      icon: 'warning',
      title: `Delete ${yl.name}?`,
      text: count
        ? `This will also delete ${count} section(s) under it.`
        : 'Delete this year level?',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: '#ef4444',
    });
    if (!res.isConfirmed) return;
    try {
      await this.academic.deleteYearLevel(yl.id);
      if (this.expandedYearLevelId === yl.id) this.expandedYearLevelId = null;
      await this.loadAll();
      this.toast('success', 'Year level deleted');
    } catch { this.toast('error', 'Failed to delete year level'); }
  }

  // ── sections ──────────────────────────────────────────────────────────────────

  async addSection(yearLevelId: string, programId: string): Promise<void> {
    const name = (this.newSectionName[yearLevelId] ?? '').trim();
    if (!name) return;
    try {
      await this.academic.addSection(name, programId, yearLevelId);
      this.newSectionName[yearLevelId] = '';
      await this.loadAll();
      this.toast('success', 'Section added');
    } catch { this.toast('error', 'Failed to add section'); }
  }

  startEditSection(s: Section): void {
    this.editingSectionId = s.id;
    this.editingSectionName = s.name;
  }

  async saveEditSection(id: string): Promise<void> {
    const name = this.editingSectionName.trim();
    if (!name) return;
    try {
      await this.academic.updateSection(id, { name });
      this.editingSectionId = null;
      await this.loadAll();
      this.toast('success', 'Section updated');
    } catch { this.toast('error', 'Failed to update section'); }
  }

  cancelEditSection(): void { this.editingSectionId = null; }

  async deleteSection(s: Section): Promise<void> {
    const res = await Swal.fire({
      icon: 'warning',
      title: `Delete ${s.name}?`,
      text: 'All enrollments for this section will also be removed.',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: '#ef4444',
    });
    if (!res.isConfirmed) return;
    try {
      await this.academic.deleteSection(s.id);
      await this.loadAll();
      this.toast('success', 'Section deleted');
    } catch { this.toast('error', 'Failed to delete section'); }
  }
}