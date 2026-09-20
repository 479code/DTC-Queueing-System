"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

/**
 * A work list: rows that carry a primary action. The top item is the focus
 * card; acting on an item removes it, the next item is promoted, and the
 * action button keeps its place so the work can be done without hunting.
 * See /DESIGN.md section 3.
 */
export type WorkItem = {
  id: string;
  title: string;
  detail: string;
  /** Shown on the right of a row, e.g. a countdown or a queue position. */
  note?: ReactNode;
};

export function WorkList<T extends WorkItem>({
  items,
  actionLabel,
  busyLabel,
  emptyMessage,
  onAction,
  describeSuccess
}: {
  items: T[];
  actionLabel: string;
  busyLabel: string;
  emptyMessage: string;
  onAction: (item: T) => Promise<void>;
  describeSuccess: (item: T) => string;
}) {
  const [done, setDone] = useState<string[]>([]);
  const [failures, setFailures] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState("");
  const [lastDone, setLastDone] = useState("");
  const focusRef = useRef<HTMLButtonElement | null>(null);
  const shouldRefocus = useRef(false);

  // Items the server has already moved on from stop being "done by us".
  useEffect(() => {
    setDone((current) => current.filter((id) => items.some((item) => item.id === id)));
  }, [items]);

  const visible = useMemo(() => items.filter((item) => !done.includes(item.id)), [done, items]);
  const [focus, ...rest] = visible;

  // After acting, the next item's button takes focus so Enter can be pressed
  // again without moving the pointer.
  useEffect(() => {
    if (shouldRefocus.current && focusRef.current) {
      focusRef.current.focus();
      shouldRefocus.current = false;
    }
  }, [focus?.id]);

  const act = useCallback(async (item: T, fromFocusCard: boolean) => {
    setBusyId(item.id);
    setFailures((current) => {
      const next = { ...current };
      delete next[item.id];
      return next;
    });
    try {
      await onAction(item);
      shouldRefocus.current = fromFocusCard;
      setLastDone(describeSuccess(item));
      setDone((current) => [...current, item.id]);
    } catch (error) {
      // The row goes back where it was, carrying its own reason.
      setFailures((current) => ({
        ...current,
        [item.id]: error instanceof Error ? error.message : "That did not go through. Try again."
      }));
    } finally {
      setBusyId("");
    }
  }, [describeSuccess, onAction]);

  if (!focus) {
    return <p className="workListEmpty">{lastDone ? `${lastDone} Nothing else is waiting.` : emptyMessage}</p>;
  }

  return (
    <div className="workList">
      {lastDone ? <p className="workListDone" role="status">{lastDone}</p> : null}

      <article className="workFocus">
        <div>
          <strong>{focus.title}</strong>
          <span>{focus.detail}</span>
          {failures[focus.id] ? <span className="workFailure">{failures[focus.id]}</span> : null}
        </div>
        {focus.note ? <div className="workNote">{focus.note}</div> : null}
        <button
          className="primaryButton"
          disabled={busyId !== ""}
          onClick={() => void act(focus, true)}
          ref={focusRef}
          type="button"
        >
          {busyId === focus.id ? busyLabel : actionLabel}
        </button>
      </article>

      {rest.map((item) => (
        <article className="workRow" key={item.id}>
          <div>
            <strong>{item.title}</strong>
            <span>{item.detail}</span>
            {failures[item.id] ? <span className="workFailure">{failures[item.id]}</span> : null}
          </div>
          {item.note ? <div className="workNote">{item.note}</div> : null}
          <button className="secondaryButton" disabled={busyId !== ""} onClick={() => void act(item, false)} type="button">
            {busyId === item.id ? busyLabel : actionLabel}
          </button>
        </article>
      ))}

      {rest.length ? <p className="workListCount">{visible.length} waiting</p> : null}
    </div>
  );
}
