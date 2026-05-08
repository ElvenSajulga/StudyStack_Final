import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

interface FAQ {
  question: string;
  answer: string;
  expanded?: boolean;
}

@Component({
  selector: 'app-help-center',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './help-center.html',
  styleUrl: './help-center.scss',
})
export class HelpCenter {
  faqs: FAQ[] = [
    {
      question: 'How do I submit an activity?',
      answer:
        'Navigate to the Activities page, find the activity you need to submit, and click on it to view the details. Follow the submission instructions provided by your teacher. You can submit until the deadline passes.',
      expanded: false,
    },
    {
      question: 'How can I check my grades?',
      answer:
        'Go to the "My Grades" page to view all your submitted activities and their scores. When a teacher releases scores, you will receive a notification. Your grade details will be available immediately after the teacher publishes them.',
      expanded: false,
    },
    {
      question: 'Where can I see announcements from my teachers?',
      answer:
        'Visit the Announcements page to see all messages posted by your enrolled teachers. Announcements are organized by course and sorted by the most recent first. New announcements will have a notification badge.',
      expanded: false,
    },
    {
      question: 'How do I update my profile information?',
      answer:
        'Click on your name in the sidebar and select Profile. You can view your personal details, email, and other information registered with your account. Contact your admin if you need to make changes to core information like your ID.',
      expanded: false,
    },
    {
      question: 'I missed the deadline for an activity. What should I do?',
      answer:
        'Once the deadline has passed, you will not be able to submit the activity through the platform. Please contact your teacher directly to discuss options or arrangements. Your teacher may allow late submissions at their discretion.',
      expanded: false,
    },
    {
      question: 'How do I reset my password?',
      answer:
        'Visit the Settings page and look for the password change option. Enter your current password and your new password. If you forget your password, contact the administrator for assistance.',
      expanded: false,
    },
  ];

  toggleFAQ(index: number): void {
    this.faqs[index].expanded = !this.faqs[index].expanded;
  }
}
