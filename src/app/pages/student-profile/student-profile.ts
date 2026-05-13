import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService, User } from '../../services/auth.service';
import { StudentAccount, StudentAccountService } from '../../services/student-account.service';
import { ToastService } from '../../services/toast.service';
import { fileToResizedDataUrl } from '../../services/image-upload.util';

@Component({
  selector: 'app-student-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './student-profile.html',
  styleUrl: './student-profile.scss',
})
export class StudentProfile implements OnInit {
  user: User | undefined;
  account: StudentAccount | undefined;

  /** Editable name fields. Initialised from the account on load. */
  form = { firstname: '', middlename: '', lastname: '' };
  savingName = false;

  /** Password-change form. */
  pwd = { current: '', next: '', confirm: '' };
  savingPwd = false;

  /** Avatar workflow state. */
  uploadingAvatar = false;

  constructor(
    private readonly auth: AuthService,
    private readonly studentService: StudentAccountService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.user = this.auth.getCurrentUser();
    void this.loadAccount();
  }

  private async loadAccount(): Promise<void> {
    if (!this.user?.UID) return;
    await this.studentService.reloadFromServer();
    this.account = this.studentService.getByUID(this.user.UID);
    if (this.account) {
      this.form = {
        firstname: this.account.firstname ?? '',
        middlename: this.account.middlename ?? '',
        lastname: this.account.lastname ?? '',
      };
    }
    this.cdr.detectChanges();
  }

  get studentID(): string | undefined {
    return this.account?.studentID ?? this.user?.studentID;
  }

  get email(): string {
    return this.account?.email ?? '';
  }

  get program(): string {
    return this.account?.program ?? '';
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
    if (!name) return 'S';
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  // ── Name editing ────────────────────────────────────────────────────────

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
      this.studentService.update(this.account.UID, {
        firstname, lastname, middlename,
        name: fullName,
      });
      // Reflect the changes in the local cached account + session user.
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

  // ── Password change ─────────────────────────────────────────────────────

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
      this.studentService.update(this.account.UID, { password: next });
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

  // ── Avatar upload ───────────────────────────────────────────────────────

  async onAvatarSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Reset the input value so the same file can be re-selected later.
    input.value = '';
    if (!file || !this.account) return;

    this.uploadingAvatar = true;
    this.cdr.detectChanges();
    try {
      const { dataUrl } = await fileToResizedDataUrl(file);
      this.studentService.update(this.account.UID, { avatar: dataUrl });
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
      this.studentService.update(this.account.UID, { avatar: '' });
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
