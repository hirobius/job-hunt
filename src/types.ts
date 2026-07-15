export type Status = 'Saved' | 'Applied' | 'Interviewing' | 'Offer' | 'Rejected';

export const STATUSES: Status[] = ['Saved', 'Applied', 'Interviewing', 'Offer', 'Rejected'];

/** A single per-role checklist item. */
export interface Todo {
  id: string;
  text: string;
  done: boolean;
}

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
  company?: string;
  location?: string;
  seniority?: string;
  priority?: boolean;
  archived?: boolean;
  todos?: Todo[]; // per-role checklist (additive; old records read as [])
  notes?: string; // per-role free-form notes (additive; old records read as '')
}
