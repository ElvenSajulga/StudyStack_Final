import { Injectable } from "@angular/core";

export type UserRole = 'admin' | 'student' | 'teacher';

export interface User {
    role: UserRole;
    name: string;
    studentID?: string;
    teacherID?: string;  //teacher account will have teacherID, student account will have studentID
} 

@Injectable({
    providedIn: 'root'
})

export class AuthService {
    private readonly STORAGE_KEY = 'currentUser';
    private currentUser?: User;

    constructor() {
        this.currentUser = this.loadUserFromStorage();
    }

    private loadUserFromStorage(): User | undefined {
        if (typeof localStorage === 'undefined') return undefined;

       const raw = localStorage.getItem(this.STORAGE_KEY);
       if (!raw) return undefined;

        try {
        return JSON.parse(raw) as User;
        } catch (e) {
        return undefined;
        }
    }

    private saveUserToStorage(user: User | undefined): void {
        if (typeof localStorage === 'undefined') return;

        if (!user){
            localStorage.removeItem(this.STORAGE_KEY);
            return;
        }
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(user));
    }

    setCurrentUser(user: User | undefined): void {
        this.currentUser = user;
        this.saveUserToStorage(user);
    }

    getCurrentUser(): User | undefined {
        return this.currentUser;
    }

    clear(): void {
        this.currentUser = undefined;
        this.saveUserToStorage(undefined);
    }


    // role verification
    isAdmin(): boolean {
        return this.currentUser?.role === 'admin';
    }

    isStudent(): boolean {
        return this.currentUser?.role === 'student';
    }

    isTeacher(): boolean {
        return this.currentUser?.role === 'teacher';
    }

    // loginn check
    isLoggedIn(): boolean {
        return !!this.currentUser;
    }
}