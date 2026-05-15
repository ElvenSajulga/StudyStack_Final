import { Component, OnDestroy, OnInit, NgZone, inject, PLATFORM_ID, ChangeDetectorRef, } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Activity, ActivityService, ActivitySubmission, AttendanceStatus, } from '../../services/activity.service';
import { AuthService } from '../../services/auth.service';
import { AcademicService, Course, Enrollment } from '../../services/academic.service';
import { QuizService, QuizQuestion } from '../../services/quiz.service';
import { StudentQuestion, StudentQuestionService } from '../../services/student-question.service';
import { TeacherAccountService } from '../../services/teacher-account.service';
import { ToastService } from '../../services/toast.service';
import { Subscription } from 'rxjs';

interface CourseCard {
  course: Course;
  enrollment: Enrollment;
  teacherUID: string;
  pendingCount: number;
  /** Total activities the enrolled teacher has posted for this course. */
  totalActivities: number;
  /** Display-friendly teacher name; empty string if unresolvable. */
  teacherName: string;
  /** Teacher's avatar data URL, '' if none. */
  teacherAvatar: string;
  /** ISO date of the most recently posted activity, undefined if none. */
  lastActivityAt?: string;
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

  /** Every question this student has asked, kept fresh via real-time stream. */
  myQuestions: StudentQuestion[] = [];
  private questionsSub?: Subscription;

  isAnsweringQuiz = false;
  filterBy = '';

  private readonly platformId = inject(PLATFORM_ID);
  private readonly zone = inject(NgZone);
  private refreshTimer?: ReturnType<typeof setInterval>;
  private activitiesSub?: Subscription;
  private submissionsSub?: Subscription;
  private currentEnrollments: Enrollment[] = [];
  private currentCourses: Course[] = [];
  private allActivities: Activity[] = [];

  constructor(
    private readonly activityService: ActivityService,
    private readonly auth: AuthService,
    private readonly academic: AcademicService,
    private readonly quizService: QuizService,
    private readonly studentQuestionService: StudentQuestionService,
    private readonly teacherAccountService: TeacherAccountService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadBookmarks();
    void this.initRealtime();
  }

  /**
   * Sets up real-time Firestore listeners for activities and submissions, plus
   * a low-frequency safety-net refresh in case the realtime channel drops.
   *
   * The activity stream re-emits whenever ANY activity changes in Firestore,
   * so freshly created teacher activities reflect on the student side
   * immediately — no manual refresh required.
   */
  private async initRealtime(): Promise<void> {
    const sid = this.studentID;
    if (!sid) return;

    this.loading = true;
    this.loadError = '';

    try {
      const [enrollments, courses] = await Promise.all([
        this.academic.getEnrollmentsByStudentID(sid),
        this.academic.getCourses(),
      ]);
      this.currentEnrollments = enrollments;
      this.currentCourses = courses;

      const teacherUIDs = [...new Set(enrollments.map(e => e.teacherUID))];

      if (isPlatformBrowser(this.platformId)) {
        // Real-time activities stream
        this.activitiesSub = this.activityService
          .watchActivitiesForEnrolledTeacherUIDs(teacherUIDs)
          .subscribe({
            next: activities => {
              this.allActivities = activities;
              this.recomputeFromState();
            },
            error: err => {
              console.error('[StudentActivity] activities stream error:', err);
              // Fallback: one-shot bulk fetch
              void this.activityService
                .getActivitiesForEnrolledTeacherUIDsBulk(teacherUIDs)
                .then(list => {
                  this.allActivities = list;
                  this.recomputeFromState();
                });
            },
          });

        // Real-time submissions stream
        this.submissionsSub = this.activityService
          .watchSubmissionsForStudent(sid)
          .subscribe({
            next: subs => {
              this.submissions = {};
              for (const sub of subs) {
                this.submissions[sub.activityId] = sub;
                if (!this.draftContent[sub.activityId]) {
                  this.draftContent[sub.activityId] = sub.content ?? '';
                }
              }
              this.recomputeFromState();
            },
          });

        // Real-time stream of this student's own questions (and teacher replies)
        const studentUID = this.studentUID;
        if (studentUID) {
          this.questionsSub = this.studentQuestionService
            .watchQuestionsForStudent(studentUID)
            .subscribe({
              next: list => {
                this.myQuestions = list;
                this.cdr.detectChanges();
              },
              error: err => console.warn('myQuestions stream error:', err),
            });
        }

        // Safety-net polling — re-pulls enrollments in case admin changes them
        this.zone.runOutsideAngular(() => {
          this.refreshTimer = setInterval(() => {
            this.zone.run(() => void this.refreshEnrollments());
          }, 60000);
        });
      } else {
        // SSR or no real-time support — single fetch
        const list = await this.activityService
          .getActivitiesForEnrolledTeacherUIDsBulk(teacherUIDs);
        this.allActivities = list;
        const subs = await this.activityService.getSubmissionsForStudent(sid);
        for (const sub of subs) {
          this.submissions[sub.activityId] = sub;
          if (!this.draftContent[sub.activityId]) {
            this.draftContent[sub.activityId] = sub.content ?? '';
          }
        }
        this.recomputeFromState();
      }
    } catch (err: unknown) {
      console.error('[StudentActivity] initRealtime failed:', err);
      this.loadError = err instanceof Error ? err.message : 'Failed to load activities. Please try again.';
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  private async refreshEnrollments(): Promise<void> {
    const sid = this.studentID;
    if (!sid) return;
    try {
      const enrollments = await this.academic.getEnrollmentsByStudentID(sid);
      const teacherUIDs = [...new Set(enrollments.map(e => e.teacherUID))];
      const oldUIDs = [...new Set(this.currentEnrollments.map(e => e.teacherUID))];
      this.currentEnrollments = enrollments;

      // If enrolled teacher set changed, re-subscribe to the activities stream
      const changed =
        teacherUIDs.length !== oldUIDs.length ||
        teacherUIDs.some(u => !oldUIDs.includes(u));

      if (changed) {
        this.activitiesSub?.unsubscribe();
        this.activitiesSub = this.activityService
          .watchActivitiesForEnrolledTeacherUIDs(teacherUIDs)
          .subscribe(activities => {
            this.allActivities = activities;
            this.recomputeFromState();
          });
      }
      this.recomputeFromState();
    } catch (e) {
      console.warn('refreshEnrollments failed:', e);
    }
  }

  /**
   * Rebuilds course cards and the open course's stream from the current
   * cached data. Called whenever activities, submissions, or enrollments
   * change.
   */
  private recomputeFromState(): void {
    const submittedIds = new Set(
      Object.values(this.submissions)
        .filter((s): s is ActivitySubmission => !!s)
        .map(s => s.activityId)
    );

    const cards: CourseCard[] = [];
    for (const e of this.currentEnrollments) {
      const course = this.currentCourses.find(c => c.id === e.courseId);
      if (!course) continue;

      const teacherActivities = this.allActivities.filter(a =>
        this.activityBelongsToTeacherUID(a, e.teacherUID) &&
        this.activityVisibleForEnrollment(a, e),
      );

      const now = new Date();
      const pending = teacherActivities.filter(
        a => !submittedIds.has(a.id) && new Date(a.closeAt) > now,
      ).length;

      // Most recent activity by deadline (proxy for "posted recency").
      const lastActivity = teacherActivities.length === 0
        ? undefined
        : teacherActivities.reduce((latest, a) =>
            new Date(a.deadline).getTime() > new Date(latest.deadline).getTime() ? a : latest,
          );

      const teacher = this.teacherAccountService.getByUID(e.teacherUID);
      const teacherName = teacher
        ? `${teacher.firstname} ${teacher.lastname}`.trim()
        : '';
      const teacherAvatar = teacher?.avatar ?? '';

      cards.push({
        course,
        enrollment: e,
        teacherUID: e.teacherUID,
        pendingCount: pending,
        totalActivities: teacherActivities.length,
        teacherName,
        teacherAvatar,
        lastActivityAt: lastActivity?.deadline,
      });
    }
    this.courseCards = cards;

    // If the student has opened a course, refresh that course's stream too
    if (this.selectedCard) {
      const sel = this.selectedCard;
      this.streamActivities = this.allActivities
        .filter(a =>
          this.activityBelongsToTeacherUID(a, sel.teacherUID) &&
          this.activityVisibleForEnrollment(a, sel.enrollment),
        )
        .sort(
          (a, b) => new Date(b.deadline).getTime() - new Date(a.deadline).getTime(),
        );
    }

    this.cdr.detectChanges();
  }

  /** Resilient teacher-UID matcher used everywhere on the student side. */
  private activityBelongsToTeacherUID(activity: Activity, teacherUID: string): boolean {
    if (activity.teacherUID && activity.teacherUID === teacherUID) return true;
    const teacher = this.teacherAccountService.getByUID(teacherUID);
    if (teacher && activity.teacherID === teacher.teacherID) return true;
    if (activity.teacherID === teacherUID) return true;
    return false;
  }

  /**
   * Course/section match for the student's enrollment. Legacy activities
   * (no `courseId` and/or `sectionId`) fall through so historic data keeps
   * appearing where it used to before per-section scoping was added.
   */
  private activityVisibleForEnrollment(
    activity: Activity,
    enrollment: Enrollment,
  ): boolean {
    if (activity.courseId && activity.courseId !== enrollment.courseId) return false;
    if (activity.sectionId && activity.sectionId !== enrollment.sectionId) return false;
    return true;
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
    void this.initRealtime();
  }

  // ── navigation ────────────────────────────────────────────────────────────────

  async openCourse(card: CourseCard): Promise<void> {
    this.selectedCard = card;
    this.view = 'stream';
    // Stream comes from the live activities cache — no refetch needed.
    this.recomputeFromState();
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
      this.toast.warning('Both label and URL are required');
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
      this.toast.warning('Type your question before sending');
      return;
    }

    const user = this.auth.getCurrentUser();
    const studentUID = (user as any)?.UID;
    const studentID = user?.studentID;
    const studentName = (user as any)?.displayName || 'Student';

    if (!studentUID || !studentID || !this.selectedActivity || !this.selectedCard) {
      this.toast.error('Unable to send question', { text: 'Missing required information.' });
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
      this.toast.success('Question sent', { text: 'Your teacher will be notified.' });
      this.closeQuestionModal();
    } catch (error) {
      console.error('Error sending question:', error);
      this.toast.error('Failed to send question', { text: 'Please try again later.' });
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
      this.toast.warning('This activity is already closed');
      return;
    }

    try {
      if (activity.type === 'quiz') {
        const questions = this.quizQuestions[activity.id] ?? [];
        if (questions.length === 0) {
          this.toast.error('No questions loaded');
          return;
        }
        const answers = this.quizAnswers[activity.id] ?? {};
        const unanswered = questions.filter(q => !answers[q.id]);
        if (unanswered.length > 0) {
          this.toast.warning('Answer all questions before submitting');
          return;
        }
        // Auto-grade the quiz at submit time so the score is captured atomically
        // with the submission. Without this, quiz submissions persisted with
        // score=0 and the student saw nothing until the teacher manually graded.
        const { totalScore } = this.quizService.gradeQuiz(questions, answers);
        const sub = await this.activityService.submitOrUpdateSubmission(
          activity.id, sid, sUID, content,
          { quizAnswers: answers, score: totalScore, graded: true }
        );
        this.submissions[activity.id] = sub;
        // Quiz is now locked — close the answering panel.
        this.isAnsweringQuiz = false;
      } else {
        if (!content.trim() && (!this.submissionLinks[activity.id] || this.submissionLinks[activity.id].length === 0)) {
          this.toast.warning('Enter an answer or add at least one link');
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
      this.toast.success('Submitted');
    } catch (e) {
      console.error('Submit failed:', e);
      const message = e instanceof Error ? e.message : 'Please try again.';
      this.toast.error('Submit failed', { text: message });
    }
  }

  ngOnDestroy(): void {
    if (this.refreshTimer != null) clearInterval(this.refreshTimer);
    this.activitiesSub?.unsubscribe();
    this.submissionsSub?.unsubscribe();
    this.questionsSub?.unsubscribe();
  }

  /** Helper for the activity-detail template — questions by this student for the selected activity. */
  myQuestionsForActivity(activityId: string): StudentQuestion[] {
    return this.myQuestions.filter(q => q.activityId === activityId);
  }
}