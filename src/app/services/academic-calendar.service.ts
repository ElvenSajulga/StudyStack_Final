import { Injectable } from '@angular/core';
import { FirestoreService } from './firestore.service';

export interface AcademicCalendar {
  id: string;
  academicYear: string;     // e.g. "2025-2026"
  sem1Start: string;        // ISO date
  sem1End: string;
  sem2Start: string;
  sem2End: string;
  enrollmentOpen: string;   // ISO date
  enrollmentClose: string;
  updatedAt: string;
}

@Injectable({ providedIn: 'root' })
export class AcademicCalendarService {
  private readonly collectionName = 'academicCalendar';
  private readonly docId = 'config';

  constructor(private readonly firestore: FirestoreService) {}

  async get(): Promise<AcademicCalendar | null> {
    try {
      const doc = await this.firestore.getById<AcademicCalendar>(
        this.collectionName,
        this.docId
      );
      return doc ?? null;
    } catch {
      return null;
    }
  }

  async save(data: Omit<AcademicCalendar, 'id' | 'updatedAt'>): Promise<void> {
    const calendar: AcademicCalendar = {
      id: this.docId,
      ...data,
      updatedAt: new Date().toISOString(),
    };
    await this.firestore.set(this.collectionName, this.docId, calendar);
  }

  isEnrollmentOpen(calendar: AcademicCalendar): boolean {
    const now = new Date();
    const enrollOpen = new Date(calendar.enrollmentOpen);
    const enrollClose = new Date(calendar.enrollmentClose);
    return now >= enrollOpen && now <= enrollClose;
  }

  getCurrentSemester(calendar: AcademicCalendar): 'sem1' | 'sem2' | null {
    const now = new Date();
    const sem1Start = new Date(calendar.sem1Start);
    const sem1End = new Date(calendar.sem1End);
    const sem2Start = new Date(calendar.sem2Start);
    const sem2End = new Date(calendar.sem2End);

    if (now >= sem1Start && now <= sem1End) return 'sem1';
    if (now >= sem2Start && now <= sem2End) return 'sem2';
    return null;
  }
}
