import { Routes } from '@angular/router';
import { Login } from './auth/login/login';
import { AdminDashboard } from './layouts/admin/admin-dashboard/admin-dashboard';
import { StudentDashboard } from './layouts/student/student-dashboard/student-dashboard';
import { TeacherDashboard } from './layouts/teacher/teacher-dashboard/teacher-dashboard';

import { AdminProfile } from './pages/admin-profile/admin-profile';
import { AdminSettings } from './pages/admin-settings/admin-settings';
import { StudentProfile } from './pages/student-profile/student-profile';
import { StudentSettings } from './pages/student-settings/student-settings';
import { TeacherProfile } from './pages/teacher-profile/teacher-profile';
import { TeacherSettings } from './pages/teacher-settings/teacher-settings';

import { AdminStudents } from './pages/admin-students/admin-students';
import { AdminTeachers } from './pages/admin-teachers/admin-teachers';
import { StudentActivity } from './pages/student-activity/student-activity';
import { StudentAnnouncement } from './pages/student-announcement/student-announcement';
import { StudentAttendance } from './pages/student-attendance/student-attendance';
import { StudentGrade } from './pages/student-grade/student-grade';
import { TeacherActivity } from './pages/teacher-activity/teacher-activity';
import { TeacherAnnouncement } from './pages/teacher-announcement/teacher-announcement';
import { TeacherAttendance } from './pages/teacher-attendance/teacher-attendance';
import { TeacherClassRecord } from './pages/teacher-class-record/teacher-class-record';


export const routes: Routes = [
    { path: '', redirectTo: 'login', pathMatch: 'full' },
    { path: 'login', component: Login },

    //admin routes
    { path: 'admin-dashboard', component: AdminDashboard},
    { path: 'admin-profile', component: AdminProfile},
    { path: 'admin-settings', component: AdminSettings},
    { path: 'admin-students', component: AdminStudents},
    { path: 'admin-teachers', component: AdminTeachers},

    //student routes
    { path: 'student-dashboard', component: StudentDashboard},
    { path: 'student-profile', component: StudentProfile},
    { path: 'student-settings', component: StudentSettings},
    { path: 'student-activity', component: StudentActivity},
    { path: 'student-announcement', component: StudentAnnouncement},
    { path: 'student-attendance', component: StudentAttendance},
    { path: 'student-grade', component: StudentGrade},

    //teacher routes
    { path: 'teacher-dashboard', component: TeacherDashboard},
    { path: 'teacher-profile', component: TeacherProfile},
    { path: 'teacher-settings', component: TeacherSettings},
    { path: 'teacher-activity', component: TeacherActivity},
    { path: 'teacher-announcement', component: TeacherAnnouncement},
    { path: 'teacher-attendance', component: TeacherAttendance},
    { path: 'teacher-class-record', component: TeacherClassRecord},
];
