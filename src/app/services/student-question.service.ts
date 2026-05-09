import { Injectable } from '@angular/core';
import { FirestoreService } from './firestore.service';
import { NotificationService } from './notification.service';

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
    return all.filter(q => q.teacherUID === teacherUID).sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getQuestionsForStudent(studentUID: string): Promise<StudentQuestion[]> {
    const all = await this.firestoreService.getAll<StudentQuestion>(this.COLLECTION);
    return all.filter(q => q.studentUID === studentUID).sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async answerQuestion(questionId: string, answer: string): Promise<void> {
    await this.firestoreService.update(this.COLLECTION, questionId, { answer, answered: true });
  }
}
