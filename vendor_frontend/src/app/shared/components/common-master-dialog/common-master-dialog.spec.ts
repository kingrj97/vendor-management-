import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonMasterDialog } from './common-master-dialog';

describe('CommonMasterDialog', () => {
  let component: CommonMasterDialog;
  let fixture: ComponentFixture<CommonMasterDialog>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommonMasterDialog],
    }).compileComponents();

    fixture = TestBed.createComponent(CommonMasterDialog);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
