import { Injectable } from '@angular/core';
import { FirestoreService } from './firestore.service';
import { NotificationService } from './notification.service';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

export interface StudentQuestion {
  id: string;
  activityId: string;
  activityTitle: string;
  studentUID: string;
  studentName: string;
  studentID: string;
  teacherUID: string;
  teacherID: string;
  message: string;
  answered: boolean;
  answer?: string;
  answeredAt?: string;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class StudentQuestionService {
  private readonly COLLECTION = 'studentQuestions';

  constructor(
    private firestoreService: FirestoreService,
    private notificationService: NotificationService,
  ) {}

  generateId(): string {
    return 'q-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
  }

  async createQuestion(q: Omit<StudentQuestion, 'id' | 'createdAt' | 'answered'>): Promise<StudentQuestion> {
    const question: StudentQuestion = {
      ...q,
      id: this.generateId(),
      createdAt: new Date().toISOString(),
      answered: false,
    };
    await this.firestoreService.set(this.COLLECTION, question.id, question);

    // Notify teacher
    await this.notificationService.createNotification({
      recipientUID: q.teacherUID,
      type: 'student-question',
      title: 'New question from student',
      message: q.studentName + ' asked about "' + q.activityTitle + '"',
      relatedId: question.id,
      read: false,
      createdAt: new Date().toISOString(),
    });

    return question;
  }

  async getQuestionsForTeacher(teacherUID: string): Promise<StudentQuestion[]> {
    const all = await this.firestoreService.getAll<StudentQuestion>(this.COLLECTION);
    return this.sortByDateDesc(all.filter(q => q.teacherUID === teacherUID));
  }

  async getQuestionsForStudent(studentUID: string): Promise<StudentQuestion[]> {
    const all = await this.firestoreService.getAll<StudentQuestion>(this.COLLECTION);
    return this.sortByDateDesc(all.filter(q => q.studentUID === studentUID));
  }

  /** Questions for a single activity (teacher-side use). */
  async getQuestionsForActivity(activityId: string): Promise<StudentQuestion[]> {
    const all = await this.firestoreService.getAll<StudentQuestion>(this.COLLECTION);
    return this.sortByDateDesc(all.filter(q => q.activityId === activityId));
  }

  /** Real-time stream of every question for one activity. */
  watchQuestionsForActivity(activityId: string): Observable<StudentQuestion[]> {
    return this.firestoreService.watchAll<StudentQuestion>(this.COLLECTION).pipe(
      map(all => this.sortByDateDesc(all.filter(q => q.activityId === activityId))),
      catchError(err => {
        console.warn('watchQuestionsForActivity failed:', err);
        return of([] as StudentQuestion[]);
      }),
    );
  }

  /** Real-time stream of every question authored by a single student. */
  watchQuestionsForStudent(studentUID: string): Observable<StudentQuestion[]> {
    return this.firestoreService.watchAll<StudentQuestion>(this.COLLECTION).pipe(
      map(all => this.sortByDateDesc(all.filter(q => q.studentUID === studentUID))),
      catchError(() => of([] as StudentQuestion[])),
    );
  }

  /**
   * Record a teacher's reply and notify the asking student.
   * `question` is required so we can address the notification correctly
   * without an extra round-trip read.
   */
  async answerQuestion(question: StudentQuestion, answer: string): Promise<void> {
    const answeredAt = new Date().toISOString();
    await this.firestoreService.update(this.COLLECTION, question.id, {
      answer,
      answered: true,
      answeredAt,
    });

    // Notify the student that their question got a reply.
    try {
      await this.notificationService.createNotification({
        recipientUID: question.studentUID,
        type: 'student-question',
        title: 'Teacher replied to your question',
        message: `Reply on "${question.activityTitle}"`,
        relatedId: question.id,
        read: false,
        createdAt: answeredAt,
      });
    } catch (e) {
      console.warn('answerQuestion notification dispatch failed:', e);
    }
  }

  private sortByDateDesc(list: StudentQuestion[]): StudentQuestion[] {
    return [...list].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }
}
