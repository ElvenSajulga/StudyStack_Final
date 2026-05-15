import {
  Component, OnInit, OnDestroy, ChangeDetectorRef,
  ViewChild, ElementRef, AfterViewChecked,
  inject, PLATFORM_ID,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';

import { AuthService } from '../../services/auth.service';
import { AcademicService } from '../../services/academic.service';
import { TeacherAccountService } from '../../services/teacher-account.service';
import { StudentAccountService } from '../../services/student-account.service';
import {
  ChatService, ChatMessage, ConversationSummary,
} from '../../services/chat.service';
import { ToastService } from '../../services/toast.service';

interface Contact {
  uid: string;
  name: string;
  credential?: string;   // teacherID for teachers, studentID for students
  avatar?: string;
}

/**
 * Globally-mounted chat widget. Sits at the lower-right of the viewport and
 * persists across route navigation. Shown only to authenticated student or
 * teacher users (admins have no chat counterparts in this app).
 *
 * The full-page chat routes (`/student-chat`, `/teacher-chat`) still exist
 * — this widget complements rather than replaces them.
 */
@Component({
  selector: 'app-floating-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './floating-chat.html',
  styleUrl: './floating-chat.scss',
})
export class FloatingChat implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('threadEnd') threadEnd?: ElementRef<HTMLDivElement>;

  expanded = false;
  loading = true;
  allMessages: ChatMessage[] = [];
  summaries: ConversationSummary[] = [];
  contacts: Contact[] = [];

  selectedUID: string | null = null;
  threadMessages: ChatMessage[] = [];
  composer = '';
  sending = false;
  showPicker = false;
  pickerQuery = '';

  private readonly platformId = inject(PLATFORM_ID);
  private inboxSub: Subscription | null = null;
  private routerSub: Subscription | null = null;
  private shouldScrollToBottom = false;
  private currentRouteUrl = '';

  // Routes where the floating widget shouldn't appear.
  private readonly hideOnRoutes = ['/login'];

  constructor(
    private readonly auth: AuthService,
    private readonly academic: AcademicService,
    private readonly teacherAccounts: TeacherAccountService,
    private readonly studentAccounts: StudentAccountService,
    private readonly chat: ChatService,
    private readonly toast: ToastService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.expanded = this.readPersistedExpanded();
    this.currentRouteUrl = this.router.url;
    this.routerSub = this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe(e => {
        this.currentRouteUrl = (e as NavigationEnd).urlAfterRedirects;
        this.cdr.detectChanges();
      });

    if (this.eligible) {
      void this.bootstrap();
    }
  }

  ngOnDestroy(): void {
    this.inboxSub?.unsubscribe();
    this.routerSub?.unsubscribe();
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.threadEnd?.nativeElement.scrollIntoView({ behavior: 'auto', block: 'end' });
      this.shouldScrollToBottom = false;
    }
  }

  // ── visibility ────────────────────────────────────────────────────────────

  /** True iff the widget should render at all (auth + role + route checks). */
  get visible(): boolean {
    if (!this.eligible) return false;
    return !this.hideOnRoutes.some(r => this.currentRouteUrl.startsWith(r));
  }

  /** True iff the current user is a chat-eligible role (student or teacher). */
  private get eligible(): boolean {
    return this.auth.isStudent() || this.auth.isTeacher();
  }

  private get myUID(): string | undefined {
    return this.auth.getCurrentUser()?.UID;
  }

  // ── boot ──────────────────────────────────────────────────────────────────

  private async bootstrap(): Promise<void> {
    try {
      if (this.auth.isStudent()) {
        try { await this.teacherAccounts.reloadFromServer(); } catch { /* keep cache */ }
      } else if (this.auth.isTeacher()) {
        try { await this.studentAccounts.reloadFromServer(); } catch { /* keep cache */ }
      }
    } catch { /* keep cache */ }
    await this.loadContacts();
    this.subscribeInbox();
  }

  private async loadContacts(): Promise<void> {
    const uid = this.myUID;
    if (!uid) return;

    if (this.auth.isStudent()) {
      const studentID = this.auth.getCurrentUser()?.studentID;
      if (!studentID) return;
      const enrollments = await this.academic.getEnrollmentsByStudentID(studentID);
      const seen = new Set<string>();
      const contacts: Contact[] = [];
      for (const e of enrollments) {
        if (!e.teacherUID || seen.has(e.teacherUID)) continue;
        seen.add(e.teacherUID);
        const acct = this.teacherAccounts.getByUID(e.teacherUID);
        contacts.push({
          uid: e.teacherUID,
          name: acct
            ? `${acct.firstname} ${acct.lastname}`.trim() || acct.UID
            : e.teacherUID,
          credential: acct?.teacherID,
          avatar: acct?.avatar,
        });
      }
      this.contacts = contacts.sort((a, b) => a.name.localeCompare(b.name));
    } else if (this.auth.isTeacher()) {
      const enrollments = await this.academic.getEnrollmentsByTeacher(uid);
      const seen = new Set<string>();
      const contacts: Contact[] = [];
      for (const e of enrollments) {
        if (!e.studentUID || seen.has(e.studentUID)) continue;
        seen.add(e.studentUID);
        const acct = this.studentAccounts.getByUID(e.studentUID);
        contacts.push({
          uid: e.studentUID,
          name: acct
            ? `${acct.firstname} ${acct.lastname}`.trim() || acct.UID
            : e.studentUID,
          credential: acct?.studentID,
          avatar: acct?.avatar,
        });
      }
      this.contacts = contacts.sort((a, b) => a.name.localeCompare(b.name));
    }
  }

  private subscribeInbox(): void {
    const uid = this.myUID;
    if (!uid) { this.loading = false; this.cdr.detectChanges(); return; }

    this.inboxSub?.unsubscribe();
    this.inboxSub = this.chat.watchAllForUser(uid).subscribe(messages => {
      this.allMessages = messages;
      this.summaries = this.chat.buildInbox(uid, messages);

      if (this.selectedUID) {
        const cid = this.chat.conversationId(uid, this.selectedUID);
        const prevLen = this.threadMessages.length;
        this.threadMessages = messages.filter(m => m.conversationId === cid);
        if (this.threadMessages.length > prevLen) this.shouldScrollToBottom = true;
      }

      this.loading = false;
      this.cdr.detectChanges();
    });
  }

  // ── expand / minimize ─────────────────────────────────────────────────────

  toggleExpanded(): void {
    this.expanded = !this.expanded;
    this.persistExpanded(this.expanded);
    if (this.expanded && this.selectedUID) this.shouldScrollToBottom = true;
  }

  minimize(): void {
    this.expanded = false;
    this.persistExpanded(false);
  }

  private get persistenceKey(): string {
    return `ss_floatingChat_expanded_${this.myUID ?? 'anon'}`;
  }

  private readPersistedExpanded(): boolean {
    if (!isPlatformBrowser(this.platformId)) return false;
    try {
      return localStorage.getItem(this.persistenceKey) === '1';
    } catch { return false; }
  }

  private persistExpanded(value: boolean): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      localStorage.setItem(this.persistenceKey, value ? '1' : '0');
    } catch { /* ignore */ }
  }

  // ── unread badge ──────────────────────────────────────────────────────────

  get unreadCount(): number {
    const uid = this.myUID;
    if (!uid) return 0;
    return this.chat.unreadTotal(uid, this.allMessages);
  }

  // ── conversation handling ─────────────────────────────────────────────────

  filteredContacts(): Contact[] {
    const q = this.pickerQuery.trim().toLowerCase();
    if (!q) return this.contacts;
    return this.contacts.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.credential ?? '').toLowerCase().includes(q),
    );
  }

  contactFor(uid: string): Contact | undefined {
    return this.contacts.find(c => c.uid === uid);
  }

  contactName(uid: string): string {
    return this.contactFor(uid)?.name ?? uid;
  }

  contactInitials(uid: string): string {
    const name = this.contactName(uid);
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  async openConversation(uid: string): Promise<void> {
    this.selectedUID = uid;
    this.showPicker = false;
    this.pickerQuery = '';
    const myUID = this.myUID;
    if (!myUID) return;
    const cid = this.chat.conversationId(myUID, uid);
    this.threadMessages = this.allMessages.filter(m => m.conversationId === cid);
    this.shouldScrollToBottom = true;
    void this.chat.markThreadRead(myUID, uid);
    this.cdr.detectChanges();
  }

  backToInbox(): void {
    this.selectedUID = null;
    this.threadMessages = [];
    this.composer = '';
  }

  togglePicker(): void {
    this.showPicker = !this.showPicker;
    this.pickerQuery = '';
  }

  async sendMessage(): Promise<void> {
    const myUID = this.myUID;
    const otherUID = this.selectedUID;
    const text = this.composer.trim();
    if (!myUID || !otherUID || !text || this.sending) return;

    this.sending = true;
    try {
      await this.chat.send(myUID, otherUID, text);
      this.composer = '';
      this.shouldScrollToBottom = true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not send message';
      this.toast.error(msg);
    } finally {
      this.sending = false;
      this.cdr.detectChanges();
    }
  }

  onComposerKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void this.sendMessage();
    }
  }

  isMine(m: ChatMessage): boolean {
    return m.fromUID === this.myUID;
  }

  trackByMessage = (_: number, m: ChatMessage) => m.id;
  trackBySummary = (_: number, s: ConversationSummary) => s.conversationId;
  trackByContact = (_: number, c: Contact) => c.uid;
}
