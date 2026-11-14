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

  // Default route (authenticated through central admin)
  {
    path: '',
    redirectTo: 'vendor-portal',
    pathMatch: 'full'
  },

  // Central Admin Login redirect (replaces local app login)
  {
    path: 'login',
    canActivate: [() => {
      if (typeof window !== 'undefined') {
        window.location.replace('http://localhost:8000/zydus-app/login');
      }
      return false;
    }],
    component: Login
  },

  // Vendor Registration (for new vendor onboarding)
  {
    path: 'register',
    component: VendorRegistration,
    canActivate: [guestGuard]
  },

  // OTP Verification (Register, Update and Renew)
  {
    path: 'otp-verification',
    component: OtpVerificationComponent,
    canActivate: [otpGuard]
  },

  // Dashboard (admin/purchaser)
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/purchaser/dashboard/dashboard')
        .then(m => m.VendorDashboard)
  },

  // Vendor Portal
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
    redirectTo: 'vendor-portal'
  }

];
