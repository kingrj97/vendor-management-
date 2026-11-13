import { ComponentFixture, TestBed } from '@angular/core/testing';
import { VendorPortal } from './vendor-portal';

describe('VendorPortal', () => {
  let component: VendorPortal;
  let fixture: ComponentFixture<VendorPortal>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VendorPortal],
    }).compileComponents();

    fixture = TestBed.createComponent(VendorPortal);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
