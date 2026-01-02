
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from "@google/genai";

// --- CONSTANTES E CONFIGURAÇÃO ---
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

const LOCAL_STORAGE_KEY = 'valorcafe_persistent_v4';

// --- COMPONENTES INTERNOS ---

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
  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
    {PRODUCTS.map(p => (
      <div key={p} className="bg-slate-50 p-3 rounded-xl border border-slate-100">
        <label className="text-[9px] font-black text-slate-400 uppercase block mb-1 truncate">{p}</label>
        <input 
          type="number" 
          value={values[p] || ''} 
          onChange={e => onChange(p, parseInt(e.target.value) || 0)}
          className="bg-transparent font-mono font-bold text-[#3D231A] outline-none w-full text-sm"
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

  // Sincronização Local
  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(logs));
  }, [logs]);

  // Sincronização Cloud
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
    } catch (e) {
      console.error(e);
    } finally {
      setIsSyncing(false);
    }
  }, []);

  useEffect(() => { loadCloud(date); }, [date, loadCloud]);

  const currentLog = useMemo(() => logs[date] || { date, rotaInbound: {}, clientDeliveries: {} }, [logs, date]);

  const updateInbound = async (rota: RotaName, items: any) => {
    const updated = { ...currentLog };
    updated.rotaInbound[rota] = items;
    setLogs(prev => ({ ...prev, [date]: updated }));

    const upserts = Object.entries(items).map(([p, q]) => ({
      date, rota, product_name: p, quantity: q
    }));
    await supabase.from('inbound').upsert(upserts, { onConflict: 'date,rota,product_name' });
  };

  const addDelivery = async () => {
    if (!clientName || !activeRota) return;
    const delivery: ClientDelivery = {
      id: `d-${Date.now()}`,
      clientName,
      timestamp: new Date().toISOString(),
      items: { ...clientItems },
      rota: activeRota
    };

    const updated = { ...currentLog };
    updated.clientDeliveries[activeRota] = [delivery, ...(updated.clientDeliveries[activeRota] || [])];
    setLogs(prev => ({ ...prev, [date]: updated }));

    await supabase.from('deliveries').insert({
      id: delivery.id, date, rota: activeRota, client_name: clientName, items: clientItems, delivery_timestamp: delivery.timestamp
    });

    setClientName('');
    setClientItems({});
  };

  const getAiInsight = async () => {
    setAiInsight('Gerando análise...');
    try {
      const genAI = new GoogleGenAI({ apiKey: (window as any).process.env.API_KEY });
      const response = await genAI.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Analise brevemente a logística da ValorCafé para ${date}: ${JSON.stringify(currentLog)}`
      });
      setAiInsight(response.text || '');
    } catch {
      setAiInsight('Insight indisponível.');
    }
  };

  const metrics = useMemo(() => {
    let vol = 0;
    ROTAS.forEach(r => Object.values(currentLog.rotaInbound[r] || {}).forEach(v => vol += (v as number)));
    return { vol };
  }, [currentLog]);

  return (
    <div className="min-h-screen bg-slate-50 text-[#3D231A]">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 p-4 shadow-sm">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Logo />
            <div>
              <h1 className="font-black text-sm tracking-tighter uppercase">ValorCafé Cloud</h1>
              <span className={`text-[8px] font-black uppercase tracking-widest ${isSyncing ? 'text-amber-500 animate-pulse' : 'text-green-500'}`}>
                {isSyncing ? 'Sincronizando...' : 'Online'}
              </span>
            </div>
          </div>
          <input 
            type="date" 
            value={date} 
            onChange={e => setDate(e.target.value)}
            className="bg-slate-100 border-none rounded-lg px-3 py-1.5 text-xs font-bold outline-none focus:ring-2 focus:ring-amber-200"
          />
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 space-y-6 animate-fade-in">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Volume de Saída</span>
            <span className="text-3xl font-black">{metrics.vol} <small className="text-xs text-slate-300">un</small></span>
          </div>
          <div className="bg-[#3D231A] p-6 rounded-3xl shadow-xl text-white relative flex flex-col justify-between">
            <p className="text-[10px] font-medium italic opacity-80">{aiInsight || "Logística inteligente ValorCafé."}</p>
            <button onClick={getAiInsight} className="mt-4 self-end text-[#F9A11B] hover:scale-110 transition-transform">
              <i className="fas fa-bolt"></i>
            </button>
          </div>
        </div>

        <div className="flex overflow-x-auto gap-2 py-2 no-scrollbar">
          {ROTAS.map(r => (
            <button 
              key={r} 
              onClick={() => setActiveRota(r)}
              className={`px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all whitespace-nowrap ${
                activeRota === r ? 'bg-[#3D231A] text-white border-[#3D231A] shadow-md' : 'bg-white text-slate-400 border-slate-200'
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        {activeRota ? (
          <div className="space-y-6 animate-fade-in">
            <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-slate-200 shadow-sm">
              <h2 className="font-black text-lg mb-6 flex items-center gap-2">
                <i className="fas fa-truck-loading text-amber-500"></i> Carga: {activeRota}
              </h2>
              <ProductGrid 
                values={currentLog.rotaInbound[activeRota] || {}} 
                onChange={(p, v) => updateInbound(activeRota, { ...(currentLog.rotaInbound[activeRota] || {}), [p]: v })}
              />
            </div>

            <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-slate-200 shadow-sm">
              <h2 className="font-black text-lg mb-6">Registrar Entrega</h2>
              <input 
                placeholder="Cliente / PDV"
                value={clientName}
                onChange={e => setClientName(e.target.value)}
                className="w-full mb-6 p-4 rounded-2xl bg-slate-50 border-none outline-none font-bold text-sm focus:ring-2 focus:ring-amber-100"
              />
              <ProductGrid values={clientItems} onChange={(p, v) => setClientItems(prev => ({...prev, [p]: v}))} />
              <button 
                onClick={addDelivery}
                className="w-full mt-8 py-4 bg-[#3D231A] text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg active:scale-[0.98] transition-all"
              >
                Confirmar Entrega
              </button>
            </div>

            <div className="space-y-4">
               { (currentLog.clientDeliveries[activeRota] || []).map(d => (
                 <div key={d.id} className="bg-white p-4 rounded-2xl border border-slate-100 flex justify-between items-center shadow-sm">
                   <div>
                     <h4 className="font-bold text-sm">{d.clientName}</h4>
                     <div className="flex flex-wrap gap-1 mt-1">
                        {Object.entries(d.items).map(([p, q]) => (q as number) > 0 && (
                          <span key={p} className="text-[8px] font-black bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded uppercase">
                            {q} {p}
                          </span>
                        ))}
                     </div>
                   </div>
                   <span className="text-[8px] font-black text-slate-300">{new Date(d.timestamp).toLocaleTimeString()}</span>
                 </div>
               ))}
            </div>
          </div>
        ) : (
          <div className="py-20 text-center text-slate-300 font-black uppercase text-xs tracking-widest">
            <i className="fas fa-map-marked-alt text-4xl block mb-4 opacity-20"></i>
            Selecione uma região
          </div>
        )}
      </main>

      <footer className="p-8 text-center text-[8px] font-black text-slate-300 uppercase tracking-[0.4em]">
        ValorCafé Logística de Precisão
      </footer>
    </div>
  );
}
