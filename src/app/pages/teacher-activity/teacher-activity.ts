import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Activity, ActivityService, ActivitySubmission, ActivityType } from '../../services/activity.service';
import { QuizQuestion, QuizService, QuestionChoice } from '../../services/quiz.service';
import { NotificationService } from '../../services/notification.service';
import { AuthService } from '../../services/auth.service';
import { StudentAccountService } from '../../services/student-account.service';
import Swal from 'sweetalert2';

type TeacherView = 'list' | 'create' | 'quiz-builder' | 'grade';

@Component({
  selector: 'app-teacher-activity',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './teacher-activity.html',
  styleUrl: './teacher-activity.scss',
})
export class TeacherActivity implements OnInit {
  view: TeacherView = 'list';
  activities: Activity[] = [];

  form: {
    title: string; description: string; type: ActivityType;
    deadline: string; closeAt: string; maxPoints?: number;
  } = { title: '', description: '', type: 'quiz', deadline: '', closeAt: '' };

  selectedActivity: Activity | null = null;
  questions: QuizQuestion[] = [];
  savingQuiz = false;

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
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void { void this.loadActivities(); }

  private get teacherID(): string | undefined {
    return this.auth.getCurrentUser()?.teacherID;
  }

  async loadActivities(): Promise<void> {
    const id = this.teacherID;
    if (!id) { this.activities = []; this.cdr.detectChanges(); return; }
    this.activities = await this.activityService.getActivitiesForTeacher(id);
    this.cdr.detectChanges();
  }

  showCreate(): void {
    this.form = { title: '', description: '', type: 'quiz', deadline: '', closeAt: '' };
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
    this.view = 'list';
    this.selectedActivity = null;
    this.gradingActivity = null;
    this.selectedSubmission = null;
    void this.loadActivities();
  }

  async createActivity(): Promise<void> {
    const teacherID = this.teacherID;
    if (!teacherID) { alert('You must be logged in as a teacher.'); return; }
    const title = this.form.title.trim();
    const deadline = this.form.deadline.trim();
    const closeAt = this.form.closeAt.trim();
    if (!title || !deadline || !closeAt) { alert('Please fill in title, deadline, and close time.'); return; }
    if (new Date(closeAt) <= new Date(deadline)) { alert('Close time must be after the deadline.'); return; }

    const activity = await this.activityService.createActivity({
      title, description: this.form.description.trim(),
      type: this.form.type,
      deadline: new Date(deadline).toISOString(),
      closeAt: new Date(closeAt).toISOString(),
      teacherID, maxPoints: this.form.maxPoints,
    });

    if (this.form.type === 'quiz') {
      await this.openQuizBuilder(activity);
    } else {
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
}