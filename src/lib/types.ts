export type RunStatus =
  | "idle"
  | "running"
  | "paused"
  | "stopped"
  | "challenge"
  | "done"
  | "error";

export type DraftStatus =
  | "draft"
  | "approved"
  | "skipped"
  | "sending"
  | "sent"
  | "failed";

export type Settings = {
  cityId: string;
  minFollowers: number;
  maxFollowers: number;
  hourlyCap: number;
  dailyCap: number;
  minDelayMs: number;
  maxDelayMs: number;
  mockMode: boolean;
  sendEnabled: boolean;
  sendDailyCap: number;
  researchProfileDir: string;
  outreachProfileDir: string;
  priceFile: string;
};

export type Shop = {
  zone: string;
  name: string;
  address: string;
};

export type Zone = {
  name: string;
  locationUrl: string;
};

export type CityBundle = {
  id: string;
  name: string;
  country: string;
  competitor: string;
  zones: Zone[];
  hashtags: string[];
  watches: string[];
  shops: Shop[];
};

export type ScoreBreakdown = {
  content: number;
  location: number;
  engagement: number;
  authenticity: number;
  frequency: number;
  penalty: number;
};

export type ProfileCard = {
  id: number;
  username: string;
  fullName: string;
  zone: string | null;
  followers: number;
  following: number;
  engagementRate: number;
  score: number;
  reason: string;
  source: string;
  profileUrl: string;
  cityId: string;
  sample: boolean;
  hasDraft: boolean;
  draftId: number | null;
  breakdown: ScoreBreakdown;
};

export type DraftCard = {
  id: number;
  profileId: number;
  username: string;
  fullName: string;
  zone: string | null;
  cityId: string;
  body: string;
  status: DraftStatus;
  shopName: string;
  error: string | null;
  profileUrl: string;
};

export type PriceRow = {
  item: string;
  libertario: string;
  competitor: string;
  notes: string;
};

export type FormatStat = {
  type: string;
  label: string;
  count: number;
  avgEngagement: number;
};

export type StudyPost = {
  shortcode: string;
  caption: string;
  likes: number;
  comments: number;
  mediaType: string;
  engagement: number;
  url: string;
};

export type HandleCount = {
  username: string;
  posts: number;
};

export type CompetitorAccount = {
  displayName: string;
  followers: number;
  following: number;
  posts: number;
  bio: string;
  address: string;
  highlights: string[];
  url: string;
};

export type CompetitorStudy = {
  username: string;
  cityId: string;
  studiedAt: string;
  mock: boolean;
  summary: string;
  cadence: string;
  tone: string;
  audience: string;
  formats: FormatStat[];
  topPosts: StudyPost[];
  collaborators: HandleCount[];
  commenters: HandleCount[];
  account: CompetitorAccount | null;
};

export type RunView = {
  status: RunStatus;
  message: string;
  cityId: string | null;
  mode: "mock" | "live" | null;
  seen: number;
  kept: number;
};

export type PanelState = {
  settings: Settings;
  cities: CityBundle[];
  run: RunView;
  profiles: ProfileCard[];
  drafts: DraftCard[];
  study: CompetitorStudy | null;
  prices: PriceRow[];
  pricesNote: string;
  pricesError: string | null;
  sendsToday: number;
  nextSendAt: string | null;
};
