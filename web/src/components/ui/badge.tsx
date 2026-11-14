import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

function Badge({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      data-slot="badge"
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border border-input bg-card px-2.5 py-0.5 text-sm font-medium whitespace-nowrap text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export { Badge };
