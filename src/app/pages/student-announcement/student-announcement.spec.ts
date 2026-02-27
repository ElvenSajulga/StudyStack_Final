import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StudentAnnouncement } from './student-announcement';

describe('StudentAnnouncement', () => {
  let component: StudentAnnouncement;
  let fixture: ComponentFixture<StudentAnnouncement>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StudentAnnouncement]
    })
    .compileComponents();

    fixture = TestBed.createComponent(StudentAnnouncement);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
