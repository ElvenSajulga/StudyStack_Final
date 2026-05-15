import { Component, OnInit, OnDestroy, ChangeDetectorRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Activity, ActivityService, ActivitySubmission, ActivityType } from '../../services/activity.service';
import { QuizQuestion, QuizService, QuestionChoice } from '../../services/quiz.service';
import { NotificationService } from '../../services/notification.service';
import { AuthService } from '../../services/auth.service';
import { StudentAccountService } from '../../services/student-account.service';
import { AcademicService, Course, CourseSection } from '../../services/academic.service';
import { StudentQuestion, StudentQuestionService } from '../../services/student-question.service';
import { ToastService } from '../../services/toast.service';
import { Subscription } from 'rxjs';

interface CourseCard {
  courseSection: CourseSection;
  course: Course;
  /** Section name (e.g. "BSIT 2A"), '' if unresolvable. */
  sectionName: string;
  /** Distinct students enrolled in this (course, section) for this teacher. */
  enrollmentCount: number;
  /** Activities the teacher has created for this course. */
  activityCount: number;
  /** Submitted-but-not-graded submissions across this teacher's activities for this course. */
  pendingGradingCount: number;
  /** ISO timestamp of the most recent submission received (any activity), undefined if none. */
  lastSubmissionAt?: string;
}

type TeacherView = 'courses' | 'list' | 'create' | 'edit' | 'quiz-builder' | 'grade' | 'questions';

@Component({
  selector: 'app-teacher-activity',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './teacher-activity.html',
  styleUrl: './teacher-activity.scss',
})
export class TeacherActivity implements OnInit, OnDestroy {
  view: TeacherView = 'courses';
  courseCards: CourseCard[] = [];
  selectedCourseCard: CourseCard | null = null;
  activities: Activity[] = [];
  loading = false;

  // Per-activity question counts shown on the activity list cards.
  questionCounts: Record<string, { total: number; unanswered: number }> = {};

  // Q&A view state.
  questionsActivity: Activity | null = null;
  activityQuestions: StudentQuestion[] = [];
  replyDrafts: Record<string, string> = {};
  sendingReplyFor: string | null = null;
  private questionsSub?: Subscription;

  form: {
    title: string; description: string; type: ActivityType;
    deadline: string; closeAt: string; maxPoints?: number; shuffleQuestions?: boolean;
  } = { title: '', description: '', type: 'quiz', deadline: '', closeAt: '', shuffleQuestions: false };

  selectedActivity: Activity | null = null;
  questions: QuizQuestion[] = [];
  savingQuiz = false;

  isNewQuiz = false;
  newQuizForm: {
    title: string; description: string; type: ActivityType;
    deadline: string; closeAt: string; maxPoints?: number; shuffleQuestions?: boolean;
  } | null = null;

  editingActivity: Activity | null = null;
  editingHasSubmissions = false;
  savingEdit = false;

  showDuplicateModal = false;
  duplicateSourceActivity: Activity | null = null;
  /** CourseSection id of the (course, section) the copy should be added to. */
  duplicateTargetCourseSectionId = '';
  duplicating = false;

  gradingActivity: Activity | null = null;
  submissions: ActivitySubmission[] = [];
  selectedSubmission: ActivitySubmission | null = null;
  gradingQuestions: QuizQuestion[] = [];
  gradeScore = 0;
  gradeFeedback = '';
  releasingScores = false;

  constructor(
    private readonly activityService: ActivityService,
    private readonly quizService: QuizService,
    private readonly notificationService: NotificationService,
    private readonly auth: AuthService,
    private readonly studentService: StudentAccountService,
    private readonly academic: AcademicService,
    private readonly studentQuestionService: StudentQuestionService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnDestroy(): void {
    this.questionsSub?.unsubscribe();
  }

  ngOnInit(): void { void this.loadCourseCards(); }

  private get teacherUID(): string | undefined {
    return (this.auth.getCurrentUser() as unknown as { UID?: string })?.UID;
  }

  private get teacherID(): string | undefined {
    return this.auth.getCurrentUser()?.teacherID;
  }

  async loadCourseCards(): Promise<void> {
    const uid = this.teacherUID;
    const teacherID = this.teacherID;
    if (!uid) { this.courseCards = []; this.cdr.detectChanges(); return; }

    this.loading = true;
    const [courseSections, courses, sections, enrollments, activities] = await Promise.all([
      this.academic.getCourseSectionsByTeacher(uid),
      this.academic.getCourses(),
      this.academic.getSections(),
      this.academic.getEnrollmentsByTeacher(uid),
      teacherID
        ? this.activityService.getActivitiesForTeacher(teacherID)
        : Promise.resolve([] as Activity[]),
    ]);

    // Group enrollments by (courseId, sectionId) so distinct student counts
    // are scoped to the right card even if a teacher has multiple sections.
    const enrollmentKey = (courseId: string, sectionId: string) => `${courseId}::${sectionId}`;
    const enrollmentsByKey = new Map<string, Set<string>>();
    for (const e of enrollments) {
      const k = enrollmentKey(e.courseId, e.sectionId);
      const set = enrollmentsByKey.get(k) ?? new Set<string>();
      set.add(e.studentUID);
      enrollmentsByKey.set(k, set);
    }

    // Activities grouped by (courseId, sectionId) for fast lookup. Each card
    // represents one (course, section) the teacher teaches; legacy activities
    // (no sectionId) are bucketed under every section of their course so they
    // still appear where they used to before per-section scoping existed.
    const activityKey = (courseId: string, sectionId: string) =>
      `${courseId}::${sectionId}`;
    const activitiesByKey = new Map<string, Activity[]>();
    for (const a of activities) {
      if (!a.courseId) continue;
      if (a.sectionId) {
        const k = activityKey(a.courseId, a.sectionId);
        const list = activitiesByKey.get(k) ?? [];
        list.push(a);
        activitiesByKey.set(k, list);
      } else {
        // Legacy: fan out to every section of this course that this teacher teaches.
        for (const cs of courseSections) {
          if (cs.courseId !== a.courseId) continue;
          const k = activityKey(cs.courseId, cs.sectionId);
          const list = activitiesByKey.get(k) ?? [];
          list.push(a);
          activitiesByKey.set(k, list);
        }
      }
    }

    // Pre-fetch every submission for the teacher's activities once, then
    // partition by activity id. Avoids N+1 reads per card.
    const allActivityIds = activities.map(a => a.id);
    const allSubmissions = allActivityIds.length === 0
      ? []
      : await this.activityService.getSubmissionsForActivities(allActivityIds);
    const submissionsByActivity = new Map<string, ActivitySubmission[]>();
    for (const sub of allSubmissions) {
      const list = submissionsByActivity.get(sub.activityId) ?? [];
      list.push(sub);
      submissionsByActivity.set(sub.activityId, list);
    }

    const cards: CourseCard[] = [];
    for (const cs of courseSections) {
      const course = courses.find(c => c.id === cs.courseId);
      if (!course) continue;

      const section = sections.find(s => s.id === cs.sectionId);
      const sectionName = section?.name ?? '';

      const studentSet = enrollmentsByKey.get(enrollmentKey(cs.courseId, cs.sectionId));
      const enrollmentCount = studentSet?.size ?? 0;

      const courseActivities = activitiesByKey.get(activityKey(cs.courseId, cs.sectionId)) ?? [];

      let pendingGradingCount = 0;
      let lastSubmissionAt: string | undefined;
      for (const activity of courseActivities) {
        // Once an activity's scores are released, none of its submissions are
        // "pending grading" anymore — releasing is the explicit close-out
        // signal. This keeps the badge accurate even for activities where the
        // teacher releases without manually grading every quiz.
        const activityReleased = activity.scoresReleased === true;
        const subs = submissionsByActivity.get(activity.id) ?? [];
        for (const sub of subs) {
          if (sub.submitted && !sub.graded && !activityReleased) pendingGradingCount++;
          if (sub.submitted) {
            if (!lastSubmissionAt || new Date(sub.submittedAt) > new Date(lastSubmissionAt)) {
              lastSubmissionAt = sub.submittedAt;
            }
          }
        }
      }

      cards.push({
        courseSection: cs,
        course,
        sectionName,
        enrollmentCount,
        activityCount: courseActivities.length,
        pendingGradingCount,
        lastSubmissionAt,
      });
    }

    this.courseCards = cards;
    this.loading = false;
    this.cdr.detectChanges();

    void this.checkAndNotifyPendingGrading();
  }

  private async checkAndNotifyPendingGrading(): Promise<void> {
    const teacherID = this.teacherID;
    const teacherUID = this.teacherUID;
    if (!teacherID || !teacherUID) return;

    try {
      const activities = await this.activityService.getActivitiesForTeacher(teacherID);
      if (activities.length === 0) return;

      // Find activities that are closed (deadline already past) — closed activities
      // with ungraded submissions are the ones worth pinging the teacher about.
      const now = Date.now();
      const closed = activities.filter(a => {
        if (!a.closeAt) return false;
        const t = new Date(a.closeAt).getTime();
        return !isNaN(t) && t < now;
      });
      if (closed.length === 0) return;

      // Existing pending-grading notifications for this teacher, indexed by activityId
      const existing = await this.notificationService.getForUser(teacherUID);
      const existingActivityIds = new Set(
        existing
          .filter(n => n.type === 'grading-pending' && n.activityId)
          .map(n => n.activityId as string)
      );

      for (const activity of closed) {
        if (existingActivityIds.has(activity.id)) continue;

        const subs = await this.activityService.getSubmissionsForActivity(activity.id);
        const ungraded = subs.filter(s => s.submitted && !s.graded);
        if (ungraded.length === 0) continue;

        await this.notificationService.createNotification({
          recipientUID: teacherUID,
          type: 'grading-pending',
          title: 'Grading pending',
          message: `${activity.title} has ${ungraded.length} ungraded submission${ungraded.length === 1 ? '' : 's'}.`,
          activityId: activity.id,
          read: false,
          createdAt: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.warn('checkAndNotifyPendingGrading failed:', e);
    }
  }

  async openCourse(card: CourseCard): Promise<void> {
    this.selectedCourseCard = card;
    this.view = 'list';
    await this.loadActivities();
  }

  async loadActivities(): Promise<void> {
    const id = this.teacherID;
    if (!id || !this.selectedCourseCard) { this.activities = []; this.cdr.detectChanges(); return; }
    this.loading = true;
    const all = await this.activityService.getActivitiesForTeacher(id);
    const courseId = this.selectedCourseCard.course.id;
    const sectionId = this.selectedCourseCard.courseSection.sectionId;
    // Legacy activities have no `sectionId` and remain visible to every
    // section of their course — only freshly-created activities are scoped.
    this.activities = all.filter(a =>
      a.courseId === courseId && (!a.sectionId || a.sectionId === sectionId)
    );
    this.loading = false;
    this.cdr.detectChanges();

    void this.loadQuestionCounts();
  }

  /** Pre-fetches question counts for every activity in the list so cards can show a badge. */
  private async loadQuestionCounts(): Promise<void> {
    const teacherUID = this.teacherUID;
    if (!teacherUID) return;
    try {
      const all = await this.studentQuestionService.getQuestionsForTeacher(teacherUID);
      const counts: Record<string, { total: number; unanswered: number }> = {};
      for (const q of all) {
        const bucket = counts[q.activityId] ?? { total: 0, unanswered: 0 };
        bucket.total += 1;
        if (!q.answered) bucket.unanswered += 1;
        counts[q.activityId] = bucket;
      }
      this.questionCounts = counts;
      this.cdr.detectChanges();
    } catch (e) {
      console.warn('loadQuestionCounts failed:', e);
    }
  }

  questionCountFor(activityId: string): { total: number; unanswered: number } {
    return this.questionCounts[activityId] ?? { total: 0, unanswered: 0 };
  }

  async openQuestions(activity: Activity): Promise<void> {
    this.questionsActivity = activity;
    this.activityQuestions = [];
    this.replyDrafts = {};
    this.view = 'questions';
    this.cdr.detectChanges();

    this.questionsSub?.unsubscribe();
    this.questionsSub = this.studentQuestionService
      .watchQuestionsForActivity(activity.id)
      .subscribe({
        next: list => {
          this.activityQuestions = list;
          // Seed the draft for unanswered questions so users can keep typing
          // without losing focus when the stream re-emits.
          for (const q of list) {
            if (!q.answered && !(q.id in this.replyDrafts)) {
              this.replyDrafts[q.id] = '';
            }
          }
          this.cdr.detectChanges();
        },
        error: err => console.warn('watchQuestionsForActivity error:', err),
      });
  }

  async sendReply(question: StudentQuestion): Promise<void> {
    const draft = (this.replyDrafts[question.id] ?? '').trim();
    if (!draft) {
      this.toast.warning('Type a reply before sending');
      return;
    }
    this.sendingReplyFor = question.id;
    try {
      await this.studentQuestionService.answerQuestion(question, draft);
      this.replyDrafts[question.id] = '';
      this.toast.success('Reply sent');
      // The stream subscription will refresh activityQuestions; also bump the
      // count badge optimistically so the list-view chip updates on back-nav.
      const counts = this.questionCountFor(question.activityId);
      if (counts.unanswered > 0) {
        this.questionCounts[question.activityId] = {
          total: counts.total,
          unanswered: counts.unanswered - 1,
        };
      }
    } catch (e) {
      console.error('sendReply failed:', e);
      this.toast.error('Failed to send reply');
    } finally {
      this.sendingReplyFor = null;
      this.cdr.detectChanges();
    }
  }

  goBackToCourses(): void {
    this.view = 'courses';
    this.selectedCourseCard = null;
    this.activities = [];
  }

  showCreate(): void {
    this.form = { title: '', description: '', type: 'quiz', deadline: '', closeAt: '', shuffleQuestions: false };
    this.view = 'create';
  }

  async openQuizBuilder(activity: Activity): Promise<void> {
    this.selectedActivity = activity;
    this.questions = await this.quizService.getQuestionsForActivity(activity.id);
    if (this.questions.length === 0) this.addQuestion();
    this.view = 'quiz-builder';
    this.cdr.detectChanges();
  }

  async openGrading(activity: Activity): Promise<void> {
    this.gradingActivity = activity;
    this.submissions = await this.activityService.getSubmissionsForActivity(activity.id);
    if (activity.type === 'quiz') {
      this.gradingQuestions = await this.quizService.getQuestionsForActivity(activity.id);
      // Reconcile every quiz submission's stored score with what the current
      // questions say. Legacy submissions persisted with score=0 because the
      // student-side submit path didn't auto-grade; this catches those up so
      // both the teacher's "Auto-graded score" and the student's released
      // score reflect reality. Cheap: the comparison is local, and we only
      // write when the stored value is actually stale.
      await this.reconcileQuizScores();
    }
    this.selectedSubmission = this.submissions.length > 0 ? this.submissions[0] : null;
    if (this.selectedSubmission) this.initGradeForm(this.selectedSubmission);
    this.view = 'grade';
    this.cdr.detectChanges();
  }

  private async reconcileQuizScores(): Promise<void> {
    if (this.gradingQuestions.length === 0) return;
    const writes: Promise<void>[] = [];
    for (const sub of this.submissions) {
      if (!sub.submitted) continue;
      const { totalScore } = this.quizService.gradeQuiz(
        this.gradingQuestions,
        sub.quizAnswers ?? {},
      );
      if (sub.score !== totalScore || !sub.graded) {
        sub.score = totalScore;
        sub.graded = true;
        writes.push(
          this.activityService.gradeSubmission(sub.id, totalScore, sub.feedback ?? ''),
        );
      }
    }
    if (writes.length > 0) {
      await Promise.all(writes);
    }
  }

  backToList(): void {
    if (this.isNewQuiz) {
      this.isNewQuiz = false;
      this.newQuizForm = null;
      this.selectedActivity = null;
      this.questions = [];
      this.view = 'list';
      void this.loadActivities();
      return;
    }
    this.view = 'list';
    this.selectedActivity = null;
    this.gradingActivity = null;
    this.selectedSubmission = null;
    this.editingActivity = null;
    this.editingHasSubmissions = false;
    this.questionsActivity = null;
    this.activityQuestions = [];
    this.replyDrafts = {};
    this.questionsSub?.unsubscribe();
    this.questionsSub = undefined;
    void this.loadActivities();
  }

  private toLocalDatetimeInput(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const mi = pad(d.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
  }

  async openEditActivity(activity: Activity): Promise<void> {
    this.editingActivity = activity;
    this.form = {
      title: activity.title,
      description: activity.description ?? '',
      type: activity.type,
      deadline: this.toLocalDatetimeInput(activity.deadline),
      closeAt: this.toLocalDatetimeInput(activity.closeAt),
      maxPoints: activity.maxPoints,
      shuffleQuestions: activity.shuffleQuestions ?? false,
    };

    try {
      const subs = await this.activityService.getSubmissionsForActivity(activity.id);
      this.editingHasSubmissions = subs.some(s => s.submitted);
    } catch {
      this.editingHasSubmissions = false;
    }

    this.view = 'edit';
    this.cdr.detectChanges();
  }

  async saveEditActivity(): Promise<void> {
    if (!this.editingActivity) return;

    const title = this.form.title.trim();
    const deadline = this.form.deadline.trim();
    const closeAt = this.form.closeAt.trim();

    if (!title) {
      this.toast.warning('Title required');
      return;
    }
    if (!deadline) {
      this.toast.warning('Deadline required');
      return;
    }
    if (!closeAt) {
      this.toast.warning('Close time required');
      return;
    }
    if (new Date(closeAt) <= new Date(deadline)) {
      this.toast.warning('Close time must be after the deadline');
      return;
    }

    const newCloseAtIso = new Date(closeAt).toISOString();
    const closeAtInPast = new Date(newCloseAtIso) < new Date();

    if (closeAtInPast && this.editingHasSubmissions) {
      const ok = await this.toast.confirm('Close time is in the past', {
        text: 'Setting close time to the past will prevent further submissions.',
        confirmText: 'Continue',
        confirmColor: '#d97706',
      });
      if (!ok) return;
    }

    const changes: Partial<Activity> = {
      title,
      description: this.form.description.trim(),
      deadline: new Date(deadline).toISOString(),
      closeAt: newCloseAtIso,
    };

    if (this.editingActivity.type === 'output') {
      changes.maxPoints = this.form.maxPoints;
    }

    if (this.editingActivity.type === 'quiz' && !this.editingHasSubmissions) {
      changes.shuffleQuestions = this.form.shuffleQuestions ?? false;
    }

    this.savingEdit = true;
    try {
      await this.activityService.updateActivity(this.editingActivity.id, changes);
      this.toast.success('Activity updated');
      this.editingActivity = null;
      this.editingHasSubmissions = false;
      this.view = 'list';
      await this.loadActivities();
    } finally {
      this.savingEdit = false;
      this.cdr.detectChanges();
    }
  }

  async createActivity(): Promise<void> {
    const teacherID = this.teacherID;
    const teacherUID = this.teacherUID;
    if (!teacherID || !teacherUID || !this.selectedCourseCard) { this.toast.warning('Select a course first'); return; }
    const title = this.form.title.trim();
    const deadline = this.form.deadline.trim();
    const closeAt = this.form.closeAt.trim();
    if (!title || !deadline || !closeAt) { this.toast.warning('Fill in title, deadline, and close time'); return; }
    if (new Date(closeAt) <= new Date(deadline)) { this.toast.warning('Close time must be after the deadline'); return; }

    if (this.form.type === 'quiz') {
      // For quiz: store locally and go to builder — don't write to Firestore yet
      this.isNewQuiz = true;
      this.newQuizForm = { ...this.form };
      this.selectedActivity = null;
      this.questions = [];
      this.addQuestion();
      this.view = 'quiz-builder';
      this.cdr.detectChanges();
    } else {
      try {
        await this.activityService.createActivity({
          title, description: this.form.description.trim(),
          type: this.form.type,
          deadline: new Date(deadline).toISOString(),
          closeAt: new Date(closeAt).toISOString(),
          teacherID, teacherUID,
          courseId: this.selectedCourseCard.course.id,
          sectionId: this.selectedCourseCard.courseSection.sectionId,
          maxPoints: this.form.maxPoints,
          shuffleQuestions: undefined,
        });
        this.view = 'list';
        await this.loadActivities();
        this.toast.success('Activity created');
      } catch {
        this.toast.error('Failed to create activity');
      }
    }
  }

  async deleteActivity(activity: Activity): Promise<void> {
    const ok = await this.toast.confirmDestructive('Delete activity?', {
      text: 'This will also delete all student submissions.',
    });
    if (!ok) return;
    try {
      await this.activityService.deleteActivity(activity.id);
      if (activity.type === 'quiz') await this.quizService.deleteAllQuestionsForActivity(activity.id);
      await this.loadActivities();
      this.toast.success('Activity deleted');
    } catch {
      this.toast.error('Failed to delete activity');
    }
  }

  // ── Quiz Builder ──────────────────────────────────────────────────────────

  addQuestion(): void {
    const q: QuizQuestion = {
      id: this.quizService.generateId(),
      activityId: this.selectedActivity?.id ?? '',
      teacherID: this.teacherID ?? '',
      type: 'multiple-choice',
      question: '',
      choices: [
        { id: this.quizService.generateId(), text: '' },
        { id: this.quizService.generateId(), text: '' },
      ],
      correctAnswer: '', points: 1,
      order: this.questions.length,
    };
    this.questions.push(q);
    this.cdr.detectChanges();
  }

  removeQuestion(index: number): void {
    this.questions.splice(index, 1);
    this.reorderQuestions();
  }

  moveUp(index: number): void {
    if (index === 0) return;
    [this.questions[index - 1], this.questions[index]] = [this.questions[index], this.questions[index - 1]];
    this.reorderQuestions();
  }

  moveDown(index: number): void {
    if (index === this.questions.length - 1) return;
    [this.questions[index + 1], this.questions[index]] = [this.questions[index], this.questions[index + 1]];
    this.reorderQuestions();
  }

  private reorderQuestions(): void {
    this.questions.forEach((q, i) => (q.order = i));
    this.cdr.detectChanges();
  }

  onTypeChange(q: QuizQuestion): void {
    if (q.type === 'true-false') {
      q.choices = [{ id: 'true', text: 'True' }, { id: 'false', text: 'False' }];
      q.correctAnswer = 'true';
    } else if (q.type === 'multiple-choice') {
      q.choices = [{ id: this.quizService.generateId(), text: '' }, { id: this.quizService.generateId(), text: '' }];
      q.correctAnswer = '';
    } else {
      q.choices = []; q.correctAnswer = '';
    }
    this.cdr.detectChanges();
  }

  addChoice(q: QuizQuestion): void {
    q.choices.push({ id: this.quizService.generateId(), text: '' });
    this.cdr.detectChanges();
  }

  removeChoice(q: QuizQuestion, choiceId: string): void {
    q.choices = q.choices.filter(c => c.id !== choiceId);
    if (q.correctAnswer === choiceId) q.correctAnswer = '';
    this.cdr.detectChanges();
  }

  trackByQId(_: number, q: QuizQuestion): string { return q.id; }
  trackByCId(_: number, c: QuestionChoice): string { return c.id; }

  get totalQuizPoints(): number {
    return this.questions.reduce((sum, q) => sum + (q.points || 0), 0);
  }

  async saveQuiz(): Promise<void> {
    for (const q of this.questions) {
      if (!q.question.trim()) { this.toast.warning('All questions must have question text'); return; }
      if (q.type !== 'short-answer' && !q.correctAnswer) {
        this.toast.warning('Select a correct answer for every multiple-choice and true/false question'); return;
      }
      if (!q.points || q.points <= 0) { this.toast.warning('Points per question must be greater than 0'); return; }
    }

    if (this.isNewQuiz && this.newQuizForm) {
      // New quiz: create activity in Firestore now, then save questions
      this.savingQuiz = true;
      const teacherID = this.teacherID!;
      const teacherUID = this.teacherUID!;
      const nqf = this.newQuizForm;
      const totalPoints = this.questions.reduce((sum, q) => sum + q.points, 0);

      const newActivity = await this.activityService.createActivity({
        title: nqf.title.trim(),
        description: nqf.description.trim(),
        type: 'quiz',
        deadline: new Date(nqf.deadline).toISOString(),
        closeAt: new Date(nqf.closeAt).toISOString(),
        teacherID,
        teacherUID,
        courseId: this.selectedCourseCard!.course.id,
        sectionId: this.selectedCourseCard!.courseSection.sectionId,
        maxPoints: totalPoints,
        shuffleQuestions: nqf.shuffleQuestions ?? false,
      });

      await this.quizService.saveAllQuestions(
        this.questions.map(q => ({ ...q, activityId: newActivity.id }))
      );

      this.isNewQuiz = false;
      this.newQuizForm = null;
      this.selectedActivity = null;
      this.savingQuiz = false;
      this.toast.success('Quiz created');
      this.view = 'list';
      await this.loadActivities();
      return;
    }

    // Editing existing quiz
    const subs = await this.activityService.getSubmissionsForActivity(this.selectedActivity!.id);
    if (subs.length > 0) {
      const ok = await this.toast.confirm('Students have already submitted', {
        text: 'Saving will recalculate their scores based on the new questions.',
        confirmText: 'Yes, save',
        confirmColor: '#0a7a45',
      });
      if (!ok) return;
    }

    this.savingQuiz = true;
    const totalPoints = this.questions.reduce((sum, q) => sum + q.points, 0);
    await this.activityService.updateActivity(this.selectedActivity!.id, { maxPoints: totalPoints });
    await this.quizService.saveAllQuestions(
      this.questions.map(q => ({ ...q, activityId: this.selectedActivity!.id }))
    );

    if (subs.length > 0) {
      for (const sub of subs) {
        const result = this.quizService.gradeQuiz(this.questions, sub.quizAnswers ?? {});
        await this.activityService.gradeSubmission(sub.id, result.totalScore, sub.feedback ?? '');
      }
    }

    this.savingQuiz = false;
    this.toast.success('Quiz saved');
    this.view = 'list';
    await this.loadActivities();
  }

  // ── Grading ───────────────────────────────────────────────────────────────

  selectSubmission(sub: ActivitySubmission): void {
    this.selectedSubmission = sub;
    this.initGradeForm(sub);
    this.cdr.detectChanges();
  }

  private initGradeForm(sub: ActivitySubmission): void {
    this.gradeScore = sub.score ?? 0;
    this.gradeFeedback = sub.feedback ?? '';
  }

  async saveGrade(): Promise<void> {
    if (!this.selectedSubmission) return;
    await this.activityService.gradeSubmission(
      this.selectedSubmission.id, this.gradeScore, this.gradeFeedback
    );
    this.selectedSubmission.score = this.gradeScore;
    this.selectedSubmission.feedback = this.gradeFeedback;
    this.selectedSubmission.graded = true;
    const idx = this.submissions.findIndex(s => s.id === this.selectedSubmission!.id);
    if (idx !== -1) this.submissions[idx] = { ...this.selectedSubmission };
    this.toast.success('Grade saved');
    this.cdr.detectChanges();
  }

  async releaseScores(): Promise<void> {
    if (!this.gradingActivity) return;
    const ok = await this.toast.confirm('Release scores?', {
      text: 'All students will be notified and can see their scores.',
      confirmText: 'Release',
      confirmColor: '#0a7a45',
    });
    if (!ok) return;

    this.releasingScores = true;
    await this.activityService.releaseScores(this.gradingActivity.id);

    const studentUIDs = this.submissions
      .filter(s => s.submitted && s.studentUID)
      .map(s => s.studentUID);

    await this.notificationService.notifyScoreRelease(
      studentUIDs, this.gradingActivity.title, this.gradingActivity.id
    );

    this.gradingActivity.scoresReleased = true;
    this.releasingScores = false;
    this.toast.success('Scores released');
    this.cdr.detectChanges();
  }

  getCorrectAnswerText(q: QuizQuestion): string {
    if (q.type === 'short-answer') return q.correctAnswer;
    return q.choices.find(c => c.id === q.correctAnswer)?.text ?? q.correctAnswer;
  }

  getStudentAnswerText(q: QuizQuestion, sub: ActivitySubmission): string {
    const ans = sub.quizAnswers?.[q.id] ?? '—';
    if (q.type === 'short-answer') return ans;
    return q.choices.find(c => c.id === ans)?.text ?? ans;
  }

  isCorrect(q: QuizQuestion, sub: ActivitySubmission): boolean {
    return (sub.quizAnswers?.[q.id] ?? '').trim().toLowerCase() ===
      (q.correctAnswer ?? '').trim().toLowerCase();
  }

  /**
   * Live-computed quiz score for the displayed submission. Uses the same
   * grader as `quizService.gradeQuiz` against the currently-loaded questions,
   * so the badge labels (Correct / Wrong) and the totals line can't disagree
   * even if the persisted `score` is briefly stale.
   */
  liveQuizScore(sub: ActivitySubmission | null): number {
    if (!sub) return 0;
    if (this.gradingQuestions.length === 0) return sub.score ?? 0;
    const { totalScore } = this.quizService.gradeQuiz(
      this.gradingQuestions,
      sub.quizAnswers ?? {},
    );
    return totalScore;
  }

  getStudentName(sub: ActivitySubmission): string {
    const s = this.studentService.getAll().find(st => st.studentID === sub.studentID);
    return s ? `${s.lastname}, ${s.firstname}` : sub.studentID;
  }

  totalMaxPoints(): number {
    return this.gradingQuestions.reduce((sum, q) => sum + q.points, 0);
  }

  isActivityClosed(a: Activity): boolean {
    return new Date() > new Date(a.closeAt);
  }

  // ── Grading navigation & progress ─────────────────────────────────────────

  get selectedSubmissionIndex(): number {
    if (!this.selectedSubmission) return -1;
    return this.submissions.indexOf(this.selectedSubmission);
  }

  get totalSubmissions(): number {
    return this.submissions.length;
  }

  get gradedCount(): number {
    return this.submissions.filter(s => s.graded).length;
  }

  get gradingProgress(): number {
    if (this.totalSubmissions === 0) return 0;
    return (this.gradedCount / this.totalSubmissions) * 100;
  }

  nextSubmission(): void {
    const idx = this.selectedSubmissionIndex;
    if (idx >= 0 && idx < this.submissions.length - 1) {
      this.selectSubmission(this.submissions[idx + 1]);
    }
  }

  prevSubmission(): void {
    const idx = this.selectedSubmissionIndex;
    if (idx > 0) {
      this.selectSubmission(this.submissions[idx - 1]);
    }
  }

  @HostListener('document:keydown', ['$event'])
  handleGradingKeys(e: KeyboardEvent): void {
    if (this.view !== 'grade') return;

    // Don't hijack arrow keys when the user is typing in a form field
    const target = e.target as HTMLElement | null;
    if (target) {
      const tag = target.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        target.isContentEditable
      ) {
        return;
      }
    }

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      this.nextSubmission();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      this.prevSubmission();
    }
  }

  // ── Duplicate ─────────────────────────────────────────────────────────────

  /**
   * Every (course, section) the teacher teaches except the one the source
   * activity already belongs to. Lets a teacher duplicate across both
   * different courses AND different sections of the same course.
   */
  get otherCourseCards(): CourseCard[] {
    if (!this.selectedCourseCard) return this.courseCards;
    const currentCsId = this.selectedCourseCard.courseSection.id;
    return this.courseCards.filter(c => c.courseSection.id !== currentCsId);
  }

  get hasOnlyOneCourseSection(): boolean {
    return this.courseCards.length <= 1;
  }

  openDuplicateModal(activity: Activity): void {
    this.duplicateSourceActivity = activity;
    this.duplicateTargetCourseSectionId = '';
    this.showDuplicateModal = true;
    this.cdr.detectChanges();
  }

  closeDuplicateModal(): void {
    this.showDuplicateModal = false;
    this.duplicateSourceActivity = null;
    this.duplicateTargetCourseSectionId = '';
    this.cdr.detectChanges();
  }

  async duplicateActivity(): Promise<void> {
    if (!this.duplicateSourceActivity) return;

    const teacherID = this.teacherID;
    const teacherUID = this.teacherUID;
    if (!teacherID || !teacherUID) {
      this.toast.error('Not signed in', { text: 'You must be signed in as a teacher.' });
      return;
    }

    if (!this.duplicateTargetCourseSectionId) {
      this.toast.warning('Choose a target course / section');
      return;
    }

    const target = this.courseCards.find(
      c => c.courseSection.id === this.duplicateTargetCourseSectionId,
    );
    if (!target) {
      this.toast.warning('That target is no longer available');
      return;
    }

    const source = this.duplicateSourceActivity;

    this.duplicating = true;
    try {
      const newActivity = await this.activityService.createActivity({
        title: `${source.title} (copy)`,
        description: source.description ?? '',
        type: source.type,
        teacherID,
        teacherUID,
        courseId: target.course.id,
        sectionId: target.courseSection.sectionId,
        deadline: '',
        closeAt: '',
        maxPoints: source.maxPoints,
        shuffleQuestions: source.type === 'quiz' ? source.shuffleQuestions : undefined,
      });

      if (source.type === 'quiz') {
        const sourceQuestions = await this.quizService.getQuestionsForActivity(source.id);
        if (sourceQuestions.length > 0) {
          const clonedQuestions: QuizQuestion[] = sourceQuestions.map(q => ({
            ...q,
            id: this.quizService.generateId(),
            activityId: newActivity.id,
            teacherID,
            choices: q.choices.map(c => ({ ...c })),
          }));
          await this.quizService.saveAllQuestions(clonedQuestions);
        }
      }

      await this.toast.alert('Activity duplicated', {
        text: 'Remember to set the deadline and close time before students can submit.',
        confirmColor: '#0a7a45',
      }, 'success');

      this.closeDuplicateModal();
      await this.loadActivities();
    } catch (e) {
      console.error('Duplicate activity failed:', e);
      this.toast.error('Duplication failed', { text: 'Please try again.' });
    } finally {
      this.duplicating = false;
      this.cdr.detectChanges();
    }
  }
}