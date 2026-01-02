
import React from 'react';

const Logo: React.FC<{ className?: string }> = ({ className = "h-20" }) => {
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <svg 
        viewBox="0 0 400 400" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
        className="h-full w-auto"
      >
        {/* Cores Oficiais extraídas do Favicon: 
            Âmbar: #F9A11B
            Café Escuro: #3D231A 
        */}
        
        {/* Aroma/Chamas - Âmbar Vibrante */}
        <g id="aroma">
          {/* Chama Principal Superior */}
          <path 
            d="M200 180C200 140 160 100 185 50C195 25 220 5 200 0C240 40 215 85 220 120C225 155 200 170 200 180Z" 
            fill="#F9A11B" 
          />
          {/* Chama Secundária Direita */}
          <path 
            d="M228 175C228 145 255 125 242 95C238 80 220 70 230 50C210 80 225 110 218 130C212 150 228 165 228 175Z" 
            fill="#F9A11B" 
            opacity="0.85"
          />
        </g>
        
        {/* Base e Círculos - Marrom Café */}
        <g id="base" transform="translate(0, 35)">
          {/* Arcos Laterais Finos */}
          <path 
            d="M130 200C110 230 110 280 130 310" 
            stroke="#3D231A" 
            strokeWidth="1.5" 
            strokeLinecap="round" 
          />
          <path 
            d="M270 200C290 230 290 280 270 310" 
            stroke="#3D231A" 
            strokeWidth="1.5" 
            strokeLinecap="round" 
          />
          
          {/* Círculos Concêntricos */}
          <circle cx="200" cy="255" r="78" stroke="#3D231A" strokeWidth="6" />
          <circle cx="200" cy="255" r="56" fill="#3D231A" />
          
          {/* Curva de Base (Pires/Assentamento) */}
          <path 
            d="M125 255C125 315 160 355 200 355C240 355 275 315 275 255" 
            stroke="#3D231A" 
            strokeWidth="3.5" 
            fill="none" 
          />
        </g>
      </svg>
    </div>
  );
};

export default Logo;
