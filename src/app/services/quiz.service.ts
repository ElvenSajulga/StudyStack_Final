import { Injectable } from '@angular/core';
import { FirestoreService } from './firestore.service';
import { HttpClient } from '@angular/common/http';
import { where } from '@angular/fire/firestore';

export type QuestionType = 'multiple-choice' | 'true-false' | 'short-answer';

export interface QuestionChoice {
  id: string;
  text: string;
}

export interface QuizQuestion {
  id: string;
  activityId: string;
  teacherID: string;
  type: QuestionType;
  question: string;
  choices: QuestionChoice[];   // empty for short-answer
  correctAnswer: string;       // choice id for mc/tf, text for short-answer
  points: number;
  order: number;
}

@Injectable({ providedIn: 'root' })
export class QuizService {
  private readonly COLLECTION = 'quizQuestions';

  constructor(
    private readonly firestoreService: FirestoreService,
    private readonly http: HttpClient,
  ) {}

  async getQuestionsForActivity(activityId: string): Promise<QuizQuestion[]> {
    try {
      const list = await this.firestoreService.getAll<QuizQuestion>(
        this.COLLECTION,
        [where('activityId', '==', activityId)]
      );
      return list.sort((a, b) => a.order - b.order);
    } catch {
      return [];
    }
  }

  async saveQuestion(question: QuizQuestion): Promise<void> {
    await this.firestoreService.set(this.COLLECTION, question.id, { ...question });
  }

  async deleteQuestion(questionId: string): Promise<void> {
    await this.firestoreService.delete(this.COLLECTION, questionId);
  }

  async deleteAllQuestionsForActivity(activityId: string): Promise<void> {
    const questions = await this.getQuestionsForActivity(activityId);
    await Promise.all(questions.map(q => this.firestoreService.delete(this.COLLECTION, q.id)));
  }

  async saveAllQuestions(questions: QuizQuestion[]): Promise<void> {
    await Promise.all(questions.map(q =>
      this.firestoreService.set(this.COLLECTION, q.id, { ...q })
    ));
  }

  generateId(): string {
    return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  }

  /** Auto-grade a student's answers against correct answers.
   *  Returns { totalScore, maxScore, results } */
  gradeQuiz(
    questions: QuizQuestion[],
    answers: Record<string, string>
  ): { totalScore: number; maxScore: number; results: Record<string, boolean> } {
    let totalScore = 0;
    let maxScore = 0;
    const results: Record<string, boolean> = {};

    for (const q of questions) {
      maxScore += q.points;
      const studentAnswer = (answers[q.id] ?? '').trim().toLowerCase();
      const correctAnswer = (q.correctAnswer ?? '').trim().toLowerCase();

      if (q.type === 'short-answer') {
        // exact match for short answer
        const correct = studentAnswer === correctAnswer;
        results[q.id] = correct;
        if (correct) totalScore += q.points;
      } else {
        // multiple choice and true/false: match by choice id or text
        const correct = studentAnswer === correctAnswer;
        results[q.id] = correct;
        if (correct) totalScore += q.points;
      }
    }

    return { totalScore, maxScore, results };
  }
}