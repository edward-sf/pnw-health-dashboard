import { useState, type CSSProperties, type ReactNode } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHandle, DrawerTitle } from "@/components/ui/drawer";
import { PHONE_QUERY, useMediaQuery } from "../hooks/useMediaQuery";

const SNAP_POINTS = [0.4, 0.85];

// The Explorer owns focus: a map selection leaves it alone, search and table selections move it to
// the county heading, and closing returns it to the opener. So the dialog never moves focus itself,
// and a press on the map or the toolbar leaves it open.
const keepFocus = (e: Event) => e.preventDefault();
const contentProps = {
  className: "county-panel",
  "aria-describedby": undefined,
  onOpenAutoFocus: keepFocus,
  onCloseAutoFocus: keepFocus,
  onInteractOutside: keepFocus,
};

/**
 * The county panel's frame: a non-modal dialog floating over the map stage from 721px, a
 * non-modal bottom drawer with two snap points on phones. Escape closes either.
 */
export function PanelShell({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [snap, setSnap] = useState<number | string | null>(SNAP_POINTS[0]!);
  const onOpenChange = (open: boolean) => {
    if (!open) onClose();
  };
  const title = <span className="sr-only">County details</span>;

  if (isPhone) {
    const shown = typeof snap === "number" ? snap : SNAP_POINTS[0]!;
    return (
      <Drawer
        open
        modal={false}
        handleOnly
        snapPoints={SNAP_POINTS}
        activeSnapPoint={snap}
        setActiveSnapPoint={setSnap}
        onOpenChange={onOpenChange}
      >
        <DrawerContent
          {...contentProps}
          // The drawer is a full viewport tall and slid down so only the snap point's share shows;
          // the body pads its end by the hidden share so its last line can be scrolled into view.
          style={{ "--drawer-hidden": `${Math.round((1 - shown) * 100)}dvh` } as CSSProperties}
        >
          {/* Tapping the handle in peek opens the drawer further; at full height it does nothing. */}
          <DrawerHandle preventCycle={snap === SNAP_POINTS[SNAP_POINTS.length - 1]} />
          <DrawerTitle asChild>{title}</DrawerTitle>
          {children}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open modal={false} onOpenChange={onOpenChange}>
      <DialogContent {...contentProps}>
        <DialogTitle asChild>{title}</DialogTitle>
        {children}
      </DialogContent>
    </Dialog>
  );
}
