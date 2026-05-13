import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';

import { AuthService } from '../../services/auth.service';
import { AcademicService, Course, CourseSection } from '../../services/academic.service';
import { LearningMaterial, LearningMaterialService } from '../../services/learning-material.service';
import { ToastService } from '../../services/toast.service';
import { fileToBase64DataUrl, formatBytes } from '../../services/image-upload.util';

type View = 'courses' | 'list';
type MaterialKind = 'link' | 'file';

interface CourseCard {
  courseSection: CourseSection;
  course: Course;
}

@Component({
  selector: 'app-teacher-materials',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './teacher-materials.html',
  styleUrl: './teacher-materials.scss',
})
export class TeacherMaterials implements OnInit, OnDestroy {
  view: View = 'courses';
  courseCards: CourseCard[] = [];
  selectedCourseCard: CourseCard | null = null;
  materials: LearningMaterial[] = [];
  loading = false;

  // form state
  kind: MaterialKind = 'link';
  title = '';
  description = '';
  linkUrl = '';
  fileName = '';
  fileMimeType = '';
  fileSize = 0;
  fileDataUrl = '';
  uploading = false;

  readonly formatBytes = formatBytes;

  private materialsSub: Subscription | null = null;

  constructor(
    private readonly auth: AuthService,
    private readonly academic: AcademicService,
    private readonly materialService: LearningMaterialService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    void this.loadCourseCards();
  }

  ngOnDestroy(): void {
    this.materialsSub?.unsubscribe();
  }

  private get teacherUID(): string | undefined {
    return (this.auth.getCurrentUser() as unknown as { UID?: string })?.UID;
  }

  private get teacherID(): string | undefined {
    return this.auth.getCurrentUser()?.teacherID;
  }

  async loadCourseCards(): Promise<void> {
    const uid = this.teacherUID;
    if (!uid) { this.courseCards = []; this.cdr.detectChanges(); return; }

    this.loading = true;
    const [courseSections, courses] = await Promise.all([
      this.academic.getCourseSectionsByTeacher(uid),
      this.academic.getCourses(),
    ]);

    const cards: CourseCard[] = [];
    for (const cs of courseSections) {
      const course = courses.find(c => c.id === cs.courseId);
      if (!course) continue;
      cards.push({ courseSection: cs, course });
    }

    this.courseCards = cards;
    this.loading = false;
    this.cdr.detectChanges();
  }

  openCourse(card: CourseCard): void {
    this.selectedCourseCard = card;
    this.view = 'list';
    this.resetForm();
    this.subscribeMaterials();
  }

  goBackToCourses(): void {
    this.view = 'courses';
    this.selectedCourseCard = null;
    this.materials = [];
    this.materialsSub?.unsubscribe();
    this.materialsSub = null;
    this.resetForm();
  }

  private subscribeMaterials(): void {
    const credential = this.teacherID;
    if (!credential || !this.selectedCourseCard) return;
    const courseId = this.selectedCourseCard.course.id;

    this.materialsSub?.unsubscribe();
    this.materialsSub = this.materialService
      .watchForTeacher(credential)
      .subscribe(list => {
        this.materials = list.filter(m => m.courseId === courseId);
        this.cdr.detectChanges();
      });
  }

  setKind(kind: MaterialKind): void {
    this.kind = kind;
    if (kind === 'link') {
      this.fileName = '';
      this.fileMimeType = '';
      this.fileSize = 0;
      this.fileDataUrl = '';
    } else {
      this.linkUrl = '';
    }
  }

  async onFilePicked(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.uploading = true;
    try {
      const encoded = await fileToBase64DataUrl(file);
      this.fileDataUrl = encoded.dataUrl;
      this.fileName = encoded.name;
      this.fileMimeType = encoded.mimeType;
      this.fileSize = encoded.encodedSize;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not read file';
      this.toast.error(msg);
    } finally {
      this.uploading = false;
      input.value = '';
      this.cdr.detectChanges();
    }
  }

  clearFile(): void {
    this.fileName = '';
    this.fileMimeType = '';
    this.fileSize = 0;
    this.fileDataUrl = '';
  }

  async submit(): Promise<void> {
    const credential = this.teacherID;
    const uid = this.teacherUID;
    if (!credential || !this.selectedCourseCard) {
      this.toast.warning('Select a course first');
      return;
    }

    const title = this.title.trim();
    if (!title) {
      this.toast.warning('Title is required');
      return;
    }

    if (this.kind === 'link') {
      const url = this.linkUrl.trim();
      if (!url) {
        this.toast.warning('Enter a URL');
        return;
      }
      if (!/^https?:\/\//i.test(url)) {
        this.toast.warning('URL must start with http:// or https://');
        return;
      }
    } else if (!this.fileDataUrl) {
      this.toast.warning('Pick a file to upload');
      return;
    }

    try {
      await this.materialService.create({
        title,
        description: this.description.trim() || undefined,
        kind: this.kind,
        linkUrl: this.kind === 'link' ? this.linkUrl.trim() : undefined,
        fileDataUrl: this.kind === 'file' ? this.fileDataUrl : undefined,
        fileName: this.kind === 'file' ? this.fileName : undefined,
        fileMimeType: this.kind === 'file' ? this.fileMimeType : undefined,
        fileSize: this.kind === 'file' ? this.fileSize : undefined,
        teacherID: credential,
        teacherUID: uid,
        courseId: this.selectedCourseCard.course.id,
      });
      this.toast.success('Material posted');
      this.resetForm();
    } catch {
      this.toast.error('Failed to post material');
    }
  }

  async deleteMaterial(m: LearningMaterial): Promise<void> {
    const ok = await this.toast.confirmDestructive(`Delete "${m.title}"?`, {
      text: 'This cannot be undone.',
    });
    if (!ok) return;
    try {
      await this.materialService.delete(m.id);
      this.toast.success('Material deleted');
    } catch {
      this.toast.error('Failed to delete material');
    }
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

  private resetForm(): void {
    this.kind = 'link';
    this.title = '';
    this.description = '';
    this.linkUrl = '';
    this.clearFile();
  }
}
