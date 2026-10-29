import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { ConnectionStatusProvider, useConnectionStatus } from "../useConnectionStatus";

const checkSession = vi.fn();
vi.mock("../client", () => ({ checkSession: () => checkSession() }));

function Probe() {
  const { state } = useConnectionStatus();
  return <span data-testid="state">{state}</span>;
}
const mount = () =>
  render(
    <ConnectionStatusProvider>
      <Probe />
    </ConnectionStatusProvider>,
  );

beforeEach(() => {
  checkSession.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(cleanup);

describe("connection status (the 'not logged in although logged in' bug)", () => {
  it("valid session -> connected", async () => {
    checkSession.mockResolvedValue("authorized");
    mount();
    await waitFor(() => expect(screen.getByTestId("state").textContent).toBe("connected"));
  });

  it("no/dead session -> disconnected (login screen)", async () => {
    checkSession.mockResolvedValue("unauthorized");
    mount();
    await waitFor(() => expect(screen.getByTestId("state").textContent).toBe("disconnected"));
  });

  it("network failure or timeout -> offline, NOT disconnected (no login prompt)", async () => {
    checkSession.mockRejectedValue(new Error("WebSocket connection failed"));
    mount();
    await waitFor(() => expect(screen.getByTestId("state").textContent).toBe("offline"));
  });
});
