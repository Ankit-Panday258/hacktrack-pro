export type HackathonStatus = 'saved' | 'registered' | 'participating' | 'submitted' | 'awaiting_results' | 'won' | 'lost';

export type TrackedHackathon = {
  id: string;
  sourceId: string;
  title: string;
  organizer: string;
  url: string;
  deadline: string;
  prize: string;
  status: HackathonStatus;
  projectName: string;
  projectUrl: string;
  resultNotes: string;
  prizeReceived: string;
  certificateUrl: string;
  createdAt: string;
  updatedAt: string;
};

export type TrackerActivity = {
  id: string;
  hackathonId: string;
  title: string;
  message: string;
  createdAt: string;
};

export type TrackerResponse = {
  records: TrackedHackathon[];
  activity: TrackerActivity[];
  error?: string;
};

export const statusLabels: Record<HackathonStatus, string> = {
  saved: 'Planning',
  registered: 'Registered',
  participating: 'Participating',
  submitted: 'Project submitted',
  awaiting_results: 'Awaiting results',
  won: 'Won',
  lost: 'Did not win',
};

export const trackerStatuses = Object.keys(statusLabels) as HackathonStatus[];
