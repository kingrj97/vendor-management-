import {
  ChangeDetectorRef,
  Component,
  HostListener,
  OnDestroy,
  OnInit
} from '@angular/core';

import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

import {
  DomSanitizer,
  SafeResourceUrl
} from '@angular/platform-browser';

import { VendorService } from '../../../core/services/vendor.service';

import {
  MasterService,
  SiteItem
} from '../../../core/services/admin.service';


// ============================================================
// VENDOR INTERFACE
// ============================================================

export interface Vendor {

  id: number;
  vendor_code?: string;

  // 1. Vendor Details
  name: string;
  category_id?: number;
  category_name?: string;

  address?: string;
  city?: string;
  pincode?: string;
  state?: string;
  country?: string;

  // 2. Vendor Contact Details
  telephone_no?: string;
  mobile_no?: string;
  email?: string;
  contact_person_name?: string;

  // 3. Business Details
  gst_number?: string;
  gst_business_place?: string;
  gst_certificate_attachment?: string | null;

  pancard?: string;
  pan_card_attachment?: string | null;

  per_account_no?: string;
  permanent_account_no?: string;

  drug_licence?: string;
  drug_licence_attachment?: string | null;

  status_of_vendor?: string;
  name_of_partners?: string;
  permanent_establishment?: string;

  payment_terms?: string;
  payment_condition?: string;

  cin_number?: string;
  cin_number_attachment?: string | null;

  // Preferred Location
  zydus_master_id?: number;
  site_name?: string;

  // 4. Statutory Information
  tds_flag?: string;
  tds_rate?: string;
  classification_of_taxable_service?: string;

  // 5. Enterprise Details
  msmed?: string;
  msmed_small_scale?: string;
  msmed_attachment?: string | null;

  experience_product_attachment?: string | null;
  delivery_through?: string;
  coa_attachment?: string | null;

  experience_with_zydus?: string;
  experience_with_zydus_attachment?: string | null;

  // 6. Financial Status
  turnover_attachment?: string | null;
  assets_attachment?: string | null;
  liabilities_attachment?: string | null;
  it_return_attachment?: string | null;

  // 7. List of Clients
  client_details?: string | null;

  // 8. Bank Details
  bank_name?: string;
  branch_name?: string;
  ac_name?: string;
  ifsc_code?: string;
  ac_no?: string;

  // 9. Required Documents
  cancel_cheque_attachment?: string | null;
  company_registration_attachment?: string | null;
  authorization_letter_attachment?: string | null;

  // 10. System Fields
  vendor_type?: string;
  status?: string; // Pending / Approved / Rejected / Renew
  mobile_no_verify?: string;
  created_at?: string;
}


// ============================================================
// FIELD INTERFACE
// ============================================================

export interface Field {

  key: keyof Vendor;
  label: string;
  type?: 'text' | 'file';
  full?: boolean;

}


export interface Section {

  title: string;
  fields: Field[];

}


// ============================================================
// COMPONENT
// ============================================================

@Component({

  selector: 'app-vendor-list',

  standalone: true,

  imports: [
    CommonModule
  ],

  templateUrl: './vendor-list.html',

  styleUrls: ['./vendor-list.css'],

})


export class VendorListComponent implements OnInit, OnDestroy {

  private readonly fileBase = 'http://localhost:5000/uploads/';


  // ============================================================
  // SECTION DEFINITIONS
  // ============================================================

  private readonly sectionDefs: Section[] = [

    // 1. VENDOR DETAILS
    {
      title: 'Vendor Details',

      fields: [

        { key: 'name', label: 'Vendor Name' },

        { key: 'category_name', label: 'Category' },

        { key: 'address', label: 'Address', full: true },

        { key: 'city', label: 'City' },

        { key: 'pincode', label: 'PIN Code' },

        { key: 'state', label: 'State' },

        { key: 'country', label: 'Country' },

      ],

    },


    // 2. VENDOR CONTACT DETAILS
    {
      title: 'Vendor Contact Details',

      fields: [

        { key: 'telephone_no', label: 'Telephone Number' },

        { key: 'mobile_no', label: 'Mobile Number' },

        { key: 'email', label: 'Email Address' },

        { key: 'contact_person_name', label: 'Contact Person Name' },

      ],

    },


    // 3. BUSINESS DETAILS
    {
      title: 'Business Details',

      fields: [

        { key: 'gst_number', label: 'GST Number' },

        {
          key: 'gst_business_place',
          label: 'GST No. Primary Business Place / Manufacturing Location'
        },

        {
          key: 'gst_certificate_attachment',
          label: 'GST Certificate',
          type: 'file'
        },

        { key: 'pancard', label: 'Pancard' },

        {
          key: 'pan_card_attachment',
          label: 'Pancard Certificate',
          type: 'file'
        },

        {
          key: 'per_account_no',
          label: 'Permanent Account No.'
        },

        {
          key: 'drug_licence',
          label: 'Drug Licence if applicable must mentioned'
        },

        {
          key: 'drug_licence_attachment',
          label: 'Drug Licence',
          type: 'file'
        },

        {
          key: 'status_of_vendor',
          label: 'Status of Vendor [for Income Tax Purpose]'
        },

        {
          key: 'name_of_partners',
          label: 'Name of Partners / Directors / Proprietor'
        },

        {
          key: 'permanent_establishment',
          label: 'Permanent Establishment [PE] in India'
        },

        { key: 'payment_terms', label: 'Payment Terms' },

        { key: 'payment_condition', label: 'Payment Condition' },

        {
          key: 'cin_number',
          label: 'Corporate Identity Number (CIN)'
        },

        {
          key: 'cin_number_attachment',
          label: 'CIN Number Attachment',
          type: 'file'
        },

        { key: 'site_name', label: 'Preferred Location' },

      ],

    },


    // 4. STATUTORY INFORMATION
    {
      title:
        'Statutory Information is required to determine whether the party is liable for TDS or not',

      fields: [

        { key: 'tds_flag', label: 'TDS Flag' },

        { key: 'tds_rate', label: 'TDS Rate' },

        {
          key: 'classification_of_taxable_service',
          label: 'Description / Classification of Taxable Service',
          full: true
        },

      ],

    },


    // 5. ENTERPRISE DETAILS
    {
      title: 'Enterprise Details',

      fields: [

        {
          key: 'msmed',
          label: 'Whether covered under Micro, Small and Medium Enterprise Development Act, 2006 (MSMED)?'
        },

        {
          key: 'msmed_attachment',
          label: 'Please Attach a Valid MSMED Proof',
          type: 'file'
        },

        {
          key: 'experience_product_attachment',
          label: 'Experience for Each Product (Manufacturing & Technical Details / Catalogue)',
          type: 'file',
          full: true
        },

        {
          key: 'delivery_through',
          label: 'Delivery Through'
        },

        {
          key: 'coa_attachment',
          label: 'Certificate of Analysis (COA) if applicable',
          type: 'file'
        },

        {
          key: 'experience_with_zydus',
          label: 'Experience with Zydus Group'
        },

        {
          key: 'experience_with_zydus_attachment',
          label: 'Experience with Zydus Group Certificates',
          type: 'file'
        },

      ],

    },


    // 6. FINANCIAL STATUS
    {
      title: 'Financial Status',

      fields: [

        {
          key: 'turnover_attachment',
          label: 'Turnover of the Enterprise (for last three years)',
          type: 'file'
        },

        {
          key: 'assets_attachment',
          label: 'Assets Details',
          type: 'file'
        },

        {
          key: 'liabilities_attachment',
          label: 'Liabilities',
          type: 'file'
        },

        {
          key: 'it_return_attachment',
          label: 'Financial Statements OR IT Return for Last Three Years',
          type: 'file'
        },

      ],

    },


    // 7. LIST OF CLIENTS
    {
      title:
        'List of Clients along with Contact Persons Name, Telephone No, Address, E-mail Address & Fax No.',

      fields: [

        {
          key: 'client_details',
          label: 'Please Attach List of Clients',
          type: 'file',
          full: true
        },

      ],

    },


    // 8. BANK DETAILS
    {
      title: 'Bank Details',

      fields: [

        { key: 'bank_name', label: 'Bank Name' },

        { key: 'branch_name', label: 'Branch Name' },

        { key: 'ac_name', label: 'A/c. Name' },

        { key: 'ifsc_code', label: 'IFSC Code' },

        { key: 'ac_no', label: 'A/c. No.' },

      ],

    },


    // 9. REQUIRED DOCUMENTS
    {
      title:
        'Mentioned Below Documents Copy must be requiring (Only File Type)',

      fields: [

        {
          key: 'cancel_cheque_attachment',
          label: 'Cancelled Cheque',
          type: 'file'
        },

        {
          key: 'company_registration_attachment',
          label: 'Company Registration',
          type: 'file'
        },

        {
          key: 'authorization_letter_attachment',
          label: 'Authorization Letter',
          type: 'file'
        },

      ],

    },

  ];


  // ============================================================
  // VENDOR AND SITE DATA
  // ============================================================

  vendors: Vendor[] = [];

  sites: SiteItem[] = [];

  loading = false;

  private sectionCache = new Map<number, Section[]>();


  // ============================================================
  // DEFAULT SORTING
  // ============================================================

  private readonly sortKey: keyof Vendor = 'name';

  private readonly sortAsc = true;


  // ============================================================
  // FILE PREVIEW WINDOW
  // ============================================================

  preview: {

    open: boolean;

    title: string;

    kind: 'pdf' | 'image' | 'other';

    url: string;

    safeUrl: SafeResourceUrl | null;

    loading: boolean;

    error: string;

    x: number;

    y: number;

  } = {

      open: false,

      title: '',

      kind: 'other',

      url: '',

      safeUrl: null,

      loading: false,

      error: '',

      x: 0,

      y: 0,

    };


  private previewReq = 0;

  private dragging = false;

  private dragOffsetX = 0;

  private dragOffsetY = 0;


  // ============================================================
  // CONSTRUCTOR
  // ============================================================

  constructor(

    private router: Router,

    private vendorService: VendorService,

    private sanitizer: DomSanitizer,

    private http: HttpClient,

    private cdr: ChangeDetectorRef,

    private masterService: MasterService


  ) { }


  // ============================================================
  // LIFECYCLE
  // ============================================================

  ngOnInit(): void {

    this.loadSites();

    this.loadVendors();

  }


  // ============================================================
  // LOAD EXTERNAL ZYDUS SITES
  // ============================================================

  loadSites(): void {

    this.masterService.getSites().subscribe({

      next: (sites) => {

        this.sites = sites ?? [];

        this.vendors.forEach(v => {

          v.site_name = this.getSiteName(v.zydus_master_id);

        });

        this.buildSections();

        this.cdr.markForCheck();

      },

      error: (err) => {

        console.error('Site load failed:', err);

        this.sites = [];

        this.cdr.markForCheck();

      }

    });

  }


  // ============================================================
  // FIND SITE NAME
  // ============================================================

  getSiteName(siteId?: number): string {

    if (siteId === undefined || siteId === null) {

      return '';

    }

    const site = this.sites.find(

      s => Number(s.site_id) === Number(siteId)

    );

    return site?.site_name ?? '';

  }


  // ============================================================
  // LOAD VENDORS
  // ============================================================

  loadVendors(): void {

    this.loading = true;

    this.vendorService.getMyVendors().subscribe({

      next: (res) => {

        this.vendors = res.data ?? [];

        this.vendors.forEach(v => {

          v.site_name = this.getSiteName(v.zydus_master_id);

        });

        this.buildSections();

        this.loading = false;

        this.cdr.markForCheck();

      },

      error: (err) => {

        console.error('Vendor load failed', err);

        this.vendors = [];

        this.buildSections();

        this.loading = false;

        this.cdr.markForCheck();

      },

    });

  }


  // ============================================================
  // BUILD SECTIONS
  // HIDE EMPTY FIELDS AND EMPTY SECTIONS
  // ============================================================

  private buildSections(): void {

    this.sectionCache.clear();

    for (const v of this.vendors) {

      const sections = this.sectionDefs

        .map(section => ({

          title: section.title,

          fields: section.fields.filter(field =>

            this.hasValue(v, field.key)

          ),

        }))

        .filter(section => section.fields.length > 0);

      this.sectionCache.set(v.id, sections);

    }

  }


  sectionsOf(v: Vendor): Section[] {

    return this.sectionCache.get(v.id) ?? [];

  }


  // ============================================================
  // FIELD HELPERS
  // ============================================================

  text(v: Vendor, key: keyof Vendor): string {

    const val = v[key];

    return val === null || val === undefined || val === ''

      ? '—'

      : String(val);

  }


  hasValue(v: Vendor, key: keyof Vendor): boolean {

    const val = v[key];

    return val !== null &&

      val !== undefined &&

      val !== '';

  }


  // ============================================================
  // FILE HELPERS
  // ============================================================

  fileUrl(v: Vendor, key: keyof Vendor): string {

    const p = v[key];

    return p

      ? this.fileBase + encodeURI(String(p))

      : '';

  }


  fileName(v: Vendor, key: keyof Vendor): string {

    const p = v[key];

    return p

      ? (String(p).split('/').pop() ?? '')

      : '';

  }


  // ============================================================
  // OPEN FILE PREVIEW
  // ============================================================
  openPreview(ev: Event, v: Vendor, f: Field): void {

    ev.preventDefault();

    const url = this.fileUrl(v, f.key);

    if (!url) return;

    const req = ++this.previewReq;

    const wasOpen = this.preview.open;

    this.clearPreviewUrl();

    const width = Math.min(560, window.innerWidth * 0.94);

    this.preview = {
      open: true,
      title: `${v.name} - ${f.label}`,
      kind: 'other',
      url: '',
      safeUrl: null,
      loading: true,
      error: '',
      x: wasOpen ? this.preview.x : Math.max(0, (window.innerWidth - width) / 2),
      y: wasOpen ? this.preview.y : Math.max(20, window.innerHeight * 0.12)
    };

    this.cdr.markForCheck();

    this.http.get(url, { responseType: 'blob', withCredentials: true }).subscribe({

      next: (blob) => {

        if (req !== this.previewReq || !this.preview.open) return;

        const ext = url.split('?')[0].split('.').pop()?.toLowerCase() ?? '';

        const type = blob.type || '';

        const kind: 'pdf' | 'image' | 'other' =
          type === 'application/pdf' || ext === 'pdf'
            ? 'pdf'
            : type.startsWith('image/') ||
              ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)
              ? 'image'
              : 'other';

        const finalBlob =
          kind === 'pdf' && type !== 'application/pdf'
            ? new Blob([blob], { type: 'application/pdf' })
            : blob;

        const blobUrl = URL.createObjectURL(finalBlob);

        this.preview.kind = kind;
        this.preview.url = blobUrl;
        this.preview.safeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(blobUrl);
        this.preview.loading = false;

        this.cdr.markForCheck();
      },

      error: (err) => {

        if (req !== this.previewReq || !this.preview.open) return;

        console.error('File load failed', url, err);

        this.preview.error =
          err.status === 404
            ? 'File server par nahi mili (404).'
            : err.status === 0
              ? 'File load nahi ho payi (server band hai ya CORS block).'
              : `File load nahi ho payi (${err.status}).`;

        this.preview.loading = false;

        this.cdr.markForCheck();
      }

    });
  }

  // ============================================================
  // CLOSE PREVIEW
  // ============================================================

  closePreview(): void {

    this.previewReq++;

    this.clearPreviewUrl();

    this.preview.open = false;

    this.preview.url = '';

    this.preview.safeUrl = null;

    this.preview.loading = false;

    this.preview.error = '';

    this.dragging = false;

    this.cdr.markForCheck();

  }


  private clearPreviewUrl(): void {

    if (this.preview.url.startsWith('blob:')) {

      URL.revokeObjectURL(this.preview.url);

    }

  }


  // ============================================================
  // DRAG PREVIEW WINDOW
  // ============================================================

  startDrag(event: PointerEvent): void {

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

    this.preview.x = Math.max(

      0,

      Math.min(event.clientX - this.dragOffsetX, maxX)

    );

    this.preview.y = Math.max(

      0,

      Math.min(event.clientY - this.dragOffsetY, maxY)

    );

  }


  @HostListener('document:pointerup')

  @HostListener('document:pointercancel')

  endDrag(): void {

    this.dragging = false;

  }


  // ============================================================
  // ESCAPE KEY
  // ============================================================

  @HostListener('document:keydown.escape')

  onEscape(): void {

    if (this.preview.open) {

      this.closePreview();

    }

  }


  // ============================================================
  // DESTROY
  // ============================================================

  ngOnDestroy(): void {

    this.previewReq++;

    this.clearPreviewUrl();

  }


  // ============================================================
  // SORTING
  // ============================================================

  get sortedVendors(): Vendor[] {

    const dir = this.sortAsc ? 1 : -1;

    const k = this.sortKey;

    return [...this.vendors].sort(

      (a, b) =>

        String(a[k] ?? '').localeCompare(

          String(b[k] ?? ''),

          undefined,

          {

            sensitivity: 'base',

            numeric: true

          }

        ) * dir

    );

  }


  // ============================================================
  // TRACK BY
  // ============================================================

  trackById(_: number, v: Vendor): number {

    return v.id;

  }


  trackByTitle(_: number, s: Section): string {

    return s.title;

  }


  trackByKey(_: number, f: Field): string {

    return f.key as string;

  }


  // ============================================================
  // STATUS HELPERS
  // ============================================================

  private normalizedStatus(v: Vendor): string {

    return String(v.status ?? '')

      .trim()

      .toLowerCase();

  }


  // ============================================================
  // UPDATE CONDITION
  // Sirf Pending vendor update kar sakta hai
  // Approved / Rejected / Renew -> Update button nahi
  // ============================================================

  canUpdate(v: Vendor): boolean {

    return this.normalizedStatus(v) === 'pending';

  }


  // ============================================================
  // RENEW CONDITION
  // Sirf Renew status wale vendor ko Renew button dikhta hai
  // (purchaser ne Renew Send kiya ho)
  // ============================================================

  canRenew(v: Vendor): boolean {

    return this.normalizedStatus(v) === 'renew';

  }


  // ============================================================
  // UPDATE / RENEW ACTION
  // ============================================================

  onVendorAction(v: Vendor): void {

    if (this.canRenew(v)) {

      this.renew(v);

      return;

    }

    if (this.canUpdate(v)) {

      this.update(v);

    }

  }


  // ============================================================
  // UPDATE VENDOR
  // ============================================================

  update(v: Vendor): void {

    if (!this.canUpdate(v)) return;

    this.router.navigate(

      ['/vendor-portal/vendor-register'],

      {

        queryParams: {

          id: v.id,

          mode: 'update'

        }

      }

    );

  }


  // ============================================================
  // RENEW VENDOR
  // ============================================================

  renew(v: Vendor): void {

    if (!this.canRenew(v)) return;

    this.router.navigate(

      ['/vendor-portal/vendor-register'],

      {

        queryParams: {

          id: v.id,

          mode: 'renew'

        }

      }

    );

  }


  // ============================================================
  // STATUS CSS CLASS
  // Pending / Approved / Rejected / Renew
  // ============================================================

  getStatusClass(status?: string): string {

    switch (String(status ?? '').trim().toLowerCase()) {

      case 'approved':

        return 'status-approved';

      case 'rejected':

        return 'status-rejected';

      case 'pending':

        return 'status-pending';

      case 'renew':

        return 'status-renew';

      default:

        return '';

    }

  }

}