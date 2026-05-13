import { Component, OnDestroy, OnInit, NgZone,
  inject, PLATFORM_ID, ChangeDetectorRef } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Announcement, AnnouncementService } from '../../services/announcement.service';
import { AcademicService, Course, Enrollment } from '../../services/academic.service';
import { AuthService } from '../../services/auth.service';
import { TeacherAccount, TeacherAccountService } from '../../services/teacher-account.service';
import { Subscription } from 'rxjs';

interface AnnouncementGroup {
  course: Course;
  teacherName: string;
  announcements: Announcement[];
}

@Component({
  selector: 'app-student-announcement',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './student-announcement.html',
  styleUrl: './student-announcement.scss',
})
export class StudentAnnouncement implements OnInit, OnDestroy {
  groups: AnnouncementGroup[] = [];
  allAnnouncements: Announcement[] = [];
  filteredAnnouncements: Announcement[] = [];

  filterTeacherUID = '';
  enrollments: Enrollment[] = [];
  courses: Course[] = [];
  teachers: TeacherAccount[] = [];

  loading = false;
  readIds: Set<string> = new Set();

  private readonly platformId = inject(PLATFORM_ID);
  private readonly zone = inject(NgZone);
  private announcementsSub?: Subscription;

  constructor(
    private readonly announcementService: AnnouncementService,
    private readonly academic: AcademicService,
    private readonly auth: AuthService,
    private readonly teacherService: TeacherAccountService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    void this.init();
  }

  private get studentID(): string | undefined {
    return this.auth.getCurrentUser()?.studentID;
  }

  private get storageKey(): string {
    const uid = this.studentID || 'anonymous';
    return `ss_read_announcements_${uid}`;
  }

  private loadReadState(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      const stored = localStorage.getItem(this.storageKey);
      this.readIds = new Set(stored ? JSON.parse(stored) : []);
    } catch {
      this.readIds = new Set();
    }
  }

  private saveReadState(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(Array.from(this.readIds)));
    } catch {
      // localStorage might be unavailable
    }
  }

  isUnread(id: string | number): boolean {
    return !this.readIds.has(String(id));
  }

  markAsRead(id: string | number): void {
    this.readIds.add(String(id));
    this.saveReadState();
    this.cdr.detectChanges();
  }

  markAllAsRead(): void {
    for (const a of this.filteredAnnouncements) {
      this.readIds.add(String(a.id));
    }
    this.saveReadState();
    this.cdr.detectChanges();
  }

  get unreadCount(): number {
    return this.filteredAnnouncements.filter(a => this.isUnread(a.id)).length;
  }

  private async init(): Promise<void> {
    this.loading = true;
    this.loadReadState();
    await this.teacherService.reloadFromServer();
    this.teachers = this.teacherService.getAll();

    const sid = this.studentID;
    if (sid) {
      [this.enrollments, this.courses] = await Promise.all([
        this.academic.getEnrollmentsByStudentID(sid),
        this.academic.getCourses(),
      ]);
    }

    this.subscribeToAnnouncements();
    this.loading = false;
    this.cdr.detectChanges();
  }

  /**
   * Subscribe to a real-time announcement stream for every teacher this
   * student is enrolled with. Replaces the prior 30-second polling loop.
   */
  private subscribeToAnnouncements(): void {
    this.announcementsSub?.unsubscribe();

    const teacherUIDs = [...new Set(this.enrollments.map(e => e.teacherUID))];

    if (teacherUIDs.length === 0) {
      this.allAnnouncements = [];
      this.filteredAnnouncements = [];
      this.groups = [];
      this.cdr.detectChanges();
      return;
    }

    if (!isPlatformBrowser(this.platformId)) {
      // SSR / no real-time channel — fall back to a single bulk fetch
      void this.announcementService
        .getForEnrolledTeacherUIDsBulk(teacherUIDs)
        .then(list => {
          this.allAnnouncements = list;
          this.applyFilter();
          this.buildGroups();
          this.cdr.detectChanges();
        });
      return;
    }

    this.announcementsSub = this.announcementService
      .watchForEnrolledTeacherUIDs(teacherUIDs)
      .subscribe({
        next: list => {
          this.allAnnouncements = list;
          this.applyFilter();
          this.buildGroups();
          this.cdr.detectChanges();
        },
        error: err => {
          console.warn('Announcement stream failed, falling back to one-shot fetch:', err);
          void this.announcementService
            .getForEnrolledTeacherUIDsBulk(teacherUIDs)
            .then(list => {
              this.allAnnouncements = list;
              this.applyFilter();
              this.buildGroups();
              this.cdr.detectChanges();
            });
        },
      });
  }

  applyFilter(): void {
    if (!this.filterTeacherUID) {
      this.filteredAnnouncements = [...this.allAnnouncements];
    } else {
      this.filteredAnnouncements = this.allAnnouncements.filter(
        a => this.announcementBelongsToTeacherUID(a, this.filterTeacherUID),
      );
    }
  }

  onFilterChange(): void { this.applyFilter(); }

  /**
   * Group announcements by course. Prefers `announcement.courseId` when
   * present (handles teachers who teach more than one course to the same
   * student); otherwise falls back to the first enrollment for that teacher,
   * matching the prior behavior for legacy records.
   */
  private buildGroups(): void {
    const courseToAnnouncements = new Map<string, Announcement[]>();

    for (const a of this.allAnnouncements) {
      const courseId = this.resolveCourseId(a);
      if (!courseId) continue;
      const bucket = courseToAnnouncements.get(courseId);
      if (bucket) bucket.push(a);
      else courseToAnnouncements.set(courseId, [a]);
    }

    const grouped: AnnouncementGroup[] = [];
    for (const [courseId, announcements] of courseToAnnouncements) {
      const course = this.courses.find(c => c.id === courseId);
      if (!course) continue;
      const enrollment = this.enrollments.find(e => e.courseId === courseId);
      const teacher = enrollment
        ? this.teachers.find(t => t.UID === enrollment.teacherUID)
        : undefined;
      const teacherName = teacher
        ? `${teacher.firstname} ${teacher.lastname}`.trim()
        : '';
      grouped.push({ course, teacherName, announcements });
    }
    this.groups = grouped;
  }

  /** Returns the course id this announcement should be displayed under. */
  private resolveCourseId(a: Announcement): string | null {
    if (a.courseId) return a.courseId;
    const teacherUID = this.resolveTeacherUID(a);
    if (!teacherUID) return null;
    return this.enrollments.find(e => e.teacherUID === teacherUID)?.courseId ?? null;
  }

  /** Resolves an announcement's teacher UID via the resilient identifier scheme. */
  private resolveTeacherUID(a: Announcement): string | null {
    if (a.teacherUID) return a.teacherUID;
    // Try resolving via teacherID credential → UID
    const byCredential = this.teachers.find(t => t.teacherID === a.teacherID);
    if (byCredential) return byCredential.UID;
    // Legacy edge-case: teacherID actually stored a UID
    if (this.teachers.some(t => t.UID === a.teacherID)) return a.teacherID;
    return null;
  }

  private announcementBelongsToTeacherUID(a: Announcement, uid: string): boolean {
    return this.resolveTeacherUID(a) === uid;
  }

  teacherNameForUID(uid: string): string {
    const t = this.teachers.find(t => t.UID === uid);
    return t ? `${t.firstname} ${t.lastname}`.trim() : uid;
  }

  /** Display helper for cards — the teacher's name for an announcement. */
  teacherNameForAnnouncement(a: Announcement): string {
    const uid = this.resolveTeacherUID(a);
    return uid ? this.teacherNameForUID(uid) : '';
  }

  /** Display helper for cards — the course name for an announcement. */
  courseNameForAnnouncement(a: Announcement): string {
    const courseId = this.resolveCourseId(a);
    if (!courseId) return '';
    return this.courses.find(c => c.id === courseId)?.name ?? '';
  }

  get uniqueTeachers(): { uid: string; name: string }[] {
    const uids = [...new Set(this.enrollments.map(e => e.teacherUID))];
    return uids.map(uid => ({ uid, name: this.teacherNameForUID(uid) }));
  }

  ngOnDestroy(): void {
    this.announcementsSub?.unsubscribe();
  }
}
