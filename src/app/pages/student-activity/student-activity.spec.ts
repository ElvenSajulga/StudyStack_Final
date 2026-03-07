import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StudentActivity } from './student-activity';

describe('StudentActivity', () => {
  let component: StudentActivity;
  let fixture: ComponentFixture<StudentActivity>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StudentActivity]
    })
    .compileComponents();

    fixture = TestBed.createComponent(StudentActivity);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
