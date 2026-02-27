import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../services/auth.service';
import { StudentAccountService } from '../../services/student-account.service';
import { TeacherAccountService } from '../../services/teacher-account.service';
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
    private auth: AuthService,
    private studentAccounts: StudentAccountService,
    private teacherAccounts: TeacherAccountService
  ) {}

  ngOnInit(): void {
    const user = this.auth.getCurrentUser();
    if (!user) return;

    if (user.role === 'admin') {
      void this.router.navigate(['/admin-dashboard']);
    } else if (user.role === 'student') {
      void this.router.navigate(['/student-dashboard']);
    } else if (user.role === 'teacher') {
      void this.router.navigate(['/teacher-dashboard']);
    }
  }

  async login(){
    const trimmedUID = this.UID.trim();
    const trimmedPassword = this.password.trim();

    if (!trimmedUID || !trimmedPassword) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Please enter both UID and password.',
      });
      return;
    }

    // admin login (fetched from json-server / db.json)
    try {
      const admins = await this.http
        .get<AdminAccount[]>(
          `${this.ADMIN_API_URL}?UID=${encodeURIComponent(trimmedUID)}&password=${encodeURIComponent(trimmedPassword)}`
        )
        .toPromise();

      if (admins && admins.length > 0) {
        const admin = admins[0];
        this.auth.setCurrentUser({
          role: 'admin',
          name: admin.name ?? '',
        });
        Swal.fire({
          icon: 'success',
          title: 'Login successful',
          text: 'Welcome, admin!',
          timer: 2000,
          showConfirmButton: false,
        });
        void this.router.navigate(['/admin-dashboard']);
        return;
      }
    } catch {
      // If the admin API is unreachable, fall through to other checks
    }

    // student accounts (managed by admin)
    const student = this.studentAccounts.getByCredentials(trimmedUID, trimmedPassword);
    if (student) {
      this.auth.setCurrentUser({
        role: 'student',
        name: `${student.firstname} ${student.lastname}`.trim(),
        studentID: student.studentID,
      });
      Swal.fire({
        icon: 'success',
        title : 'Login successful',
        text: 'Welcome, student!',
        timer: 2000,
        showConfirmButton: false,
      });
      void this.router.navigate(['/student-dashboard']);
      return;
    }

    // teacher accounts (managed by admin)
    const teacher = this.teacherAccounts.getByCredentials(trimmedUID, trimmedPassword);
    if (teacher) {
      this.auth.setCurrentUser({
        role: 'teacher',
        name: `${teacher.firstname} ${teacher.lastname}`.trim(),
        teacherID: teacher.teacherID,
      });
      Swal.fire({
        icon: 'success',
        title : 'Login successful',
        text: 'Welcome, teacher!',
        timer: 2000,
        showConfirmButton: false,
      });
      void this.router.navigate(['/teacher-dashboard']);
      return;
    }

    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: 'Invalid UID or password.',
    });

  }
}
