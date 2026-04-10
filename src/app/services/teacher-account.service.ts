import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from, map } from 'rxjs';
import { FirestoreService } from './firestore.service';

export interface TeacherAccount {
  id?: string;
  UID: string;
  name: string;
  teacherID: string;
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
export class TeacherAccountService {
  private readonly STORAGE_KEY = 'teacherAccounts';
  private readonly API_URL = 'http://localhost:3000/teachers';
  private readonly COLLECTION = 'teachers';
  private teachers: TeacherAccount[] = [];
  private useFirestore = true;

  constructor(
    private readonly http: HttpClient,
    private readonly firestoreService: FirestoreService,
  ) {
    this.teachers = this.loadFromStorage();
    void this.syncFromFirestore();
  }

  // ─── Storage helpers ──────────────────────────────────────────────────────

  private loadFromStorage(): TeacherAccount[] {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(this.STORAGE_KEY);
    if (!raw) return [];
    try { return JSON.parse(raw) as TeacherAccount[]; } catch { return []; }
  }

  private saveToStorage(): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.teachers));
  }

  // ─── Firestore sync ───────────────────────────────────────────────────────

  private async syncFromFirestore(): Promise<void> {
    try {
      const list = await this.firestoreService.getAll<TeacherAccount>(this.COLLECTION);
      if (list.length > 0) {
        this.teachers = list;
        this.saveToStorage();
        this.useFirestore = true;
        return;
      }
    } catch {
      this.useFirestore = false;
    }
    await this.syncFromJsonServer();
  }

  private async syncFromJsonServer(): Promise<void> {
    try {
      const list = await this.http
        .get<TeacherAccount[]>(this.API_URL)
        .toPromise();
      if (list && list.length > 0) {
        this.teachers = list;
        this.saveToStorage();
      }
    } catch { /* keep local */ }
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  async reloadFromServer(): Promise<void> {
    await this.syncFromFirestore();
  }

  getAll(): TeacherAccount[] { return [...this.teachers]; }

  getByUID(uid: string): TeacherAccount | undefined {
    return this.teachers.find(t => t.UID === uid);
  }

  getByCredentials(uid: string, password: string): TeacherAccount | undefined {
    return this.teachers.find(t => t.UID === uid && t.password === password);
  }

  getCount(): number { return this.teachers.length; }

  add(teacher: TeacherAccount): Observable<void> {
    if (this.getByUID(teacher.UID)) {
      throw new Error('A teacher with this UID already exists.');
    }

    const withId: TeacherAccount = { ...teacher, id: teacher.UID };
    this.teachers.push(withId);
    this.saveToStorage();

    if (this.useFirestore) {
      return from(
        this.firestoreService.set(this.COLLECTION, withId.UID, { ...withId })
      ).pipe(map(() => undefined));
    }

    return from(
      this.http.post<TeacherAccount>(this.API_URL, withId).toPromise()
    ).pipe(map(() => undefined));
  }

  update(uid: string, changes: Partial<TeacherAccount>): void {
    const index = this.teachers.findIndex(t => t.UID === uid);
    if (index === -1) return;
    this.teachers[index] = { ...this.teachers[index], ...changes };
    this.saveToStorage();

    if (this.useFirestore) {
      void this.firestoreService.update(this.COLLECTION, uid, changes);
    } else {
      this.http.patch(`${this.API_URL}/${encodeURIComponent(uid)}`, changes)
        .subscribe({ error: () => {} });
    }
  }

  remove(uid: string): Observable<void> {
    this.teachers = this.teachers.filter(t => t.UID !== uid);
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