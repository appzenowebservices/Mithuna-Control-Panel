export interface WorkspaceFinalizeStatus {
  adapterType: string;
  executionTargetKind: string;
}

export interface WorkspaceFinalizeResult {
  succeeded: boolean;
  executionWorkspaceId: string | null;
}