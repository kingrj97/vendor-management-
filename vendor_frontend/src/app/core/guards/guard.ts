import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';

import { VendorService } from '../services/vendor.service';
import { checkAuth } from './auth.guard';

export const guestGuard: CanActivateFn = (route) => {
  const router = inject(Router);
  const vendorService = inject(VendorService);
  const platformId = inject(PLATFORM_ID);

  // SSR par cookie nahi hoti
  if (!isPlatformBrowser(platformId)) {
    return true;
  }

  // Logged in + renew flow: register page allow (login check ki zarurat nahi)
  if (route.queryParamMap.get('mode') === 'renew') {
    return true;
  }

  // Logged in => portal par bhejo
  // Logged out => public page normal khulega
  // checkAuth cached hai, to har navigation par /me call nahi hota
  return checkAuth(vendorService).pipe(
    map(ok => ok ? router.createUrlTree(['/vendor-portal/vendor-list']) : true)
  );
};