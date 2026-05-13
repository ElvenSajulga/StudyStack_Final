import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService, User } from '../../services/auth.service';
import { TeacherAccount, TeacherAccountService } from '../../services/teacher-account.service';
import { AcademicService, Faculty } from '../../services/academic.service';
import { ToastService } from '../../services/toast.service';
import { fileToResizedDataUrl } from '../../services/image-upload.util';

@Component({
  selector: 'app-teacher-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './teacher-profile.html',
  styleUrl: './teacher-profile.scss',
})
export class TeacherProfile implements OnInit {
  user: User | undefined;
  account: TeacherAccount | undefined;
  faculty: Faculty | undefined;

  form = { firstname: '', middlename: '', lastname: '' };
  savingName = false;

  pwd = { current: '', next: '', confirm: '' };
  savingPwd = false;

  uploadingAvatar = false;

  constructor(
    private readonly auth: AuthService,
    private readonly teacherService: TeacherAccountService,
    private readonly academic: AcademicService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.user = this.auth.getCurrentUser();
    void this.loadAccount();
  }

  private async loadAccount(): Promise<void> {
    if (!this.user?.UID) return;
    await this.teacherService.reloadFromServer();
    this.account = this.teacherService.getByUID(this.user.UID);
    if (this.account) {
      this.form = {
        firstname: this.account.firstname ?? '',
        middlename: this.account.middlename ?? '',
        lastname: this.account.lastname ?? '',
      };
      if (this.account.facultyId) {
        try {
          const faculties = await this.academic.getFaculties();
          this.faculty = faculties.find(f => f.id === this.account!.facultyId);
        } catch { /* leave undefined */ }
      }
    }
    this.cdr.detectChanges();
  }

  get teacherID(): string | undefined {
    return this.account?.teacherID ?? this.user?.teacherID;
  }

  get email(): string {
    return this.account?.email ?? '';
  }

  get avatar(): string {
    return this.account?.avatar ?? this.user?.avatar ?? '';
  }

  get initials(): string {
    const candidates = [
      this.account ? `${this.account.firstname} ${this.account.lastname}`.trim() : '',
      this.user?.name?.trim() ?? '',
    ];
    const name = candidates.find(Boolean) ?? '';
    if (!name) return 'T';
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  get nameDirty(): boolean {
    if (!this.account) return false;
    return (
      this.form.firstname.trim() !== (this.account.firstname ?? '') ||
      this.form.middlename.trim() !== (this.account.middlename ?? '') ||
      this.form.lastname.trim() !== (this.account.lastname ?? '')
    );
  }

  async saveName(): Promise<void> {
    if (!this.account) return;
    const firstname = this.form.firstname.trim();
    const lastname = this.form.lastname.trim();
    const middlename = this.form.middlename.trim();
    if (!firstname || !lastname) {
      this.toast.warning('First and last name are required');
      return;
    }

    this.savingName = true;
    try {
      const fullName = `${firstname} ${lastname}`.trim();
      this.teacherService.update(this.account.UID, {
        firstname, lastname, middlename,
        name: fullName,
      });
      this.account = { ...this.account, firstname, lastname, middlename, name: fullName };
      if (this.user) {
        this.auth.setCurrentUser({ ...this.user, name: fullName });
        this.user = this.auth.getCurrentUser();
      }
      this.toast.success('Name updated');
    } catch {
      this.toast.error('Failed to update name');
    } finally {
      this.savingName = false;
      this.cdr.detectChanges();
    }
  }

  async savePassword(): Promise<void> {
    if (!this.account) return;
    const { current, next, confirm } = this.pwd;
    if (!current || !next || !confirm) {
      this.toast.warning('Fill in all password fields');
      return;
    }
    if (current !== this.account.password) {
      this.toast.error('Current password is incorrect');
      return;
    }
    if (next.length < 6) {
      this.toast.warning('New password must be at least 6 characters');
      return;
    }
    if (next === current) {
      this.toast.warning('New password must differ from the current one');
      return;
    }
    if (next !== confirm) {
      this.toast.error('New password confirmation does not match');
      return;
    }

    this.savingPwd = true;
    try {
      this.teacherService.update(this.account.UID, { password: next });
      this.account = { ...this.account, password: next };
      this.pwd = { current: '', next: '', confirm: '' };
      this.toast.success('Password updated');
    } catch {
      this.toast.error('Failed to update password');
    } finally {
      this.savingPwd = false;
      this.cdr.detectChanges();
    }
  }

  async onAvatarSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !this.account) return;

    this.uploadingAvatar = true;
    this.cdr.detectChanges();
    try {
      const { dataUrl } = await fileToResizedDataUrl(file);
      this.teacherService.update(this.account.UID, { avatar: dataUrl });
      this.account = { ...this.account, avatar: dataUrl };
      if (this.user) {
        this.auth.setCurrentUser({ ...this.user, avatar: dataUrl });
        this.user = this.auth.getCurrentUser();
      }
      this.toast.success('Profile picture updated');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to upload picture';
      this.toast.error('Upload failed', { text: message });
    } finally {
      this.uploadingAvatar = false;
      this.cdr.detectChanges();
    }
  }

  async removeAvatar(): Promise<void> {
    if (!this.account?.avatar) return;
    const ok = await this.toast.confirm('Remove profile picture?', {
      text: 'You\'ll be shown your initials instead.',
      confirmText: 'Remove',
    });
    if (!ok) return;
    try {
      this.teacherService.update(this.account.UID, { avatar: '' });
      this.account = { ...this.account, avatar: '' };
      if (this.user) {
        this.auth.setCurrentUser({ ...this.user, avatar: '' });
        this.user = this.auth.getCurrentUser();
      }
      this.toast.success('Profile picture removed');
    } catch {
      this.toast.error('Failed to remove picture');
    }
    this.cdr.detectChanges();
  }
}
