import { api } from "./client";

export type ChannelEntry = {
  id: string;
  name: string;
  type?: string;
  guild?: string;
  thread_id?: string | null;
  [key: string]: unknown;
};

export type ChannelsPlatform = {
  name: string;
  label: string;
  emoji: string;
  source: "builtin" | "plugin";
  enabled: boolean | null;
  channelCount: number;
  status: "connected" | "disabled" | "not_configured" | "unknown";
  channels: ChannelEntry[];
};

export type ChannelsResponse = {
  companyId: string;
  updatedAt: string | null;
  totalPlatforms: number;
  totalChannels: number;
  connectedPlatforms: number;
  aliasCount: number;
  platforms: ChannelsPlatform[];
  directory: { updatedAt: string | null; platforms: Record<string, ChannelEntry[]> };
};

export const channelsApi = {
  list: (companyId: string) =>
    api.get<ChannelsResponse>(`/companies/${companyId}/channels`),
  getPlatform: (companyId: string, platform: string) =>
    api.get<{ companyId: string; platform: string; meta: ChannelsPlatform | null; updatedAt: string | null; channels: ChannelEntry[] }>(
      `/companies/${companyId}/channels/${encodeURIComponent(platform)}`,
    ),
};
