import { Injectable } from '@angular/core';
import { FirestoreService } from './firestore.service';

export interface AuditLog {
  id: string;
  actorUID: string;
  actorName: string;
  action: 'create' | 'update' | 'delete';
  entityType: 'student' | 'teacher' | 'enrollment' | 'announcement' | 'course' | 'section';
  entityId: string;
  description: string;
  timestamp: string; // ISO
}

@Injectable({ providedIn: 'root' })
export class AuditLogService {
  private readonly collectionName = 'auditLogs';

  constructor(private readonly firestore: FirestoreService) {}

  async log(entry: Omit<AuditLog, 'id'>): Promise<void> {
    await this.firestore.add(this.collectionName, entry);
  }

  async getAll(): Promise<AuditLog[]> {
    return this.firestore.getAll<AuditLog>(this.collectionName);
  }
}
