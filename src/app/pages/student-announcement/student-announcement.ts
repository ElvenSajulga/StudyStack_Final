import { Component, OnDestroy, OnInit, inject, PLATFORM_ID, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Announcement, AnnouncementService } from '../../services/announcement.service';
import { AcademicService, Subject } from '../../services/academic.service';
import { AuthService } from '../../services/auth.service';
import { TeacherAccountService } from '../../services/teacher-account.service';

@Component({
  selector: 'app-student-announcement',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './student-announcement.html',
  styleUrl: './student-announcement.scss',
})
export class StudentAnnouncement implements OnInit, OnDestroy {
  allAnnouncements: Announcement[] = [];
  filteredAnnouncements: Announcement[] = [];

  enrolledSubjects: Subject[] = [];
  filterTeacherUID = '';

  private enrolledTeacherUIDs: string[] = [];
  private readonly platformId = inject(PLATFORM_ID);
  private refreshTimer?: ReturnType<typeof setInterval>;

  private readonly onVisibility = () => {
    if (document.visibilityState === 'visible') {
      this.zone.run(() => void this.loadAnnouncements());
    }
  };

  constructor(
    private readonly announcementService: AnnouncementService,
    private readonly academic: AcademicService,
    private readonly auth: AuthService,
    private readonly cdr: ChangeDetectorRef,
    private readonly zone: NgZone,
    private readonly teacherService: TeacherAccountService,
  ) {}

  ngOnInit(): void {
    void this.init();

    if (isPlatformBrowser(this.platformId)) {
      document.addEventListener('visibilitychange', this.onVisibility);
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

  private async init(): Promise<void> {
    const user = this.auth.getCurrentUser();
    const sid = this.studentID;
    const studentUID = user?.UID;

    if (sid) {
      const enrollments = await this.academic.getEnrollments();
      const myEnrollments = enrollments.filter(e =>
        e.studentID === sid || (studentUID && e.studentUID === studentUID)
      );
      this.enrolledTeacherUIDs = [...new Set(myEnrollments.map(e => e.teacherUID))];

      const allSubjects = await this.academic.getSubjects();
      this.enrolledSubjects = allSubjects.filter(s =>
        this.enrolledTeacherUIDs.includes(s.teacherUID)
      );
    }

    await this.loadAnnouncements();
  }

  private async loadAnnouncements(): Promise<void> {
    try {
      if (this.enrolledTeacherUIDs.length > 0) {
        // Map login UIDs → teacherIDs for announcement lookup
        await this.teacherService.reloadFromServer();
        const allTeachers = this.teacherService.getAll();

        const perTeacher = await Promise.all(
          this.enrolledTeacherUIDs.map(uid => {
            const teacher = allTeachers.find(t => t.UID === uid);
            const teacherIDValue = teacher?.teacherID ?? uid;
            return this.announcementService.getForTeacher(teacherIDValue);
          })
        );

        const flat = perTeacher.flat();
        const seen = new Set<string | number>();
        this.allAnnouncements = flat
          .filter(a => {
            if (seen.has(a.id)) return false;
            seen.add(a.id);
            return true;
          })
          .sort((a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
      } else {
        this.allAnnouncements = await this.announcementService.getAllForStudents();
      }
    } catch {
      this.allAnnouncements = [];
    }

    this.applyFilter();
    this.cdr.detectChanges();
  }

  applyFilter(): void {
    if (!this.filterTeacherUID) {
      this.filteredAnnouncements = [...this.allAnnouncements];
    } else {
      // filterTeacherUID is a login UID — map to teacherID for comparison
      const allTeachers = this.teacherService.getAll();
      const teacher = allTeachers.find(t => t.UID === this.filterTeacherUID);
      const teacherIDValue = teacher?.teacherID ?? this.filterTeacherUID;
      this.filteredAnnouncements = this.allAnnouncements.filter(
        a => a.teacherID === teacherIDValue
      );
    }
  }

  onFilterChange(): void {
    this.applyFilter();
  }

  ngOnDestroy(): void {
    if (isPlatformBrowser(this.platformId)) {
      if (this.refreshTimer != null) clearInterval(this.refreshTimer);
      document.removeEventListener('visibilitychange', this.onVisibility);
    }
  }
}