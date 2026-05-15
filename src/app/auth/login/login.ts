import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../services/auth.service';
import { StudentAccountService } from '../../services/student-account.service';
import { TeacherAccountService } from '../../services/teacher-account.service';
import { FirestoreService } from '../../services/firestore.service';
import { ToastService } from '../../services/toast.service';

interface AdminAccount {
  id?: string;
  UID: string;
  password: string;
  name: string;
  avatar?: string;
}

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  UID = '';
  password = '';
  showPassword = false;
  loading = false;
  shake = false;
  private readonly ADMIN_API_URL = 'http://localhost:3000/admins';

  constructor(
    private readonly router: Router,
    private readonly http: HttpClient,
    private readonly auth: AuthService,
    private readonly studentAccounts: StudentAccountService,
    private readonly teacherAccounts: TeacherAccountService,
    private readonly firestoreService: FirestoreService,
    private readonly toast: ToastService,
  ) {}

  // NOTE: The previous ngOnInit redirect guard has been removed.
  // Redirection of authenticated users away from /login is now handled
  // declaratively by loginGuard in app.routes.ts.

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  async login(): Promise<void> {
    if (this.loading) return; // prevent double-submit while a request is in flight

    const uid = this.UID.trim();
    const pwd = this.password.trim();

    if (!uid || !pwd) {
      this.toast.warning('Enter both UID and password');
      this.triggerShake();
      return;
    }

    this.loading = true;
    try {
      // 1. Try Firestore admins first
      try {
        const admins = await this.firestoreService.getAll<AdminAccount>('admins');
        const admin = admins.find(a => a.UID === uid && a.password === pwd);
        if (admin) {
          this.auth.setCurrentUser({
            role: 'admin',
            name: admin.name ?? '',
            UID: admin.UID,
            avatar: admin.avatar,
          });
          this.showSuccess('Welcome, admin!');
          void this.router.navigate(['/admin-dashboard']);
          return;
        }
      } catch {
        // Firestore unreachable → try json-server
        try {
          const admins = await this.http
            .get<AdminAccount[]>(
              `${this.ADMIN_API_URL}?UID=${encodeURIComponent(uid)}&password=${encodeURIComponent(pwd)}`
            )
            .toPromise();
          if (admins && admins.length > 0) {
            this.auth.setCurrentUser({
              role: 'admin',
              name: admins[0].name ?? '',
              UID: admins[0].UID,
              avatar: admins[0].avatar,
            });
            this.showSuccess('Welcome, admin!');
            void this.router.navigate(['/admin-dashboard']);
            return;
          }
        } catch { /* continue */ }
      }

      // 2. Student accounts
      const student = this.studentAccounts.getByCredentials(uid, pwd);
      if (student) {
        this.auth.setCurrentUser({
          role: 'student',
          name: `${student.firstname} ${student.lastname}`.trim(),
          studentID: student.studentID,
          UID: student.UID,
          avatar: student.avatar,
        });
        this.showSuccess('Welcome, student!');
        void this.router.navigate(['/student-dashboard']);
        return;
      }

      // 3. Teacher accounts
      const teacher = this.teacherAccounts.getByCredentials(uid, pwd);
      if (teacher) {
        this.auth.setCurrentUser({
          role: 'teacher',
          name: `${teacher.firstname} ${teacher.lastname}`.trim(),
          teacherID: teacher.teacherID,
          UID: teacher.UID,
          avatar: teacher.avatar,
        });
        this.showSuccess('Welcome, teacher!');
        void this.router.navigate(['/teacher-dashboard']);
        return;
      }

      this.toast.error('Invalid UID or password');
      this.triggerShake();
    } finally {
      this.loading = false;
    }
  }

  private triggerShake(): void {
    this.shake = false;
    // Re-trigger the animation by toggling on the next frame.
    setTimeout(() => { this.shake = true; }, 0);
    setTimeout(() => { this.shake = false; }, 500);
  }

  private showSuccess(text: string): void {
    this.toast.success('Login successful', { text });
  }
}