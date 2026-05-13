import { Injectable } from '@angular/core';
import Swal, { SweetAlertIcon, SweetAlertOptions, SweetAlertResult } from 'sweetalert2';

/** Text-style input types we expose via prompt() — excludes 'file' which has a different validator signature. */
export type PromptInputType = 'text' | 'email' | 'password' | 'number' | 'tel' | 'url' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'range';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info' | 'question';

export interface ToastOptions {
  /** Milliseconds before auto-dismiss. Defaults vary by variant; pass 0 to require a click. */
  timer?: number;
  /** Optional secondary line of text. */
  text?: string;
}

export interface DialogOptions {
  text?: string;
  /** Raw HTML body. If provided, overrides `text`. */
  html?: string;
  confirmText?: string;
  cancelText?: string;
  /** Hex/CSS color for the confirm button. */
  confirmColor?: string;
  /** Defaults to true for confirm(), false for alert(). */
  showCancel?: boolean;
}

export interface PromptOptions extends DialogOptions {
  inputType?: PromptInputType;
  placeholder?: string;
  initialValue?: string;
  /** Return a string to display as a validation error, or null/undefined to accept. */
  validator?: (value: string) => string | null | undefined;
  inputAttributes?: Record<string, string>;
}

const DEFAULT_TIMERS: Record<ToastVariant, number> = {
  success: 2000,
  info: 2500,
  warning: 3000,
  question: 3000,
  error: 0,
};

@Injectable({ providedIn: 'root' })
export class ToastService {
  // ─── Auto-dismiss toasts (top-end) ─────────────────────────────────────────

  success(title: string, options: ToastOptions = {}): void {
    this.toast('success', title, options);
  }

  error(title: string, options: ToastOptions = {}): void {
    this.toast('error', title, options);
  }

  warning(title: string, options: ToastOptions = {}): void {
    this.toast('warning', title, options);
  }

  info(title: string, options: ToastOptions = {}): void {
    this.toast('info', title, options);
  }

  private toast(variant: ToastVariant, title: string, options: ToastOptions): void {
    const timer = options.timer ?? DEFAULT_TIMERS[variant];
    void Swal.fire({
      toast: true,
      position: 'top-end',
      icon: variant as SweetAlertIcon,
      title,
      text: options.text,
      showConfirmButton: timer === 0,
      timer: timer > 0 ? timer : undefined,
      timerProgressBar: timer > 0,
    });
  }

  // ─── Modal dialogs ─────────────────────────────────────────────────────────

  /** Plain modal — single OK button, no cancel. */
  async alert(title: string, options: DialogOptions = {}, variant: ToastVariant = 'info'): Promise<void> {
    await Swal.fire({
      icon: variant as SweetAlertIcon,
      title,
      text: options.html ? undefined : options.text,
      html: options.html,
      confirmButtonText: options.confirmText ?? 'OK',
    });
  }

  /** Returns true if the user clicked the confirm button. */
  async confirm(title: string, options: DialogOptions = {}): Promise<boolean> {
    const result = await Swal.fire({
      icon: 'warning',
      title,
      text: options.html ? undefined : options.text,
      html: options.html,
      showCancelButton: options.showCancel ?? true,
      confirmButtonText: options.confirmText ?? 'Confirm',
      cancelButtonText: options.cancelText ?? 'Cancel',
      confirmButtonColor: options.confirmColor,
    });
    return result.isConfirmed === true;
  }

  /** Destructive variant of confirm: red confirm button, default 'Delete' label. */
  async confirmDestructive(title: string, options: DialogOptions = {}): Promise<boolean> {
    return this.confirm(title, {
      ...options,
      confirmText: options.confirmText ?? 'Delete',
      confirmColor: options.confirmColor ?? '#ef4444',
    });
  }

  /** Prompt for a single input value. Resolves to the entered string, or null if cancelled. */
  async prompt(title: string, options: PromptOptions = {}): Promise<string | null> {
    const swalOptions: SweetAlertOptions = {
      icon: 'question',
      title,
      text: options.html ? undefined : options.text,
      html: options.html,
      input: options.inputType ?? 'text',
      inputPlaceholder: options.placeholder,
      inputValue: options.initialValue ?? '',
      inputAttributes: options.inputAttributes,
      showCancelButton: true,
      confirmButtonText: options.confirmText ?? 'Submit',
      cancelButtonText: options.cancelText ?? 'Cancel',
      confirmButtonColor: options.confirmColor,
      inputValidator: options.validator
        ? (value: string) => options.validator!(value) ?? null
        : undefined,
    };
    const result = await Swal.fire(swalOptions);
    return result.isConfirmed ? String(result.value ?? '') : null;
  }

  /** Escape hatch: pass raw SweetAlert2 options when none of the helpers fit. */
  raw<T = unknown>(options: SweetAlertOptions): Promise<SweetAlertResult<T>> {
    return Swal.fire(options) as Promise<SweetAlertResult<T>>;
  }
}
