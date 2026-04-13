import { Component, OnInit, OnDestroy, inject, PLATFORM_ID, ChangeDetectorRef } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Activity, ActivityService, ActivitySubmission, SubmissionLink } from '../../services/activity.service';
import { QuizQuestion, QuizService } from '../../services/quiz.service';
import { AuthService } from '../../services/auth.service';
import { StudentAccountService } from '../../services/student-account.service';
import Swal from 'sweetalert2';

type StudentView = 'list' | 'detail';

@Component({
  selector: 'app-student-activity',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './student-activity.html',
  styleUrl: './student-activity.scss',
})
export class StudentActivity implements OnInit, OnDestroy {
  view: StudentView = 'list';
  activities: Activity[] = [];
  submissions: Record<string, ActivitySubmission | undefined> = {};

  // Detail view
  selectedActivity: Activity | null = null;
  selectedSubmission: ActivitySubmission | null = null;
  quizQuestions: QuizQuestion[] = [];
  quizAnswers: Record<string, string> = {};

  // Output submission
  outputText = '';
  outputLinks: SubmissionLink[] = [];
  newLinkLabel = '';
  newLinkUrl = '';

  saving = false;

  private readonly platformId = inject(PLATFORM_ID);
  private refreshTimer?: number;

  constructor(
    private readonly activityService: ActivityService,
    private readonly quizService: QuizService,
    private readonly auth: AuthService,
    private readonly studentService: StudentAccountService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    void this.loadActivities();
    if (isPlatformBrowser(this.platformId)) {
      this.refreshTimer = window.setInterval(() => void this.loadActivities(), 15000);
    }
  }

  ngOnDestroy(): void {
    if (isPlatformBrowser(this.platformId) && this.refreshTimer != null) {
      window.clearInterval(this.refreshTimer);
    }
  }

  private get studentID(): string | undefined {
    return this.auth.getCurrentUser()?.studentID;
  }

  private get studentUID(): string | undefined {
    return this.auth.getCurrentUser() ? this.findStudentUID() : undefined;
  }

  private findStudentUID(): string {
    const sid = this.studentID;
    const all = this.studentService.getAll();
    return all.find(s => s.studentID === sid)?.UID ?? '';
  }

  async loadActivities(): Promise<void> {
    try {
      this.activities = await this.activityService.getAllActivities();
    } catch {
      this.activities = [];
    }

    const sid = this.studentID;
    if (sid) {
      const subs = await this.activityService.getSubmissionsForStudent(sid);
      this.submissions = {};
      for (const sub of subs) {
        this.submissions[sub.activityId] = sub;
      }
    }
    this.cdr.detectChanges();
  }

  async openActivity(activity: Activity): Promise<void> {
    this.selectedActivity = activity;
    this.selectedSubmission = this.submissions[activity.id] ?? null;

    if (activity.type === 'quiz') {
      this.quizQuestions = await this.quizService.getQuestionsForActivity(activity.id);
      // Pre-fill answers if already submitted
      if (this.selectedSubmission?.quizAnswers) {
        this.quizAnswers = { ...this.selectedSubmission.quizAnswers };
      } else {
        this.quizAnswers = {};
      }
    } else {
      this.outputText = this.selectedSubmission?.content ?? '';
      this.outputLinks = this.selectedSubmission?.links ? [...this.selectedSubmission.links] : [];
    }

    this.view = 'detail';
    this.cdr.detectChanges();
  }

  backToList(): void {
    this.view = 'list';
    this.selectedActivity = null;
    this.selectedSubmission = null;
    this.quizQuestions = [];
    this.quizAnswers = {};
    this.outputText = '';
    this.outputLinks = [];
  }

  // ── Link management ───────────────────────────────────────────────────────

  addLink(): void {
    const url = this.newLinkUrl.trim();
    if (!url) { alert('Please enter a URL.'); return; }
    this.outputLinks.push({ label: this.newLinkLabel.trim() || url, url });
    this.newLinkLabel = '';
    this.newLinkUrl = '';
    this.cdr.detectChanges();
  }

  removeLink(index: number): void {
    this.outputLinks.splice(index, 1);
    this.cdr.detectChanges();
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  async submitQuiz(): Promise<void> {
    const sid = this.studentID;
    const uid = this.studentUID;
    if (!sid || !this.selectedActivity) return;

    // Check all answered
    const unanswered = this.quizQuestions.filter(q => q.type !== 'short-answer' && !this.quizAnswers[q.id]);
    if (unanswered.length > 0) {
      const res = await Swal.fire({
        icon: 'warning',
        title: 'Unanswered questions',
        text: `You have ${unanswered.length} unanswered question(s). Submit anyway?`,
        showCancelButton: true,
        confirmButtonText: 'Submit anyway',
        confirmButtonColor: '#0a7a45',
      });
      if (!res.isConfirmed) return;
    }

    this.saving = true;
    const result = this.quizService.gradeQuiz(this.quizQuestions, this.quizAnswers);

    const sub = await this.activityService.submitOrUpdateSubmission(
      this.selectedActivity.id, sid, uid ?? '',
      'Quiz submission',
      {
        quizAnswers: { ...this.quizAnswers },
        score: result.totalScore,
        graded: true,
      }
    );

    this.selectedSubmission = sub;
    this.submissions[this.selectedActivity.id] = sub;
    this.saving = false;

    Swal.fire({
      icon: 'success',
      title: 'Submitted!',
      text: `Your quiz has been submitted.`,
      timer: 2000,
      showConfirmButton: false,
    });
    this.cdr.detectChanges();
  }

  async submitOutput(): Promise<void> {
    const sid = this.studentID;
    const uid = this.studentUID;
    if (!sid || !this.selectedActivity) return;

    if (!this.outputText.trim() && this.outputLinks.length === 0) {
      alert('Please add some text or at least one link before submitting.');
      return;
    }

    this.saving = true;
    const sub = await this.activityService.submitOrUpdateSubmission(
      this.selectedActivity.id, sid, uid ?? '',
      this.outputText.trim(),
      { links: [...this.outputLinks] }
    );

    this.selectedSubmission = sub;
    this.submissions[this.selectedActivity.id] = sub;
    this.saving = false;

    Swal.fire({ icon: 'success', title: 'Submitted!', timer: 1800, showConfirmButton: false });
    this.cdr.detectChanges();
  }

  async unsubmit(): Promise<void> {
    if (!this.selectedSubmission || !this.selectedActivity) return;

    const res = await Swal.fire({
      icon: 'question',
      title: 'Unsubmit?',
      text: 'You can edit and resubmit before the deadline.',
      showCancelButton: true,
      confirmButtonText: 'Unsubmit',
      confirmButtonColor: '#f59e0b',
    });
    if (!res.isConfirmed) return;

    await this.activityService.unsubmitSubmission(this.selectedSubmission.id);
    this.selectedSubmission = { ...this.selectedSubmission, submitted: false };
    this.submissions[this.selectedActivity.id] = this.selectedSubmission;
    this.cdr.detectChanges();
  }

  // ── Status helpers ────────────────────────────────────────────────────────

  isSubmitted(activity: Activity): boolean {
    return this.submissions[activity.id]?.submitted === true;
  }

  isClosed(activity: Activity): boolean {
    return new Date() > new Date(activity.closeAt);
  }

  isPastDeadline(activity: Activity): boolean {
    return new Date() > new Date(activity.deadline);
  }

  getStatusLabel(activity: Activity): string {
    const sub = this.submissions[activity.id];
    if (!sub || !sub.submitted) return this.isClosed(activity) ? 'Missed' : 'Not submitted';
    return this.isPastDeadline(activity) ? 'Submitted late' : 'Submitted';
  }

  getStatusClass(activity: Activity): string {
    const sub = this.submissions[activity.id];
    if (!sub || !sub.submitted) return this.isClosed(activity) ? 'missed' : 'pending';
    return this.isPastDeadline(activity) ? 'late' : 'submitted';
  }

  canSubmit(): boolean {
    if (!this.selectedActivity) return false;
    return !this.isClosed(this.selectedActivity);
  }

  canUnsubmit(): boolean {
    if (!this.selectedActivity || !this.selectedSubmission?.submitted) return false;
    return !this.isClosed(this.selectedActivity);
  }

  showScore(): boolean {
    if (!this.selectedActivity || !this.selectedSubmission) return false;
    return !!this.selectedActivity.scoresReleased && this.selectedSubmission.graded === true;
  }

  trackByQId(_: number, q: QuizQuestion): string { return q.id; }
}