import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ThemeChoice } from "./theme";
import { useTheme } from "./ThemeProvider";

const OPTIONS = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
] as const satisfies readonly { value: ThemeChoice; label: string; Icon: typeof Sun }[];

const isChoice = (v: string): v is ThemeChoice => OPTIONS.some((o) => o.value === v);

/** The header's theme switch. Its icon shows the current choice; the name stays "Theme". */
export function ThemeMenu() {
  const { choice, setChoice } = useTheme();
  const { Icon } = OPTIONS.find((o) => o.value === choice) ?? OPTIONS[2];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="theme-menu" aria-label="Theme">
          <Icon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={choice} onValueChange={(v) => isChoice(v) && setChoice(v)}>
          {OPTIONS.map(({ value, label, Icon: ItemIcon }) => (
            <DropdownMenuRadioItem key={value} value={value} className="theme-menu-item">
              <ItemIcon aria-hidden="true" className="text-muted-foreground" />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
