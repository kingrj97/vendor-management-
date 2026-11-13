import { Component, ElementRef, HostListener, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { VendorService } from '../../../core/services/vendor.service'; // apne folder ke hisaab se path
import { clearAuthCache } from '../../../core/guards/auth.guard'; // apne folder ke hisaab se path

@Component({
  selector: 'app-vendor-portal',
  imports: [RouterOutlet, RouterLink, MatIconModule],
  templateUrl: './vendor-portal.html',
  styleUrl: './vendor-portal.css',
})
export class VendorPortal {

  private router = inject(Router);
  private host = inject(ElementRef);
  private vendorService = inject(VendorService);
  private isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  userMenuOpen = false;

  // Login ke time localStorage me save hota hai, yahan se header me dikhega
  userName = this.isBrowser ? localStorage.getItem('userName') || 'Vendor' : 'Vendor';
  userPhoto = this.isBrowser
    ? localStorage.getItem('userPhoto') || 'assets/images/user-default.png'
    : 'assets/images/user-default.png';

  // Token ab HttpOnly cookie me hai (JS se dikhta nahi), isliye UI ke liye
  // login ke time save hua 'user' dekhte hain. Asli auth backend cookie se hoti hai.
  isLoggedIn = this.isBrowser ? !!localStorage.getItem('user') : false;

  toggleUserMenu(event: Event) {
    event.stopPropagation();
    this.userMenuOpen = !this.userMenuOpen;
  }

  // Bahar click karne par dropdown band ho jaye
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event) {
    const menu = this.host.nativeElement.querySelector('.user-menu');
    if (menu && !menu.contains(event.target)) {
      this.userMenuOpen = false;
    }
  }

  logout() {
    const clear = () => {
      // Guard ka cached login status saaf karo, warna guestGuard
      // /login se wapas portal par bhej dega
      clearAuthCache();

      if (this.isBrowser) {
        localStorage.clear();
        sessionStorage.clear();
      }
      this.userMenuOpen = false;
      this.router.navigate(['/login'], { replaceUrl: true });
    };

    // Pehle server par session revoke, fail ho tab bhi local logout ho jaye
    this.vendorService.logout().subscribe({ next: clear, error: clear });
  }
} 