import type { ComponentProps } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

function NativeSelect({ className, ...props }: ComponentProps<"select">) {
  return (
    <div className="relative w-full max-w-full" data-slot="native-select-wrapper">
      <select
        data-slot="native-select"
        className={cn(
          "h-9 w-full min-w-0 cursor-pointer appearance-none rounded-md border border-input bg-card py-1 pr-9 pl-3 text-base text-foreground disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        {...props}
      />
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
    </div>
  );
}

export { NativeSelect };
