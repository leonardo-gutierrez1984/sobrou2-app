import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Platform,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  ToastAndroid,
  Alert,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import { supabase } from '../services/supabase';
import { colors } from '../theme/colors';
import AppHeader from '../components/AppHeader';
import { formatBRL, formatarQuantidade } from '../utils/lancamentos';

const DESTINOS = [
  { id: 'Lixo', emoji: '🗑️', color: colors.accent },
  { id: 'Doação', emoji: '💚', color: colors.green },
  { id: 'Transformação', emoji: '♻️', color: colors.gold },
  { id: 'Venda Resgatada', emoji: '💰', color: colors.blue },
];

const DESTINO_OPTIONS = ['Todos', ...DESTINOS.map((d) => d.id)];

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

function startOfWeek(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfWeek(d) {
  const date = startOfWeek(d);
  date.setDate(date.getDate() + 6);
  date.setHours(23, 59, 59, 999);
  return date;
}

export default function PainelScreen() {
  const [empresaId, setEmpresaId] = useState(null);
  const [loadingMembro, setLoadingMembro] = useState(true);

  const [dataInicio, setDataInicio] = useState(() => new Date());
  const [dataFim, setDataFim] = useState(() => new Date());
  const [showPickerInicio, setShowPickerInicio] = useState(false);
  const [showPickerFim, setShowPickerFim] = useState(false);
  const [tempPickerDate, setTempPickerDate] = useState(new Date());

  const [searchProduto, setSearchProduto] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [filtroDestino, setFiltroDestino] = useState('Todos');
  const [destinoPickerOpen, setDestinoPickerOpen] = useState(false);

  const [lancamentos, setLancamentos] = useState([]);
  const [anteriores, setAnteriores] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [exportingCSV, setExportingCSV] = useState(false);
  const [exportingPDF, setExportingPDF] = useState(false);

  const [detalheExpanded, setDetalheExpanded] = useState(false);
  const [detalheVerTodos, setDetalheVerTodos] = useState(false);
  const [lancamentosExpanded, setLancamentosExpanded] = useState(false);

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
          setErrorMsg(membroErr.message);
          setLoadingMembro(false);
          return;
        }
        if (!membro?.empresa_id) {
          setErrorMsg('Empresa não encontrada.');
          setLoadingMembro(false);
          return;
        }
        setEmpresaId(membro.empresa_id);
        setLoadingMembro(false);
      } catch (err) {
        if (!mounted) return;
        setErrorMsg(err?.message || 'Erro inesperado.');
        setLoadingMembro(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const carregarPainel = async () => {
    if (!empresaId) return;
    setLoading(true);
    setErrorMsg('');
    try {
      const inicio = new Date(dataInicio);
      inicio.setHours(0, 0, 0, 0);
      const fim = new Date(dataFim);
      fim.setHours(23, 59, 59, 999);
      const inicioISO = inicio.toISOString();
      const fimISO = fim.toISOString();

      const { data, error } = await supabase
        .from('lancamentos_sobras')
        .select('*, produtos(custo_estimado)')
        .eq('empresa_id', empresaId)
        .gte('data', inicioISO)
        .lte('data', fimISO)
        .order('data', { ascending: false });

      if (error) {
        setErrorMsg(error.message);
        setLancamentos([]);
      } else {
        setLancamentos(data || []);
      }

      // período anterior (mesmo tamanho)
      const diffMs = fim.getTime() - inicio.getTime();
      const prevFim = new Date(inicio.getTime() - 1);
      const prevInicio = new Date(prevFim.getTime() - diffMs);
      const { data: prevData } = await supabase
        .from('lancamentos_sobras')
        .select('*, produtos(custo_estimado)')
        .eq('empresa_id', empresaId)
        .gte('data', prevInicio.toISOString())
        .lte('data', prevFim.toISOString());
      setAnteriores(prevData || []);
    } catch (err) {
      setErrorMsg(err?.message || 'Erro ao carregar dados.');
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (!empresaId) return;
      carregarPainel();
    }, [empresaId])
  );

  // Filtros em tempo real (produto + destino)
  const lancamentosFiltrados = useMemo(() => {
    const q = searchProduto.trim().toLowerCase();
    return lancamentos.filter((l) => {
      if (filtroDestino !== 'Todos' && l.destino !== filtroDestino) return false;
      if (q && !(l.produto_nome || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [lancamentos, searchProduto, filtroDestino]);

  // Produtos únicos do período (para o autocomplete)
  const produtosDisponiveis = useMemo(() => {
    const set = new Set();
    lancamentos.forEach((l) => {
      const nome = (l.produto_nome || '').trim();
      if (nome) set.add(nome);
    });
    return Array.from(set).sort((a, b) =>
      a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })
    );
  }, [lancamentos]);

  const produtosDropdown = useMemo(() => {
    const q = searchProduto.trim().toLowerCase();
    if (!q) return produtosDisponiveis;
    return produtosDisponiveis.filter((n) => n.toLowerCase().includes(q));
  }, [produtosDisponiveis, searchProduto]);

  const totals = useMemo(() => {
    const total = lancamentosFiltrados.length;
    const prejuizo = calcPrejuizo(lancamentosFiltrados);
    const recuperado = lancamentosFiltrados.reduce((acc, l) => {
      if (l.destino !== 'Venda Resgatada') return acc;
      return acc + (parseFloat(l.valor_recebido) || 0);
    }, 0);
    return { total, prejuizo, recuperado };
  }, [lancamentosFiltrados]);

  const totaisPorUnidade = useMemo(() => {
    const acc = {};
    lancamentosFiltrados.forEach((l) => {
      if (l.destino === 'Venda Resgatada') return;
      const u = l.unidade || '-';
      const q = parseFloat(l.quantidade) || 0;
      acc[u] = Math.round(((acc[u] || 0) + q) * 1000) / 1000;
    });
    return Object.entries(acc)
      .map(([unidade, quantidade]) => ({ unidade, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade);
  }, [lancamentosFiltrados]);

  const destinosResumo = useMemo(() => {
    const acc = {};
    lancamentosFiltrados.forEach((l) => {
      if (!acc[l.destino]) acc[l.destino] = { count: 0, porUnidade: {} };
      acc[l.destino].count += 1;
      const u = l.unidade || '-';
      const q = parseFloat(l.quantidade) || 0;
      acc[l.destino].porUnidade[u] = Math.round(((acc[l.destino].porUnidade[u] || 0) + q) * 1000) / 1000;
    });
    const total = lancamentosFiltrados.length || 1;
    return DESTINOS.filter((d) => acc[d.id]?.count > 0).map((d) => ({
      ...d,
      count: acc[d.id].count,
      porUnidade: acc[d.id].porUnidade,
      pct: Math.round((acc[d.id].count / total) * 100),
    }));
  }, [lancamentosFiltrados]);

  const ranking = useMemo(() => {
    const grupos = {};
    lancamentosFiltrados.forEach((l) => {
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
      grupos[key].quantidade = Math.round((grupos[key].quantidade + qtd) * 1000) / 1000;
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
  }, [lancamentosFiltrados]);

  const insights = useMemo(() => {
    if (lancamentosFiltrados.length === 0) return null;

    const destinoCounts = {};
    lancamentosFiltrados.forEach((l) => {
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
        : Math.round(((lancamentosFiltrados.length - totalAnterior) / totalAnterior) * 100);
    const diffPrejuizoPct =
      prejuizoAnterior === 0
        ? null
        : Math.round(((totals.prejuizo - prejuizoAnterior) / prejuizoAnterior) * 100);

    // produto mais perdido
    const perdidos = {};
    lancamentosFiltrados.forEach((l) => {
      if (l.destino === 'Venda Resgatada') return;
      const k = l.produto_nome || '-';
      perdidos[k] = (perdidos[k] || 0) + 1;
    });
    let produtoMaisPerdido = null;
    let maxPerd = 0;
    Object.entries(perdidos).forEach(([n, c]) => {
      if (c > maxPerd) {
        maxPerd = c;
        produtoMaisPerdido = n;
      }
    });

    return { destinoMaisFrequente, diffCountPct, diffPrejuizoPct, produtoMaisPerdido };
  }, [lancamentosFiltrados, anteriores, totals.prejuizo]);

  const detalheProdutos = useMemo(() => {
    const grupos = {};
    lancamentosFiltrados.forEach((l) => {
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
          count: 0,   // ADICIONAR ESTA LINHA
        };
      }
      const g = grupos[key];
      const qtd = parseFloat(l.quantidade) || 0;
      g.quantidade = Math.round((g.quantidade + qtd) * 1000) / 1000;
      g.count += 1;  // ADICIONAR ESTA LINHA
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
          count: g.count,
        };
      })
      .sort((a, b) => {
        if (a.temCusto && !b.temCusto) return -1;
        if (!a.temCusto && b.temCusto) return 1;
        return b.prejuizo - a.prejuizo;
      });
  }, [lancamentosFiltrados]);

  const exportarCSV = async () => {
    if (exportingCSV || exportingPDF) return;
    if (!lancamentosFiltrados || lancamentosFiltrados.length === 0) {
      showToast('Sem dados para exportar');
      return;
    }
    setExportingCSV(true);
    try {
      const inicio = new Date(dataInicio);
      inicio.setHours(0, 0, 0, 0);
      const fim = new Date(dataFim);
      fim.setHours(23, 59, 59, 999);
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
      const ordenadosAsc = [...lancamentosFiltrados].sort(
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
          const prejuizo =
            !isNaN(custo) && l.destino !== 'Venda Resgatada' ? qtd * custo : 0;
          const row = [
            dataStr,
            l.produto_nome ?? '',
            formatarQuantidade(l.quantidade),
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
    if (!lancamentosFiltrados || lancamentosFiltrados.length === 0) {
      showToast('Sem dados para exportar');
      return;
    }
    setExportingPDF(true);
    try {
      const inicio = new Date(dataInicio);
      inicio.setHours(0, 0, 0, 0);
      const fim = new Date(dataFim);
      fim.setHours(23, 59, 59, 999);
      const now = new Date();

      const totalSobras = lancamentosFiltrados.reduce((acc, l) => {
        if (l.destino === 'Venda Resgatada') return acc;
        return acc + (parseFloat(l.quantidade) || 0);
      }, 0);
      const prejuizoEst = lancamentosFiltrados.reduce((acc, l) => {
        if (l.destino === 'Venda Resgatada') return acc;
        const c = parseFloat(l.produtos?.custo_estimado) || 0;
        return acc + (parseFloat(l.quantidade) || 0) * c;
      }, 0);
      const totalLancamentos = lancamentosFiltrados.length;
      const valorRecuperado = lancamentosFiltrados.reduce((acc, l) => {
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
      lancamentosFiltrados.forEach((l) => {
        if (destinoQtd[l.destino] != null) {
          destinoQtd[l.destino] += parseFloat(l.quantidade) || 0;
        }
      });

      const perdasMap = new Map();
      lancamentosFiltrados.forEach((l) => {
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
      const resgatadas = lancamentosFiltrados.filter((l) => l.destino === 'Venda Resgatada');

      const resumoCardsHTML = `
        <div class="card">
          <div class="card-label">Total de Sobras</div>
          <div class="card-value">${htmlEscape(formatarQuantidade(totalSobras))}</div>
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
            ${htmlEscape(formatarQuantidade(destinoQtd[d.id]))}
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
                <td class="col-num">${htmlEscape(formatarQuantidade(p.quantidade))}</td>
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
                <td class="col-num">${htmlEscape(formatarQuantidade(l.quantidade))}</td>
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

      const { uri } = await Print.printToFileAsync({ html, base64: false });

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

  const safeDate = (d) =>
    d instanceof Date && !isNaN(d.getTime()) ? d : new Date();

  const openPickerInicio = () => {
    setTempPickerDate(safeDate(dataInicio));
    setShowPickerInicio(true);
  };

  const openPickerFim = () => {
    setTempPickerDate(safeDate(dataFim));
    setShowPickerFim(true);
  };

  const confirmPickerInicio = () => {
    setDataInicio(safeDate(tempPickerDate));
    setShowPickerInicio(false);
  };

  const confirmPickerFim = () => {
    setDataFim(safeDate(tempPickerDate));
    setShowPickerFim(false);
  };

  const onChangeDate = (which, event, selectedDate) => {
    if (Platform.OS === 'android') {
      if (which === 'inicio') setShowPickerInicio(false);
      else setShowPickerFim(false);
      if (event?.type !== 'set' || !selectedDate) return;
      if (which === 'inicio') setDataInicio(selectedDate);
      else setDataFim(selectedDate);
      return;
    }
    if (selectedDate) setTempPickerDate(selectedDate);
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
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {/* 1. Hero Banner */}
        <LinearGradient
          colors={['#1a1a1a', '#0a1a2a']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroContent}>
            <Text style={styles.heroEyebrow}>DECISÃO GERENCIAL</Text>
            <Text style={styles.heroTitle}>Análises de perdas</Text>
            <Text style={styles.heroSubtitle}>
              Ranking, destinos, prejuízo estimado e decisões práticas por período.
            </Text>
          </View>
          <View style={styles.biBadge}>
            <Text style={styles.biBadgeText}>BI</Text>
          </View>
        </LinearGradient>

        {/* 2. Card Filtros */}
        <View style={styles.card}>
          <View style={styles.row2}>
            <View style={styles.col}>
              <Text style={styles.label}>DE</Text>
              <TouchableOpacity
                style={[styles.input, styles.dateInput]}
                onPress={openPickerInicio}
                activeOpacity={0.7}
              >
                <Text style={styles.dateValue}>{fmtDateBR(dataInicio)}</Text>
                <Ionicons name="calendar-outline" size={16} color={colors.muted} />
              </TouchableOpacity>
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>ATÉ</Text>
              <TouchableOpacity
                style={[styles.input, styles.dateInput]}
                onPress={openPickerFim}
                activeOpacity={0.7}
              >
                <Text style={styles.dateValue}>{fmtDateBR(dataFim)}</Text>
                <Ionicons name="calendar-outline" size={16} color={colors.muted} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={[styles.actionsRow, { marginTop: 12 }]}>
            <TouchableOpacity
              style={[styles.primaryBtn, { flex: 2 }, loading && styles.disabled]}
              onPress={carregarPainel}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Aplicar filtros</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.ghostBtn, { flex: 1 }, (exportingCSV || exportingPDF) && styles.disabled]}
              onPress={exportarCSV}
              disabled={exportingCSV || exportingPDF}
              activeOpacity={0.7}
            >
              {exportingCSV ? (
                <ActivityIndicator color={colors.text} size="small" />
              ) : (
                <Text style={styles.ghostBtnText}>CSV</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.ghostBtn, { flex: 1 }, (exportingCSV || exportingPDF) && styles.disabled]}
              onPress={exportarPDF}
              disabled={exportingCSV || exportingPDF}
              activeOpacity={0.7}
            >
              {exportingPDF ? (
                <ActivityIndicator color={colors.text} size="small" />
              ) : (
                <Text style={styles.ghostBtnText}>PDF</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={[styles.row2, { marginTop: 12 }]}>
            <View style={[styles.col, styles.searchWrap]}>
              <Ionicons name="search" size={14} color={colors.muted} style={{ marginRight: 6 }} />
              <TextInput
                style={styles.searchInput}
                value={searchProduto}
                onChangeText={setSearchProduto}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                placeholder="Filtrar por produto..."
                placeholderTextColor={colors.muted}
              />
              {searchProduto ? (
                <TouchableOpacity
                  onPress={() => setSearchProduto('')}
                  hitSlop={8}
                >
                  <Ionicons name="close-circle" size={18} color={colors.muted} />
                </TouchableOpacity>
              ) : null}
            </View>
            <View style={styles.col}>
              <TouchableOpacity
                style={[styles.input, styles.dateInput]}
                onPress={() => setDestinoPickerOpen(true)}
                activeOpacity={0.7}
              >
                <Text style={styles.dateValue} numberOfLines={1}>
                  {filtroDestino}
                </Text>
                <Ionicons name="chevron-down" size={16} color={colors.muted} />
              </TouchableOpacity>
            </View>
          </View>

          {searchFocused && produtosDropdown.length > 0 ? (
            <View style={styles.searchDropdown}>
              {produtosDropdown.slice(0, 3).map((nome) => (
                <TouchableOpacity
                  key={nome}
                  style={styles.searchDropdownItem}
                  onPress={() => {
                    setSearchProduto(nome);
                    setSearchFocused(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.searchDropdownText} numberOfLines={1}>
                    {nome}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </View>

        {/* 3. Alert estimado */}
        <View style={styles.alertBox}>
          <Text style={styles.alertText}>Custo estimado para fins de gestão</Text>
        </View>

        {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}

        {/* 4. Stats Grid */}
        <View style={styles.statCardFull}>
          <Text style={styles.statLabel}>TOTAL SOBRAS POR UNIDADE</Text>
          {totaisPorUnidade.length === 0 ? (
            <Text style={styles.statEmpty}>—</Text>
          ) : (
            <View style={styles.chipsRow}>
              {totaisPorUnidade.map((t) => (
                <View key={t.unidade} style={styles.chip}>
                  <Text style={styles.chipText}>
                    {formatarQuantidade(t.quantidade)} {t.unidade}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.statsRow}>
          <View style={[styles.statCardHalf, { marginRight: 5 }]}>
            <Text style={styles.statLabel}>PREJUÍZO EST.</Text>
            <Text style={[styles.statValueBig, { color: colors.accent }]}>
              {formatBRL(totals.prejuizo)}
            </Text>
            <Text style={styles.statSub}>no período</Text>
          </View>
          <View style={[styles.statCardHalf, { marginLeft: 5 }]}>
            <Text style={styles.statLabel}>LANÇAMENTOS</Text>
            <Text style={styles.statValueBig}>{totals.total}</Text>
            <Text style={styles.statSub}>registros</Text>
          </View>
        </View>

        <View style={styles.statCardFull}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Ionicons name="cash-outline" size={12} color={colors.muted} style={{ marginRight: 4 }} />
            <Text style={styles.statLabel}>VALOR RECUPERADO</Text>
          </View>
          <Text style={[styles.statValueBig, { color: colors.gold }]}>
            {formatBRL(totals.recuperado)}
          </Text>
          <Text style={styles.statSub}>vendas resgatadas</Text>
        </View>

        {/* 5. Card Ranking */}
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <View style={styles.bullet} />
            <Text style={styles.sectionTitle}>Ranking de perdas</Text>
          </View>
          {ranking.length === 0 ? (
            <Text style={styles.empty}>Sem dados para o período.</Text>
          ) : (
            ranking.map((r, idx) => (
              <View key={(r.nome || '') + idx} style={styles.rankItem}>
                <View style={styles.rankBadge}>
                  <Text style={styles.rankBadgeText}>{idx + 1}</Text>
                </View>
                <View style={styles.rankInfo}>
                  <Text style={styles.rankNome}>{(r.nome || '').toUpperCase()}</Text>
                  <Text style={styles.rankMeta}>
                    {formatarQuantidade(r.quantidade)} {r.unidade}
                  </Text>
                </View>
                {r.temCusto && r.prejuizo > 0 ? (
                  <Text style={styles.rankValor}>{formatBRL(r.prejuizo)}</Text>
                ) : (
                  <Text style={styles.rankSemCusto}>sem custo</Text>
                )}
              </View>
            ))
          )}
        </View>

        {/* 6. Card Insights */}
        {insights ? (
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <View style={styles.bullet} />
              <Text style={styles.sectionTitle}>Insights automáticos</Text>
            </View>

            {insights.destinoMaisFrequente ? (
              <View style={styles.insightCard}>
                <Text style={styles.insightLabel}>DESTINO MAIS FREQUENTE</Text>
                <Text style={styles.insightValue}>{insights.destinoMaisFrequente}</Text>
              </View>
            ) : null}

            {insights.produtoMaisPerdido ? (
              <View style={styles.insightCard}>
                <Text style={styles.insightLabel}>PRODUTO MAIS PERDIDO</Text>
                <Text style={styles.insightValue}>{insights.produtoMaisPerdido}</Text>
              </View>
            ) : null}

            {insights.diffCountPct != null ? (
              <View style={styles.insightCard}>
                <Text style={styles.insightLabel}>LANÇAMENTOS VS PERÍODO ANTERIOR</Text>
                <Text
                  style={[
                    styles.insightValue,
                    { color: insights.diffCountPct > 0 ? colors.accent : colors.green },
                  ]}
                >
                  {insights.diffCountPct > 0 ? '↑ +' : insights.diffCountPct < 0 ? '↓ ' : ''}
                  {insights.diffCountPct}%
                </Text>
              </View>
            ) : null}

            {insights.diffPrejuizoPct != null ? (
              <View style={styles.insightCard}>
                <Text style={styles.insightLabel}>PREJUÍZO VS PERÍODO ANTERIOR</Text>
                <Text
                  style={[
                    styles.insightValue,
                    { color: insights.diffPrejuizoPct > 0 ? colors.accent : colors.green },
                  ]}
                >
                  {insights.diffPrejuizoPct > 0 ? '↑ +' : insights.diffPrejuizoPct < 0 ? '↓ ' : ''}
                  {insights.diffPrejuizoPct}%
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* 7. Card Destino das sobras */}
        {destinosResumo.length > 0 ? (
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <View style={styles.bullet} />
              <Text style={styles.sectionTitle}>Destino das sobras</Text>
            </View>
            <View style={styles.destinoCard}>
              {destinosResumo.map((d, idx) => {
                const qtdText = Object.entries(d.porUnidade)
                  .map(
                    ([u, q]) =>
                      `${formatarQuantidade(q)} ${u}`
                  )
                  .join(' · ');
                const last = idx === destinosResumo.length - 1;
                return (
                  <View
                    key={d.id}
                    style={[styles.destinoRow, last && styles.destinoRowLast]}
                  >
                    <Text style={styles.destinoEmoji}>{d.emoji}</Text>
                    <View style={styles.destinoInfo}>
                      <Text style={[styles.destinoNome, { color: d.color }]}>
                        {d.id}
                      </Text>
                      <Text style={styles.destinoQtd}>{qtdText}</Text>
                    </View>
                    <Text style={styles.destinoPct}>{d.pct}%</Text>
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        {/* 8. Card Detalhe por produto (recolhível) */}
        {detalheProdutos.length > 0 ? (
          <View style={styles.card}>
            <TouchableOpacity
              style={styles.collapseHeaderRow}
              onPress={() => setDetalheExpanded((v) => !v)}
              activeOpacity={0.7}
            >
              <Text style={styles.collapseTitle}>
                Resumo por produto ({detalheProdutos.length} itens)
              </Text>
              <Ionicons
                name={detalheExpanded ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={colors.accent}
              />
            </TouchableOpacity>

            {detalheExpanded ? (
              <View style={styles.detalheTable}>
                <View style={styles.detalheTableHeader}>
                  <Text style={[styles.detalheTh, styles.detalheColProduto]}>
                    PRODUTO
                  </Text>
                  <Text style={[styles.detalheTh, styles.detalheColQtd]}>SOBRA</Text>
                  <Text style={[styles.detalheTh, styles.detalheColDestino]}>
                    DESTINO
                  </Text>
                  <Text style={[styles.detalheTh, styles.detalheColPrej]}>
                    PREJUÍZO
                  </Text>
                </View>

                {(detalheVerTodos ? detalheProdutos : detalheProdutos.slice(0, 5)).map(
                  (p, idx, arr) => {
                    const destinoCfg = DESTINOS.find(
                      (d) => d.id === p.destinoMaisFrequente
                    );
                    const last = idx === arr.length - 1;
                    return (
                      <View
                        key={(p.nome || '') + idx}
                        style={[styles.detalheRow, last && styles.detalheRowLast]}
                      >
                        <Text
                          style={[styles.detalheTd, styles.detalheColProduto]}
                          numberOfLines={2}
                        >
                          {p.nome}
                        </Text>
                        <Text style={[styles.detalheTd, styles.detalheColQtd]}>
                          {formatarQuantidade(p.quantidade)} {p.unidade}
                          {'\n'}
                          <Text style={{ color: colors.muted, fontSize: 10, marginTop: 2 }}>
                            {p.count > 1 ? `${p.count} lançamentos` : ''}
                          </Text>
                        </Text>
                        <Text
                          style={[
                            styles.detalheTd,
                            styles.detalheColDestino,
                            {
                              color: destinoCfg?.color || colors.muted,
                              fontWeight: '700',
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
                  }
                )}

                {detalheProdutos.length > 5 ? (
                  <TouchableOpacity
                    style={styles.verTodosBtn}
                    onPress={() => setDetalheVerTodos((v) => !v)}
                    activeOpacity={0.7}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={styles.verTodosText}>
                        {detalheVerTodos ? 'Mostrar menos' : `Ver todos ${detalheProdutos.length} produtos`}
                      </Text>
                      <Ionicons
                        name={detalheVerTodos ? 'chevron-up' : 'chevron-down'}
                        size={14}
                        color={colors.accent}
                      />
                    </View>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}

        {/* 9. Seção Lançamentos (recolhível) */}
        <View style={styles.lancamentosWrap}>
          <TouchableOpacity
            style={styles.lancamentosHeader}
            onPress={() => setLancamentosExpanded((v) => !v)}
            activeOpacity={0.7}
          >
            <Text style={styles.lancamentosTitle}>
              Histórico de lançamentos ({lancamentosFiltrados.length})
            </Text>
            <Ionicons
              name={lancamentosExpanded ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={colors.accent}
            />
          </TouchableOpacity>

          {lancamentosExpanded ? (
            lancamentosFiltrados.length === 0 ? (
              <Text style={styles.empty}>Nenhum lançamento neste período.</Text>
            ) : (
              lancamentosFiltrados.map((l) => {
                const destinoCfg = DESTINOS.find((d) => d.id === l.destino);
                return (
                  <View key={l.id} style={styles.itemCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemNome}>{l.produto_nome}</Text>
                      <View style={styles.itemMetaRow}>
                        <Text style={styles.itemQtd}>
                          {formatarQuantidade(l.quantidade)} {l.unidade}
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
            )
          ) : null}
        </View>
      </ScrollView>

      {/* DatePickers */}
      {showPickerInicio && Platform.OS === 'android' ? (
        <DateTimePicker
          value={safeDate(dataInicio)}
          mode="date"
          display="default"
          onChange={(e, d) => onChangeDate('inicio', e, d)}
        />
      ) : null}
      {showPickerFim && Platform.OS === 'android' ? (
        <DateTimePicker
          value={safeDate(dataFim)}
          mode="date"
          display="default"
          onChange={(e, d) => onChangeDate('fim', e, d)}
        />
      ) : null}

      {/* iOS DatePicker em modal */}
      {Platform.OS === 'ios' ? (
        <>
          <Modal
            visible={showPickerInicio}
            transparent
            animationType="fade"
            onRequestClose={() => setShowPickerInicio(false)}
          >
            <View style={styles.pickerBackdrop}>
              <View style={styles.pickerCard}>
                <Text style={styles.pickerTitle}>Data inicial</Text>
                <DateTimePicker
                  value={safeDate(tempPickerDate)}
                  mode="date"
                  display="spinner"
                  onChange={(e, d) => onChangeDate('inicio', e, d)}
                  themeVariant="dark"
                  textColor={colors.text}
                />
                <TouchableOpacity
                  style={styles.pickerConfirm}
                  onPress={confirmPickerInicio}
                >
                  <Text style={styles.pickerConfirmText}>OK</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.pickerCancel}
                  onPress={() => setShowPickerInicio(false)}
                >
                  <Text style={styles.pickerCancelText}>Cancelar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          <Modal
            visible={showPickerFim}
            transparent
            animationType="fade"
            onRequestClose={() => setShowPickerFim(false)}
          >
            <View style={styles.pickerBackdrop}>
              <View style={styles.pickerCard}>
                <Text style={styles.pickerTitle}>Data final</Text>
                <DateTimePicker
                  value={safeDate(tempPickerDate)}
                  mode="date"
                  display="spinner"
                  onChange={(e, d) => onChangeDate('fim', e, d)}
                  themeVariant="dark"
                  textColor={colors.text}
                />
                <TouchableOpacity
                  style={styles.pickerConfirm}
                  onPress={confirmPickerFim}
                >
                  <Text style={styles.pickerConfirmText}>OK</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.pickerCancel}
                  onPress={() => setShowPickerFim(false)}
                >
                  <Text style={styles.pickerCancelText}>Cancelar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        </>
      ) : null}

      {/* Destino picker */}
      <Modal
        visible={destinoPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDestinoPickerOpen(false)}
      >
        <TouchableOpacity
          style={styles.pickerBackdrop}
          activeOpacity={1}
          onPress={() => setDestinoPickerOpen(false)}
        >
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>Filtrar por destino</Text>
            {DESTINO_OPTIONS.map((d) => {
              const active = d === filtroDestino;
              return (
                <TouchableOpacity
                  key={d}
                  style={[styles.pickerOption, active && styles.pickerOptionActive]}
                  onPress={() => {
                    setFiltroDestino(d);
                    setDestinoPickerOpen(false);
                  }}
                >
                  <Text
                    style={[
                      styles.pickerOptionText,
                      active && styles.pickerOptionTextActive,
                    ]}
                  >
                    {d}
                  </Text>
                  {active ? (
                    <Ionicons name="checkmark" size={18} color={colors.accent} />
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { paddingBottom: 40 },

  // 1. Hero
  hero: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 12,
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#1a2a3a',
  },
  heroContent: { flex: 1, paddingRight: 12 },
  heroEyebrow: {
    color: colors.gold,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  heroTitle: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 6,
  },
  heroSubtitle: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  biBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  biBadgeText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
  },

  // Cards
  card: {
    backgroundColor: '#2a2a2a',
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 12,
  },

  // Labels e inputs
  label: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.muted,
    marginBottom: 5,
  },
  input: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1.5,
    borderColor: '#333333',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: colors.text,
  },
  dateInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateValue: {
    color: colors.text,
    fontSize: 15,
  },
  dateIcon: { fontSize: 14 },

  row2: { flexDirection: 'row', gap: 8 },
  col: { flex: 1 },

  actionsRow: { flexDirection: 'row', gap: 8 },
  primaryBtn: {
    backgroundColor: colors.accent,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  ghostBtn: {
    borderWidth: 1,
    borderColor: '#333333',
    backgroundColor: 'transparent',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostBtnText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  disabled: { opacity: 0.55 },

  // Busca
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderWidth: 1.5,
    borderColor: '#333333',
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  searchIcon: { fontSize: 14, marginRight: 6 },
  searchInput: {
    flex: 1,
    paddingVertical: 11,
    fontSize: 15,
    color: colors.text,
  },
  searchDropdown: {
    marginTop: 8,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 10,
    overflow: 'hidden',
  },
  searchDropdownItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  searchDropdownText: {
    color: colors.text,
    fontSize: 14,
  },

  // 3. Alert
  alertBox: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#2a2200',
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  alertText: {
    color: colors.gold,
    fontSize: 12,
    fontWeight: '600',
  },

  // 4. Stats
  statCardFull: {
    backgroundColor: '#2a2a2a',
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 10,
  },
  statsRow: {
    flexDirection: 'row',
    marginHorizontal: 11,
    marginBottom: 10,
  },
  statCardHalf: {
    flex: 1,
    backgroundColor: '#2a2a2a',
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 14,
    padding: 14,
  },
  statLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  statValueBig: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
  },
  statSub: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 4,
  },
  statEmpty: {
    color: colors.muted,
    fontSize: 14,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  chip: {
    backgroundColor: '#333333',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  chipText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },

  // Section header (bolinha + título)
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  bullet: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accent,
    marginRight: 10,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },

  // 5. Ranking
  rankItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 12,
    marginBottom: 6,
  },
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rankBadgeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  rankInfo: { flex: 1 },
  rankNome: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  rankMeta: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  rankValor: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  rankSemCusto: {
    color: colors.muted,
    fontSize: 12,
    fontStyle: 'italic',
  },

  // 6. Insights
  insightCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 12,
    marginBottom: 6,
  },
  insightLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  insightValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },

  // 7. Destinos
  destinoCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 14,
  },
  destinoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  destinoRowLast: { borderBottomWidth: 0 },
  destinoEmoji: {
    fontSize: 22,
    marginRight: 12,
  },
  destinoInfo: { flex: 1 },
  destinoNome: {
    fontSize: 14,
    fontWeight: '700',
  },
  destinoQtd: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  destinoPct: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },

  // 8. Detalhe (recolhível)
  collapseHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  collapseTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  collapseArrow: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 8,
  },
  detalheTable: {
    marginTop: 12,
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    overflow: 'hidden',
  },
  detalheTableHeader: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#1c1c1c',
  },
  detalheTh: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  detalheRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
    alignItems: 'center',
  },
  detalheRowLast: { borderBottomWidth: 0 },
  detalheTd: {
    color: colors.text,
    fontSize: 12,
  },
  detalheColProduto: { flex: 2.2, paddingRight: 6 },
  detalheColQtd: { flex: 1.2, textAlign: 'right', paddingRight: 6 },
  detalheColDestino: { flex: 1.5, textAlign: 'right', paddingRight: 6 },
  detalheColPrej: { flex: 1.3, textAlign: 'right' },
  detalhePrej: { color: colors.accent, fontWeight: '700' },
  detalheSemCusto: { color: colors.muted, fontStyle: 'italic' },

  verTodosBtn: {
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#1c1c1c',
  },
  verTodosText: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '600',
  },

  // 9. Lançamentos
  lancamentosWrap: {
    backgroundColor: '#2a2a2a',
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 14,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  lancamentosHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    marginBottom: 8,
  },
  lancamentosTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333333',
    padding: 14,
    marginBottom: 8,
  },
  itemNome: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  itemMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  itemQtd: { color: colors.muted, fontSize: 13 },
  itemSep: { color: colors.muted, fontSize: 13, marginHorizontal: 6 },
  itemDestino: { fontSize: 13, fontWeight: '700' },
  itemRecuperado: { color: colors.green, fontSize: 12, marginTop: 4 },
  itemData: { color: colors.muted, fontSize: 12, marginLeft: 8 },

  empty: {
    color: colors.muted,
    textAlign: 'center',
    paddingVertical: 14,
    fontSize: 13,
  },
  error: {
    color: colors.danger,
    marginHorizontal: 16,
    marginBottom: 12,
    fontSize: 13,
  },

  // Picker modal
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  pickerCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#2a2a2a',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#333333',
    padding: 16,
  },
  pickerTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 12,
  },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333333',
    marginBottom: 6,
  },
  pickerOptionActive: {
    borderColor: colors.accent,
  },
  pickerOptionText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  pickerOptionTextActive: {
    color: colors.accent,
  },
  pickerConfirm: {
    backgroundColor: colors.accent,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 12,
  },
  pickerConfirmText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  pickerCancel: {
    borderWidth: 1,
    borderColor: '#333333',
    backgroundColor: 'transparent',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  pickerCancelText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
});
