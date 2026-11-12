import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { topology } from "../test/fixtures";
import { buildMapPaths } from "./buildMapPaths";
import { outlineFor } from "../color/outline";
import { CountyMap } from "./CountyMap";

const paths = buildMapPaths(topology);

function setup(selected: string | null = null, onSelect = vi.fn()) {
  const view = render(
    <CountyMap
      paths={paths}
      fillFor={() => "#abc"}
      tooltipFor={(fips) => `tip ${fips}`}
      selected={selected}
      onSelect={onSelect}
    />,
  );
  return { ...view, onSelect };
}

describe("CountyMap", () => {
  test("renders a path[data-fips] per county", () => {
    const { container } = setup();
    expect(container.querySelectorAll("path[data-fips]")).toHaveLength(5);
  });

  test("each county path is a named image (aria-label needs a role)", () => {
    setup("53033");
    const king = screen.getByRole("img", { name: "King, WA" });
    expect(king).toHaveAttribute("data-fips", "53033");
    expect(king).toHaveAttribute("aria-current", "true");
    expect(screen.getAllByRole("img")).toHaveLength(5);
  });

  test("click calls onSelect with the zero-padded fips", async () => {
    const { container, onSelect } = setup();
    await userEvent.click(container.querySelector('path[data-fips="02016"]')!);
    expect(onSelect).toHaveBeenCalledWith("02016");
  });

  test("hover shows tooltipFor text", () => {
    const { container } = setup();
    expect(screen.queryByText("tip 53033")).not.toBeInTheDocument();
    fireEvent.pointerEnter(container.querySelector('path[data-fips="53033"]')!, {
      pointerType: "mouse",
    });
    expect(screen.getByText("tip 53033")).toBeVisible();
    fireEvent.pointerLeave(container.querySelector('path[data-fips="53033"]')!, {
      pointerType: "mouse",
    });
    expect(screen.queryByText("tip 53033")).not.toBeInTheDocument();
  });

  test("touch shows no tooltip and a tap still selects", () => {
    const { container, onSelect } = setup();
    const king = container.querySelector('path[data-fips="53033"]')!;
    fireEvent.pointerEnter(king, { pointerType: "mouse" });
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.pointerEnter(king, { pointerType: "touch" });
    fireEvent.pointerMove(king, { pointerType: "touch" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    fireEvent.click(king);
    expect(onSelect).toHaveBeenCalledWith("53033");
  });

  test("the selected county has aria-current and renders last", () => {
    const { container } = setup("53033");
    const current = container.querySelectorAll('[aria-current="true"]');
    expect(current).toHaveLength(1);
    expect(current[0]!.getAttribute("data-fips")).toBe("53033");
    const lowerGroup = current[0]!.parentElement!;
    expect(lowerGroup.lastElementChild).toBe(current[0]);
  });

  test("labels the inset 'Alaska (not to scale)'", () => {
    setup();
    expect(screen.getByText("Alaska (not to scale)")).toBeInTheDocument();
  });

  describe("tooltip side", () => {
    function hoverAt(clientX: number) {
      const { container } = setup();
      const map = container.querySelector(".county-map")!;
      vi.spyOn(map, "getBoundingClientRect").mockReturnValue({
        left: 0, top: 0, right: 400, bottom: 300, width: 400, height: 300, x: 0, y: 0, toJSON: () => ({}),
      });
      fireEvent.pointerMove(container.querySelector('path[data-fips="53033"]')!, {
        pointerType: "mouse",
        clientX,
        clientY: 50,
      });
      return screen.getByRole("tooltip");
    }

    test("tooltip flips left past the map's midpoint", () => {
      const tip = hoverAt(300);
      expect(tip).toHaveClass("map-tooltip--left");
      expect(tip.style.left).toBe("288px");
    });

    test("tooltip stays right of the cursor in the left half", () => {
      const tip = hoverAt(100);
      expect(tip).not.toHaveClass("map-tooltip--left");
      expect(tip.style.left).toBe("112px");
    });
  });
});

test("each county path carries the outline chosen for its fill", () => {
  const { container } = render(
    <CountyMap
      paths={paths}
      fillFor={() => "#e34a33"}
      tooltipFor={() => ""}
      selected={null}
      onSelect={() => {}}
    />,
  );
  const path = container.querySelector<SVGPathElement>("path[data-fips]")!;
  expect(path.style.getPropertyValue("--county-stroke")).toBe(outlineFor("#e34a33"));
});
