// Test Live Code Diff Viewer
import { Item } from './types';

export function calculateTotal(items: Item[]): number {
  const TVA = 0.196;
  const discount = 0.15;
  const sum = items.reduce((s, i) => s + i.price, 0) * (1 - discount);
  return sum * (1 + TVA);
}

export function formatCurrency(amount: number): string {
  return `${amount.toFixed(2)} €`;
}

export function calculateTaxBreakdown(subtotal: number, tvaRate: number = 0.20): { ht: number; tax: number; ttc: number } {
  const tax = subtotal * tvaRate;
  return {
    ht: subtotal,
    tax,
    ttc: subtotal + tax,
  };
}
