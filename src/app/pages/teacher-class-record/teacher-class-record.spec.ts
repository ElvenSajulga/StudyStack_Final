import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TeacherClassRecord } from './teacher-class-record';

describe('TeacherClassRecord', () => {
  let component: TeacherClassRecord;
  let fixture: ComponentFixture<TeacherClassRecord>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TeacherClassRecord]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TeacherClassRecord);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
