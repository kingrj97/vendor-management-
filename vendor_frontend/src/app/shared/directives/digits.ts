import { Directive, ElementRef, HostListener } from '@angular/core';

@Directive({
  selector: '[appNumbersOnly]',
  standalone: true
})
export class NumbersOnlyDirective {

  constructor(private el: ElementRef<HTMLInputElement>) {}

  // Type, paste, drag-drop, autofill: sirf 0-9 rakho, baaki sab hata do
  @HostListener('input')
  onInput(): void {
    const input = this.el.nativeElement;
    const clean = input.value.replace(/\D/g, '');

    if (input.value !== clean) {
      input.value = clean;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  // Letters aur symbols type hi na hon
  @HostListener('keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    const allowedKeys = [
      'Backspace', 'Delete', 'Tab', 'Enter', 'Escape',
      'ArrowLeft', 'ArrowRight', 'Home', 'End'
    ];

    if (allowedKeys.includes(event.key) || event.ctrlKey || event.metaKey) {
      return;
    }

    if (!/^[0-9]$/.test(event.key)) {
      event.preventDefault();
    }
  }
}