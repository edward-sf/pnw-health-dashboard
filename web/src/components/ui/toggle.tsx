import { cva } from "class-variance-authority";

// Focus is the site's one global :focus-visible outline, so no variant sets its own ring.
const toggleVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // One option of a segmented control; data-state="on" marks the chosen one.
        segment:
          "text-muted-foreground hover:text-foreground data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-[0_0_0_1px_var(--color-input)]",
      },
      size: {
        sm: "h-8 px-3",
      },
    },
    defaultVariants: { variant: "segment", size: "sm" },
  },
);

export { toggleVariants };
