import {
  Component,
  OnDestroy,
  PLATFORM_ID,
  inject,
  signal
} from '@angular/core';

import { isPlatformBrowser, CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { VendorService } from '../../../core/services/vendor.service';

import { NumbersOnlyDirective } from '../../../shared/directives/digits';


const RESEND_SECONDS = 60;

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterLink, CommonModule, NumbersOnlyDirective],
  templateUrl: './vendor-login.html',
  styleUrl: './vendor-login.css',
})
export class Login implements OnDestroy {

  private vendorService = inject(VendorService);
  private router = inject(Router);
  private isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  mobile = '';
  otp = '';

  otpSending = signal(false);
  otpSent = signal(false);
  loggingIn = signal(false);
  resendSeconds = signal(0);
  message = signal('');

  private resendTimer: ReturnType<typeof setInterval> | undefined;
  private redirectTimer: ReturnType<typeof setTimeout> | undefined;


  // ==========================================
  // SEND OTP / RESEND OTP
  // ==========================================

  sendOtp(form: NgForm): void {

    if (this.resendSeconds() > 0 || this.otpSending()) {
      return;
    }

    const mobileCtrl = form.controls['mobile'];

    if (!mobileCtrl || mobileCtrl.invalid) {
      this.message.set(
        'Please enter a valid 10-digit mobile number.'
      );
      return;
    }

    if (!/^[0-9]{10}$/.test(this.mobile)) {
      this.message.set(
        'Please enter a valid 10-digit mobile number.'
      );
      return;
    }

    this.otpSending.set(true);
    this.message.set('');

    this.vendorService.sendLoginOtp(this.mobile).subscribe({

      next: (res: any) => {

        this.otpSending.set(false);
        this.otpSent.set(true);
        this.otp = '';

        // Save pending login details
        if (this.isBrowser) {

          sessionStorage.setItem(
            'pending_vendor',
            JSON.stringify({
              mobile: this.mobile,
              sentAt: Date.now(),
              otpSent: true,
              mode: 'login'
            })
          );

        }

        // ==================================
        // CHECK MOBILE VERIFICATION STATUS
        // ==================================

        if (res?.mobile_verified === false) {

          this.message.set(
            'Your mobile number is not verified. Redirecting to verification page...'
          );

          this.startResendTimer(
            Number(res?.resend_after_seconds) ||
            Number(res?.resend_after) ||
            RESEND_SECONDS
          );

          this.redirectTimer = setTimeout(() => {

            this.router.navigate(['/otp-verification']);

          }, 1000);

          return;
        }

        // ==================================
        // MOBILE ALREADY VERIFIED
        // ==================================

        this.message.set(
          res?.message ||
          'OTP sent successfully. Please enter OTP to login.'
        );

        this.startResendTimer(
          Number(res?.resend_after_seconds) ||
          Number(res?.resend_after) ||
          RESEND_SECONDS
        );

      },

      error: (err: any) => {

        this.otpSending.set(false);

        // Mobile number not registered
        if (err?.error?.not_registered) {

          this.message.set(
            'This number is not registered. Redirecting to registration...'
          );

          this.redirectTimer = setTimeout(() => {

            this.router.navigate(['/register']);

          }, 1500);

          return;
        }

        this.message.set(
          err?.error?.message ||
          'Could not send OTP. Please try again.'
        );

        const retryAfter = Number(
          err?.error?.retry_after_seconds ??
          err?.error?.retry_after
        );

        if (retryAfter > 0) {
          this.startResendTimer(retryAfter);
        }

      }

    });

  }


  // ==========================================
  // VERIFY OTP AND LOGIN
  // ==========================================

  login(form: NgForm): void {

    if (this.loggingIn()) {
      return;
    }

    // OTP must be sent first
    if (!this.otpSent()) {

      this.message.set(
        'Please send OTP to your mobile number first.'
      );

      return;
    }

    if (form.invalid) {

      this.message.set(
        'Please enter a valid mobile number and 6-digit OTP.'
      );

      return;
    }

    if (!/^[0-9]{10}$/.test(this.mobile)) {

      this.message.set(
        'Please enter a valid 10-digit mobile number.'
      );

      return;
    }

    if (!/^[0-9]{6}$/.test(this.otp)) {

      this.message.set(
        'OTP must contain exactly 6 digits.'
      );

      return;
    }

    this.loggingIn.set(true);
    this.message.set('');

    this.vendorService.verifyLoginOtp(
      this.mobile,
      this.otp
    ).subscribe({

      next: (res: any) => {

        this.loggingIn.set(false);

        // ==================================
        // CHECK LOGIN RESPONSE
        // ==================================

        if (!res?.success) {

          this.message.set(
            res?.message || 'Login failed. Please try again.'
          );

          return;
        }

        // ==================================
        // MOBILE VERIFICATION ONLY
        // ==================================

        if (res?.verification_only) {

          this.message.set(
            res?.message ||
            'Mobile number verified successfully. Please login again.'
          );

          this.otpSent.set(false);
          this.otp = '';

          return;
        }

        // ==================================
        // CHECK LOGIN RESPONSE
        // Token ab response me nahi aata: backend HttpOnly cookie
        // (vendor_token) set karta hai. Sirf user details chahiye.
        // ==================================

        if (!res?.user) {

          this.message.set(
            'Login response did not contain valid authentication details.'
          );

          return;
        }

        // ==================================
        // SAVE USER DETAILS (sirf UI ke liye, token nahi)
        // ==================================

        if (this.isBrowser) {

          const user = {
            ...res.user,

            // Save admin status from backend
            is_admin:
              Number(res.user?.is_admin) === 1 ? 1 : 0
          };

          localStorage.setItem(
            'userName',
            user.name || 'Vendor'
          );

          localStorage.setItem(
            'userPhoto',
            'images/user-default.png'
          );

          localStorage.setItem(
            'user',
            JSON.stringify(user)
          );

          sessionStorage.removeItem(
            'pending_vendor'
          );

        }

        // ==================================
        // LOGIN SUCCESS
        // ==================================

        this.clearResendTimer();

        this.router.navigate([
          '/vendor-portal'
        ]);

      },

      error: (err: any) => {

        this.loggingIn.set(false);

        if (err?.error?.not_registered) {

          this.router.navigate(['/register']);

          return;
        }

        this.message.set(
          err?.error?.message ||
          'Login failed. Please try again.'
        );

      }

    });

  }


  // ==========================================
  // RESEND TIMER
  // ==========================================

  private startResendTimer(seconds: number): void {

    this.clearResendTimer();

    const initialSeconds = Math.max(
      0,
      Math.floor(seconds)
    );

    this.resendSeconds.set(initialSeconds);

    if (initialSeconds <= 0) {
      return;
    }

    this.resendTimer = setInterval(() => {

      const next = this.resendSeconds() - 1;

      this.resendSeconds.set(
        Math.max(0, next)
      );

      if (next <= 0) {
        this.clearResendTimer();
      }

    }, 1000);

  }


  // ==========================================
  // CLEAR TIMER
  // ==========================================

  private clearResendTimer(): void {

    if (this.resendTimer) {

      clearInterval(this.resendTimer);

      this.resendTimer = undefined;

    }

  }


  // ==========================================
  // COMPONENT DESTROY
  // ==========================================

  ngOnDestroy(): void {

    this.clearResendTimer();

    if (this.redirectTimer) {

      clearTimeout(this.redirectTimer);

      this.redirectTimer = undefined;

    }

  }

}