export interface SavedCalendarEvent {
  date: string;
  occasion: string;
}

/** One A4 portrait page per month vs photo + grid on two A4 landscape pages */
export type PdfLayoutMode = 'portrait-single' | 'landscape-spread';

/** Where the day number sits inside each day cell in the PDF grid */
export type DateNumberPosition = 'top-left' | 'top-center' | 'center';

export interface SavedCalendarFull {
  id: string;
  name: string;
  year: number;
  startMonth: number;
  weekStart: 'monday' | 'sunday';
  yearFont: string;
  monthFont: string;
  weekDaysFont: string;
  datesFont: string;
  datesFontSize: string;
  dateNumberPosition?: DateNumberPosition;
  archiveFolder: string;
  archiveReplaceAll: boolean;
  layoutMode: PdfLayoutMode;
  events: SavedCalendarEvent[];
  updatedAt: string;
  createdAt: string;
}

export interface SavedCalendarSummary {
  id: string;
  name: string;
  year: number;
  startMonth: number;
  updatedAt: string;
  createdAt: string;
}
