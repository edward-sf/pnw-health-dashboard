import { Info } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./button";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

type Props = {
  /** The button's accessible name, such as "About this measure". */
  label: string;
  children: ReactNode;
  className?: string;
};

/** The one way to put an explanation behind an ⓘ: a ghost icon button that opens a popover. */
export function InfoTip({ label, children, className }: Props) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className={className} aria-label={label}>
          <Info aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="info-tip-content w-[min(20rem,calc(100vw-2rem))] text-sm">
        {children}
      </PopoverContent>
    </Popover>
  );
}
