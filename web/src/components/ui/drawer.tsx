import type { ComponentProps } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Drawer as DrawerPrimitive } from "vaul";
import { cn } from "@/lib/utils";

/**
 * A bottom drawer. Its look is `.county-panel` and `.drawer-handle` in styles.css.
 *
 * vaul 1.1.2 drops `modal` on the Radix Dialog root it renders, so even a `modal={false}` drawer
 * traps focus, hides the rest of the page from assistive technology and blocks pointer events
 * outside it. A non-modal Radix root nested inside vaul's becomes the dialog context its content,
 * title and portal read (vaul uses the same `@radix-ui/react-dialog`), which makes the drawer
 * genuinely non-modal; vaul's own context still drives dragging and the snap points.
 */
function Drawer({
  modal = true,
  open,
  onOpenChange,
  children,
  ...props
}: ComponentProps<typeof DrawerPrimitive.Root>) {
  return (
    <DrawerPrimitive.Root modal={modal} open={open} onOpenChange={onOpenChange} {...props}>
      {modal ? (
        children
      ) : (
        <DialogPrimitive.Root open={open} modal={false} onOpenChange={onOpenChange}>
          {children}
        </DialogPrimitive.Root>
      )}
    </DrawerPrimitive.Root>
  );
}

function DrawerContent({ className, ...props }: ComponentProps<typeof DrawerPrimitive.Content>) {
  return (
    <DrawerPrimitive.Portal data-slot="drawer-portal">
      <DrawerPrimitive.Content data-slot="drawer-content" className={cn(className)} {...props} />
    </DrawerPrimitive.Portal>
  );
}

function DrawerHandle({ className, ...props }: ComponentProps<typeof DrawerPrimitive.Handle>) {
  return (
    <DrawerPrimitive.Handle
      data-slot="drawer-handle"
      className={cn("drawer-handle", className)}
      {...props}
    />
  );
}

function DrawerTitle(props: ComponentProps<typeof DrawerPrimitive.Title>) {
  return <DrawerPrimitive.Title data-slot="drawer-title" {...props} />;
}

export { Drawer, DrawerContent, DrawerHandle, DrawerTitle };
