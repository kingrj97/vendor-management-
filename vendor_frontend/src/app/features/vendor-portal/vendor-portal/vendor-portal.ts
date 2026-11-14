import { Component, ElementRef, HostListener, computed, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-vendor-portal',
  imports: [RouterOutlet, MatIconModule],
  templateUrl: './vendor-portal.html',
  styleUrl: './vendor-portal.css',
})
export class VendorPortal {
  private host = inject(ElementRef);
  public authService = inject(AuthService);

  userMenuOpen = false;

  userName = computed(() => {
    const user = this.authService.currentUser();
    return user?.full_name || user?.username || 'Admin User';
  });

  deptName = computed(() => {
    const user = this.authService.currentUser();
    return user?.dept_name || 'Vendor Management';
  });

  isLoggedIn = computed(() => {
    return this.authService.isAuthenticated();
  });

  portalApplicationsUrl = this.authService.getPortalApplicationsUrl();

  toggleUserMenu(event: Event) {
    event.stopPropagation();
    this.userMenuOpen = !this.userMenuOpen;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event) {
    const menu = this.host.nativeElement.querySelector('.user-menu');
    if (menu && !menu.contains(event.target)) {
      this.userMenuOpen = false;
    }
  }

  logout() {
    this.userMenuOpen = false;
    this.authService.logout();
  }
}
