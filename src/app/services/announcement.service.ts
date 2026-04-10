import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FirestoreService } from './firestore.service';
import { where, orderBy } from '@angular/fire/firestore';

export interface Announcement {
  id: string | number;
  title: string;
  message: string;
  createdAt: string; // ISO
  teacherID: string;
}

@Injectable({
  providedIn: 'root',
})
export class AnnouncementService {
  private readonly API_URL = 'http://localhost:3000/announcements';
  private readonly COLLECTION = 'announcements';
  private useFirestore = true;

  constructor(
    private readonly http: HttpClient,
    private readonly firestoreService: FirestoreService,
  ) {}

  private async checkFirestore(): Promise<boolean> {
    try {
      await this.firestoreService.getAll(this.COLLECTION);
      return true;
    } catch {
      return false;
    }
  }

  async getForTeacher(teacherID: string): Promise<Announcement[]> {
    try {
      const list = await this.firestoreService.getAll<Announcement>(
        this.COLLECTION,
        [where('teacherID', '==', teacherID)]
      );
      // Sort by createdAt descending
      return list.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    } catch {
      this.useFirestore = false;
    }

    // Fallback to json-server
    try {
      const list = await this.http
        .get<Announcement[]>(
          `${this.API_URL}?teacherID=${encodeURIComponent(teacherID)}&_sort=-createdAt`
        )
        .toPromise();
      return list ?? [];
    } catch {
      return [];
    }
  }

  async getAllForStudents(): Promise<Announcement[]> {
    try {
      const list = await this.firestoreService.getAll<Announcement>(this.COLLECTION);
      return list.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    } catch {
      this.useFirestore = false;
    }

    try {
      const list = await this.http
        .get<Announcement[]>(`${this.API_URL}?_sort=-createdAt`)
        .toPromise();
      return list ?? [];
    } catch {
      return [];
    }
  }

  async create(
    teacherID: string,
    title: string,
    message: string
  ): Promise<Announcement> {
    const payload = {
      title,
      message,
      teacherID,
      createdAt: new Date().toISOString(),
    };

    if (this.useFirestore) {
      try {
        const id = await this.firestoreService.add(this.COLLECTION, payload);
        return { id, ...payload };
      } catch {
        this.useFirestore = false;
      }
    }

    // Fallback
    const created = await this.http
      .post<Announcement>(this.API_URL, payload)
      .toPromise();
    return created as Announcement;
  }

  async delete(id: string | number): Promise<void> {
    if (this.useFirestore) {
      try {
        await this.firestoreService.delete(this.COLLECTION, String(id));
        return;
      } catch {
        this.useFirestore = false;
      }
    }

    await this.http
      .delete<void>(`${this.API_URL}/${id}`)
      .toPromise();
  }
}