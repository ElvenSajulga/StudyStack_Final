import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService, User } from '../../services/auth.service';
import { FirestoreService } from '../../services/firestore.service';
import { ToastService } from '../../services/toast.service';
import { fileToResizedDataUrl } from '../../services/image-upload.util';

/**
 * Admin records stored in the `admins` Firestore collection. Schema is
 * intentionally minimal — only fields the admin profile page touches are
 * typed here. Firestore is schema-less so writes are additive (e.g.
 * `avatar` and `email` may not be present on legacy records).
 */
interface AdminAccount {
  id?: string;
  UID: string;
  password: string;
  name: string;
  email?: string;
  avatar?: string;
}

@Component({
  selector: 'app-admin-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-profile.html',
  styleUrl: './admin-profile.scss',
})
export class AdminProfile implements OnInit {
  user: User | undefined;
  account: AdminAccount | undefined;
  loading = true;

  form = { name: '', email: '' };
  savingProfile = false;

  pwd = { current: '', next: '', confirm: '' };
  savingPwd = false;

  uploadingAvatar = false;

  constructor(
    private readonly auth: AuthService,
    private readonly firestore: FirestoreService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.user = this.auth.getCurrentUser();
    void this.loadAccount();
  }

  /**
   * Resolve the admin's Firestore record. Matches by UID first (the field
   * login.ts authenticates against) and falls back to the document id since
   * the seed admin uses `id === UID === 'admin'`.
   */
  private async loadAccount(): Promise<void> {
    if (!this.user) { this.loading = false; this.cdr.detectChanges(); return; }

    try {
      const admins = await this.firestore.getAll<AdminAccount>('admins');
      // No `auth.UID` for admin in the seed, so match on name as a last resort.
      const match = admins.find(a =>
        (this.user?.UID && a.UID === this.user.UID) ||
        a.UID === this.user?.name ||
        a.id === 'admin',
      );
      this.account = match;
      if (match) {
        this.form = {
          name: match.name ?? '',
          email: match.email ?? '',
        };
      }
    } catch {
      this.toast.error('Could not load admin profile');
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  // ── derived display state ─────────────────────────────────────────────────

  get avatar(): string {
    return this.account?.avatar ?? this.user?.avatar ?? '';
  }

  get initials(): string {
    const name = (this.account?.name ?? this.user?.name ?? '').trim();
    if (!name) return 'A';
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  get username(): string {
    return this.account?.UID ?? this.user?.name ?? '—';
  }

  get profileDirty(): boolean {
    if (!this.account) return false;
    return (
      this.form.name.trim() !== (this.account.name ?? '') ||
      this.form.email.trim() !== (this.account.email ?? '')
    );
  }

  // ── profile save (name + email) ───────────────────────────────────────────

  async saveProfile(): Promise<void> {
    if (!this.account?.id) {
      this.toast.error('Admin record could not be located');
      return;
    }
    const name = this.form.name.trim();
    const email = this.form.email.trim();
    if (!name) {
      this.toast.warning('Name is required');
      return;
    }

    this.savingProfile = true;
    try {
      await this.firestore.update('admins', this.account.id, { name, email });
      this.account = { ...this.account, name, email };
      if (this.user) {
        this.auth.setCurrentUser({ ...this.user, name });
        this.user = this.auth.getCurrentUser();
      }
      this.toast.success('Profile updated');
    } catch {
      this.toast.error('Failed to update profile');
    } finally {
      this.savingProfile = false;
      this.cdr.detectChanges();
    }
  }

  // ── password change ───────────────────────────────────────────────────────

  async savePassword(): Promise<void> {
    if (!this.account?.id) return;
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
      await this.firestore.update('admins', this.account.id, { password: next });
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

  // ── avatar ────────────────────────────────────────────────────────────────

  async onAvatarSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !this.account?.id) return;

    this.uploadingAvatar = true;
    this.cdr.detectChanges();
    try {
      const { dataUrl } = await fileToResizedDataUrl(file);
      await this.firestore.update('admins', this.account.id, { avatar: dataUrl });
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
    if (!this.account?.id || !this.account.avatar) return;
    const ok = await this.toast.confirm('Remove profile picture?', {
      text: "You'll be shown your initials instead.",
      confirmText: 'Remove',
    });
    if (!ok) return;
    try {
      await this.firestore.update('admins', this.account.id, { avatar: '' });
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
