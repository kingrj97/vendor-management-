import { ChangeDetectorRef, Component, ElementRef, HostListener, OnDestroy, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { catchError, forkJoin, of } from 'rxjs';
import { MasterService, SiteItem } from '../../../core/services/admin.service';

export interface Vendor {
  id: number;
  name: string;
  category_name?: string;
  vendor_type?: string;
  site_name?: string;            // Preferred Location
  zydus_master_id?: number | string; // site_id se site_name match karne ke liye
  address?: string;
  city?: string;
  pincode?: string;
  state?: string;
  country?: string;
  telephone_no?: string;
  mobile_no?: string;
  mobile_no_verify?: boolean | string;
  email?: string;
  contact_person_name?: string;
  gst_number?: string;
  permanent_account_no?: string;
  status_of_vendor?: string;
  name_of_partners?: string;
  permanent_establishment?: string;
  payment_terms?: string;
  cin_number?: string;
  tds_flag?: string;
  tds_rate?: string;
  classification_of_taxable_service?: string;
  delivery_through?: string;
  bank_name?: string;
  branch_name?: string;
  ac_name?: string;
  ifsc_code?: string;
  ac_no?: string;

  // files
  gst_certificate_attachment?: string;
  pan_card_attachment?: string;
  drug_licence_attachment?: string;
  msmed_attachment?: string;
  experience_product_attachment?: string;
  coa_attachment?: string;
  experience_with_zydus_attachment?: string;
  turnover_attachment?: string;
  assets_attachment?: string;
  liabilities_attachment?: string;
  it_return_attachment?: string;
  client_details?: string;
  cancel_cheque_attachment?: string;
  company_registration_attachment?: string;
  authorization_letter_attachment?: string;
  cin_number_attachment?: string;

  status?: string; // Pending / Approved / Rejected / Renew
  createdOn?: string;
}

type ColKey = Exclude<keyof Vendor, 'id'>;
type MenuKey = 'filter' | null;

interface ColDef {
  key: ColKey;
  label: string;
  group: string;
  wrap?: boolean;
  file?: boolean; // shows a "View" button that opens the preview window
}

interface DetailField {
  key: ColKey;
  label: string;
  value: string;
  raw: string;
  file: boolean;
  wrap: boolean;
}

@Component({
  selector: 'app-vendors',
  standalone: true,
  templateUrl: './vendors.html',
  styleUrl: './vendors.css',
})
export class Vendors implements OnInit, OnDestroy {
  private sanitizer = inject(DomSanitizer);
  private masterService = inject(MasterService);
  private http = inject(HttpClient);
  private cdr = inject(ChangeDetectorRef);

  searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  vendors = signal<Vendor[]>([]);
  loading = signal(false);
  loadError = signal('');

  query = signal('');
  statusFilter = signal('All');
  openMenu = signal<MenuKey>(null);

  statuses = ['All', 'Approved', 'Rejected', 'Renew']; // Pending default hai, isliye filter me nahi

  // ---- Load data from backend ----
  ngOnInit(): void {
    this.loadVendors();
  }

  loadVendors(): void {
    this.loading.set(true);
    this.loadError.set('');

    forkJoin({
      vendors: this.masterService.getVendors(),
      // sites fail ho to bhi vendors dikhein
      sites: this.masterService.getSites().pipe(catchError(() => of([] as SiteItem[]))),
    }).subscribe({
      next: ({ vendors, sites }) => {
        this.vendors.set(
          vendors.map((r: any) => {
            const v = this.normalize(r);
            // vendor-list jaisa: zydus_master_id ko site_id se match karke site_name lo
            const site = (sites ?? []).find((s) => Number(s.site_id) === Number(v.zydus_master_id));
            if (site) v.site_name = site.site_name;
            return v;
          }),
        );
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Load vendors failed:', err);
        this.loadError.set('Could not load vendors. Please try again.');
        this.loading.set(false);
      },
    });
  }

  // camelCase / PascalCase keys ko snake_case me bhi copy karta hai (original keys waise hi rehti hain)
  private normalize(raw: any): Vendor {
    const out: any = { ...raw };
    for (const k of Object.keys(raw ?? {})) {
      const snake = k.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
      if (!(snake in out)) out[snake] = raw[k];
    }
    // backend column per_account_no hai, popup permanent_account_no padhta hai
    if (!out.permanent_account_no && out.per_account_no) {
      out.permanent_account_no = out.per_account_no;
    }
    return out as Vendor;
  }

  // ---- All fields (used by the details popup + Excel export) ----
  // NOTE: position / order / group names purane jaise hi hain.
  // Sirf label (field ka naam) vendor-list jaisa kiya gaya hai.
  readonly cols: ColDef[] = [
    { key: 'name', label: 'Vendor Name', group: 'Basic Details' },
    { key: 'mobile_no', label: 'Mobile Number', group: 'Basic Details' },
    { key: 'mobile_no_verify', label: 'Mobile Verified', group: 'Basic Details' },
    { key: 'site_name', label: 'Preferred Location', group: 'Basic Details' },
    { key: 'status', label: 'Status', group: 'Basic Details' },
    { key: 'category_name', label: 'Category', group: 'Basic Details' },
    { key: 'vendor_type', label: 'Vendor Type', group: 'Basic Details' },
    { key: 'createdOn', label: 'Created On', group: 'Basic Details' },

    { key: 'address', label: 'Address', group: 'Address', wrap: true },
    { key: 'city', label: 'City', group: 'Address' },
    { key: 'pincode', label: 'PIN Code', group: 'Address' },
    { key: 'state', label: 'State', group: 'Address' },
    { key: 'country', label: 'Country', group: 'Address' },

    { key: 'telephone_no', label: 'Telephone Number', group: 'Contact' },
    { key: 'email', label: 'Email Address', group: 'Contact' },
    { key: 'contact_person_name', label: 'Contact Person Name', group: 'Contact' },

    { key: 'gst_number', label: 'GST Number', group: 'Tax & Registration' },
    { key: 'permanent_account_no', label: 'Permanent Account No.', group: 'Tax & Registration' },
    { key: 'status_of_vendor', label: 'Status of Vendor [for Income Tax Purpose]', group: 'Tax & Registration' },
    { key: 'name_of_partners', label: 'Name of Partners / Directors / Proprietor', group: 'Tax & Registration', wrap: true },
    { key: 'permanent_establishment', label: 'Permanent Establishment [PE] in India', group: 'Tax & Registration' },
    { key: 'cin_number', label: 'Corporate Identity Number (CIN)', group: 'Tax & Registration' },
    { key: 'tds_flag', label: 'TDS Flag', group: 'Tax & Registration' },
    { key: 'tds_rate', label: 'TDS Rate', group: 'Tax & Registration' },
    { key: 'classification_of_taxable_service', label: 'Description / Classification of Taxable Service', group: 'Tax & Registration', wrap: true },

    { key: 'payment_terms', label: 'Payment Terms', group: 'Payment & Delivery' },
    { key: 'delivery_through', label: 'Delivery Through', group: 'Payment & Delivery' },

    { key: 'bank_name', label: 'Bank Name', group: 'Bank Details' },
    { key: 'branch_name', label: 'Branch Name', group: 'Bank Details' },
    { key: 'ac_name', label: 'A/c. Name', group: 'Bank Details' },
    { key: 'ifsc_code', label: 'IFSC Code', group: 'Bank Details' },
    { key: 'ac_no', label: 'A/c. No.', group: 'Bank Details' },

    // files
    { key: 'gst_certificate_attachment', label: 'GST Certificate', group: 'Documents', file: true },
    { key: 'pan_card_attachment', label: 'Pancard Certificate', group: 'Documents', file: true },
    { key: 'drug_licence_attachment', label: 'Drug Licence', group: 'Documents', file: true },
    { key: 'msmed_attachment', label: 'Please Attach a Valid MSMED Proof', group: 'Documents', file: true },
    { key: 'experience_product_attachment', label: 'Experience for Each Product (Manufacturing & Technical Details / Catalogue)', group: 'Documents', file: true },
    { key: 'coa_attachment', label: 'Certificate of Analysis (COA) if applicable', group: 'Documents', file: true },
    { key: 'experience_with_zydus_attachment', label: 'Experience with Zydus Group Certificates', group: 'Documents', file: true },
    { key: 'turnover_attachment', label: 'Turnover of the Enterprise (for last three years)', group: 'Documents', file: true },
    { key: 'assets_attachment', label: 'Assets Details', group: 'Documents', file: true },
    { key: 'liabilities_attachment', label: 'Liabilities', group: 'Documents', file: true },
    { key: 'it_return_attachment', label: 'Financial Statements OR IT Return for Last Three Years', group: 'Documents', file: true },
    { key: 'client_details', label: 'Please Attach List of Clients', group: 'Documents', file: true },
    { key: 'cancel_cheque_attachment', label: 'Cancelled Cheque', group: 'Documents', file: true },
    { key: 'company_registration_attachment', label: 'Company Registration', group: 'Documents', file: true },
    { key: 'authorization_letter_attachment', label: 'Authorization Letter', group: 'Documents', file: true },
    { key: 'cin_number_attachment', label: 'CIN Number Attachment', group: 'Documents', file: true },
  ];

  // ---- Table columns are FIXED. Everything else is in the popup. ----
  // CHANGED: name column 240 -> 340, taaki Renew tag name ke saath hi rahe
  readonly tableCols: { key: ColKey; width: number; center?: boolean }[] = [
    { key: 'name', width: 340 },
    { key: 'mobile_no', width: 180 },
    { key: 'site_name', width: 220 },
    { key: 'status', width: 340, center: true },
  ];

  // 48 = checkbox column ki width
  readonly tableWidth = this.tableCols.reduce((sum, c) => sum + c.width, 48);

  colLabel(key: ColKey): string {
    return this.cols.find((c) => c.key === key)?.label ?? key;
  }

  // ---- Filter + search ----
  filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const st = this.statusFilter();
    return this.vendors().filter((v) => {
      if (st !== 'All' && (v.status ?? '').toLowerCase() !== st.toLowerCase()) return false;
      if (!q) return true;
      return Object.values(v).some((x) => String(x ?? '').toLowerCase().includes(q));
    });
  });

  // ---- Pagination ----
  readonly pageSizes = [10, 25, 50, 100];
  pageSize = signal(50);
  page = signal(1);

  total = computed(() => this.filtered().length);
  totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));
  currentPage = computed(() => Math.min(this.page(), this.totalPages()));

  paged = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize();
    return this.filtered().slice(start, start + this.pageSize());
  });

  rangeFrom = computed(() => (this.total() ? (this.currentPage() - 1) * this.pageSize() + 1 : 0));
  rangeTo = computed(() => Math.min(this.currentPage() * this.pageSize(), this.total()));

  setPage(n: number): void {
    const next = Math.min(Math.max(1, n), this.totalPages());

    // CHANGED: page badalne par selection clear, taaki purane page ke vendors select na rahein
    if (next !== this.currentPage()) this.clearSelection();

    this.page.set(next);
  }

  goTo(value: string): void {
    const n = parseInt(value, 10);
    if (Number.isNaN(n)) return;
    this.setPage(n);
  }

  setPageSize(event: Event): void {
    this.pageSize.set(Number((event.target as HTMLSelectElement).value));
    this.page.set(1);
    this.clearSelection(); // CHANGED
  }

  // =========================================================
  // SELECTION + RENEW SEND
  // CHANGED: sab kuch sirf CURRENT PAGE (paged) ke records par chalta hai.
  // Agar vendor already 'Renew' status me hai to uska checkbox disabled hoga
  // aur select nahi hoga (wapas renew karne ka koi matlab nahi).
  // =========================================================
  selected = signal<Set<number>>(new Set());
  renewing = signal(false);

  isRenew(v: Vendor): boolean {
    return String(v.status ?? '').trim().toLowerCase() === 'renew';
  }

  // Sirf non-renew vendors select ho sakte hain
  selectablePaged = computed(() => this.paged().filter((v) => !this.isRenew(v)));

  // Sirf current page ke selectable selected vendors ki ids
  selectedOnPage = computed(() => {
    const sel = this.selected();
    return this.selectablePaged().filter((v) => sel.has(v.id)).map((v) => v.id);
  });

  // Button par count bhi sirf current page ka
  selectedCount = computed(() => this.selectedOnPage().length);

  // header checkbox: sirf current page ki selectable rows par kaam karta hai
  allChecked = computed(() => {
    const list = this.selectablePaged();
    const sel = this.selected();
    return list.length > 0 && list.every((v) => sel.has(v.id));
  });

  someChecked = computed(() => {
    const sel = this.selected();
    const list = this.selectablePaged();
    const n = list.filter((v) => sel.has(v.id)).length;
    return n > 0 && n < list.length;
  });

  isSelected(id: number): boolean {
    return this.selected().has(id);
  }

  clearSelection(): void {
    this.selected.set(new Set());
  }

  toggleOne(v: Vendor, event: Event): void {
    if (this.isRenew(v)) return;
    const checked = (event.target as HTMLInputElement).checked;
    this.selected.update((s) => {
      const next = new Set(s);
      if (checked) next.add(v.id);
      else next.delete(v.id);
      return next;
    });
  }

  toggleAll(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const ids = this.selectablePaged().map((v) => v.id);
    this.selected.update((s) => {
      const next = new Set(s);
      ids.forEach((id) => (checked ? next.add(id) : next.delete(id)));
      return next;
    });
  }

  // Renew Send: Approve / Reject wali hi API (updateVendorStatus) use karta hai
  // CHANGED: sirf current page ke selected vendors ko jata hai
  sendRenew(): void {
    const ids = this.selectedOnPage();
    if (!ids.length || this.renewing()) return;

    this.renewing.set(true);

    const calls = ids.map((id) =>
      this.masterService.updateVendorStatus(id, 'Renew').pipe(
        catchError((err) => {
          console.error('Renew failed for vendor', id, err);
          return of(null); // ek fail ho to baaki chalte rahein
        }),
      ),
    );

    forkJoin(calls).subscribe((results) => {
      // sirf wahi vendors update honge jinka server ne success diya
      const okIds = ids.filter((_, i) => results[i] !== null);

      this.vendors.update((list) =>
        list.map((x) => (okIds.includes(x.id) ? { ...x, status: 'Renew' } : x)),
      );

      // jo fail hue wo selected rehte hain, taaki dobara try kar sako
      this.selected.set(new Set(ids.filter((id) => !okIds.includes(id))));
      this.renewing.set(false);

      if (okIds.length !== ids.length) {
        alert(`${ids.length - okIds.length} vendor(s) could not be updated. Please try again.`);
      }
    });
  }

  // ---- menus / search ----
  toggleMenu(key: Exclude<MenuKey, null>, event: Event): void {
    event.stopPropagation();
    this.openMenu.update((m) => (m === key ? null : key));
  }

  @HostListener('document:click')
  closeMenus(): void {
    this.openMenu.set(null);
  }

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      this.searchInput()?.nativeElement.focus();
    } else if (e.key === 'Escape') {
      this.openMenu.set(null);
      if (this.preview.open) this.closePreview();
      else if (this.detailId() !== null) this.closeDetail();
    }
  }

  setStatus(s: string): void {
    this.statusFilter.set(s);
    this.page.set(1);
    this.clearSelection(); // CHANGED
    this.openMenu.set(null);
  }

  onSearch(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.page.set(1);
    this.clearSelection(); // CHANGED
  }

  clearSearch(): void {
    this.query.set('');
    this.page.set(1);
    this.clearSelection(); // CHANGED
    this.searchInput()?.nativeElement.focus();
  }

  // =========================================================
  // VENDOR DETAILS POPUP (all fields)
  // =========================================================
  detailId = signal<number | null>(null);
  fieldSearch = signal('');
  hideEmpty = signal(false);

  // always reads the latest vendor, so status changes show up in the popup immediately
  detail = computed(() => {
    const id = this.detailId();
    return id === null ? null : (this.vendors().find((x) => x.id === id) ?? null);
  });

  detailGroups = computed(() => {
    const v = this.detail();
    if (!v) return [];

    const q = this.fieldSearch().trim().toLowerCase();
    const hide = this.hideEmpty();
    const groups = new Map<string, DetailField[]>();

    for (const c of this.cols) {
      // name + status are already shown in the popup header
      if (c.key === 'name' || c.key === 'status') continue;

      const raw = v[c.key] == null ? '' : String(v[c.key]);
      const value = c.file ? '' : this.cellValue(v, c.key);

      if (q && !c.label.toLowerCase().includes(q) && !value.toLowerCase().includes(q)) continue;
      if (hide && !raw) continue;

      const list = groups.get(c.group) ?? [];
      list.push({ key: c.key, label: c.label, value, raw, file: !!c.file, wrap: !!c.wrap });
      groups.set(c.group, list);
    }

    return [...groups.entries()].map(([title, items]) => ({ title, items }));
  });

  view(v: Vendor): void {
    this.fieldSearch.set('');
    this.hideEmpty.set(false);
    this.openMenu.set(null);
    this.detailId.set(v.id);
  }

  closeDetail(): void {
    this.detailId.set(null);
    this.closePreview();
  }

  onFieldSearch(event: Event): void {
    this.fieldSearch.set((event.target as HTMLInputElement).value);
  }

  clearFieldSearch(): void {
    this.fieldSearch.set('');
  }

  toggleHideEmpty(): void {
    this.hideEmpty.update((x) => !x);
  }

  // ---- status change (Approve / Reject) ----
  // Pehle server success de, tabhi UI update hota hai
  changeStatus(v: Vendor, status: string): void {
    if (v.status === status) return;

    this.masterService.updateVendorStatus(v.id, status).subscribe({
      next: (res) => {
        this.vendors.update((list) =>
          list.map((x) => (x.id === v.id ? { ...x, status: res.status } : x)),
        );
      },
      error: (err) => {
        console.error('Status update failed:', err);
        alert('Could not update status. Please try again.');
      },
    });
  }

  statusClass(status?: string): string {
    const s = (status ?? '').toLowerCase().replace(/[\s_]+/g, '-');
    return ['pending', 'approved', 'rejected', 'renew'].includes(s) ? s : 'other';
  }

  // ---- display value (popup + excel dono me use hota hai) ----
  // mobile_no_verify: true / 'true' / 1 / '1' / 'yes' => "Verified", 'pending' => "Pending", baaki => "No"
  // createdOn: ISO date => readable date
  cellValue(v: Vendor, key: ColKey): string {
    const raw = v[key];
    if (raw === null || raw === undefined || raw === '') return '';

    if (key === 'mobile_no_verify') {
      const s = String(raw).trim().toLowerCase();

      if (['verified', 'true', '1', 'yes'].includes(s)) {
        return 'Verified';
      }

      if (s === 'pending') {
        return 'Pending';
      }

      return 'No';
    }

    if (key === 'createdOn') {
      const d = new Date(String(raw));
      return Number.isNaN(d.getTime()) ? String(raw) : d.toLocaleDateString('en-IN');
    }

    return String(raw);
  }

  // =========================================================
  // EXPORT TO EXCEL (saari columns, saari filtered rows)
  // Pehle "Save as" dialog khulta hai (Chrome / Edge).
  // Firefox / Safari me ye API nahi hai, wahan normal download hota hai.
  // =========================================================

  exporting = signal(false);

  private exportValue(v: Vendor, c: ColDef): string {
    const raw = v[c.key];
    if (raw === null || raw === undefined || raw === '') return '';
    return c.file ? this.fileBase + encodeURI(String(raw)) : this.cellValue(v, c.key);
  }

  async exportExcel(): Promise<void> {
    if (this.exporting()) return;

    const fileName = `Vendors_${new Date().toISOString().slice(0, 10)}.xlsx`;
    const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    // 1) Pehle user se save location poochho (user click ke turant baad)
    let handle: any = null;
    const picker = (window as any).showSaveFilePicker;

    if (picker) {
      try {
        handle = await picker.call(window, {
          suggestedName: fileName,
          types: [{ description: 'Excel Workbook', accept: { [mime]: ['.xlsx'] } }],
        });
      } catch (err: any) {
        if (err?.name === 'AbortError') return; // user ne cancel kiya
        console.error('Save dialog failed, falling back to normal download:', err);
      }
    }

    // 2) Excel file banao aur save karo
    this.exporting.set(true);

    try {
      const XLSX = await import('xlsx');

      const header = this.cols.map((c) => c.label);
      const rows = this.filtered().map((v) => this.cols.map((c) => this.exportValue(v, c)));

      const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);

      ws['!cols'] = this.cols.map((c, i) => ({
        wch: Math.min(
          60,
          rows.reduce((max, r) => Math.max(max, r[i].length), c.label.length) + 2,
        ),
      }));

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Vendors');

      if (handle) {
        const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const writable = await handle.createWritable();
        await writable.write(new Blob([buffer], { type: mime }));
        await writable.close();
      } else {
        XLSX.writeFile(wb, fileName);
      }
    } catch (err) {
      console.error('Export failed:', err);
      alert('Export failed. Please try again.');
    } finally {
      this.exporting.set(false);
    }
  }

  // =========================================================
  // FILE PREVIEW (opens from the details popup)
  // =========================================================

  private readonly fileBase = 'http://localhost:5001/uploads/';

  private sourceFor(v: Vendor, key: ColKey): { url: string; name: string; isPdf: boolean } | null {
    const p = (v[key] as string) ?? '';
    if (!p) return null;
    const name = p.split('/').pop() ?? '';
    return { url: this.fileBase + encodeURI(p), name, isPdf: name.toLowerCase().endsWith('.pdf') };
  }

  preview: {
    open: boolean;
    title: string;
    url: string;
    safeUrl: SafeResourceUrl | null;
    name: string;
    isPdf: boolean;
    failed: boolean;
    loading: boolean;
    x: number;
    y: number;
  } = { open: false, title: '', url: '', safeUrl: null, name: '', isPdf: false, failed: false, loading: false, x: 0, y: 0 };

  private previewReq = 0;
  private dragging = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;

  // File ko blob bana ke dikhate hain (vendor-list jaisa).
  // Seedha URL iframe me dalne par backend ka X-Frame-Options PDF ko block kar deta hai.
  openPreview(v: Vendor, key: ColKey): void {
    const src = this.sourceFor(v, key);
    if (!src) return;

    const req = ++this.previewReq;
    const wasOpen = this.preview.open;
    const width = Math.min(760, window.innerWidth * 0.92);
    const x = wasOpen ? this.preview.x : Math.max(0, (window.innerWidth - width) / 2);
    const y = wasOpen ? this.preview.y : Math.max(20, window.innerHeight * 0.12);

    this.revokePreviewUrl();

    this.preview = {
      open: true,
      title: `${this.colLabel(key)} - ${v.name}`,
      url: '',
      safeUrl: null,
      name: src.name,
      isPdf: src.isPdf,
      failed: false,
      loading: true,
      x,
      y,
    };
    this.cdr.markForCheck();

    this.http.get(src.url, { responseType: 'blob', withCredentials: true }).subscribe({
      next: (blob) => {
        if (req !== this.previewReq || !this.preview.open) return;

        const ext = src.name.split('.').pop()?.toLowerCase() ?? '';
        const isPdf = blob.type === 'application/pdf' || ext === 'pdf';

        const finalBlob =
          isPdf && blob.type !== 'application/pdf' ? new Blob([blob], { type: 'application/pdf' }) : blob;

        const blobUrl = URL.createObjectURL(finalBlob);

        this.preview = {
          ...this.preview,
          url: blobUrl,
          safeUrl: isPdf ? this.sanitizer.bypassSecurityTrustResourceUrl(blobUrl) : null,
          isPdf,
          loading: false,
        };
        this.cdr.markForCheck();
      },
      error: (err) => {
        if (req !== this.previewReq || !this.preview.open) return;

        console.error('File load failed', src.url, err);

        // url = original link, taaki "Open in a new tab" kaam kare
        this.preview = { ...this.preview, url: src.url, loading: false, failed: true };
        this.cdr.markForCheck();
      },
    });
  }

  closePreview(): void {
    this.previewReq++;
    this.revokePreviewUrl();
    this.preview = { ...this.preview, open: false, url: '', safeUrl: null, loading: false, failed: false };
    this.dragging = false;
  }

  private revokePreviewUrl(): void {
    if (this.preview.url.startsWith('blob:')) {
      URL.revokeObjectURL(this.preview.url);
    }
  }

  ngOnDestroy(): void {
    this.previewReq++;
    this.revokePreviewUrl();
  }

  // drag the preview window by its header
  startDrag(event: PointerEvent): void {
    if ((event.target as HTMLElement).closest('.preview-close')) return;
    this.dragging = true;
    this.dragOffsetX = event.clientX - this.preview.x;
    this.dragOffsetY = event.clientY - this.preview.y;
    event.preventDefault();
  }

  @HostListener('document:pointermove', ['$event'])
  onDragMove(event: PointerEvent): void {
    if (!this.dragging) return;
    const maxX = window.innerWidth - 120;
    const maxY = window.innerHeight - 56;
    this.preview.x = Math.max(0, Math.min(event.clientX - this.dragOffsetX, maxX));
    this.preview.y = Math.max(0, Math.min(event.clientY - this.dragOffsetY, maxY));
  }

  @HostListener('document:pointerup')
  endDrag(): void {
    this.dragging = false;
  }
}