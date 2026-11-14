import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
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

/** On mount, if a breakpoint switch asked for it, focuses the h2 of the content it sits in. */
function FocusRestorer({ pending, onDone }: { pending: boolean; onDone: () => void }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!pending) return;
    ref.current?.parentElement?.querySelector("h2")?.focus();
    onDone();
  }, [pending, onDone]);
  return <span ref={ref} hidden />;
}

/**
 * The county panel's frame: a non-modal dialog floating over the map stage from 721px, a
 * non-modal bottom drawer with two snap points on phones. Escape closes either.
 */
export function PanelShell({
  onClose,
  county,
  children,
}: {
  onClose: () => void;
  /** The open county; the drawer returns to peek whenever it changes. */
  county?: string;
  children: ReactNode;
}) {
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [snap, setSnap] = useState<number | string | null>(SNAP_POINTS[0]!);
  const [snapCounty, setSnapCounty] = useState(county);
  if (snapCounty !== county) {
    setSnapCounty(county);
    setSnap(SNAP_POINTS[0]!);
  }

  // Crossing the breakpoint swaps the dialog for the drawer (or back), which remounts the content
  // and drops focus. If focus was inside the panel, put it on the county heading of the new one.
  const [focusInside, setFocusInside] = useState(false);
  useEffect(() => {
    const inPanel = (t: EventTarget | null) => t instanceof Element && !!t.closest(".county-panel");
    const onFocusIn = (e: FocusEvent) => setFocusInside(inPanel(e.target));
    const onPointerDown = (e: PointerEvent) => {
      if (!inPanel(e.target)) setFocusInside(false);
    };
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, []);
  const [wasPhone, setWasPhone] = useState(isPhone);
  const [restoreFocus, setRestoreFocus] = useState(false);
  if (wasPhone !== isPhone) {
    setWasPhone(isPhone);
    setRestoreFocus(focusInside);
  }
  const restoreDone = useCallback(() => setRestoreFocus(false), []);
  const body = (
    <>
      {children}
      <FocusRestorer pending={restoreFocus} onDone={restoreDone} />
    </>
  );

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
          {body}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open modal={false} onOpenChange={onOpenChange}>
      <DialogContent {...contentProps}>
        <DialogTitle asChild>{title}</DialogTitle>
        {body}
      </DialogContent>
    </Dialog>
  );
}
