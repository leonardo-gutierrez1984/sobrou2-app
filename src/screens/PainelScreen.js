import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  ToastAndroid,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import { supabase } from '../services/supabase';
import { colors } from '../theme/colors';
import AppHeader from '../components/AppHeader';

const SERIF = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });

const DESTINO_BLUE = colors.blue;

const DESTINOS = [
  { id: 'Lixo', emoji: '🗑️', color: colors.accent },
  { id: 'Doação', emoji: '💚', color: colors.green },
  { id: 'Transformação', emoji: '♻️', color: colors.gold },
  { id: 'Venda Resgatada', emoji: '💰', color: DESTINO_BLUE },
];

const FILTERS = [
  { id: 'hoje', label: 'Hoje' },
  { id: 'semana', label: 'Semana' },
  { id: 'mes', label: 'Mês' },
];

function getRange(filter) {
  const now = new Date();
  let inicio;
  let fim;
  if (filter === 'hoje') {
    inicio = new Date(now);
    inicio.setHours(0, 0, 0, 0);
    fim = new Date(now);
    fim.setHours(23, 59, 59, 999);
  } else if (filter === 'semana') {
    const day = now.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    inicio = new Date(now);
    inicio.setDate(now.getDate() + diffToMonday);
    inicio.setHours(0, 0, 0, 0);
    fim = new Date(inicio);
    fim.setDate(inicio.getDate() + 6);
    fim.setHours(23, 59, 59, 999);
  } else {
    inicio = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    fim = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  }
  return { inicio, fim };
}

function getPreviousRange(filter, currentInicio) {
  if (filter === 'hoje') {
    const inicio = new Date(currentInicio);
    inicio.setDate(inicio.getDate() - 1);
    const fim = new Date(inicio);
    fim.setHours(23, 59, 59, 999);
    return { inicio, fim };
  }
  if (filter === 'semana') {
    const inicio = new Date(currentInicio);
    inicio.setDate(inicio.getDate() - 7);
    const fim = new Date(inicio);
    fim.setDate(inicio.getDate() + 6);
    fim.setHours(23, 59, 59, 999);
    return { inicio, fim };
  }
  const inicio = new Date(currentInicio.getFullYear(), currentInicio.getMonth() - 1, 1, 0, 0, 0, 0);
  const fim = new Date(currentInicio.getFullYear(), currentInicio.getMonth(), 0, 23, 59, 59, 999);
  return { inicio, fim };
}

function formatBRL(value) {
  const n = typeof value === 'number' ? value : parseFloat(value) || 0;
  return `R$ ${n.toFixed(2).replace('.', ',')}`;
}

function formatDateLong(d) {
  try {
    return d.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

function formatDateTime(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm} ${hh}:${mi}`;
  } catch {
    return '';
  }
}

function calcPrejuizo(lancs) {
  return lancs.reduce((acc, l) => {
    if (l.destino === 'Venda Resgatada') return acc;
    const custo = parseFloat(l.produtos?.custo_estimado) || 0;
    const qtd = parseFloat(l.quantidade) || 0;
    return acc + qtd * custo;
  }, 0);
}

function showToast(msg) {
  if (Platform.OS === 'android') {
    ToastAndroid.show(msg, ToastAndroid.SHORT);
  } else {
    Alert.alert('Sobrou?', msg);
  }
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function fmtDateBR(d) {
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function fmtDateISO(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function fmtDateTimeBR(d) {
  return `${fmtDateBR(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function dateKey(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return fmtDateISO(d);
}

function csvEscape(value) {
  if (value == null) return '';
  const s = String(value);
  if (/[;"\r\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function brl2(value) {
  const n = typeof value === 'number' ? value : parseFloat(value);
  if (isNaN(n)) return '0,00';
  return n.toFixed(2).replace('.', ',');
}

function htmlEscape(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export default function PainelScreen() {
  const [empresaId, setEmpresaId] = useState(null);
  const [loadingMembro, setLoadingMembro] = useState(true);

  const [filter, setFilter] = useState('hoje');
  const [lancamentos, setLancamentos] = useState([]);
  const [anteriores, setAnteriores] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [exportingCSV, setExportingCSV] = useState(false);
  const [exportingPDF, setExportingPDF] = useState(false);

  const [detalheExpanded, setDetalheExpanded] = useState(false);
  const [detalheVerTodos, setDetalheVerTodos] = useState(false);
  const [resgatadasExpanded, setResgatadasExpanded] = useState(false);

  const hoje = useMemo(() => new Date(), []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data: userRes } = await supabase.auth.getUser();
        const user = userRes?.user;
        if (!mounted) return;
        if (!user) {
          setErrorMsg('Sessão inválida.');
          setLoadingMembro(false);
          return;
        }
        const { data: membro, error: membroErr } = await supabase
          .from('membros')
          .select('empresa_id')
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle();
        if (!mounted) return;
        if (membroErr) {
          console.error('[Painel] membros error:', membroErr);
          setErrorMsg(membroErr.message);
          setLoadingMembro(false);
          return;
        }
        if (!membro?.empresa_id) {
          setErrorMsg('Empresa não encontrada.');
          setLoadingMembro(false);
          return;
        }
        console.log('[Painel] empresaId:', membro.empresa_id);
        setEmpresaId(membro.empresa_id);
        setLoadingMembro(false);
      } catch (err) {
        if (!mounted) return;
        console.error('[Painel] membro threw:', err);
        setErrorMsg(err?.message || 'Erro inesperado.');
        setLoadingMembro(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!empresaId) return;
    let mounted = true;
    (async () => {
      setLoading(true);
      setErrorMsg('');
      try {
        const { inicio, fim } = getRange(filter);
        const inicioISO = inicio.toISOString();
        const fimISO = fim.toISOString();
        console.log('[Painel] período:', inicioISO, 'até', fimISO);

        const { data, error } = await supabase
          .from('lancamentos_sobras')
          .select('*, produtos(custo_estimado)')
          .eq('empresa_id', empresaId)
          .gte('data', inicioISO)
          .lte('data', fimISO)
          .order('data', { ascending: false });

        console.log('[Painel] lancamentos:', data?.length, 'error:', error?.message);
        console.log('[Painel] primeiro item:', JSON.stringify(data?.[0]));

        if (!mounted) return;
        if (error) {
          setErrorMsg(error.message);
          setLancamentos([]);
        } else {
          setLancamentos(data || []);
        }

        const prev = getPreviousRange(filter, inicio);
        const { data: prevData } = await supabase
          .from('lancamentos_sobras')
          .select('*, produtos(custo_estimado)')
          .eq('empresa_id', empresaId)
          .gte('data', prev.inicio.toISOString())
          .lte('data', prev.fim.toISOString());
        if (!mounted) return;
        setAnteriores(prevData || []);
      } catch (err) {
        if (!mounted) return;
        console.error('[Painel] query threw:', err);
        setErrorMsg(err?.message || 'Erro ao carregar dados.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [empresaId, filter]);

  const totals = useMemo(() => {
    const total = lancamentos.length;
    const prejuizo = calcPrejuizo(lancamentos);
    const recuperado = lancamentos.reduce((acc, l) => {
      if (l.destino !== 'Venda Resgatada') return acc;
      return acc + (parseFloat(l.valor_recebido) || 0);
    }, 0);
    const produtosDistintos = new Set(
      lancamentos.map((l) => l.produto_id).filter(Boolean)
    ).size;
    return { total, prejuizo, recuperado, produtosDistintos };
  }, [lancamentos]);

  const breakdown = useMemo(() => {
    const counts = {};
    DESTINOS.forEach((d) => {
      counts[d.id] = 0;
    });
    lancamentos.forEach((l) => {
      if (counts[l.destino] != null) counts[l.destino] += 1;
    });
    const total = lancamentos.length || 1;
    return DESTINOS.map((d) => ({
      ...d,
      count: counts[d.id],
      pct: Math.round((counts[d.id] / total) * 100),
    }));
  }, [lancamentos]);

  const ranking = useMemo(() => {
    const grupos = {};
    lancamentos.forEach((l) => {
      const key = l.produto_id || l.produto_nome;
      if (!grupos[key]) {
        grupos[key] = {
          nome: l.produto_nome,
          unidade: l.unidade,
          quantidade: 0,
          prejuizo: 0,
          temCusto: false,
        };
      }
      const qtd = parseFloat(l.quantidade) || 0;
      grupos[key].quantidade += qtd;
      const custo = parseFloat(l.produtos?.custo_estimado);
      if (!isNaN(custo) && custo > 0 && l.destino !== 'Venda Resgatada') {
        grupos[key].prejuizo += qtd * custo;
        grupos[key].temCusto = true;
      } else if (!isNaN(custo) && custo > 0) {
        grupos[key].temCusto = true;
      }
    });
    return Object.values(grupos)
      .sort((a, b) => b.prejuizo - a.prejuizo)
      .slice(0, 5);
  }, [lancamentos]);

  const insights = useMemo(() => {
    if (lancamentos.length === 0) return null;

    const destinoCounts = {};
    lancamentos.forEach((l) => {
      destinoCounts[l.destino] = (destinoCounts[l.destino] || 0) + 1;
    });
    let destinoMaisFrequente = null;
    let maxCount = 0;
    Object.entries(destinoCounts).forEach(([d, c]) => {
      if (c > maxCount) {
        maxCount = c;
        destinoMaisFrequente = d;
      }
    });

    const totalAnterior = anteriores.length;
    const prejuizoAnterior = calcPrejuizo(anteriores);

    const diffCountPct =
      totalAnterior === 0
        ? null
        : Math.round(((lancamentos.length - totalAnterior) / totalAnterior) * 100);
    const diffPrejuizoPct =
      prejuizoAnterior === 0
        ? null
        : Math.round(((totals.prejuizo - prejuizoAnterior) / prejuizoAnterior) * 100);

    return { destinoMaisFrequente, diffCountPct, diffPrejuizoPct };
  }, [lancamentos, anteriores, totals.prejuizo]);

  const alertasPerda = useMemo(() => {
    const grupos = {};
    lancamentos.forEach((l) => {
      const key = l.produto_id || l.produto_nome;
      if (!key) return;
      if (!grupos[key]) {
        grupos[key] = { nome: l.produto_nome, total: 0, perdas: 0 };
      }
      grupos[key].total += 1;
      if (
        l.destino === 'Lixo' ||
        l.destino === 'Doação' ||
        l.destino === 'Transformação'
      ) {
        grupos[key].perdas += 1;
      }
    });
    return Object.values(grupos)
      .filter((g) => g.total >= 2)
      .map((g) => ({ ...g, pct: Math.round((g.perdas / g.total) * 100) }))
      .filter((g) => g.pct > 20)
      .sort((a, b) => b.pct - a.pct);
  }, [lancamentos]);

  const detalheProdutos = useMemo(() => {
    const grupos = {};
    lancamentos.forEach((l) => {
      if (l.destino === 'Venda Resgatada') return;
      const key = l.produto_id || l.produto_nome;
      if (!key) return;
      if (!grupos[key]) {
        grupos[key] = {
          nome: l.produto_nome || '-',
          unidade: l.unidade || '',
          quantidade: 0,
          prejuizo: 0,
          temCusto: false,
          destinos: {},
        };
      }
      const g = grupos[key];
      const qtd = parseFloat(l.quantidade) || 0;
      g.quantidade += qtd;
      g.destinos[l.destino] = (g.destinos[l.destino] || 0) + 1;
      const custo = parseFloat(l.produtos?.custo_estimado);
      if (!isNaN(custo) && custo > 0) {
        g.prejuizo += qtd * custo;
        g.temCusto = true;
      }
    });
    return Object.values(grupos)
      .map((g) => {
        let destinoMais = '-';
        let maxC = 0;
        Object.entries(g.destinos).forEach(([d, c]) => {
          if (c > maxC) {
            maxC = c;
            destinoMais = d;
          }
        });
        return {
          nome: g.nome,
          unidade: g.unidade,
          quantidade: g.quantidade,
          prejuizo: g.prejuizo,
          temCusto: g.temCusto,
          destinoMaisFrequente: destinoMais,
        };
      })
      .sort((a, b) => {
        if (a.temCusto && !b.temCusto) return -1;
        if (!a.temCusto && b.temCusto) return 1;
        return b.prejuizo - a.prejuizo;
      });
  }, [lancamentos]);

  const detalheResgatadas = useMemo(
    () => lancamentos.filter((l) => l.destino === 'Venda Resgatada'),
    [lancamentos]
  );

  const exportarCSV = async () => {
    if (exportingCSV || exportingPDF) return;
    if (!lancamentos || lancamentos.length === 0) {
      showToast('Sem dados para exportar');
      return;
    }
    setExportingCSV(true);
    try {
      const { inicio, fim } = getRange(filter);
      const sep = ';';
      const header = [
        'Data',
        'Produto',
        'Quantidade',
        'Unidade',
        'Destino',
        'Custo Unit. (R$)',
        'Prejuízo Est. (R$)',
        'Valor Cheio (R$)',
        'Valor Recebido (R$)',
      ];

      const grupos = new Map();
      const ordenadosAsc = [...lancamentos].sort(
        (a, b) => new Date(a.data) - new Date(b.data)
      );
      for (const l of ordenadosAsc) {
        const key = dateKey(l.data);
        if (!grupos.has(key)) grupos.set(key, []);
        grupos.get(key).push(l);
      }

      const lines = [];
      lines.push(header.map(csvEscape).join(sep));

      const chavesOrdenadas = Array.from(grupos.keys()).sort();
      chavesOrdenadas.forEach((k, idx) => {
        const [yyyy, mm, dd] = k.split('-');
        const sepLabel = `── ${dd}/${mm}/${yyyy} ──`;
        if (idx > 0) lines.push('');
        lines.push(csvEscape(sepLabel));

        for (const l of grupos.get(k)) {
          const d = new Date(l.data);
          const dataStr = fmtDateBR(d);
          const qtd = parseFloat(l.quantidade) || 0;
          const custo = parseFloat(l.produtos?.custo_estimado);
          const prejuizo = !isNaN(custo) && l.destino !== 'Venda Resgatada' ? qtd * custo : 0;
          const row = [
            dataStr,
            l.produto_nome ?? '',
            String(l.quantidade ?? '').replace('.', ','),
            l.unidade ?? '',
            l.destino ?? '',
            !isNaN(custo) ? brl2(custo) : '',
            prejuizo > 0 ? brl2(prejuizo) : '',
            l.valor_cheio != null ? brl2(l.valor_cheio) : '',
            l.valor_recebido != null ? brl2(l.valor_recebido) : '',
          ];
          lines.push(row.map(csvEscape).join(sep));
        }
      });

      const csvContent = '﻿' + lines.join('\r\n');
      const filename = `sobrou_${fmtDateISO(inicio)}_${fmtDateISO(fim)}.csv`;
      const path = FileSystem.documentDirectory + filename;
      await FileSystem.writeAsStringAsync(path, csvContent, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, {
          mimeType: 'text/csv',
          dialogTitle: 'Exportar CSV',
          UTI: 'public.comma-separated-values-text',
        });
      }
      showToast('CSV exportado com sucesso');
    } catch (err) {
      console.error('[Painel] exportarCSV:', err);
      showToast('Erro ao exportar CSV');
    } finally {
      setExportingCSV(false);
    }
  };

  const exportarPDF = async () => {
    if (exportingCSV || exportingPDF) return;
    if (!lancamentos || lancamentos.length === 0) {
      showToast('Sem dados para exportar');
      return;
    }
    setExportingPDF(true);
    try {
      const { inicio, fim } = getRange(filter);
      const now = new Date();

      const totalSobras = lancamentos.reduce((acc, l) => {
        if (l.destino === 'Venda Resgatada') return acc;
        return acc + (parseFloat(l.quantidade) || 0);
      }, 0);
      const prejuizoEst = lancamentos.reduce((acc, l) => {
        if (l.destino === 'Venda Resgatada') return acc;
        const c = parseFloat(l.produtos?.custo_estimado) || 0;
        return acc + (parseFloat(l.quantidade) || 0) * c;
      }, 0);
      const totalLancamentos = lancamentos.length;
      const valorRecuperado = lancamentos.reduce((acc, l) => {
        if (l.destino !== 'Venda Resgatada') return acc;
        return acc + (parseFloat(l.valor_recebido) || 0);
      }, 0);

      const destinosCfg = [
        { id: 'Lixo', color: colors.accent },
        { id: 'Doação', color: colors.green },
        { id: 'Transformação', color: colors.gold },
        { id: 'Venda Resgatada', color: colors.blue },
      ];
      const destinoQtd = {};
      destinosCfg.forEach((d) => {
        destinoQtd[d.id] = 0;
      });
      lancamentos.forEach((l) => {
        if (destinoQtd[l.destino] != null) {
          destinoQtd[l.destino] += parseFloat(l.quantidade) || 0;
        }
      });

      const perdasMap = new Map();
      lancamentos.forEach((l) => {
        if (l.destino === 'Venda Resgatada') return;
        const key = l.produto_id || l.produto_nome;
        if (!perdasMap.has(key)) {
          perdasMap.set(key, {
            nome: l.produto_nome || '-',
            unidade: l.unidade || '',
            quantidade: 0,
            prejuizo: 0,
          });
        }
        const g = perdasMap.get(key);
        const qtd = parseFloat(l.quantidade) || 0;
        const c = parseFloat(l.produtos?.custo_estimado) || 0;
        g.quantidade += qtd;
        g.prejuizo += qtd * c;
      });
      const perdas = Array.from(perdasMap.values()).sort((a, b) => b.prejuizo - a.prejuizo);
      const resgatadas = lancamentos.filter((l) => l.destino === 'Venda Resgatada');

      const resumoCardsHTML = `
        <div class="card">
          <div class="card-label">Total de Sobras</div>
          <div class="card-value">${htmlEscape(totalSobras.toFixed(2).replace('.', ','))}</div>
        </div>
        <div class="card">
          <div class="card-label">Prejuízo Estimado</div>
          <div class="card-value accent">R$ ${htmlEscape(brl2(prejuizoEst))}</div>
        </div>
        <div class="card">
          <div class="card-label">Lançamentos</div>
          <div class="card-value">${htmlEscape(String(totalLancamentos))}</div>
        </div>
        <div class="card">
          <div class="card-label">Valor Recuperado</div>
          <div class="card-value green">R$ ${htmlEscape(brl2(valorRecuperado))}</div>
        </div>
      `;

      const destinosHTML = destinosCfg
        .map(
          (d) => `
        <div class="card destino-card" style="border-color:${d.color};">
          <div class="card-label">${htmlEscape(d.id)}</div>
          <div class="card-value" style="color:${d.color};">
            ${htmlEscape(destinoQtd[d.id].toFixed(2).replace('.', ','))}
          </div>
        </div>
      `
        )
        .join('');

      const perdasHTML =
        perdas.length > 0
          ? `
        <h2>Perdas por Produto</h2>
        <table>
          <thead>
            <tr>
              <th class="col-nome">Produto</th>
              <th class="col-num">Qtd</th>
              <th class="col-num">Unidade</th>
              <th class="col-num">Prejuízo Est.</th>
            </tr>
          </thead>
          <tbody>
            ${perdas
              .map(
                (p, idx) => `
              <tr class="${idx % 2 === 0 ? 'row-alt' : ''}">
                <td>${htmlEscape(p.nome)}</td>
                <td class="col-num">${htmlEscape(p.quantidade.toFixed(2).replace('.', ','))}</td>
                <td class="col-num">${htmlEscape(p.unidade || '-')}</td>
                <td class="col-num">${
                  p.prejuizo > 0
                    ? `<span class="accent strong">R$ ${htmlEscape(brl2(p.prejuizo))}</span>`
                    : '<span class="muted">-</span>'
                }</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      `
          : '';

      const resgatadasHTML =
        resgatadas.length > 0
          ? `
        <h2>Vendas Resgatadas</h2>
        <table>
          <thead class="thead-blue">
            <tr>
              <th class="col-nome">Produto</th>
              <th class="col-num">Qtd</th>
              <th class="col-num">Unidade</th>
            </tr>
          </thead>
          <tbody>
            ${resgatadas
              .map(
                (l, idx) => `
              <tr class="${idx % 2 === 0 ? 'row-alt' : ''}">
                <td>${htmlEscape(l.produto_nome || '-')}</td>
                <td class="col-num">${htmlEscape(String(l.quantidade ?? '').replace('.', ','))}</td>
                <td class="col-num">${htmlEscape(l.unidade || '-')}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
        <div class="total-recuperado">
          Total Recuperado: R$ ${htmlEscape(brl2(valorRecuperado))}
        </div>
      `
          : '';

      const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<title>Sobrou? - Relatório</title>
<style>
  @page { size: A4 portrait; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    color: #1c1811;
    margin: 0;
    padding: 0;
    font-size: 11px;
    line-height: 1.4;
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 2px solid #c84b2f;
    padding-bottom: 8px;
    margin-bottom: 16px;
  }
  .brand { display: flex; align-items: center; }
  .brand-mark {
    width: 32px;
    height: 32px;
    background: #1c1811;
    color: #e8a020;
    border-radius: 6px;
    font-size: 20px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-right: 10px;
  }
  .brand-name {
    font-size: 22px;
    font-weight: 700;
    color: #1c1811;
  }
  .meta {
    text-align: right;
    font-size: 9px;
    color: #555;
    line-height: 1.5;
  }
  .cards {
    display: flex;
    gap: 8px;
    margin-bottom: 14px;
  }
  .card {
    flex: 1;
    background: #f5f0e8;
    border: 1px solid #e2d9c8;
    border-radius: 6px;
    padding: 8px 10px;
  }
  .destino-card { border-width: 1.5px; }
  .card-label {
    font-size: 8px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: #8c7f6e;
    margin-bottom: 4px;
  }
  .card-value {
    font-size: 14px;
    font-weight: 700;
    color: #1c1811;
  }
  .card-value.accent { color: #c84b2f; }
  .card-value.green { color: #2d7a4f; }
  h2 {
    font-size: 13px;
    color: #1c1811;
    margin: 14px 0 6px 0;
    border-left: 3px solid #c84b2f;
    padding-left: 6px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 8px;
    font-size: 10px;
  }
  thead tr { background: #1c1811; color: #fdfaf4; }
  thead.thead-blue tr { background: #3b82f6; color: #fdfaf4; }
  th, td {
    padding: 5px 6px;
    text-align: left;
  }
  .col-nome { width: 50%; }
  .col-num { text-align: right; white-space: nowrap; }
  tbody tr.row-alt { background: #f5f0e8; }
  tbody td { border-bottom: 1px solid #ece4d4; }
  .accent { color: #c84b2f; }
  .green { color: #2d7a4f; }
  .muted { color: #8c7f6e; }
  .strong { font-weight: 700; }
  .total-recuperado {
    text-align: right;
    font-weight: 700;
    color: #2d7a4f;
    font-size: 11px;
    margin-top: 4px;
    margin-bottom: 10px;
  }
  .footer {
    margin-top: 18px;
    text-align: center;
    font-style: italic;
    font-size: 9px;
    color: #8c7f6e;
    border-top: 1px solid #e2d9c8;
    padding-top: 6px;
  }
</style>
</head>
<body>
  <div class="header">
    <div class="brand">
      <div class="brand-mark">?</div>
      <div class="brand-name">Sobrou?</div>
    </div>
    <div class="meta">
      <div>Período: ${htmlEscape(fmtDateBR(inicio))} a ${htmlEscape(fmtDateBR(fim))}</div>
      <div>Gerado em: ${htmlEscape(fmtDateTimeBR(now))}</div>
    </div>
  </div>

  <div class="cards">${resumoCardsHTML}</div>

  <h2>Destino das Sobras</h2>
  <div class="cards">${destinosHTML}</div>

  ${perdasHTML}
  ${resgatadasHTML}

  <div class="footer">Sobrou? · Gestão de Perdas</div>
</body>
</html>`;

      const { uri } = await Print.printToFileAsync({
        html,
        base64: false,
      });

      const filename = `sobrou_${fmtDateISO(inicio)}_${fmtDateISO(fim)}.pdf`;
      const destPath = FileSystem.documentDirectory + filename;
      try {
        await FileSystem.deleteAsync(destPath, { idempotent: true });
      } catch {}
      await FileSystem.moveAsync({ from: uri, to: destPath });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(destPath, {
          mimeType: 'application/pdf',
          dialogTitle: 'Exportar PDF',
          UTI: 'com.adobe.pdf',
        });
      }
      showToast('PDF exportado com sucesso');
    } catch (err) {
      console.error('[Painel] exportarPDF:', err);
      showToast('Erro ao exportar PDF');
    } finally {
      setExportingPDF(false);
    }
  };

  if (loadingMembro) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <AppHeader />
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <AppHeader />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Painel</Text>

        <View style={styles.filterRow}>
          {FILTERS.map((f) => {
            const active = filter === f.id;
            return (
              <TouchableOpacity
                key={f.id}
                style={[styles.filterBtn, active && styles.filterBtnActive]}
                onPress={() => setFilter(f.id)}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.exportRow}>
          <TouchableOpacity
            style={[
              styles.exportBtn,
              (exportingCSV || exportingPDF) && styles.exportBtnDisabled,
            ]}
            onPress={exportarCSV}
            disabled={exportingCSV || exportingPDF}
            activeOpacity={0.7}
          >
            {exportingCSV ? (
              <Text style={styles.exportBtnText}>Gerando...</Text>
            ) : (
              <Text style={styles.exportBtnText}>📄 Exportar CSV</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.exportBtn,
              (exportingCSV || exportingPDF) && styles.exportBtnDisabled,
            ]}
            onPress={exportarPDF}
            disabled={exportingCSV || exportingPDF}
            activeOpacity={0.7}
          >
            {exportingPDF ? (
              <Text style={styles.exportBtnText}>Gerando...</Text>
            ) : (
              <Text style={styles.exportBtnText}>📊 Exportar PDF</Text>
            )}
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
        ) : errorMsg ? (
          <Text style={styles.error}>{errorMsg}</Text>
        ) : (
          <>
            <View style={styles.statsGrid}>
              <StatCard emoji="🗑️" label="Lançamentos" value={String(totals.total)} />
              <StatCard
                emoji="💸"
                label="Prejuízo"
                value={formatBRL(totals.prejuizo)}
                valueColor={colors.accent}
              />
              <StatCard
                emoji="💰"
                label="Recuperado"
                value={formatBRL(totals.recuperado)}
                valueColor={colors.green}
              />
              <StatCard emoji="📦" label="Produtos" value={String(totals.produtosDistintos)} />
            </View>

            {alertasPerda.length > 0 ? (
              <View style={styles.alertBanner}>
                <View style={styles.alertHeader}>
                  <Text style={styles.alertEmoji}>⚠️</Text>
                  <Text style={styles.alertTitle}>
                    Produtos com perda alta no período
                  </Text>
                </View>
                {alertasPerda.map((a, idx) => (
                  <Text key={(a.nome || '') + idx} style={styles.alertItem}>
                    ⚠️ {a.nome} — {a.pct}% de perda
                  </Text>
                ))}
              </View>
            ) : null}

            <Text style={styles.sectionHeading}>Por destino</Text>
            <View style={styles.breakdownRow}>
              {breakdown.map((d) => (
                <View
                  key={d.id}
                  style={[styles.breakdownCard, { borderColor: d.color }]}
                >
                  <Text style={styles.breakdownEmoji}>{d.emoji}</Text>
                  <Text style={styles.breakdownLabel} numberOfLines={1}>
                    {d.id}
                  </Text>
                  <Text style={[styles.breakdownCount, { color: d.color }]}>
                    {d.count}
                  </Text>
                  <Text style={styles.breakdownPct}>{d.pct}%</Text>
                </View>
              ))}
            </View>

            <Text style={styles.sectionHeading}>Ranking de perdas</Text>
            {ranking.length === 0 ? (
              <Text style={styles.empty}>Sem dados para o período.</Text>
            ) : (
              <View style={styles.rankingCard}>
                {ranking.map((r, idx) => (
                  <View key={r.nome + idx} style={styles.rankingRow}>
                    <View style={styles.rankBadge}>
                      <Text style={styles.rankBadgeText}>{idx + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rankingNome}>{r.nome}</Text>
                      <Text style={styles.rankingMeta}>
                        {r.quantidade.toString().replace('.', ',')} {r.unidade}
                      </Text>
                    </View>
                    {r.temCusto && r.prejuizo > 0 ? (
                      <Text style={styles.rankingValor}>{formatBRL(r.prejuizo)}</Text>
                    ) : (
                      <Text style={styles.rankingSemCusto}>sem custo</Text>
                    )}
                  </View>
                ))}
              </View>
            )}

            {insights ? (
              <>
                <Text style={styles.sectionHeading}>Insights</Text>
                <View style={styles.insightsCard}>
                  {insights.destinoMaisFrequente ? (
                    <View style={styles.insightRow}>
                      <Text style={styles.insightEmoji}>🎯</Text>
                      <Text style={styles.insightText}>
                        Destino mais frequente:{' '}
                        <Text style={styles.insightHighlight}>
                          {insights.destinoMaisFrequente}
                        </Text>
                      </Text>
                    </View>
                  ) : null}

                  {insights.diffCountPct != null ? (
                    <TrendRow
                      label="Lançamentos vs período anterior"
                      pct={insights.diffCountPct}
                      invertColor
                    />
                  ) : null}

                  {insights.diffPrejuizoPct != null ? (
                    <TrendRow
                      label="Prejuízo vs período anterior"
                      pct={insights.diffPrejuizoPct}
                      invertColor
                    />
                  ) : null}
                </View>
              </>
            ) : null}

            {detalheProdutos.length > 0 ? (
              <View style={styles.detalheBlock}>
                <TouchableOpacity
                  style={styles.detalheHeader}
                  onPress={() => setDetalheExpanded((v) => !v)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.detalheTitle}>
                    📋 Detalhe por Produto — Perdas ({detalheProdutos.length})
                  </Text>
                  <Text style={styles.detalheArrow}>
                    {detalheExpanded ? '▲' : '▼'}
                  </Text>
                </TouchableOpacity>

                {detalheExpanded ? (
                  <View style={styles.detalheCard}>
                    <View style={styles.detalheTableHeader}>
                      <Text style={[styles.detalheTh, styles.detalheColProduto]}>
                        Produto
                      </Text>
                      <Text style={[styles.detalheTh, styles.detalheColQtd]}>
                        Sobra
                      </Text>
                      <Text style={[styles.detalheTh, styles.detalheColDestino]}>
                        Destino
                      </Text>
                      <Text style={[styles.detalheTh, styles.detalheColPrej]}>
                        Prejuízo
                      </Text>
                    </View>

                    {(detalheVerTodos
                      ? detalheProdutos
                      : detalheProdutos.slice(0, 5)
                    ).map((p, idx) => {
                      const destinoCfg = DESTINOS.find(
                        (d) => d.id === p.destinoMaisFrequente
                      );
                      return (
                        <View
                          key={(p.nome || '') + idx}
                          style={[
                            styles.detalheRow,
                            idx % 2 === 0 && styles.detalheRowAlt,
                          ]}
                        >
                          <Text
                            style={[styles.detalheTd, styles.detalheColProduto]}
                            numberOfLines={2}
                          >
                            {p.nome}
                          </Text>
                          <Text
                            style={[styles.detalheTd, styles.detalheColQtd]}
                          >
                            {p.quantidade.toFixed(2).replace('.', ',')} {p.unidade}
                          </Text>
                          <Text
                            style={[
                              styles.detalheTd,
                              styles.detalheColDestino,
                              {
                                color:
                                  destinoCfg?.color || colors.muted,
                                fontWeight: '600',
                              },
                            ]}
                            numberOfLines={1}
                          >
                            {p.destinoMaisFrequente}
                          </Text>
                          {p.temCusto && p.prejuizo > 0 ? (
                            <Text
                              style={[
                                styles.detalheTd,
                                styles.detalheColPrej,
                                styles.detalhePrej,
                              ]}
                            >
                              {formatBRL(p.prejuizo)}
                            </Text>
                          ) : (
                            <Text
                              style={[
                                styles.detalheTd,
                                styles.detalheColPrej,
                                styles.detalheSemCusto,
                              ]}
                            >
                              —
                            </Text>
                          )}
                        </View>
                      );
                    })}

                    {detalheProdutos.length > 5 ? (
                      <TouchableOpacity
                        style={styles.verTodosBtn}
                        onPress={() => setDetalheVerTodos((v) => !v)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.verTodosText}>
                          {detalheVerTodos
                            ? 'Mostrar menos ▲'
                            : `Ver todos ${detalheProdutos.length} produtos ▼`}
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ) : null}
              </View>
            ) : null}

            {detalheResgatadas.length > 0 ? (
              <View style={styles.detalheBlock}>
                <TouchableOpacity
                  style={styles.detalheHeader}
                  onPress={() => setResgatadasExpanded((v) => !v)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.detalheTitle}>
                    💰 Vendas Resgatadas ({detalheResgatadas.length})
                  </Text>
                  <Text style={styles.detalheArrow}>
                    {resgatadasExpanded ? '▲' : '▼'}
                  </Text>
                </TouchableOpacity>

                {resgatadasExpanded ? (
                  <View style={styles.detalheCard}>
                    <View style={styles.detalheTableHeader}>
                      <Text
                        style={[styles.detalheTh, styles.resgColProduto]}
                      >
                        Produto
                      </Text>
                      <Text style={[styles.detalheTh, styles.resgColQtd]}>
                        Quantidade
                      </Text>
                      <Text style={[styles.detalheTh, styles.resgColUnid]}>
                        Unidade
                      </Text>
                    </View>

                    {detalheResgatadas.map((l, idx) => (
                      <View
                        key={l.id}
                        style={[
                          styles.detalheRow,
                          idx % 2 === 0 && styles.detalheRowAlt,
                        ]}
                      >
                        <Text
                          style={[styles.detalheTd, styles.resgColProduto]}
                          numberOfLines={2}
                        >
                          {l.produto_nome}
                        </Text>
                        <Text style={[styles.detalheTd, styles.resgColQtd]}>
                          {String(l.quantidade ?? '').replace('.', ',')}
                        </Text>
                        <Text style={[styles.detalheTd, styles.resgColUnid]}>
                          {l.unidade || '-'}
                        </Text>
                      </View>
                    ))}

                    <View style={styles.totalRecuperadoRow}>
                      <Text style={styles.totalRecuperadoText}>
                        Valor Recuperado: {formatBRL(totals.recuperado)}
                      </Text>
                    </View>
                  </View>
                ) : null}
              </View>
            ) : null}

            <Text style={styles.sectionHeading}>Lançamentos</Text>
            {lancamentos.length === 0 ? (
              <Text style={styles.empty}>Nenhum lançamento neste período.</Text>
            ) : (
              lancamentos.map((l) => {
                const destinoCfg = DESTINOS.find((d) => d.id === l.destino);
                return (
                  <View key={l.id} style={styles.itemCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemNome}>{l.produto_nome}</Text>
                      <View style={styles.itemMetaRow}>
                        <Text style={styles.itemQtd}>
                          {String(l.quantidade).replace('.', ',')} {l.unidade}
                        </Text>
                        <Text style={styles.itemSep}>·</Text>
                        <Text
                          style={[
                            styles.itemDestino,
                            { color: destinoCfg?.color || colors.muted },
                          ]}
                        >
                          {l.destino}
                        </Text>
                      </View>
                      {l.destino === 'Venda Resgatada' && l.valor_recebido != null ? (
                        <Text style={styles.itemRecuperado}>
                          Recuperado: {formatBRL(l.valor_recebido)}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={styles.itemData}>{formatDateTime(l.data)}</Text>
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ emoji, label, value, valueColor }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statEmoji}>{emoji}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, valueColor && { color: valueColor }]}>
        {value}
      </Text>
    </View>
  );
}

function TrendRow({ label, pct, invertColor }) {
  // invertColor: true means "lower is better" (e.g., prejuízo, lançamentos)
  // so positive delta = bad (red), negative delta = good (green)
  const isPositive = pct > 0;
  const isNegative = pct < 0;
  const good = invertColor ? isNegative : isPositive;
  const bad = invertColor ? isPositive : isNegative;
  const color = good ? colors.green : bad ? colors.accent : colors.muted;
  const arrow = isPositive ? '📈' : isNegative ? '📉' : '➡️';
  const sign = pct > 0 ? '+' : '';
  return (
    <View style={styles.insightRow}>
      <Text style={styles.insightEmoji}>{arrow}</Text>
      <Text style={styles.insightText}>
        {label}: <Text style={[styles.insightHighlight, { color }]}>{sign}{pct}%</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: 20, paddingBottom: 60 },

  title: {
    color: colors.text,
    fontSize: 32,
    fontWeight: '700',
    fontFamily: SERIF,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    marginTop: 4,
    marginBottom: 20,
    textTransform: 'capitalize',
  },

  filterRow: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  filterBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    marginRight: 8,
  },
  filterBtnActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  filterText: { color: colors.text, fontWeight: '600' },
  filterTextActive: { color: colors.surface },

  exportRow: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 8,
  },
  exportBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exportBtnDisabled: { opacity: 0.55 },
  exportBtnText: { color: colors.accent, fontWeight: '600', fontSize: 14 },

  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  statCard: {
    width: '48%',
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 10,
  },
  statEmoji: { fontSize: 22, marginBottom: 4 },
  statLabel: {
    color: colors.muted,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statValue: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
    fontFamily: SERIF,
    marginTop: 4,
  },

  sectionHeading: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    fontFamily: SERIF,
    marginTop: 16,
    marginBottom: 10,
  },

  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  breakdownCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1.5,
    paddingVertical: 10,
    paddingHorizontal: 6,
    marginHorizontal: 3,
    alignItems: 'center',
  },
  breakdownEmoji: { fontSize: 18 },
  breakdownLabel: {
    color: colors.text,
    fontSize: 11,
    marginTop: 4,
    fontWeight: '600',
    textAlign: 'center',
  },
  breakdownCount: {
    fontSize: 20,
    fontWeight: '700',
    fontFamily: SERIF,
    marginTop: 4,
  },
  breakdownPct: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 2,
  },

  rankingCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 4,
  },
  rankingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rankBadgeText: {
    color: colors.surface,
    fontWeight: '700',
    fontSize: 13,
  },
  rankingNome: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  rankingMeta: { color: colors.muted, fontSize: 12, marginTop: 2 },
  rankingValor: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  rankingSemCusto: {
    color: colors.muted,
    fontSize: 12,
    fontStyle: 'italic',
  },

  insightsCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  insightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  insightEmoji: { fontSize: 18, marginRight: 10 },
  insightText: { color: colors.text, fontSize: 14, flex: 1 },
  insightHighlight: { fontWeight: '700' },

  alertBanner: {
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
    marginBottom: 8,
  },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  alertEmoji: { fontSize: 18, marginRight: 8 },
  alertTitle: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 14,
    flex: 1,
  },
  alertItem: {
    color: colors.text,
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },

  detalheBlock: { marginTop: 16 },
  detalheHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  detalheTitle: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 15,
    flex: 1,
    fontFamily: SERIF,
  },
  detalheArrow: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 8,
  },
  detalheCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopWidth: 0,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    marginTop: -1,
    overflow: 'hidden',
  },
  detalheTableHeader: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: colors.text,
  },
  detalheTh: {
    color: colors.surface,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  detalheRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    alignItems: 'center',
  },
  detalheRowAlt: { backgroundColor: colors.bg },
  detalheTd: {
    color: colors.text,
    fontSize: 12,
  },
  detalheColProduto: { flex: 2.2, paddingRight: 6 },
  detalheColQtd: { flex: 1.1, textAlign: 'right', paddingRight: 6 },
  detalheColDestino: { flex: 1.4, textAlign: 'right', paddingRight: 6 },
  detalheColPrej: { flex: 1.3, textAlign: 'right' },
  detalhePrej: { color: colors.accent, fontWeight: '700' },
  detalheSemCusto: { color: colors.muted, fontStyle: 'italic' },

  verTodosBtn: {
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: colors.bg,
  },
  verTodosText: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '600',
  },

  resgColProduto: { flex: 2.4, paddingRight: 6 },
  resgColQtd: { flex: 1.2, textAlign: 'right', paddingRight: 6 },
  resgColUnid: { flex: 1, textAlign: 'right' },

  totalRecuperadoRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'flex-end',
    backgroundColor: colors.bg,
  },
  totalRecuperadoText: {
    color: colors.gold,
    fontWeight: '700',
    fontSize: 14,
  },

  itemCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 8,
  },
  itemNome: { color: colors.text, fontSize: 15, fontWeight: '600' },
  itemMetaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  itemQtd: { color: colors.muted, fontSize: 13 },
  itemSep: { color: colors.muted, fontSize: 13, marginHorizontal: 6 },
  itemDestino: { fontSize: 13, fontWeight: '600' },
  itemRecuperado: { color: colors.green, fontSize: 12, marginTop: 4 },
  itemData: { color: colors.muted, fontSize: 12, marginLeft: 8 },

  empty: { color: colors.muted, textAlign: 'center', marginVertical: 16 },
  error: { color: colors.danger, marginTop: 24, textAlign: 'center' },
});
