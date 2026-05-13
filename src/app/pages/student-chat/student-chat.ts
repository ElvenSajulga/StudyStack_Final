import {
  Component, OnInit, OnDestroy, ChangeDetectorRef,
  ViewChild, ElementRef, AfterViewChecked,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';

import { AuthService } from '../../services/auth.service';
import { AcademicService } from '../../services/academic.service';
import { TeacherAccountService, TeacherAccount } from '../../services/teacher-account.service';
import {
  ChatService, ChatMessage, ConversationSummary,
} from '../../services/chat.service';
import { ToastService } from '../../services/toast.service';

interface Contact {
  uid: string;
  name: string;
  teacherID?: string;
  avatar?: string;
}

@Component({
  selector: 'app-student-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './student-chat.html',
  styleUrl: './student-chat.scss',
})
export class StudentChat implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('threadEnd') threadEnd?: ElementRef<HTMLDivElement>;

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

  private inboxSub: Subscription | null = null;
  private shouldScrollToBottom = false;

  constructor(
    private readonly auth: AuthService,
    private readonly academic: AcademicService,
    private readonly teacherAccounts: TeacherAccountService,
    private readonly chat: ChatService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  async ngOnInit(): Promise<void> {
    try { await this.teacherAccounts.reloadFromServer(); } catch { /* keep cache */ }
    await this.loadContacts();
    this.subscribeInbox();
  }

  ngOnDestroy(): void {
    this.inboxSub?.unsubscribe();
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.threadEnd?.nativeElement.scrollIntoView({ behavior: 'auto', block: 'end' });
      this.shouldScrollToBottom = false;
    }
  }

  private get myUID(): string | undefined {
    return (this.auth.getCurrentUser() as unknown as { UID?: string })?.UID;
  }

  private get myStudentID(): string | undefined {
    return this.auth.getCurrentUser()?.studentID;
  }

  private async loadContacts(): Promise<void> {
    const studentID = this.myStudentID;
    if (!studentID) return;

    const enrollments = await this.academic.getEnrollmentsByStudentID(studentID);
    const seen = new Set<string>();
    const contacts: Contact[] = [];

    for (const e of enrollments) {
      if (!e.teacherUID || seen.has(e.teacherUID)) continue;
      seen.add(e.teacherUID);
      const acct: TeacherAccount | undefined =
        this.teacherAccounts.getByUID(e.teacherUID);
      const name = acct
        ? `${acct.firstname} ${acct.lastname}`.trim() || acct.UID
        : (e.teacherUID);
      contacts.push({
        uid: e.teacherUID,
        name,
        teacherID: acct?.teacherID,
        avatar: acct?.avatar,
      });
    }
    this.contacts = contacts.sort((a, b) => a.name.localeCompare(b.name));
  }

  private subscribeInbox(): void {
    const uid = this.myUID;
    if (!uid) { this.loading = false; this.cdr.detectChanges(); return; }

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

  filteredContacts(): Contact[] {
    const q = this.pickerQuery.trim().toLowerCase();
    if (!q) return this.contacts;
    return this.contacts.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.teacherID ?? '').toLowerCase().includes(q),
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
}
