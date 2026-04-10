import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FirestoreService } from '../services/firestore.service';

const dbData = {
  admins: [
    {
      id: 'admin',
      UID: 'admin',
      password: 'admin123',
      name: 'Admin User',
    },
  ],
  students: [
    {
      id: 'student1',
      UID: 'student1',
      name: 'Juan Dela Cruz',
      course: 'BSIT',
      studentID: 'S-0001',
      password: 'student123',
      email: 'student1@example.com',
      status: 'active',
      lastname: 'Dela Cruz',
      firstname: 'Juan',
      middlename: 'S',
    },
    {
      id: 'student2',
      UID: 'student2',
      name: 'Maria Santos',
      course: 'BSCS',
      studentID: 'S-0002',
      password: 'student234',
      email: 'student2@example.com',
      status: 'active',
      lastname: 'Santos',
      firstname: 'Maria',
      middlename: 'L',
    },
  ],
  teachers: [
    {
      id: 'teacher1',
      UID: 'teacher1',
      name: 'Sir Pedro',
      teacherID: 'T-0001',
      password: 'teacher123',
      email: 'teacher1@example.com',
      status: 'active',
      lastname: 'Reyes',
      firstname: 'Pedro',
      middlename: 'G',
    },
    {
      id: 'teacher2',
      UID: 'teacher2',
      name: "Ma'am Ana",
      teacherID: 'T-0002',
      password: 'teacher234',
      email: 'teacher2@example.com',
      status: 'active',
      lastname: 'Lopez',
      firstname: 'Ana',
      middlename: 'M',
    },
    {
      id: 'teacher3',
      UID: 'teacher3',
      name: '',
      teacherID: '12345',
      password: 'teacher1',
      email: 'michelle@gmail.com',
      status: 'active',
      lastname: 'Smith',
      firstname: 'Michelle',
      middlename: 'James',
    },
  ],
  announcements: [
    {
      id: '1',
      title: 'Welcome to StudyStack',
      message: 'This is a sample announcement. Teachers can post updates here for their students.',
      createdAt: '2024-01-01T08:00:00.000Z',
      teacherID: 'T-0001',
    },
    {
      id: '2',
      title: 'First quiz this week',
      message: 'Please prepare for the first quiz on Friday. Check your activities page for details.',
      createdAt: '2024-01-03T10:30:00.000Z',
      teacherID: 'T-0001',
    },
  ],
  activities: [
    {
      id: 'act-1',
      title: 'Quiz 1: Basics',
      description: 'Answer the quiz questions about the lesson.',
      type: 'quiz',
      teacherID: 'T-0001',
      deadline: '2026-03-01T12:00:00.000Z',
      closeAt: '2026-03-02T12:00:00.000Z',
      maxPoints: 10,
    },
    {
      id: 'act-2',
      title: 'Output 1: Mini project',
      description: 'Submit your output description and repository link.',
      type: 'output',
      teacherID: 'T-0001',
      deadline: '2026-03-05T12:00:00.000Z',
      closeAt: '2026-03-06T12:00:00.000Z',
      maxPoints: 20,
    },
  ],
  activitySubmissions: [
    {
      id: 'sub-1',
      activityId: 'act-1',
      studentID: 'S-0001',
      submittedAt: '2026-02-28T10:00:00.000Z',
      lastEditedAt: '2026-02-28T10:00:00.000Z',
      content: 'Answers for Quiz 1.',
      score: 8,
    },
    {
      id: 'sub-2',
      activityId: 'act-1',
      studentID: 'S-0002',
      submittedAt: '2026-03-01T15:00:00.000Z',
      lastEditedAt: '2026-03-01T15:00:00.000Z',
      content: 'My quiz answers (late submission).',
      score: 6,
    },
  ],
};

@Component({
  selector: 'app-migrate',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div style="padding: 20px; font-family: Arial; max-width: 600px;">
      <h2>Firestore Migration Tool</h2>
      <p>
        This will write all seed data directly to Firestore using each record's
        own ID as the document ID. No Firebase Auth is used.
      </p>
      <p style="color: #b91c1c;">
        ⚠️ Make sure you have cleared all Firestore collections before running.
      </p>

      <button
        (click)="runMigration()"
        [disabled]="isRunning || isDone"
        style="padding: 10px 20px; font-size: 16px; cursor: pointer; margin-bottom: 16px;"
      >
        {{ isRunning ? 'Migrating...' : isDone ? 'Done ✓' : 'Start Migration' }}
      </button>

      <pre style="background: #f3f4f6; padding: 12px; border-radius: 8px; font-size: 13px; white-space: pre-wrap;">{{ log }}</pre>
    </div>
  `,
})
export class MigrateComponent implements OnInit {
  isRunning = false;
  isDone = false;
  log = 'Ready. Press "Start Migration" to begin.\n';

  constructor(private readonly firestoreService: FirestoreService) {}

  ngOnInit(): void {}

  async runMigration(): Promise<void> {
    this.isRunning = true;
    this.isDone = false;
    this.log = 'Starting migration...\n';

    try {
      await this.migrateCollection('admins', dbData.admins);
      await this.migrateCollection('students', dbData.students);
      await this.migrateCollection('teachers', dbData.teachers);
      await this.migrateCollection('announcements', dbData.announcements);
      await this.migrateCollection('activities', dbData.activities);
      await this.migrateCollection('activitySubmissions', dbData.activitySubmissions);

      this.addLog('\n✅ Migration completed successfully!');
      this.addLog('\nLogin credentials:');
      this.addLog('  Admin  → UID: admin      | password: admin123');
      this.addLog('  Student→ UID: student1   | password: student123');
      this.addLog('  Student→ UID: student2   | password: student234');
      this.addLog('  Teacher→ UID: teacher1   | password: teacher123');
      this.addLog('  Teacher→ UID: teacher2   | password: teacher234');
      this.addLog('  Teacher→ UID: teacher3   | password: teacher1');
      this.isDone = true;
    } catch (error: unknown) {
      this.addLog('\n❌ Error: ' + String(error));
    }

    this.isRunning = false;
  }

  private async migrateCollection(
    collectionName: string,
    records: { id: string; [key: string]: unknown }[]
  ): Promise<void> {
    this.addLog(`\nMigrating "${collectionName}" (${records.length} records)...`);
    for (const record of records) {
      const { id, ...data } = record;
      try {
        await this.firestoreService.set(collectionName, id, data);
        this.addLog(`  ✓ ${collectionName}/${id}`);
      } catch (err) {
        this.addLog(`  ✗ ${collectionName}/${id} → ${String(err)}`);
      }
    }
  }

  private addLog(msg: string): void {
    this.log += msg + '\n';
  }
}