import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';

// type-only import: runtime me circular dependency nahi banti
// NOTE: path apne project ke hisaab se adjust karo (vendors.ts jahan hai wahan ka path)
import type { Vendor } from '../../features/purchaser/vendors/vendors';

// 'site' sirf list (GET) ke liye
export type MasterKey = 'category' | 'site';

// Category interface
export interface MasterItem {
  id: number;
  name: string;
}

// External Zydus Site API interface
export interface SiteItem {
  id: number;
  site_id: number;
  site_name: string;
  status: boolean;
  site_header: string;
  site_logo: string;
}

// External API response interface
interface SiteApiResponse {
  success: boolean;
  message: string;
  count: number;
  data: SiteItem[];
}

// Vendor status update response
export interface VendorStatusResult {
  id: number;
  status: string;
}

@Injectable({
  providedIn: 'root'
})
export class MasterService {

  private readonly base = 'http://localhost:5001/api/vendors';

  private readonly paths: Record<MasterKey, string> = {
    category: 'categories',
    site: 'sites'
  };

  // Vendor dashboard endpoints
  private readonly dashboardPath = 'dashboard';

  // Admin login HttpOnly cookie (vendor_token) se chalta hai.
  // withCredentials: true ke bina cookie backend tak nahi jaati.
  private readonly opts = { withCredentials: true };

  constructor(private http: HttpClient) { }

  // =========================================================
  // CATEGORY / SITE
  // =========================================================

  // GET CATEGORY
  getCategories(): Observable<MasterItem[]> {
    return this.http.get<any>(
      `${this.base}/${this.paths.category}`
    ).pipe(
      map(response => response.data ?? response)
    );
  }

  // GET EXTERNAL ZYDUS SITES
  getSites(): Observable<SiteItem[]> {
    return this.http.get<SiteApiResponse>(
      `${this.base}/${this.paths.site}`
    ).pipe(
      map(response => response.data ?? [])
    );
  }

  // GET ALL - CATEGORY / SITE
  // Existing components ke liye backward compatibility
  getAll(key: MasterKey): Observable<any[]> {

    // Category list
    if (key === 'category') {
      return this.getCategories();
    }

    // Site list
    // Dropdown ke liye id/name bhi provide honge
    return this.getSites().pipe(
      map(sites =>
        sites.map(site => ({
          ...site,
          api_id: site.id,
          id: site.site_id,
          name: site.site_name
        }))
      )
    );
  }

  // CREATE CATEGORY (ADMIN ONLY)
  create(name: string): Observable<MasterItem> {
    return this.http.post<MasterItem>(
      `${this.base}/${this.paths.category}`,
      { name },
      this.opts
    );
  }

  // UPDATE CATEGORY (ADMIN ONLY)
  update(id: number, name: string): Observable<MasterItem> {
    return this.http.put<MasterItem>(
      `${this.base}/${this.paths.category}/${id}`,
      { name },
      this.opts
    );
  }

  // DELETE CATEGORY (ADMIN ONLY)
  delete(id: number): Observable<any> {
    return this.http.delete(
      `${this.base}/${this.paths.category}/${id}`,
      this.opts
    );
  }

  // =========================================================
  // VENDOR DASHBOARD (ADMIN ONLY)
  // =========================================================

  // GET ALL VENDORS (vendors + category + payment + documents + site_name)
  getVendors(): Observable<Vendor[]> {
    return this.http.get<Vendor[] | { data: Vendor[] }>(
      `${this.base}/${this.dashboardPath}`,
      this.opts
    ).pipe(
      // backend direct array deta hai; agar kabhi { data: [...] } ho to bhi chalega
      map(response => Array.isArray(response) ? response : (response.data ?? []))
    );
  }

  // CHANGE VENDOR STATUS (Approved / Rejected / Pending / In Review)
  updateVendorStatus(id: number, status: string): Observable<VendorStatusResult> {
    return this.http.patch<VendorStatusResult>(
      `${this.base}/${this.dashboardPath}/${id}/status`,
      { status },
      this.opts
    );
  }
}