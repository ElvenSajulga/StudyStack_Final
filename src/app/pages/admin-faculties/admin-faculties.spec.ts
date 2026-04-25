import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AdminFaculties } from './admin-faculties';

describe('AdminFaculties', () => {
  let component: AdminFaculties;
  let fixture: ComponentFixture<AdminFaculties>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminFaculties]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AdminFaculties);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
