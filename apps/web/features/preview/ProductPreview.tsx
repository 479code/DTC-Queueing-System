"use client";

import { useMemo, useState } from "react";
import { ArrowUpRight, Bell, CheckCircle2, ChevronRight, ClipboardCheck, Clock3, FileSpreadsheet, ListOrdered, MoreHorizontal, ShieldAlert, Truck, UserRound } from "lucide-react";

type PreviewRole = "Operations lead" | "Programming officer" | "Fleet officer";

const roleNavigation: Record<PreviewRole, string[]> = {
  "Operations lead": ["Command centre", "Live queue", "Bypass review", "Fleet health", "Audit trail"],
  "Programming officer": ["Programming desk", "Live queue", "Orders & ATCs", "Programming history"],
  "Fleet officer": ["My fleet", "Availability", "Bypass request", "My history"]
};

const queue = [
  { position: "01", truck: "KJA 482 XY", driver: "Abdullahi Musa", fleet: "Northern Link", wait: "2h 18m", state: "Ready" },
  { position: "02", truck: "KRD 915 AK", driver: "Yakubu Ibrahim", fleet: "Dantata Transport", wait: "2h 05m", state: "Ready" },
  { position: "03", truck: "FST 207 KL", driver: "Chinedu Okafor", fleet: "Rockwell Logistics", wait: "1h 42m", state: "Awaiting driver" },
  { position: "04", truck: "KNE 667 JD", driver: "Sani Mohammed", fleet: "Sahara Fleet", wait: "1h 21m", state: "Ready" }
];

export function ProductPreview() {
  const [role, setRole] = useState<PreviewRole>("Operations lead");
  const [activeNav, setActiveNav] = useState(roleNavigation[role][0]);
  const navigation = useMemo(() => roleNavigation[role], [role]);

  const changeRole = (nextRole: PreviewRole) => {
    setRole(nextRole);
    setActiveNav(roleNavigation[nextRole][0]);
  };

  return <main className="productPreview productPreviewV2">
    <aside className="previewSidebar">
      <div className="previewBrand"><div className="brandMark"><Truck size={19} /></div><div><strong>Refinery Flow</strong><span>Operations control</span></div></div>
      <div className="previewSite"><span className="livePulse" /> Kaduna depot <ChevronRight size={14} /></div>
      <nav aria-label="Preview navigation" className="previewNav">{navigation.map((item, index) => {
        const Icon = index === 0 ? ListOrdered : index === 1 ? ClipboardCheck : index === 2 ? FileSpreadsheet : index === 3 ? ShieldAlert : UserRound;
        return <button className={item === activeNav ? "active" : undefined} key={item} onClick={() => setActiveNav(item)} type="button"><Icon size={17} /><span>{item}</span></button>;
      })}</nav>
      <div className="previewSidebarFooter"><div className="previewUser"><span>OA</span><div><strong>Ola Adeyemi</strong><small>{role}</small></div><MoreHorizontal size={18} /></div></div>
    </aside>

    <section className="previewMain">
      <header className="previewTopbar"><div className="previewBreadcrumb"><span>Refinery operations</span><ChevronRight size={13} /><strong>{activeNav}</strong></div><div className="previewTopActions"><span className="previewDate">Tuesday, 16 September</span><button aria-label="Notifications" className="previewIconButton" type="button"><Bell size={18} /><i /></button><div className="previewAvatar">OA</div></div></header>
      <div className="previewBody">
        <section className="previewTitleRow"><div><p>Live operational view</p><h1>{role === "Programming officer" ? "Programming desk" : role === "Fleet officer" ? "My fleet" : "Queue control"}</h1><span>FIFO activity for Kaduna depot</span></div><div className="previewRoleSwitch" aria-label="Preview role"><span>Viewing as</span>{(Object.keys(roleNavigation) as PreviewRole[]).map((item) => <button className={item === role ? "selected" : undefined} key={item} onClick={() => changeRole(item)} type="button">{item.replace(" officer", "")}</button>)}</div></section>

        <section className="previewRunBanner" aria-label="Current FIFO programming run"><div className="runBannerCopy"><span>Current programming run</span><h2>Four trucks are next in line</h2><p>Three drivers have confirmed availability. One response is still due.</p></div><div className="runSequence"><div className="runSequenceLine" /><div className="runStep complete"><b>01</b><span>Ready</span></div><div className="runStep complete"><b>02</b><span>Ready</span></div><div className="runStep pending"><b>03</b><span>Awaiting</span></div><div className="runStep"><b>04</b><span>Queued</span></div></div><a href="#programming" className="runBannerAction"><span>Review batch</span><ArrowUpRight size={17} /></a></section>

        <section className="previewMetrics" aria-label="Operational summary">
          <div><span className="metricIcon queue"><ListOrdered size={18} /></span><span>Queued</span><strong>24</strong><small>4 ready now</small></div>
          <div><span className="metricIcon programmed"><ClipboardCheck size={18} /></span><span>Programmed today</span><strong>18</strong><small>All FIFO compliant</small></div>
          <div><span className="metricIcon time"><Clock3 size={18} /></span><span>Average wait</span><strong>2h 12m</strong><small>18 min below target</small></div>
          <div><span className="metricIcon attention"><ShieldAlert size={18} /></span><span>Needs attention</span><strong>3</strong><small>2 insurance, 1 bypass</small></div>
        </section>

        <div className="previewGrid">
          <section className="previewQueuePanel"><header><div><span>Next programming window</span><h2>FIFO queue</h2></div><a href="#programming">Open programming <ArrowUpRight size={15} /></a></header><div className="previewQueueHead"><span>Position</span><span>Truck and driver</span><span>Fleet</span><span>Wait</span><span>Status</span></div><div className="previewQueueRows">{queue.map((item, index) => <div className={index === 0 ? "previewQueueRow next" : "previewQueueRow"} key={item.position}><strong>{item.position}<small>{index === 0 ? "Next" : "FIFO"}</small></strong><div><b>{item.truck}</b><span>{item.driver}</span></div><span>{item.fleet}</span><span className="waitValue">{item.wait}</span><em className={item.state === "Ready" ? "ready" : "waiting"}>{item.state}</em></div>)}</div><footer><span><i /> Queue updates are live</span><button type="button">View full queue <ChevronRight size={15} /></button></footer></section>

          <aside className="previewSideStack">
            <section className="previewProgramCard"><div className="programCardTop"><span>Next action</span><Clock3 size={18} /></div><h2>Program the next 4 trucks</h2><p>All four have valid insurance. Three driver confirmations are already in.</p><div className="programProgress"><span><i /> 3 of 4 available</span><b>75%</b></div><a href="#programming">Review availability <ArrowUpRight size={15} /></a></section>
            <section className="previewAttention"><header><div><span>Attention required</span><h2>Three items need review</h2></div><button aria-label="View attention items" className="previewIconButton" type="button"><MoreHorizontal size={18} /></button></header><div><span className="attentionIcon insurance"><ShieldAlert size={16} /></span><p><b>Insurance expires today</b><small>KRD 915 AK · Dantata Transport</small></p><ChevronRight size={16} /></div><div><span className="attentionIcon bypass"><UserRound size={16} /></span><p><b>Bypass request pending</b><small>FST 207 KL · 22 min ago</small></p><ChevronRight size={16} /></div></section>
          </aside>
        </div>

        <section className="previewActivity"><header><div><span>Operational record</span><h2>Today&apos;s activity</h2></div><button type="button">View audit trail <ArrowUpRight size={15} /></button></header><div><div><span className="activityIcon complete"><CheckCircle2 size={17} /></span><p><b>ATC 0472438 assigned to KJA 482 XY</b><small>Programming officer · 09:42</small></p><em>Programmed</em></div><div><span className="activityIcon order"><FileSpreadsheet size={17} /></span><p><b>Order workbook received</b><small>2 ATCs available for allocation · 09:10</small></p><em>Orders</em></div><div><span className="activityIcon queue"><ListOrdered size={17} /></span><p><b>KRD 915 AK entered the FIFO queue</b><small>Fleet officer · 08:57</small></p><em>Queue</em></div></div>
        </section>
      </div>
    </section>
  </main>;
}
