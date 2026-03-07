import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TeacherAttendance } from './teacher-attendance';

describe('TeacherAttendance', () => {
  let component: TeacherAttendance;
  let fixture: ComponentFixture<TeacherAttendance>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TeacherAttendance]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TeacherAttendance);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
