import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TeacherAccount, TeacherAccountService } from '../../services/teacher-account.service';

@Component({
  selector: 'app-admin-teachers',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-teachers.html',
  styleUrl: './admin-teachers.scss',
})
export class AdminTeachers {
  teachers: TeacherAccount[] = [];

  form: Partial<TeacherAccount> = {
    UID: '',
    name: '',
    teacherID: '',
    password: '',
    email: '',
    status: 'active',
    lastname: '',
    firstname: '',
    middlename: '',
  };

  constructor(private teacherService: TeacherAccountService) {
    void this.loadTeachers();
  }

  get totalTeachers(): number {
    return this.teacherService.getCount();
  }

  private async loadTeachers(): Promise<void> {
    await this.teacherService.reloadFromServer();
    this.teachers = this.teacherService.getAll();
  }

  addTeacher(): void {
    if (!this.form.UID || !this.form.password || !this.form.teacherID || !this.form.lastname || !this.form.firstname) {
      alert('Please fill in UID, Password, Teacher ID, Lastname, and Firstname.');
      return;
    }

    try {
      this.teacherService.add(this.form as TeacherAccount);
      this.form = {
        UID: '',
        name: '',
        teacherID: '',
        password: '',
        email: '',
        status: 'active',
        lastname: '',
        firstname: '',
        middlename: '',
      };
      this.loadTeachers();
    } catch (e: any) {
      alert(e.message ?? 'Unable to add teacher.');
    }
  }

  removeTeacher(uid: string): void {
    if (!confirm('Remove this teacher?')) return;
    this.teacherService.remove(uid);
    this.loadTeachers();
  }
}
