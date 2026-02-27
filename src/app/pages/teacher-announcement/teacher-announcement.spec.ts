import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TeacherAnnouncement } from './teacher-announcement';

describe('TeacherAnnouncement', () => {
  let component: TeacherAnnouncement;
  let fixture: ComponentFixture<TeacherAnnouncement>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TeacherAnnouncement]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TeacherAnnouncement);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
