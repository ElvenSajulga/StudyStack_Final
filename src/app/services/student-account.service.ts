import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from, map } from 'rxjs';
import { FirestoreService } from './firestore.service';

export interface StudentAccount {
  id?: string;
  UID: string;
  name: string;
  course: string;
  studentID: string;
  password: string;
  email: string;
  status: string;
  lastname: string;
  firstname: string;
  middlename: string;
}

@Injectable({
  providedIn: 'root',
})
export class StudentAccountService {
  private readonly STORAGE_KEY = 'studentAccounts';
  private readonly API_URL = 'http://localhost:3000/students';
  private readonly COLLECTION = 'students';
  private students: StudentAccount[] = [];
  private useFirestore = true;

  constructor(
    private readonly http: HttpClient,
    private readonly firestoreService: FirestoreService,
  ) {
    this.students = this.loadFromStorage();
    void this.syncFromFirestore();
  }

  // ─── Storage helpers ──────────────────────────────────────────────────────

  private loadFromStorage(): StudentAccount[] {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(this.STORAGE_KEY);
    if (!raw) return [];
    try { return JSON.parse(raw) as StudentAccount[]; } catch { return []; }
  }

  private saveToStorage(): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.students));
  }

  // ─── Firestore sync ───────────────────────────────────────────────────────

  private async syncFromFirestore(): Promise<void> {
    try {
      const list = await this.firestoreService.getAll<StudentAccount>(this.COLLECTION);
      if (list.length > 0) {
        this.students = list;
        this.saveToStorage();
        this.useFirestore = true;
        return;
      }
    } catch {
      this.useFirestore = false;
    }
    // Firestore empty or unreachable → fall back to json-server
    await this.syncFromJsonServer();
  }

  private async syncFromJsonServer(): Promise<void> {
    try {
      const list = await this.http
        .get<StudentAccount[]>(this.API_URL)
        .toPromise();
      if (list && list.length > 0) {
        this.students = list;
        this.saveToStorage();
      }
    } catch { /* keep local */ }
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  async reloadFromServer(): Promise<void> {
    await this.syncFromFirestore();
  }

  getAll(): StudentAccount[] { return [...this.students]; }

  getByUID(uid: string): StudentAccount | undefined {
    return this.students.find(s => s.UID === uid);
  }

  getByCredentials(uid: string, password: string): StudentAccount | undefined {
    return this.students.find(s => s.UID === uid && s.password === password);
  }

  getCount(): number { return this.students.length; }

  add(student: StudentAccount): Observable<void> {
    if (this.getByUID(student.UID)) {
      throw new Error('A student with this UID already exists.');
    }

    const withId: StudentAccount = { ...student, id: student.UID };
    this.students.push(withId);
    this.saveToStorage();

    if (this.useFirestore) {
      return from(
        this.firestoreService.set(this.COLLECTION, withId.UID, { ...withId })
      ).pipe(map(() => undefined));
    }

    return from(
      this.http.post<StudentAccount>(this.API_URL, withId).toPromise()
    ).pipe(map(() => undefined));
  }

  update(uid: string, changes: Partial<StudentAccount>): void {
    const index = this.students.findIndex(s => s.UID === uid);
    if (index === -1) return;
    this.students[index] = { ...this.students[index], ...changes };
    this.saveToStorage();

    if (this.useFirestore) {
      void this.firestoreService.update(this.COLLECTION, uid, changes);
    } else {
      this.http.patch(`${this.API_URL}/${encodeURIComponent(uid)}`, changes)
        .subscribe({ error: () => {} });
    }
  }

  remove(uid: string): Observable<void> {
    this.students = this.students.filter(s => s.UID !== uid);
    this.saveToStorage();

    if (this.useFirestore) {
      return from(this.firestoreService.delete(this.COLLECTION, uid))
        .pipe(map(() => undefined));
    }

    return from(
      this.http.delete<void>(`${this.API_URL}/${encodeURIComponent(uid)}`).toPromise()
    ).pipe(map(() => undefined));
  }
}