import { Routes } from '@angular/router';

// Components
import { Login } from './features/auth/vendor-login/vendor-login';
import { VendorRegistration } from './features/vendor/vendor-registration/vendor-registration';
import { OtpVerificationComponent } from './features/auth/otp-verification/otp-verification';
import { VendorPortal } from './features/vendor-portal/vendor-portal/vendor-portal';
import { VendorListComponent } from './features/vendor/vendor-list/vendor-list';

// Guards
import { otpGuard } from './core/guards/otp.guard';
import { authGuard } from './core/guards/auth.guard';
import { guestGuard } from './core/guards/guard';

export const routes: Routes = [

  // Default route
  {
    path: '',
    redirectTo: 'register',
    pathMatch: 'full'
  },

  // Login page
  {
    path: 'login',
    component: Login,
    canActivate: [guestGuard]
  },

  // Vendor Registration
  {
    path: 'register',
    component: VendorRegistration,
    canActivate: [guestGuard]
  },

  // OTP Verification
  // Register, Update and Renew tino ke liye
  {
    path: 'otp-verification',
    component: OtpVerificationComponent,
    canActivate: [otpGuard]
  },

  // Dashboard (admin/purchaser)
  // Login zaroori. Data backend me requireAdmin se bhi protected hai.
  // TODO: authGuard ke saath adminGuard bhi lagao (user.is_admin === 1 check).
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/purchaser/dashboard/dashboard')
        .then(m => m.VendorDashboard)
  },

  // Vendor Portal
  // FIX: canActivateChild hata diya. Parent par canActivate ek baar kaafi hai,
  // warna har child navigation par /me dobara call hota tha.
  {
    path: 'vendor-portal',
    component: VendorPortal,
    canActivate: [authGuard],

    children: [
      {
        path: '',
        redirectTo: 'vendor-list',
        pathMatch: 'full'
      },
      {
        path: 'vendor-list',
        component: VendorListComponent
      },
      {
        path: 'vendor-register',
        component: VendorRegistration
      }
    ]
  },

  // Wildcard route - always last
  {
    path: '**',
    redirectTo: 'register'
  }

];