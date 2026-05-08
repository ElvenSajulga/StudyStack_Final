import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Announcement, AnnouncementService } from '../../services/announcement.service';
import { AuthService } from '../../services/auth.service';
import { AcademicService, Course, CourseSection } from '../../services/academic.service';

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
    const id = this.teacherID;
    if (!id || !this.selectedCourseCard) {
      alert('You must select a course first.');
      return;
    }

    if (!this.title.trim() || !this.message.trim()) {
      alert('Please enter a title and message.');
      return;
    }

    await this.announcementService.create(id, this.title.trim(), this.message.trim(), this.selectedCourseCard.course.id);
    this.title = '';
    this.message = '';
    await this.loadAnnouncements();
  }

  async deleteAnnouncement(id: string | number): Promise<void> {
    if (!confirm('Delete this announcement?')) return;
    await this.announcementService.delete(id);
    await this.loadAnnouncements();
  }
}