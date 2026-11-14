import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Checks whether the authenticated user has a specific permission
 */
export const permissionGuard = (permissionKey: string): CanActivateFn => {
  return () => {
    const authService = inject(AuthService);
    const hasPerm = authService.hasPermission(permissionKey);
    if (!hasPerm) {
      console.warn(`[permissionGuard] Access denied. Missing permission: ${permissionKey}`);
    }
    return hasPerm;
  };
};
