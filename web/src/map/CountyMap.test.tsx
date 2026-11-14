import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { topology } from "../test/fixtures";
import { buildMapPaths } from "./buildMapPaths";
import { outlineFor } from "../color/outline";
import { PALETTES } from "../color/palette";
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
      stateBorders="M0,0L10,10"
    />,
  );
  return { ...view, onSelect };
}

describe("CountyMap", () => {
  test("renders a path[data-fips] per county", () => {
    const { container } = setup();
    expect(container.querySelectorAll("path.county[data-fips]")).toHaveLength(5);
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
    await userEvent.click(container.querySelector('path.county[data-fips="02016"]')!);
    expect(onSelect).toHaveBeenCalledWith("02016");
  });

  test("hover shows tooltipFor text", () => {
    const { container } = setup();
    expect(screen.queryByText("tip 53033")).not.toBeInTheDocument();
    fireEvent.pointerEnter(container.querySelector('path.county[data-fips="53033"]')!, {
      pointerType: "mouse",
    });
    expect(screen.getByText("tip 53033")).toBeVisible();
    fireEvent.pointerLeave(container.querySelector('path.county[data-fips="53033"]')!, {
      pointerType: "mouse",
    });
    expect(screen.queryByText("tip 53033")).not.toBeInTheDocument();
  });

  test("touch shows no tooltip and a tap still selects", () => {
    const { container, onSelect } = setup();
    const king = container.querySelector('path.county[data-fips="53033"]')!;
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

  test("a scattered county's halo is drawn under the counties", () => {
    const { container } = setup();
    const under = [...container.querySelectorAll("g.map-halos > path.county-halo")];
    expect(under.map((h) => h.getAttribute("data-fips"))).toEqual(
      paths.filter((p) => p.halo > 0).map((p) => p.fips),
    );
    expect(under.length).toBeGreaterThan(0);
    const halosGroup = container.querySelector("g.map-halos")!;
    for (const g of [container.querySelector(".map-main")!, container.querySelector(".map-inset")!]) {
      expect(halosGroup.compareDocumentPosition(g) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  test("pads are drawn transparent over every county, in layer order", () => {
    const { container } = setup();
    const rects = [...container.querySelectorAll("g.map-pads > rect.county-pad")];
    const expected = paths.filter((p) => p.pad).sort((a, b) => a.pad!.layer - b.pad!.layer);
    expect(expected.length).toBeGreaterThan(0);
    expect(rects.map((r) => r.getAttribute("data-fips"))).toEqual(expected.map((p) => p.fips));
    rects.forEach((r, i) => {
      const [[x0, y0], [x1, y1]] = expected[i]!.pad!.rect;
      expect([r.getAttribute("x"), r.getAttribute("y")]).toEqual([String(x0), String(y0)]);
      expect([r.getAttribute("width"), r.getAttribute("height")]).toEqual([
        String(x1 - x0),
        String(y1 - y0),
      ]);
      expect(r.getAttribute("fill")).toBe("transparent");
      expect(r.hasAttribute("stroke")).toBe(false);
    });
    const group = container.querySelector("g.map-pads")!;
    for (const g of [container.querySelector(".map-main")!, container.querySelector(".map-inset")!]) {
      expect(g.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  test("hovering a pad shows its county's tooltip and hover outline", () => {
    const { container } = setup();
    const fips = paths.find((p) => p.pad)!.fips;
    const pad = container.querySelector(`rect.county-pad[data-fips="${fips}"]`)!;
    fireEvent.pointerEnter(pad, { pointerType: "mouse" });
    expect(screen.getByText(`tip ${fips}`)).toBeVisible();
    expect(container.querySelector(`path.county[data-fips="${fips}"]`)).toHaveAttribute("data-hover");
    expect(container.querySelectorAll("path.county[data-hover]")).toHaveLength(1);
    fireEvent.pointerLeave(pad, { pointerType: "mouse" });
    expect(container.querySelectorAll("path.county[data-hover]")).toHaveLength(0);
  });

  test("a pad click selects its county", async () => {
    const { container, onSelect } = setup();
    const fips = paths.find((p) => p.pad)!.fips;
    await userEvent.click(container.querySelector(`rect.county-pad[data-fips="${fips}"]`)!);
    expect(onSelect).toHaveBeenCalledWith(fips);
  });

  test("a halo click selects its county", async () => {
    const { container, onSelect } = setup();
    await userEvent.click(container.querySelector('path.county-halo[data-fips="02016"]')!);
    expect(onSelect).toHaveBeenCalledWith("02016");
  });

  test("the selected county has a ring under it with the same d", () => {
    const { container } = setup("53033");
    const ring = container.querySelector("path.county-ring")!;
    const county = container.querySelector('path.county[data-fips="53033"]')!;
    expect(ring.getAttribute("d")).toBe(county.getAttribute("d"));
    expect(ring.compareDocumentPosition(county) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelectorAll("path.county-ring")).toHaveLength(1);
  });

  test("no ring without a selection", () => {
    const { container } = setup();
    expect(container.querySelector("path.county-ring")).toBeNull();
  });

  test("state borders are drawn above the counties and ignore the pointer", () => {
    const { container } = setup();
    const borders = container.querySelector("path.state-borders")!;
    expect(borders.getAttribute("d")).toBe("M0,0L10,10");
    expect(borders.hasAttribute("data-fips")).toBe(false);
    const main = container.querySelector(".map-main")!;
    expect(main.compareDocumentPosition(borders) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
      fireEvent.pointerMove(container.querySelector('path.county[data-fips="53033"]')!, {
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
      stateBorders=""
    />,
  );
  const path = container.querySelector<SVGPathElement>("path.county[data-fips]")!;
  expect(path.style.getPropertyValue("--county-stroke")).toBe(outlineFor("#e34a33", PALETTES.light));
});
