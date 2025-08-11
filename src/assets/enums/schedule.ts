// Enum cho status của schedule và interface cho config style
export enum ScheduleStatus {
  TODAY = 'today',
  ONGOING = 'ongoing',
  UPCOMING = 'upcoming',
  COMPLETED = 'completed',
  SCHEDULED = 'scheduled',
}

export interface StatusConfig {
  text: string;
  className: string;
  iconColor: string;
  cardBorder: string;
  leftBorder: string;
}
