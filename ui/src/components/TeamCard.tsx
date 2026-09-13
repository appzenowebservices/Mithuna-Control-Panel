import { useState } from "react";
import { Edit3, Trash2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Team } from "@paperclipai/shared";

interface TeamCardProps {
  team: Team;
  onDelete: () => void;
  onUpdate: (updates: Partial<Omit<Team, "id">>) => void;
}

export function TeamCard({ team, onDelete, onUpdate }: TeamCardProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(team.name);
  const [description, setDescription] = useState(team.description ?? "");

  const handleSave = () => {
    onUpdate({ name, description: description || null });
    setEditing(false);
  };

  return (
    <div className="border border-border rounded-lg p-3">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          {editing ? (
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="text-sm font-medium w-full px-1 py-0.5 border rounded"
              autoFocus
            />
          ) : (
            <h3 className="text-sm font-medium text-foreground">{team.name}</h3>
          )}
          {editing ? (
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="text-xs text-muted-foreground w-full px-1 py-0.5 border rounded resize-none mt-1"
              rows={2}
              placeholder="Description"
            />
          ) : (
            team.description && (
              <p className="text-xs text-muted-foreground mt-1">{team.description}</p>
            )
          )}
        </div>
        <div className="flex gap-1">
          {editing ? (
            <button
              onClick={handleSave}
              className="text-xs text-primary hover:text-primary/80"
            >
              Save
            </button>
          ) : null}
          <button
            onClick={() => setEditing(!editing)}
            className="text-muted-foreground hover:text-foreground"
          >
            <Edit3 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
        <Users className="h-3 w-3" />
        <span>Team</span>
        {team.color && (
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: team.color }}
          />
        )}
      </div>
    </div>
  );
}