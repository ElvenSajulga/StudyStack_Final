import { Injectable } from '@angular/core';
import { FirestoreService } from './firestore.service';
import { where } from '@angular/fire/firestore';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface Program {
  id: string;
  name: string; // e.g. "BSIT"
}

export interface Faculty {
  id: string;
  name: string;      // freely named by admin
  programId: string; // one faculty per program
}

export interface FacultyTeacher {
  id: string;
  facultyId: string;
  teacherUID: string;
}

export interface YearLevel {
  id: string;
  name: string;      // e.g. "1st Year"
  programId: string;
  order: number;     // for sorting: 1, 2, 3, 4
}

export interface Section {
  id: string;
  name: string;        // e.g. "BSIT 2A"
  programId: string;
  yearLevelId: string;
}

export interface Course {
  id: string;
  name: string;
  units: number;
  schedule: string;
  semester: string;
  programId: string;
}

export interface CourseSection {
  id: string;
  courseId: string;
  sectionId: string;
  teacherUID: string;
}

export interface Enrollment {
  id: string;
  studentUID: string;
  studentID: string;
  courseId: string;
  sectionId: string;
  teacherUID: string;
  enrolledAt: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class AcademicService {
  private readonly PRG = 'programs';
  private readonly FAC = 'faculties';
  private readonly FTH = 'facultyTeachers';
  private readonly YRL = 'yearLevels';
  private readonly SEC = 'sections';
  private readonly CRS = 'courses';
  private readonly CSC = 'courseSections';
  private readonly ENR = 'enrollments';

  constructor(private readonly fs: FirestoreService) {}

  private newId(): string {
    return crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`;
  }

  // ── Programs ────────────────────────────────────────────────────────────────

  async getPrograms(): Promise<Program[]> {
    try { return await this.fs.getAll<Program>(this.PRG); }
    catch (e) { console.warn('getPrograms failed:', e); return []; }
  }

  async addProgram(name: string): Promise<Program> {
    const id = this.newId();
    const program: Program = { id, name: name.trim() };
    await this.fs.set(this.PRG, id, { ...program });
    return program;
  }

  async updateProgram(id: string, name: string): Promise<void> {
    await this.fs.update(this.PRG, id, { name: name.trim() });
  }

  async deleteProgram(id: string): Promise<void> {
    // cascade: faculty, year levels, sections, courses, enrollments
    const [faculty, yearLevels, courses] = await Promise.all([
      this.getFacultyByProgram(id),
      this.getYearLevelsByProgram(id),
      this.getCoursesByProgram(id),
    ]);

    const deletions: Promise<void>[] = [];

    if (faculty) deletions.push(this.deleteFaculty(faculty.id));
    for (const yl of yearLevels) deletions.push(this.deleteYearLevel(yl.id));
    for (const c of courses) deletions.push(this.deleteCourse(c.id));

    await Promise.all(deletions);
    await this.fs.delete(this.PRG, id);
  }

  // ── Faculty ─────────────────────────────────────────────────────────────────

  async getFaculties(): Promise<Faculty[]> {
    try { return await this.fs.getAll<Faculty>(this.FAC); }
    catch (e) { console.warn('getFaculties failed:', e); return []; }
  }

  async getFacultyByProgram(programId: string): Promise<Faculty | null> {
    try {
      const list = await this.fs.getAll<Faculty>(this.FAC, [
        where('programId', '==', programId),
      ]);
      return list[0] ?? null;
    } catch { return null; }
  }

  async addFaculty(name: string, programId: string): Promise<Faculty> {
    const id = this.newId();
    const faculty: Faculty = { id, name: name.trim(), programId };
    await this.fs.set(this.FAC, id, { ...faculty });
    return faculty;
  }

  async updateFaculty(id: string, name: string): Promise<void> {
    await this.fs.update(this.FAC, id, { name: name.trim() });
  }

  async deleteFaculty(id: string): Promise<void> {
    const assignments = await this.getFacultyTeachers(id);
    await Promise.all(assignments.map(a => this.fs.delete(this.FTH, a.id)));
    await this.fs.delete(this.FAC, id);
  }

  // ── Faculty Teachers ────────────────────────────────────────────────────────

  async getFacultyTeachers(facultyId: string): Promise<FacultyTeacher[]> {
    try {
      return await this.fs.getAll<FacultyTeacher>(this.FTH, [
        where('facultyId', '==', facultyId),
      ]);
    } catch { return []; }
  }

  async getTeacherFaculties(teacherUID: string): Promise<FacultyTeacher[]> {
    try {
      return await this.fs.getAll<FacultyTeacher>(this.FTH, [
        where('teacherUID', '==', teacherUID),
      ]);
    } catch { return []; }
  }

  async assignTeacherToFaculty(facultyId: string, teacherUID: string): Promise<void> {
    // prevent duplicates
    const existing = await this.getFacultyTeachers(facultyId);
    if (existing.some(a => a.teacherUID === teacherUID)) return;
    const id = this.newId();
    await this.fs.set(this.FTH, id, { id, facultyId, teacherUID });
  }

  async removeTeacherFromFaculty(assignmentId: string): Promise<void> {
    await this.fs.delete(this.FTH, assignmentId);
  }

  // ── Year Levels ─────────────────────────────────────────────────────────────

  async getYearLevelsByProgram(programId: string): Promise<YearLevel[]> {
    try {
      const list = await this.fs.getAll<YearLevel>(this.YRL, [
        where('programId', '==', programId),
      ]);
      return list.sort((a, b) => a.order - b.order);
    } catch { return []; }
  }

  async addYearLevel(name: string, programId: string, order: number): Promise<YearLevel> {
    const id = this.newId();
    const yl: YearLevel = { id, name: name.trim(), programId, order };
    await this.fs.set(this.YRL, id, { ...yl });
    return yl;
  }

  async deleteYearLevel(id: string): Promise<void> {
    const sections = await this.getSectionsByYearLevel(id);
    await Promise.all(sections.map(s => this.deleteSection(s.id)));
    await this.fs.delete(this.YRL, id);
  }

  // seed default year levels for a new program
  async seedYearLevels(programId: string): Promise<void> {
    const defaults = ['1st Year', '2nd Year', '3rd Year', '4th Year'];
    for (let i = 0; i < defaults.length; i++) {
      await this.addYearLevel(defaults[i], programId, i + 1);
    }
  }

  // ── Sections ────────────────────────────────────────────────────────────────

  async getSections(): Promise<Section[]> {
    try { return await this.fs.getAll<Section>(this.SEC); }
    catch (e) { console.warn('getSections failed:', e); return []; }
  }

  async getSectionsByProgram(programId: string): Promise<Section[]> {
    try {
      return await this.fs.getAll<Section>(this.SEC, [
        where('programId', '==', programId),
      ]);
    } catch { return []; }
  }

  async getSectionsByYearLevel(yearLevelId: string): Promise<Section[]> {
    try {
      return await this.fs.getAll<Section>(this.SEC, [
        where('yearLevelId', '==', yearLevelId),
      ]);
    } catch { return []; }
  }

  async addSection(name: string, programId: string, yearLevelId: string): Promise<Section> {
    const id = this.newId();
    const section: Section = { id, name: name.trim(), programId, yearLevelId };
    await this.fs.set(this.SEC, id, { ...section });
    return section;
  }

  async updateSection(id: string, changes: Partial<Section>): Promise<void> {
    await this.fs.update(this.SEC, id, changes);
  }

  async deleteSection(id: string): Promise<void> {
    // remove course-section assignments and enrollments for this section
    const [courseAssignments, enrollments] = await Promise.all([
      this.getCourseSectionsBySection(id),
      this.getEnrollmentsBySection(id),
    ]);
    await Promise.all([
      ...courseAssignments.map(cs => this.fs.delete(this.CSC, cs.id)),
      ...enrollments.map(e => this.fs.delete(this.ENR, e.id)),
    ]);
    await this.fs.delete(this.SEC, id);
  }

  // ── Courses ─────────────────────────────────────────────────────────────────

  async getCourses(): Promise<Course[]> {
    try { return await this.fs.getAll<Course>(this.CRS); }
    catch (e) { console.warn('getCourses failed:', e); return []; }
  }

  async getCoursesByProgram(programId: string): Promise<Course[]> {
    try {
      return await this.fs.getAll<Course>(this.CRS, [
        where('programId', '==', programId),
      ]);
    } catch { return []; }
  }

  async addCourse(data: Omit<Course, 'id'>): Promise<Course> {
    const id = this.newId();
    const course: Course = { id, ...data };
    await this.fs.set(this.CRS, id, { ...course });
    return course;
  }

  async updateCourse(id: string, changes: Partial<Course>): Promise<void> {
    await this.fs.update(this.CRS, id, changes);
  }

  async deleteCourse(id: string): Promise<void> {
    const [courseSections, enrollments] = await Promise.all([
      this.getCourseSectionsByCourse(id),
      this.getEnrollmentsByCourse(id),
    ]);
    await Promise.all([
      ...courseSections.map(cs => this.fs.delete(this.CSC, cs.id)),
      ...enrollments.map(e => this.fs.delete(this.ENR, e.id)),
    ]);
    await this.fs.delete(this.CRS, id);
  }

  // ── Course Sections ─────────────────────────────────────────────────────────

  async getCourseSections(): Promise<CourseSection[]> {
    try { return await this.fs.getAll<CourseSection>(this.CSC); }
    catch { return []; }
  }

  async getCourseSectionsByCourse(courseId: string): Promise<CourseSection[]> {
    try {
      return await this.fs.getAll<CourseSection>(this.CSC, [
        where('courseId', '==', courseId),
      ]);
    } catch { return []; }
  }

  async getCourseSectionsBySection(sectionId: string): Promise<CourseSection[]> {
    try {
      return await this.fs.getAll<CourseSection>(this.CSC, [
        where('sectionId', '==', sectionId),
      ]);
    } catch { return []; }
  }

  async getCourseSectionsByTeacher(teacherUID: string): Promise<CourseSection[]> {
    try {
      return await this.fs.getAll<CourseSection>(this.CSC, [
        where('teacherUID', '==', teacherUID),
      ]);
    } catch { return []; }
  }

  async assignSectionToTeacher(
    courseId: string,
    sectionId: string,
    teacherUID: string,
  ): Promise<CourseSection> {
    // one teacher per section per course — remove existing first
    const existing = await this.getCourseSectionsByCourse(courseId);
    const duplicate = existing.find(cs => cs.sectionId === sectionId);
    if (duplicate) {
      await this.fs.delete(this.CSC, duplicate.id);
    }
    const id = this.newId();
    const cs: CourseSection = { id, courseId, sectionId, teacherUID };
    await this.fs.set(this.CSC, id, { ...cs });
    return cs;
  }

  async removeCourseSection(id: string): Promise<void> {
    await this.fs.delete(this.CSC, id);
  }

  // get the teacher assigned to a specific section for a specific course
  async getTeacherForSection(courseId: string, sectionId: string): Promise<string | null> {
    try {
      const list = await this.fs.getAll<CourseSection>(this.CSC, [
        where('courseId', '==', courseId),
        where('sectionId', '==', sectionId),
      ]);
      return list[0]?.teacherUID ?? null;
    } catch { return null; }
  }

  // ── Enrollments ─────────────────────────────────────────────────────────────

  async getEnrollments(): Promise<Enrollment[]> {
    try { return await this.fs.getAll<Enrollment>(this.ENR); }
    catch (e) { console.warn('getEnrollments failed:', e); return []; }
  }

  async getEnrollmentsByStudent(studentUID: string): Promise<Enrollment[]> {
    try {
      return await this.fs.getAll<Enrollment>(this.ENR, [
        where('studentUID', '==', studentUID),
      ]);
    } catch { return []; }
  }

  async getEnrollmentsByStudentID(studentID: string): Promise<Enrollment[]> {
    try {
      return await this.fs.getAll<Enrollment>(this.ENR, [
        where('studentID', '==', studentID),
      ]);
    } catch { return []; }
  }

  async getEnrollmentsByCourse(courseId: string): Promise<Enrollment[]> {
    try {
      return await this.fs.getAll<Enrollment>(this.ENR, [
        where('courseId', '==', courseId),
      ]);
    } catch { return []; }
  }

  async getEnrollmentsBySection(sectionId: string): Promise<Enrollment[]> {
    try {
      return await this.fs.getAll<Enrollment>(this.ENR, [
        where('sectionId', '==', sectionId),
      ]);
    } catch { return []; }
  }

  async getEnrollmentsByTeacher(teacherUID: string): Promise<Enrollment[]> {
    try {
      return await this.fs.getAll<Enrollment>(this.ENR, [
        where('teacherUID', '==', teacherUID),
      ]);
    } catch { return []; }
  }

  async enrollStudent(
    data: Omit<Enrollment, 'id' | 'enrolledAt'>,
  ): Promise<Enrollment> {
    const id = this.newId();
    const enrollment: Enrollment = {
      id, ...data,
      enrolledAt: new Date().toISOString(),
    };
    await this.fs.set(this.ENR, id, { ...enrollment });
    return enrollment;
  }

  async removeEnrollment(enrollmentId: string): Promise<void> {
    await this.fs.delete(this.ENR, enrollmentId);
  }

  // ── Helpers for student filtering ───────────────────────────────────────────

  async getTeacherUIDsForStudent(studentID: string): Promise<string[]> {
    const enrollments = await this.getEnrollmentsByStudentID(studentID);
    return [...new Set(enrollments.map(e => e.teacherUID))];
  }

  async getCourseIDsForStudent(studentID: string): Promise<string[]> {
    const enrollments = await this.getEnrollmentsByStudentID(studentID);
    return [...new Set(enrollments.map(e => e.courseId))];
  }
}