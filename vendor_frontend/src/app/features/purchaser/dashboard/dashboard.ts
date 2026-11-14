import {
  Component,
  HostListener,
  computed,
  inject,
  signal
} from '@angular/core';

import { Router } from '@angular/router';

import { Vendors } from '../vendors/vendors';
import { VendorService } from '../../../core/services/vendor.service';
import { AuthService } from '../../../core/services/auth.service';

type ViewKey = 'vendors';

@Component({
  selector: 'app-vendor-dashboard',
  standalone: true,

  imports: [
    Vendors
  ],

  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class VendorDashboard {

  private router = inject(Router);
  private vendorService = inject(VendorService);
  public authService = inject(AuthService);

  // =====================================
  // DEFAULT PAGE
  // =====================================

  // Purchaser login ke baad Vendors page open hoga
  view = signal<ViewKey>('vendors');


  // =====================================
  // SIDEBAR MENU
  // =====================================

  menu: {
    key: ViewKey;
    icon: string;
    label: string;
  }[] = [

    {
      key: 'vendors',
      icon: 'storefront',
      label: 'Vendors'
    }

  ];

  setView(v: ViewKey): void {

    this.view.set(v);

    this.closeSidebar();

  }


  // =====================================
  // SIDEBAR COLLAPSE / MOBILE DRAWER
  // =====================================

  collapsed = signal(false);

  mobileOpen = signal(false);

  toggleSidebar(): void {

    if (window.innerWidth <= 900) {

      this.mobileOpen.update(v => !v);

    } else {

      this.collapsed.update(v => !v);

    }

  }

  closeSidebar(): void {

    this.mobileOpen.set(false);

    this.menuOpen.set(false);

  }

  @HostListener('document:keydown.escape')
  onEscape(): void {

    this.closeSidebar();

  }


  // =====================================
  // USER MENU
  // =====================================

  menuOpen = signal(false);

  user = computed(() => {

    const name = localStorage.getItem('userName') || '';

    const initials = name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map(w => w[0].toUpperCase())
      .join('');

    return {
      name,
      role: 'Purchaser',
      initials
    };

  });

  toggleMenu(event: Event): void {

    event.stopPropagation();

    this.menuOpen.update(v => !v);

  }

  @HostListener('document:click')
  closeMenu(): void {

    this.menuOpen.set(false);

  }


  // =====================================
  // LOGOUT
  // =====================================

  // Pehle backend ko batao (session revoke + cookie clear),
  // phir local data saaf karo. Backend fail ho to bhi user ko
  // logout karke login page par bhej do.
  logout(): void {
    this.menuOpen.set(false);
    this.authService.logout();
  }

}