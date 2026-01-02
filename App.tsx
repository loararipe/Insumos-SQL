
import React, { useState, useEffect, useMemo } from 'react';
import { RotaName, ROTAS, DailyLog, ClientDelivery, AppState, PRODUCTS } from './types.ts';
import RotaView from './components/RotaView.tsx';
import Logo from './components/Logo.tsx';
import { exportToTxt } from './utils/export.ts';
import { generateDailyAIInsight } from './services/geminiService.ts';
import { supabase } from './services/supabaseClient.ts';

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(() => {
    const today = new Date().toISOString().split('T')[0];
    return {
      logs: {},
      currentDate: today,
      isCloudSynced: true
    };
  });

  const [aiInsight, setAiInsight] = useState<string>('');
  const [isInsightLoading, setIsInsightLoading] = useState(false);
  const [activeRota, setActiveRota] = useState<RotaName | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Função para carregar dados do Supabase
  const fetchData = async (date: string) => {
    setState(prev => ({ ...prev, isCloudSynced: false }));
    
    try {
      // 1. Buscar Carga Inicial (Inbound)
      const { data: inboundData, error: inboundError } = await supabase
        .from('inbound')
        .select('*')
        .eq('date', date);

      if (inboundError) throw inboundError;

      // 2. Buscar Entregas (Deliveries)
      const { data: deliveriesData, error: deliveriesError } = await supabase
        .from('deliveries')
        .select('*')
        .eq('date', date);

      if (deliveriesError) throw deliveriesError;

      // 3. Transformar dados para o formato DailyLog
      const newLog: DailyLog = {
        date,
        rotaInbound: {},
        clientDeliveries: {}
      };

      inboundData?.forEach(row => {
        const rota = row.rota as RotaName;
        if (!newLog.rotaInbound[rota]) newLog.rotaInbound[rota] = {};
        newLog.rotaInbound[rota]![row.product_name] = row.quantity;
      });

      deliveriesData?.forEach(row => {
        const rota = row.rota as RotaName;
        if (!newLog.clientDeliveries[rota]) newLog.clientDeliveries[rota] = [];
        newLog.clientDeliveries[rota]!.push({
          id: row.id,
          clientName: row.client_name,
          timestamp: row.delivery_timestamp,
          items: row.items,
          rota: rota
        });
      });

      setState(prev => ({
        ...prev,
        logs: { ...prev.logs, [date]: newLog },
        isCloudSynced: true
      }));
    } catch (error) {
      console.error("Error fetching from Supabase:", error);
      setState(prev => ({ ...prev, isCloudSynced: true }));
    } finally {
      setIsInitialLoad(false);
    }
  };

  // Carregar dados toda vez que a data mudar
  useEffect(() => {
    fetchData(state.currentDate);
  }, [state.currentDate]);

  const currentLog = useMemo(() => {
    return state.logs[state.currentDate] || {
      date: state.currentDate,
      rotaInbound: {},
      clientDeliveries: {}
    };
  }, [state.logs, state.currentDate]);

  const handleUpdateInbound = async (rota: RotaName, items: { [p: string]: number }) => {
    setState(prev => ({ ...prev, isCloudSynced: false }));
    
    // Preparar dados para o formato da tabela do banco
    const upserts = Object.entries(items).map(([p, q]) => ({
      date: state.currentDate,
      rota: rota,
      product_name: p,
      quantity: q
    }));

    try {
      const { error } = await supabase
        .from('inbound')
        .upsert(upserts, { onConflict: 'date,rota,product_name' });

      if (error) throw error;
      
      // Atualiza localmente após sucesso no banco
      const newLog = { ...currentLog };
      newLog.rotaInbound = { ...newLog.rotaInbound, [rota]: items };
      setState(prev => ({
        ...prev,
        logs: { ...prev.logs, [prev.currentDate]: newLog },
        isCloudSynced: true
      }));
    } catch (e) {
      console.error("Save error:", e);
      alert("Erro ao salvar carga no banco de dados.");
      setState(prev => ({ ...prev, isCloudSynced: true }));
    }
  };

  const handleAddDelivery = async (rota: RotaName, delivery: ClientDelivery) => {
    setState(prev => ({ ...prev, isCloudSynced: false }));
    
    try {
      const { error } = await supabase
        .from('deliveries')
        .insert({
          id: delivery.id,
          date: state.currentDate,
          rota: rota,
          client_name: delivery.clientName,
          items: delivery.items,
          delivery_timestamp: delivery.timestamp
        });

      if (error) throw error;

      const newLog = { ...currentLog };
      const currentRels = newLog.clientDeliveries[rota] || [];
      newLog.clientDeliveries = { ...newLog.clientDeliveries, [rota]: [delivery, ...currentRels] };
      
      setState(prev => ({
        ...prev,
        logs: { ...prev.logs, [prev.currentDate]: newLog },
        isCloudSynced: true
      }));
    } catch (e) {
      console.error("Delivery error:", e);
      alert("Erro ao registrar entrega no banco de dados.");
      setState(prev => ({ ...prev, isCloudSynced: true }));
    }
  };

  const handleDeleteDelivery = async (rota: RotaName, deliveryId: string) => {
    if (!window.confirm("Excluir registro permanentemente do banco?")) return;
    setState(prev => ({ ...prev, isCloudSynced: false }));
    
    try {
      const { error } = await supabase
        .from('deliveries')
        .delete()
        .eq('id', deliveryId);

      if (error) throw error;

      const newLog = { ...currentLog };
      const currentRels = newLog.clientDeliveries[rota] || [];
      newLog.clientDeliveries = { ...newLog.clientDeliveries, [rota]: currentRels.filter(d => d.id !== deliveryId) };
      
      setState(prev => ({
        ...prev,
        logs: { ...prev.logs, [prev.currentDate]: newLog },
        isCloudSynced: true
      }));
    } catch (e) {
      console.error("Delete error:", e);
      setState(prev => ({ ...prev, isCloudSynced: true }));
    }
  };

  const handleAiAnalysis = async () => {
    setIsInsightLoading(true);
    try {
      const insight = await generateDailyAIInsight(currentLog);
      setAiInsight(insight);
    } catch (error) {
      setAiInsight("Erro na conexão com o cérebro logístico.");
    } finally {
      setIsInsightLoading(false);
    }
  };

  const globalMetrics = useMemo(() => {
    let totalCarga = 0;
    let totalEntregue = 0;
    const itemsDelivered: { [p: string]: number } = {};

    ROTAS.forEach(r => {
      const inbound = currentLog.rotaInbound[r] || {};
      const deliveries = currentLog.clientDeliveries[r] || [];
      
      Object.values(inbound).forEach(v => totalCarga += (v as number));
      deliveries.forEach(d => {
        Object.entries(d.items).forEach(([p, q]) => {
          totalEntregue += (q as number);
          itemsDelivered[p] = (itemsDelivered[p] || 0) + (q as number);
        });
      });
    });

    return { totalCarga, totalEntregue, itemsDelivered };
  }, [currentLog]);

  return (
    <div className="min-h-screen pb-24 flex flex-col bg-[#f8fafc]">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 px-4 md:px-10 py-3 shadow-sm">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center">
            <Logo className="h-10 md:h-12" />
            <div className="border-l border-slate-200 pl-4 h-8 flex flex-col justify-center ml-4">
              <span className="text-base font-black text-[#3D231A]">ValorCafé</span>
              <div className="flex items-center gap-2">
                <span className="text-[8px] font-bold text-[#F9A11B] uppercase tracking-widest">Live Cloud Ops</span>
                <span className={`w-1.5 h-1.5 rounded-full ${state.isCloudSynced ? 'bg-green-500 animate-pulse' : 'bg-amber-500 animate-spin-slow'}`}></span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center bg-slate-100 rounded-full px-3 py-1.5 border border-slate-200">
               <i className="fas fa-calendar-day text-[10px] text-slate-400 mr-2"></i>
               <input
                type="date"
                value={state.currentDate}
                onChange={(e) => setState(prev => ({ ...prev, currentDate: e.target.value }))}
                className="bg-transparent text-[10px] font-black text-slate-600 outline-none uppercase"
              />
            </div>
            <button
              onClick={() => exportToTxt(currentLog)}
              className="bg-[#3D231A] text-white w-10 h-10 rounded-xl shadow-lg flex items-center justify-center active:scale-95 transition-transform"
              title="Relatório Gerencial"
            >
              <i className="fas fa-file-pdf"></i>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 md:px-10 py-8">
        
        {isInitialLoad ? (
           <div className="flex flex-col items-center justify-center py-20">
              <div className="w-10 h-10 border-4 border-slate-200 border-t-[#F9A11B] rounded-full animate-spin mb-4"></div>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sincronizando com Banco...</span>
           </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
               <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm col-span-1 md:col-span-1">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Carga Total Saída</span>
                  <div className="flex items-end gap-2">
                    <span className="text-3xl font-black text-[#3D231A]">{globalMetrics.totalCarga}</span>
                    <span className="text-[10px] font-bold text-slate-400 mb-1.5 uppercase">Itens</span>
                  </div>
               </div>
               <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm col-span-1 md:col-span-1">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Efetividade Entregas</span>
                  <div className="flex items-end gap-2">
                    <span className="text-3xl font-black text-[#F9A11B]">{globalMetrics.totalEntregue}</span>
                    <span className="text-[10px] font-bold text-amber-400 mb-1.5 uppercase">Realizadas</span>
                  </div>
               </div>
               <div className="bg-[#3D231A] p-6 rounded-3xl shadow-xl col-span-1 md:col-span-2 text-white relative overflow-hidden">
                  <div className="relative z-10 flex justify-between items-start">
                    <div>
                      <span className="text-[9px] font-black text-white/50 uppercase tracking-widest block mb-2">IA Insight Logístico</span>
                      <p className="text-xs font-medium leading-relaxed max-w-[80%] line-clamp-2">
                        {aiInsight || "Consolidação automática ativa. Clique em analisar para insights estratégicos."}
                      </p>
                    </div>
                    <button 
                      onClick={handleAiAnalysis}
                      disabled={isInsightLoading}
                      className="bg-white/10 hover:bg-white/20 p-2.5 rounded-xl transition-colors"
                    >
                      {isInsightLoading ? <i className="fas fa-sync fa-spin"></i> : <i className="fas fa-bolt text-[#F9A11B]"></i>}
                    </button>
                  </div>
                  <div className="absolute -right-10 -bottom-10 w-32 h-32 bg-[#F9A11B] opacity-10 rounded-full blur-2xl"></div>
               </div>
            </div>

            <div className="mb-6">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 ml-1">Monitoramento por Região</h4>
              <div className="flex flex-wrap gap-2">
                {ROTAS.map(rota => {
                  const hasInbound = (currentLog.rotaInbound[rota] && Object.values(currentLog.rotaInbound[rota]!).some(v => (v as number) > 0));
                  const hasDeliveries = (currentLog.clientDeliveries[rota] && currentLog.clientDeliveries[rota]!.length > 0);
                  return (
                    <button
                      key={rota}
                      onClick={() => setActiveRota(rota)}
                      className={`relative px-6 py-4 rounded-2xl text-[11px] font-black tracking-widest transition-all border ${
                        activeRota === rota 
                          ? 'bg-[#3D231A] text-white border-[#3D231A] shadow-xl shadow-[#3D231A]/20 -translate-y-1' 
                          : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                      }`}
                    >
                      {rota.toUpperCase()}
                      {(hasInbound || hasDeliveries) && activeRota !== rota && (
                        <span className="absolute top-2 right-2 w-2 h-2 bg-green-500 rounded-full border-2 border-white"></span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {activeRota ? (
              <RotaView
                rota={activeRota}
                log={currentLog}
                onUpdateInbound={handleUpdateInbound}
                onAddDelivery={handleAddDelivery}
                onDeleteDelivery={handleDeleteDelivery}
              />
            ) : (
              <div className="bg-white border border-slate-200 rounded-[2.5rem] p-20 text-center shadow-sm">
                <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-8">
                  <i className="fas fa-map-location-dot text-3xl text-slate-200"></i>
                </div>
                <h3 className="text-[#3D231A] font-black text-xl mb-2">Visão Geral Ativa</h3>
                <p className="text-slate-400 text-sm max-w-sm mx-auto">Selecione uma região acima para gerenciar o carregamento ou registrar entregas em tempo real sincronizadas na nuvem.</p>
              </div>
            )}
          </>
        )}
      </main>

      <footer className="mt-auto py-8 text-center text-slate-300 text-[9px] font-bold uppercase tracking-[0.4em]">
        ValorCafé Cloud Infrastructure &copy; 2024
      </footer>
    </div>
  );
};

export default App;
