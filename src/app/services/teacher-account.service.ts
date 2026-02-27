import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

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
    providedIn: 'root'
})
export class TeacherAccountService {
    private readonly STORAGE_KEY = 'teacherAccounts';
    private readonly API_URL = 'http://localhost:3000/teachers';
    private teachers: TeacherAccount[] = [];

    constructor(private http: HttpClient) {
        this.teachers = this.loadFromStorage();
        // seed a default teacher account when none exist yet
        if (this.teachers.length === 0) {
            const defaultTeacher: TeacherAccount = {
                UID: 'teacher',
                name: 'Demo Teacher',
                teacherID: 'T-0001',
                password: 'teacher123',
                email: 'teacher@example.com',
                status: 'active',
                lastname: 'Teacher',
                firstname: 'Demo',
                middlename: '',
            };
            this.teachers.push(defaultTeacher);
            this.saveToStorage();
        }

        this.syncWithServer();
    }

    private loadFromStorage(): TeacherAccount[] {
        if (typeof localStorage === 'undefined') return [];

        const raw = localStorage.getItem(this.STORAGE_KEY);
        if (!raw) return [];

        try {
            return JSON.parse(raw) as TeacherAccount[];
        } catch {
            return [];
        }
    }

    private saveToStorage(): void {
        if (typeof localStorage === 'undefined') return;
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.teachers));
    }

    private syncWithServer(): void {
        this.http.get<TeacherAccount[] | undefined>(this.API_URL).subscribe({
            next: (serverTeachers) => {
                const serverList = serverTeachers ?? [];
                const hasServer = serverList.length > 0;
                const hasLocal = this.teachers.length > 0;

                // If the server already has data, always treat it as the source of truth
                // so that accounts defined in db.json (e.g. teacher1, teacher2) are used
                // for login and admin pages.
                if (hasServer) {
                    this.teachers = serverList;
                    this.saveToStorage();
                } else if (!hasServer && hasLocal) {
                    this.teachers.forEach((teacher) => {
                        const payload: TeacherAccount = {
                            ...teacher,
                            id: teacher.id ?? teacher.UID,
                        };
                        this.http.post<TeacherAccount>(this.API_URL, payload).subscribe({
                            // eslint-disable-next-line @typescript-eslint/no-empty-function
                            next: () => {},
                            // eslint-disable-next-line @typescript-eslint/no-empty-function
                            error: () => {},
                        });
                    });
                }
            },
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            error: () => {},
        });
    }

    /**
     * Force a fresh reload of teacher accounts from json-server so that
     * admin pages and dashboards always see the latest records without
     * requiring a manual browser refresh.
     */
    async reloadFromServer(): Promise<void> {
        try {
            const serverTeachers = await this.http
                .get<TeacherAccount[] | undefined>(this.API_URL)
                .toPromise();
            const list = serverTeachers ?? [];
            this.teachers = list.map(teacher => ({
                ...teacher,
                id: teacher.id ?? teacher.UID,
            }));
            this.saveToStorage();
        } catch {
            // keep existing local copy if server is unreachable
        }
    }

    getAll(): TeacherAccount[] {
        return [...this.teachers];
    }

    getByUID(uid: string): TeacherAccount | undefined {
        return this.teachers.find(t => t.UID === uid);
    }

    getByCredentials(uid: string, password: string): TeacherAccount | undefined {
        return this.teachers.find(
            t => t.UID === uid && t.password === password
        );
    }

    add(teacher: TeacherAccount): void {
        const existing = this.getByUID(teacher.UID);
        if (existing) {
            throw new Error('A teacher with this UID already exists.');
        }

        const withId: TeacherAccount = {
            ...teacher,
            id: teacher.id ?? teacher.UID,
        };

        this.teachers.push(withId);
        this.saveToStorage();

        this.http.post<TeacherAccount>(this.API_URL, withId).subscribe({
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            next: () => {},
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            error: () => {},
        });
    }

    update(uid: string, changes: Partial<TeacherAccount>): void {
        const index = this.teachers.findIndex(t => t.UID === uid);
        if (index === -1) return;

        this.teachers[index] = { ...this.teachers[index], ...changes };
        this.saveToStorage();

        const id = this.teachers[index].id ?? uid;
        const payload: Partial<TeacherAccount> = {
            ...changes,
            id,
            UID: this.teachers[index].UID,
        };

        this.http.patch<TeacherAccount>(`${this.API_URL}/${encodeURIComponent(id)}`, payload).subscribe({
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            next: () => {},
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            error: () => {},
        });
    }

    remove(uid: string): void {
        const toRemove = this.teachers.find(t => t.UID === uid);
        this.teachers = this.teachers.filter(t => t.UID !== uid);
        this.saveToStorage();

        const id = toRemove?.id ?? uid;
        this.http.delete<void>(`${this.API_URL}/${encodeURIComponent(id)}`).subscribe({
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            next: () => {},
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            error: () => {},
        });
    }

    getCount(): number {
        return this.teachers.length;
    }
}

