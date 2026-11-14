import { createContext, useContext, useMemo, useRef, type ComponentProps } from "react";
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";
import { toggleVariants } from "@/components/ui/toggle";

const ARROW_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"]);

/** True for the moment between an arrow key and the roving focus it moves. */
const ArrowNavigation = createContext<{ take(): boolean } | null>(null);

/**
 * A segmented control; the tray's look is `.toggle-group` in styles.css. Its items are radios, so
 * an arrow key selects the item it moves to (Radix alone only moves focus).
 */
function ToggleGroup({
  className,
  onKeyDown,
  ...props
}: ComponentProps<typeof ToggleGroupPrimitive.Root>) {
  const arrowing = useRef(false);
  const navigation = useMemo(
    () => ({
      take() {
        const was = arrowing.current;
        arrowing.current = false;
        return was;
      },
    }),
    [],
  );
  return (
    <ArrowNavigation.Provider value={navigation}>
      <ToggleGroupPrimitive.Root
        data-slot="toggle-group"
        className={cn("toggle-group", className)}
        onKeyDown={(e) => {
          onKeyDown?.(e);
          if (!ARROW_KEYS.has(e.key)) return;
          // Radix moves focus in a timeout it queued before this runs; clear after it.
          arrowing.current = true;
          setTimeout(() => (arrowing.current = false));
        }}
        {...props}
      />
    </ArrowNavigation.Provider>
  );
}

function ToggleGroupItem({
  className,
  onFocus,
  ...props
}: ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  const navigation = useContext(ArrowNavigation);
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      onFocus={(e) => {
        onFocus?.(e);
        if (navigation?.take() && e.currentTarget.getAttribute("aria-checked") === "false") {
          e.currentTarget.click();
        }
      }}
      className={cn(toggleVariants(), className)}
      {...props}
    />
  );
}

export { ToggleGroup, ToggleGroupItem };
