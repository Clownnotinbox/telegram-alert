export type Subscriber = {
  sequence: number;
  id: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  joinedAt: string;
  source: string;
};

export type OverlayStyle = "graphite" | "paper" | "mono" | "anime";

export type OverlayCommunity = {
  title: string;
  url: string | null;
};

export type OverlaySettings = {
  style: OverlayStyle;
  version: number;
  updatedAt: string;
};

export const DEMO_SUBSCRIBER: Subscriber = {
  sequence: 0,
  id: "demo",
  name: "Анна Смирнова",
  username: "anna_live",
  avatarUrl: null,
  joinedAt: new Date().toISOString(),
  source: "telegram",
};
