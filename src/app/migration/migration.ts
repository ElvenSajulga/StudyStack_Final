// src/app/migration/migrate.ts
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { 
  Firestore, 
  doc, 
  setDoc, 
  collection, 
  getDocs,
  deleteDoc
} from '@angular/fire/firestore';
import { 
  Auth, 
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword
} from '@angular/fire/auth';

// Your db.json data pasted here
const dbData = {
  admins: [
    {
      id: "admin",
      UID: "admin",
      password: "admin123",
      name: "Admin User",
      email: "admin@studystack.local"
    }
  ],
  students: [
    {
      id: "student1",
      UID: "student1",
      name: "Juan Dela Cruz",
      course: "BSIT",
      studentID: "S-0001",
      password: "student123",
      email: "student1@example.com",
      status: "active",
      lastname: "Dela Cruz",
      firstname: "Juan",
      middlename: "S"
    },
    {
      id: "student2",
      UID: "student2",
      name: "Maria Santos",
      course: "BSCS",
      studentID: "S-0002",
      password: "student234",
      email: "student2@example.com",
      status: "active",
      lastname: "Santos",
      firstname: "Maria",
      middlename: "L"
    }
  ],
  teachers: [
    {
      id: "teacher1",
      UID: "teacher1",
      name: "Sir Pedro",
      teacherID: "T-0001",
      password: "teacher123",
      email: "teacher1@example.com",
      status: "active",
      lastname: "Reyes",
      firstname: "Pedro",
      middlename: "G"
    },
    {
      id: "teacher2",
      UID: "teacher2",
      name: "Ma'am Ana",
      teacherID: "T-0002",
      password: "teacher234",
      email: "teacher2@example.com",
      status: "active",
      lastname: "Lopez",
      firstname: "Ana",
      middlename: "M"
    },
    {
      id: "teacher3",
      UID: "teacher3",
      name: "",
      teacherID: "12345",
      password: "teacher1",
      email: "michelle@gmail.com",
      status: "active",
      lastname: "Smith",
      firstname: "Michelle",
      middlename: "James"
    }
  ],
  announcements: [
    {
      id: "1",
      title: "Welcome to StudyStack",
      message: "This is a sample announcement. Teachers can post updates here for their students.",
      createdAt: "2024-01-01T08:00:00.000Z",
      teacherID: "T-0001"
    },
    {
      id: "2",
      title: "First quiz this week",
      message: "Please prepare for the first quiz on Friday. Check your activities page for details.",
      createdAt: "2024-01-03T10:30:00.000Z",
      teacherID: "T-0001"
    }
  ],
  activities: [
    {
      id: "act-1",
      title: "Quiz 1: Basics",
      description: "Answer the quiz questions about the lesson.",
      type: "quiz",
      teacherID: "T-0001",
      deadline: "2026-03-01T12:00:00.000Z",
      closeAt: "2026-03-02T12:00:00.000Z",
      maxPoints: 10
    },
    {
      id: "act-2",
      title: "Output 1: Mini project",
      description: "Submit your output description and repository link.",
      type: "output",
      teacherID: "T-0001",
      deadline: "2026-03-05T12:00:00.000Z",
      closeAt: "2026-03-06T12:00:00.000Z",
      maxPoints: 20
    }
  ],
  activitySubmissions: [
    {
      id: "sub-1",
      activityId: "act-1",
      studentID: "S-0001",
      submittedAt: "2026-02-28T10:00:00.000Z",
      lastEditedAt: "2026-02-28T10:00:00.000Z",
      content: "Answers for Quiz 1.",
      score: 8
    },
    {
      id: "sub-2",
      activityId: "act-1",
      studentID: "S-0002",
      submittedAt: "2026-03-01T15:00:00.000Z",
      lastEditedAt: "2026-03-01T15:00:00.000Z",
      content: "My quiz answers (late submission).",
      score: 6
    }
  ]
};

@Component({
  selector: 'app-migrate',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div style="padding: 20px; font-family: Arial;">
      <h2>Firebase Migration Tool</h2>
      <p>Click the button below to migrate your db.json data to Firebase.</p>
      <p><strong>Warning:</strong> This will create new users in Firebase Auth.</p>
      
      <button 
        (click)="runMigration()" 
        [disabled]="isRunning"
        style="padding: 10px 20px; font-size: 16px; cursor: pointer;">
        {{ isRunning ? 'Migrating...' : 'Start Migration' }}
      </button>
      
      <div style="margin-top: 20px; white-space: pre-line;">
        {{ log }}
      </div>
    </div>
  `
})
export class MigrateComponent implements OnInit {
  isRunning = false;
  log = '';

  constructor(
    private firestore: Firestore,
    private auth: Auth
  ) {}

  ngOnInit(): void {}

  async runMigration(): Promise<void> {
    this.isRunning = true;
    this.log = 'Starting migration...\n';
    
    try {
      await this.migrateAdmins();
      await this.migrateTeachers();
      await this.migrateStudents();
      await this.migrateActivities();
      await this.migrateAnnouncements();
      await this.migrateSubmissions();
      
      this.log += '\nMigration completed successfully!\n';
      this.log += '\nLogin credentials:\n';
      this.log += 'Admin: admin@studystack.local / admin123\n';
      this.log += 'Teachers: Use their email from db.json\n';
      this.log += 'Students: Use their email from db.json\n';
      
    } catch (error: any) {
      this.log += '\nError: ' + error.message + '\n';
    }
    
    this.isRunning = false;
  }

  private addLog(message: string): void {
    this.log += message + '\n';
    console.log(message);
  }

  private async migrateAdmins(): Promise<void> {
    this.addLog('Migrating admins...');
    
    for (const admin of dbData.admins) {
      try {
        const email = admin.email;
        const password = admin.password;
        
        const credential = await createUserWithEmailAndPassword(this.auth, email, password);
        const uid = credential.user.uid;
        
        await setDoc(doc(this.firestore, 'users', uid), {
          uid: uid,
          email: email,
          name: admin.name,
          role: 'admin',
          status: 'active',
          createdAt: new Date()
        });
        
        this.addLog('  Created admin: ' + admin.name);
      } catch (err: any) {
        if (err.code === 'auth/email-already-in-use') {
          this.addLog('  Admin already exists: ' + admin.name);
        } else {
          this.addLog('  Error: ' + err.message);
        }
      }
    }
  }

  private async migrateTeachers(): Promise<void> {
    this.addLog('Migrating teachers...');
    
    for (const teacher of dbData.teachers) {
      try {
        const email = teacher.email;
        const password = teacher.password;
        
        const credential = await createUserWithEmailAndPassword(this.auth, email, password);
        const uid = credential.user.uid;
        
        await setDoc(doc(this.firestore, 'users', uid), {
          uid: uid,
          email: email,
          name: teacher.name || (teacher.firstname + ' ' + teacher.lastname),
          role: 'teacher',
          teacherID: teacher.teacherID,
          firstname: teacher.firstname,
          lastname: teacher.lastname,
          middlename: teacher.middlename || '',
          status: teacher.status,
          createdAt: new Date()
        });
        
        this.addLog('  Created teacher: ' + (teacher.name || teacher.firstname));
      } catch (err: any) {
        if (err.code === 'auth/email-already-in-use') {
          this.addLog('  Teacher already exists: ' + (teacher.name || teacher.firstname));
        } else {
          this.addLog('  Error: ' + err.message);
        }
      }
    }
  }

  private async migrateStudents(): Promise<void> {
    this.addLog('Migrating students...');
    
    for (const student of dbData.students) {
      try {
        const email = student.email;
        const password = student.password;
        
        const credential = await createUserWithEmailAndPassword(this.auth, email, password);
        const uid = credential.user.uid;
        
        await setDoc(doc(this.firestore, 'users', uid), {
          uid: uid,
          email: email,
          name: student.name,
          role: 'student',
          studentID: student.studentID,
          course: student.course,
          firstname: student.firstname,
          lastname: student.lastname,
          middlename: student.middlename || '',
          status: student.status,
          createdAt: new Date()
        });
        
        this.addLog('  Created student: ' + student.name);
      } catch (err: any) {
        if (err.code === 'auth/email-already-in-use') {
          this.addLog('  Student already exists: ' + student.name);
        } else {
          this.addLog('  Error: ' + err.message);
        }
      }
    }
  }

  private async migrateActivities(): Promise<void> {
    this.addLog('Migrating activities...');
    
    for (const activity of dbData.activities) {
      try {
        await setDoc(doc(this.firestore, 'activities', activity.id), {
          ...activity,
          deadline: new Date(activity.deadline),
          closeAt: new Date(activity.closeAt),
          createdAt: new Date()
        });
        this.addLog('  Created activity: ' + activity.title);
      } catch (err: any) {
        this.addLog('  Error: ' + err.message);
      }
    }
  }

  private async migrateAnnouncements(): Promise<void> {
    this.addLog('Migrating announcements...');
    
    for (const announcement of dbData.announcements) {
      try {
        await setDoc(doc(this.firestore, 'announcements', announcement.id), {
          ...announcement,
          createdAt: new Date(announcement.createdAt)
        });
        this.addLog('  Created announcement: ' + announcement.title);
      } catch (err: any) {
        this.addLog('  Error: ' + err.message);
      }
    }
  }

  private async migrateSubmissions(): Promise<void> {
    this.addLog('Migrating submissions...');
    
    for (const submission of dbData.activitySubmissions) {
      try {
        await setDoc(doc(this.firestore, 'submissions', submission.id), {
          ...submission,
          submittedAt: new Date(submission.submittedAt),
          lastEditedAt: new Date(submission.lastEditedAt)
        });
        this.addLog('  Created submission: ' + submission.id);
      } catch (err: any) {
        this.addLog('  Error: ' + err.message);
      }
    }
  }
}