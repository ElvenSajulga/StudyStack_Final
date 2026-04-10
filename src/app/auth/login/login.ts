import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../services/auth.service';
import { StudentAccountService } from '../../services/student-account.service';
import { TeacherAccountService } from '../../services/teacher-account.service';
import { FirestoreService } from '../../services/firestore.service';
import Swal from 'sweetalert2';

interface AdminAccount {
  id?: string;
  UID: string;
  password: string;
  name: string;
}

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login implements OnInit {
  UID = '';
  password = '';
  private readonly ADMIN_API_URL = 'http://localhost:3000/admins';

  constructor(
    private readonly router: Router,
    private readonly http: HttpClient,
    private readonly auth: AuthService,
    private readonly studentAccounts: StudentAccountService,
    private readonly teacherAccounts: TeacherAccountService,
    private readonly firestoreService: FirestoreService,
  ) {}

  ngOnInit(): void {
    const user = this.auth.getCurrentUser();
    if (!user) return;
    if (user.role === 'admin') void this.router.navigate(['/admin-dashboard']);
    else if (user.role === 'student') void this.router.navigate(['/student-dashboard']);
    else if (user.role === 'teacher') void this.router.navigate(['/teacher-dashboard']);
  }

  async login(): Promise<void> {
    const uid = this.UID.trim();
    const pwd = this.password.trim();

    if (!uid || !pwd) {
      Swal.fire({ icon: 'error', title: 'Error', text: 'Please enter both UID and password.' });
      return;
    }

    // 1. Try Firestore admins first
    try {
      const admins = await this.firestoreService.getAll<AdminAccount>('admins');
      const admin = admins.find(a => a.UID === uid && a.password === pwd);
      if (admin) {
        this.auth.setCurrentUser({ role: 'admin', name: admin.name ?? '' });
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
          this.auth.setCurrentUser({ role: 'admin', name: admins[0].name ?? '' });
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
      });
      this.showSuccess('Welcome, teacher!');
      void this.router.navigate(['/teacher-dashboard']);
      return;
    }

    Swal.fire({ icon: 'error', title: 'Error', text: 'Invalid UID or password.' });
  }

  private showSuccess(text: string): void {
    Swal.fire({
      icon: 'success',
      title: 'Login successful',
      text,
      timer: 2000,
      showConfirmButton: false,
    });
  }
}