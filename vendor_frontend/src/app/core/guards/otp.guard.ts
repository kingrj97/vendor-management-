
import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CanActivateFn, Router } from '@angular/router';

const STORAGE_KEY = 'pending_vendor';
const MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

export const otpGuard: CanActivateFn = () => {

  const router = inject(Router);
  const platformId = inject(PLATFORM_ID);

  // SSR check
  if (!isPlatformBrowser(platformId)) {
    return true;
  }

  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : null;

    // Mobile validation
    const validMobile =
      typeof data?.mobile === 'string' &&
      /^[0-9]{10}$/.test(data.mobile);

    // Vendor ID validation
    const validVendorId =
      data?.mode === 'login' ||
      (
        Number.isInteger(Number(data?.id)) &&
        Number(data.id) > 0
      );

    // OTP sent time validation
    const validSentAt =
      typeof data?.sentAt === 'number' &&
      Date.now() - data.sentAt >= 0 &&
      Date.now() - data.sentAt < MAX_AGE_MS;

    // All supported modes
    const validMode =
      ['register', 'update', 'renew', 'login'].includes(data?.mode);

    // OTP sent validation
    const validOtpSent = data?.otpSent === true;

    if (
      validMobile &&
      validVendorId &&
      validSentAt &&
      validMode &&
      validOtpSent
    ) {
      return true;
    }

    sessionStorage.removeItem(STORAGE_KEY);

  } catch (error) {
    console.error('OTP Guard Error:', error);
    sessionStorage.removeItem(STORAGE_KEY);
  }

  return router.createUrlTree(['/login']);
};
