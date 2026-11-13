import { ComponentFixture, TestBed } from '@angular/core/testing';
import { VendorRegistration } from './vendor-registration';

describe('VendorRegistration', () => {
  let component: VendorRegistration;
  let fixture: ComponentFixture<VendorRegistration>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VendorRegistration],
    }).compileComponents();

    fixture = TestBed.createComponent(VendorRegistration);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
