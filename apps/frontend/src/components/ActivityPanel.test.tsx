import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "../services/api";
import type { BootstrapPayload, LedgerEntry } from "../types";
import ActivityPanel from "./ActivityPanel";

vi.mock("../services/api", () => ({
  api: {
    listLedger: vi.fn(),
  },
}));

function createLedgerEntry(id: string, overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id,
    type: "MANUAL_AWARD",
    description: `Ledger ${id}`,
    createdByUsername: "Mentor",
    createdAt: "2026-01-02T03:04:05.000Z",
    splits: [
      {
        id: `${id}-split`,
        group: { displayName: "Team Alpha" },
        pointsDelta: 5,
        currencyDelta: 2,
      },
    ],
    ...overrides,
  };
}

function createBootstrap(overrides: Partial<BootstrapPayload> = {}): BootstrapPayload {
  return {
    settings: {
      appName: "points accelerator",
      pointsName: "points",
      pointsSymbol: "pts",
      currencyName: "coins",
      currencySymbol: "$",
      groupPointsPerCurrencyDonation: 10,
      mentorRoleIds: [],
      passivePointsReward: 1,
      passiveCurrencyReward: 1,
      passiveCooldownSeconds: 60,
      passiveMinimumCharacters: 4,
      passiveAllowedChannelIds: [],
      passiveDeniedChannelIds: [],
      allowGrouplessEarning: true,
      bettingChannelIds: [],
      luckyDrawChannelIds: [],
      pointsChannelIds: [],
      shopChannelIds: [],
      wrongChannelPenalty: 0,
      commandLogChannelId: null,
      redemptionChannelId: null,
      listingChannelId: null,
      announcementsChannelId: null,
      submissionFeedChannelId: null,
      betWinChance: 50,
      bettingCooldownSeconds: 0,
    },
    capabilities: [],
    groups: [],
    shopItems: [],
    listings: [],
    leaderboard: [
      { id: "group-alpha", displayName: "Team Alpha", pointsBalance: 25 },
      { id: "group-beta", displayName: "Team Beta", pointsBalance: 10 },
    ],
    ledger: [createLedgerEntry("ledger-1")],
    assignments: [],
    participants: [],
    submissions: [],
    reactionRules: [],
    discord: {
      roles: [],
      channels: [],
      members: [],
    },
    setup: {
      isFreshInstall: false,
      presets: [],
    },
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ActivityPanel", () => {
  it("renders a compact leaderboard and useful ledger event details", () => {
    render(<ActivityPanel bootstrap={createBootstrap()} canViewLedger />);

    expect(screen.getByRole("heading", { name: "Leaderboard & ledger" })).toBeInTheDocument();
    expect(screen.getByText("35")).toBeInTheDocument();
    expect(screen.getByText("Manual Award")).toBeInTheDocument();
    expect(screen.getAllByText("+5 pts").length).toBeGreaterThan(0);
    expect(screen.getAllByText("+2 $").length).toBeGreaterThan(0);
    expect(screen.getByText("By Mentor")).toBeInTheDocument();
    expect(screen.getByText("1 split")).toBeInTheDocument();
    expect(screen.getAllByText("Team Alpha").length).toBeGreaterThan(0);
  });

  it("loads older ledger events by cursor and appends without duplicates", async () => {
    const initialLedger = Array.from({ length: 26 }, (_, index) => createLedgerEntry(`ledger-${index + 1}`));
    vi.mocked(api.listLedger).mockResolvedValue({
      entries: [createLedgerEntry("ledger-20"), createLedgerEntry("ledger-27", { description: "Older event" })],
      nextCursor: null,
    });

    render(<ActivityPanel bootstrap={createBootstrap({ ledger: initialLedger })} canViewLedger />);

    fireEvent.click(screen.getByRole("button", { name: /load older events/i }));

    await waitFor(() => {
      expect(api.listLedger).toHaveBeenCalledWith({ limit: 25, cursor: "ledger-25" });
    });
    expect(await screen.findByText("Older event")).toBeInTheDocument();
    expect(screen.getByText("26 shown")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /load older events/i })).not.toBeInTheDocument();
    expect(screen.getByText("End of ledger")).toBeInTheDocument();

    const ledger = screen.getByRole("heading", { name: "Ledger" }).closest("section");
    expect(within(ledger!).getAllByText("Ledger ledger-20")).toHaveLength(1);
  });

  it("hides the ledger for leaderboard-only viewers", () => {
    render(<ActivityPanel bootstrap={createBootstrap()} canViewLedger={false} />);

    expect(screen.getByRole("heading", { name: "Leaderboard" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Ledger" })).not.toBeInTheDocument();
    expect(screen.queryByText("Manual Award")).not.toBeInTheDocument();
  });
});
