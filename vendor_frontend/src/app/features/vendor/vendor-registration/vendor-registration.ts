import {
  Component,
  ChangeDetectorRef,
  OnInit,
  HostListener
} from '@angular/core';

import { CommonModule } from '@angular/common';
import { FormsModule, NgForm, NgModel } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import {
  DomSanitizer,
  SafeResourceUrl
} from '@angular/platform-browser';

import { Observable } from 'rxjs';

import { VendorService } from '../../../core/services/vendor.service';

import {
  MasterService,
  MasterItem,
  MasterKey
} from '../../../core/services/admin.service';

import { NumbersOnlyDirective } from '../../../shared/directives/digits';

import { CommonMasterDialog } from '../../../shared/components/common-master-dialog/common-master-dialog';


// ===================== MASTER STATE =====================

interface MasterState {
  items: MasterItem[];
  search: string;
  loading: boolean;
  error: string;
}

const emptyMaster = (): MasterState => ({
  items: [],
  search: '',
  loading: false,
  error: ''
});


@Component({
  selector: 'app-vendor-registration',
  standalone: true,

  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    NumbersOnlyDirective,
    CommonMasterDialog
  ],

  templateUrl: './vendor-registration.html',
  styleUrl: './vendor-registration.css'
})


export class VendorRegistration implements OnInit {

  constructor(
    private vendorService: VendorService,
    private masterService: MasterService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    private sanitizer: DomSanitizer
  ) { }


  // ===================== RENEW MODE =====================

  isRenew = false;
  isUpdate = false;

  vendorId: number | null = null;


  // ===================== ADMIN =====================

  isAdmin = false;


  // ===================== CATEGORY / SITE MASTER =====================

  masters: Record<MasterKey, MasterState> = {
    category: emptyMaster(),
    site: emptyMaster()
  };


  // ===================== MASTER MANAGE DIALOG =====================

  masterDialog: {
    open: boolean;
    key: MasterKey | null;
    title: string;
  } = {
      open: false,
      key: null,
      title: ''
    };


  private readonly masterModelKey: Record<MasterKey, string> = {
    category: 'category_id',
    site: 'zydus_master_id'
  };


  // ===================== FILE VARIABLES =====================

  existingFiles: { [key: string]: string } = {};

  private readonly fileBase = 'http://localhost:5000/uploads/';

  openDropdown: string | null = null;

  fileTouched: { [key: string]: boolean } = {};

  gstFileTouched = false;
  panFileTouched = false;
  drugFileTouched = false;
  msmedFileTouched = false;
  zydusFileTouched = false;
  cancelChequeTouched = false;
  companyRegistrationTouched = false;


  // ===================== VENDOR FORM DATA =====================

  vendor: any = {

    name: '',

    category_id: null,
    zydus_master_id: null,

    address: '',


    city: '',
    pincode: '',
    state: '',
    country: '',

    telephone_no: '',
    mobile_no: '',
    email: '',
    contact_person_name: '',

    gst_number: '',
    gst_business_place: '',

    pancard: '',
    permanent_account_no: '',
    per_account_no: '',

    drug_licence: '',
    status_of_vendor: '',
    name_of_partners: '',
    permanent_establishment: '',

    payment_terms: '',
    payment_condition: '',
    cin_number: '',

    tds_flag: '',
    tds_rate: '',
    classification_of_taxable_service: '',

    msmed: '',
    msmed_small_scale: '',
    delivery_through: '',
    experience_with_zydus: '',

    bank_name: '',
    branch_name: '',
    ac_name: '',
    ac_no: '',
    confirm_ac_no: '',
    ifsc_code: ''

  };


  // ===================== FILE DATA =====================

  files: { [key: string]: File | null } = {};

  fileErrors: { [key: string]: string } = {};

  serverErrors: { [key: string]: string } = {};


  message = '';

  formProgress = 0;

  isSubmitting = false;


  // PDF limit: 5 MB.
  readonly maxFileSize = 5 * 1024 * 1024;

  private readonly allowedExtensions = [
    'pdf',
    'jpg',
    'jpeg',
    'png'
  ];


  // ===================== FILE FIELDS =====================

  readonly fileFields = [

    'gst_certificate_attachment',
    'pancard_certificate_attachment',
    'pan_card_attachment',
    'drug_licence_attachment',
    'msmed_attachment',

    'experience_product_attachment',
    'coa_attachment',
    'experience_with_zydus_attachment',

    'turnover_attachment',
    'assets_attachment',
    'liabilities_attachment',
    'it_return_attachment',

    'client_details',

    'cancel_cheque_attachment',
    'company_registration_attachment',
    'authorization_letter_attachment',
    'cin_number_attachment'

  ];


  // ===================== BACKEND FIELD MAPPING =====================

  private readonly fieldMapping: { [key: string]: string } = {

    per_account_no: 'permanent_account_no',
    pan_number: 'permanent_account_no',
    account_number: 'ac_no',

    category: 'category_id',
    preferred_location: 'zydus_master_id',
    site_id: 'zydus_master_id'

  };


  // ===================== FILE LABELS =====================

  private readonly fieldLabels: { [key: string]: string } = {

    gst_certificate_attachment: 'GST Certificate',
    pan_card_attachment: 'Pancard Certificate',
    drug_licence_attachment: 'Drug Licence',
    msmed_attachment: 'MSMED Proof',

    experience_product_attachment: 'Experience for Each Product',
    coa_attachment: 'Certificate of Analysis',
    experience_with_zydus_attachment: 'Zydus Certificates',

    turnover_attachment: 'Turnover',
    assets_attachment: 'Assets Details',
    liabilities_attachment: 'Liabilities',
    it_return_attachment: 'Financial Statements / IT Return',

    client_details: 'List of Clients',

    cancel_cheque_attachment: 'Cancelled Cheque',
    company_registration_attachment: 'Company Registration',
    authorization_letter_attachment: 'Authorization Letter',
    cin_number_attachment: 'CIN Certificate'

  };


  // ===================== PREVIEW WINDOW =====================

  preview: {
    open: boolean;
    title: string;
    url: string;
    safeUrl: SafeResourceUrl | null;
    name: string;
    isPdf: boolean;
    failed: boolean;
    x: number;
    y: number;

  } = {

      open: false,
      title: '',
      url: '',
      safeUrl: null,
      name: '',
      isPdf: false,
      failed: false,
      x: 0,
      y: 0

    };


  hover = {
    show: false,
    url: '',
    name: '',
    isPdf: false,
    x: 0,
    y: 0
  };


  // ===================== WINDOW DRAG =====================

  private dragging = false;

  private dragOffsetX = 0;

  private dragOffsetY = 0;

  private localUrls = new WeakMap<File, string>();


  // =========================================================
  // INITIALIZATION
  // =========================================================

  ngOnInit(): void {

    this.isAdmin = this.detectAdmin();

    const mode = this.route.snapshot.queryParamMap.get('mode');

    const id = Number(
      this.route.snapshot.queryParamMap.get('id')
    );

    this.isRenew = mode === 'renew';
    this.isUpdate = mode === 'update';

    // Registration mode
    if (!this.isRenew && !this.isUpdate) {
      this.openMaster('category');
      this.openMaster('site');
      return;
    }

    // Update / Renew ke liye valid ID required
    if (!id || !Number.isInteger(id) || id <= 0) {
      this.message = 'Invalid vendor ID.';
      return;
    }

    this.vendorId = id;

    this.openMaster('category');
    this.openMaster('site');

    // Existing vendor details load
    this.vendorService.getVendorById(id).subscribe({

      next: (res: any) => {

        const v = res?.data ?? res;

        const status = String(v?.status ?? '').trim().toLowerCase();

        // Status Renew hai -> Update ki jagah Renew mode
        if (status === 'renew') {
          this.isRenew = true;
          this.isUpdate = false;
        }

        // Update sirf Pending vendor ke liye
        if (this.isUpdate && status !== 'pending') {

          this.message = 'Is vendor ka status ab edit nahi ho sakta.';

          this.cdr.detectChanges();

          setTimeout(() => {
            this.router.navigate(['/vendor-portal/vendor-list']);
          }, 1500);

          return;
        }

        for (const key of Object.keys(this.vendor)) {
          if (v[key] !== null && v[key] !== undefined) {
            this.vendor[key] = v[key];
          }
        }

        this.vendor.category_id =
          v.category_id != null ? Number(v.category_id) : null;

        this.vendor.zydus_master_id =
          v.zydus_master_id != null ? Number(v.zydus_master_id) : null;

        this.vendor.permanent_account_no =
          v.per_account_no ??
          v.permanent_account_no ??
          '';

        this.vendor.msmed_small_scale = v.msmed ?? '';

        this.vendor.confirm_ac_no = v.ac_no ?? '';

        for (const field of this.fileFields) {
          if (v[field]) {
            this.existingFiles[field] = v[field];
          }
        }

        this.cdr.detectChanges();
      },

      error: (err: any) => {

        console.error('Vendor load failed:', err);

        this.message = 'Vendor details load nahi ho payi.';

        this.cdr.detectChanges();
      }

    });

  }


  // =========================================================
  // ADMIN CHECK
  // =========================================================

  private detectAdmin(): boolean {

    try {

      const storedUser = localStorage.getItem('user');

      if (!storedUser) {
        return false;
      }

      const user = JSON.parse(storedUser);

      return (
        Number(user?.is_admin) === 1 ||
        Number(user?.data?.is_admin) === 1 ||
        Number(user?.user?.is_admin) === 1
      );

    } catch (error) {

      console.error('Admin check error:', error);

      return false;

    }

  }


  // =========================================================
  // MASTER RESPONSE NORMALIZATION
  // =========================================================

  private normalizeMasterItems(
    key: MasterKey,
    response: any
  ): MasterItem[] {

    const records = Array.isArray(response)
      ? response
      : Array.isArray(response?.data)
        ? response.data
        : [];


    return records
      .map((item: any) => {

        let id: number;

        let name: string;


        if (key === 'category') {

          id = Number(
            item.category_id ??
            item.id
          );

          name = String(
            item.name ??
            item.category_name ??
            ''
          );

        } else {

          id = Number(
            item.zydus_master_id ??
            item.site_id ??
            item.id
          );

          name = String(
            item.site_name ??
            item.name ??
            ''
          );

        }


        return {
          id,
          name
        };

      })
      .filter(
        (item: MasterItem) =>
          Number.isInteger(item.id) &&
          item.id > 0 &&
          !!item.name.trim()
      );

  }


  // =========================================================
  // CATEGORY / SITE DROPDOWNS
  // =========================================================

  openMaster(key: MasterKey): void {

    const s = this.masters[key];

    s.error = '';

    s.loading = true;


    this.masterService.getAll(key).subscribe({

      next: (response: any) => {

        s.items = this.normalizeMasterItems(
          key,
          response
        );

        s.loading = false;

        this.cdr.detectChanges();

      },


      error: (err: any) => {

        console.error(`${key} list load failed:`, err);

        s.loading = false;

        s.error = 'Could not load the list. Close and open it again.';

        this.cdr.detectChanges();

      }

    });

  }


  // =========================================================
  // FILTER MASTER ITEMS
  // =========================================================

  filteredMaster(key: MasterKey): MasterItem[] {

    const s = this.masters[key];

    const q = s.search.trim().toLowerCase();

    return q
      ? s.items.filter(item =>
        item.name.toLowerCase().includes(q)
      )
      : s.items;

  }


  // =========================================================
  // GET MASTER STATE
  // =========================================================

  getMasterState(key: MasterKey): MasterState {
    return this.masters[key];
  }


  // =========================================================
  // GET SELECTED CATEGORY / SITE NAME
  // =========================================================

  getMasterName(
    key: MasterKey,
    selectedId: number | string | null
  ): string {

    if (
      selectedId === null ||
      selectedId === undefined ||
      selectedId === ''
    ) {
      return '';
    }

    const id = Number(selectedId);

    if (!Number.isInteger(id) || id <= 0) {
      return '';
    }

    const selectedMaster = this.masters[key].items.find(
      (item: MasterItem) => Number(item.id) === id
    );

    return selectedMaster?.name ?? '';

  }


  // =========================================================
  // SELECT CATEGORY / SITE
  // =========================================================

  selectMaster(
    key: MasterKey,
    itemId: number | string | null,
    ctrl: NgModel,
    dd: HTMLDetailsElement
  ): void {

    const isClear =
      itemId === null ||
      itemId === undefined ||
      itemId === '';

    const id = Number(itemId);

    if (!isClear && (!Number.isInteger(id) || id <= 0)) {
      return;
    }


    ctrl.control.setValue(isClear ? null : id);

    ctrl.control.markAsTouched();

    ctrl.control.markAsDirty();

    dd.open = false;


    const s = this.masters[key];

    s.search = '';

    s.error = '';

    this.cdr.detectChanges();

  }


  // =========================================================
  // MASTER MANAGE DIALOG (ADMIN ONLY)
  // =========================================================

  openManageDialog(
    key: MasterKey,
    label: string,
    dd: HTMLDetailsElement
  ): void {

    if (!this.isAdmin || key !== 'category') return;

    dd.open = false;

    this.masterDialog = {
      open: true,
      key,
      title: label
    };

  }


  onMasterDialogClosed(items: MasterItem[]): void {

    const key = this.masterDialog.key;

    this.masterDialog = {
      open: false,
      key: null,
      title: ''
    };

    if (!key) return;

    this.masters[key].items = items;

    const model = this.masterModelKey[key];

    const selected = this.vendor[model];

    if (
      selected &&
      !items.some(i => Number(i.id) === Number(selected))
    ) {
      this.vendor[model] = null;
    }

    this.cdr.detectChanges();

  }


  // =========================================================
  // CANCEL RENEW
  // =========================================================

  cancelRenew(): void {

    this.router.navigate([
      '/vendor-portal/vendor-list'
    ]);

  }


  // =========================================================
  // EXISTING FILE HELPERS
  // =========================================================

  fileUrl(field: string): string {

    const p = this.existingFiles[field];

    return p
      ? this.fileBase + encodeURI(p)
      : '';

  }


  fileName(field: string): string {

    const p = this.existingFiles[field];

    return p
      ? (p.split('/').pop() ?? '')
      : '';

  }


  displayName(field: string): string {

    return (
      this.files[field]?.name ||
      this.fileName(field) ||
      'No file chosen'
    );

  }


  openPicker(input: HTMLInputElement): void {
    input.click();
  }


  fileInvalid(
    field: string,
    el: HTMLInputElement
  ): boolean {

    return !!this.fileErrors[field] ||
      (!el?.files?.length && !this.existingFiles[field]);

  }


  // =========================================================
  // FILE PREVIEW
  // =========================================================

  private sourceFor(
    field: string
  ): {
    url: string;
    name: string;
    isPdf: boolean;
  } | null {

    const local = this.files[field];


    if (local) {

      let url = this.localUrls.get(local);

      if (!url) {

        url = URL.createObjectURL(local);

        this.localUrls.set(local, url);

      }

      return {

        url,

        name: local.name,

        isPdf: local.name.toLowerCase().endsWith('.pdf')

      };

    }


    if (this.existingFiles[field]) {

      const name = this.fileName(field);

      return {

        url: this.fileUrl(field),

        name,

        isPdf: name.toLowerCase().endsWith('.pdf')

      };

    }

    return null;

  }


  private pdfBlobUrl: string | null = null;

  async openPreview(field: string): Promise<void> {

    const src = this.sourceFor(field);

    if (!src) return;

    this.hover.show = false;

    this.revokePdfBlob();

    let safeUrl: SafeResourceUrl | null = null;
    let failed = false;

    if (src.isPdf) {

      try {

        let url = src.url;

        // Server wali PDF: pehle download karke blob banao
        if (!url.startsWith('blob:')) {

          // credentials: 'include' -> login cookie (vendor_token) backend tak jaati hai
          const res = await fetch(url, { credentials: 'include' });

          if (!res.ok) throw new Error('HTTP ' + res.status);

          const blob = await res.blob();

          url = URL.createObjectURL(
            new Blob([blob], { type: 'application/pdf' })
          );

          this.pdfBlobUrl = url;
        }

        safeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);

      } catch (error) {

        console.error('PDF preview load failed:', error);

        failed = true;
      }
    }

    const width = Math.min(520, window.innerWidth * 0.92);

    this.preview = {
      open: true,
      title: this.fieldLabels[field] ?? 'Document',
      url: src.url,
      safeUrl,
      name: src.name,
      isPdf: src.isPdf,
      failed,
      x: Math.max(0, (window.innerWidth - width) / 2),
      y: Math.max(20, window.innerHeight * 0.12)
    };

    this.cdr.detectChanges();
  }


  closePreview(): void {

    this.preview.open = false;

    this.dragging = false;

    this.revokePdfBlob();
  }


  private revokePdfBlob(): void {

    if (this.pdfBlobUrl) {

      URL.revokeObjectURL(this.pdfBlobUrl);

      this.pdfBlobUrl = null;
    }
  }


  // =========================================================
  // WINDOW DRAG
  // =========================================================

  startDrag(event: PointerEvent): void {

    if ((event.target as HTMLElement).closest('.preview-close')) {
      return;
    }

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
  endDrag(): void {
    this.dragging = false;
  }


  @HostListener('document:keydown.escape')
  onEscape(): void {

    if (this.preview.open) {
      this.closePreview();
    }

  }


  // =========================================================
  // HOVER THUMBNAIL
  // =========================================================

  showHover(
    field: string,
    event: MouseEvent
  ): void {

    if (this.preview.open) return;

    const src = this.sourceFor(field);

    if (!src) return;

    this.hover = {

      show: true,

      ...src,

      ...this.hoverPosition(event)

    };

  }


  moveHover(event: MouseEvent): void {

    if (this.hover.show) {

      Object.assign(
        this.hover,
        this.hoverPosition(event)
      );

    }

  }


  hideHover(): void {
    this.hover.show = false;
  }


  private hoverPosition(
    event: MouseEvent
  ): {
    x: number;
    y: number;
  } {

    return {

      x: Math.min(event.clientX + 16, window.innerWidth - 240),

      y: Math.min(event.clientY + 16, window.innerHeight - 260)

    };

  }


  // =========================================================
  // FILE VALIDATION
  // =========================================================

  onFileSelected(
    event: Event,
    field: string
  ): void {

    const input = event.target as HTMLInputElement;

    const file = input.files?.[0];

    this.fileErrors[field] = '';

    this.files[field] = null;

    if (!file) {

      this.cdr.detectChanges();

      return;

    }

    const extension =
      file.name.split('.').pop()?.toLowerCase() ?? '';

    if (!this.allowedExtensions.includes(extension)) {

      this.fileErrors[field] =
        'Only PDF, JPG and PNG files are allowed.';

      input.value = '';

      this.cdr.detectChanges();

      return;

    }

    // Har file type ke liye maximum 5 MB.
    if (file.size > this.maxFileSize) {

      this.fileErrors[field] =
        'File size must be 5 MB or less!';

      input.value = '';

      this.cdr.detectChanges();

      return;

    }

    this.files[field] = file;

    this.cdr.detectChanges();

  }


  // =========================================================
  // CLEAR SERVER ERROR
  // =========================================================

  clearServerError(event: Event): void {

    const target = event.target as HTMLInputElement;

    const fieldName = target?.name;

    if (!fieldName) return;

    if (this.serverErrors[fieldName]) {

      delete this.serverErrors[fieldName];

      this.cdr.detectChanges();

    }

    if (this.message) {
      this.message = '';
    }

  }


  // =========================================================
  // SCROLL TO FIELD
  // =========================================================

  private scrollToField(fieldName: string): void {

    setTimeout(() => {

      const element =
        document.querySelector<HTMLElement>(
          `[data-field="${fieldName}"]`
        );

      if (!element) return;

      element.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });

      if (
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLSelectElement
      ) {

        element.focus({
          preventScroll: true
        });

      }

    }, 150);

  }


  private scrollToFirstError(): void {

    setTimeout(() => {

      const target =

        document.querySelector<HTMLElement>(
          '.form-container .invalid-field'
        )

        ??

        Array.from(
          document.querySelectorAll<HTMLElement>(
            '.form-container small.error, .form-container small.validation-error'
          )
        ).find(
          el => !!el.textContent?.trim()
        );

      if (!target) return;

      target.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });

      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {

        target.focus({
          preventScroll: true
        });

      }

    }, 150);

  }


  // =========================================================
  // BACKEND VALIDATION ERRORS
  // =========================================================

  private handleBackendErrors(err: any): void {

    this.serverErrors = {};

    this.message = '';

    const apiErrors = err?.error?.errors;

    if (
      Array.isArray(apiErrors) &&
      apiErrors.length > 0
    ) {

      const unknownMessages: string[] = [];

      for (const apiError of apiErrors) {

        const field = String(
          apiError?.field ??
          apiError?.path ??
          apiError?.key ??
          ''
        );

        const errorMessage = String(
          apiError?.message ??
          apiError?.msg ??
          ''
        );

        if (!field || !errorMessage) continue;

        const frontendField =
          this.fieldMapping[field] || field;

        if (frontendField in this.vendor) {

          if (!this.serverErrors[frontendField]) {
            this.serverErrors[frontendField] = errorMessage;
          }

        } else {

          unknownMessages.push(errorMessage);

        }

      }

      if (unknownMessages.length > 0) {
        this.message = unknownMessages.join(' ');
      }

      this.cdr.detectChanges();

      const firstErrorField =
        Object.keys(this.serverErrors)[0];

      if (firstErrorField) {

        this.scrollToField(firstErrorField);

      } else {

        this.message =
          this.message ||
          err?.error?.message ||
          'Please correct the details.';

        this.cdr.detectChanges();

      }

      return;

    }


    if (
      apiErrors &&
      typeof apiErrors === 'object' &&
      !Array.isArray(apiErrors)
    ) {

      for (const [field, error] of Object.entries(apiErrors)) {

        const frontendField =
          this.fieldMapping[field] || field;

        const errorMessage =
          typeof error === 'string'
            ? error
            : (error as any)?.message || 'Invalid value';

        if (frontendField in this.vendor) {
          this.serverErrors[frontendField] = errorMessage;
        }

      }

      this.cdr.detectChanges();

      const firstErrorField =
        Object.keys(this.serverErrors)[0];

      if (firstErrorField) {

        this.scrollToField(firstErrorField);

        return;

      }

    }


    this.message =
      err?.error?.message ||
      (
        this.isRenew
          ? 'Renew failed. Please try again.'
          : this.isUpdate
            ? 'Update failed. Please try again.'
            : 'Registration failed. Please try again.'
      );

    this.cdr.detectChanges();

  }


  // =========================================================
  // REQUIRED DOCUMENTS
  // =========================================================

  private requiredFiles(): {
    condition: boolean;
    field: string;
  }[] {

    return [

      {
        condition: true,
        field: 'cancel_cheque_attachment'
      },

      {
        condition: true,
        field: 'company_registration_attachment'
      },

      {
        condition: this.vendor.gst_business_place === 'Yes',
        field: 'gst_certificate_attachment'
      },

      {
        condition: this.vendor.pancard === 'Yes',
        field: 'pan_card_attachment'
      },

      {
        condition: this.vendor.drug_licence === 'Yes',
        field: 'drug_licence_attachment'
      },

      {
        condition: this.vendor.msmed_small_scale === 'Yes',
        field: 'msmed_attachment'
      }

    ];

  }


  // =========================================================
  // SUBMIT REGISTER / UPDATE / RENEW
  // =========================================================

  submitForm(form: NgForm): void {

    // INITIAL RESET

    this.message = '';

    this.serverErrors = {};

    if (this.isSubmitting) {
      return;
    }


    // FILE VALIDATION

    const hasFileErrors =
      Object.values(this.fileErrors)
        .some(error => error !== '');

    const missingFile =
      this.requiredFiles().some(
        item =>
          item.condition &&
          !this.files[item.field] &&
          !this.existingFiles[item.field]
      );


    // ACCOUNT NUMBER VALIDATION

    const acMismatch =
      !!this.vendor.ac_no &&
      !!this.vendor.confirm_ac_no &&
      this.vendor.ac_no !== this.vendor.confirm_ac_no;

    if (acMismatch) {

      this.serverErrors['confirm_ac_no'] =
        'Account numbers do not match!';

    }


    // CATEGORY VALIDATION

    const categoryId = Number(this.vendor.category_id);

    if (
      !this.vendor.category_id ||
      !Number.isInteger(categoryId) ||
      categoryId <= 0
    ) {

      this.serverErrors['category_id'] =
        'Please select a valid Category.';

    }


    // PREFERRED LOCATION VALIDATION

    const zydusMasterId = Number(this.vendor.zydus_master_id);

    if (
      !this.vendor.zydus_master_id ||
      !Number.isInteger(zydusMasterId) ||
      zydusMasterId <= 0
    ) {

      this.serverErrors['zydus_master_id'] =
        'Please select a valid Preferred Location.';

    }


    // STOP IF VALIDATION FAILED

    if (
      form.invalid ||
      hasFileErrors ||
      missingFile ||
      acMismatch ||
      !!this.serverErrors['category_id'] ||
      !!this.serverErrors['zydus_master_id']
    ) {

      form.control.markAllAsTouched();

      this.cdr.detectChanges();

      this.scrollToFirstError();

      return;

    }


    // PREPARE VENDOR DATA

    const vendorData: Record<string, any> = {
      ...this.vendor
    };

    vendorData['category_id'] = categoryId;

    vendorData['zydus_master_id'] = zydusMasterId;

    vendorData['per_account_no'] =
      this.vendor.permanent_account_no ||
      this.vendor.per_account_no;

    vendorData['msmed'] =
      this.vendor.msmed_small_scale ||
      this.vendor.msmed;


    // REMOVE FILE FIELDS FROM JSON

    for (const field of this.fileFields) {
      delete vendorData[field];
    }


    // PROTECTED FIELDS: UPDATE + RENEW

    if (this.isUpdate || this.isRenew) {

      delete vendorData['mobile_no'];

      delete vendorData['pancard'];

      delete vendorData['permanent_account_no'];

      delete vendorData['per_account_no'];

    }


    // CREATE FORMDATA

    const formData = new FormData();

    formData.append(
      'vendorData',
      JSON.stringify(vendorData)
    );


    // Attach only newly selected files

    for (const [field, file] of Object.entries(this.files)) {

      if (file) {

        formData.append(
          field,
          file,
          file.name
        );

      }

    }


    // CHECK VENDOR ID FOR UPDATE / RENEW

    if (
      (this.isUpdate || this.isRenew) &&
      (!this.vendorId || this.vendorId <= 0)
    ) {

      this.message = 'Invalid vendor ID.';

      this.cdr.detectChanges();

      return;

    }


    // SELECT API BASED ON MODE

    let request$: Observable<any>;

    if (this.isUpdate) {

      request$ = this.vendorService.updateVendorDetails(
        this.vendorId!,
        formData
      );

    } else if (this.isRenew) {

      request$ = this.vendorService.updateVendor(
        this.vendorId!,
        formData
      );

    } else {

      request$ = this.vendorService.registerVendor(
        formData
      );

    }


    // API SUBMIT

    this.isSubmitting = true;

    request$.subscribe({

      // ==========================================
      // SUCCESS RESPONSE
      // ==========================================

      next: (res: any) => {

        this.isSubmitting = false;

        console.log('Vendor API Response:', res);

        const response = res?.data ?? res;

        // Current operation mode
        const mode: 'register' | 'update' | 'renew' =
          this.isRenew
            ? 'renew'
            : this.isUpdate
              ? 'update'
              : 'register';

        // Mobile number
        const mobile =
          response?.vendor?.mobile_no ??
          response?.mobile_no ??
          this.vendor.mobile_no;

        // Vendor ID
        const currentVendorId =
          response?.vendor?.id ??
          response?.vendor_id ??
          response?.vendorId ??
          response?.id ??
          this.vendorId;

        // OTP sent status
        const otpSent = Boolean(
          response?.otp?.sent ??
          response?.otp_sent ??
          response?.otpSent ??
          false
        );

        console.log('Mode:', mode);
        console.log('Vendor ID:', currentVendorId);
        console.log('Mobile:', mobile);
        console.log('OTP Sent:', otpSent);

        // Validate vendor ID
        if (
          !currentVendorId ||
          !Number.isInteger(Number(currentVendorId)) ||
          Number(currentVendorId) <= 0
        ) {

          console.error('Vendor ID missing:', response);

          this.message =
            'Vendor ID not received from backend.';

          this.cdr.detectChanges();

          return;
        }

        // Validate mobile
        if (!mobile) {

          this.message =
            'Mobile number not received from server.';

          this.cdr.detectChanges();

          return;
        }

        // Save pending OTP information
        const pendingVendor = {
          id: Number(currentVendorId),
          mobile: String(mobile),
          sentAt: Date.now(),
          otpSent,
          mode
        };

        sessionStorage.setItem(
          'pending_vendor',
          JSON.stringify(pendingVendor)
        );

        console.log(
          'Pending Vendor Saved:',
          sessionStorage.getItem('pending_vendor')
        );

        // Navigate to OTP page
        this.router.navigateByUrl('/otp-verification')
          .then(success => {

            console.log('OTP Navigation:', success);

            if (!success) {

              this.message =
                'OTP page navigation failed. Check Angular routes.';

              this.cdr.detectChanges();
            }

          })
          .catch(error => {

            console.error('Navigation error:', error);

            this.message = 'Unable to open OTP verification page.';

            this.cdr.detectChanges();

          });

      },



      // ==========================================
      // ERROR RESPONSE
      // ==========================================

      error: (err: any) => {

        this.isSubmitting = false;

        console.error(
          'Submit error:',
          err
        );

        console.error(
          'Backend validation errors:',
          err?.error?.errors
        );

        this.handleBackendErrors(err);

        this.cdr.detectChanges();

      }

    });

  }



  // =========================================================
  // CLOSE DROPDOWNS ON OUTSIDE CLICK
  // =========================================================

  closeDropdownsOnOutsideClick(
    event: MouseEvent
  ): void {

    const target = event.target as HTMLElement;

    const form = event.currentTarget as HTMLFormElement;

    const label = target.closest('label');

    if (
      label?.querySelector('input.native-file') &&
      !(target instanceof HTMLInputElement)
    ) {

      event.preventDefault();

    }

    form
      .querySelectorAll<HTMLDetailsElement>(
        '.custom-dropdown[open]'
      )
      .forEach(dropdown => {

        if (!dropdown.contains(target)) {
          dropdown.open = false;
        }

      });

  }


  // =========================================================
  // RESET FORM
  // =========================================================

  resetVendorForm(vendorForm: NgForm): void {

    vendorForm.resetForm();

    Object.keys(this.vendor).forEach(key => {
      this.vendor[key] = '';
    });

    this.vendor.category_id = null;

    this.vendor.zydus_master_id = null;

    this.files = {};

    this.fileErrors = {};

    this.serverErrors = {};

    this.fileTouched = {};

    this.gstFileTouched = false;

    this.panFileTouched = false;

    this.drugFileTouched = false;

    this.msmedFileTouched = false;

    this.zydusFileTouched = false;

    this.cancelChequeTouched = false;

    this.companyRegistrationTouched = false;

    this.message = '';

    this.formProgress = 0;

    this.isSubmitting = false;

    this.openDropdown = null;


    (
      Object.keys(this.masters) as MasterKey[]
    ).forEach(key => {

      const s = this.masters[key];

      s.search = '';

      s.error = '';

    });


    this.preview.open = false;

    this.hover.show = false;

    this.masterDialog = {
      open: false,
      key: null,
      title: ''
    };


    document
      .querySelectorAll<HTMLDetailsElement>(
        '.custom-dropdown'
      )
      .forEach(dropdown => {
        dropdown.open = false;
      });


    document
      .querySelectorAll<HTMLInputElement>(
        '.form-container input[type="file"]'
      )
      .forEach(input => {

        input.value = '';

        delete input.dataset['touched'];

      });


    this.cdr.detectChanges();

  }

}