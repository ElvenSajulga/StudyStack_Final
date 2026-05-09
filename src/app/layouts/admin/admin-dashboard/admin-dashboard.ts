import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { StudentAccount, StudentAccountService } from '../../../services/student-account.service';
import { TeacherAccount, TeacherAccountService } from '../../../services/teacher-account.service';
import { Activity, ActivityService } from '../../../services/activity.service';
import { Announcement, AnnouncementService } from '../../../services/announcement.service';
import { AcademicService, Course, CourseSection, Section, Enrollment } from '../../../services/academic.service';

interface AttentionItem {
  type: 'course' | 'section';
  name: string;
  id: string;
  link: string;
}

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './admin-dashboard.html',
  styleUrl: './admin-dashboard.scss',
})
export class AdminDashboard implements OnInit {
  totalStudents = 0;
  totalTeachers = 0;
  totalPrograms = 0;
  totalEnrollments = 0;
  enrollmentsThisMonth = 0;

  coursesWithoutTeacher: Course[] = [];
  sectionsWithoutStudents: Section[] = [];
  attentionItems: AttentionItem[] = [];

  recentStudents: StudentAccount[] = [];
  recentTeachers: TeacherAccount[] = [];
  recentActivities: Activity[] = [];
  recentAnnouncements: Announcement[] = [];

  userName = '';
  today = new Date();

  constructor(
    private readonly students: StudentAccountService,
    private readonly teachers: TeacherAccountService,
    private readonly activities: ActivityService,
    private readonly announcements: AnnouncementService,
    private readonly academic: AcademicService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    const user = localStorage.getItem('currentUser');
    if (user) {
      const parsed = JSON.parse(user);
      this.userName = parsed.name || 'Admin';
    }
    void this.loadStats();
  }

  getGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }

  private async loadStats(): Promise<void> {
    await this.students.reloadFromServer();
    await this.teachers.reloadFromServer();

    this.totalStudents = this.students.getCount();
    this.totalTeachers = this.teachers.getCount();

    const allPrograms = await this.academic.getPrograms();
    this.totalPrograms = allPrograms.length;

    const allCourses = await this.academic.getCourses();
    const allCourseSections = await this.academic.getCourseSections();
    const allSections = await this.academic.getSections();
    const allEnrollments = await this.academic.getEnrollments();

    const allAnnouncements = await this.announcements.getAllForStudents();

    // Calculate enrollments and enrollment metrics
    this.totalEnrollments = allEnrollments.length;
    this.enrollmentsThisMonth = this.countEnrollmentsThisMonth(allEnrollments);

    // Find courses without teachers
    const courseIdsWithTeachers = new Set(allCourseSections.map(cs => cs.courseId));
    this.coursesWithoutTeacher = allCourses.filter(c => !courseIdsWithTeachers.has(c.id));

    // Find sections without students
    const sectionIdsWithStudents = new Set(allEnrollments.map(e => e.sectionId));
    this.sectionsWithoutStudents = allSections.filter(s => !sectionIdsWithStudents.has(s.id));

    // Build attention items list
    this.attentionItems = [];
    this.coursesWithoutTeacher.forEach(course => {
      this.attentionItems.push({
        type: 'course',
        name: course.name,
        id: course.id,
        link: '/admin-subjects',
      });
    });
    this.sectionsWithoutStudents.forEach(section => {
      this.attentionItems.push({
        type: 'section',
        name: section.name,
        id: section.id,
        link: '/admin-enrollments',
      });
    });

    this.recentStudents = this.students.getAll().slice(0, 5);
    this.recentTeachers = this.teachers.getAll().slice(0, 5);
    this.recentActivities = (await this.activities.getAllActivities()).slice(0, 5);
    this.recentAnnouncements = allAnnouncements.slice(0, 5);

    this.cdr.detectChanges();
  }

  private countEnrollmentsThisMonth(enrollments: Enrollment[]): number {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    return enrollments.filter(e => {
      try {
        const enrollDate = new Date(e.enrolledAt);
        return enrollDate.getMonth() === currentMonth && enrollDate.getFullYear() === currentYear;
      } catch {
        return false;
      }
    }).length;
  }
}
