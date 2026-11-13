import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  HostListener,
  Input,
  OnInit,
  Output
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  MasterService,
  MasterItem,
  MasterKey
} from '../../../core/services/admin.service';

@Component({
  selector: 'app-common-master-dialog',
  standalone: true,
  imports: [FormsModule],
  styleUrl: './common-master-dialog.css',
  templateUrl: './common-master-dialog.html',
})
export class CommonMasterDialog implements OnInit {

  /** Ab sirf 'category' ke liye use hota hai (purane parent code ke liye input rakha hai) */
  @Input() masterKey: MasterKey = 'category';

  /** Dialog heading, e.g. "Category" */
  @Input() title = 'Category';

  /** Emits the latest list so the parent can refresh without another API call */
  @Output() closed = new EventEmitter<MasterItem[]>();

  constructor(
    private masterService: MasterService,
    private cdr: ChangeDetectorRef
  ) { }

  items: MasterItem[] = [];

  loading = false;
  saving = false;
  error = '';

  // form
  name = '';
  editingId: number | null = null;

  // list
  search = '';

  // ui
  fullscreen = false;
  menuId: number | null = null;
  deleteId: number | null = null;


  ngOnInit(): void {
    this.load();
  }


  // ================= LOAD =================

  load(): void {
    this.loading = true;
    this.error = '';

    this.masterService.getAll('category').subscribe({
      next: (res: any) => {
        this.items = this.normalize(res);
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.loading = false;
        this.error = 'Could not load the list.';
        this.cdr.detectChanges();
      }
    });
  }

  /** category => id, name */
  private normalize(response: any): MasterItem[] {
    const records = Array.isArray(response)
      ? response
      : Array.isArray(response?.data) ? response.data : [];

    return records
      .map((item: any): MasterItem => ({
        id: Number(item.category_id ?? item.id),
        name: String(item.name ?? item.category_name ?? '')
      }))
      .filter((i: MasterItem) =>
        Number.isInteger(i.id) && i.id > 0 && !!i.name.trim());
  }


  // ================= LIST (search only) =================

  get filtered(): MasterItem[] {
    const q = this.search.trim().toLowerCase();
    return q
      ? this.items.filter(i => i.name.toLowerCase().includes(q))
      : this.items;
  }


  // ================= ADD / UPDATE =================

  save(): void {
    const name = this.name.trim();

    if (!name) {
      this.error = `${this.title} name is required.`;
      return;
    }

    const duplicate = this.items.some(i =>
      i.name.toLowerCase() === name.toLowerCase() &&
      i.id !== this.editingId);

    if (duplicate) {
      this.error = `"${name}" already exists.`;
      return;
    }

    this.saving = true;
    this.error = '';

    const request$ = this.editingId
      ? this.masterService.update(this.editingId, name)
      : this.masterService.create(name);

    request$.subscribe({
      next: () => {
        this.saving = false;
        this.reset();
        this.load();
      },
      error: (err: any) => {
        this.saving = false;
        this.error = err?.error?.message || 'Could not save. Try again.';
        this.cdr.detectChanges();
      }
    });
  }

  edit(item: MasterItem): void {
    this.editingId = item.id;
    this.name = item.name;
    this.menuId = null;
    this.error = '';
  }

  reset(): void {
    this.editingId = null;
    this.name = '';
    this.error = '';
  }


  // ================= DELETE =================

  askDelete(item: MasterItem): void {
    this.deleteId = item.id;
    this.menuId = null;
    this.error = '';
  }

  cancelDelete(): void {
    this.deleteId = null;
  }

  confirmDelete(): void {
    if (!this.deleteId) return;

    const id = this.deleteId;

    this.masterService.delete(id).subscribe({
      next: () => {
        this.deleteId = null;
        if (this.editingId === id) this.reset();
        this.load();
      },
      error: (err: any) => {
        this.deleteId = null;
        this.error = err?.error?.message || 'Could not delete. Try again.';
        this.cdr.detectChanges();
      }
    });
  }


  // ================= UI =================

  toggleMenu(id: number, event: Event): void {
    event.stopPropagation();
    this.menuId = this.menuId === id ? null : id;
  }

  @HostListener('document:click')
  closeMenu(): void {
    this.menuId = null;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }

  close(): void {
    this.closed.emit(this.items);
  }
}