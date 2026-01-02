
import React from 'react';
import { ProductName, PRODUCTS } from '../types';

interface ProductInputProps {
  values: { [p: string]: number };
  onChange: (product: ProductName, value: number) => void;
  label?: string;
}

const ProductInput: React.FC<ProductInputProps> = ({ values, onChange, label }) => {
  return (
    <div className="space-y-4">
      {label && <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">{label}</h4>}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4">
        {PRODUCTS.map(product => (
          <div key={product} className="flex items-center justify-between sm:justify-start gap-3 bg-slate-50/50 p-2 rounded-lg border border-slate-100">
            <label className="text-xs font-bold text-slate-600 truncate flex-1" title={product}>
              {product}
            </label>
            <input
              type="number"
              min="0"
              max="9999"
              value={values[product] || ''}
              placeholder="0"
              onKeyDown={(e) => {
                // Previne entrada de mais de 4 dígitos manualmente
                if (e.key !== 'Backspace' && e.key !== 'Delete' && e.key !== 'Tab' && (e.target as HTMLInputElement).value.length >= 4) {
                   if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
                     e.preventDefault();
                   }
                }
              }}
              onChange={(e) => {
                const val = e.target.value.slice(0, 4);
                onChange(product, parseInt(val) || 0);
              }}
              className="w-16 px-2 py-1.5 border border-slate-200 rounded text-center font-mono font-bold focus:ring-2 focus:ring-[#F9A11B] focus:border-transparent outline-none transition-all text-sm bg-white shadow-sm"
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProductInput;
