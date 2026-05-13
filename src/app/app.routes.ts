import { Routes } from '@angular/router';

import { Login } from './auth/login/login';
import { AdminDashboard } from './layouts/admin/admin-dashboard/admin-dashboard';
import { StudentDashboard } from './layouts/student/student-dashboard/student-dashboard';
import { TeacherDashboard } from './layouts/teacher/teacher-dashboard/teacher-dashboard';

import { AdminProfile } from './pages/admin-profile/admin-profile';
import { AdminSettings } from './pages/admin-settings/admin-settings';
import { AdminAuditLog } from './pages/admin-audit-log/admin-audit-log';
import { StudentProfile } from './pages/student-profile/student-profile';
import { StudentSettings } from './pages/student-settings/student-settings';
import { TeacherProfile } from './pages/teacher-profile/teacher-profile';
import { TeacherSettings } from './pages/teacher-settings/teacher-settings';

import { AdminStudents } from './pages/admin-students/admin-students';
import { AdminTeachers } from './pages/admin-teachers/admin-teachers';
import { AdminFaculties } from './pages/admin-faculties/admin-faculties';
import { AdminSubjects } from './pages/admin-subjects/admin-subjects';
import { AdminEnrollments } from './pages/admin-enrollments/admin-enrollments';
import { AdminSections } from './pages/admin-sections/admin-sections';
import { AdminCourses } from './pages/admin-courses/admin-courses';
import { AdminAnnouncements } from './pages/admin-announcements/admin-announcements';

import { StudentActivity } from './pages/student-activity/student-activity';
import { StudentAnnouncement } from './pages/student-announcement/student-announcement';
import { StudentAttendance } from './pages/student-attendance/student-attendance';
import { StudentGrade } from './pages/student-grade/student-grade';
import { StudentMaterials } from './pages/student-materials/student-materials';
import { StudentChat } from './pages/student-chat/student-chat';

import { TeacherActivity } from './pages/teacher-activity/teacher-activity';
import { TeacherAnnouncement } from './pages/teacher-announcement/teacher-announcement';
import { TeacherAttendance } from './pages/teacher-attendance/teacher-attendance';
import { TeacherClassRecord } from './pages/teacher-class-record/teacher-class-record';
import { TeacherStudents } from './pages/teacher-students/teacher-students';
import { TeacherMaterials } from './pages/teacher-materials/teacher-materials';
import { TeacherChat } from './pages/teacher-chat/teacher-chat';

import { HelpCenter } from './pages/help-center/help-center';

import { MigrateComponent } from './migration/migration';

import { authGuard } from './guards/auth.guard';
import { roleGuard } from './guards/role.guard';
import { loginGuard } from './guards/login.guard';

export const routes: Routes = [
  // ── Default redirect ───────────────────────────────────────────────────────
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full',
  },

  // ── Public: Login ──────────────────────────────────────────────────────────
  // loginGuard prevents already-authenticated users from seeing this page.
  {
    path: 'login',
    component: Login,
    canActivate: [loginGuard],
  },

  // ── Admin routes ───────────────────────────────────────────────────────────
  // authGuard: must be logged in.
  // roleGuard: role must be 'admin'; others are redirected to their dashboard.
  {
    path: 'admin-dashboard',
    component: AdminDashboard,
    canActivate: [authGuard, roleGuard],
    data: { roles: ['admin'] },
  },
  {
    path: 'admin-profile',
    component: AdminProfile,
    canActivate: [authGuard, roleGuard],
    data: { roles: ['admin'] },
  },
  {
    path: 'admin-settings',
    component: AdminSettings,
    canActivate: [authGuard, roleGuard],
    data: { roles: ['admin'] },
  },
  {
    path: 'admin-students',
    component: AdminStudents,
    canActivate: [authGuard, roleGuard],
    data: { roles: ['admin'] },
  },
  {
    path: 'admin-teachers',
    component: AdminTeachers,
    canActivate: [authGuard, roleGuard],
    data: { roles: ['admin'] },
  },
  {
    path: 'admin-faculties',
    component: AdminFaculties,
    canActivate: [authGuard, roleGuard],
    data: { roles: ['admin'] },
  },
  {
    path: 'admin-subjects',
    component: AdminSubjects,
    canActivate: [authGuard, roleGuard],
    data: { roles: ['admin'] },
  },
  {
    path: 'admin-enrollments',
    component: AdminEnrollments,
    canActivate: [authGuard, roleGuard],
    data: { roles: ['admin'] },
  },
  {
    path: 'admin-sections',
    component: AdminSections,
    canActivate: [authGuard, roleGuard],
    data: { roles: ['admin'] },
  },
  {
    path: 'admin-courses',
    component: AdminCourses,
    canActivate: [authGuard, roleGuard],
    data: { roles: ['admin'] },
  },
  {
    path: 'admin-announcements',
    component: AdminAnnouncements,
    canActivate: [authGuard, roleGuard],
    data: { roles: ['admin'] },
  },
  {
    path: 'admin-audit-log',
    component: AdminAuditLog,
    canActivate: [authGuard, roleGuard],
    data: { roles: ['admin'] },
  },

  // ── Student routes ─────────────────────────────────────────────────────────
  {
    path: 'student-dashboard',
    component: StudentDashboard,
    canActivate: [authGuard, roleGuard],
    data: { roles: ['student'] },
  },
  {
    path: 'student-profile',
    component: StudentProfile,
    canActivate: [authGuard, roleGuard],
    data: { roles: ['student'] },
  },
  {
    path: 'student-settings',
    component: StudentSettings,
    canActivate: [authGuard, roleGuard],
    data: { roles: ['student'] },
  },
  {
    path: 'student-activity',
    component: StudentActivity,
    canActivate: [authGuard, roleGuard],
    data: { roles: ['student'] },
  },
  {
    path: 'student-announcement',
    component: StudentAnnouncement,
    canActivate: [authGuard, roleGuard],
    data: { roles: ['student'] },
  },
  {
    path: 'student-attendance',
    component: StudentAttendance,
    canActivate: [authGuard, roleGuard],
    data: { roles: ['student'] },
  },
  {
    path: 'student-grade',
    component: StudentGrade,
    canActivate: [authGuard, roleGuard],
    data: { roles: ['student'] },
  },
  {
    path: 'student-materials',
    component: StudentMaterials,
    canActivate: [authGuard, roleGuard],
    data: { roles: ['student'] },
  },
  {
    path: 'student-chat',
    component: StudentChat,
    canActivate: [authGuard, roleGuard],
    data: { roles: ['student'] },
  },

  // ── Teacher routes ─────────────────────────────────────────────────────────
  {
    path: 'teacher-dashboard',
    component: TeacherDashboard,
    canActivate: [authGuard, roleGuard],
    data: { roles: ['teacher'] },
  },
  {
    path: 'teacher-profile',
    component: TeacherProfile,
    canActivate: [authGuard, roleGuard],
    data: { roles: ['teacher'] },
  },
  {
    path: 'teacher-settings',
    component: TeacherSettings,
    canActivate: [authGuard, roleGuard],
    data: { roles: ['teacher'] },
  },
  {
    path: 'teacher-activity',
    component: TeacherActivity,
    canActivate: [authGuard, roleGuard],
    data: { roles: ['teacher'] },
  },
  {
    path: 'teacher-announcement',
    component: TeacherAnnouncement,
    canActivate: [authGuard, roleGuard],
    data: { roles: ['teacher'] },
  },
  {
    path: 'teacher-attendance',
    component: TeacherAttendance,
    canActivate: [authGuard, roleGuard],
    data: { roles: ['teacher'] },
  },
  {
    path: 'teacher-class-record',
    component: TeacherClassRecord,
    canActivate: [authGuard, roleGuard],
    data: { roles: ['teacher'] },
  },
  {
    path: 'teacher-students',
    component: TeacherStudents,
    canActivate: [authGuard, roleGuard],
    data: { roles: ['teacher'] },
  },
  {
    path: 'teacher-materials',
    component: TeacherMaterials,
    canActivate: [authGuard, roleGuard],
    data: { roles: ['teacher'] },
  },
  {
    path: 'teacher-chat',
    component: TeacherChat,
    canActivate: [authGuard, roleGuard],
    data: { roles: ['teacher'] },
  },

  // ── Help Center (shared by all authenticated users) ────────────────────────
  {
    path: 'help-center',
    component: HelpCenter,
    canActivate: [authGuard],
  },

  // ── Dev / Setup ────────────────────────────────────────────────────────────
  // Not guarded — intentionally accessible for initial Firestore seeding.
  {
    path: 'migrate',
    component: MigrateComponent,
  },

  // ── Wildcard fallback ──────────────────────────────────────────────────────
  // Any unknown path redirects to the login page.
  {
    path: '**',
    redirectTo: 'login',
  },
];