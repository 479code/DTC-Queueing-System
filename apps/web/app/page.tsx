"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import {
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  KeyRound,
  FileSearch,
  ListOrdered,
  LogOut,
  ShieldCheck,
  Truck,
  UserRound,
  UserRoundCheck,
  UsersRound
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { USER_ROLES, isFleetOnlyRoleSet, visibleViewsForRoles, type AccessView, type UserRole } from "@refinery/types";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { AccessPendingScreen, SignInScreen } from "../features/auth/AccessGate";
import { BypassScreen } from "../features/bypass/BypassScreen";
import { getFirebaseSession } from "../features/bypass/api";
import { auth, isFirebaseConfigured } from "../firebase/client";
import { OrdersScreen } from "../features/orders/OrdersScreen";
import { ProductPreview } from "../features/preview/ProductPreview";
import { FleetWorkspace } from "../features/fleet/FleetWorkspace";
import { AuditScreen } from "../features/reporting/AuditScreen";
import { StaffAccessScreen } from "../features/access/StaffAccessScreen";
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
import { BypassWorkspace } from "../features/fleet/BypassWorkspace";
import { NotificationBell } from "../features/shell/NotificationBell";
import { ProgrammedScreen } from "../features/operations/ProgrammedScreen";
import { ProgrammingScreen } from "../features/operations/ProgrammingScreen";
import { QueueScreen } from "../features/operations/QueueScreen";
import { TrucksScreen } from "../features/operations/TrucksScreen";
import "./page.css";

type View = AccessView | "preview";
type AuthStatus = "demo" | "loading" | "signed-out" | "pending-access" | "ready";

type NavigationItem = {
  id: AccessView;
  label: string;
  icon: LucideIcon;
};

const navigation: NavigationItem[] = [
  { id: "my-fleet", label: "My Fleet", icon: UserRound },
  { id: "my-bypass", label: "My Bypasses", icon: KeyRound },
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "staff", label: "Staff Access", icon: UsersRound },
  { id: "queue", label: "Live Queue", icon: ListOrdered },
  { id: "programming", label: "Programming", icon: ClipboardCheck },
  { id: "programmed", label: "Programmed", icon: CheckCircle2 },
  { id: "orders", label: "Orders & ATCs", icon: FileSearch },
  { id: "trucks", label: "Trucks", icon: Truck },
  { id: "insurance", label: "Insurance", icon: ShieldCheck },
  { id: "bypass", label: "Bypass Requests", icon: UserRoundCheck },
  { id: "audit", label: "Audit Log", icon: FileSearch }
];

// Derived from the navigation so a new screen never falls back to Trucks.
const viewIds: View[] = [...navigation.map((item) => item.id), "preview"];

function viewFromHash(): View {
  if (typeof window === "undefined") return "trucks";
  const value = window.location.hash.slice(1);
  return viewIds.includes(value as View) ? (value as View) : "trucks";
}

export default function Page() {
  const [view, setView] = useState<View>("trucks");
  const [siteId, setSiteId] = useState("default-site");
  const [trucks, setTrucks] = useState<TruckView[]>(demoTrucks);
  const [queue, setQueue] = useState<QueueEntryView[]>(demoQueue);
  const [officers, setOfficers] = useState<FleetOfficerOption[]>(demoOfficers);
  const [demoMode, setDemoMode] = useState(!isFirebaseConfigured);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [userId, setUserId] = useState("officer-a");
  const [userEmail, setUserEmail] = useState("");
  const [authStatus, setAuthStatus] = useState<AuthStatus>(isFirebaseConfigured ? "loading" : "demo");
  const [dataMessage, setDataMessage] = useState("");

  useLayoutEffect(() => {
    const updateView = () => setView(viewFromHash());
    updateView();
    window.addEventListener("hashchange", updateView);
    return () => window.removeEventListener("hashchange", updateView);
  }, []);

  useEffect(() => {
    let active = true;
    let unsubscribeTrucks: () => void = () => undefined;
    let unsubscribeQueue: () => void = () => undefined;

    if (!isFirebaseConfigured || !auth) {
      setDemoMode(true);
      setAuthStatus("demo");
      return () => undefined;
    }

    const resetLiveData = () => {
      unsubscribeTrucks();
      unsubscribeQueue();
      unsubscribeTrucks = () => undefined;
      unsubscribeQueue = () => undefined;
    };

    const clearLiveCollections = () => {
      setTrucks([]);
      setQueue([]);
      setOfficers([]);
    };

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      resetLiveData();
      setDataMessage("");
      if (!user) {
        setRoles([]);
        setUserEmail("");
        setDemoMode(false);
        clearLiveCollections();
        setAuthStatus("signed-out");
        return;
      }

      setUserEmail(user.email ?? "");
      setAuthStatus("loading");
      void getFirebaseSession().then(async (session) => {
        if (!active) return;
        if (!session) {
          setRoles([]);
          setDemoMode(false);
          setAuthStatus("pending-access");
          return;
        }

        const activeRoles = session.roles.filter((role): role is UserRole => USER_ROLES.includes(role as UserRole));
        if (activeRoles.length === 0) {
          setRoles([]);
          setDemoMode(false);
          setAuthStatus("pending-access");
          return;
        }

        setSiteId(session.siteId);
        setRoles(activeRoles);
        setUserId(session.userId);
        setDemoMode(false);
        clearLiveCollections();
        setAuthStatus("ready");
        const onError = (message: string) => {
          console.error("Live data subscription failed:", message);
          setDataMessage("Some live data is temporarily unavailable. Figures may be incomplete.");
          clearLiveCollections();
          setDemoMode(false);
        };
        const fleetOnlySession = isFleetOnlyRoleSet(activeRoles);
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
        } catch {
          setOfficers([]);
        }
      }).catch(() => {
        if (!active) return;
        setDemoMode(false);
        setAuthStatus("pending-access");
      });
    });

    return () => {
      active = false;
      unsubscribeAuth();
      resetLiveData();
    };
  }, []);

  const isDemoExperience = authStatus === "demo";
  const visibleNavigation = isDemoExperience
    ? navigation
    : navigation.filter((item) => visibleViewsForRoles(roles).includes(item.id));
  // Opening a page your role cannot see should say so, not silently redirect.
  const deniedView = !isDemoExperience && view !== "preview" && navigation.some((item) => item.id === view)
    && !visibleNavigation.some((item) => item.id === view)
    ? navigation.find((item) => item.id === view)?.label ?? ""
    : "";
  const activeView = visibleNavigation.some((item) => item.id === view)
    ? view
    : visibleNavigation[0]?.id ?? "overview";

  if (view === "preview") return <ProductPreview />;

  if (authStatus === "loading") return <main className="accessLoading"><span className="liveDot" />Checking staff access</main>;
  if (authStatus === "signed-out" && auth) return <SignInScreen auth={auth} />;
  if (authStatus === "pending-access") return <AccessPendingScreen email={userEmail} onSignOut={() => { if (auth) void signOut(auth); }} />;

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brandBlock">
          <span aria-hidden="true" className="sidebarBrandMark">
            <svg fill="none" height="16" viewBox="0 0 16 16" width="16"><rect fill="currentColor" height="2.6" rx="1.3" width="13" x="1.5" y="2.2" /><rect fill="currentColor" height="2.6" opacity=".7" rx="1.3" width="9" x="1.5" y="6.7" /><rect fill="currentColor" height="2.6" opacity=".45" rx="1.3" width="5" x="1.5" y="11.2" /></svg>
          </span>
          <div><strong className="brand">Fleet Queue Control</strong><span>Refinery operations</span></div>
        </div>
        <nav aria-label="Primary navigation">
          <p className="navigationLabel">Operations</p>
          {visibleNavigation.map((item) => {
            const Icon = item.icon;
            return (
              <a className={item.id === activeView ? "active" : undefined} href={`#${item.id}`} key={item.id}>
                <Icon size={17} /><span>{item.label}</span>
              </a>
            );
          })}
        </nav>
        {!demoMode ? <div className="accountState">
          <div className="accountIdentity">
            <span className="accountAvatar" aria-hidden="true">{(userEmail || "?").slice(0, 1).toUpperCase()}</span>
            <div><strong>{userEmail || "Signed-in staff"}</strong><small>{roles.map((role) => role.replace(/([A-Z])/g, " $1").replace(/^./, (value) => value.toUpperCase())).join(", ")}</small></div>
          </div>
          <button className="signOutButton" onClick={() => { if (auth) void signOut(auth); }} type="button"><LogOut size={15} />Sign out</button>
        </div> : null}
        <div className="environmentState"><span className={isDemoExperience ? "demoDot" : "liveDot"} /><div><strong>{isDemoExperience ? "Demonstration data" : "Firebase connected"}</strong><small>{isDemoExperience ? "Actions stay in this preview" : siteId}</small></div></div>
      </aside>

      <section className="content">
        {!demoMode ? <div className="contentTopBar"><NotificationBell siteId={siteId} userId={userId} /></div> : null}
        {dataMessage ? <p className="connectionMessage">{dataMessage}</p> : null}
        {deniedView ? <p className="accessDeniedNote" role="status">{deniedView} is not part of your access. Showing {visibleNavigation[0]?.label ?? "your workspace"} instead.</p> : null}
        {activeView === "my-bypass" ? <BypassWorkspace fleetOfficerId={userId} queue={queue} siteId={siteId} trucks={trucks} /> : null}
        {activeView === "my-fleet" ? <FleetWorkspace demoMode={demoMode} fleetOfficerId={userId} onTrucksChange={setTrucks} queue={queue} siteId={siteId} trucks={trucks} /> : null}
        {activeView === "overview" ? <OverviewScreen canViewAuditEvents={isDemoExperience || roles.some((role) => ["management", "auditor", "administrator"].includes(role))} canRecalculate={isDemoExperience || roles.some((role) => ["management", "administrator"].includes(role))} demoMode={demoMode} queue={queue} siteId={siteId} trucks={trucks} /> : null}
        {activeView === "staff" ? <StaffAccessScreen currentUserId={userId} siteId={siteId} /> : null}
        {activeView === "trucks" ? <TrucksScreen demoMode={demoMode} officers={officers} onTrucksChange={setTrucks} siteId={siteId} trucks={trucks} /> : null}
        {activeView === "insurance" ? <InsuranceScreen demoMode={demoMode} onTrucksChange={setTrucks} siteId={siteId} trucks={trucks} /> : null}
        {activeView === "queue" ? <QueueScreen queue={queue} /> : null}
        {activeView === "programming" ? <ProgrammingScreen queue={queue} siteId={siteId} /> : null}
        {activeView === "programmed" ? <ProgrammedScreen canConfirmDispatch={isDemoExperience || roles.some((role) => ["programmingOfficer", "administrator"].includes(role))} siteId={siteId} /> : null}
        {activeView === "orders" ? <OrdersScreen demoMode={demoMode} siteId={siteId} /> : null}
        {activeView === "bypass" ? <BypassScreen /> : null}
        {activeView === "audit" ? <AuditScreen demoMode={demoMode} siteId={siteId} /> : null}
      </section>
    </main>
  );
}
