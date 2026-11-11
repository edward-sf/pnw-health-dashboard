import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { topology } from "../test/fixtures";
import { buildMapPaths } from "./buildMapPaths";
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

  test("click calls onSelect with the zero-padded fips", async () => {
    const { container, onSelect } = setup();
    await userEvent.click(container.querySelector('path[data-fips="02016"]')!);
    expect(onSelect).toHaveBeenCalledWith("02016");
  });

  test("hover shows tooltipFor text", () => {
    const { container } = setup();
    expect(screen.queryByText("tip 53033")).not.toBeInTheDocument();
    fireEvent.mouseEnter(container.querySelector('path[data-fips="53033"]')!);
    expect(screen.getByText("tip 53033")).toBeVisible();
    fireEvent.mouseLeave(container.querySelector('path[data-fips="53033"]')!);
    expect(screen.queryByText("tip 53033")).not.toBeInTheDocument();
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
});
