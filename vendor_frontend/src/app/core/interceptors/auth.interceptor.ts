import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { safeStorage } from '../utils/storage';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const token = safeStorage.getItem('token');
  const siteId = safeStorage.getItem('siteId');

  let modifiedReq = req;

  // Automatically inject Bearer header and site_id param
  if (token) {
    let headers = req.headers.set('Authorization', `Bearer ${token}`);
    let params = req.params;

    if (siteId && !params.has('site_id')) {
      params = params.set('site_id', siteId);
    }

    modifiedReq = req.clone({
      headers,
      params
    });
  }

  return next(modifiedReq).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401) {
        console.warn('[authInterceptor] Unauthorized (401). Redirecting to Central Admin Login...');
        authService.clearLocalSession();
        authService.redirectToLogin();
      }
      return throwError(() => error);
    })
  );
};
