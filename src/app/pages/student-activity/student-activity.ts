import { Component, OnDestroy, OnInit, NgZone, inject, PLATFORM_ID, ChangeDetectorRef, } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Activity, ActivityService, ActivitySubmission, AttendanceStatus, } from '../../services/activity.service';
import { AuthService } from '../../services/auth.service';
import { AcademicService, Course, Enrollment } from '../../services/academic.service';
import { QuizService, QuizQuestion } from '../../services/quiz.service';
import { StudentQuestionService } from '../../services/student-question.service';
import { TeacherAccountService } from '../../services/teacher-account.service';
import Swal from 'sweetalert2';

interface CourseCard {
  course: Course;
  enrollment: Enrollment;
  teacherUID: string;
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
  view: 'cards' | 'stream' | 'detail' = 'cards';

  courseCards: CourseCard[] = [];
  selectedCard: CourseCard | null = null;

  streamActivities: Activity[] = [];
  selectedActivity: Activity | null = null;

  submissions: Record<string, ActivitySubmission | undefined> = {};
  draftContent: Record<string, string> = {};
  quizQuestions: Record<string, QuizQuestion[]> = {};
  quizAnswers: Record<string, Record<string, string>> = {};
  submissionLinks: Record<string, { label: string; url: string }[]> = {};

  loading = false;
  loadError = '';
  newLinkLabel: Record<string, string> = {};
  newLinkUrl: Record<string, string> = {};

  bookmarkedIds: Set<string> = new Set();
  showBookmarkedOnly = false;

  showQuestionModal = false;
  questionDraft = '';
  sendingQuestion = false;

  isAnsweringQuiz = false;
  filterBy = '';

  private readonly platformId = inject(PLATFORM_ID);
  private readonly zone = inject(NgZone);
  private refreshTimer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly activityService: ActivityService,
    private readonly auth: AuthService,
    private readonly academic: AcademicService,
    private readonly quizService: QuizService,
    private readonly studentQuestionService: StudentQuestionService,
    private readonly teacherAccountService: TeacherAccountService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadBookmarks();
    void this.loadCourseCards();
    if (isPlatformBrowser(this.platformId)) {
      this.zone.runOutsideAngular(() => {
        this.refreshTimer = setInterval(() => {
          this.zone.run(() => void this.loadCourseCards());
        }, 30000);
      });
    }
    // Debug logging
    setTimeout(() => {
      console.log('[StudentActivity] Loaded data:', {
        courseCardsCount: this.courseCards.length,
        streamActivitiesCount: this.streamActivities.length,
        courseCards: this.courseCards,
        uniqueCourses: this.getUniqueCourses(),
      });
    }, 1000);
  }

  private get studentID(): string | undefined {
    return this.auth.getCurrentUser()?.studentID;
  }

  private get studentUID(): string | undefined {
    return (this.auth.getCurrentUser() as any)?.UID;
  }

  private get bookmarkStorageKey(): string {
    return `ss_bookmarks_${this.studentUID || 'anon'}`;
  }

  private loadBookmarks(): void {
    const raw = localStorage.getItem(this.bookmarkStorageKey);
    if (raw) {
      try {
        this.bookmarkedIds = new Set(JSON.parse(raw));
      } catch {
        // fallback to empty set
      }
    }
  }

  private saveBookmarks(): void {
    localStorage.setItem(this.bookmarkStorageKey, JSON.stringify([...this.bookmarkedIds]));
  }

  toggleBookmark(activityId: string, event: Event): void {
    event.stopPropagation();
    if (this.bookmarkedIds.has(activityId)) {
      this.bookmarkedIds.delete(activityId);
    } else {
      this.bookmarkedIds.add(activityId);
    }
    this.saveBookmarks();
  }

  isBookmarked(activityId: string): boolean {
    return this.bookmarkedIds.has(activityId);
  }

  get filteredActivities(): Activity[] {
    if (!this.showBookmarkedOnly) {
      return this.streamActivities;
    }
    return this.streamActivities.filter(a => this.isBookmarked(a.id));
  }

  retryLoad(): void {
    void this.loadCourseCards();
  }

  private async loadCourseCards(): Promise<void> {
    const sid = this.studentID;
    if (!sid) return;

    this.loading = true;
    this.loadError = '';

    try {
      const [enrollments, courses] = await Promise.all([
        this.academic.getEnrollmentsByStudentID(sid),
        this.academic.getCourses(),
      ]);

      const subs = await this.activityService.getSubmissionsForStudent(sid);
      const submittedIds = new Set(subs.map(s => s.activityId));

      const cards: CourseCard[] = [];
      for (const e of enrollments) {
        const course = courses.find(c => c.id === e.courseId);
        if (!course) continue;

        const activities = await this.activityService
          .getActivitiesForTeacherUID(e.teacherUID);

        const now = new Date();
        const pending = activities.filter(
          a => !submittedIds.has(a.id) && new Date(a.closeAt) > now,
        ).length;

        cards.push({
          course,
          enrollment: e,
          teacherUID: e.teacherUID,
          pendingCount: pending,
        });
      }

      this.courseCards = cards;

      for (const sub of subs) {
        this.submissions[sub.activityId] = sub;
        if (!this.draftContent[sub.activityId]) {
          this.draftContent[sub.activityId] = sub.content ?? '';
        }
      }
    } catch (err: unknown) {
      console.error('[StudentActivity] loadCourseCards failed:', err);
      this.loadError = err instanceof Error ? err.message : 'Failed to load activities. Please try again.';
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  // ── navigation ────────────────────────────────────────────────────────────────

  async openCourse(card: CourseCard): Promise<void> {
    this.selectedCard = card;
    this.view = 'stream';
    await this.loadStream(card);
  }

  private async loadStream(card: CourseCard): Promise<void> {
    this.loading = true;
    const all = await this.activityService
      .getActivitiesForTeacherUID(card.teacherUID);
    this.streamActivities = all.sort(
      (a, b) => new Date(b.deadline).getTime() - new Date(a.deadline).getTime(),
    );
    this.loading = false;
    this.cdr.detectChanges();
  }

  async openActivity(activity: Activity): Promise<void> {
    this.selectedActivity = activity;
    this.view = 'detail';
    if (!this.draftContent[activity.id]) {
      this.draftContent[activity.id] =
        this.submissions[activity.id]?.content ?? '';
    }
    if (!this.submissionLinks[activity.id]) {
      this.submissionLinks[activity.id] =
        this.submissions[activity.id]?.links ?? [];
    }
    if (activity.type === 'quiz' && !this.quizQuestions[activity.id]) {
      const questions = await this.quizService.getQuestionsForActivity(activity.id);
      const displayQuestions = activity.shuffleQuestions
        ? this.quizService.shuffleQuestions(questions)
        : questions;
      this.quizQuestions[activity.id] = displayQuestions;
      if (!this.quizAnswers[activity.id]) {
        this.quizAnswers[activity.id] = this.submissions[activity.id]?.quizAnswers ?? {};
      }
    }
    this.cdr.detectChanges();
  }

  get currentView(): 'courses' | 'stream' | 'detail' {
    if (this.selectedActivity) return 'detail';
    if (this.selectedCard) return 'stream';
    return 'courses';
  }

  backToCourses(): void {
    this.selectedCard = null;
    this.selectedActivity = null;
    this.streamActivities = [];
    this.view = 'cards';
  }

  backToStream(): void {
    this.selectedActivity = null;
    this.view = 'stream';
  }

  goBack(): void {
    if (this.view === 'detail') {
      this.view = 'stream';
      this.selectedActivity = null;
    } else if (this.view === 'stream') {
      this.view = 'cards';
      this.selectedCard = null;
      this.streamActivities = [];
    }
  }

  selectCourse(card: CourseCard): void {
    this.selectedCard = card;
    this.view = 'stream';
  }

  selectActivity(activity: Activity): void {
    this.openActivity(activity);
  }

  // ── helpers ───────────────────────────────────────────────────────────────────

  getAttendanceStatus(activity: Activity): AttendanceStatus {
    return this.activityService.getAttendanceStatus(
      activity, this.submissions[activity.id],
    );
  }

  isOpen(activity: Activity): boolean {
    return new Date() <= new Date(activity.closeAt);
  }

  isPastDeadline(activity: Activity): boolean {
    return new Date() > new Date(activity.deadline);
  }

  hasSubmission(activity: Activity): boolean {
    return !!this.submissions[activity.id];
  }

  canSeeScorerAnswers(activity: Activity): boolean {
    return activity.scoresReleased === true;
  }

  getScorePercentage(activity: Activity): string {
    const sub = this.submissions[activity.id];
    if (!sub || sub.score == null || !activity.maxPoints || activity.maxPoints === 0) {
      return '';
    }
    const percentage = Math.round((sub.score / activity.maxPoints) * 100);
    return `${percentage}%`;
  }

  // ── course card helpers ────────────────────────────────────────────────────────

  getUniqueCourses(): CourseCard[] {
    // Return courseCards which already contain unique courses per enrollment
    return this.courseCards;
  }

  getTotalActivities(courseId?: string): number {
    if (!courseId) return 0;
    return this.streamActivities.filter(a => !a.courseId || a.courseId === courseId).length;
  }

  getPendingActivities(courseId?: string): number {
    if (!courseId) return 0;
    return this.streamActivities.filter(a =>
      (!a.courseId || a.courseId === courseId) &&
      !this.submissions[a.id]?.submitted &&
      new Date(a.closeAt) > new Date()
    ).length;
  }

  getCompletedActivities(courseId?: string): number {
    if (!courseId) return 0;
    return this.streamActivities.filter(a =>
      (!a.courseId || a.courseId === courseId) &&
      this.submissions[a.id]?.submitted
    ).length;
  }

  getCourseCompletionPercent(courseId?: string): number {
    const total = this.getTotalActivities(courseId);
    if (total === 0) return 0;
    const completed = this.getCompletedActivities(courseId);
    return Math.round((completed / total) * 100);
  }

  getCourseStatus(courseId?: string): 'on-track' | 'attention' | 'at-risk' {
    if (!courseId) return 'on-track';
    const completed = this.getCompletedActivities(courseId);
    const total = this.getTotalActivities(courseId);
    if (total === 0) return 'on-track';
    const percent = (completed / total) * 100;
    if (percent >= 80) return 'on-track';
    if (percent >= 50) return 'attention';
    return 'at-risk';
  }

  getCourseStatusIcon(courseId?: string): string {
    const status = this.getCourseStatus(courseId);
    if (status === 'on-track') return 'ti-check-circle';
    if (status === 'attention') return 'ti-alert-circle';
    return 'ti-x-circle';
  }

  // ── activity stream helpers ────────────────────────────────────────────────────

  get filteredActivitiesByStatus(): Activity[] {
    let filtered = this.streamActivities;

    if (this.filterBy === 'pending') {
      filtered = filtered.filter(a =>
        !this.submissions[a.id]?.submitted && this.isOpen(a)
      );
    } else if (this.filterBy === 'completed') {
      filtered = filtered.filter(a => this.submissions[a.id]?.submitted);
    }

    return filtered;
  }

  // ── quiz helpers ──────────────────────────────────────────────────────────────

  startQuiz(activity: Activity): void {
    this.isAnsweringQuiz = true;
    const questions = this.quizQuestions[activity.id] ?? [];
    if (!this.quizAnswers[activity.id]) {
      this.quizAnswers[activity.id] = {};
    }
    for (const q of questions) {
      if (!this.quizAnswers[activity.id][q.id]) {
        this.quizAnswers[activity.id][q.id] = '';
      }
    }
  }

  cancelQuiz(): void {
    this.isAnsweringQuiz = false;
  }

  getSubmissionStatus(): string {
    if (!this.selectedActivity) return 'not started';
    const sub = this.submissions[this.selectedActivity.id];
    if (!sub) return 'not started';
    if (!sub.submitted) return 'draft';
    if (sub.graded) return 'graded';
    return 'submitted';
  }

  getScorePercent(): number {
    if (!this.selectedActivity) return 0;
    const sub = this.submissions[this.selectedActivity.id];
    if (!sub || !sub.score || !this.selectedActivity.maxPoints) return 0;
    return Math.round((sub.score / this.selectedActivity.maxPoints) * 100);
  }

  isActivityOpen(activity: Activity): boolean {
    return new Date(activity.closeAt) > new Date();
  }

  addLink(activity: Activity): void {
    const label = (this.newLinkLabel[activity.id] ?? '').trim();
    const url = (this.newLinkUrl[activity.id] ?? '').trim();
    if (!label || !url) {
      alert('Please enter both label and URL.');
      return;
    }
    if (!this.submissionLinks[activity.id]) {
      this.submissionLinks[activity.id] = [];
    }
    this.submissionLinks[activity.id].push({ label, url });
    this.newLinkLabel[activity.id] = '';
    this.newLinkUrl[activity.id] = '';
    this.cdr.detectChanges();
  }

  removeLink(activity: Activity, index: number): void {
    if (this.submissionLinks[activity.id]) {
      this.submissionLinks[activity.id].splice(index, 1);
      this.cdr.detectChanges();
    }
  }

  // ── question modal ────────────────────────────────────────────────────────────

  openQuestionModal(): void {
    this.showQuestionModal = true;
    this.questionDraft = '';
  }

  closeQuestionModal(): void {
    this.showQuestionModal = false;
  }

  async sendQuestion(): Promise<void> {
    if (!this.questionDraft.trim()) {
      await Swal.fire({
        icon: 'warning',
        title: 'Empty question',
        text: 'Please type your question before sending.',
        confirmButtonText: 'OK',
      });
      return;
    }

    const user = this.auth.getCurrentUser();
    const studentUID = (user as any)?.UID;
    const studentID = user?.studentID;
    const studentName = (user as any)?.displayName || 'Student';

    if (!studentUID || !studentID || !this.selectedActivity || !this.selectedCard) {
      await Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Unable to send question. Missing required information.',
        confirmButtonText: 'OK',
      });
      return;
    }

    this.sendingQuestion = true;

    try {
      // Get the teacher info from the activity's teacherID via teacher account service
      const teachers = this.teacherAccountService.getAll();
      const teacher = teachers.find(t => t.teacherID === this.selectedActivity!.teacherID);

      if (!teacher) {
        throw new Error('Teacher not found');
      }

      const payload: Omit<any, 'id' | 'createdAt' | 'answered'> = {
        activityId: this.selectedActivity.id,
        activityTitle: this.selectedActivity.title,
        studentUID,
        studentID,
        studentName,
        teacherUID: teacher.UID,
        teacherID: teacher.teacherID,
        message: this.questionDraft.trim(),
      };

      await this.studentQuestionService.createQuestion(payload);

      await Swal.fire({
        icon: 'success',
        title: 'Question sent!',
        text: 'Your teacher will be notified and respond when they are available.',
        timer: 1500,
        showConfirmButton: false,
      });

      this.closeQuestionModal();
    } catch (error) {
      console.error('Error sending question:', error);
      await Swal.fire({
        icon: 'error',
        title: 'Failed to send question',
        text: 'Please try again later.',
        confirmButtonText: 'OK',
      });
    } finally {
      this.sendingQuestion = false;
      this.cdr.detectChanges();
    }
  }

  // ── submit ────────────────────────────────────────────────────────────────────

  async submit(activity: Activity): Promise<void> {
    const user = this.auth.getCurrentUser();
    const sid = user?.studentID;
    const sUID = (user as unknown as { UID?: string })?.UID ?? sid ?? '';

    if (!sid) return;
    const content = this.draftContent[activity.id] ?? '';

    if (!this.isOpen(activity)) {
      alert('This activity is already closed.');
      return;
    }

    if (activity.type === 'quiz') {
      const questions = this.quizQuestions[activity.id] ?? [];
      if (questions.length === 0) {
        alert('No questions loaded.');
        return;
      }
      const answers = this.quizAnswers[activity.id] ?? {};
      const unanswered = questions.filter(q => !answers[q.id]);
      if (unanswered.length > 0) {
        alert('Please answer all questions before submitting.');
        return;
      }
      const sub = await this.activityService.submitOrUpdateSubmission(
        activity.id, sid, sUID, content,
        { quizAnswers: answers }
      );
      this.submissions[activity.id] = sub;
    } else {
      if (!content.trim() && (!this.submissionLinks[activity.id] || this.submissionLinks[activity.id].length === 0)) {
        alert('Please enter your answer or add at least one link before submitting.');
        return;
      }
      const links = this.submissionLinks[activity.id] ?? [];
      const sub = await this.activityService.submitOrUpdateSubmission(
        activity.id, sid, sUID, content,
        { links }
      );
      this.submissions[activity.id] = sub;
    }
    this.cdr.detectChanges();
    alert('Submitted successfully!');
  }

  ngOnDestroy(): void {
    if (this.refreshTimer != null) clearInterval(this.refreshTimer);
  }
}