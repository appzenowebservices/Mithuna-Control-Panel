import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { agentsApi } from "../api/agents";
import { queryKeys } from "../lib/queryKeys";
import { Sparkles, MapPin, Clock, Loader2 } from "lucide-react";

export function PersonaGenerator({ agentId, companyId }: { agentId: string; companyId?: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [birthDateTime, setBirthDateTime] = useState(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  });
  const [latitude, setLatitude] = useState("28.6139");
  const [longitude, setLongitude] = useState("77.2090");
  const [placeName, setPlaceName] = useState("New Delhi");
  const [coordinateSystem, setCoordinateSystem] = useState<"SIDEREAL" | "TROPICAL">("SIDEREAL");
  const [useNow, setUseNow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useMutation({
    mutationFn: async () => {
      setError(null);
      const payload: Record<string, unknown> = {
        placeName: placeName.trim() || undefined,
        coordinateSystem,
        filePath: "SOUL.template.md",
      };
      if (useNow) {
        payload.useNow = true;
        // useNow may still send lat/lng if user edited
        if (latitude.trim()) payload.latitude = Number(latitude);
        if (longitude.trim()) payload.longitude = Number(longitude);
      } else {
        if (!birthDateTime) throw new Error("Pick a birth date/time");
        payload.birthDateTime = new Date(birthDateTime).toISOString();
        payload.latitude = Number(latitude);
        payload.longitude = Number(longitude);
      }
      return agentsApi.generatePersona(agentId, payload as never, companyId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.instructionsBundle(agentId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.detail(agentId) });
      setOpen(false);
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
  });

  const handleUseNow = () => {
    const now = new Date();
    const iso = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setBirthDateTime(iso);
    setUseNow(true);
    // Try geolocation for place
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLatitude(pos.coords.latitude.toFixed(4));
          setLongitude(pos.coords.longitude.toFixed(4));
          setPlaceName("Current location");
        },
        () => {},
      );
    }
  };

  if (!open) {
    return (
      <div className="rounded-xl border border-dashed border-violet-300/50 bg-violet-50/50 dark:bg-violet-950/20 p-3 space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-violet-700 dark:text-violet-300">
          <Sparkles className="h-3.5 w-3.5" /> Persona
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          No persona yet. Generate a soul template from a natal chart via the Astrologics MCP — it creates <span className="font-mono">SOUL.template.md</span> with <span className="font-mono">{"{{ASTROLOGY_CHART}}"}</span>.
        </p>
        <div className="flex gap-2">
          <Button type="button" size="sm" className="flex-1 h-7 text-xs" onClick={() => setOpen(true)}>
            <Sparkles className="h-3 w-3 mr-1" /> Generate
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="flex-1 h-7 text-xs"
            onClick={() => {
              setUseNow(true);
              setOpen(true);
              handleUseNow();
            }}
          >
            <Clock className="h-3 w-3 mr-1" /> Use Now
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-violet-300/60 bg-card p-3 space-y-3 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-bold text-violet-700 dark:text-violet-300">
          <Sparkles className="h-3.5 w-3.5" /> Generate Persona
        </div>
        <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setOpen(false)}>
          ✕
        </button>
      </div>

      <div className="grid gap-2">
        <label className="space-y-1">
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" /> Birth date / time (UTC)
          </span>
          <Input type="datetime-local" value={birthDateTime} onChange={(e) => { setBirthDateTime(e.target.value); setUseNow(false); }} disabled={useNow} className="h-8 text-sm" />
        </label>

        <label className="space-y-1">
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1">
            <MapPin className="h-3 w-3" /> Place
          </span>
          <Input value={placeName} onChange={(e) => setPlaceName(e.target.value)} placeholder="New Delhi" className="h-8 text-sm" />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Latitude</span>
            <Input value={latitude} onChange={(e) => { setLatitude(e.target.value); setUseNow(false); }} placeholder="28.6139" className="h-8 text-sm font-mono" />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Longitude</span>
            <Input value={longitude} onChange={(e) => { setLongitude(e.target.value); setUseNow(false); }} placeholder="77.2090" className="h-8 text-sm font-mono" />
          </label>
        </div>

        <label className="space-y-1">
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">System</span>
          <select
            value={coordinateSystem}
            onChange={(e) => setCoordinateSystem(e.target.value as "SIDEREAL" | "TROPICAL")}
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="SIDEREAL">Sidereal (Lahiri) — default</option>
            <option value="TROPICAL">Tropical</option>
          </select>
        </label>

        <div className="flex items-center gap-2 pt-1">
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <input type="checkbox" checked={useNow} onChange={(e) => setUseNow(e.target.checked)} className="rounded" />
            Use present moment
          </label>
          {useNow && <span className="text-[10px] text-muted-foreground">(birth time = now, place as above)</span>}
        </div>

        {error && <div className="text-xs text-destructive bg-destructive/10 rounded p-2">{error}</div>}

        <div className="flex gap-2 pt-1">
          <Button
            type="button"
            size="sm"
            className="flex-1"
            disabled={generate.isPending}
            onClick={() => generate.mutate()}
          >
            {generate.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
            Generate via Astrologics MCP
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={generate.isPending}>
            Cancel
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          Creates <span className="font-mono">SOUL.template.md</span> with your birth data and the <span className="font-mono">{"{{ASTROLOGY_CHART}}"}</span> placeholder. Hermes expands it at boot from the stored 52-axis vectors. The raw birth data is also saved on the agent for regeneration.
        </p>
      </div>
    </div>
  );
}
