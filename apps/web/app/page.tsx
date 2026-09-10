"use client";

import { useEffect, useState } from "react";
import {
  BarChart3,
  ClipboardCheck,
  FileSearch,
  ListOrdered,
  ShieldCheck,
  Truck,
  UserRound,
  UserRoundCheck
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { BypassScreen } from "../features/bypass/BypassScreen";
import { getFirebaseSession } from "../features/bypass/api";
import { DispatchScreen } from "../features/dispatch/DispatchScreen";
import { FleetWorkspace } from "../features/fleet/FleetWorkspace";
import { AuditScreen } from "../features/reporting/AuditScreen";
import { OverviewScreen } from "../features/reporting/OverviewScreen";
import {
  demoOfficers,
  demoQueue,
  demoTrucks,
  loadFleetOfficers,
  subscribeToAssignedQueue,
  subscribeToAssignedTrucks,
  subscribeToQueue,
  subscribeToTrucks,
  type FleetOfficerOption,
  type QueueEntryView,
  type TruckView
} from "../features/operations/api";
import { InsuranceScreen } from "../features/operations/InsuranceScreen";
import { ProgrammingScreen } from "../features/operations/ProgrammingScreen";
import { QueueScreen } from "../features/operations/QueueScreen";
import { TrucksScreen } from "../features/operations/TrucksScreen";
import "./page.css";

type View = "overview" | "my-fleet" | "trucks" | "insurance" | "queue" | "programming" | "dispatch" | "bypass" | "audit";

type NavigationItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  phase?: string;
  enabled: boolean;
};

const navigation: NavigationItem[] = [
  { id: "my-fleet", label: "My Fleet", icon: UserRound, enabled: true },
  { id: "overview", label: "Overview", icon: BarChart3, enabled: true },
  { id: "queue", label: "Live Queue", icon: ListOrdered, enabled: true },
  { id: "programming", label: "Programming", icon: ClipboardCheck, enabled: true },
  { id: "dispatch", label: "Dispatch", icon: FileSearch, enabled: true },
  { id: "trucks", label: "Trucks", icon: Truck, enabled: true },
  { id: "insurance", label: "Insurance", icon: ShieldCheck, enabled: true },
  { id: "bypass", label: "Bypass Requests", icon: UserRoundCheck, enabled: true },
  { id: "audit", label: "Audit Log", icon: FileSearch, enabled: true }
];

function viewFromHash(): View {
  if (typeof window === "undefined") return "trucks";
  const value = window.location.hash.slice(1);
  return ["overview", "my-fleet", "trucks", "insurance", "queue", "programming", "dispatch", "bypass", "audit"].includes(value)
    ? (value as View)
    : "trucks";
}

export default function Page() {
  const [view, setView] = useState<View>("trucks");
  const [siteId, setSiteId] = useState("default-site");
  const [trucks, setTrucks] = useState<TruckView[]>(demoTrucks);
  const [queue, setQueue] = useState<QueueEntryView[]>(demoQueue);
  const [officers, setOfficers] = useState<FleetOfficerOption[]>(demoOfficers);
  const [demoMode, setDemoMode] = useState(true);
  const [roles, setRoles] = useState<string[]>([]);
  const [userId, setUserId] = useState("officer-a");
  const [dataMessage, setDataMessage] = useState("");

  useEffect(() => {
    const updateView = () => setView(viewFromHash());
    updateView();
    window.addEventListener("hashchange", updateView);
    return () => window.removeEventListener("hashchange", updateView);
  }, []);

  useEffect(() => {
    let active = true;
    let unsubscribeTrucks: () => void = () => undefined;
    let unsubscribeQueue: () => void = () => undefined;

    void getFirebaseSession().then(async (session) => {
      if (!active || !session) return;
      setSiteId(session.siteId);
      setRoles(session.roles);
      setUserId(session.userId);
      setDemoMode(false);
      const onError = (message: string) => {
        setDataMessage(message);
        setDemoMode(true);
      };
      const fleetOnlySession = session.roles.includes("fleetOfficer") && !session.roles.some((role) => ["programmingOfficer", "overseer", "management", "auditor", "administrator"].includes(role));
      if (fleetOnlySession) {
        unsubscribeTrucks = subscribeToAssignedTrucks(session.siteId, session.userId, setTrucks, onError);
        unsubscribeQueue = subscribeToAssignedQueue(session.siteId, session.userId, setQueue, onError);
      } else {
        unsubscribeTrucks = subscribeToTrucks(session.siteId, setTrucks, onError);
        unsubscribeQueue = subscribeToQueue(session.siteId, setQueue, onError);
      }
      if (fleetOnlySession) return;
      try {
        setOfficers(await loadFleetOfficers(session.siteId));
      } catch (error) {
        onError(error instanceof Error ? error.message : "Unable to load fleet officers.");
      }
    });

    return () => {
      active = false;
      unsubscribeTrucks();
      unsubscribeQueue();
    };
  }, []);

  const fleetOnly = !demoMode && roles.includes("fleetOfficer") && !roles.some((role) => ["programmingOfficer", "overseer", "management", "auditor", "administrator"].includes(role));
  const activeView = fleetOnly && view !== "my-fleet" ? "my-fleet" : view;
  const visibleNavigation = demoMode
    ? navigation
    : fleetOnly
      ? navigation.filter((item) => item.id === "my-fleet")
      : navigation.filter((item) => item.id !== "my-fleet" && (item.id !== "audit" || roles.some((role) => ["management", "auditor", "administrator"].includes(role))));

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brandBlock">
          <strong className="brand">Fleet Queue Control</strong>
          <span>Refinery operations</span>
        </div>
        <nav aria-label="Primary navigation">
          {visibleNavigation.map((item) => {
            const Icon = item.icon;
            return item.enabled ? (
              <a className={item.id === activeView ? "active" : undefined} href={`#${item.id}`} key={item.id}>
                <Icon size={17} /><span>{item.label}</span>
              </a>
            ) : (
              <span aria-disabled="true" className="disabledNav" key={item.id} title={`${item.label} is planned for ${item.phase}`}>
                <Icon size={17} /><span>{item.label}</span><small>{item.phase}</small>
              </span>
            );
          })}
        </nav>
        <div className="environmentState"><span className={demoMode ? "demoDot" : "liveDot"} /><div><strong>{demoMode ? "Demonstration data" : "Firebase connected"}</strong><small>{demoMode ? "Actions stay in this preview" : siteId}</small></div></div>
      </aside>

      <section className="content">
        {dataMessage ? <p className="connectionMessage">Live data unavailable. Showing demonstration data.</p> : null}
        {activeView === "my-fleet" ? <FleetWorkspace demoMode={demoMode} fleetOfficerId={userId} onTrucksChange={setTrucks} queue={queue} siteId={siteId} trucks={trucks} /> : null}
        {activeView === "overview" ? <OverviewScreen canRecalculate={demoMode || roles.some((role) => ["management", "administrator"].includes(role))} demoMode={demoMode} queue={queue} siteId={siteId} trucks={trucks} /> : null}
        {activeView === "trucks" ? <TrucksScreen demoMode={demoMode} officers={officers} onTrucksChange={setTrucks} siteId={siteId} trucks={trucks} /> : null}
        {activeView === "insurance" ? <InsuranceScreen demoMode={demoMode} onTrucksChange={setTrucks} siteId={siteId} trucks={trucks} /> : null}
        {activeView === "queue" ? <QueueScreen queue={queue} /> : null}
        {activeView === "programming" ? <ProgrammingScreen queue={queue} siteId={siteId} /> : null}
        {activeView === "dispatch" ? <DispatchScreen demoMode={demoMode} siteId={siteId} /> : null}
        {activeView === "bypass" ? <BypassScreen /> : null}
        {activeView === "audit" ? <AuditScreen demoMode={demoMode} siteId={siteId} /> : null}
      </section>
    </main>
  );
}
