
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
  <div className="h-10">
    <svg viewBox="0 0 400 400" className="h-full w-auto">
      <path d="M200 180C200 140 160 100 185 50C195 25 220 5 200 0C240 40 215 85 220 120C225 155 200 170 200 180Z" fill="#F9A11B" />
      <circle cx="200" cy="255" r="78" stroke="#3D231A" strokeWidth="6" fill="none" />
      <circle cx="200" cy="255" r="56" fill="#3D231A" />
      <path d="M125 255C125 315 160 355 200 355C240 355 275 315 275 255" stroke="#3D231A" strokeWidth="3.5" fill="none" />
    </svg>
  </div>
);

const ProductGrid = ({ values, onChange }: { values: any, onChange: (p: ProductName, v: number) => void }) => (
  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
    {PRODUCTS.map(p => (
      <div key={p} className="bg-slate-50 p-3 rounded-xl border border-slate-100 focus-within:border-amber-400 transition-colors">
        <label className="text-[9px] font-black text-slate-400 uppercase block mb-1 truncate tracking-tighter">{p}</label>
        <input 
          type="number" 
          inputMode="numeric"
          value={values[p] || ''} 
          onChange={e => onChange(p, Math.max(0, parseInt(e.target.value) || 0))}
          className="bg-transparent font-mono font-bold text-[#3D231A] outline-none w-full text-sm placeholder-slate-300"
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
    setAiInsight('Analisando fluxos...');
    try {
      const genAI = new GoogleGenAI({ apiKey: (window as any).process.env.API_KEY });
      const response = await genAI.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Analise o balanço de estoque da ValorCafé para ${date}. Seja breve e técnico.`
      });
      setAiInsight(response.text || '');
    } catch { setAiInsight('Insight indisponível.'); }
  };

  const exportReport = () => {
    let txt = `VALORCAFÉ - RELATÓRIO LOGÍSTICO COMPLETO - DATA: ${date}\n`;
    txt += `Gerado em: ${new Date().toLocaleString('pt-BR')}\n`;
    txt += `======================================================================\n\n`;

    // 1. CONSOLIDADO GERAL DA EMPRESA
    txt += `1. CONSOLIDADO GERAL (SOMA DE TODAS AS ROTAS)\n`;
    txt += `----------------------------------------------------------------------\n`;
    txt += `PRODUTO`.padEnd(20) + ` | ` + `SAÍDA CD`.padStart(10) + ` | ` + `ENTREGUE`.padStart(10) + ` | ` + `SALDO RETORNO`.padStart(15) + `\n`;
    txt += `-`.repeat(70) + `\n`;
    
    PRODUCTS.forEach(p => {
      const m = globalProductMetrics[p];
      if (m.inbound > 0 || m.delivered > 0) {
        txt += `${p.padEnd(20)} | ${String(m.inbound).padStart(10)} | ${String(m.delivered).padStart(10)} | ${String(m.inbound - m.delivered).padStart(15)}\n`;
      }
    });
    txt += `\n\n`;

    // 2. DETALHAMENTO POR ROTA
    txt += `2. DETALHAMENTO POR ROTA\n`;
    txt += `======================================================================\n\n`;

    ROTAS.forEach(r => {
      const inbound = currentLog.rotaInbound[r] || {};
      const deliveries = currentLog.clientDeliveries[r] || [];
      
      const hasActivity = Object.values(inbound).some(v => v > 0) || deliveries.length > 0;
      if (!hasActivity) return;

      txt += `>>> REGIONAL: ${r.toUpperCase()}\n`;
      txt += `----------------------------------------------------------------------\n`;
      
      // Totais da Rota
      const rotaDelivered: { [p: string]: number } = {};
      deliveries.forEach(d => {
        Object.entries(d.items).forEach(([p, q]) => {
          rotaDelivered[p] = (rotaDelivered[p] || 0) + (q as number);
        });
      });

      txt += `BALANÇO DA ROTA:\n`;
      PRODUCTS.forEach(p => {
        const inQ = inbound[p] || 0;
        const outQ = rotaDelivered[p] || 0;
        if (inQ > 0 || outQ > 0) {
          txt += `  - ${p.padEnd(15)}: Carga(${String(inQ).padStart(3)}) | Entregue(${String(outQ).padStart(3)}) | Saldo(${String(inQ - outQ).padStart(3)})\n`;
        }
      });

      txt += `\nLISTA DE ENTREGAS POR CLIENTE:\n`;
      if (deliveries.length === 0) {
        txt += `  (Nenhuma entrega registrada)\n`;
      } else {
        deliveries.forEach(d => {
          txt += `  [${new Date(d.timestamp).toLocaleTimeString('pt-BR')}] - ${d.clientName}\n`;
          Object.entries(d.items).forEach(([p, q]) => {
            if ((q as number) > 0) txt += `    . ${p}: ${q}\n`;
          });
        });
      }
      txt += `\n\n`;
    });

    txt += `======================================================================\n`;
    txt += `FIM DO RELATÓRIO - VALORCAFÉ CLOUD\n`;

    const blob = new Blob([txt], { type: 'text/plain' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Relatorio_ValorCafe_${date}.txt`;
    link.click();
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-[#3D231A]">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 p-4 shadow-sm">
        <div className="max-w-5xl mx-auto flex justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <Logo />
            <div className="hidden sm:block">
              <h1 className="font-black text-sm tracking-tighter uppercase leading-none">ValorCafé Cloud</h1>
              <span className={`text-[8px] font-black uppercase tracking-[0.2em] ${isSyncing ? 'text-amber-500 animate-pulse' : 'text-green-500'}`}>
                {isSyncing ? 'Sincronizando' : 'Operação Ativa'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
             <button onClick={exportReport} className="bg-[#3D231A] text-white hover:bg-black px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all shadow-lg" title="Exportar Relatório Detalhado">
               <i className="fas fa-file-invoice"></i>
               <span className="hidden sm:inline">Exportar Relatório</span>
             </button>
             <input 
              type="date" 
              value={date} 
              onChange={e => setDate(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-amber-200"
            />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 md:p-8 space-y-6 animate-fade-in">
        
        {/* DASHBOARD DE BALANÇO (Somente Desktop) */}
        <section className="hidden md:block space-y-3">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Consolidado Geral</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Object.entries(globalProductMetrics).filter(([_, m]) => m.inbound > 0).slice(0, 4).map(([p, m]) => (
              <div key={p} className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
                <span className="text-[9px] font-black text-slate-400 uppercase block mb-1">{p}</span>
                <div className="flex justify-between items-end">
                  <span className="text-2xl font-black">{m.inbound}</span>
                  <div className="text-right">
                    <span className="text-[8px] font-bold text-amber-500 block">Entregue: {m.delivered}</span>
                    <span className="text-[8px] font-bold text-slate-300 block">Saldo: {m.inbound - m.delivered}</span>
                  </div>
                </div>
              </div>
            ))}
            <div className="bg-[#3D231A] p-5 rounded-3xl shadow-xl text-white relative overflow-hidden group">
              <p className="text-[9px] font-medium leading-relaxed italic opacity-80 z-10 pr-6">
                {aiInsight || "Análise estratégica via IA disponível."}
              </p>
              <button onClick={getAiInsight} className="absolute right-4 bottom-4 text-amber-500 hover:scale-125 transition-transform z-10">
                <i className="fas fa-bolt"></i>
              </button>
            </div>
          </div>
        </section>

        {/* SELETOR DE REGIONAL */}
        <div className="space-y-3">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Regiões</h3>
          <div className="flex overflow-x-auto gap-2 pb-2 no-scrollbar">
            {ROTAS.map(r => (
              <button 
                key={r} 
                onClick={() => setActiveRota(r)}
                className={`px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all whitespace-nowrap ${
                  activeRota === r ? 'bg-[#3D231A] text-white border-[#3D231A] shadow-lg -translate-y-1' : 'bg-white text-slate-400 border-slate-200 hover:border-amber-200 shadow-sm'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {activeRota ? (
          <div className="space-y-6 animate-fade-in">
            
            {/* CARGA INICIAL (Escondida no Mobile por padrão) */}
            <div className="hidden md:block bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm">
              <h2 className="font-black text-lg mb-6 flex items-center gap-2">
                <i className="fas fa-truck-moving text-amber-500"></i> Carga: {activeRota}
              </h2>
              <ProductGrid 
                values={currentLog.rotaInbound[activeRota] || {}} 
                onChange={(p, v) => updateInbound(activeRota, { ...(currentLog.rotaInbound[activeRota] || {}), [p]: v })}
              />
            </div>

            {/* SEÇÃO DE ENTREGA (Foco Mobile) */}
            <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-slate-200 shadow-md border-l-4 border-l-amber-500">
              <h2 className="font-black text-lg mb-6 flex items-center gap-2">
                <i className="fas fa-map-pin text-amber-500"></i> Entrega em {activeRota}
              </h2>
              <input 
                placeholder="Identificação do Cliente"
                value={clientName}
                onChange={e => setClientName(e.target.value)}
                className="w-full mb-6 p-4 rounded-2xl bg-slate-50 border-2 border-transparent outline-none font-bold text-sm focus:bg-white focus:border-amber-200 transition-all"
              />
              <ProductGrid values={clientItems} onChange={(p, v) => setClientItems(prev => ({...prev, [p]: v}))} />
              <button 
                onClick={addDelivery}
                className="w-full mt-8 py-5 bg-[#3D231A] text-white rounded-2xl font-black uppercase text-[10px] tracking-[0.3em] shadow-xl active:scale-[0.98] transition-all disabled:opacity-50"
                disabled={!clientName}
              >
                Confirmar Entrega Realizada
              </button>
            </div>

            {/* TABELA DE CONFERÊNCIA (Desktop) */}
            <div className="hidden md:block bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Conferência {activeRota}</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="text-[10px] font-black text-slate-400 border-b border-slate-100">
                    <tr>
                      <th className="pb-4">PRODUTO</th>
                      <th className="pb-4 text-center">SAÍDA CD</th>
                      <th className="pb-4 text-center text-amber-500">ENTREGUE</th>
                      <th className="pb-4 text-right">SALDO</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {PRODUCTS.map(p => {
                      const inbound = currentLog.rotaInbound[activeRota]?.[p] || 0;
                      const delivered = (currentLog.clientDeliveries[activeRota] || []).reduce((acc, del) => acc + (del.items[p] || 0), 0);
                      const balance = inbound - delivered;
                      if (inbound === 0 && delivered === 0) return null;
                      return (
                        <tr key={p} className="text-xs">
                          <td className="py-4 font-bold text-slate-600 uppercase">{p}</td>
                          <td className="py-4 text-center font-mono font-bold">{inbound}</td>
                          <td className="py-4 text-center font-mono font-black text-amber-500">{delivered}</td>
                          <td className={`py-4 text-right font-mono font-black ${balance < 0 ? 'text-red-500' : 'text-green-600'}`}>
                            {balance}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* HISTÓRICO */}
            <div className="space-y-4">
               <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Linha do Tempo</h3>
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                { (currentLog.clientDeliveries[activeRota] || []).map(d => (
                  <div key={d.id} className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex justify-between items-start">
                    <div>
                      <h4 className="font-black text-sm text-[#3D231A]">{d.clientName}</h4>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {Object.entries(d.items).map(([p, q]) => (q as number) > 0 && (
                          <span key={p} className="text-[8px] font-black bg-amber-50 text-amber-600 px-2 py-1 rounded-lg uppercase border border-amber-100/50">
                            {q} {p}
                          </span>
                        ))}
                      </div>
                    </div>
                    <span className="text-[8px] font-black text-slate-300">{new Date(d.timestamp).toLocaleTimeString('pt-BR')}</span>
                  </div>
                ))}
               </div>
            </div>
          </div>
        ) : (
          <div className="py-32 text-center text-slate-300 font-black uppercase text-xs tracking-[0.4em]">
            Selecione uma Região Operacional
          </div>
        )}
      </main>

      <footer className="p-12 text-center opacity-40">
        <span className="text-[8px] font-black text-slate-400 uppercase tracking-[0.8em]">
          ValorCafé Logistics &copy; 2024
        </span>
      </footer>
    </div>
  );
}
