import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AdminSections } from './admin-sections';

describe('AdminSections', () => {
  let component: AdminSections;
  let fixture: ComponentFixture<AdminSections>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminSections]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AdminSections);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
