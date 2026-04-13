import { Injectable } from '@angular/core';
import { FirestoreService } from './firestore.service';
import { where } from '@angular/fire/firestore';

export interface AppNotification {
  id: string;
  recipientUID: string;   // student UID
  type: 'score-released' | 'activity-created' | 'announcement';
  title: string;
  message: string;
  activityId?: string;
  read: boolean;
  createdAt: string; // ISO
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly COLLECTION = 'notifications';

  constructor(private readonly firestoreService: FirestoreService) {}

  async getForUser(uid: string): Promise<AppNotification[]> {
    try {
      const list = await this.firestoreService.getAll<AppNotification>(
        this.COLLECTION,
        [where('recipientUID', '==', uid)]
      );
      return list.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    } catch {
      return [];
    }
  }

  async getUnreadCount(uid: string): Promise<number> {
    const all = await this.getForUser(uid);
    return all.filter(n => !n.read).length;
  }

  async markAsRead(notificationId: string): Promise<void> {
    await this.firestoreService.update(this.COLLECTION, notificationId, { read: true });
  }

  async markAllAsRead(uid: string): Promise<void> {
    const unread = (await this.getForUser(uid)).filter(n => !n.read);
    await Promise.all(unread.map(n =>
      this.firestoreService.update(this.COLLECTION, n.id, { read: true })
    ));
  }

  async createNotification(
    notification: Omit<AppNotification, 'id'>
  ): Promise<void> {
    const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    await this.firestoreService.set(this.COLLECTION, id, { id, ...notification });
  }

  /** Call this when teacher releases scores for an activity.
   *  Creates a notification for each student who submitted. */
  async notifyScoreRelease(
    studentUIDs: string[],
    activityTitle: string,
    activityId: string
  ): Promise<void> {
    const now = new Date().toISOString();
    await Promise.all(
      studentUIDs.map(uid =>
        this.createNotification({
          recipientUID: uid,
          type: 'score-released',
          title: 'Score Released',
          message: `Your score for "${activityTitle}" has been released.`,
          activityId,
          read: false,
          createdAt: now,
        })
      )
    );
  }
}