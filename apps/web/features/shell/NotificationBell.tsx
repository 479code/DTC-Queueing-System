"use client";

import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { collection, doc, limit, onSnapshot, orderBy, query, updateDoc, where } from "firebase/firestore";
import { db } from "../../firebase/client";
import { formatSiteTime } from "../../lib/time";

type Notice = { id: string; title: string; body: string; createdAt: string; unread: boolean };

/**
 * The backend already writes a notification for each thing a person needs to
 * know (availability requested, bypass approved or rejected, insurance hold).
 * Without this they only ever arrive by push, so on the web they were invisible.
 */
export function NotificationBell({ siteId, userId }: { siteId: string; userId: string }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!db || !userId) return;
    return onSnapshot(
      query(
        collection(db, "sites", siteId, "notifications"),
        where("userId", "==", userId),
        orderBy("createdAt", "desc"),
        limit(20)
      ),
      (snapshot) => setNotices(snapshot.docs.map((item) => {
        const data = item.data();
        return {
          id: item.id,
          title: String(data.title ?? "Notification"),
          body: String(data.body ?? ""),
          createdAt: formatSiteTime(data.createdAt),
          unread: !data.readAt
        };
      })),
      () => setNotices([])
    );
  }, [siteId, userId]);

  // Clicking anywhere else closes the panel; Escape does too.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const unread = notices.filter((notice) => notice.unread);

  const openPanel = () => {
    setOpen((current) => !current);
    if (!open && db) {
      // Seeing them is reading them.
      for (const notice of unread) {
        void updateDoc(doc(db, "sites", siteId, "notifications", notice.id), { readAt: new Date() }).catch(() => undefined);
      }
    }
  };

  return (
    <div className="notificationBell" ref={panelRef}>
      <button
        aria-expanded={open}
        aria-label={unread.length ? `Notifications, ${unread.length} unread` : "Notifications"}
        className="iconButton notificationButton"
        onClick={openPanel}
        type="button"
      >
        <Bell size={17} />
        {unread.length ? <span className="notificationCount">{unread.length > 9 ? "9+" : unread.length}</span> : null}
      </button>

      {open ? (
        <div className="notificationPanel" role="dialog" aria-label="Notifications">
          <div className="notificationPanelHead"><strong>Notifications</strong><span>{notices.length ? `Last ${notices.length}` : "Nothing yet"}</span></div>
          {notices.length ? (
            <ul>
              {notices.map((notice) => (
                <li className={notice.unread ? "notificationItem unread" : "notificationItem"} key={notice.id}>
                  <strong>{notice.title}</strong>
                  <span>{notice.body}</span>
                  <small>{notice.createdAt}</small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="notificationEmpty">You will see availability requests, bypass decisions and insurance holds here.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
