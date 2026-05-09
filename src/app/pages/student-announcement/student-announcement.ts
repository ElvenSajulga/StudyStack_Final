import { Component, OnDestroy, OnInit, NgZone,
  inject, PLATFORM_ID, ChangeDetectorRef } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Announcement, AnnouncementService } from '../../services/announcement.service';
import { AcademicService, Course, Enrollment } from '../../services/academic.service';
import { AuthService } from '../../services/auth.service';
import { TeacherAccount, TeacherAccountService } from '../../services/teacher-account.service';

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
  private refreshTimer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly announcementService: AnnouncementService,
    private readonly academic: AcademicService,
    private readonly auth: AuthService,
    private readonly teacherService: TeacherAccountService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    void this.init();
    if (isPlatformBrowser(this.platformId)) {
      this.zone.runOutsideAngular(() => {
        this.refreshTimer = setInterval(() => {
          this.zone.run(() => void this.loadAnnouncements());
        }, 30000);
      });
    }
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
      this.enrollments = await this.academic.getEnrollmentsByStudentID(sid);
      this.courses = await this.academic.getCourses();
    }

    await this.loadAnnouncements();
    this.loading = false;
    this.cdr.detectChanges();
  }

  private async loadAnnouncements(): Promise<void> {
    if (!this.studentID) return;

    const teacherUIDs = [...new Set(this.enrollments.map(e => e.teacherUID))];

    if (teacherUIDs.length === 0) {
      this.allAnnouncements = [];
      this.filteredAnnouncements = [];
      this.groups = [];
      this.cdr.detectChanges();
      return;
    }

    // fetch announcements only from enrolled teachers
    const perTeacher = await Promise.all(
      teacherUIDs.map(uid => this.announcementService.getForTeacher(uid))
    );

    const seen = new Set<string | number>();
    this.allAnnouncements = perTeacher
      .flat()
      .filter(a => { if (seen.has(a.id)) return false; seen.add(a.id); return true; })
      .sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

    this.applyFilter();
    this.buildGroups();
    this.cdr.detectChanges();
  }

  applyFilter(): void {
    if (!this.filterTeacherUID) {
      this.filteredAnnouncements = [...this.allAnnouncements];
    } else {
      this.filteredAnnouncements = this.allAnnouncements.filter(
        a => a.teacherID === this.filterTeacherUID
      );
    }
  }

  onFilterChange(): void { this.applyFilter(); }

  private buildGroups(): void {
    const grouped: AnnouncementGroup[] = [];
    const teacherUIDs = [...new Set(this.enrollments.map(e => e.teacherUID))];

    for (const uid of teacherUIDs) {
      const enrollment = this.enrollments.find(e => e.teacherUID === uid);
      if (!enrollment) continue;

      const course = this.courses.find(c => c.id === enrollment.courseId);
      if (!course) continue;

      const teacher = this.teachers.find(t => t.UID === uid);
      const teacherName = teacher
        ? `${teacher.firstname} ${teacher.lastname}`.trim()
        : uid;

      const announcements = this.allAnnouncements.filter(
        a => a.teacherID === uid
      );

      if (announcements.length > 0) {
        grouped.push({ course, teacherName, announcements });
      }
    }

    this.groups = grouped;
  }

  teacherNameForUID(uid: string): string {
    const t = this.teachers.find(t => t.UID === uid);
    return t ? `${t.firstname} ${t.lastname}`.trim() : uid;
  }

  get uniqueTeachers(): { uid: string; name: string }[] {
    const uids = [...new Set(this.enrollments.map(e => e.teacherUID))];
    return uids.map(uid => ({ uid, name: this.teacherNameForUID(uid) }));
  }

  ngOnDestroy(): void {
    if (this.refreshTimer != null) clearInterval(this.refreshTimer);
  }
}