import { ComponentFixture, TestBed } from '@angular/core/testing';
import { VendorLogin } from './vendor-login';

describe('VendorLogin', () => {
  let component: VendorLogin;
  let fixture: ComponentFixture<VendorLogin>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VendorLogin],
    }).compileComponents();

    fixture = TestBed.createComponent(VendorLogin);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
