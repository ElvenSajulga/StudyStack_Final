import { Component, OnInit, OnDestroy, HostListener, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, debounceTime, takeUntil } from 'rxjs';
import { StudentAccountService, StudentAccount } from '../../services/student-account.service';
import { TeacherAccountService, TeacherAccount } from '../../services/teacher-account.service';
import { AcademicService, Course } from '../../services/academic.service';

interface StudentResult {
  type: 'student';
  id: string;
  primaryText: string;
  secondaryText: string;
  icon: string;
  data: StudentAccount;
}

interface TeacherResult {
  type: 'teacher';
  id: string;
  primaryText: string;
  secondaryText: string;
  icon: string;
  data: TeacherAccount;
}

interface CourseResult {
  type: 'course';
  id: string;
  primaryText: string;
  secondaryText: string;
  icon: string;
  data: Course;
}

type SearchResult = StudentResult | TeacherResult | CourseResult;

interface GroupedResults {
  students: StudentResult[];
  teachers: TeacherResult[];
  courses: CourseResult[];
}

@Component({
  selector: 'app-admin-global-search',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-global-search.html',
  styleUrl: './admin-global-search.scss',
})
export class AdminGlobalSearch implements OnInit, OnDestroy {
  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;
  @ViewChild('dropdownContainer') dropdownContainer!: ElementRef;

  searchQuery = '';
  isOpen = false;
  results: GroupedResults = { students: [], teachers: [], courses: [] };
  hasResults = false;

  private readonly searchSubject = new Subject<string>();
  private readonly destroy$ = new Subject<void>();
  private courses: Course[] = [];

  constructor(
    private readonly studentService: StudentAccountService,
    private readonly teacherService: TeacherAccountService,
    private readonly academicService: AcademicService,
    private readonly router: Router,
    private readonly elementRef: ElementRef,
  ) {}

  ngOnInit(): void {
    void this.loadCourses();

    this.searchSubject
      .pipe(debounceTime(250), takeUntil(this.destroy$))
      .subscribe(query => {
        void this.performSearch(query);
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private async loadCourses(): Promise<void> {
    this.courses = await this.academicService.getCourses();
  }

  onInputChange(query: string): void {
    this.searchQuery = query;
    if (query.length > 0) {
      this.isOpen = true;
      this.searchSubject.next(query);
    } else {
      this.isOpen = false;
    }
  }

  private async performSearch(query: string): Promise<void> {
    const lowerQuery = query.toLowerCase();

    const students = this.studentService.getAll();
    const teachers = this.teacherService.getAll();

    const studentResults = students
      .filter(s =>
        s.firstname.toLowerCase().includes(lowerQuery) ||
        s.lastname.toLowerCase().includes(lowerQuery) ||
        s.studentID.toLowerCase().includes(lowerQuery)
      )
      .slice(0, 4)
      .map(s => ({
        type: 'student' as const,
        id: s.UID,
        primaryText: `${s.firstname} ${s.lastname}`,
        secondaryText: s.studentID,
        icon: 'ti-user',
        data: s,
      }));

    const teacherResults = teachers
      .filter(t =>
        t.firstname.toLowerCase().includes(lowerQuery) ||
        t.lastname.toLowerCase().includes(lowerQuery) ||
        t.teacherID.toLowerCase().includes(lowerQuery)
      )
      .slice(0, 4)
      .map(t => ({
        type: 'teacher' as const,
        id: t.UID,
        primaryText: `${t.firstname} ${t.lastname}`,
        secondaryText: t.teacherID,
        icon: 'ti-school',
        data: t,
      }));

    const courseResults = this.courses
      .filter(c => c.name.toLowerCase().includes(lowerQuery))
      .slice(0, 4)
      .map(c => ({
        type: 'course' as const,
        id: c.id,
        primaryText: c.name,
        secondaryText: c.programId || '—',
        icon: 'ti-book',
        data: c,
      }));

    this.results = {
      students: studentResults,
      teachers: teacherResults,
      courses: courseResults,
    };

    this.hasResults =
      studentResults.length > 0 || teacherResults.length > 0 || courseResults.length > 0;
  }

  selectResult(result: SearchResult): void {
    switch (result.type) {
      case 'student':
        void this.router.navigate(['/admin-students']);
        break;
      case 'teacher':
        void this.router.navigate(['/admin-teachers']);
        break;
      case 'course':
        void this.router.navigate(['/admin-subjects']);
        break;
    }
    this.closeDropdown();
  }

  closeDropdown(): void {
    this.isOpen = false;
    this.searchQuery = '';
  }

  @HostListener('document:keydown.escape')
  onEscapePress(): void {
    this.closeDropdown();
  }

  @HostListener('document:click', ['$event'])
  onClickOutside(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.closeDropdown();
    }
  }
}
