import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TeacherActivity } from './teacher-activity';

describe('TeacherActivity', () => {
  let component: TeacherActivity;
  let fixture: ComponentFixture<TeacherActivity>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TeacherActivity]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TeacherActivity);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
