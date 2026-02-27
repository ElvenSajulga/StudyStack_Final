import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TeacherSettings } from './teacher-settings';

describe('TeacherSettings', () => {
  let component: TeacherSettings;
  let fixture: ComponentFixture<TeacherSettings>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TeacherSettings]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TeacherSettings);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
