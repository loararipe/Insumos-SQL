
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from "@google/genai";

// --- CONFIGURAÇÕES E TIPOS ---
// Fix: Access process.env directly instead of window.process.env to avoid TypeScript error on Window object
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || "";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export type RotaName = 'Barra' | 'Botafogo' | 'Centro' | 'Copacabana' | 'Niteroi' | 'Norte' | 'Tijuca';
export const ROTAS: RotaName[] = ['Barra', 'Botafogo', 'Centro', 'Copacabana', 'Niteroi', 'Norte', 'Tijuca'];
export const PRODUCTS = [
  'Café', 'Café organico', 'Açucar', 'Adoçante', 'Chocolate', 'Leite', 
  'Copo 160', 'Copo 160 AE', 'Copo Isopor', 'Adoçante líquido', 'Xicaras', 'Outros'
] as const;
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

const LOCAL_STORAGE_KEY = 'valorcafe_v3_persistent';

// --- COMPONENTES DE INTERFACE ---

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

const ProductInputGrid = ({ values, onChange }: { values: any, onChange: (p: ProductName, v: number) => void }) => (
  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
    {PRODUCTS.map(p => (
      <div key={p} className="flex flex-col bg-slate-50 border border-slate-100 p-3 rounded-xl hover:border-amber-200 transition-colors">
        <label className="text-[9px] font-black text-slate-400 uppercase mb-1 truncate tracking-wider">{p}</label>
        <input 
          type="number" 
          inputMode="numeric"
          min="0"
          value={values[p] || ''} 
          onChange={e => onChange(p, Math.max(0, parseInt(e.target.value) || 0))}
          className="bg-transparent font-mono font-black text-[#3D231A] outline-none text-sm placeholder-slate-300"
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
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  
  const [activeRota, setActiveRota] = useState<RotaName | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [clientName, setClientName] = useState('');
  const [clientItems, setClientItems] = useState<{ [p: string]: number }>({});
  const [aiInsight, setAiInsight] = useState<string>('');

  // Persistência Local
  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(logs));
  }, [logs]);

  // Sincronização com Cloud (Supabase)
  const syncFromCloud = useCallback(async (targetDate: string) => {
    if (!SUPABASE_URL || SUPABASE_URL.includes('placeholder')) return;
    setIsSyncing(true);
    try {
      const [inboundRes, deliveryRes] = await Promise.all([
        supabase.from('inbound').select('*').eq('date', targetDate),
        supabase.from('deliveries').select('*').eq('date', targetDate)
      ]);

      const newLog: DailyLog = { date: targetDate, rotaInbound: {}, clientDeliveries: {} };
      
      inboundRes.data?.forEach(r => {
        if (!newLog.rotaInbound[r.rota as RotaName]) newLog.rotaInbound[r.rota as RotaName] = {};
        newLog.rotaInbound[r.rota as RotaName]![r.product_name] = r.quantity;
      });

      deliveryRes.data?.forEach(r => {
        if (!newLog.clientDeliveries[r.rota as RotaName]) newLog.clientDeliveries[r.rota as RotaName] = [];
        newLog.clientDeliveries[r.rota as RotaName]!.push({
          id: r.id,
          clientName: r.client_name,
          timestamp: r.delivery_timestamp,
          items: r.items,
          rota: r.rota as RotaName
        });
      });

      setLogs(prev => ({ ...prev, [targetDate]: newLog }));
    } catch (err) {
      console.error("Cloud Sync Error:", err);
    } finally {
      setIsSyncing(false);
    }
  }, []);

  useEffect(() => {
    syncFromCloud(date);
  }, [date, syncFromCloud]);

  const currentLog = useMemo(() => logs[date] || { date, rotaInbound: {}, clientDeliveries: {} }, [logs, date]);

  // Ações
  const handleUpdateInbound = async (rota: RotaName, items: any) => {
    const updatedLog = { ...currentLog };
    updatedLog.rotaInbound = { ...updatedLog.rotaInbound, [rota]: items };
    setLogs(prev => ({ ...prev, [date]: updatedLog }));

    // Sync cloud background
    const upserts = Object.entries(items).map(([p, q]) => ({
      date, rota, product_name: p, quantity: q
    }));
    await supabase.from('inbound').upsert(upserts, { onConflict: 'date,rota,product_name' });
  };

  const handleAddDelivery = async () => {
    if (!clientName.trim() || !activeRota) return;
    
    const delivery: ClientDelivery = {
      id: `del-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      clientName,
      timestamp: new Date().toISOString(),
      items: { ...clientItems },
      rota: activeRota
    };

    const updatedLog = { ...currentLog };
    updatedLog.clientDeliveries[activeRota] = [delivery, ...(updatedLog.clientDeliveries[activeRota] || [])];
    setLogs(prev => ({ ...prev, [date]: updatedLog }));

    await supabase.from('deliveries').insert({
      id: delivery.id,
      date,
      rota: activeRota,
      client_name: clientName,
      items: clientItems,
      delivery_timestamp: delivery.timestamp
    });

    setClientName('');
    setClientItems({});
  };

  // Fix: handleGetInsight already uses process.env.API_KEY correctly.
  const handleGetInsight = async () => {
    setAiInsight('Analisando operação...');
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Analise a logística da ValorCafé para o dia ${date}. Dados: ${JSON.stringify(currentLog)}. Seja breve e estratégico em PT-BR.`
      });
      setAiInsight(response.text || "Sem insights no momento.");
    } catch {
      setAiInsight("Erro ao contatar IA logística.");
    }
  };

  const metrics = useMemo(() => {
    let totalCarga = 0;
    let totalEntregas = 0;
    ROTAS.forEach(r => {
      Object.values(currentLog.rotaInbound[r] || {}).forEach(v => totalCarga += (v as number));
      totalEntregas += (currentLog.clientDeliveries[r] || []).length;
    });
    return { totalCarga, totalEntregas };
  }, [currentLog]);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-[#3D231A] flex flex-col">
      {/* Header Fixo */}
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-50 px-4 py-3 shadow-sm">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Logo className="h-9" />
            <div className="flex flex-col">
              <span className="font-black text-xs tracking-tighter uppercase">ValorCafé Log v3</span>
              <div className="flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${isSyncing ? 'bg-amber-400 animate-pulse' : 'bg-green-500'}`} />
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">
                  {isSyncing ? 'Sincronizando Cloud' : 'Operação Conectada'}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <i className="fas fa-calendar-alt text-slate-300 text-xs"></i>
            <input 
              type="date" 
              value={date} 
              onChange={e => setDate(e.target.value)}
              className="bg-slate-100 px-3 py-1.5 rounded-xl text-[10px] font-black outline-none border border-slate-200 uppercase text-slate-600 focus:bg-white focus:ring-2 focus:ring-amber-100 transition-all"
            />
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full p-4 md:p-8 space-y-6 animate-fade-in">
        {/* Dash de Resumo */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Volume Total Saída</span>
            <span className="text-3xl font-black">{metrics.totalCarga} <small className="text-xs text-slate-300">UN</small></span>
          </div>
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Entregas Realizadas</span>
            <span className="text-3xl font-black text-[#F9A11B]">{metrics.totalEntregas} <small className="text-xs text-amber-200">PDVs</small></span>
          </div>
          <div className="bg-[#3D231A] p-6 rounded-3xl shadow-xl text-white relative overflow-hidden flex flex-col justify-between min-h-[120px]">
            <div className="z-10">
              <span className="text-[9px] font-black text-white/40 uppercase tracking-widest block mb-1">IA Operacional</span>
              <p className="text-[10px] font-medium leading-relaxed italic line-clamp-2">
                {aiInsight || "Clique no raio para uma análise estratégica instantânea."}
              </p>
            </div>
            <button 
              onClick={handleGetInsight}
              className="absolute right-4 bottom-4 w-8 h-8 bg-[#F9A11B] rounded-xl flex items-center justify-center shadow-lg active:scale-90 transition-transform"
            >
              <i className="fas fa-bolt text-xs text-[#3D231A]"></i>
            </button>
            <div className="absolute -right-10 -bottom-10 w-24 h-24 bg-white/5 rounded-full blur-2xl"></div>
          </div>
        </div>

        {/* Seletor de Rota */}
        <div className="space-y-3">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] ml-1">Selecione a Região de Trabalho</h3>
          <div className="flex overflow-x-auto gap-2 pb-2 no-scrollbar">
            {ROTAS.map(r => (
              <button 
                key={r}
                onClick={() => setActiveRota(r)}
                className={`px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all border ${
                  activeRota === r 
                    ? 'bg-[#3D231A] text-white border-[#3D231A] shadow-lg -translate-y-1' 
                    : 'bg-white border-slate-200 text-slate-400 hover:border-amber-200'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* View da Rota Ativa */}
        {activeRota ? (
          <div className="space-y-6 animate-fade-in">
            {/* Bloco 1: Carga Inicial */}
            <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm p-6 md:p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-slate-100 rounded-2xl flex items-center justify-center text-[#3D231A]">
                  <i className="fas fa-truck-loading"></i>
                </div>
                <div>
                  <h2 className="font-black text-lg">Carga Inicial: {activeRota}</h2>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Estoque que sai do CD para a rota</p>
                </div>
              </div>
              <ProductInputGrid 
                values={currentLog.rotaInbound[activeRota] || {}} 
                onChange={(p, v) => handleUpdateInbound(activeRota, { ...(currentLog.rotaInbound[activeRota] || {}), [p]: v })}
              />
            </div>

            {/* Bloco 2: Registrar Entrega */}
            <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm p-6 md:p-8 border-l-4 border-l-[#F9A11B]">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-amber-50 rounded-2xl flex items-center justify-center text-[#F9A11B]">
                  <i className="fas fa-user-check"></i>
                </div>
                <div>
                  <h2 className="font-black text-lg">Nova Entrega no PDV</h2>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Registrar baixa de insumos no cliente</p>
                </div>
              </div>
              
              <input 
                type="text" 
                placeholder="Nome do Estabelecimento / Cliente"
                value={clientName}
                onChange={e => setClientName(e.target.value)}
                className="w-full mb-6 px-5 py-3 rounded-2xl border border-slate-100 bg-slate-50 outline-none text-sm font-bold focus:bg-white focus:ring-4 focus:ring-amber-50 transition-all placeholder-slate-300"
              />
              
              <ProductInputGrid 
                values={clientItems} 
                onChange={(p, v) => setClientItems(prev => ({...prev, [p]: v}))} 
              />
              
              <button 
                onClick={handleAddDelivery}
                disabled={!clientName}
                className="w-full mt-8 py-4 bg-[#3D231A] text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl shadow-[#3D231A]/20 active:scale-[0.98] transition-all disabled:opacity-30"
              >
                Confirmar e Gravar Registro
              </button>
            </div>

            {/* Bloco 3: Lista de Entregas */}
            <div className="space-y-4">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] ml-1">Linha do Tempo de Entregas</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(currentLog.clientDeliveries[activeRota] || []).map(d => (
                  <div key={d.id} className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h4 className="font-black text-sm">{d.clientName}</h4>
                        <span className="text-[8px] font-bold text-slate-300 uppercase">{new Date(d.timestamp).toLocaleTimeString('pt-BR')}</span>
                      </div>
                      <i className="fas fa-check-circle text-green-500 text-xs"></i>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(d.items).map(([p, q]) => (q as number) > 0 && (
                        <span key={p} className="text-[8px] font-black bg-[#F9A11B]/10 text-[#F9A11B] px-2 py-1 rounded-lg uppercase">
                          {q} {p}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
                {(currentLog.clientDeliveries[activeRota] || []).length === 0 && (
                  <div className="col-span-full py-12 text-center border-4 border-dashed border-slate-100 rounded-[2.5rem]">
                    <p className="text-slate-300 font-black text-[10px] uppercase tracking-widest">Nenhuma entrega registrada nesta rota hoje</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="py-24 text-center">
            <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm border border-slate-100 text-slate-200">
              <i className="fas fa-map-marked-alt text-2xl"></i>
            </div>
            <h3 className="text-slate-400 font-black uppercase text-xs tracking-[0.3em]">Aguardando Seleção de Rota</h3>
            <p className="text-slate-300 text-[10px] mt-2 font-medium max-w-xs mx-auto">Selecione uma região acima para iniciar o monitoramento e registro de cargas e entregas.</p>
          </div>
        )}
      </main>

      <footer className="p-8 text-center">
        <div className="h-px bg-slate-200 w-24 mx-auto mb-6"></div>
        <span className="text-[8px] font-black text-slate-300 uppercase tracking-[0.6em]">ValorCafé Cloud Services &copy; 2024</span>
      </footer>
    </div>
  );
}
