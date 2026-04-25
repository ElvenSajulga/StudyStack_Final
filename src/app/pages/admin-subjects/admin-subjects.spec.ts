import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AdminSubjects } from './admin-subjects';

describe('AdminSubjects', () => {
  let component: AdminSubjects;
  let fixture: ComponentFixture<AdminSubjects>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminSubjects]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AdminSubjects);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
