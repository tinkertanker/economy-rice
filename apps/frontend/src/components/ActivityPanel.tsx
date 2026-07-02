import { ChevronDown, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { api } from "../services/api";
import type { BootstrapPayload, LedgerEntry } from "../types";

type ActivityPanelProps = {
  bootstrap: BootstrapPayload;
  canViewLedger: boolean;
};

const LEDGER_PAGE_SIZE = 25;

function formatEntryType(type: string) {
  return type
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDelta(value: number, symbol: string, name: string) {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value} ${symbol || name}`;
}

function getEntryTotal(entry: LedgerEntry, key: "pointsDelta" | "currencyDelta") {
  return entry.splits.reduce((total, split) => total + split[key], 0);
}

export default function ActivityPanel({
  bootstrap,
  canViewLedger,
}: ActivityPanelProps) {
  const [ledgerEntries, setLedgerEntries] = useState(() => bootstrap.ledger.slice(0, LEDGER_PAGE_SIZE));
  const [nextLedgerCursor, setNextLedgerCursor] = useState<string | null>(
    bootstrap.ledger.length > LEDGER_PAGE_SIZE ? bootstrap.ledger[LEDGER_PAGE_SIZE - 1]?.id ?? null : null,
  );
  const [isLoadingOlderLedger, setIsLoadingOlderLedger] = useState(false);
  const [ledgerError, setLedgerError] = useState<string | null>(null);

  useEffect(() => {
    setLedgerEntries(bootstrap.ledger.slice(0, LEDGER_PAGE_SIZE));
    setNextLedgerCursor(bootstrap.ledger.length > LEDGER_PAGE_SIZE ? bootstrap.ledger[LEDGER_PAGE_SIZE - 1]?.id ?? null : null);
    setLedgerError(null);
  }, [bootstrap.ledger]);

  const totalLeaderboardPoints = useMemo(
    () => bootstrap.leaderboard.reduce((total, group) => total + group.pointsBalance, 0),
    [bootstrap.leaderboard],
  );

  const handleLoadOlderLedger = async () => {
    setIsLoadingOlderLedger(true);
    setLedgerError(null);
    try {
      if (!nextLedgerCursor) {
        return;
      }
      const page = await api.listLedger({
        limit: LEDGER_PAGE_SIZE,
        cursor: nextLedgerCursor,
      });
      setLedgerEntries((current) => {
        const existingIds = new Set(current.map((entry) => entry.id));
        return [...current, ...page.entries.filter((entry) => !existingIds.has(entry.id))];
      });
      setNextLedgerCursor(page.nextCursor);
    } catch (error) {
      setLedgerError(error instanceof Error ? error.message : "Failed to load older ledger entries.");
    } finally {
      setIsLoadingOlderLedger(false);
    }
  };

  return (
    <div className="panel-stack">
      <section className="section leaderboard-section">
        <header className="section-header">
          <h2>{canViewLedger ? "Leaderboard & ledger" : "Leaderboard"}</h2>
        </header>

        <div className={canViewLedger ? "activity-layout" : "activity-layout activity-layout--leaderboard-only"}>
          <section aria-labelledby={canViewLedger ? "leaderboard-heading" : undefined} className="leaderboard-panel">
            {canViewLedger ? <h3 id="leaderboard-heading">Leaderboard</h3> : null}
            <div className="leaderboard-summary">
              <span>{bootstrap.leaderboard.length} groups</span>
              <strong>{totalLeaderboardPoints}</strong>
              <span>{bootstrap.settings.pointsName}</span>
            </div>
            <ol className="leaderboard-list">
              {bootstrap.leaderboard.map((group, index) => (
                <li className="leaderboard-list__row" key={group.id}>
                  <span className="leaderboard-list__rank">{index + 1}</span>
                  <span className="leaderboard-list__name">{group.displayName}</span>
                  <span className="leaderboard-list__score">
                    {group.pointsBalance}
                    <span>{bootstrap.settings.pointsSymbol || bootstrap.settings.pointsName}</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>

          {canViewLedger ? (
            <section aria-labelledby="ledger-heading" className="ledger-panel">
              <div className="ledger-panel__header">
                <h3 id="ledger-heading">Ledger</h3>
                <span>{ledgerEntries.length} shown</span>
              </div>
              {ledgerEntries.length > 0 ? (
                <ol className="ledger-feed">
                  {ledgerEntries.map((entry) => {
                    const pointsTotal = getEntryTotal(entry, "pointsDelta");
                    const currencyTotal = getEntryTotal(entry, "currencyDelta");
                    return (
                      <li className="ledger-event" key={entry.id}>
                        <div className="ledger-event__marker" aria-hidden>
                          {entry.type.charAt(0)}
                        </div>
                        <div className="ledger-event__body">
                          <div className="ledger-event__topline">
                            <div>
                              <strong>{formatEntryType(entry.type)}</strong>
                              <time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString()}</time>
                            </div>
                            <div className="ledger-event__totals" aria-label="Ledger entry totals">
                              {pointsTotal !== 0 ? (
                                <span className={pointsTotal > 0 ? "delta delta--positive" : "delta delta--negative"}>
                                  {formatDelta(pointsTotal, bootstrap.settings.pointsSymbol, bootstrap.settings.pointsName)}
                                </span>
                              ) : null}
                              {currencyTotal !== 0 ? (
                                <span className={currencyTotal > 0 ? "delta delta--positive" : "delta delta--negative"}>
                                  {formatDelta(currencyTotal, bootstrap.settings.currencySymbol, bootstrap.settings.currencyName)}
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <p className="ledger-event__description">{entry.description}</p>
                          <div className="ledger-event__meta">
                            <span>{entry.createdByUsername ? `By ${entry.createdByUsername}` : "System"}</span>
                            <span>{entry.splits.length} split{entry.splits.length === 1 ? "" : "s"}</span>
                          </div>
                          <div className="ledger-splits">
                            {entry.splits.map((split) => (
                              <span className="ledger-split" key={split.id}>
                                <strong>{split.group.displayName}</strong>
                                {split.pointsDelta !== 0 ? (
                                  <span>{formatDelta(split.pointsDelta, bootstrap.settings.pointsSymbol, bootstrap.settings.pointsName)}</span>
                                ) : null}
                                {split.currencyDelta !== 0 ? (
                                  <span>{formatDelta(split.currencyDelta, bootstrap.settings.currencySymbol, bootstrap.settings.currencyName)}</span>
                                ) : null}
                              </span>
                            ))}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="empty-panel-copy">No ledger entries yet.</p>
              )}
              {ledgerError ? <p className="form-error">{ledgerError}</p> : null}
              {nextLedgerCursor ? (
                <button
                  className="ledger-load-more"
                  onClick={handleLoadOlderLedger}
                  disabled={isLoadingOlderLedger}
                  type="button"
                >
                  {isLoadingOlderLedger ? <Loader2 aria-hidden className="ledger-load-more__icon is-spinning" /> : <ChevronDown aria-hidden className="ledger-load-more__icon" />}
                  Load older events
                </button>
              ) : ledgerEntries.length > 0 ? (
                <p className="ledger-end">End of ledger</p>
              ) : null}
            </section>
          ) : null}
        </div>
      </section>
    </div>
  );
}
