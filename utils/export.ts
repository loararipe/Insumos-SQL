
import { DailyLog, ROTAS, PRODUCTS } from "../types";

export const exportToTxt = (log: DailyLog) => {
  let content = `VALORCAFE - RELATÓRIO CONSOLIDADO CLOUD - ${log.date}\n`;
  content += `Gerado em: ${new Date().toLocaleString('pt-BR')}\n`;
  content += `================================================\n\n`;

  const globalTotalInbound: { [p: string]: number } = {};
  const globalTotalClientDelivered: { [p: string]: number } = {};

  ROTAS.forEach(rota => {
    const inbound = log.rotaInbound[rota] || {};
    const deliveries = log.clientDeliveries[rota] || [];
    
    if (Object.keys(inbound).length === 0 && deliveries.length === 0) return;

    content += `[REGIONAL: ${rota}]\n`;
    content += `------------------------------------------------\n`;
    
    content += `Carga Inicial:\n`;
    PRODUCTS.forEach(p => {
      const qty = inbound[p] || 0;
      if (qty > 0) {
        content += `  - ${p}: ${qty}\n`;
        globalTotalInbound[p] = (globalTotalInbound[p] || 0) + qty;
      }
    });

    content += `\nEntregas:\n`;
    deliveries.forEach(del => {
      content += `  > ${del.clientName} (${new Date(del.timestamp).toLocaleTimeString('pt-BR')})\n`;
      Object.entries(del.items).forEach(([p, qty]) => {
        if ((qty as number) > 0) {
          content += `    . ${p}: ${qty}\n`;
          globalTotalClientDelivered[p] = (globalTotalClientDelivered[p] || 0) + (qty as number);
        }
      });
    });
    content += `\n\n`;
  });

  content += `================================================\n`;
  content += `BALANÇO GERAL DO DIA\n`;
  content += `================================================\n\n`;

  PRODUCTS.forEach(p => {
    const totalIn = globalTotalInbound[p] || 0;
    const totalOut = globalTotalClientDelivered[p] || 0;
    if (totalIn > 0 || totalOut > 0) {
      content += `${p.padEnd(20)}: Saída(${totalIn}) | Entregue(${totalOut}) | Retorno(${totalIn - totalOut})\n`;
    }
  });

  downloadFile(`Relatorio_Cloud_ValorCafe_${log.date}.txt`, content, "text/plain");
};

const downloadFile = (name: string, content: string, type: string) => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
};
