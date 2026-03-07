import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StudentSettings } from './student-settings';

describe('StudentSettings', () => {
  let component: StudentSettings;
  let fixture: ComponentFixture<StudentSettings>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StudentSettings]
    })
    .compileComponents();

    fixture = TestBed.createComponent(StudentSettings);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
