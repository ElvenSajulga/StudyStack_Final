import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * LoginGuard — Prevents already-authenticated users from accessing /login.
 *
 * If the user IS logged in     → redirect to their role-appropriate dashboard
 * If the user is NOT logged in → allow access to the login page
 */
export const loginGuard: CanActivateFn = (_route, _state) => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  if (!auth.isLoggedIn()) {
    return true;
  }

  const role = auth.getCurrentUser()?.role;
  switch (role) {
    case 'admin':   return router.createUrlTree(['/admin-dashboard']);
    case 'teacher': return router.createUrlTree(['/teacher-dashboard']);
    case 'student': return router.createUrlTree(['/student-dashboard']);
    default:        return router.createUrlTree(['/login']);
  }
};