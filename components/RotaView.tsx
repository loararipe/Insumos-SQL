
import React, { useState } from 'react';
import { RotaName, PRODUCTS, DailyLog, ClientDelivery } from '../types';
import ProductInput from './ProductInput';

interface RotaViewProps {
  rota: RotaName;
  log: DailyLog;
  onUpdateInbound: (rota: RotaName, items: { [p: string]: number }) => void;
  onAddDelivery: (rota: RotaName, delivery: ClientDelivery) => void;
  onDeleteDelivery: (rota: RotaName, deliveryId: string) => void;
}

const RotaView: React.FC<RotaViewProps> = ({ rota, log, onUpdateInbound, onAddDelivery, onDeleteDelivery }) => {
  const [activeTab, setActiveTab] = useState<'stock' | 'clients' | 'summary'>('stock');
  const [clientName, setClientName] = useState('');
  const [clientItems, setClientItems] = useState<{ [p: string]: number }>({});

  const inbound = log.rotaInbound[rota] || {};
  const deliveries = log.clientDeliveries[rota] || [];

  const handleAddDelivery = () => {
    if (!clientName.trim()) return;
    // Fix: Added missing 'rota' property to match ClientDelivery type definition
    const newDelivery: ClientDelivery = {
      id: `${rota}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      clientName,
      timestamp: new Date().toISOString(),
      items: { ...clientItems },
      rota
    };
    onAddDelivery(rota, newDelivery);
    setClientName('');
    setClientItems({});
  };

  const totals = deliveries.reduce((acc, d) => {
    Object.entries(d.items).forEach(([p, q]) => acc[p] = (acc[p] || 0) + (q as number));
    return acc;
  }, {} as { [p: string]: number });

  return (
    <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden animate-in fade-in slide-in-from-top-4 duration-500">
      <div className="bg-slate-50 px-8 py-6 flex justify-between items-center border-b border-slate-100">
        <div>
          <h3 className="text-xl font-black text-[#3D231A] flex items-center">
            <span className="w-2 h-8 bg-[#F9A11B] rounded-full mr-4"></span>
            Região {rota}
          </h3>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Gerenciamento de Fluxo Local</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex flex-col items-end">
             <span className="text-[10px] font-black text-slate-400 uppercase">Progresso</span>
             <span className="text-xs font-bold text-[#3D231A]">{deliveries.length} Clientes</span>
          </div>
        </div>
      </div>

      <div className="flex bg-white">
        {['stock', 'clients', 'summary'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as any)}
            className={`flex-1 py-4 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 ${
              activeTab === tab 
                ? 'border-[#F9A11B] text-[#3D231A] bg-amber-50/30' 
                : 'border-transparent text-slate-300 hover:text-slate-500 hover:bg-slate-50'
            }`}
          >
            {tab === 'stock' ? 'Carga Inicial' : tab === 'clients' ? 'Entregas' : 'Balanço Final'}
          </button>
        ))}
      </div>

      <div className="p-8">
        {activeTab === 'stock' && (
          <div className="animate-in fade-in duration-300">
            <div className="mb-8 flex items-center justify-between">
               <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Registrar Itens do Carregamento</h4>
            </div>
            <ProductInput
              values={inbound}
              onChange={(p, v) => onUpdateInbound(rota, { ...inbound, [p]: v })}
            />
          </div>
        )}

        {activeTab === 'clients' && (
          <div className="animate-in fade-in duration-300 space-y-10">
            <div className="bg-slate-50 p-8 rounded-2xl border border-slate-100">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-8 h-8 bg-[#3D231A] text-white rounded-lg flex items-center justify-center text-xs">
                  <i className="fas fa-plus"></i>
                </div>
                <h4 className="text-xs font-black text-[#3D231A] uppercase tracking-widest">Nova Entrega na Rota</h4>
              </div>
              <input
                type="text"
                placeholder="Nome do Ponto de Venda / Cliente"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className="w-full px-5 py-3 rounded-xl border border-slate-200 mb-6 text-sm font-bold focus:ring-2 focus:ring-[#F9A11B] outline-none"
              />
              <ProductInput
                values={clientItems}
                onChange={(p, v) => setClientItems({ ...clientItems, [p]: v })}
              />
              <button
                onClick={handleAddDelivery}
                className="mt-8 w-full py-4 bg-[#3D231A] text-white rounded-xl font-black uppercase text-[10px] tracking-[0.2em] shadow-lg shadow-[#3D231A]/20 active:scale-95 transition-all"
              >
                Confirmar Registro
              </button>
            </div>

            <div className="space-y-4">
              <h4 className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Linha do Tempo</h4>
              {deliveries.length === 0 ? (
                <div className="py-10 text-center border-2 border-dashed border-slate-100 rounded-2xl text-slate-300 font-bold uppercase text-[10px]">Sem registros para {rota}</div>
              ) : (
                deliveries.map(del => (
                  <div key={del.id} className="bg-white border border-slate-100 p-6 rounded-2xl flex flex-col sm:flex-row justify-between items-start gap-4">
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <span className="text-sm font-black text-[#3D231A]">{del.clientName}</span>
                        <span className="text-[8px] font-bold bg-slate-100 text-slate-400 px-2 py-0.5 rounded uppercase">
                          {new Date(del.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(del.items).map(([p, q]) => (q as number) > 0 && (
                          <span key={p} className="text-[10px] font-bold text-[#F9A11B] bg-amber-50 px-2 py-1 rounded-md">
                            {q} {p}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button onClick={() => onDeleteDelivery(rota, del.id)} className="text-slate-200 hover:text-red-500 transition-colors">
                      <i className="fas fa-trash"></i>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'summary' && (
          <div className="animate-in fade-in duration-300">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
               <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Total Carga</span>
                  <span className="text-2xl font-black text-[#3D231A]">{Object.values(inbound).reduce((a: number, b: number) => a + b, 0)} <small className="text-xs text-slate-400">UN</small></span>
               </div>
               <div className="bg-amber-50 p-6 rounded-2xl border border-amber-100">
                  <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest block mb-2">Total Entregue</span>
                  <span className="text-2xl font-black text-[#F9A11B]">{Object.values(totals).reduce((a: number, b: number) => a + b, 0)} <small className="text-xs text-amber-400">UN</small></span>
               </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] font-black text-slate-400 border-b border-slate-100">
                    <th className="pb-4">PRODUTO</th>
                    <th className="pb-4 text-center">CARGA</th>
                    <th className="pb-4 text-center">CLIENTES</th>
                    <th className="pb-4 text-right">SOBRA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {PRODUCTS.map(p => {
                    const start = inbound[p] || 0;
                    const del = totals[p] || 0;
                    const rem = start - del;
                    if (start === 0 && del === 0) return null;
                    return (
                      <tr key={p} className="text-xs">
                        <td className="py-4 font-bold text-slate-600">{p}</td>
                        <td className="py-4 text-center font-mono">{start}</td>
                        <td className="py-4 text-center font-mono text-[#F9A11B] font-bold">{del}</td>
                        <td className="py-4 text-right">
                          <span className={`px-2 py-1 rounded font-mono font-bold ${rem < 0 ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'}`}>
                            {rem}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RotaView;
