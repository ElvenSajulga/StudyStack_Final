import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

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
    providedIn: 'root'
})
export class StudentAccountService {
    private readonly STORAGE_KEY = 'studentAccounts';
    private readonly API_URL = 'http://localhost:3000/students';
    private students: StudentAccount[] = [];

    constructor(private http: HttpClient) {
        this.students = this.loadFromStorage();
        this.syncWithServer();
    }

    private loadFromStorage(): StudentAccount[] {
        if (typeof localStorage === 'undefined') return [];

        const raw = localStorage.getItem(this.STORAGE_KEY);
        if (!raw) return [];

        try {
            return JSON.parse(raw) as StudentAccount[];
        } catch {
            return [];
        }
    }

    private saveToStorage(): void {
        if (typeof localStorage === 'undefined') return;
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.students));
    }

    /**
     * Synchronize localStorage data with json-server.
     * - If server has data and local is empty: pull from server into local.
     * - If server is empty and local has data: push local records to server.
     * - If both have data: keep local as-is for now.
     */
    private syncWithServer(): void {
        this.http.get<StudentAccount[] | undefined>(this.API_URL).subscribe({
            next: (serverStudents) => {
                const serverList = serverStudents ?? [];
                const hasServer = serverList.length > 0;
                const hasLocal = this.students.length > 0;

                if (hasServer && !hasLocal) {
                    // Use server as source of truth when local is empty
                    this.students = serverList;
                    this.saveToStorage();
                } else if (!hasServer && hasLocal) {
                    // First-time transfer: push existing local data to server
                    this.students.forEach((student) => {
                        const payload: StudentAccount = {
                            ...student,
                            id: student.id ?? student.UID,
                        };
                        this.http.post<StudentAccount>(this.API_URL, payload).subscribe({
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
     * Force a fresh reload of student accounts from json-server.
     * Used by admin pages / dashboards so they always see the latest data
     * without needing a manual browser refresh.
     */
    async reloadFromServer(): Promise<void> {
        try {
            const serverStudents = await this.http
                .get<StudentAccount[] | undefined>(this.API_URL)
                .toPromise();
            const list = serverStudents ?? [];
            this.students = list.map(student => ({
                ...student,
                id: student.id ?? student.UID,
            }));
            this.saveToStorage();
        } catch {
            // keep existing local copy if server is unreachable
        }
    }

    getAll(): StudentAccount[] {
        return [...this.students];
    }

    getByUID(uid: string): StudentAccount | undefined {
        return this.students.find(s => s.UID === uid);
    }

    getByCredentials(uid: string, password: string): StudentAccount | undefined {
        return this.students.find(
            s => s.UID === uid && s.password === password
        );
    }

    add(student: StudentAccount): void {
        const existing = this.getByUID(student.UID);
        if (existing) {
            throw new Error('A student with this UID already exists.');
        }

        const withId: StudentAccount = {
            ...student,
            id: student.id ?? student.UID,
        };

        this.students.push(withId);
        this.saveToStorage();

        // Persist to json-server (best-effort, keep local copy even if this fails)
        this.http.post<StudentAccount>(this.API_URL, withId).subscribe({
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            next: () => {},
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            error: () => {},
        });
    }

    update(uid: string, changes: Partial<StudentAccount>): void {
        const index = this.students.findIndex(s => s.UID === uid);
        if (index === -1) return;

        this.students[index] = { ...this.students[index], ...changes };
        this.saveToStorage();

        const id = this.students[index].id ?? uid;
        const payload: Partial<StudentAccount> = {
            ...changes,
            id,
            UID: this.students[index].UID,
        };

        this.http.patch<StudentAccount>(`${this.API_URL}/${encodeURIComponent(id)}`, payload).subscribe({
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            next: () => {},
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            error: () => {},
        });
    }

    remove(uid: string): void {
        const toRemove = this.students.find(s => s.UID === uid);
        this.students = this.students.filter(s => s.UID !== uid);
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
        return this.students.length;
    }
}
