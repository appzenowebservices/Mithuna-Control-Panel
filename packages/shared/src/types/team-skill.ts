export interface TeamSkillEntry {
  id: string;
  teamId: string;
  companyId: string;
  companySkillId: string;
  versionId: string | null;
  skill: {
    key: string;
    slug: string;
    name: string;
    description: string | null;
    iconUrl: string | null;
    color: string | null;
    sourceType: string;
    categories: string[];
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface TeamSkillAssignRequest {
  desiredSkills: Array<string | { key: string; versionId?: string | null }>;
}
