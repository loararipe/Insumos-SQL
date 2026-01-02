
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from "@google/genai";

// --- CONFIGURAÇÕES E TIPOS ---
const SUPABASE_URL = (window as any).process.env.SUPABASE_URL;
const SUPABASE_KEY = (window as any).process.env.SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const ROTAS = ['Barra', 'Botafogo', 'Centro', 'Copacabana', 'Niteroi', 'Norte', 'Tijuca'] as const;
type RotaName = typeof ROTAS[number];

const PRODUCTS = [
  'Café', 'Café organico', 'Açucar', 'Adoçante', 'Chocolate', 'Leite', 
  'Copo 160', 'Copo 160 AE', 'Copo Isopor', 'Adoçante líquido', 'Xicaras', 'Outros'
] as const;
type ProductName = typeof PRODUCTS[number];

interface ClientDelivery {
  id: string;
  clientName: string;
  timestamp: string;
  items: { [p: string]: number };
  rota: RotaName;
}

interface DailyLog {
  date: string;
  rotaInbound: { [rota in RotaName]?: { [p: string]: number } };
  clientDeliveries: { [rota in RotaName]?: ClientDelivery[] };
}

const LOCAL_STORAGE_KEY = 'valorcafe_persistent_v5';

// --- COMPONENTES DE INTERFACE ---

const Logo = () => (
  <div className="h-12">
    <svg viewBox="0 0 400 400" className="h-full w-auto">
      <path d="M200 180C200 140 160 100 185 50C195 25 220 5 200 0C240 40 215 85 220 120C225 155 200 170 200 180Z" fill="#F9A11B" />
      <circle cx="200" cy="255" r="78" stroke="#0f172a" strokeWidth="6" fill="none" />
      <circle cx="200" cy="255" r="56" fill="#0f172a" />
      <path d="M125 255C125 315 160 355 200 355C240 355 275 315 275 255" stroke="#0f172a" strokeWidth="3.5" fill="none" />
    </svg>
  </div>
);

const ProductGrid = ({ values, onChange }: { values: any, onChange: (p: ProductName, v: number) => void }) => (
  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
    {PRODUCTS.map(p => (
      <div key={p} className="bg-white p-4 rounded-2xl border border-slate-200 focus-within:border-amber-400 focus-within:ring-4 focus-within:ring-amber-50 transition-all shadow-sm">
        <label className="text-[11px] font-black text-slate-600 uppercase block mb-2 truncate tracking-tight">{p}</label>
        <input 
          type="number" 
          inputMode="numeric"
          value={values[p] || ''} 
          onChange={e => onChange(p, Math.max(0, parseInt(e.target.value) || 0))}
          className="bg-transparent font-mono font-bold text-slate-900 outline-none w-full text-lg placeholder-slate-200"
          placeholder="0"
        />
      </div>
    ))}
  </div>
);

// --- APP ---

export default function App() {
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [logs, setLogs] = useState<{ [d: string]: DailyLog }>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  
  const [activeRota, setActiveRota] = useState<RotaName | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [clientName, setClientName] = useState('');
  const [clientItems, setClientItems] = useState<{ [p: string]: number }>({});
  const [aiInsight, setAiInsight] = useState('');

  useEffect(() => { localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(logs)); }, [logs]);

  const loadCloud = useCallback(async (targetDate: string) => {
    setIsSyncing(true);
    try {
      const { data: inb } = await supabase.from('inbound').select('*').eq('date', targetDate);
      const { data: del } = await supabase.from('deliveries').select('*').eq('date', targetDate);
      const newLog: DailyLog = { date: targetDate, rotaInbound: {}, clientDeliveries: {} };
      inb?.forEach(r => {
        if (!newLog.rotaInbound[r.rota as RotaName]) newLog.rotaInbound[r.rota as RotaName] = {};
        newLog.rotaInbound[r.rota as RotaName]![r.product_name] = r.quantity;
      });
      del?.forEach(r => {
        if (!newLog.clientDeliveries[r.rota as RotaName]) newLog.clientDeliveries[r.rota as RotaName] = [];
        newLog.clientDeliveries[r.rota as RotaName]!.push({
          id: r.id, clientName: r.client_name, timestamp: r.delivery_timestamp, items: r.items, rota: r.rota as RotaName
        });
      });
      setLogs(prev => ({ ...prev, [targetDate]: newLog }));
    } catch (e) { console.error(e); } finally { setIsSyncing(false); }
  }, []);

  useEffect(() => { loadCloud(date); }, [date, loadCloud]);

  const currentLog = useMemo(() => logs[date] || { date, rotaInbound: {}, clientDeliveries: {} }, [logs, date]);

  const globalProductMetrics = useMemo(() => {
    const totals: { [p: string]: { inbound: number, delivered: number } } = {};
    PRODUCTS.forEach(p => totals[p] = { inbound: 0, delivered: 0 });
    ROTAS.forEach(r => {
      Object.entries(currentLog.rotaInbound[r] || {}).forEach(([p, q]) => { if (totals[p]) totals[p].inbound += (q as number); });
      (currentLog.clientDeliveries[r] || []).forEach(del => {
        Object.entries(del.items).forEach(([p, q]) => { if (totals[p]) totals[p].delivered += (q as number); });
      });
    });
    return totals;
  }, [currentLog]);

  const updateInbound = async (rota: RotaName, items: any) => {
    const updated = { ...currentLog };
    updated.rotaInbound[rota] = items;
    setLogs(prev => ({ ...prev, [date]: updated }));
    const upserts = Object.entries(items).map(([p, q]) => ({ date, rota, product_name: p, quantity: q }));
    await supabase.from('inbound').upsert(upserts, { onConflict: 'date,rota,product_name' });
  };

  const addDelivery = async () => {
    if (!clientName || !activeRota) return;
    const delivery: ClientDelivery = { id: `d-${Date.now()}`, clientName, timestamp: new Date().toISOString(), items: { ...clientItems }, rota: activeRota };
    const updated = { ...currentLog };
    updated.clientDeliveries[activeRota] = [delivery, ...(updated.clientDeliveries[activeRota] || [])];
    setLogs(prev => ({ ...prev, [date]: updated }));
    await supabase.from('deliveries').insert({ id: delivery.id, date, rota: activeRota, client_name: clientName, items: clientItems, delivery_timestamp: delivery.timestamp });
    setClientName('');
    setClientItems({});
  };

  const getAiInsight = async () => {
    setAiInsight('Analisando fluxos logísticos...');
    try {
      const genAI = new GoogleGenAI({ apiKey: (window as any).process.env.API_KEY });
      const response = await genAI.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Analise brevemente o balanço de estoque da ValorCafé para ${date}. Considere: ${JSON.stringify(globalProductMetrics)}`
      });
      setAiInsight(response.text || '');
    } catch { setAiInsight('Insight indisponível.'); }
  };

  const exportReport = () => {
    let txt = `VALORCAFÉ - RELATÓRIO LOGÍSTICO COMPLETO - DATA: ${date}\n`;
    txt += `Gerado em: ${new Date().toLocaleString('pt-BR')}\n`;
    txt += `======================================================================\n\n`;

    txt += `1. CONSOLIDADO GERAL\n`;
    txt += `----------------------------------------------------------------------\n`;
    txt += `PRODUTO`.padEnd(20) + ` | ` + `SAÍDA CD`.padStart(10) + ` | ` + `ENTREGUE`.padStart(10) + ` | ` + `SALDO`.padStart(15) + `\n`;
    txt += `-`.repeat(70) + `\n`;
    
    PRODUCTS.forEach(p => {
      const m = globalProductMetrics[p];
      if (m.inbound > 0 || m.delivered > 0) {
        txt += `${p.padEnd(20)} | ${String(m.inbound).padStart(10)} | ${String(m.delivered).padStart(10)} | ${String(m.inbound - m.delivered).padStart(15)}\n`;
      }
    });
    txt += `\n\n`;

    ROTAS.forEach(r => {
      const inbound = currentLog.rotaInbound[r] || {};
      const deliveries = currentLog.clientDeliveries[r] || [];
      if (!Object.values(inbound).some(v => v > 0) && deliveries.length === 0) return;

      txt += `>>> REGIONAL: ${r.toUpperCase()}\n`;
      txt += `----------------------------------------------------------------------\n`;
      const rotaDelivered: { [p: string]: number } = {};
      deliveries.forEach(d => {
        Object.entries(d.items).forEach(([p, q]) => { rotaDelivered[p] = (rotaDelivered[p] || 0) + (q as number); });
      });

      txt += `BALANÇO:\n`;
      PRODUCTS.forEach(p => {
        const inQ = inbound[p] || 0;
        const outQ = rotaDelivered[p] || 0;
        if (inQ > 0 || outQ > 0) {
          txt += `  - ${p.padEnd(15)}: Carga(${String(inQ).padStart(3)}) | Entregue(${String(outQ).padStart(3)}) | Saldo(${String(inQ - outQ).padStart(3)})\n`;
        }
      });
      txt += `\nLISTA DE ENTREGAS:\n`;
      deliveries.forEach(d => {
        txt += `  [${new Date(d.timestamp).toLocaleTimeString('pt-BR')}] - ${d.clientName}\n`;
        Object.entries(d.items).forEach(([p, q]) => { if ((q as number) > 0) txt += `    . ${p}: ${q}\n`; });
      });
      txt += `\n\n`;
    });

    const blob = new Blob([txt], { type: 'text/plain' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `ValorCafe_Completo_${date}.txt`;
    link.click();
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 selection:bg-amber-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 p-5 shadow-sm">
        <div className="max-w-5xl mx-auto flex justify-between items-center gap-6">
          <div className="flex items-center gap-4">
            <Logo />
            <div className="hidden sm:block">
              <h1 className="font-black text-lg tracking-tight uppercase leading-none text-slate-900">ValorCafé <span className="text-amber-500">Cloud</span></h1>
              <span className={`text-[10px] font-black uppercase tracking-widest ${isSyncing ? 'text-amber-500 animate-pulse' : 'text-emerald-600'}`}>
                {isSyncing ? 'Sincronizando' : 'Sistema Ativo'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
             <button onClick={exportReport} className="bg-slate-900 text-white hover:bg-black px-6 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest flex items-center gap-3 transition-all shadow-xl shadow-slate-200 active:scale-95">
               <i className="fas fa-file-invoice text-amber-500 text-sm"></i>
               <span className="hidden md:inline">Relatório Completo</span>
             </button>
             <input 
              type="date" 
              value={date} 
              onChange={e => setDate(e.target.value)}
              className="bg-slate-100 border-none rounded-2xl px-4 py-3 text-sm font-black outline-none focus:ring-4 focus:ring-amber-100 transition-all text-slate-900 cursor-pointer"
            />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-5 md:p-10 space-y-10 animate-fade-in">
        
        {/* DASHBOARD GERAL (Desktop) */}
        <section className="hidden md:block space-y-5">
          <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Consolidado Geral do Dia</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {Object.entries(globalProductMetrics).filter(([_, m]) => m.inbound > 0).slice(0, 4).map(([p, m]) => (
              <div key={p} className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                <span className="text-[10px] font-black text-slate-500 uppercase block mb-2">{p}</span>
                <div className="flex justify-between items-end">
                  <span className="text-3xl font-black text-slate-900">{m.inbound}</span>
                  <div className="text-right">
                    <span className="text-[10px] font-black text-amber-600 block">ENT: {m.delivered}</span>
                    <span className="text-[10px] font-black text-slate-400 block">SAL: {m.inbound - m.delivered}</span>
                  </div>
                </div>
              </div>
            ))}
            <div className="bg-slate-900 p-6 rounded-[2rem] shadow-2xl text-white relative overflow-hidden group min-h-[120px] flex flex-col justify-between">
              <p className="text-xs font-bold leading-relaxed italic text-slate-300 z-10 pr-6">
                {aiInsight || "IA ValorCafé pronta para análise."}
              </p>
              <button onClick={getAiInsight} className="self-end bg-amber-500 text-slate-950 w-10 h-10 rounded-2xl flex items-center justify-center hover:scale-110 transition-transform shadow-lg z-10">
                <i className="fas fa-bolt"></i>
              </button>
              <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-amber-500/10 rounded-full blur-3xl"></div>
            </div>
          </div>
        </section>

        {/* REGIONAIS */}
        <div className="space-y-4">
          <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Regiões de Atendimento</h3>
          <div className="flex overflow-x-auto gap-3 pb-4 no-scrollbar">
            {ROTAS.map(r => (
              <button 
                key={r} 
                onClick={() => setActiveRota(r)}
                className={`px-8 py-5 rounded-[1.5rem] text-xs font-black uppercase tracking-widest border-2 transition-all whitespace-nowrap ${
                  activeRota === r 
                    ? 'bg-slate-900 text-white border-slate-900 shadow-2xl -translate-y-1' 
                    : 'bg-white text-slate-500 border-slate-200 hover:border-amber-400 shadow-sm'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {activeRota ? (
          <div className="space-y-10 animate-fade-in pb-20">
            
            {/* CARGA CD (Desktop) */}
            <div className="hidden md:block bg-white p-10 rounded-[2.5rem] border border-slate-200 shadow-sm">
              <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center text-xl">
                  <i className="fas fa-truck-loading"></i>
                </div>
                <div>
                  <h2 className="font-black text-2xl text-slate-900 uppercase tracking-tight">Carga Inicial: {activeRota}</h2>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Controle de Saída do Centro de Distribuição</p>
                </div>
              </div>
              <ProductGrid 
                values={currentLog.rotaInbound[activeRota] || {}} 
                onChange={(p, v) => updateInbound(activeRota, { ...(currentLog.rotaInbound[activeRota] || {}), [p]: v })}
              />
            </div>

            {/* ENTREGA (Foco Mobile/Campo) */}
            <div className="bg-white p-8 md:p-12 rounded-[2.5rem] border border-slate-200 shadow-xl border-l-8 border-l-amber-500">
              <div className="flex items-center gap-4 mb-10">
                <div className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center text-xl">
                  <i className="fas fa-map-marker-alt"></i>
                </div>
                <div>
                  <h2 className="font-black text-2xl text-slate-900 uppercase tracking-tight">Registrar Entrega</h2>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Regional {activeRota}</p>
                </div>
              </div>
              
              <div className="space-y-4 mb-10">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest block ml-1">Ponto de Venda (PDV)</label>
                <input 
                  placeholder="Ex: Starbucks Centro / Café do Zé"
                  value={clientName}
                  onChange={e => setClientName(e.target.value)}
                  className="w-full p-6 rounded-2xl bg-slate-100 border-2 border-transparent outline-none font-bold text-lg text-slate-900 focus:bg-white focus:border-amber-400 transition-all placeholder-slate-300"
                />
              </div>

              <ProductGrid values={clientItems} onChange={(p, v) => setClientItems(prev => ({...prev, [p]: v}))} />
              
              <button 
                onClick={addDelivery}
                className="w-full mt-10 py-6 bg-slate-900 text-white rounded-3xl font-black uppercase text-xs tracking-[0.3em] shadow-2xl shadow-slate-900/20 active:scale-95 transition-all disabled:opacity-50 disabled:grayscale"
                disabled={!clientName}
              >
                Confirmar Entrega Realizada
              </button>
            </div>

            {/* CONFERÊNCIA (Desktop) */}
            <div className="hidden md:block bg-white p-10 rounded-[2.5rem] border border-slate-100 shadow-sm">
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-8">Tabela de Conferência Operacional</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="text-[11px] font-black text-slate-400 border-b-2 border-slate-50">
                    <tr>
                      <th className="pb-6">PRODUTO</th>
                      <th className="pb-6 text-center">SAÍDA CD</th>
                      <th className="pb-6 text-center text-amber-600">ENTREGUE</th>
                      <th className="pb-6 text-right">SALDO RETORNO</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {PRODUCTS.map(p => {
                      const inbound = currentLog.rotaInbound[activeRota]?.[p] || 0;
                      const delivered = (currentLog.clientDeliveries[activeRota] || []).reduce((acc, del) => acc + (del.items[p] || 0), 0);
                      const balance = inbound - delivered;
                      if (inbound === 0 && delivered === 0) return null;
                      return (
                        <tr key={p} className="text-sm">
                          <td className="py-5 font-black text-slate-900 uppercase tracking-tight">{p}</td>
                          <td className="py-5 text-center font-mono font-bold text-slate-600">{inbound}</td>
                          <td className="py-5 text-center font-mono font-black text-amber-600">{delivered}</td>
                          <td className={`py-5 text-right font-mono font-black ${balance < 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                            {balance}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* HISTÓRICO DE CAMPO */}
            <div className="space-y-6">
               <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Fluxo de Entregas Hoje</h3>
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                { (currentLog.clientDeliveries[activeRota] || []).map(d => (
                  <div key={d.id} className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex justify-between items-start hover:shadow-xl transition-all">
                    <div>
                      <h4 className="font-black text-base text-slate-900">{d.clientName}</h4>
                      <div className="flex flex-wrap gap-2 mt-3">
                        {Object.entries(d.items).map(([p, q]) => (q as number) > 0 && (
                          <span key={p} className="text-[10px] font-black bg-amber-50 text-amber-700 px-3 py-1.5 rounded-xl uppercase border border-amber-100">
                            {q} {p}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="text-right flex flex-col items-end">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter mb-2">{new Date(d.timestamp).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}</span>
                      <div className="w-8 h-8 bg-emerald-50 rounded-2xl flex items-center justify-center">
                        <i className="fas fa-check text-xs text-emerald-600"></i>
                      </div>
                    </div>
                  </div>
                ))}
               </div>
               {(currentLog.clientDeliveries[activeRota] || []).length === 0 && (
                 <div className="text-center py-24 border-4 border-dashed border-slate-100 rounded-[3rem] text-slate-200 font-black uppercase text-xs tracking-[0.5em]">
                   Nenhuma entrega registrada
                 </div>
               )}
            </div>
          </div>
        ) : (
          <div className="py-40 text-center space-y-6">
            <div className="w-28 h-28 bg-white rounded-full flex items-center justify-center mx-auto shadow-sm border border-slate-200 text-slate-100">
              <i className="fas fa-route text-4xl"></i>
            </div>
            <div className="space-y-2">
              <h3 className="text-slate-400 font-black uppercase text-sm tracking-[0.5em]">Selecione uma Região</h3>
              <p className="text-slate-300 text-xs font-bold max-w-xs mx-auto">Toque em uma das rotas acima para iniciar os registros logísticos do dia.</p>
            </div>
          </div>
        )}
      </main>

      <footer className="p-16 text-center">
        <div className="max-w-xs mx-auto h-px bg-slate-200 mb-8"></div>
        <span className="text-[10px] font-black text-slate-300 uppercase tracking-[0.8em]">
          ValorCafé Logistics Infrastructure &copy; 2024
        </span>
      </footer>
    </div>
  );
}
