import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export interface Announcement {
    id: string | number;
    title: string;
    message: string;
    createdAt: string; // ISO
    teacherID: string;
}

@Injectable({
    providedIn: 'root'
})
export class AnnouncementService {
    // Talk directly to json-server on port 3000
    private readonly API_URL = 'http://localhost:3000/announcements';

    constructor(private readonly http: HttpClient) {}

    getForTeacher(teacherID: string): Promise<Announcement[]> {
        return this.http
            .get<Announcement[]>(
                // json-server v1 uses `_sort=-field` for descending
                `${this.API_URL}?teacherID=${encodeURIComponent(teacherID)}&_sort=-createdAt`,
            )
            .toPromise()
            .then(list => list ?? []);
    }

    getAllForStudents(): Promise<Announcement[]> {
        return this.http
            .get<Announcement[]>(
                `${this.API_URL}?_sort=-createdAt`,
            )
            .toPromise()
            .then(list => list ?? []);
    }

    async create(teacherID: string, title: string, message: string): Promise<Announcement> {
        const payload: Omit<Announcement, 'id'> = {
            title,
            message,
            teacherID,
            createdAt: new Date().toISOString(),
        };

        const created = await this.http
            .post<Announcement>(this.API_URL, payload)
            .toPromise();

        return created as Announcement;
    }

    async delete(id: string | number): Promise<void> {
        await this.http
            .delete<void>(`${this.API_URL}/${id}`)
            .toPromise();
    }
}
