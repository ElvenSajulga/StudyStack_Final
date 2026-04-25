import { Component, OnDestroy, OnInit, inject, PLATFORM_ID, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  Activity, ActivityService, ActivitySubmission, AttendanceStatus
} from '../../services/activity.service';
import { AuthService } from '../../services/auth.service';
import { AcademicService, Subject } from '../../services/academic.service';
import { TeacherAccountService } from '../../services/teacher-account.service';
import { QuizService, QuizQuestion } from '../../services/quiz.service';

const CARD_COLORS = [
  '#1e7e34', '#1565c0', '#e65100', '#6a1b9a',
  '#00695c', '#c62828', '#2e7d32', '#283593',
];

interface CourseCard {
  subject: Subject;
  activities: Activity[];
  color: string;
  pendingCount: number;
}

@Component({
  selector: 'app-student-activity',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './student-activity.html',
  styleUrl: './student-activity.scss',
})
export class StudentActivity implements OnInit, OnDestroy {
  // ── view state ────────────────────────────────────────────────────────────
  view: 'cards' | 'stream' | 'detail' = 'cards';
  selectedCard: CourseCard | null = null;
  selectedActivity: Activity | null = null;

  // ── data ──────────────────────────────────────────────────────────────────
  courseCards: CourseCard[] = [];
  submissions: Record<string, ActivitySubmission | undefined> = {};
  draftContent: Record<string, string> = {};

  // ── quiz ──────────────────────────────────────────────────────────────────
  quizQuestions: QuizQuestion[] = [];
  quizAnswers: Record<string, string> = {};
  quizSubmitted = false;
  quizLoading = false;

  private enrolledTeacherUIDs: string[] = [];
  private readonly platformId = inject(PLATFORM_ID);
  private refreshTimer?: ReturnType<typeof setInterval>;

  private readonly onVisibility = () => {
    if (document.visibilityState === 'visible') {
      this.zone.run(() => void this.loadAll());
    }
  };

  constructor(
    private readonly activityService: ActivityService,
    private readonly auth: AuthService,
    private readonly academic: AcademicService,
    private readonly teacherService: TeacherAccountService,
    private readonly quizService: QuizService,
    private readonly cdr: ChangeDetectorRef,
    private readonly zone: NgZone,
  ) {}

  ngOnInit(): void {
    void this.init();
    if (isPlatformBrowser(this.platformId)) {
      document.addEventListener('visibilitychange', this.onVisibility);
      this.zone.runOutsideAngular(() => {
        this.refreshTimer = setInterval(() => {
          this.zone.run(() => void this.loadAll());
        }, 30000);
      });
    }
  }

  private get studentID(): string | undefined {
    return this.auth.getCurrentUser()?.studentID;
  }

  private async init(): Promise<void> {
    const user = this.auth.getCurrentUser();
    if (!user) return;
    const sid = user.studentID;
    const sUID = user.UID;
    if (sid) {
      const enrollments = await this.academic.getEnrollments();
      const myEnrollments = enrollments.filter(e =>
        e.studentID === sid || (sUID && e.studentUID === sUID)
      );
      this.enrolledTeacherUIDs = [...new Set(myEnrollments.map(e => e.teacherUID))];
    }
    await this.loadAll();
  }

  private async loadAll(): Promise<void> {
    const sid = this.studentID;

    if (sid) {
      try {
        const subs = await this.activityService.getSubmissionsForStudent(sid);
        for (const sub of subs) {
          this.submissions[sub.activityId] = sub;
          const draft = (this.draftContent[sub.activityId] ?? '').trim();
          if (!draft) this.draftContent[sub.activityId] = sub.content ?? '';
        }
      } catch { /* silent */ }
    }

    const allSubjects = await this.academic.getSubjects();
    const enrolledSubjects = allSubjects.filter(s =>
      this.enrolledTeacherUIDs.includes(s.teacherUID)
    );

    await this.teacherService.reloadFromServer();
    const allTeachers = this.teacherService.getAll();

    const cards: CourseCard[] = [];
    for (let i = 0; i < enrolledSubjects.length; i++) {
      const subject = enrolledSubjects[i];
      const teacher = allTeachers.find(t => t.UID === subject.teacherUID);
      const teacherIDValue = teacher?.teacherID ?? subject.teacherUID;

      let activities: Activity[] = [];
      try {
        activities = await this.activityService.getActivitiesForTeacher(teacherIDValue);
      } catch { /* silent */ }

      for (const a of activities) {
        this.draftContent[a.id] = this.draftContent[a.id] ?? '';
      }

      const pendingCount = activities.filter(a => {
        const sub = this.submissions[a.id];
        return !sub || !sub.submitted;
      }).length;

      cards.push({
        subject,
        activities,
        color: CARD_COLORS[i % CARD_COLORS.length],
        pendingCount,
      });
    }

    this.courseCards = cards;

    if (this.selectedCard) {
      const refreshed = this.courseCards.find(
        c => c.subject.id === this.selectedCard!.subject.id
      );
      if (refreshed) this.selectedCard = refreshed;
    }

    this.cdr.detectChanges();
  }

  // ── navigation ────────────────────────────────────────────────────────────

  openCourse(card: CourseCard): void {
    this.selectedCard = card;
    this.view = 'stream';
    this.cdr.detectChanges();
  }

  async openActivity(activity: Activity): Promise<void> {
    this.selectedActivity = activity;
    this.quizQuestions = [];
    this.quizAnswers = {};
    this.quizSubmitted = false;

    if (activity.type === 'quiz') {
      this.quizLoading = true;
      this.cdr.detectChanges();
      try {
        this.quizQuestions = await this.quizService.getQuestionsForActivity(activity.id);
        // Pre-fill answers if already submitted
        const sub = this.submissions[activity.id];
        if (sub?.quizAnswers) {
          this.quizAnswers = { ...sub.quizAnswers };
          this.quizSubmitted = !!sub.submitted;
        }
      } catch { /* silent */ }
      this.quizLoading = false;
    }

    this.view = 'detail';
    this.cdr.detectChanges();
  }

  goBackToCards(): void {
    this.selectedCard = null;
    this.selectedActivity = null;
    this.view = 'cards';
    this.cdr.detectChanges();
  }

  goBackToStream(): void {
    this.selectedActivity = null;
    this.view = 'stream';
    this.cdr.detectChanges();
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  getAttendanceStatus(activity: Activity): AttendanceStatus {
    const sub = this.submissions[activity.id];
    return this.activityService.getAttendanceStatus(activity, sub);
  }

  statusClass(activity: Activity): string {
    const s = this.getAttendanceStatus(activity);
    if (s === 'present') return 'present';
    if (s === 'late') return 'late';
    return 'absent';
  }

  isClosed(activity: Activity): boolean {
    return new Date() > new Date(activity.closeAt);
  }

  get currentSubmission(): ActivitySubmission | undefined {
    return this.selectedActivity
      ? this.submissions[this.selectedActivity.id]
      : undefined;
  }

  // ── submit output ─────────────────────────────────────────────────────────

  async submitOutput(): Promise<void> {
    const activity = this.selectedActivity;
    const user = this.auth.getCurrentUser();
    const sid = user?.studentID;
    const sUID = user?.UID ?? sid ?? '';
    if (!activity || !sid) return;

    const content = this.draftContent[activity.id] ?? '';
    if (!content.trim()) { alert('Please enter your answer before submitting.'); return; }
    if (this.isClosed(activity)) { alert('This activity is already closed.'); return; }

    const submission = await this.activityService.submitOrUpdateSubmission(
      activity.id, sid, sUID, content,
    );
    this.submissions[activity.id] = submission;
    await this.loadAll();
    this.cdr.detectChanges();
  }

  // ── submit quiz ───────────────────────────────────────────────────────────

  async submitQuiz(): Promise<void> {
    const activity = this.selectedActivity;
    const user = this.auth.getCurrentUser();
    const sid = user?.studentID;
    const sUID = user?.UID ?? sid ?? '';
    if (!activity || !sid) return;
    if (this.isClosed(activity)) { alert('This activity is already closed.'); return; }

    // Check all questions answered
    const unanswered = this.quizQuestions.filter(
      q => q.type !== 'short-answer' && !this.quizAnswers[q.id]
    );
    if (unanswered.length > 0) {
      alert(`Please answer all questions. ${unanswered.length} question(s) remaining.`);
      return;
    }

    // Auto-grade
    const result = this.quizService.gradeQuiz(this.quizQuestions, this.quizAnswers);

    const submission = await this.activityService.submitOrUpdateSubmission(
      activity.id, sid, sUID,
      JSON.stringify(this.quizAnswers),
      { quizAnswers: this.quizAnswers, score: result.totalScore, graded: true },
    );

    this.submissions[activity.id] = submission;
    this.quizSubmitted = true;
    await this.loadAll();
    this.cdr.detectChanges();
  }

  ngOnDestroy(): void {
    if (isPlatformBrowser(this.platformId)) {
      if (this.refreshTimer != null) clearInterval(this.refreshTimer);
      document.removeEventListener('visibilitychange', this.onVisibility);
    }
  }
}