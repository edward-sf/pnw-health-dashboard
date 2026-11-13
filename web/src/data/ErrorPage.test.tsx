import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import ErrorPage from "./ErrorPage";

test.each([true, false])(
  "only the message is a live alert, so a focused heading isn't announced twice (pageHeading %s)",
  (pageHeading) => {
    render(
      <ErrorPage
        message="Failed to load values.json: 500"
        onRetry={() => {}}
        pageHeading={pageHeading}
      />,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Failed to load values.json: 500");
    const heading = screen.getByRole("heading", {
      level: 2,
      name: "Couldn't load the data",
    });
    expect(alert).not.toContainElement(heading);
    expect(alert).not.toContainElement(
      screen.getByRole("button", { name: "Try again" }),
    );
  },
);
