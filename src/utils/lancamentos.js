import { colors } from '../theme/colors';

export const DESTINOS = [
  { id: 'Lixo', label: 'Lixo', emoji: '🗑️' },
  { id: 'Doação', label: 'Doação', emoji: '💚' },
  { id: 'Transformação', label: 'Transformação', emoji: '♻️' },
  { id: 'Venda Resgatada', label: 'Venda Resgatada', emoji: '💰' },
];

export function getDestinoColor(destino) {
  switch (destino) {
    case 'Lixo':
      return colors.accent;
    case 'Doação':
      return colors.green;
    case 'Transformação':
      return colors.gold;
    case 'Venda Resgatada':
      return colors.blue;
    default:
      return colors.muted;
  }
}

export function formatBRL(value) {
  const n = typeof value === 'number' ? value : parseFloat(value) || 0;
  return `R$ ${n.toFixed(2).replace('.', ',')}`;
}

export function formatarQuantidade(valor) {
  const n = typeof valor === 'number' ? valor : parseFloat(valor);
  if (isNaN(n)) return '0';
  const arredondado = Math.round(n * 1000) / 1000;
  if (Number.isInteger(arredondado)) return String(arredondado);
  return arredondado.toFixed(3).replace('.', ',');
}

export function formatTime(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  } catch {
    return '';
  }
}

export function getRangeForDate(date) {
  const inicio = new Date(date);
  inicio.setHours(0, 0, 0, 0);
  const fim = new Date(date);
  fim.setHours(23, 59, 59, 999);
  return { inicio, fim };
}
