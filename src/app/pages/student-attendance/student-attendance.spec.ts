import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StudentAttendance } from './student-attendance';

describe('StudentAttendance', () => {
  let component: StudentAttendance;
  let fixture: ComponentFixture<StudentAttendance>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StudentAttendance]
    })
    .compileComponents();

    fixture = TestBed.createComponent(StudentAttendance);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
