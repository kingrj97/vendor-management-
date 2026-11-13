import {
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit
} from '@angular/core';

import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { Router } from '@angular/router';

import { VendorService } from '../../../core/services/vendor.service';

type FlowMode = 'register' | 'renew' | 'update' | 'login';

interface PendingVendor {
  id?: number;
  mobile: string;
  sentAt: number;
  otpSent: boolean;
  mode?: FlowMode;
}

const STORAGE_KEY = 'pending_vendor';
const RESEND_SECONDS = 60;

@Component({
  selector: 'app-otp-verification',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './otp-verification.html',
  styleUrl: './otp-verification.css'
})
export class OtpVerificationComponent implements OnInit, OnDestroy {

  vendorId!: number;

  mobileNo = '';
  maskedMobile = '';

  mode: FlowMode = 'register';

  otp = '';
  message = '';
  isError = false;

  verifying = false;
  resending = false;
  verified = false;

  resendSeconds = 0;

  private redirectTo = '/login';
  private resendTimer: any;

  constructor(
    private vendorService: VendorService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  get isRenew(): boolean {
    return this.mode === 'renew';
  }

  get isUpdate(): boolean {
    return this.mode === 'update';
  }

  get isLogin(): boolean {
    return this.mode === 'login';
  }

  // Register -> Login
  // Update / Renew -> Vendor List
  private nextPageAfterVerify(): string {
    return this.isRenew || this.isUpdate
      ? '/vendor-portal/vendor-list'
      : '/login';
  }

  // ==========================================
  // INITIALIZE
  // ==========================================

  ngOnInit(): void {

    const pending = this.readPendingVendor();

    if (!pending) {
      this.router.navigate(['/login']);
      return;
    }

    this.mode = pending.mode || 'register';

    this.mobileNo = pending.mobile;
    this.maskedMobile = this.maskMobile(this.mobileNo);

    if (this.mode !== 'login') {

      if (!pending.id) {
        this.router.navigate(['/register']);
        return;
      }

      this.vendorId = pending.id;
    }

    this.redirectTo = this.nextPageAfterVerify();

    if (pending.otpSent) {

      const elapsed = Math.floor(
        (Date.now() - pending.sentAt) / 1000
      );

      this.startResendTimer(
        Math.max(0, RESEND_SECONDS - elapsed)
      );

      this.setMessage(
        `OTP sent to ${this.maskedMobile}.`,
        false
      );

    } else {

      this.setMessage(
        'OTP could not be sent. Please click Resend OTP.',
        true
      );
    }
  }

  // ==========================================
  // VERIFY OTP
  // ==========================================

  verifyOtp(form: NgForm): void {

    if (this.verifying || this.verified) {
      return;
    }

    if (form.invalid || !/^\d{6}$/.test(this.otp)) {

      form.control.markAllAsTouched();

      this.setMessage(
        'Please enter a valid 6 digit OTP.',
        true
      );

      return;
    }

    this.verifying = true;
    this.setMessage('', false);

    // LOGIN OTP
    if (this.mode === 'login') {
      this.verifyLoginOtp();
      return;
    }

    // REGISTER / UPDATE / RENEW OTP
    this.vendorService
      .verifyRegistrationOtp(
        this.vendorId,
        this.otp,
        this.mode as any
      )
      .subscribe({

        next: (res: any) => {

          if (res?.success === false) {

            this.verifying = false;

            this.setMessage(
              res?.message || 'OTP verification failed.',
              true
            );

            this.cdr.detectChanges();
            return;
          }

          this.finishVerified(res?.redirect_to);
        },

        error: (err: any) => {

          this.verifying = false;

          this.setMessage(
            err?.error?.message ||
            'Invalid OTP. Please try again.',
            true
          );

          this.cdr.detectChanges();
        }
      });
  }

  // ==========================================
  // VERIFIED - REGISTER / UPDATE / RENEW
  // ==========================================

  private finishVerified(serverRedirect?: string): void {

    this.verifying = false;
    this.verified = true;

    if (this.isRenew || this.isUpdate) {

      this.redirectTo = '/vendor-portal/vendor-list';

    } else {

      this.redirectTo = serverRedirect || '/login';
    }

    sessionStorage.removeItem(STORAGE_KEY);

    clearInterval(this.resendTimer);

    this.setMessage(
      'OTP verified successfully.',
      false
    );

    this.cdr.detectChanges();
  }

  // ==========================================
  // LOGIN OTP VERIFICATION
  // ==========================================

  private verifyLoginOtp(): void {

    this.vendorService
      .verifyLoginOtp(this.mobileNo, this.otp)
      .subscribe({

        next: (res: any) => {

          this.verifying = false;

          // MOBILE VERIFICATION ONLY
          if (res?.success && res?.verification_only === true) {

            this.verified = true;

            sessionStorage.removeItem(STORAGE_KEY);

            clearInterval(this.resendTimer);

            this.setMessage(
              'Mobile number verified successfully. Please login again.',
              false
            );

            this.cdr.detectChanges();

            this.router.navigate(['/login']);

            return;
          }

          // ACTUAL LOGIN
          if (!res?.success || !res?.user) {

            this.setMessage(
              res?.message || 'OTP verification failed.',
              true
            );

            this.cdr.detectChanges();
            return;
          }

          // Token cookie (vendor_token) me hai, localStorage me nahi rakhna
          if (res.user) {

            localStorage.setItem(
              'user',
              JSON.stringify(res.user)
            );

            localStorage.setItem(
              'userName',
              res.user.name || 'Vendor'
            );
          }

          localStorage.setItem(
            'userPhoto',
            'images/user-default.png'
          );

          this.verified = true;

          this.redirectTo = '/vendor-portal/vendor-list';

          sessionStorage.removeItem(STORAGE_KEY);

          clearInterval(this.resendTimer);

          this.setMessage(
            'Login successful. Redirecting to Vendor Portal.',
            false
          );

          this.cdr.detectChanges();

          this.router.navigate(['/vendor-portal/vendor-list']);
        },

        error: (err: any) => {

          this.verifying = false;

          if (err?.error?.not_registered) {

            sessionStorage.removeItem(STORAGE_KEY);

            this.router.navigate(['/register']);

            return;
          }

          this.setMessage(
            err?.error?.message ||
            'Invalid OTP. Please try again.',
            true
          );

          this.cdr.detectChanges();
        }
      });
  }

  // ==========================================
  // GO TO NEXT PAGE
  // ==========================================

  goNext(): void {

    if (!this.verified) {
      return;
    }

    this.router.navigate([this.redirectTo]);
  }

  // ==========================================
  // RESEND OTP
  // ==========================================

  resendOtp(): void {

    if (
      this.resendSeconds > 0 ||
      this.resending ||
      this.verified
    ) {
      return;
    }

    this.resending = true;
    this.setMessage('', false);

    // LOGIN RESEND
    if (this.mode === 'login') {

      this.vendorService
        .sendLoginOtp(this.mobileNo)
        .subscribe({

          next: (res: any) => {

            this.resending = false;

            if (!res?.success) {

              this.setMessage(
                res?.message || 'Could not resend OTP.',
                true
              );

              this.cdr.detectChanges();
              return;
            }

            this.otp = '';

            this.updatePendingVendor();

            this.setMessage(
              `OTP sent to ${this.maskedMobile}.`,
              false
            );

            this.startResendTimer(
              Number(res?.resend_after_seconds) || RESEND_SECONDS
            );

            this.cdr.detectChanges();
          },

          error: (err: any) => {

            this.resending = false;

            this.setMessage(
              err?.error?.message || 'Could not resend OTP.',
              true
            );

            const retryAfter = Number(
              err?.error?.retry_after_seconds ||
              err?.error?.retry_after
            );

            if (retryAfter > 0) {
              this.startResendTimer(retryAfter);
            }

            this.cdr.detectChanges();
          }
        });

      return;
    }

    // REGISTER / UPDATE / RENEW RESEND
    this.vendorService
      .resendRegistrationOtp(
        this.vendorId,
        this.mode as any
      )
      .subscribe({

        next: (res: any) => {

          this.resending = false;

          if (res?.success === false) {

            this.setMessage(
              res?.message || 'Could not resend OTP.',
              true
            );

            this.cdr.detectChanges();
            return;
          }

          this.otp = '';

          this.updatePendingVendor();

          this.setMessage(
            `OTP sent to ${this.maskedMobile}.`,
            false
          );

          this.startResendTimer(
            Number(res?.resend_after_seconds) || RESEND_SECONDS
          );

          this.cdr.detectChanges();
        },

        error: (err: any) => {

          this.resending = false;

          this.setMessage(
            err?.error?.message || 'Could not resend OTP.',
            true
          );

          const retryAfter = Number(
            err?.error?.retry_after_seconds ||
            err?.error?.retry_after
          );

          if (retryAfter > 0) {
            this.startResendTimer(retryAfter);
          }

          this.cdr.detectChanges();
        }
      });
  }

  // ==========================================
  // READ PENDING VENDOR
  // ==========================================

  private readPendingVendor(): PendingVendor | null {

    try {

      const raw = sessionStorage.getItem(STORAGE_KEY);

      if (!raw) {
        return null;
      }

      const data = JSON.parse(raw);

      const validModes: FlowMode[] = [
        'register',
        'renew',
        'update',
        'login'
      ];

      if (
        !data?.mobile ||
        !/^[0-9]{10}$/.test(String(data.mobile)) ||
        !validModes.includes(data.mode) ||
        typeof data.sentAt !== 'number' ||
        typeof data.otpSent !== 'boolean'
      ) {
        return null;
      }

      return data as PendingVendor;

    } catch {
      return null;
    }
  }

  // ==========================================
  // UPDATE SESSION STORAGE AFTER RESEND
  // ==========================================

  private updatePendingVendor(): void {

    const pending = this.readPendingVendor();

    if (!pending) {
      return;
    }

    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...pending,
        mobile: this.mobileNo,
        sentAt: Date.now(),
        otpSent: true
      })
    );
  }

  // ==========================================
  // MASK MOBILE NUMBER
  // ==========================================

  private maskMobile(value: string): string {

    const digits = String(value ?? '').replace(/\D/g, '');

    const last4 = digits.slice(-4);

    return last4 ? 'XXXXXX' + last4 : '';
  }

  // ==========================================
  // SHOW MESSAGE
  // ==========================================

  private setMessage(
    text: string,
    isError: boolean
  ): void {

    this.message = text;
    this.isError = isError;
  }

  // ==========================================
  // RESEND TIMER
  // ==========================================

  private startResendTimer(seconds: number): void {

    clearInterval(this.resendTimer);

    this.resendSeconds = Math.max(
      0,
      Math.floor(Number(seconds) || 0)
    );

    if (this.resendSeconds <= 0) {
      return;
    }

    this.resendTimer = setInterval(() => {

      this.resendSeconds--;

      if (this.resendSeconds <= 0) {

        this.resendSeconds = 0;

        clearInterval(this.resendTimer);
      }

      this.cdr.detectChanges();

    }, 1000);
  }

  // ==========================================
  // DESTROY
  // ==========================================

  ngOnDestroy(): void {

    clearInterval(this.resendTimer);
  }
}