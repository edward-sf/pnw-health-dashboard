import { Check, ChevronsUpDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Indicator } from "../types";
import { GROUPS, groupOf, type MeasureGroup, measuresIn } from "./categories";

type Props = { indicators: Indicator[]; selectedId: string; onSelect: (id: string) => void };

/** The category switch and the dropdown of that category's measures. */
export function MeasurePicker({ indicators, selectedId, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const selected = indicators.find((x) => x.id === selectedId);
  const label = selected?.label ?? selectedId;
  const group = groupOf(selected?.category ?? "");
  const sections = measuresIn(indicators, group);

  // The measure last viewed in each category this session, so switching back returns to it.
  const lastViewed = useRef<Partial<Record<MeasureGroup, string>>>({});
  useEffect(() => {
    if (selected) lastViewed.current[groupOf(selected.category)] = selected.id;
  }, [selected]);

  const switchGroup = (next: string) => {
    // A single ToggleGroup reports "" when its checked item is pressed again; keep the category.
    const target = GROUPS.find((g) => g.id === next);
    if (!target || target.id === group) return;
    setFilter("");
    const id = lastViewed.current[target.id] ?? measuresIn(indicators, target.id)[0]?.items[0]?.id;
    if (id) onSelect(id);
  };

  // However the popover closes (a choice, Escape, a click outside), it reopens unfiltered.
  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setFilter("");
  };

  const choose = (id: string) => {
    onOpenChange(false);
    onSelect(id);
  };

  return (
    <div className="measure-picker">
      <ToggleGroup
        type="single"
        className="measure-category"
        aria-label="Measure category"
        value={group}
        onValueChange={switchGroup}
      >
        {GROUPS.map((g) => (
          <ToggleGroupItem key={g.id} value={g.id}>
            {g.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="measure-trigger justify-between"
            aria-label={`Measure: ${label}`}
          >
            <span className="measure-trigger-label">{label}</span>
            <ChevronsUpDown aria-hidden="true" className="text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(22rem,calc(100vw-2rem))] p-0" aria-label="Measures">
          <Command label="Filter measures" defaultValue={selected?.label}>
            <CommandInput value={filter} onValueChange={setFilter} />
            <CommandList>
              <CommandEmpty>No measures match</CommandEmpty>
              {sections.map((s) => (
                <CommandGroup key={s.heading} heading={s.heading}>
                  {s.items.map((ind) => (
                    <CommandItem key={ind.id} value={ind.label} onSelect={() => choose(ind.id)}>
                      <span className="flex-1">{ind.label}</span>
                      {ind.id === selectedId && <Check aria-hidden="true" />}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
