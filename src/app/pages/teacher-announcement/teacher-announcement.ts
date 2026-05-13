import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Announcement, AnnouncementService } from '../../services/announcement.service';
import { AuthService } from '../../services/auth.service';
import { AcademicService, Course, CourseSection } from '../../services/academic.service';
import { NotificationService } from '../../services/notification.service';
import { ToastService } from '../../services/toast.service';

interface CourseCard {
  courseSection: CourseSection;
  course: Course;
}

type AnnouncementView = 'courses' | 'list';

@Component({
  selector: 'app-teacher-announcement',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './teacher-announcement.html',
  styleUrl: './teacher-announcement.scss',
})
export class TeacherAnnouncement implements OnInit {
  view: AnnouncementView = 'courses';
  courseCards: CourseCard[] = [];
  selectedCourseCard: CourseCard | null = null;
  announcements: Announcement[] = [];
  loading = false;
  title = '';
  message = '';

  constructor(
    private readonly announcementService: AnnouncementService,
    private readonly auth: AuthService,
    private readonly academic: AcademicService,
    private readonly notificationService: NotificationService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    void this.loadCourseCards();
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

  async openCourse(card: CourseCard): Promise<void> {
    this.selectedCourseCard = card;
    this.view = 'list';
    await this.loadAnnouncements();
  }

  goBackToCourses(): void {
    this.view = 'courses';
    this.selectedCourseCard = null;
    this.announcements = [];
    this.title = '';
    this.message = '';
  }

  private async loadAnnouncements(): Promise<void> {
    const id = this.teacherID;
    if (!id || !this.selectedCourseCard) {
      this.announcements = [];
      this.cdr.detectChanges();
      return;
    }
    this.loading = true;
    const all = await this.announcementService.getForTeacher(id);
    this.announcements = all.filter(a => a.courseId === this.selectedCourseCard!.course.id);
    this.loading = false;
    this.cdr.detectChanges();
  }

  async createAnnouncement(): Promise<void> {
    const credential = this.teacherID;
    const uid = this.teacherUID;
    if (!credential || !uid || !this.selectedCourseCard) {
      this.toast.warning('Select a course first');
      return;
    }

    const title = this.title.trim();
    const message = this.message.trim();
    if (!title || !message) {
      this.toast.warning('Title and message are required');
      return;
    }

    const course = this.selectedCourseCard.course;

    try {
      const announcement = await this.announcementService.create(
        credential, title, message, course.id, uid,
      );
      this.title = '';
      this.message = '';
      await this.loadAnnouncements();
      this.toast.success('Announcement posted');

      // Notify every enrolled student for this course/teacher (best-effort).
      void this.notifyEnrolledStudents(announcement, course);
    } catch {
      this.toast.error('Failed to post announcement');
    }
  }

  private async notifyEnrolledStudents(
    announcement: Announcement,
    course: Course,
  ): Promise<void> {
    try {
      const enrollments = await this.academic.getEnrollmentsByCourse(course.id);
      const teacherUID = this.teacherUID;
      const studentUIDs = [...new Set(
        enrollments
          .filter(e => !teacherUID || e.teacherUID === teacherUID)
          .map(e => e.studentUID),
      )];
      const createdAt = new Date().toISOString();
      await Promise.all(studentUIDs.map(studentUID =>
        this.notificationService.createNotification({
          recipientUID: studentUID,
          type: 'announcement',
          title: `New announcement: ${course.name}`,
          message: announcement.title,
          relatedId: String(announcement.id),
          read: false,
          createdAt,
        }),
      ));
    } catch (e) {
      console.warn('Announcement notification dispatch failed:', e);
    }
  }

  async deleteAnnouncement(id: string | number): Promise<void> {
    const ok = await this.toast.confirmDestructive('Delete this announcement?', {
      text: 'This cannot be undone.',
    });
    if (!ok) return;
    try {
      await this.announcementService.delete(id);
      await this.loadAnnouncements();
      this.toast.success('Announcement deleted');
    } catch {
      this.toast.error('Failed to delete announcement');
    }
  }
}