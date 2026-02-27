import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StudentGrade } from './student-grade';

describe('StudentGrade', () => {
  let component: StudentGrade;
  let fixture: ComponentFixture<StudentGrade>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StudentGrade]
    })
    .compileComponents();

    fixture = TestBed.createComponent(StudentGrade);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
