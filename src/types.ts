export type Status = 'Saved' | 'Applied' | 'Interviewing' | 'Offer' | 'Rejected';

export const STATUSES: Status[] = ['Saved', 'Applied', 'Interviewing', 'Offer', 'Rejected'];

export interface Job {
  url: string;
  label: string;
  status: Status;
  applied?: string;
  followUp?: string;
  note?: string;
  contact?: string;
  resume?: string;
  salary?: string;
  priority?: boolean;
  archived?: boolean;
}
