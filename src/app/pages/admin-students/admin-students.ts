import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { StudentAccount, StudentAccountService } from '../../services/student-account.service';

@Component({
  selector: 'app-admin-students',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-students.html',
  styleUrl: './admin-students.scss',
})
export class AdminStudents implements OnInit {
  students: StudentAccount[] = [];

  // simple form model
  form: Partial<StudentAccount> = {
    UID: '',
    name: '',
    course: '',
    studentID: '',
    password: '',
    email: '',
    status: 'active',
    lastname: '',
    firstname: '',
    middlename: '',
  };

  constructor(
    private studentService: StudentAccountService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    void this.loadStudents();
  }

  get totalStudents(): number {
    return this.studentService.getCount();
  }

  private async loadStudents(): Promise<void> {
    await this.studentService.reloadFromServer();
    this.students = this.studentService.getAll();
    this.cdr.detectChanges();
  }

  addStudent(): void {
    if (!this.form.UID || !this.form.password || !this.form.studentID || !this.form.lastname || !this.form.firstname) {
      alert('Please fill in UID, Password, Student ID, Lastname, and Firstname.');
      return;
    }

    try {
      this.studentService.add(this.form as StudentAccount).subscribe({
        next: () => {
          this.form = {
            UID: '',
            name: '',
            course: '',
            studentID: '',
            password: '',
            email: '',
            status: 'active',
            lastname: '',
            firstname: '',
            middlename: '',
          };
          void this.loadStudents();
        },
        error: (e: unknown) => {
          alert((e as { message?: string })?.message ?? 'Unable to add student.');
        },
      });
    } catch (e: unknown) {
      alert((e as { message?: string })?.message ?? 'Unable to add student.');
    }
  }

  removeStudent(uid: string): void {
    if (!confirm('Remove this student?')) return;
    this.studentService.remove(uid).subscribe({
      next: () => void this.loadStudents(),
      error: (e: unknown) => {
        alert((e as { message?: string })?.message ?? 'Unable to remove student.');
      },
    });
  }
}
