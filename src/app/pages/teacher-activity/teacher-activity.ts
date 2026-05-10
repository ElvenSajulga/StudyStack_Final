import { Component, OnInit, ChangeDetectorRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Activity, ActivityService, ActivitySubmission, ActivityType } from '../../services/activity.service';
import { QuizQuestion, QuizService, QuestionChoice } from '../../services/quiz.service';
import { NotificationService } from '../../services/notification.service';
import { AuthService } from '../../services/auth.service';
import { StudentAccountService } from '../../services/student-account.service';
import { AcademicService, Course, CourseSection } from '../../services/academic.service';
import Swal from 'sweetalert2';

interface CourseCard {
  courseSection: CourseSection;
  course: Course;
}

type TeacherView = 'courses' | 'list' | 'create' | 'edit' | 'quiz-builder' | 'grade';

@Component({
  selector: 'app-teacher-activity',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './teacher-activity.html',
  styleUrl: './teacher-activity.scss',
})
export class TeacherActivity implements OnInit {
  view: TeacherView = 'courses';
  courseCards: CourseCard[] = [];
  selectedCourseCard: CourseCard | null = null;
  activities: Activity[] = [];
  loading = false;

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
  duplicateTargetCourseId = '';
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
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void { void this.loadCourseCards(); }

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
    this.activities = all.filter(a => a.courseId === this.selectedCourseCard!.course.id);
    this.loading = false;
    this.cdr.detectChanges();
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
    }
    this.selectedSubmission = this.submissions.length > 0 ? this.submissions[0] : null;
    if (this.selectedSubmission) this.initGradeForm(this.selectedSubmission);
    this.view = 'grade';
    this.cdr.detectChanges();
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
      await Swal.fire({ icon: 'warning', title: 'Title required', text: 'Please enter an activity title.' });
      return;
    }
    if (!deadline) {
      await Swal.fire({ icon: 'warning', title: 'Deadline required', text: 'Please set a deadline.' });
      return;
    }
    if (!closeAt) {
      await Swal.fire({ icon: 'warning', title: 'Close time required', text: 'Please set a close time.' });
      return;
    }
    if (new Date(closeAt) <= new Date(deadline)) {
      await Swal.fire({ icon: 'warning', title: 'Invalid close time', text: 'Close time must be after the deadline.' });
      return;
    }

    const newCloseAtIso = new Date(closeAt).toISOString();
    const closeAtInPast = new Date(newCloseAtIso) < new Date();

    if (closeAtInPast && this.editingHasSubmissions) {
      const res = await Swal.fire({
        icon: 'warning',
        title: 'Close time is in the past',
        text: 'Setting close time to the past will prevent further submissions. Continue?',
        showCancelButton: true,
        confirmButtonText: 'Continue',
        confirmButtonColor: '#d97706',
      });
      if (!res.isConfirmed) return;
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
      Swal.fire({
        icon: 'success',
        title: 'Activity updated',
        toast: true,
        position: 'top-end',
        timer: 2000,
        showConfirmButton: false,
      });
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
    if (!teacherID || !teacherUID || !this.selectedCourseCard) { alert('You must select a course first.'); return; }
    const title = this.form.title.trim();
    const deadline = this.form.deadline.trim();
    const closeAt = this.form.closeAt.trim();
    if (!title || !deadline || !closeAt) { alert('Please fill in title, deadline, and close time.'); return; }
    if (new Date(closeAt) <= new Date(deadline)) { alert('Close time must be after the deadline.'); return; }

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
      await this.activityService.createActivity({
        title, description: this.form.description.trim(),
        type: this.form.type,
        deadline: new Date(deadline).toISOString(),
        closeAt: new Date(closeAt).toISOString(),
        teacherID, teacherUID, courseId: this.selectedCourseCard.course.id, maxPoints: this.form.maxPoints,
        shuffleQuestions: undefined,
      });
      this.view = 'list';
      await this.loadActivities();
    }
  }

  async deleteActivity(activity: Activity): Promise<void> {
    const res = await Swal.fire({
      icon: 'warning', title: 'Delete activity?',
      text: 'This will also delete all student submissions.',
      showCancelButton: true, confirmButtonText: 'Delete', confirmButtonColor: '#ef4444',
    });
    if (!res.isConfirmed) return;
    await this.activityService.deleteActivity(activity.id);
    if (activity.type === 'quiz') await this.quizService.deleteAllQuestionsForActivity(activity.id);
    await this.loadActivities();
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
      if (!q.question.trim()) { alert('All questions must have question text.'); return; }
      if (q.type !== 'short-answer' && !q.correctAnswer) {
        alert('All multiple choice and true/false questions need a correct answer selected.'); return;
      }
      if (!q.points || q.points <= 0) { alert('Points per question must be greater than 0.'); return; }
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
      Swal.fire({ icon: 'success', title: 'Quiz created!', timer: 1500, showConfirmButton: false });
      this.view = 'list';
      await this.loadActivities();
      return;
    }

    // Editing existing quiz
    const subs = await this.activityService.getSubmissionsForActivity(this.selectedActivity!.id);
    if (subs.length > 0) {
      const res = await Swal.fire({
        icon: 'warning', title: 'Students have already submitted',
        text: 'Saving changes will recalculate their scores based on the new questions. Continue?',
        showCancelButton: true, confirmButtonText: 'Yes, save', confirmButtonColor: '#0a7a45',
      });
      if (!res.isConfirmed) return;
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
    Swal.fire({ icon: 'success', title: 'Quiz saved!', timer: 1500, showConfirmButton: false });
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
    Swal.fire({ icon: 'success', title: 'Grade saved!', timer: 1200, showConfirmButton: false });
    this.cdr.detectChanges();
  }

  async releaseScores(): Promise<void> {
    if (!this.gradingActivity) return;
    const res = await Swal.fire({
      icon: 'question', title: 'Release scores?',
      text: 'All students will be notified and can see their scores.',
      showCancelButton: true, confirmButtonText: 'Release', confirmButtonColor: '#0a7a45',
    });
    if (!res.isConfirmed) return;

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
    Swal.fire({ icon: 'success', title: 'Scores released!', timer: 1500, showConfirmButton: false });
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

  get otherCourseCards(): CourseCard[] {
    if (!this.selectedCourseCard || this.courseCards.length <= 1) {
      return this.courseCards;
    }
    return this.courseCards.filter(
      c => c.course.id !== this.selectedCourseCard!.course.id
    );
  }

  get hasOnlyOneCourse(): boolean {
    return this.courseCards.length <= 1;
  }

  openDuplicateModal(activity: Activity): void {
    this.duplicateSourceActivity = activity;
    this.duplicateTargetCourseId = '';
    this.showDuplicateModal = true;
    this.cdr.detectChanges();
  }

  closeDuplicateModal(): void {
    this.showDuplicateModal = false;
    this.duplicateSourceActivity = null;
    this.duplicateTargetCourseId = '';
    this.cdr.detectChanges();
  }

  async duplicateActivity(): Promise<void> {
    if (!this.duplicateSourceActivity) return;

    const teacherID = this.teacherID;
    const teacherUID = this.teacherUID;
    if (!teacherID || !teacherUID) {
      await Swal.fire({ icon: 'error', title: 'Not signed in', text: 'You must be signed in as a teacher.' });
      return;
    }

    if (!this.duplicateTargetCourseId) {
      await Swal.fire({ icon: 'warning', title: 'Select a course', text: 'Please choose a target course.' });
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
        courseId: this.duplicateTargetCourseId,
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

      await Swal.fire({
        icon: 'success',
        title: 'Activity duplicated!',
        text: 'Remember to set the deadline and close time before students can submit.',
        confirmButtonColor: '#0a7a45',
      });

      this.closeDuplicateModal();
      await this.loadActivities();
    } catch (e) {
      console.error('Duplicate activity failed:', e);
      await Swal.fire({
        icon: 'error',
        title: 'Duplication failed',
        text: 'Something went wrong while duplicating the activity. Please try again.',
      });
    } finally {
      this.duplicating = false;
      this.cdr.detectChanges();
    }
  }
}