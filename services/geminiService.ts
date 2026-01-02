
import { GoogleGenAI } from "@google/genai";
import { DailyLog } from "../types.ts";

export const generateDailyAIInsight = async (log: DailyLog): Promise<string> => {
  try {
    // Initializing the SDK following the mandatory guidelines
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const prompt = `
      Atue como um analista sênior de logística da ValorCafé. 
      Analise os seguintes dados de distribuição para o dia ${log.date}.
      
      REGRAS:
      1. Responda obrigatoriamente em Português Brasileiro.
      2. Forneça um resumo profissional e estratégico (máximo 100 palavras).
      3. Identifique a região com maior volume de entregas.
      4. Comente sobre o balanço de estoque (sobras ou faltas críticas).
      
      Dados da Operação: ${JSON.stringify(log)}
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });

    // Access the .text property directly as per the current SDK standard
    return response.text || "Resumo indisponível no momento.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Erro ao processar análise. Verifique a conexão.";
  }
};
