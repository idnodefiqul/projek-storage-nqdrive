import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect, type ReactNode } from "react";
import { HardDrive, File, Folder as FolderIcon, Download, BarChart3, Globe, Upload, Database, FileText, ArrowUpRight, Activity as ActivityIcon, FolderKanban, Users, DownloadCloud } from "lucide-react";
import { motion } from "framer-motion";
import { formatBytes } from "@nqdrive/shared";
import { useDashboardMetrics, useDashboardAnalytics, type AccountStorageInfo, type CountryDownload } from "../hooks/use-dashboard";
import { useMinLoading } from "../hooks/use-min-loading";
import type { FileEntity, Folder } from "@nqdrive/types";
import { PageTransition } from "../components/page-transition";
import { DashboardIndexSkeleton } from "../components/skeletons";
import ReactECharts from "echarts-for-react";
import * as echarts from "echarts";
import { cn } from "@nqdrive/ui";
import { SiDropbox } from "@icons-pack/react-simple-icons";
import { googleDriveSvg, onedriveSvg, cloudflareR2Svg, amazonS3Svg } from "../assets";
import { getFileTypeInfo } from "../lib/file-icons";

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.015, delayChildren: 0 } } };
const item = { hidden: { opacity: 0 }, show: { opacity: 1, y: 0, transition: { duration: 0.16, ease: [0.22, 1, 0.36, 1] as const } } };
export const Route = createFileRoute("/dashboard/")({ component: DashboardOverviewPage });

function maskEmail(email: string){ const [l,d]=email.split("@"); if(!l||!d) return email; if(l.length<=4) return l[0]+"***@"+d; return l.substring(0,4)+"***@"+d; }
const ACCOUNT_COLORS=["#6366f1","#10b981","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#ec4899","#84cc16","#f97316","#14b8a6"];

const bentoBase="relative flex flex-col overflow-hidden rounded-[16px] border border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface))] shadow-[var(--shadow-card)]";
const bentoBaseHover="transition-all duration-300 hover:shadow-[var(--shadow-float)] hover:border-brand-200/60 dark:hover:border-brand-500/20";

const PROVIDER_LABEL: Record<string, string> = {
  google_drive: "Google Drive",
  dropbox: "Dropbox",
  onedrive: "OneDrive",
  cloudflare_r2: "Cloudflare R2",
  amazon_s3: "Amazon S3",
  backblaze_b2: "Backblaze B2",
  wasabi: "Wasabi",
  minio: "MinIO",
  telegram: "Telegram",
};
const PROVIDER_ICON_SRC: Partial<Record<string, string>> = {
  google_drive: googleDriveSvg,
  onedrive: onedriveSvg,
  cloudflare_r2: cloudflareR2Svg,
  amazon_s3: amazonS3Svg,
};
// Warna background per provider biar beda jelas meski email sama
const PROVIDER_BG: Record<string, string> = {
  google_drive: "bg-white",
  onedrive: "bg-blue-50 dark:bg-blue-950/30",
  dropbox: "bg-[#EFF4FF] dark:bg-blue-950/20",
  cloudflare_r2: "bg-orange-50 dark:bg-orange-950/20",
  amazon_s3: "bg-amber-50 dark:bg-amber-950/20",
};
const PROVIDER_RING: Record<string, string> = {
  google_drive: "ring-green-200 dark:ring-green-800",
  onedrive: "ring-blue-200 dark:ring-blue-800",
  dropbox: "ring-[#0061FF]/20",
  cloudflare_r2: "ring-orange-200 dark:ring-orange-800",
  amazon_s3: "ring-amber-200 dark:ring-amber-800",
};

function ProviderGlyph({ provider, className }: { provider: string; className?: string }) {
  const p = (provider ?? "").toString().toLowerCase().trim();
  // Explicit bedakan tiap provider — jangan fallback ke google
  if (p === "dropbox") return <SiDropbox color="#0061FF" className={cn("shrink-0", className)} />;
  if (p === "onedrive" || p === "one_drive") return <img src={onedriveSvg} alt="OneDrive" className={cn("object-contain shrink-0", className)} />;
  if (p === "google_drive" || p === "gdrive" || p === "google") return <img src={googleDriveSvg} alt="Google Drive" className={cn("object-contain shrink-0", className)} />;
  if (p === "cloudflare_r2" || p === "r2") return <img src={cloudflareR2Svg} alt="Cloudflare R2" className={cn("object-contain shrink-0", className)} />;
  if (p === "amazon_s3" || p === "s3" || p.includes("amazon")) return <img src={amazonS3Svg} alt="Amazon S3" className={cn("object-contain shrink-0", className)} />;
  // Fallback: tampilkan huruf awal provider + HardDrive, bukan google
  if (!p) return <HardDrive className={cn("text-[rgb(var(--ink-500))] shrink-0", className)} />;
  return (
    <span className={cn("grid place-items-center rounded-full bg-[rgb(var(--surface-muted))] text-[10px] font-bold uppercase text-[rgb(var(--ink-500))] shrink-0", className)} title={provider}>
      {p.slice(0,2).toUpperCase()}
    </span>
  );
}

function VolumeBentoCard({accounts}:{accounts:AccountStorageInfo[]}){
  const used=accounts.reduce((s,a)=>s+(a.usedStorageBytes||0),0);
  const quota=accounts.reduce((s,a)=>s+(a.totalStorageBytes||0),0);
  const pct=quota>0?(used/quota)*100:0;
  const remain=Math.max(0,quota-used);
  const status = (pct>=90?"critical":pct>=75?"warning":"optimal") as "optimal"|"warning"|"critical";
  const segs=useMemo(()=>[{l:"Media",v:46,c:"var(--color-brand-500)"},{l:"Dokumen",v:28,c:"var(--color-brand-300)"},{l:"Arsip",v:16,c:"var(--color-accent-500)"},{l:"Lainnya",v:10,c:"rgb(var(--surface-muted))"}],[]);
  return (
    <div className={cn(bentoBase,bentoBaseHover,"h-full p-5 sm:p-6")}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <Database className="h-5 w-5 text-[var(--brand-a)]" strokeWidth={2.5}/>
          <div className="leading-tight">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[rgb(var(--ink-500))]">Volume Terpakai</p>
            <p className="mt-0.5 text-[12px] font-medium text-[rgb(var(--ink-500))]">{accounts.length} akun terhubung</p>
          </div>
        </div>
        <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ring-1", status==="critical"?"bg-red-500/10 text-red-600 ring-red-500/20 dark:text-red-300":status==="warning"?"bg-amber-500/10 text-amber-600 ring-amber-500/20 dark:text-amber-300":"bg-emerald-500/10 text-emerald-600 ring-emerald-500/15 dark:text-emerald-300")}><span className={cn("h-1.5 w-1.5 rounded-full",status==="critical"?"bg-red-500":status==="warning"?"bg-amber-500":"bg-emerald-500")}/>{status==="critical"?"Penuh":status==="warning"?"Hampir penuh":"Optimal"}</span>
      </div>
      <div className="mt-6 flex items-baseline gap-2"><span className="font-mono text-[40px] font-[800] leading-none tracking-[-0.03em] text-[rgb(var(--foreground))] tabular-nums">{(used/(1024*1024*1024)).toFixed(1)}</span><span className="font-mono text-[14px] font-bold text-[rgb(var(--ink-500))]">GB</span><span className="ml-2 text-[13px] text-[rgb(var(--ink-500))]">/ {formatBytes(quota||0)}</span></div>
      <div className="mt-5 flex h-[10px] w-full gap-[3px] overflow-hidden rounded-full bg-[rgb(var(--surface-muted))] p-[2px] ring-1 ring-[rgb(var(--border-subtle))]/60">{used>0?segs.map(s=><div key={s.l} className="h-full rounded-full transition-all" style={{width:s.v+"%",background:s.c}}/>):<div className="h-full w-full rounded-full bg-brand-500/20"/>}</div>
      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap gap-3">{segs.map(s=><span key={s.l} className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[rgb(var(--ink-500))]"><span className="h-2 w-2 rounded-full" style={{background:s.c}}/> {s.l} {s.v}%</span>)}</div><span className="font-mono text-[11px] font-medium text-[rgb(var(--ink-500))] tabular-nums">Sisa {formatBytes(remain)}</span></div>
    </div>
  );
}
function MiniBarChart({data,colorClass="bg-[var(--brand-a)]",compact,small}:{data:number[]; colorClass?:string; compact?:boolean; small?:boolean}){
  if(!data.length) return null;
  const max=Math.max(...data);
  if(max===0) return null;
  const sliced=data.length>7?data.slice(-7):data;
  const sorted=[...sliced].sort((a,b)=>a-b);
  const maxS=Math.max(...sorted);
  const h = small ? "h-6 sm:h-7 lg:h-10 xl:h-11" : compact ? "h-8 lg:h-12" : "h-12";
  const gap = small ? "gap-1 lg:gap-1.5" : "gap-1.5";
  return <div className={cn("mt-auto flex w-full items-end",h,gap)}>{sorted.map((v,i)=><div key={i} className={cn("flex-1 rounded-[3px] transition-all",colorClass)} style={{height:Math.max((v/maxS)*100,22)+"%"}}/> )}</div>;
}
function SquareStatCard({label,value,sub,icon:Icon,trend,chartData,chartColor}:{label:string; value:ReactNode; sub?:string; icon:any; trend?:{v:string; up?:boolean}; chartData?:number[]; chartColor?:string}){
  const hasChart=!!(chartData&&chartData.length>0);
  return (
    <div className={cn(bentoBase,bentoBaseHover,"flex h-full min-h-[132px] flex-col p-3 sm:min-h-[138px] lg:min-h-0 lg:p-4 xl:p-5")}>
      <div className="flex items-start justify-between gap-1.5">
        <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[rgb(var(--ink-500))] leading-tight line-clamp-2 lg:text-[10px]">{label}</p>
        <Icon className="h-5 w-5 shrink-0 text-[var(--brand-a)] lg:h-6 lg:w-6" strokeWidth={2.5}/>
      </div>
      <div className="flex flex-1 flex-col justify-center py-2 lg:py-3">
        <p className="font-mono text-[19px] font-[800] leading-none tracking-[-0.02em] text-[rgb(var(--foreground))] tabular-nums sm:text-[20px] lg:text-[26px] xl:text-[28px]">{value}</p>
        <div className="mt-2 flex min-h-[22px] flex-wrap items-center gap-1 lg:mt-2.5 lg:min-h-[24px] lg:gap-1.5">
          {sub&&<span className="text-[10px] leading-tight text-[rgb(var(--ink-500))] line-clamp-1 lg:text-[11px]">{sub}</span>}
          {trend
            ? <span className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold lg:px-2 lg:py-0.5 lg:text-[10px]",trend.up?"bg-emerald-500/10 text-emerald-600 dark:text-emerald-300":"bg-red-500/10 text-red-600 dark:text-red-300")}><ArrowUpRight className={cn("h-2.5 w-2.5 lg:h-3 lg:w-3",!trend.up&&"rotate-90")}/> {trend.v}</span>
            : <span className="hidden h-[18px] lg:block" aria-hidden />
          }
        </div>
      </div>
      <div className="mt-1 h-6 w-full shrink-0 sm:h-7 lg:mt-2 lg:h-10 xl:h-11">
        {hasChart
          ? <MiniBarChart compact small data={chartData!} colorClass={chartColor}/>
          : <div className="h-full w-full" aria-hidden />
        }
      </div>
    </div>
  );
}
function TotalFileBerandaCard({value}:{value:ReactNode}){
  return (
    <div className={cn(bentoBase,bentoBaseHover,"group relative flex h-full min-h-[132px] cursor-pointer flex-col items-center justify-center overflow-hidden p-4 text-center sm:min-h-[138px] lg:min-h-0 lg:p-5 xl:p-6")}>
      <div className="mb-3 text-[var(--brand-b)] opacity-80 lg:mb-4"><FolderKanban className="h-9 w-9 sm:h-10 sm:w-10 lg:h-11 lg:w-11 xl:h-12 xl:w-12" strokeWidth={1.8} /></div>
      <h3 className="font-mono text-[26px] font-[800] leading-none tracking-[-0.02em] text-[rgb(var(--foreground))] tabular-nums sm:text-[28px] lg:text-[30px] xl:text-[32px]">{value}</h3>
      <p className="mt-2.5 text-[9px] font-bold uppercase tracking-[0.16em] text-[rgb(var(--ink-500))]/70 lg:mt-3 lg:text-[10px]">Total File</p>
      <span className="pointer-events-none absolute bottom-0 left-1/2 h-[4px] w-1/3 -translate-x-1/2 rounded-t-full bg-[var(--brand-b)] opacity-70" />
    </div>
  );
}
function AkunOnlineBerandaCard({online,total}:{online:number; total:number}){
  return (
    <div className={cn(bentoBase,bentoBaseHover,"group relative flex h-full min-h-[132px] cursor-pointer flex-col items-center justify-center overflow-hidden p-4 text-center sm:min-h-[138px] lg:min-h-0 lg:p-5 xl:p-6")}>
      <span className="absolute right-3 top-3 grid place-items-center lg:right-3.5 lg:top-3.5"><span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"/><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"/></span></span>
      <div className="mb-3 text-[var(--brand-a)] opacity-80 lg:mb-4"><Users className="h-9 w-9 sm:h-10 sm:w-10 lg:h-11 lg:w-11 xl:h-12 xl:w-12" strokeWidth={1.8} /></div>
      <h3 className="flex items-baseline justify-center font-mono text-[26px] font-[800] leading-none tracking-[-0.02em] text-[rgb(var(--foreground))] tabular-nums sm:text-[28px] lg:text-[30px] xl:text-[32px]">{online}<span className="ml-0.5 font-medium text-[rgb(var(--ink-500))]/60 text-[16px] sm:text-[18px] lg:text-[18px] xl:text-[20px]">/{total}</span></h3>
      <p className="mt-2.5 text-[9px] font-bold uppercase tracking-[0.16em] text-[rgb(var(--ink-500))]/70 lg:mt-3 lg:text-[10px]">Akun Online</p>
      <span className="pointer-events-none absolute bottom-0 left-1/2 h-[4px] w-1/3 -translate-x-1/2 rounded-t-full bg-[var(--brand-a)] opacity-70" />
    </div>
  );
}

function TrendBentoCard({period,onPeriodChange}:{period:7|30|90; onPeriodChange:(p:7|30|90)=>void}){
  const {data:analytics,isLoading}=useDashboardAnalytics(period);
  const [themeTick,setThemeTick]=useState(0);
  useEffect(()=>{ let t:ReturnType<typeof setTimeout>|null=null; const obs=new MutationObserver(()=>{ if(t) clearTimeout(t); t=setTimeout(()=>setThemeTick(n=>n+1),600); }); obs.observe(document.documentElement,{attributes:true,attributeFilter:["class","style"]}); return()=>{ obs.disconnect(); if(t) clearTimeout(t); }; },[]);
  const {chartData,totalDl,totalUp}=useMemo(()=>{
    const raw=analytics?.chartData??[];
    const data=raw.map(d=>({name:new Date(d.date+"T00:00:00").toLocaleDateString("id-ID",{day:"2-digit",month:"short"}), dl:d.downloads, up:d.uploads}));
    return {chartData:data,totalDl:data.reduce((s,d)=>s+d.dl,0),totalUp:data.reduce((s,d)=>s+d.up,0)};
  },[analytics]);
  const themeColors=useMemo(()=>{
    if(typeof document==="undefined") return {brandA:"#0f9f9a",brandB:"#06b6d4",border:"rgba(224,229,236,1)",ink:"rgba(91,100,114,1)",fg:"#11141a",isDark:false};
    const cs=getComputedStyle(document.documentElement);
    const get=(n:string)=>cs.getPropertyValue(n).trim();
    const isDark=document.documentElement.classList.contains("dark");
    const brandA=get("--brand-a")||get("--color-brand-500")||"#0f9f9a";
    const brandB=get("--brand-b")||get("--color-brand-300")||"#06b6d4";
    const borderTriplet=get("--border-subtle")||"224 229 236";
    const inkTriplet=get("--ink-500")||"91 100 114";
    const fgTriplet=get("--foreground")||"17 20 26";
    return {brandA,brandB,border:"rgb("+borderTriplet+")",ink:"rgb("+inkTriplet+")",fg:"rgb("+fgTriplet+")",isDark};
  },[themeTick]);
  const echartOption=useMemo(()=>{
    if(!chartData.length) return null;
    const dataset=[{id:"raw",dimensions:["name","dl","up"],source:chartData.map(d=>[d.name,d.dl,d.up])},{id:"filtered",fromDatasetId:"raw",transform:{type:"filter" as const,config:{dimension:"dl",gte:0}}}];
    return {
      backgroundColor:"transparent",dataset,
      tooltip:{trigger:"axis",backgroundColor:themeColors.isDark?"rgb(30 32 38)":"rgb(255 255 255)",borderWidth:1,borderColor:themeColors.border,textStyle:{color:themeColors.fg,fontSize:12},axisPointer:{type:"line",lineStyle:{color:themeColors.border}}},
      legend:{show:false},grid:{left:16,right:12,top:8,bottom:28,containLabel:true},
      xAxis:{type:"category",data:chartData.map(d=>d.name),axisLine:{show:false},axisTick:{show:false},axisLabel:{color:themeColors.ink,fontSize:11},splitLine:{show:false}},
      yAxis:{type:"value",axisLine:{show:false},axisTick:{show:false},axisLabel:{color:themeColors.ink,fontSize:11},splitLine:{lineStyle:{color:themeColors.border,type:"dashed" as const,opacity:0.6}}},
      series:[
        {name:"Download",type:"line",smooth:true,datasetId:"filtered",encode:{x:"name",y:"dl"},lineStyle:{width:2.5,color:themeColors.brandA},itemStyle:{color:themeColors.brandA},areaStyle:{color:new echarts.graphic.LinearGradient(0,0,0,1,[{offset:0,color:themeColors.brandA+"33"},{offset:1,color:themeColors.brandA+"02"}])},showSymbol:false},
        {name:"Upload",type:"line",smooth:true,datasetId:"raw",encode:{x:"name",y:"up"},lineStyle:{width:2.5,color:themeColors.brandB},itemStyle:{color:themeColors.brandB},areaStyle:{color:new echarts.graphic.LinearGradient(0,0,0,1,[{offset:0,color:themeColors.brandB+"33"},{offset:1,color:themeColors.brandB+"02"}])},showSymbol:false},
      ],
    } as any;
  },[chartData,themeColors]);
  const periods=[{v:7 as const,l:"7H"},{v:30 as const,l:"30H"},{v:90 as const,l:"90H"}];
  return (
    <div className={cn(bentoBase,bentoBaseHover,"flex h-full min-h-[300px] flex-col p-0 lg:min-h-[320px]")}>
      <div className="flex items-center justify-between gap-3 border-b border-[rgb(var(--border-subtle))] px-5 py-3.5"><div className="flex items-center gap-2.5"><ActivityIcon className="h-5 w-5 text-[var(--brand-a)]" strokeWidth={2.5}/><div className="leading-tight"><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[rgb(var(--ink-500))]">Analitik</p><p className="font-display text-[13px] font-bold text-[rgb(var(--foreground))]">Tren Data Lintas Jaringan</p></div></div><div className="flex items-center gap-1 rounded-[10px] border border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface-muted))]/70 p-1">{periods.map(p=><button key={p.v} onClick={()=>onPeriodChange(p.v)} className={cn("rounded-[7px] px-2.5 py-1 text-[11px] font-bold transition",period===p.v?"bg-[rgb(var(--surface))] text-[rgb(var(--foreground))] shadow-[var(--shadow-card)] ring-1 ring-[rgb(var(--border-subtle))]":"text-[rgb(var(--ink-500))] hover:text-[rgb(var(--foreground))]")}>{p.l}</button>)}</div></div>
      <div className="flex flex-wrap gap-x-6 gap-y-2 px-5 pt-3"><div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{background:themeColors.brandA}}/><span className="text-[11px] font-bold uppercase tracking-wide text-[rgb(var(--ink-500))]">Download</span><span className="font-mono text-[13px] font-bold text-[rgb(var(--foreground))] tabular-nums">{totalDl.toLocaleString("id-ID")}</span></div><div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{background:themeColors.brandB}}/><span className="text-[11px] font-bold uppercase tracking-wide text-[rgb(var(--ink-500))]">Upload</span><span className="font-mono text-[13px] font-bold text-[rgb(var(--foreground))] tabular-nums">{totalUp.toLocaleString("id-ID")}</span></div></div>
      <div className="min-h-[200px] w-full flex-1 px-1 pb-2 pt-1 sm:min-h-[210px] lg:min-h-[200px]">{isLoading?<div className="h-full min-h-[200px] animate-pulse rounded-xl bg-[rgb(var(--surface-muted))]"/>:chartData.length===0||!echartOption?<div className="flex h-full min-h-[200px] items-center justify-center text-sm text-[rgb(var(--ink-500))]">Belum ada data aktivitas.</div>:<ReactECharts option={echartOption as any} style={{height:"100%",width:"100%",minHeight:200}} opts={{renderer:"canvas"}}/>}</div>
    </div>
  );
}
function CountriesBentoCard({countries}:{countries:CountryDownload[]}){
  const list=countries;
  const countryName=useMemo(()=>{ try{ return new Intl.DisplayNames(["id"],{type:"region"}); }catch{ return null; } },[]);
  return (
    <div className={cn(bentoBase,bentoBaseHover,"relative flex h-full min-h-0 max-h-[320px] flex-col p-4 lg:max-h-[320px] lg:p-5")}>
      <div className="mb-3 shrink-0">
        <h3 className="flex items-center gap-2 font-display text-[15px] font-bold text-[rgb(var(--foreground))]">
          <BarChart3 className="h-4 w-4 text-[var(--brand-a)]" strokeWidth={2.5}/>
          Top Regions Download
        </h3>
        <p className="mt-0.5 text-[11px] text-[rgb(var(--ink-500))]">Unduhan Berdasarkan Negara</p>
      </div>
      <div className="-mr-2 min-h-0 max-h-[220px] flex-1 overflow-y-auto pr-2 scrollbar-hide">
        {list.length===0?(
          <div className="flex h-full min-h-[100px] flex-col items-center justify-center text-center"><Globe className="h-6 w-6 text-[rgb(var(--border-subtle))]"/><p className="mt-2 text-[11px] text-[rgb(var(--ink-500))]">Belum ada data negara</p></div>
        ):(
          <ul className="flex flex-col gap-1">
            {list.slice(0,5).map((c,i)=>{
              const tier=i===0?1:i<4?2:3;
              const badgeStyle=tier===1
                ?"bg-brand-500/10 text-brand-600 font-bold ring-1 ring-brand-500/15 dark:text-brand-300"
                :tier===2
                ?"bg-[rgb(var(--surface-muted))] text-[rgb(var(--ink-500))] font-semibold ring-1 ring-[rgb(var(--border-subtle))]"
                :"bg-[rgb(var(--surface-muted))]/70 text-[rgb(var(--ink-500))]/80 font-semibold ring-1 ring-[rgb(var(--border-subtle))]/70";
              const name=countryName?.of(c.country.toUpperCase())??c.country.toUpperCase();
              return (
                <li key={c.country} className="group flex cursor-pointer items-center justify-between rounded-xl border border-transparent p-2 transition-colors hover:border-[rgb(var(--border-subtle))]/70 hover:bg-[rgb(var(--surface-muted))]/60">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full border border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface-muted))] shadow-sm transition-transform group-hover:scale-105">
                      <img src={"https://flagcdn.com/w80/"+c.country.toLowerCase()+".png"} srcSet={"https://flagcdn.com/w80/"+c.country.toLowerCase()+".png 1x, https://flagcdn.com/w160/"+c.country.toLowerCase()+".png 2x"} alt={c.country} className="h-full w-full object-cover" loading="lazy" onError={(e)=>((e.target as HTMLImageElement).style.display="none")}/>
                    </div>
                    <span className={cn("truncate text-[12px] text-[rgb(var(--foreground))]",tier===1?"font-semibold":"font-medium")}>{name}</span>
                  </div>
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] tabular-nums",badgeStyle)}>{c.count}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-5 rounded-b-[16px] bg-gradient-to-t from-[rgb(var(--surface))] to-transparent"/>
    </div>
  );
}

function PolarBentoCard({accounts}:{accounts:AccountStorageInfo[]}){
  // Filter telegram yang sudah dihapus user — jangan tampil di distribusi
  const filteredAccounts = useMemo(()=>accounts.filter(a=> (a as any).provider !== "telegram"),[accounts]);
  const totalUsed=useMemo(()=>filteredAccounts.reduce((s,a)=>s+(a.usedStorageBytes||0),0),[filteredAccounts]);
  // JANGAN dedup by email — 1 email boleh beda provider (GDrive + Dropbox + OneDrive) harus muncul semua
  // FIX: tampilkan semua akun kecuali telegram, bukan cuma 6. Scroll sudah ada.
  const sorted=useMemo(()=>[...filteredAccounts].sort((a,b)=>(b.usedStorageBytes||0)-(a.usedStorageBytes||0)),[filteredAccounts]);
  return (
    <div className={cn(bentoBase,bentoBaseHover,"relative flex h-full min-h-0 max-h-[320px] flex-col p-4 lg:max-h-[320px] lg:p-5")}>
      <div className="mb-3 flex shrink-0 items-center justify-between">
        <div>
          <h3 className="flex items-center gap-2 font-display text-[15px] font-bold text-[rgb(var(--foreground))]">
            <Users className="h-4 w-4 text-[var(--brand-a)]" strokeWidth={2.5}/>
            Distribusi
          </h3>
          <p className="mt-0.5 text-[11px] text-[rgb(var(--ink-500))]">Porsi penyimpanan tiap akun • {sorted.length} terhubung</p>
        </div>
      </div>
      <div className="-mr-2 min-h-0 max-h-[220px] flex-1 overflow-y-auto pb-2 pr-2 scrollbar-thin">
        {sorted.length===0?(
          <div className="flex h-full min-h-[100px] flex-col items-center justify-center text-center"><HardDrive className="h-6 w-6 text-[rgb(var(--border-subtle))]"/><p className="mt-2 text-[11px] text-[rgb(var(--ink-500))]">Belum ada akun.</p></div>
        ):(
          <div className="flex flex-col gap-2.5">
            {sorted.map((a,i)=>{
              const color=ACCOUNT_COLORS[i%ACCOUNT_COLORS.length]!;
              const pct=totalUsed>0?Math.round(((a.usedStorageBytes||0)/totalUsed)*100):0;
              const masked=maskEmail(a.email);
              // FIX: jangan fallback ke google_drive kalau provider kosong — biar keliatan beda
              const rawProv = (a as any).provider as string | undefined;
              const prov = (rawProv ?? "").toString().trim().toLowerCase() || "unknown";
              const label = PROVIDER_LABEL[prov] ?? (rawProv ? rawProv : "Unknown");
              const shortLabel = prov==="google_drive" ? "GDrive" : prov==="onedrive" ? "OneDrive" : prov==="dropbox" ? "Dropbox" : prov==="cloudflare_r2" ? "R2" : prov==="amazon_s3" ? "S3" : label;
              const bg = PROVIDER_BG[prov] ?? "bg-[rgb(var(--surface))]";
              const ring = PROVIDER_RING[prov] ?? "ring-[rgb(var(--border-subtle))]";
              const key = (a as any).id ? `${(a as any).id}-${prov}-${i}` : `${a.email}-${prov}-${i}`;
              return (
                <div key={key} className="group flex cursor-pointer items-center gap-2.5 rounded-xl border border-transparent p-1.5 -mx-1.5 transition hover:border-[rgb(var(--border-subtle))]/60 hover:bg-[rgb(var(--surface-muted))]/60" title={`${a.email} | provider=${prov} | ${label} | ${formatBytes(a.usedStorageBytes||0)}`}>
                  {/* Ring + Provider Icon — BEDA JELAS PER PROVIDER */}
                  <div className={cn("relative grid h-9 w-9 shrink-0 place-items-center rounded-full ring-1 transition-transform group-hover:scale-105", ring)} style={{background:`conic-gradient(${color} ${Math.max(pct,10)}%, rgb(var(--surface-muted)) 0)`}}>
                    <div className={cn("grid h-[30px] w-[30px] place-items-center overflow-hidden rounded-full border-2 border-[rgb(var(--surface))] shadow-sm", bg)}>
                      <ProviderGlyph provider={prov} className="h-[18px] w-[18px]" />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold leading-tight text-[rgb(var(--foreground))]">
                        <span className="min-w-0 truncate" title={`${a.email} (${label})`}>{masked}</span>
                        <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide ring-1", 
                          prov==="google_drive" ? "bg-green-50 text-green-700 ring-green-200 dark:bg-green-950/30 dark:text-green-300 dark:ring-green-800" :
                          prov==="onedrive" ? "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:ring-blue-800" :
                          prov==="dropbox" ? "bg-[#E8F0FF] text-[#0061FF] ring-[#0061FF]/20 dark:bg-blue-950/30 dark:text-blue-300" :
                          "bg-[rgb(var(--surface-muted))] text-[rgb(var(--ink-500))] ring-[rgb(var(--border-subtle))]"
                        )}>
                          <ProviderGlyph provider={prov} className="h-[10px] w-[10px]" />
                          {shortLabel}
                        </span>
                      </h4>
                      <span className="shrink-0 text-[11px] font-bold tabular-nums text-[rgb(var(--foreground))]">{pct}%</span>
                    </div>
                    <p className="mt-0.5 flex items-center gap-1 text-[10px] leading-tight text-[rgb(var(--ink-500))]">
                      <span>{formatBytes(a.usedStorageBytes||0)}</span>
                      <span className="h-0.5 w-0.5 rounded-full bg-[rgb(var(--ink-500))]/40"/>
                      <span className="truncate font-medium">{label}</span>
                      {rawProv && rawProv!==prov && <span className="text-[8px] text-amber-600">({rawProv})</span>}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-6 rounded-b-[16px] bg-gradient-to-t from-[rgb(var(--surface))] to-transparent"/>
    </div>
  );
}

// ── PREMIUM Populer HORIZONTAL + pagination 5 per page ──
function TopDlBentoCard({files}:{files:FileEntity[]}){
  const sorted = useMemo(()=>[...files].sort((a,b)=>b.downloadCount-a.downloadCount).slice(0,15),[files]);
  const maxDl = useMemo(()=>Math.max(...sorted.map(f=>f.downloadCount),1),[sorted]);
  const totalDl = useMemo(()=>files.reduce((s,f)=>s+f.downloadCount,0),[files]);
  const [page, setPage] = useState(1);
  const perPage = 5;
  const totalPages = Math.max(1, Math.ceil(sorted.length / perPage));
  useEffect(()=>{ setPage(1); }, [files.length]);
  const paged = useMemo(()=>sorted.slice((page-1)*perPage, page*perPage),[sorted, page]);

  return (
    <div className={cn(bentoBase,bentoBaseHover,"relative flex h-full min-h-[380px] flex-col overflow-hidden p-4 lg:min-h-[420px] lg:p-5")}>
      <div className="pointer-events-none absolute -top-24 -right-24 h-48 w-48 rounded-full bg-[var(--brand-a)]/10 blur-[40px]" />
      <div className="pointer-events-none absolute -bottom-24 -left-24 h-48 w-48 rounded-full bg-[var(--brand-b)]/10 blur-[40px]" />

      <div className="relative mb-3 flex shrink-0 items-start justify-between gap-2 border-b border-[rgb(var(--border-subtle))]/40 pb-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 font-display text-[14px] font-bold tracking-[-0.01em] text-[rgb(var(--foreground))] lg:text-[15px]">
            <DownloadCloud className="h-4 w-4 text-[var(--brand-a)]" strokeWidth={2.5}/>
            Populer
            <span className="ml-1 rounded-full bg-[var(--brand-a)]/10 px-1.5 py-0.5 text-[9px] font-bold text-[var(--brand-a)] ring-1 ring-[var(--brand-a)]/15">{sorted.length}</span>
          </h3>
          <p className="mt-0.5 text-[10px] text-[rgb(var(--ink-500))]">Top download list file • {sorted.length} file</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[8px] font-bold uppercase tracking-[0.14em] text-[rgb(var(--ink-500))]/70">Total Unduhan</p>
          <span className="mt-0.5 block bg-gradient-to-br from-[var(--brand-a)] to-[var(--color-brand-600)] bg-clip-text font-mono text-[20px] font-[800] leading-none text-transparent tabular-nums lg:text-[22px]">{totalDl.toLocaleString("id-ID")}</span>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
        {sorted.length===0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[rgb(var(--surface-muted))] ring-1 ring-[rgb(var(--border-subtle))]"><DownloadCloud className="h-4 w-4 text-[rgb(var(--ink-500))]/50"/></span>
            <p className="text-[12px] font-medium text-[rgb(var(--ink-500))]">Belum ada unduhan</p>
            <p className="text-[10px] text-[rgb(var(--ink-500))]/70">File populer akan muncul di sini</p>
          </div>
        ) : (
          <div className="flex flex-1 flex-col gap-3">
            {paged.map((f, idx)=>{
              const globalIdx = (page-1)*perPage + idx;
              const widthPct = Math.max((f.downloadCount/maxDl)*100, 8);
              const typeInfo = getFileTypeInfo(f.filename);
              const Icon = typeInfo.Icon;
              const isTop = globalIdx===0;
              const isTop3 = globalIdx<3;
              return (
                <motion.div
                  key={f.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx*0.04, duration: 0.35, ease: [0.22,1,0.36,1] as const }}
                  className="group flex cursor-pointer items-center gap-2.5"
                  title={`${f.filename} • ${f.downloadCount} DL`}
                >
                  <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-bold tabular-nums ring-1",
                    isTop ? "bg-gradient-to-br from-amber-300 to-amber-500 text-white ring-amber-200 shadow-[0_2px_8px_rgba(245,158,11,0.4)]" :
                    isTop3 ? "bg-[var(--brand-a)] text-white ring-[var(--brand-a)]/20" :
                    "bg-[rgb(var(--surface-muted))] text-[rgb(var(--ink-500))] ring-[rgb(var(--border-subtle))]/50"
                  )}>
                    {globalIdx+1}
                  </span>
                  <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-xl ring-1", typeInfo.bg, "ring-[rgb(var(--border-subtle))]/30")}>
                    <Icon className={cn("h-4 w-4", typeInfo.color)}/>
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 flex-1 truncate font-display text-[12px] font-semibold leading-tight text-[rgb(var(--foreground))] group-hover:text-[var(--brand-a)]" title={f.filename}>
                        {f.filename}
                      </span>
                      <span className="shrink-0 font-mono text-[11px] font-bold tabular-nums text-[rgb(var(--foreground))]">
                        {f.downloadCount.toLocaleString("id-ID")}x
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-[rgb(var(--surface-muted))] ring-1 ring-[rgb(var(--border-subtle))]/30">
                        <motion.div
                          initial={{ width: "4%" }}
                          animate={{ width: widthPct+"%" }}
                          transition={{ delay: 0.15 + idx*0.04, duration: 0.7, ease: [0.22,1,0.36,1] as const }}
                          className={cn("absolute left-0 top-0 h-full rounded-full",
                            isTop ? "bg-gradient-to-r from-amber-400 to-amber-500" :
                            isTop3 ? "bg-gradient-to-r from-[var(--brand-a)] to-[var(--color-brand-300)]" :
                            "bg-gradient-to-r from-[var(--color-brand-300)] to-[var(--color-brand-100)]"
                          )}
                        >
                          <div className="absolute inset-0 bg-gradient-to-b from-white/30 to-transparent mix-blend-overlay" />
                        </motion.div>
                      </div>
                      <span className="text-[9px] tabular-nums text-[rgb(var(--ink-500))]/60">{widthPct.toFixed(0)}%</span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      <div className="relative mt-3 flex items-center justify-between border-t border-[rgb(var(--border-subtle))]/30 pt-3">
        <p className="text-[11px] font-medium text-[rgb(var(--foreground))]">Top download list file</p>
        {totalPages>1 ? (
          <div className="flex items-center gap-1.5">
            <button
              onClick={()=>setPage(p=>Math.max(1,p-1))}
              disabled={page===1}
              className="grid h-6 w-6 place-items-center rounded-full border border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface))] text-[rgb(var(--ink-500))] transition hover:bg-[rgb(var(--surface-muted))] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="text-[12px]">‹</span>
            </button>
            <span className="min-w-[40px] text-center font-mono text-[11px] font-bold tabular-nums text-[rgb(var(--foreground))]">
              {page} / {totalPages}
            </span>
            <button
              onClick={()=>setPage(p=>Math.min(totalPages,p+1))}
              disabled={page===totalPages}
              className="grid h-6 w-6 place-items-center rounded-full border border-[rgb(var(--border-subtle))] bg-[rgb(var(--surface))] text-[rgb(var(--ink-500))] transition hover:bg-[rgb(var(--surface-muted))] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="text-[12px]">›</span>
            </button>
          </div>
        ) : (
          <span className="text-[10px] text-[rgb(var(--ink-500))]/50">{sorted.length} file</span>
        )}
      </div>
    </div>
  );
}
// File Terbaru — tinggi samakan dengan Populer (380/420), icon kuning bg sama kayak file list
function FilesBentoCard({files}:{files:FileEntity[]}){
  return (
    <div className={cn(bentoBase,bentoBaseHover,"relative flex h-full min-h-[380px] flex-col p-4 lg:min-h-[420px] lg:p-5")}>
      <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-display text-[15px] font-bold text-[rgb(var(--foreground))]">
          <FileText className="h-5 w-5 text-[var(--brand-a)]" strokeWidth={2.5}/>
          File Terbaru
        </h3>
      </div>
      <p className="mb-3 text-[11px] text-[rgb(var(--ink-500))]">Unggahan terakhir</p>
      <div className="-mr-2 min-h-0 flex-1 overflow-y-auto pr-2 scrollbar-hide">
        {files.length===0?(
          <div className="flex h-full min-h-[200px] flex-col items-center justify-center py-6 text-center">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[rgb(var(--surface-muted))] ring-1 ring-[rgb(var(--border-subtle))] text-[rgb(var(--ink-500))]"><File className="h-5 w-5"/></span>
            <p className="mt-2 text-[12px] font-medium text-[rgb(var(--ink-500))]">Belum ada file</p>
          </div>
        ):(
          <ul className="flex flex-col gap-1">
            {files.slice(0,7).map(f=>{
              const typeInfo = getFileTypeInfo(f.filename);
              const Icon = typeInfo.Icon;
              return (
                <li key={f.id} className="group/item flex cursor-pointer items-center gap-3 rounded-xl border border-transparent p-2.5 transition hover:border-[rgb(var(--border-subtle))]/60 hover:bg-[rgb(var(--surface-muted))]/60">
                  <Icon className={cn("h-5 w-5 shrink-0 lg:h-6 lg:w-6", typeInfo.color)} strokeWidth={2.2}/>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-[12px] font-semibold leading-tight text-[rgb(var(--foreground))] group-hover/item:text-[var(--brand-a)]" title={f.filename}>{f.filename}</span>
                    <span className="flex items-center gap-1.5 text-[10px] leading-none text-[rgb(var(--ink-500))]">
                      <span>{formatBytes(f.sizeBytes)}</span>
                      <span className="h-0.5 w-0.5 rounded-full bg-[rgb(var(--ink-500))]/50"/>
                      <span>{f.downloadCount}x</span>
                      <span className={cn("ml-1 rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide", typeInfo.bg, typeInfo.color)}>{typeInfo.label}</span>
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-6 rounded-b-[16px] bg-gradient-to-t from-[rgb(var(--surface))] to-transparent"/>
    </div>
  );
}
// Folder Baru — tinggi samakan dengan Populer, icon tanpa bg
function FoldersBentoCard({folders}:{folders:Folder[]}){
  return (
    <div className={cn(bentoBase,bentoBaseHover,"relative flex h-full min-h-[380px] flex-col p-4 lg:min-h-[420px] lg:p-5")}>
      <div className="mb-3 flex shrink-0 items-center gap-2">
        <h3 className="flex items-center gap-2 font-display text-[15px] font-bold text-[rgb(var(--foreground))]">
          <FolderIcon className="h-5 w-5 text-amber-500" strokeWidth={2.5}/>
          Folder Baru
        </h3>
      </div>
      <p className="mb-3 text-[11px] text-[rgb(var(--ink-500))]">Dibuat terbaru</p>
      <div className="-mr-2 min-h-0 flex-1 overflow-y-auto pr-2 scrollbar-hide">
        {folders.length===0?(
          <div className="flex h-full min-h-[200px] flex-col items-center justify-center py-6 text-center">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-amber-500/15 dark:bg-amber-500/10 dark:text-amber-300"><FolderIcon className="h-5 w-5 fill-amber-100 dark:fill-amber-500/20"/></span>
            <p className="mt-2 text-[12px] font-medium text-[rgb(var(--ink-500))]">Belum ada folder</p>
          </div>
        ):(
          <ul className="flex flex-col gap-1">
            {folders.slice(0,7).map(fd=>(
              <li key={fd.id} className="group/item flex cursor-pointer items-center gap-3 rounded-xl border border-transparent p-2.5 transition hover:border-[rgb(var(--border-subtle))]/60 hover:bg-[rgb(var(--surface-muted))]/60">
                <FolderIcon className="h-5 w-5 shrink-0 text-amber-500 lg:h-6 lg:w-6" strokeWidth={2.2}/>
                <span className="min-w-0 flex-1 truncate">
                  <span className="block truncate font-display text-[12px] font-semibold leading-tight text-[rgb(var(--foreground))] group-hover/item:text-amber-600" title={fd.name}>{fd.name}</span>
                  <span className="text-[10px] leading-none text-[rgb(var(--ink-500))]">{new Date(fd.createdAt).toLocaleDateString("id-ID",{day:"2-digit",month:"short"})}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-6 rounded-b-[16px] bg-gradient-to-t from-[rgb(var(--surface))] to-transparent"/>
    </div>
  );
}

function DashboardOverviewPage(){
  const {data:metrics,isLoading:qLoading}=useDashboardMetrics();
  const isLoading=useMinLoading(qLoading,150);
  const [period,setPeriod]=useState<7|30|90>(30);
  const {data:analytics}=useDashboardAnalytics(period);
  const {totalUploads,uploadSeries,downloadSeries,uploadTrend,downloadTrend}=useMemo(()=>{
    const ch=analytics?.chartData??[]; const up=ch.map(d=>d.uploads??0); const dl=ch.map(d=>d.downloads??0);
    const calcTrend=(arr:number[])=>{ if(arr.length<4) return undefined; let prev:number,curr:number; if(arr.length>=14){ prev=arr.slice(-14,-7).reduce((s,v)=>s+v,0); curr=arr.slice(-7).reduce((s,v)=>s+v,0);} else{ const mid=Math.floor(arr.length/2); prev=arr.slice(0,mid).reduce((s,v)=>s+v,0); curr=arr.slice(mid).reduce((s,v)=>s+v,0);} if(prev===0&&curr===0) return undefined; if(prev===0&&curr>0) return curr<=3?{v:"Baru",up:true}:{v:"+100%",up:true}; if(curr===0&&prev>0) return {v:"-100%",up:false}; const pct=((curr-prev)/prev)*100; if(Math.abs(pct)<8) return undefined; const capped=Math.max(-99,Math.min(999,pct)); return {v:(capped>=0?"+":"")+capped.toFixed(0)+"%",up:capped>=0}; };
    return {totalUploads:up.reduce((s,v)=>s+v,0),uploadSeries:up,downloadSeries:dl,uploadTrend:calcTrend(up),downloadTrend:calcTrend(dl)};
  },[analytics]);
  if(isLoading) return <PageTransition><DashboardIndexSkeleton/></PageTransition>;
  const summary=metrics?.summary; const accStorage=metrics?.accountsStorage??[]; const countries=metrics?.topCountries??[];
  return (
    <PageTransition>
      <motion.div variants={container} initial="hidden" animate="show" className="flex w-full flex-col gap-5 pb-10">
        <motion.div variants={container} className="flex w-full flex-col gap-4">
          <motion.div variants={item} className="grid w-full grid-cols-1 gap-4 lg:grid-cols-[1.2fr_2.2fr]">
            <motion.div variants={item} className="self-stretch"><VolumeBentoCard accounts={accStorage}/></motion.div>
            <motion.div variants={item} className="self-stretch">
              <div className="grid auto-rows-fr grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
                <SquareStatCard label="Total Upload" icon={Upload} value={totalUploads.toLocaleString("id-ID")} sub={period+"H • "+(summary?summary.totalFiles.toLocaleString("id-ID"):0)+" file"} trend={uploadTrend} chartData={uploadSeries} chartColor="bg-[var(--brand-b)]"/>
                <SquareStatCard label="Total Unduhan" icon={Download} value={summary?summary.totalDownloads.toLocaleString("id-ID"):"-"} sub={"All time • "+period+"H"} trend={downloadTrend} chartData={downloadSeries} chartColor="bg-[var(--brand-a)]"/>
                <TotalFileBerandaCard value={summary?summary.totalFiles.toLocaleString("id-ID"):"-"}/>
                <AkunOnlineBerandaCard online={summary?.onlineAccounts??0} total={summary?.totalAccounts??0}/>
              </div>
            </motion.div>
          </motion.div>
          {/* ROW 2 — analitik + top regions + distribusi */}
          <motion.div variants={item} className="grid w-full grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-[1.8fr_1fr_1fr] lg:items-stretch">
            <motion.div variants={item} className="self-stretch md:col-span-2 lg:col-span-1"><TrendBentoCard period={period} onPeriodChange={setPeriod}/></motion.div>
            <motion.div variants={item} className="relative self-stretch">
              <div className="h-[300px] lg:absolute lg:inset-0 lg:h-auto"><CountriesBentoCard countries={countries}/></div>
              <div className="hidden lg:block" aria-hidden/>
            </motion.div>
            <motion.div variants={item} className="relative self-stretch">
              <div className="h-[300px] lg:absolute lg:inset-0 lg:h-auto"><PolarBentoCard accounts={accStorage}/></div>
              <div className="hidden lg:block" aria-hidden/>
            </motion.div>
          </motion.div>
          {/* BOTTOM ROW: File Terbaru + Folder Baru + Populer — tinggi samakan */}
          <motion.div variants={item} className="grid w-full grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-[1fr_1fr_1.8fr] lg:items-stretch">
            {/* Kiri: File Terbaru — tinggi samakan Populer 380/420 */}
            <motion.div variants={item} className="relative self-stretch">
              <div className="h-[380px] lg:absolute lg:inset-0 lg:h-auto lg:min-h-[420px]"><FilesBentoCard files={metrics?.recentFiles??[]}/></div>
              <div className="hidden lg:block" aria-hidden/>
            </motion.div>
            {/* Tengah: Folder Baru — tinggi samakan Populer */}
            <motion.div variants={item} className="relative self-stretch">
              <div className="h-[380px] lg:absolute lg:inset-0 lg:h-auto lg:min-h-[420px]"><FoldersBentoCard folders={metrics?.recentFolders??[]}/></div>
              <div className="hidden lg:block" aria-hidden/>
            </motion.div>
            {/* Kanan: Populer — ukuran ikut Analitik (lebar 1.8fr, tinggi jadi penentu row) */}
            <motion.div variants={item} className="self-stretch md:col-span-2 lg:col-span-1">
              <TopDlBentoCard files={metrics?.topDownloadedFiles??[]}/>
            </motion.div>
          </motion.div>
        </motion.div>
      </motion.div>
    </PageTransition>
  );
}
