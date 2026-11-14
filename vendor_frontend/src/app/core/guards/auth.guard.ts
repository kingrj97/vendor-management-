import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { Observable, of } from 'rxjs';
import { AuthService } from '../services/auth.service';

/**
 * Protects routes requiring authentication from Central Admin (PMS-compatible)
 */
export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  return authService.verifySession();
};

export function clearAuthCache(): void {
  // Provided for backward compatibility
}

export function checkAuth(vendorService?: any): Observable<boolean> {
  const authService = inject(AuthService);
  return of(authService.isAuthenticated());
}
