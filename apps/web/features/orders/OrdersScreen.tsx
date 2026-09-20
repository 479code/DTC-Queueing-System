"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, FileCheck2, FileSpreadsheet, Inbox, LoaderCircle, Search, Upload } from "lucide-react";
import { StatusBadge } from "../operations/ui";
import { subscribeToOrderImports, subscribeToOrders, uploadOrders, type OrderImportView, type OrderView } from "./api";

export function OrdersScreen({ demoMode, siteId }: { demoMode: boolean; siteId: string }) {
  const [imports, setImports] = useState<OrderImportView[]>([]);
  const [orders, setOrders] = useState<OrderView[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const clear = (error: string) => setMessage(error);
    const stopImports = subscribeToOrderImports(siteId, demoMode, setImports, clear);
    const stopOrders = subscribeToOrders(siteId, demoMode, setOrders, clear);
    return () => { stopImports(); stopOrders(); };
  }, [demoMode, siteId]);
  const submit = async () => {
    if (!file) { setMessage("Choose the incoming order workbook first."); return; }
    setBusy(true); setMessage("");
    try { const result = await uploadOrders(siteId, file, demoMode); setMessage(`${file.name} imported with ${result.rowsProcessed} available order${result.rowsProcessed === 1 ? "" : "s"}.`); setFile(null); }
    catch (caught) { setMessage(caught instanceof Error ? caught.message : "Unable to import the order workbook."); }
    finally { setBusy(false); }
  };
  const visibleOrders = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return orders;
    return orders.filter((order) => [order.atcNo, order.salesOrderNo, order.dprpCustomerName, order.receivingCustomerName, order.state].some((value) => value.toLowerCase().includes(term)));
  }, [orders, search]);
  const totalVolume = orders.reduce((total, order) => total + (order.volume ?? 0), 0);
  const latestImport = imports[0];
  return <>
    <header className="pageCommandHeader"><div><p className="eyebrow success">Programming intake</p><h1>Orders &amp; ATCs ready for programming</h1><p>Imported ATC and sales-order pairs are held here until a confirmed FIFO truck receives one.</p></div><div className="ordersReadyCount"><Inbox size={18} /><div><span>Ready to assign</span><strong>{orders.length} orders</strong></div></div></header>
    {message ? <p className={message.includes("imported") ? "successMessage" : "message"}>{message}</p> : null}
    <section className="orderIntakeBoard" aria-label="Order workbook intake">
      <div className="orderIntakeIntro"><span><FileSpreadsheet size={21} /></span><div><p>Incoming order workbook</p><h2>Stage orders for the next FIFO run</h2><small>Required fields: ATC NO and SALES ORDER NO</small></div></div>
      <div className="orderIntakeAction"><label className="secondaryButton commandButton orderFileButton"><FileSpreadsheet size={16} /><span>{file?.name ?? "Select workbook"}</span><input accept=".xlsx" hidden onChange={(event) => setFile(event.target.files?.[0] ?? null)} type="file" /></label><button className="primaryButton commandButton" disabled={!file || busy} onClick={() => void submit()} type="button">{busy ? <LoaderCircle className="spin" size={16} /> : <Upload size={16} />}Import orders</button></div>
    </section>
    <section className="ordersLiveStrip" aria-label="Order intake summary">
      <div><span>Available ATCs</span><strong>{orders.length}</strong></div><i />
      <div><span>Available volume</span><strong>{totalVolume ? totalVolume.toLocaleString() : "--"}</strong></div><i />
      <div><span>Latest intake</span><strong>{latestImport?.uploadedAt ?? "No imports"}</strong></div><span className="ordersLiveState"><span /> Ready for programming</span>
    </section>
    <div className="ordersWorkspace ordersWorkbench">
      <section className="dataPanel orderRegister orderRegisterPanel">
        <div className="orderRegisterHeading"><div><span>Available order register</span><h2>{visibleOrders.length} order{visibleOrders.length === 1 ? "" : "s"} ready for a confirmed truck</h2><p>ATCs remain unassigned until programming is confirmed.</p></div><label className="searchField"><Search size={15} /><span className="visuallyHidden">Search available orders</span><input onChange={(event) => setSearch(event.target.value)} placeholder="Search orders" value={search} /></label></div>
        <div className="tableScroll"><table className="dataTable ordersTable"><colgroup><col className="colSubject" /><col className="colNum" /><col className="colName" /><col className="colWide" /><col className="colNum" /><col className="colWhen" /></colgroup>
          <thead><tr><th>ATC no.</th><th data-col="num">Sales order</th><th>DPRP customer</th><th>Receiving customer / station</th><th data-col="num">Volume</th><th data-col="when">Delivery date</th></tr></thead><tbody>{visibleOrders.map((order) => <tr key={order.id}><td><strong>{order.atcNo}</strong><span>Ready to assign</span></td><td><strong>{order.salesOrderNo}</strong></td><td>{order.dprpCustomerName}</td><td><strong>{order.receivingCustomerName}</strong><span>{order.state || "Location not recorded"}</span></td><td>{order.volume ? order.volume.toLocaleString() : "Not recorded"}</td><td>{order.expectedDeliveryDate || "Not recorded"}</td></tr>)}</tbody></table></div>
        {!visibleOrders.length ? <div className="orderEmpty"><Search size={20} /><strong>No available order matches</strong><span>Try a different ATC, order number or customer.</span></div> : null}
      </section>
      <aside className="dataPanel orderHistory orderHistoryPanel">
        <div className="orderHistoryHeading"><span>Workbook record</span><h2>Recent intake</h2><p>Every processed workbook is retained.</p></div>
        <div className="orderHistoryList">{imports.map((item) => <div className="orderHistoryRow" key={item.id}><div className="orderHistoryIcon"><FileCheck2 size={16} /></div><div><strong>{item.originalFileName}</strong><span>{item.rowsProcessed} order{item.rowsProcessed === 1 ? "" : "s"} · {item.uploadedAt}</span></div><StatusBadge value={item.status} /></div>)}</div>
        {!imports.length ? <p className="empty">No workbooks have been imported.</p> : null}
        <div className="orderHistoryFooter"><span>View audit trail</span><ArrowUpRight size={15} /></div>
      </aside>
    </div>
  </>;
}
