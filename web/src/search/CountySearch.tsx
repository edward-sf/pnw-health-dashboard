import { Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Command, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { County } from "../types";
import { matchCounties } from "./matchCounties";

type Props = {
  counties: County[];
  onSelect: (fips: string, opener: HTMLElement) => void;
  /** A stable id for the input, so a skip link can point at it. Defaults to a generated one. */
  inputId?: string;
};

export function CountySearch({ counties, onSelect, inputId }: Props) {
  const id = useId();
  const inputDomId = inputId ?? `${id}-input`;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState("");
  const [activeId, setActiveId] = useState<string>();
  const [listId, setListId] = useState<string>();
  const listRef = useRef<HTMLDivElement>(null);

  const options = useMemo(() => matchCounties(counties, text), [counties, text]);
  const expanded = open && options.length > 0;
  const noMatches = open && text.trim() !== "" && options.length === 0;

  // cmdk owns the highlight and the list id; the input points at them (cmdk's own input can't take our id).
  useEffect(() => {
    setListId(listRef.current?.id || undefined);
    const el = listRef.current?.querySelector('[cmdk-item][aria-selected="true"]');
    setActiveId(expanded ? (el?.id ?? undefined) : undefined);
  }, [expanded, highlighted, options]);

  const choose = (county: County) => {
    if (inputRef.current) onSelect(county.fips, inputRef.current);
    setText("");
    setOpen(false);
  };

  return (
    // cmdk does the highlighting and Enter; matchCounties does the filtering.
    <Command
      shouldFilter={false}
      loop
      label="Matching counties"
      value={highlighted}
      onValueChange={setHighlighted}
      className="county-search overflow-visible bg-transparent">
      <Popover open={expanded || noMatches} onOpenChange={setOpen} modal={false}>
        <PopoverAnchor asChild>
          <div ref={wrapperRef} className="relative">
            <label htmlFor={inputDomId} className="visually-hidden">
              Search counties
            </label>
            <Search className="county-search-icon" aria-hidden="true" />
            <Input
              ref={inputRef}
              id={inputDomId}
              className="pl-9"
              type="text"
              role="combobox"
              placeholder="Search counties"
              autoComplete="off"
              aria-expanded={expanded}
              aria-controls={expanded ? listId : undefined}
              aria-autocomplete="list"
              aria-activedescendant={activeId}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setOpen(true);
              }}
              onBlur={() => setOpen(false)}
              onKeyDown={(e) => {
                if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !open && options.length > 0) {
                  e.preventDefault();
                  setOpen(true);
                }
              }}
            />
          </div>
        </PopoverAnchor>
        <PopoverContent
          className={cn("w-(--radix-popover-trigger-width) p-1", noMatches && "px-3 py-2")}
          // Focus stays in the input while the list is open.
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => {
            if (wrapperRef.current?.contains(e.target as Node)) e.preventDefault();
          }}
        >
          {noMatches ? (
            <p aria-hidden="true" className="m-0 text-sm text-muted-foreground">
              No matching counties
            </p>
          ) : (
            // Keeps the input focused through a click on an option.
            <CommandList ref={listRef} aria-label="Matching counties" onMouseDown={(e) => e.preventDefault()}>
              {options.map((c) => (
                <CommandItem key={c.fips} value={c.fips} onSelect={() => choose(c)}>
                  {`${c.name}, ${c.state}`}
                </CommandItem>
              ))}
            </CommandList>
          )}
        </PopoverContent>
      </Popover>
      <p role="status" className="county-search-status">
        {noMatches ? "No matching counties" : ""}
      </p>
    </Command>
  );
}
