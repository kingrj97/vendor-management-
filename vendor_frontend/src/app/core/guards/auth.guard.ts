import { PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CanActivateFn, Router } from '@angular/router';
import { Observable, catchError, map, of, shareReplay, tap } from 'rxjs';

import { VendorService } from '../services/vendor.service';

// Login check backend cookie (vendor_token) se hota hai, localStorage token se nahi.
// /vendors/me 200 de to logged in, 401 de to /login par bhejo.
//
// Shared cached check: authGuard aur guestGuard dono yehi use karte hain,
// isliye har navigation par /me dobara call nahi hota.

let inflight$: Observable<boolean> | null = null;
let lastOk = 0;
const TTL = 30_000; // 30 sec

// Logout par ye call karna zaroori hai
export function clearAuthCache(): void {
  inflight$ = null;
  lastOk = 0;
}

// true = logged in, false = logged out
export function checkAuth(vendorService: VendorService): Observable<boolean> {

  // Pichhle 30 sec me verify ho chuka
  if (Date.now() - lastOk < TTL) {
    return of(true);
  }

  // Ek hi in-flight request sab guards share karenge
  if (!inflight$) {
    inflight$ = vendorService.getMyVendors().pipe(
      map(() => true),
      catchError(() => of(false)),
      tap(ok => {
        lastOk = ok ? Date.now() : 0;
        inflight$ = null;
      }),
      shareReplay(1)
    );
  }

  return inflight$;
}

export const authGuard: CanActivateFn = () => {

  const router = inject(Router);
  const vendorService = inject(VendorService);
  const isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  // SSR par cookie nahi hoti, check browser me hoga
  if (!isBrowser) {
    return true;
  }

  return checkAuth(vendorService).pipe(
    map(ok => {
      if (ok) {
        return true;
      }

      // Purana UI data saaf karo
      localStorage.removeItem('user');
      localStorage.removeItem('userName');
      localStorage.removeItem('userPhoto');

      return router.createUrlTree(['/login']);
    })
  );
};