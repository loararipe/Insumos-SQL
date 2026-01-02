
import React, { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from "@google/genai";

// --- TIPOS E CONSTANTES ---
export type RotaName = 'Barra' | 'Botafogo' | 'Centro' | 'Copacabana' | 'Niteroi' | 'Norte' | 'Tijuca';
export const ROTAS: RotaName[] = ['Barra', 'Botafogo', 'Centro', 'Copacabana', 'Niteroi', 'Norte', 'Tijuca'];
export const PRODUCTS = ['Café', 'Café organico', 'Açucar', 'Adoçante', 'Chocolate', 'Leite', 'Copo 160', 'Copo 160 AE', 'Copo Isopor', 'Adoçante líquido', 'Xicaras', 'Outros'] as const;
export type ProductName = typeof PRODUCTS[number];

export interface ClientDelivery {
  id: string;
  clientName: string;
  timestamp: string;
  items: { [p: string]: number };
  rota: RotaName;
}

export interface DailyLog {
  date: string;
  rotaInbound: { [rota in RotaName]?: { [p: string]: number } };
  clientDeliveries: { [rota in RotaName]?: ClientDelivery[] };
}

// --- CLIENTES EXTERNOS ---
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const LOCAL_STORAGE_KEY = 'valorcafe_v2_store';

// --- COMPONENTES AUXILIARES ---
const Logo = ({ className = "h-12" }) => (
  <div className={className}>
    <svg viewBox="0 0 400 400" className="h-full w-auto">
      <path d="M200 180C200 140 160 100 185 50C195 25 220 5 200 0C240 40 215 85 220 120C225 155 200 170 200 180Z" fill="#F9A11B" />
      <circle cx="200" cy="255" r="78" stroke="#3D231A" strokeWidth="6" fill="none" />
      <circle cx="200" cy="255" r="56" fill="#3D231A" />
      <path d="M125 255C125 315 160 355 200 355C240 355 275 315 275 255" stroke="#3D231A" strokeWidth="3.5" fill="none" />
    </svg>
  </div>
);

const ProductInput = ({ values, onChange, label }: any) => (
  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
    {PRODUCTS.map(p => (
      <div key={p} className="flex flex-col bg-white border border-slate-100 p-3 rounded-xl shadow-sm">
        <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 truncate">{p}</label>
        <input 
          type="number" 
          value={values[p] || ''} 
          onChange={e => onChange(p, parseInt(e.target.value) || 0)}
          className="bg-transparent font-mono font-black text-[#3D231A] outline-none text-sm"
          placeholder="0"
        />
      </div>
    ))}
  </div>
);

// --- APP PRINCIPAL ---
export default function App() {
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [logs, setLogs] = useState<{ [d: string]: DailyLog }>(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    return saved ? JSON.parse(saved) : {};
  });
  const [activeRota, setActiveRota] = useState<RotaName | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [clientName, setClientName] = useState('');
  const [clientItems, setClientItems] = useState({});

  // Efeito de persistência local
  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(logs));
  }, [logs]);

  // Carregar do Supabase
  const loadCloudData = async (targetDate: string) => {
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
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => { loadCloudData(date); }, [date]);

  const currentLog = useMemo(() => logs[date] || { date, rotaInbound: {}, clientDeliveries: {} }, [logs, date]);

  const handleUpdateInbound = async (rota: RotaName, items: any) => {
    const updatedLog = { ...currentLog };
    updatedLog.rotaInbound = { ...updatedLog.rotaInbound, [rota]: items };
    setLogs(prev => ({ ...prev, [date]: updatedLog }));

    // Sync cloud
    const upserts = Object.entries(items).map(([p, q]) => ({ date, rota, product_name: p, quantity: q }));
    await supabase.from('inbound').upsert(upserts, { onConflict: 'date,rota,product_name' });
  };

  const handleAddDelivery = async () => {
    if (!clientName || !activeRota) return;
    const delivery: ClientDelivery = {
      id: Math.random().toString(36).substr(2, 9),
      clientName,
      timestamp: new Date().toISOString(),
      items: { ...clientItems },
      rota: activeRota
    };

    const updatedLog = { ...currentLog };
    updatedLog.clientDeliveries[activeRota] = [delivery, ...(updatedLog.clientDeliveries[activeRota] || [])];
    setLogs(prev => ({ ...prev, [date]: updatedLog }));

    await supabase.from('deliveries').insert({
      id: delivery.id, date, rota: activeRota, client_name: clientName, items: clientItems, delivery_timestamp: delivery.timestamp
    });

    setClientName('');
    setClientItems({});
  };

  const metrics = useMemo(() => {
    let totalCarga = 0;
    let totalFaltas = 0;
    ROTAS.forEach(r => {
      Object.values(currentLog.rotaInbound[r] || {}).forEach(v => totalCarga += (v as number));
    });
    return { totalCarga };
  }, [currentLog]);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-[#3D231A]">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 p-4">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Logo className="h-10" />
            <div className="flex flex-col">
              <span className="font-black text-sm tracking-tighter">ValorCafé Log</span>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                <div className={`w-1.5 h-1.5 rounded-full ${isSyncing ? 'bg-amber-400 animate-pulse' : 'bg-green-500'}`} />
                {isSyncing ? 'Sincronizando...' : 'Nuvem Ativa'}
              </span>
            </div>
          </div>
          <input 
            type="date" 
            value={date} 
            onChange={e => setDate(e.target.value)}
            className="bg-slate-100 px-3 py-1.5 rounded-full text-[10px] font-black outline-none border border-slate-200 uppercase"
          />
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 md:p-8 space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <span className="text-[9px] font-black text-slate-400 uppercase block mb-1">Carga Total Hoje</span>
            <span className="text-3xl font-black">{metrics.totalCarga} <small className="text-xs text-slate-300">UN</small></span>
          </div>
          <div className="bg-[#3D231A] p-5 rounded-2xl shadow-lg text-white">
            <span className="text-[9px] font-black text-white/40 uppercase block mb-1">Status Operacional</span>
            <span className="text-sm font-bold flex items-center gap-2">
              <i className="fas fa-truck-fast text-[#F9A11B]"></i> Monitoramento Ativo
            </span>
          </div>
        </div>

        <div className="flex overflow-x-auto gap-2 pb-2">
          {ROTAS.map(r => (
            <button 
              key={r}
              onClick={() => setActiveRota(r)}
              className={`px-5 py-3 rounded-xl text-[10px] font-black uppercase whitespace-nowrap transition-all border ${
                activeRota === r ? 'bg-[#3D231A] text-white border-[#3D231A]' : 'bg-white border-slate-200 text-slate-500'
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        {activeRota ? (
          <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div className="bg-slate-50 p-6 border-b border-slate-100 flex justify-between items-center">
              <h2 className="font-black text-lg">Região: {activeRota}</h2>
              <span className="bg-[#F9A11B]/10 text-[#F9A11B] px-3 py-1 rounded-full text-[10px] font-black uppercase">
                {(currentLog.clientDeliveries[activeRota] || []).length} Entregas
              </span>
            </div>

            <div className="p-6 space-y-8">
              <section>
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Carga Inicial (Inbound)</h3>
                <ProductInput 
                  values={currentLog.rotaInbound[activeRota] || {}} 
                  onChange={(p: any, v: any) => handleUpdateInbound(activeRota, { ...(currentLog.rotaInbound[activeRota] || {}), [p]: v })}
                />
              </section>

              <section className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Registrar Nova Entrega</h3>
                <input 
                  type="text" 
                  placeholder="Nome do Cliente"
                  value={clientName}
                  onChange={e => setClientName(e.target.value)}
                  className="w-full mb-4 px-4 py-2 rounded-xl border border-slate-200 outline-none text-sm font-bold focus:ring-2 focus:ring-[#F9A11B]/20"
                />
                <ProductInput values={clientItems} onChange={(p: any, v: any) => setClientItems(prev => ({...prev, [p]: v}))} />
                <button 
                  onClick={handleAddDelivery}
                  className="w-full mt-6 py-3 bg-[#3D231A] text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-[#3D231A]/20"
                >
                  Confirmar Entrega
                </button>
              </section>

              <section>
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Lista de Entregas</h3>
                <div className="space-y-3">
                  {(currentLog.clientDeliveries[activeRota] || []).map(d => (
                    <div key={d.id} className="p-4 bg-white border border-slate-100 rounded-xl flex flex-col gap-2">
                      <div className="flex justify-between items-center">
                        <span className="font-black text-sm">{d.clientName}</span>
                        <span className="text-[8px] font-bold text-slate-300">{new Date(d.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(d.items).map(([p, q]) => (q as number) > 0 && (
                          <span key={p} className="text-[9px] font-bold bg-[#F9A11B]/5 text-[#F9A11B] px-2 py-0.5 rounded-md">
                            {q} {p}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                  {(currentLog.clientDeliveries[activeRota] || []).length === 0 && (
                    <div className="text-center py-10 text-slate-300 font-bold text-xs uppercase">Nenhuma entrega registrada</div>
                  )}
                </div>
              </section>
            </div>
          </div>
        ) : (
          <div className="py-20 text-center border-4 border-dashed border-slate-100 rounded-[3rem]">
            <i className="fas fa-map-location-dot text-4xl text-slate-200 mb-4"></i>
            <h3 className="text-slate-400 font-black uppercase text-sm tracking-widest">Selecione uma região</h3>
          </div>
        )}
      </main>

      <footer className="p-10 text-center text-[9px] font-black text-slate-200 uppercase tracking-[0.5em]">
        ValorCafé Digital Infrastructure
      </footer>
    </div>
  );
}
