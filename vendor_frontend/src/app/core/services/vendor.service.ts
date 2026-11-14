import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

// Register / Renew / Update teeno OTP flow ke modes
export type OtpMode = 'register' | 'renew' | 'update';

@Injectable({
  providedIn: 'root'
})
export class VendorService {

  private readonly apiBaseUrl = 'http://localhost:5001/api';

  // Login ab HttpOnly cookie (vendor_token) se chalta hai.
  // withCredentials: true ke bina browser cookie na save karta hai na bhejta hai.
  private readonly opts = { withCredentials: true };

  constructor(private http: HttpClient) { }

  // ==========================================
  // LOGIN OTP (purane endpoints)
  // NOTE: backend me /otp/send aur /otp/verify route nahi hai.
  // Agar koi component use nahi karta to ye dono methods hata do.
  // ==========================================

  sendOtp(mobileNo: string): Observable<any> {
    return this.http.post<any>(
      `${this.apiBaseUrl}/otp/send`,
      { mobile_no: mobileNo },
      this.opts
    );
  }

  verifyOtp(mobileNo: string, otp: string): Observable<any> {
    return this.http.post<any>(
      `${this.apiBaseUrl}/otp/verify`,
      {
        mobile_no: mobileNo,
        otp: otp
      },
      this.opts
    );
  }

  // ==========================================
  // VENDOR LOGIN
  // Response me token nahi aata, cookie set hoti hai
  // ==========================================

  sendLoginOtp(mobileNo: string): Observable<any> {
    return this.http.post<any>(
      `${this.apiBaseUrl}/vendors/login/send-otp`,
      { mobile_no: mobileNo },
      this.opts
    );
  }

  verifyLoginOtp(mobileNo: string, otp: string): Observable<any> {
    return this.http.post<any>(
      `${this.apiBaseUrl}/vendors/login/verify-otp`,
      {
        mobile_no: mobileNo,
        otp: otp
      },
      this.opts
    );
  }

  // ==========================================
  // VENDOR REGISTRATION
  // ==========================================

  registerVendor(formData: FormData): Observable<any> {
    return this.http.post<any>(
      `${this.apiBaseUrl}/vendors/register`,
      formData,
      this.opts
    );
  }

  // ==========================================
  // GET VENDOR BY ID
  // UPDATE / RENEW PREFILL
  // ==========================================

  getVendorById(id: number): Observable<any> {
    return this.http.get<any>(
      `${this.apiBaseUrl}/vendors/${id}`,
      this.opts
    );
  }

  // ==========================================
  // NORMAL VENDOR UPDATE
  // PUT /api/vendors/update/:id
  //
  // No archive
  // No renewal folder
  // ==========================================

  updateVendorDetails(
    id: number,
    formData: FormData
  ): Observable<any> {

    return this.http.put<any>(
      `${this.apiBaseUrl}/vendors/update/${id}`,
      formData,
      this.opts
    );
  }

  // ==========================================
  // VENDOR RENEW
  // PUT /api/vendors/renew/:id
  //
  // Archive + Renew + OTP
  // ==========================================

  updateVendor(
    id: number,
    formData: FormData
  ): Observable<any> {

    return this.http.put<any>(
      `${this.apiBaseUrl}/vendors/renew/${id}`,
      formData,
      this.opts
    );
  }

  // ==========================================
  // REGISTRATION / RENEW / UPDATE OTP VERIFICATION
  //
  // register -> bina login
  // renew / update -> login cookie zaroori
  // ==========================================

  verifyRegistrationOtp(
    vendorId: number,
    otp: string,
    mode: OtpMode = 'register'
  ): Observable<any> {

    return this.http.post<any>(
      `${this.apiBaseUrl}/vendors/verify-otp`,
      {
        vendor_id: vendorId,
        otp: otp,
        mode: mode
      },
      this.opts
    );
  }

  // ==========================================
  // RESEND REGISTRATION / RENEW / UPDATE OTP
  // ==========================================

  resendRegistrationOtp(
    vendorId: number,
    mode: OtpMode = 'register'
  ): Observable<any> {

    return this.http.post<any>(
      `${this.apiBaseUrl}/vendors/resend-otp`,
      {
        vendor_id: vendorId,
        mode: mode
      },
      this.opts
    );
  }

  // ==========================================
  // LOGOUT
  // ==========================================

  logout(): Observable<any> {
    return this.http.post<any>(
      `${this.apiBaseUrl}/vendors/logout`,
      {},
      this.opts
    );
  }

  // ==========================================
  // GET ALL VENDORS
  // NOTE: backend me GET /api/vendors route nahi hai.
  // Agar koi component use nahi karta to ye method hata do.
  // ==========================================

  getVendors(): Observable<any> {
    return this.http.get<any>(
      `${this.apiBaseUrl}/vendors`,
      this.opts
    );
  }

  // ==========================================
  // GET LOGGED-IN USER VENDORS
  // ==========================================

  getMyVendors(): Observable<{
    success: boolean;
    count: number;
    data: any[];
  }> {

    return this.http.get<{
      success: boolean;
      count: number;
      data: any[];
    }>(
      `${this.apiBaseUrl}/vendors/me`,
      this.opts
    );
  }

}