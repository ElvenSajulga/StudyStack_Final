import { Injectable } from '@angular/core';
import { FirestoreService } from './firestore.service';
import { where } from '@angular/fire/firestore';

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface Faculty {
  id: string;
  name: string;
}

export interface Course {
  id: string;
  name: string;
  facultyId: string;
}

export interface Section {
  id: string;
  name: string;
  courseId: string;
}

export interface Subject {
  id: string;
  name: string;
  units: number;
  schedule: string;
  semester: string;
  facultyId: string;
  teacherUID: string;
  teacherName?: string;
}

export interface Enrollment {
  id: string;
  studentUID: string;
  studentID: string;
  subjectId: string;
  teacherUID: string;
  sectionId?: string;
  enrolledAt: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class AcademicService {
  private readonly FAC = 'faculties';
  private readonly CRS = 'courses';
  private readonly SEC = 'sections';
  private readonly SUB = 'subjects';
  private readonly ENR = 'enrollments';

  constructor(private readonly fs: FirestoreService) {}

  private newId(): string {
    return crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`;
  }

  // ── Faculties ──────────────────────────────────────────────────────────────

  async getFaculties(): Promise<Faculty[]> {
    try {
      return await this.fs.getAll<Faculty>(this.FAC);
    } catch (e) {
      console.warn('getFaculties failed:', e);
      return [];
    }
  }

  async addFaculty(name: string): Promise<Faculty> {
    const id = this.newId();
    const faculty: Faculty = { id, name: name.trim() };
    await this.fs.set(this.FAC, id, { ...faculty });
    return faculty;
  }

  async updateFaculty(id: string, name: string): Promise<void> {
    await this.fs.update(this.FAC, id, { name: name.trim() });
  }

  async deleteFaculty(id: string): Promise<void> {
    const courses = await this.getCoursesByFaculty(id);
    await Promise.all(courses.map(c => this.deleteCourse(c.id)));
    await this.fs.delete(this.FAC, id);
  }

  // ── Courses ────────────────────────────────────────────────────────────────

  async getCourses(): Promise<Course[]> {
    try {
      return await this.fs.getAll<Course>(this.CRS);
    } catch (e) {
      console.warn('getCourses failed:', e);
      return [];
    }
  }

  async getCoursesByFaculty(facultyId: string): Promise<Course[]> {
    try {
      return await this.fs.getAll<Course>(this.CRS, [
        where('facultyId', '==', facultyId),
      ]);
    } catch {
      return [];
    }
  }

  async addCourse(name: string, facultyId: string): Promise<Course> {
    const id = this.newId();
    const course: Course = { id, name: name.trim(), facultyId };
    await this.fs.set(this.CRS, id, { ...course });
    return course;
  }

  async updateCourse(id: string, changes: Partial<Course>): Promise<void> {
    await this.fs.update(this.CRS, id, changes);
  }

  async deleteCourse(id: string): Promise<void> {
    const sections = await this.getSectionsByCourse(id);
    await Promise.all(sections.map(s => this.deleteSection(s.id)));
    await this.fs.delete(this.CRS, id);
  }

  // ── Sections ───────────────────────────────────────────────────────────────

  async getSections(): Promise<Section[]> {
    try {
      return await this.fs.getAll<Section>(this.SEC);
    } catch (e) {
      console.warn('getSections failed:', e);
      return [];
    }
  }

  async getSectionsByCourse(courseId: string): Promise<Section[]> {
    try {
      return await this.fs.getAll<Section>(this.SEC, [
        where('courseId', '==', courseId),
      ]);
    } catch {
      return [];
    }
  }

  async addSection(name: string, courseId: string): Promise<Section> {
    const id = this.newId();
    const section: Section = { id, name: name.trim(), courseId };
    await this.fs.set(this.SEC, id, { ...section });
    return section;
  }

  async updateSection(id: string, changes: Partial<Section>): Promise<void> {
    await this.fs.update(this.SEC, id, changes);
  }

  async deleteSection(id: string): Promise<void> {
    await this.fs.delete(this.SEC, id);
  }

  // ── Subjects ───────────────────────────────────────────────────────────────

  async getSubjects(): Promise<Subject[]> {
    try {
      return await this.fs.getAll<Subject>(this.SUB);
    } catch (e) {
      console.warn('getSubjects failed:', e);
      return [];
    }
  }

  async getSubjectsByTeacher(teacherUID: string): Promise<Subject[]> {
    try {
      return await this.fs.getAll<Subject>(this.SUB, [
        where('teacherUID', '==', teacherUID),
      ]);
    } catch {
      return [];
    }
  }

  async getSubjectsByFaculty(facultyId: string): Promise<Subject[]> {
    try {
      return await this.fs.getAll<Subject>(this.SUB, [
        where('facultyId', '==', facultyId),
      ]);
    } catch {
      return [];
    }
  }

  async addSubject(data: Omit<Subject, 'id'>): Promise<Subject> {
    const id = this.newId();
    const subject: Subject = { id, ...data };
    await this.fs.set(this.SUB, id, { ...subject });
    return subject;
  }

  async updateSubject(id: string, changes: Partial<Subject>): Promise<void> {
    await this.fs.update(this.SUB, id, changes);
  }

  async deleteSubject(id: string): Promise<void> {
    const enrollments = await this.getEnrollmentsBySubject(id);
    await Promise.all(enrollments.map(e => this.fs.delete(this.ENR, e.id)));
    await this.fs.delete(this.SUB, id);
  }

  // ── Enrollments ────────────────────────────────────────────────────────────

  async getEnrollments(): Promise<Enrollment[]> {
    try {
      return await this.fs.getAll<Enrollment>(this.ENR);
    } catch (e) {
      console.warn('getEnrollments failed:', e);
      return [];
    }
  }

  async getEnrollmentsByStudent(studentUID: string): Promise<Enrollment[]> {
    try {
      return await this.fs.getAll<Enrollment>(this.ENR, [
        where('studentUID', '==', studentUID),
      ]);
    } catch {
      return [];
    }
  }

  async getEnrollmentsBySubject(subjectId: string): Promise<Enrollment[]> {
    try {
      return await this.fs.getAll<Enrollment>(this.ENR, [
        where('subjectId', '==', subjectId),
      ]);
    } catch {
      return [];
    }
  }

  async getEnrollmentsByTeacher(teacherUID: string): Promise<Enrollment[]> {
    try {
      return await this.fs.getAll<Enrollment>(this.ENR, [
        where('teacherUID', '==', teacherUID),
      ]);
    } catch {
      return [];
    }
  }

  async getEnrollmentsBySection(sectionId: string): Promise<Enrollment[]> {
    try {
      return await this.fs.getAll<Enrollment>(this.ENR, [
        where('sectionId', '==', sectionId),
      ]);
    } catch {
      return [];
    }
  }

  async isEnrolled(studentUID: string, subjectId: string): Promise<boolean> {
    try {
      const list = await this.fs.getAll<Enrollment>(this.ENR, [
        where('studentUID', '==', studentUID),
        where('subjectId', '==', subjectId),
      ]);
      return list.length > 0;
    } catch {
      return false;
    }
  }

  async enrollStudent(
    data: Omit<Enrollment, 'id' | 'enrolledAt'>,
  ): Promise<Enrollment> {
    const id = this.newId();
    const enrollment: Enrollment = {
      id,
      ...data,
      enrolledAt: new Date().toISOString(),
    };
    await this.fs.set(this.ENR, id, { ...enrollment });
    return enrollment;
  }

  async removeEnrollment(enrollmentId: string): Promise<void> {
    await this.fs.delete(this.ENR, enrollmentId);
  }

  async getTeacherUIDsForStudent(studentUID: string): Promise<string[]> {
    const enrollments = await this.getEnrollmentsByStudent(studentUID);
    return [...new Set(enrollments.map(e => e.teacherUID))];
  }

  async getSubjectIDsForStudent(studentUID: string): Promise<string[]> {
    const enrollments = await this.getEnrollmentsByStudent(studentUID);
    return [...new Set(enrollments.map(e => e.subjectId))];
  }
}