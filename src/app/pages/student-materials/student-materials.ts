import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';

import { AuthService } from '../../services/auth.service';
import { AcademicService } from '../../services/academic.service';
import { CourseLookupService } from '../../services/course-lookup.service';
import { LearningMaterial, LearningMaterialService } from '../../services/learning-material.service';
import { formatBytes } from '../../services/image-upload.util';

interface MaterialGroup {
  courseId: string;
  courseName: string;
  items: LearningMaterial[];
}

@Component({
  selector: 'app-student-materials',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './student-materials.html',
  styleUrl: './student-materials.scss',
})
export class StudentMaterials implements OnInit, OnDestroy {
  loading = true;
  groups: MaterialGroup[] = [];
  flatMaterials: LearningMaterial[] = [];
  search = '';
  selectedCourseId: string | 'all' = 'all';

  readonly formatBytes = formatBytes;

  private sub: Subscription | null = null;

  constructor(
    private readonly auth: AuthService,
    private readonly academic: AcademicService,
    private readonly courseLookup: CourseLookupService,
    private readonly materialService: LearningMaterialService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  async ngOnInit(): Promise<void> {
    await this.courseLookup.ensureLoaded();
    void this.subscribe();
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  private get studentID(): string | undefined {
    return this.auth.getCurrentUser()?.studentID;
  }

  private async subscribe(): Promise<void> {
    const studentID = this.studentID;
    if (!studentID) {
      this.loading = false;
      this.cdr.detectChanges();
      return;
    }

    const teacherUIDs = await this.academic.getTeacherUIDsForStudent(studentID);
    const enrolledCourseIds = new Set(
      await this.academic.getCourseIDsForStudent(studentID),
    );

    this.sub?.unsubscribe();
    this.sub = this.materialService
      .watchForEnrolledTeacherUIDs(teacherUIDs)
      .subscribe(list => {
        this.flatMaterials = list.filter(m => enrolledCourseIds.has(m.courseId));
        this.rebuildGroups();
        this.loading = false;
        this.cdr.detectChanges();
      });
  }

  private rebuildGroups(): void {
    const q = this.search.trim().toLowerCase();
    const filtered = this.flatMaterials.filter(m => {
      if (this.selectedCourseId !== 'all' && m.courseId !== this.selectedCourseId) return false;
      if (!q) return true;
      const hay = `${m.title} ${m.description ?? ''} ${m.fileName ?? ''} ${m.linkUrl ?? ''}`.toLowerCase();
      return hay.includes(q);
    });

    const byCourse = new Map<string, LearningMaterial[]>();
    for (const m of filtered) {
      if (!byCourse.has(m.courseId)) byCourse.set(m.courseId, []);
      byCourse.get(m.courseId)!.push(m);
    }

    this.groups = [...byCourse.entries()]
      .map(([courseId, items]) => ({
        courseId,
        courseName: this.courseLookup.name(courseId, 'Unassigned course'),
        items,
      }))
      .sort((a, b) => a.courseName.localeCompare(b.courseName));
  }

  onFilterChange(): void {
    this.rebuildGroups();
    this.cdr.detectChanges();
  }

  get courseFilterOptions(): { id: string; name: string }[] {
    const seen = new Map<string, string>();
    for (const m of this.flatMaterials) {
      if (!seen.has(m.courseId)) {
        seen.set(m.courseId, this.courseLookup.name(m.courseId, 'Unassigned course'));
      }
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  iconForMaterial(m: LearningMaterial): string {
    if (m.kind === 'link') return 'ti-link';
    const mime = (m.fileMimeType ?? '').toLowerCase();
    if (mime.startsWith('image/')) return 'ti-photo';
    if (mime === 'application/pdf') return 'ti-file-type-pdf';
    if (mime.includes('word') || mime.includes('document')) return 'ti-file-type-doc';
    if (mime.includes('sheet') || mime.includes('excel')) return 'ti-file-type-xls';
    if (mime.includes('presentation') || mime.includes('powerpoint')) return 'ti-file-type-ppt';
    if (mime.startsWith('audio/')) return 'ti-music';
    if (mime.startsWith('video/')) return 'ti-video';
    if (mime.startsWith('text/')) return 'ti-file-text';
    return 'ti-file';
  }

  trackById = (_: number, m: LearningMaterial) => m.id;
}
