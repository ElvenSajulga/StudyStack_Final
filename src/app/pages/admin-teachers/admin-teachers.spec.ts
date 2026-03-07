import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AdminTeachers } from './admin-teachers';

describe('AdminTeachers', () => {
  let component: AdminTeachers;
  let fixture: ComponentFixture<AdminTeachers>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminTeachers]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AdminTeachers);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
