import { Component, Input, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface CSVImportRow {
  rowNumber: number;
  data: Record<string, string>;
  isValid: boolean;
  errors: string[];
}

export interface CSVImportConfig {
  templateFileName: string;
  templateHeaders: string[];
  requiredFields: string[];
  entityType: 'student' | 'teacher';
}

@Component({
  selector: 'app-csv-import-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './csv-import-modal.html',
  styleUrl: './csv-import-modal.scss',
})
export class CSVImportModal {
  @Input() isOpen = false;
  @Input() config!: CSVImportConfig;
  @Output() close = new EventEmitter<void>();
  @Output() import = new EventEmitter<CSVImportRow[]>();

  parsedRows: CSVImportRow[] = [];
  fileLoaded = false;
  importing = false;

  constructor(private readonly cdr: ChangeDetectorRef) {}

  closeModal(): void {
    this.close.emit();
    this.resetModal();
  }

  downloadTemplate(): void {
    const csvContent = [
      this.config.templateHeaders.join(','),
      this.config.templateHeaders.map(() => '').join(','),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', this.config.templateFileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e: ProgressEvent<FileReader>) => {
      const content = e.target?.result as string;
      this.parseCSV(content);
      this.fileLoaded = true;
      this.cdr.detectChanges();
    };
    reader.readAsText(file);
  }

  private parseCSV(content: string): void {
    const lines = content.trim().split('\n');
    if (lines.length < 2) {
      this.parsedRows = [];
      return;
    }

    const headers = this.parseCSVLine(lines[0]);
    this.parsedRows = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values = this.parseCSVLine(line);
      const rowData: Record<string, string> = {};

      headers.forEach((header, idx) => {
        rowData[header.toLowerCase().trim()] = values[idx]?.trim() || '';
      });

      const errors = this.validateRow(rowData, i);
      this.parsedRows.push({
        rowNumber: i,
        data: rowData,
        isValid: errors.length === 0,
        errors,
      });
    }
  }

  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let insideQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        insideQuotes = !insideQuotes;
      } else if (char === ',' && !insideQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    result.push(current);
    return result;
  }

  private validateRow(data: Record<string, string>, rowNumber: number): string[] {
    const errors: string[] = [];

    // Check required fields
    for (const field of this.config.requiredFields) {
      if (!data[field.toLowerCase()] || data[field.toLowerCase()].trim() === '') {
        errors.push(`Missing required field: ${field}`);
      }
    }

    // Check for duplicates
    const currentId = data['studentid'] || data['teacherid'] || '';
    const isDuplicate = this.parsedRows.some(
      r => (r.data['studentid'] || r.data['teacherid']) === currentId && r.rowNumber !== rowNumber
    );
    if (isDuplicate) {
      errors.push('Duplicate ID found in import');
    }

    return errors;
  }

  get validRowCount(): number {
    return this.parsedRows.filter(r => r.isValid).length;
  }

  get invalidRowCount(): number {
    return this.parsedRows.filter(r => !r.isValid).length;
  }

  get invalidRows(): CSVImportRow[] {
    return this.parsedRows.filter(r => !r.isValid);
  }

  canImport(): boolean {
    return this.validRowCount > 0 && !this.importing;
  }

  importData(): void {
    if (!this.canImport()) return;

    this.importing = true;
    const validRows = this.parsedRows.filter(r => r.isValid);
    this.import.emit(validRows);

    setTimeout(() => {
      this.importing = false;
      this.closeModal();
    }, 500);
  }

  private resetModal(): void {
    this.parsedRows = [];
    this.fileLoaded = false;
    this.importing = false;
  }

  getColumnValue(row: CSVImportRow, column: string): string {
    return row.data[column.toLowerCase()] || '—';
  }
}
