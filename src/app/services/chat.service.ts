import { Injectable } from '@angular/core';
import { FirestoreService } from './firestore.service';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

/**
 * 1:1 text-only chat (D13).
 *
 * One Firestore collection `chat-messages`, each document is a single message
 * with both participants tagged. `conversationId` is the stable sorted pair
 * `${minUID}_${maxUID}` so client-side grouping is cheap.
 *
 * Messages are append-only. `readAt` is the only field we mutate after create,
 * via `markRead`.
 */
export interface ChatMessage {
  id: string;
  conversationId: string;
  fromUID: string;
  toUID: string;
  participants: [string, string];
  text: string;
  createdAt: string;   // ISO
  readAt?: string;     // ISO when the recipient opened the thread
}

export interface ConversationSummary {
  conversationId: string;
  otherUID: string;
  lastMessage: ChatMessage;
  unreadCount: number;
  totalMessages: number;
}

const MAX_MESSAGE_CHARS = 2000;

@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly COLLECTION = 'chat-messages';

  constructor(private readonly fs: FirestoreService) {}

  conversationId(a: string, b: string): string {
    return a < b ? `${a}_${b}` : `${b}_${a}`;
  }

  /**
   * Stream every message visible to `myUID`. Filtering happens client-side
   * because Firestore `array-contains` can't combine with our other shape
   * needs cleanly across the two roles.
   */
  watchAllForUser(myUID: string): Observable<ChatMessage[]> {
    return this.fs.watchAll<ChatMessage>(this.COLLECTION).pipe(
      map(all => all
        .filter(m => m.participants?.includes(myUID))
        .sort((a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        )),
      catchError(err => {
        console.warn('chat watchAllForUser failed:', err);
        return of([] as ChatMessage[]);
      }),
    );
  }

  /** Stream messages in one thread between `myUID` and `otherUID` (chronological). */
  watchThread(myUID: string, otherUID: string): Observable<ChatMessage[]> {
    const cid = this.conversationId(myUID, otherUID);
    return this.fs.watchAll<ChatMessage>(this.COLLECTION).pipe(
      map(all => all
        .filter(m => m.conversationId === cid)
        .sort((a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        )),
      catchError(err => {
        console.warn('chat watchThread failed:', err);
        return of([] as ChatMessage[]);
      }),
    );
  }

  /** Group messages into per-other-party summaries, newest activity first. */
  buildInbox(myUID: string, messages: ChatMessage[]): ConversationSummary[] {
    const byCid = new Map<string, ChatMessage[]>();
    for (const m of messages) {
      if (!byCid.has(m.conversationId)) byCid.set(m.conversationId, []);
      byCid.get(m.conversationId)!.push(m);
    }

    const summaries: ConversationSummary[] = [];
    for (const [cid, list] of byCid) {
      const sorted = [...list].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
      const last = sorted[sorted.length - 1];
      const otherUID = last.participants.find(p => p !== myUID) ?? last.fromUID;
      const unread = sorted.filter(m => m.toUID === myUID && !m.readAt).length;
      summaries.push({
        conversationId: cid,
        otherUID,
        lastMessage: last,
        unreadCount: unread,
        totalMessages: sorted.length,
      });
    }
    return summaries.sort(
      (a, b) =>
        new Date(b.lastMessage.createdAt).getTime() -
        new Date(a.lastMessage.createdAt).getTime(),
    );
  }

  /** Sum of unread counts across all conversations for `myUID`. */
  unreadTotal(myUID: string, messages: ChatMessage[]): number {
    return messages.filter(m => m.toUID === myUID && !m.readAt).length;
  }

  async send(fromUID: string, toUID: string, rawText: string): Promise<void> {
    const text = rawText.trim();
    if (!text) throw new Error('Cannot send an empty message');
    if (text.length > MAX_MESSAGE_CHARS) {
      throw new Error(`Message is too long (max ${MAX_MESSAGE_CHARS} characters)`);
    }
    if (fromUID === toUID) throw new Error('Cannot message yourself');

    const cid = this.conversationId(fromUID, toUID);
    const participants: [string, string] = fromUID < toUID
      ? [fromUID, toUID]
      : [toUID, fromUID];

    await this.fs.add(this.COLLECTION, {
      conversationId: cid,
      fromUID,
      toUID,
      participants,
      text,
      createdAt: new Date().toISOString(),
    });
  }

  /** Mark every unread message in the thread that's addressed TO `myUID` as read. */
  async markThreadRead(myUID: string, otherUID: string): Promise<void> {
    const cid = this.conversationId(myUID, otherUID);
    try {
      const all = await this.fs.getAll<ChatMessage>(this.COLLECTION);
      const unread = all.filter(m =>
        m.conversationId === cid && m.toUID === myUID && !m.readAt,
      );
      if (unread.length === 0) return;
      const now = new Date().toISOString();
      await Promise.all(unread.map(m =>
        this.fs.update(this.COLLECTION, String(m.id), { readAt: now }),
      ));
    } catch (e) {
      console.warn('markThreadRead failed:', e);
    }
  }
}
