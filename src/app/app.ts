import { Component } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from './services/auth.service';
import Swal from 'sweetalert2';
import { NotificationPanel } from './components/notification-panel/notification-panel';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, NotificationPanel],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  constructor(
    public readonly auth: AuthService,
    private readonly router: Router,
  ) {}

  async logout(): Promise<void> {
    const res = await Swal.fire({
      icon: 'question',
      title: 'Logout?',
      text: 'Are you sure you want to logout?',
      showCancelButton: true,
      confirmButtonText: 'Logout',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#ef4444',
    });

    if (!res.isConfirmed) return;

    this.auth.clear();
    await this.router.navigate(['/login']);

    void Swal.fire({
      icon: 'success',
      title: 'Logged out',
      toast: true,
      position: 'top-end',
      timer: 1400,
      showConfirmButton: false,
      timerProgressBar: true,
    });
  }
}