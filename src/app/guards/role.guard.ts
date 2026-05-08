import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router } from '@angular/router';
import { AuthService, UserRole } from '../services/auth.service';

/**
 * RoleGuard — Enforces role-based access control on top of AuthGuard.
 *
 * Usage in routes:
 *   {
 *     path: 'admin-dashboard',
 *     component: AdminDashboard,
 *     canActivate: [authGuard, roleGuard],
 *     data: { roles: ['admin'] }
 *   }
 *
 * If the user's role is NOT in route.data.roles:
 *   - Admin   → /admin-dashboard
 *   - Teacher → /teacher-dashboard
 *   - Student → /student-dashboard
 *   - Unknown → /login
 */
export const roleGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  const allowedRoles: UserRole[] = route.data?.['roles'] ?? [];
  const currentRole = auth.getCurrentUser()?.role;

  if (currentRole && allowedRoles.includes(currentRole)) {
    return true;
  }

  return router.createUrlTree([getDashboardPath(currentRole)]);
};

/**
 * Returns the appropriate dashboard path for the given role.
 */
function getDashboardPath(role: UserRole | undefined): string {
  switch (role) {
    case 'admin':   return '/admin-dashboard';
    case 'teacher': return '/teacher-dashboard';
    case 'student': return '/student-dashboard';
    default:        return '/login';
  }
}