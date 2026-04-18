export interface SavedCalendarEvent {
  date: string;
  occasion: string;
}

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
  archiveFolder: string;
  archiveReplaceAll: boolean;
  archiveCoverFrom13: boolean;
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
