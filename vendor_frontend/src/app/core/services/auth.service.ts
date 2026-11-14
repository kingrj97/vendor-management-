import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, catchError, map, of, tap } from 'rxjs';
import { safeStorage } from '../utils/storage';

export interface AdminUser {
  userId?: string | number;
  id?: string | number;
  username?: string;
  full_name?: string;
  roles?: string | string[];
  dept_name?: string;
  email?: string;
  siteID?: number;
}

export interface AuthProfileResponse {
  success: boolean;
  user: AdminUser;
  userProfile?: {
    dept?: { his_dept_name?: string };
    [key: string]: any;
  };
  permissions?: Record<string, boolean>;
  siteId?: number | string;
  siteName?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private http = inject(HttpClient);
  private isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  // Configuration URLs (matches PMS configuration)
  public readonly centralAdminUrl = 'http://localhost:8000/zydus-app';
  public readonly apiBaseUrl = 'http://localhost:5001/api';

  // Reactive state
  public currentUser = signal<AdminUser | null>(this.getStoredUser());
  public permissions = signal<Record<string, boolean>>(this.getStoredPermissions());
  public isAuthenticated = signal<boolean>(this.checkInitialAuth());
  public isVerifying = signal<boolean>(false);

  private getStoredUser(): AdminUser | null {
    if (!this.isBrowser) return null;
    try {
      const data = safeStorage.getItem('user');
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  private getStoredPermissions(): Record<string, boolean> {
    if (!this.isBrowser) return {};
    try {
      const data = safeStorage.getItem('permissions');
      return data ? JSON.parse(data) : {};
    } catch {
      return {};
    }
  }

  private checkInitialAuth(): boolean {
    if (!this.isBrowser) return false;
    return !!safeStorage.getItem('token');
  }

  public getToken(): string | null {
    if (!this.isBrowser) return null;
    return safeStorage.getItem('token');
  }

  public getSiteId(): string | null {
    if (!this.isBrowser) return null;
    return safeStorage.getItem('siteId');
  }

  public redirectToLogin(): void {
    if (!this.isBrowser) return;
    const loginUrl = `${this.centralAdminUrl.replace(/\/$/, '')}/login`;
    console.warn('[AuthService] Redirecting to central admin login:', loginUrl);
    window.location.replace(loginUrl);
  }

  public getPortalApplicationsUrl(): string {
    return `${this.centralAdminUrl.replace(/\/$/, '')}/dashboard/applications`;
  }

  /**
   * Session verification matching PMS ProtectedRoute:
   * 1. Inspect URL parameters for ?token=... & ?siteId=...
   * 2. Inspect localStorage if URL parameter is absent.
   * 3. If no token found, redirect to Central Admin Login.
   * 4. Call /api/auth/me to fetch fresh user profile & permissions.
   */
  public verifySession(): Observable<boolean> {
    if (!this.isBrowser) {
      return of(true);
    }

    const searchParams = new URLSearchParams(window.location.search);
    const urlToken = searchParams.get('token');
    const urlSiteId = searchParams.get('siteId');
    const localToken = safeStorage.getItem('token');

    const tokenToVerify = urlToken || localToken;

    // Sandbox / dev token mode (matching PMS ProtectedRoute)
    if (tokenToVerify === 'sandbox-dev-token-9992') {
      safeStorage.setItem('token', 'sandbox-dev-token-9992');
      safeStorage.setItem('isLoggedIn', 'true');
      safeStorage.setItem('siteId', urlSiteId || '102');
      safeStorage.setItem('siteName', 'Zydus Corporate Hospital');

      const sandboxUser: AdminUser = {
        full_name: 'Dr. Dhruvil Nayak',
        username: 'DHRUVIL99',
        dept_name: 'CENTRAL PURCHASE DEPT',
        roles: 'SUPER_ADMIN'
      };
      const sandboxPerms = {
        'DASHBOARD_READ': true,
        'VENDOR_READ': true,
        'VENDOR_WRITE': true,
        'VENDOR_ADMIN': true,
        'SUPER_ADMIN': true
      };

      safeStorage.setItem('user', JSON.stringify(sandboxUser));
      safeStorage.setItem('permissions', JSON.stringify(sandboxPerms));

      this.currentUser.set(sandboxUser);
      this.permissions.set(sandboxPerms);
      this.isAuthenticated.set(true);
      return of(true);
    }

    // No token provided -> redirect to Central Admin login
    if (!tokenToVerify) {
      console.warn('[AuthService] No token found in URL or storage.');
      this.isAuthenticated.set(false);
      this.redirectToLogin();
      return of(false);
    }

    // URL token takes priority
    if (urlToken) {
      safeStorage.setItem('token', urlToken);
      safeStorage.setItem('isLoggedIn', 'true');
      if (urlSiteId) safeStorage.setItem('siteId', urlSiteId);
      safeStorage.setItem('siteName', 'Zydus Corporate Hospital');
    }

    this.isVerifying.set(true);

    const headers = new HttpHeaders({
      Authorization: `Bearer ${tokenToVerify}`
    });

    return this.http.get<AuthProfileResponse>(`${this.apiBaseUrl}/auth/me`, { headers }).pipe(
      map((res) => {
        this.isVerifying.set(false);

        if (res && res.success && res.user) {
          const userWithDept: AdminUser = {
            ...res.user,
            dept_name: res.userProfile?.dept?.his_dept_name || 'Vendor Management'
          };

          safeStorage.setItem('user', JSON.stringify(userWithDept));
          safeStorage.setItem('permissions', JSON.stringify(res.permissions || {}));
          if (res.siteId) safeStorage.setItem('siteId', String(res.siteId));
          if (res.siteName) safeStorage.setItem('siteName', res.siteName);

          this.currentUser.set(userWithDept);
          this.permissions.set(res.permissions || {});
          this.isAuthenticated.set(true);

          // Strip token from address bar
          if (urlToken) {
            window.history.replaceState({}, document.title, window.location.pathname);
          }

          return true;
        }

        throw new Error('Invalid auth response');
      }),
      catchError((err) => {
        console.warn('[AuthService] Token validation failed:', err?.status, err?.message);
        this.isVerifying.set(false);
        this.clearLocalSession();
        this.redirectToLogin();
        return of(false);
      })
    );
  }

  public hasPermission(permissionKey: string): boolean {
    const user = this.currentUser();
    const roles = user?.roles;

    // SUPER_ADMIN bypass (same as PMS)
    if (roles === 'SUPER_ADMIN' || (Array.isArray(roles) && roles.includes('SUPER_ADMIN'))) {
      return true;
    }

    const perms = this.permissions();
    return !!perms[permissionKey] || !!perms['*'];
  }

  public logout(): void {
    this.clearLocalSession();
    this.redirectToLogin();
  }

  public clearLocalSession(): void {
    if (!this.isBrowser) return;
    safeStorage.removeItem('token');
    safeStorage.removeItem('isLoggedIn');
    safeStorage.removeItem('user');
    safeStorage.removeItem('permissions');
    safeStorage.removeItem('siteId');
    safeStorage.removeItem('siteName');
    safeStorage.removeItem('userName');
    safeStorage.removeItem('userPhoto');

    this.currentUser.set(null);
    this.permissions.set({});
    this.isAuthenticated.set(false);
  }
}
