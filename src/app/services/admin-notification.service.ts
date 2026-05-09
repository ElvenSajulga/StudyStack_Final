import { Injectable } from '@angular/core';
import { FirestoreService } from './firestore.service';

export type NotificationType = 'student_registered' | 'teacher_registered' | 'course_no_teacher';

export interface AdminNotification {
  id: string;
  recipientUID: string;
  type: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  relatedId?: string;
  relatedName?: string;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class AdminNotificationService {
  private readonly collectionName = 'notifications';

  constructor(private readonly firestore: FirestoreService) {}

  async getNotifications(): Promise<AdminNotification[]> {
    try {
      const all = await this.firestore.getAll<AdminNotification>(this.collectionName);
      return all
        .filter(n => n.recipientUID === 'admin')
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch {
      return [];
    }
  }

  async getUnreadCount(): Promise<number> {
    const notifications = await this.getNotifications();
    return notifications.filter(n => !n.isRead).length;
  }

  async markAsRead(id: string): Promise<void> {
    await this.firestore.update(this.collectionName, id, { isRead: true });
  }

  async markAllAsRead(): Promise<void> {
    const notifications = await this.getNotifications();
    const unread = notifications.filter(n => !n.isRead);
    for (const notification of unread) {
      await this.firestore.update(this.collectionName, notification.id, { isRead: true });
    }
  }

  async createNotification(data: Omit<AdminNotification, 'id' | 'createdAt'>): Promise<void> {
    const notification: Omit<AdminNotification, 'id'> = {
      ...data,
      createdAt: new Date().toISOString(),
    };
    await this.firestore.add(this.collectionName, notification);
  }
}
