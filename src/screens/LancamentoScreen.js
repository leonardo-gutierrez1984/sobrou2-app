import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Animated,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Keyboard,
  Alert,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../services/supabase';
import { colors } from '../theme/colors';
import AppHeader from '../components/AppHeader';
import {
  DESTINOS,
  getDestinoColor,
  formatBRL,
  formatarQuantidade,
} from '../utils/lancamentos';

const SERIF = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });

const UNIDADES = ['Un', 'Kg', 'Dz', 'L'];

const DESTINO_BLUE = colors.blue;

function formatTime(iso) {
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

function ymdLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function formatDDMM(dateStr) {
  if (!dateStr) return '';
  const parts = String(dateStr).slice(0, 10).split('-');
  if (parts.length !== 3) return '';
  return `${parts[2]}/${parts[1]}`;
}

const QUERY_TIMEOUT_MS = 10000;
const TIMEOUT_TAG = '__TIMEOUT__:';

async function withTimeout(promise, label, ms = QUERY_TIMEOUT_MS) {
  let timeoutId;
  const timed = new Promise((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(`${TIMEOUT_TAG}${label}`)),
      ms
    );
  });
  console.log(`[Lanc] ${label}: awaiting (timeout ${ms}ms)...`);
  try {
    const result = await Promise.race([promise, timed]);
    console.log(`[Lanc] ${label}: settled`);
    return result;
  } finally {
    clearTimeout(timeoutId);
  }
}

function isTimeoutError(err) {
  return err && typeof err.message === 'string' && err.message.startsWith(TIMEOUT_TAG);
}

function normalizar(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export default function LancamentoScreen() {
  const navigation = useNavigation();
  const [userId, setUserId] = useState(null);
  const [empresaId, setEmpresaId] = useState(null);
  const [produtos, setProdutos] = useState([]);
  const [loadingProdutos, setLoadingProdutos] = useState(true);
  const [produtosError, setProdutosError] = useState('');

  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);

  const [qtdProducao, setQtdProducao] = useState('');
  const [quantidade, setQuantidade] = useState('');
  const [equivaleA, setEquivaleA] = useState('');
  const [unidade, setUnidade] = useState('Un');
  const [destino, setDestino] = useState(null);
  const [valorCheio, setValorCheio] = useState('');
  const [valorRecebido, setValorRecebido] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [errorField, setErrorField] = useState(null);

  const scrollRef = useRef(null);
  const formCardY = useRef(0);
  const fieldY = useRef({});

  const [toast, setToast] = useState('');
  const toastAnim = useRef(new Animated.Value(0)).current;

  const [lancamentosHoje, setLancamentosHoje] = useState([]);
  const [loadingLancamentos, setLoadingLancamentos] = useState(false);

  const [produtosVencendoHoje, setProdutosVencendoHoje] = useState([]);

  const [editingLanc, setEditingLanc] = useState(null);
  const [editDestino, setEditDestino] = useState(null);
  const [editValorCheio, setEditValorCheio] = useState('');
  const [editValorRecebido, setEditValorRecebido] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const [sacola, setSacola] = useState([]);
  const [sacolaVisible, setSacolaVisible] = useState(false);
  const [sacolaBusca, setSacolaBusca] = useState('');
  const [sacolaProdutoSelecionado, setSacolaProdutoSelecionado] = useState(null);
  const [sacolaQtd, setSacolaQtd] = useState('');
  const [sacolaValorCheio, setSacolaValorCheio] = useState('');
  const [sacolaValorRecebido, setSacolaValorRecebido] = useState('');
  const [sacolaSaving, setSacolaSaving] = useState(false);
  const [sacolaError, setSacolaError] = useState('');
  const [sacolaVerTodos, setSacolaVerTodos] = useState(false);

  const [planejVisible, setPlanejVisible] = useState(false);
  const [planejBusca, setPlanejBusca] = useState('');
  const [planejProduto, setPlanejProduto] = useState(null);
  const [planejQtd, setPlanejQtd] = useState('');
  const [planejList, setPlanejList] = useState([]);
  const [planejSaving, setPlanejSaving] = useState(false);
  const [planejError, setPlanejError] = useState('');

  const [prodListExpanded, setProdListExpanded] = useState(false);
  const [lancListExpanded, setLancListExpanded] = useState(false);
  const [vendaGroupExpanded, setVendaGroupExpanded] = useState(false);
  const [planejHistorico, setPlanejHistorico] = useState([]);
  const [planejHistExpanded, setPlanejHistExpanded] = useState(false);

  const [sacolaInputFocused, setSacolaInputFocused] = useState(false);
  const [planejInputFocused, setPlanejInputFocused] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const userRes = await withTimeout(supabase.auth.getUser(), 'getUser');
        if (!mounted) return;
        const user = userRes?.data?.user;
        if (!user) {
          setProdutosError('Sessão inválida. Faça login novamente.');
          setLoadingProdutos(false);
          return;
        }
        setUserId(user.id);

        const membroRes = await withTimeout(
          supabase
            .from('membros')
            .select('empresa_id')
            .eq('user_id', user.id)
            .limit(1)
            .maybeSingle(),
          'select membros'
        );
        if (!mounted) return;

        if (membroRes.error) {
          console.error('[Lanc] membros error:', membroRes.error);
          setProdutosError(membroRes.error.message);
          setLoadingProdutos(false);
          return;
        }
        const membro = membroRes.data;
        if (!membro?.empresa_id) {
          setProdutosError('Empresa não encontrada para este usuário.');
          setLoadingProdutos(false);
          return;
        }
        setEmpresaId(membro.empresa_id);
        // produtos + lancamentos são carregados via useFocusEffect abaixo
      } catch (err) {
        if (!mounted) return;
        if (isTimeoutError(err)) {
          console.error('[Lanc]', err.message);
          setProdutosError(
            'O servidor demorou muito para responder. Verifique sua conexão e tente novamente.'
          );
        } else {
          console.error('[Lanc] unexpected error:', err);
          setProdutosError(err?.message || 'Erro inesperado ao carregar produtos.');
        }
        setLoadingProdutos(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = normalizar(search);
    if (!q) return produtos;
    return produtos.filter((p) => normalizar(p.nome).includes(q));
  }, [produtos, search]);

  const loadProdutos = async (empId = empresaId) => {
    if (!empId) return;
    try {
      const { data, error: err } = await withTimeout(
        supabase.from('produtos').select('*').eq('empresa_id', empId).order('nome', { ascending: true }),
        'loadProdutos'
      );
      if (err) {
        console.error('[Lanc] loadProdutos error:', err);
        setProdutosError(err.message);
      } else {
        setProdutos(data || []);
        setProdutosError('');
      }
    } catch (err) {
      if (isTimeoutError(err)) {
        setProdutosError('Tempo esgotado ao carregar produtos. Verifique sua conexão.');
      } else {
        setProdutosError(err?.message || 'Erro ao carregar produtos.');
      }
    }
    setLoadingProdutos(false);
  };

  const loadLancamentosHoje = async (empId = empresaId) => {
    if (!empId) return;
    setLoadingLancamentos(true);
    const hoje = new Date();
    const inicioHoje = new Date(hoje);
    inicioHoje.setHours(0, 0, 0, 0);
    const fimHoje = new Date(hoje);
    fimHoje.setHours(23, 59, 59, 999);
    try {
      const { data, error: err } = await withTimeout(
        supabase.from('lancamentos_sobras').select('*').eq('empresa_id', empId).gte('data', inicioHoje.toISOString()).lte('data', fimHoje.toISOString()).order('data', { ascending: false }),
        'loadLancamentosHoje'
      );
      if (err) console.error('[Lanc] loadLancamentosHoje error:', err);
      else setLancamentosHoje(data || []);
    } catch (err) {
      console.error('[Lanc] loadLancamentosHoje timeout/error:', err?.message);
    }
    setLoadingLancamentos(false);
  };

  const loadProdutosVencendoHoje = async (empId = empresaId) => {
    if (!empId) return;
    const hojeYMD = ymdLocal(new Date());

    const { data: lotes, error: lotesErr } = await supabase
      .from('lotes')
      .select('*, produtos(nome, unidade, validade_dias)')
      .eq('empresa_id', empId)
      .eq('status', 'aberto')
      .eq('data_vencimento', hojeYMD);

    if (lotesErr) {
      console.error('[Lanc] loadProdutosVencendoHoje lotes error:', lotesErr);
      return;
    }
    setProdutosVencendoHoje(lotes || []);
  };

  useFocusEffect(
    useCallback(() => {
      if (!empresaId) return;
      loadProdutos(empresaId);
      loadLancamentosHoje(empresaId);
      loadProdutosVencendoHoje(empresaId);
      loadPlanejamentoAmanha(empresaId);
    }, [empresaId])
  );

  useEffect(() => {
    if (sacola.length === 0) return;
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      e.preventDefault();
      Alert.alert(
        'Sacola não confirmada',
        'Você tem itens na sacola de venda resgatada que não foram confirmados. Deseja sair mesmo assim?',
        [
          { text: 'Ficar', style: 'cancel' },
          {
            text: 'Sair mesmo assim',
            style: 'destructive',
            onPress: () => navigation.dispatch(e.data.action),
          },
        ]
      );
    });
    return unsubscribe;
  }, [navigation, sacola.length]);

  const openEdit = (lanc) => {
    setEditingLanc(lanc);
    setEditDestino(lanc.destino);
    setEditValorCheio(lanc.valor_cheio != null ? String(lanc.valor_cheio) : '');
    setEditValorRecebido(lanc.valor_recebido != null ? String(lanc.valor_recebido) : '');
    setEditError('');
  };

  const closeEdit = () => {
    setEditingLanc(null);
    setEditDestino(null);
    setEditValorCheio('');
    setEditValorRecebido('');
    setEditError('');
  };

  const handleEditSave = async () => {
    if (!editingLanc || !editDestino) {
      setEditError('Selecione o destino.');
      return;
    }
    const payload = { destino: editDestino };
    if (editDestino === 'Venda Resgatada') {
      const vc = parseFloat(String(editValorCheio).replace(',', '.'));
      const vr = parseFloat(String(editValorRecebido).replace(',', '.'));
      if (isNaN(vc) || vc < 0) {
        setEditError('Informe o valor cheio.');
        return;
      }
      if (isNaN(vr) || vr < 0) {
        setEditError('Informe o valor recebido.');
        return;
      }
      payload.valor_cheio = vc;
      payload.valor_recebido = vr;
    } else {
      payload.valor_cheio = null;
      payload.valor_recebido = null;
    }
    setEditSaving(true);
    const { error: upErr } = await supabase
      .from('lancamentos_sobras')
      .update(payload)
      .eq('id', editingLanc.id);
    setEditSaving(false);
    if (upErr) {
      setEditError(upErr.message);
      return;
    }
    closeEdit();
    showToast('Lançamento atualizado!');
    await loadLancamentosHoje();
    await loadProdutosVencendoHoje();
  };

  const handleDelete = (lanc) => {
    Alert.alert(
      'Confirmar exclusão?',
      `Deseja excluir o lançamento de ${lanc.produto_nome}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            const { error: delErr } = await supabase
              .from('lancamentos_sobras')
              .delete()
              .eq('id', lanc.id);
            if (delErr) {
              Alert.alert('Erro', delErr.message);
              return;
            }
            showToast('Lançamento excluído.');
            await loadLancamentosHoje();
            await loadProdutosVencendoHoje();
          },
        },
      ]
    );
  };

  const sacolaProdutosFiltrados = useMemo(() => {
    if (sacolaProdutoSelecionado && sacolaProdutoSelecionado.nome === sacolaBusca) return [];
    const q = normalizar(sacolaBusca);
    if (!q) return [];
    return produtos.filter((p) => normalizar(p.nome).includes(q)).slice(0, 8);
  }, [produtos, sacolaBusca, sacolaProdutoSelecionado]);

  const handleSacolaSearchChange = (text) => {
    setSacolaBusca(text);
    if (sacolaProdutoSelecionado && sacolaProdutoSelecionado.nome !== text) {
      setSacolaProdutoSelecionado(null);
    }
    setSacolaError('');
  };

  const handleSacolaPickProduto = (p) => {
    setSacolaProdutoSelecionado(p);
    setSacolaBusca(p.nome);
  };

  const handleAddSacolaItem = () => {
    setSacolaError('');
    if (!sacolaProdutoSelecionado) {
      setSacolaError('Selecione um produto.');
      return;
    }
    const q = parseFloat(String(sacolaQtd).replace(',', '.'));
    if (!sacolaQtd || isNaN(q) || q <= 0) {
      setSacolaError('Informe uma quantidade válida.');
      return;
    }
    setSacola((prev) => {
      const existing = prev.find((i) => i.produto_id === sacolaProdutoSelecionado.id);
      if (existing) {
        return prev.map((i) =>
          i.produto_id === sacolaProdutoSelecionado.id
            ? { ...i, quantidade: i.quantidade + q }
            : i
        );
      }
      return [
        ...prev,
        {
          produto_id: sacolaProdutoSelecionado.id,
          produto_nome: sacolaProdutoSelecionado.nome,
          unidade: sacolaProdutoSelecionado.unidade || 'Un',
          quantidade: q,
        },
      ];
    });
    setSacolaProdutoSelecionado(null);
    setSacolaBusca('');
    setSacolaQtd('');
  };

  const handleRemoveSacolaItem = (produtoId) => {
    setSacola((prev) => prev.filter((i) => i.produto_id !== produtoId));
  };

  const handleConfirmarSacola = async () => {
    setSacolaError('');
    if (sacola.length === 0) {
      setSacolaError('Adicione pelo menos um item à sacola.');
      return;
    }
    const vc = parseFloat(String(sacolaValorCheio).replace(',', '.'));
    const vr = parseFloat(String(sacolaValorRecebido).replace(',', '.'));
    if (!sacolaValorCheio || isNaN(vc) || vc <= 0) {
      setSacolaError('Informe o valor cheio.');
      return;
    }
    if (!sacolaValorRecebido || isNaN(vr) || vr <= 0) {
      setSacolaError('Informe o valor recebido.');
      return;
    }

    Keyboard.dismiss();
    setSacolaSaving(true);
    const now = new Date().toISOString();
    for (let i = 0; i < sacola.length; i++) {
      const item = sacola[i];
      const payload = {
        empresa_id: empresaId,
        user_id: userId,
        produto_id: item.produto_id,
        produto_nome: item.produto_nome,
        quantidade: item.quantidade,
        unidade: item.unidade,
        destino: 'Venda Resgatada',
        data: now,
        valor_cheio: i === 0 ? vc : null,
        valor_recebido: i === 0 ? vr : null,
      };
      const { error: insErr } = await supabase.from('lancamentos_sobras').insert(payload);
      if (insErr) {
        setSacolaSaving(false);
        setSacolaError(`Erro ao salvar "${item.produto_nome}": ${insErr.message}`);
        return;
      }
    }
    setSacolaSaving(false);
    setSacola([]);
    setSacolaValorCheio('');
    setSacolaValorRecebido('');
    setSacolaProdutoSelecionado(null);
    setSacolaBusca('');
    setSacolaQtd('');
    setSacolaVerTodos(false);
    showToast('✓ Sacola de venda registrada!');
    await loadLancamentosHoje();
    await loadProdutosVencendoHoje();
  };

  const planejProdutosFiltrados = useMemo(() => {
    if (planejProduto && planejProduto.nome === planejBusca) return [];
    const q = normalizar(planejBusca);
    if (!q) return [];
    return produtos.filter((p) => normalizar(p.nome).includes(q)).slice(0, 8);
  }, [produtos, planejBusca, planejProduto]);

  const handlePlanejPickProduto = (p) => {
    setPlanejProduto(p);
    setPlanejBusca(p.nome);
  };

  const handlePlanejBuscaChange = (text) => {
    setPlanejBusca(text);
    if (planejProduto && planejProduto.nome !== text) {
      setPlanejProduto(null);
    }
    setPlanejError('');
  };

  const handleAddPlanejItem = () => {
    setPlanejError('');
    if (!planejProduto) {
      setPlanejError('Selecione um produto.');
      return;
    }
    const q = parseFloat(String(planejQtd).replace(',', '.'));
    if (!planejQtd || isNaN(q) || q <= 0) {
      setPlanejError('Informe uma quantidade válida.');
      return;
    }
    setPlanejList((prev) => {
      const existing = prev.find((i) => i.produto_id === planejProduto.id);
      if (existing) {
        return prev.map((i) =>
          i.produto_id === planejProduto.id
            ? { ...i, quantidade: i.quantidade + q }
            : i
        );
      }
      return [
        ...prev,
        {
          produto_id: planejProduto.id,
          produto_nome: planejProduto.nome,
          unidade: planejProduto.unidade || 'Un',
          quantidade: q,
        },
      ];
    });
    setPlanejProduto(null);
    setPlanejBusca('');
    setPlanejQtd('');
  };

  const handleRemovePlanejItem = (produtoId) => {
    setPlanejList((prev) => prev.filter((i) => i.produto_id !== produtoId));
  };

  const handleSalvarPlanejamento = async () => {
    setPlanejError('');
    if (planejList.length === 0) {
      setPlanejError('Adicione pelo menos um item.');
      return;
    }
    setPlanejSaving(true);
    const amanha = new Date();
    amanha.setDate(amanha.getDate() + 1);
    const dataISO = amanha.toISOString();

    for (const item of planejList) {
      const { error: insErr } = await supabase.from('producao').insert({
        empresa_id: empresaId,
        user_id: userId,
        produto_id: item.produto_id,
        quantidade: item.quantidade,
        data: dataISO,
      });
      if (insErr) {
        setPlanejSaving(false);
        setPlanejError(`Erro ao salvar "${item.produto_nome}": ${insErr.message}`);
        return;
      }
    }
    setPlanejSaving(false);
    setPlanejList([]);
    setPlanejProduto(null);
    setPlanejBusca('');
    setPlanejQtd('');
    showToast('✓ Planejamento de amanhã salvo!');
    await loadPlanejamentoAmanha();
  };

  const loadPlanejamentoAmanha = async (empId = empresaId) => {
    if (!empId) return;
    const amanha = new Date();
    amanha.setDate(amanha.getDate() + 1);
    const inicio = new Date(amanha);
    inicio.setHours(0, 0, 0, 0);
    const fim = new Date(amanha);
    fim.setHours(23, 59, 59, 999);
    const { data, error: err } = await supabase
      .from('producao')
      .select('id, quantidade, produto_id, produtos(nome, unidade)')
      .eq('empresa_id', empId)
      .gte('data', inicio.toISOString())
      .lte('data', fim.toISOString())
      .order('criado_em', { ascending: false });
    if (err) {
      console.error('[Lanc] loadPlanejamentoAmanha error:', err);
      return;
    }
    setPlanejHistorico(data || []);
  };

  const handleRemovePlanejHistorico = (item) => {
    Alert.alert(
      'Remover item?',
      `Deseja remover "${item.produtos?.nome || 'item'}" do planejamento?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: async () => {
            const { error: delErr } = await supabase
              .from('producao')
              .delete()
              .eq('id', item.id);
            if (delErr) {
              Alert.alert('Erro', delErr.message);
              return;
            }
            showToast('Item removido do planejamento.');
            await loadPlanejamentoAmanha();
          },
        },
      ]
    );
  };

  const showSacolaAjuda = () => {
    Alert.alert(
      'Sacola de venda resgatada',
      'A sacola permite registrar múltiplos produtos numa única venda com desconto. Informe os produtos, o valor cheio e o valor recebido.'
    );
  };

  const saveButtonLabel = useMemo(() => {
    const prodNum = parseFloat(String(qtdProducao).replace(',', '.'));
    const sobraNum = parseFloat(String(quantidade).replace(',', '.'));
    const temProd = !isNaN(prodNum) && prodNum > 0;
    const temSobra = !isNaN(sobraNum) && sobraNum > 0;
    if (temProd && temSobra) return '✓ Salvar Produção e Sobra';
    if (temProd) return '✓ Registrar Produção';
    if (temSobra) return '✓ Lançar Sobra';
    return '✓ Salvar';
  }, [qtdProducao, quantidade]);

  const currentStep = useMemo(() => {
    if (!selected) return 1;
    const prodNum = parseFloat(String(qtdProducao).replace(',', '.'));
    const sobraNum = parseFloat(String(quantidade).replace(',', '.'));
    const temProd = !isNaN(prodNum) && prodNum > 0;
    const temSobra = !isNaN(sobraNum) && sobraNum > 0;
    if (!temProd && !temSobra) return 2;
    if (temSobra && !destino) return 3;
    return 4;
  }, [selected, qtdProducao, quantidade, destino]);

  const lancamentosNormais = useMemo(
    () => lancamentosHoje.filter((l) => l.destino !== 'Venda Resgatada'),
    [lancamentosHoje]
  );
  const lancamentosVenda = useMemo(
    () => lancamentosHoje.filter((l) => l.destino === 'Venda Resgatada'),
    [lancamentosHoje]
  );
  const totalRecuperado = useMemo(
    () => lancamentosVenda.reduce((acc, l) => acc + (parseFloat(l.valor_recebido) || 0), 0),
    [lancamentosVenda]
  );

  const showToast = (msg) => {
    setToast(msg);
    toastAnim.setValue(0);
    Animated.sequence([
      Animated.timing(toastAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(1800),
      Animated.timing(toastAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start(() => setToast(''));
  };

  const scrollToField = (field) => {
    const y = (formCardY.current || 0) + (fieldY.current[field] || 0) - 80;
    scrollRef.current?.scrollTo({ y: Math.max(0, y), animated: true });
  };

  const resetForm = () => {
    setSelected(null);
    setSearch('');
    setQtdProducao('');
    setQuantidade('');
    setEquivaleA('');
    setUnidade('Un');
    setDestino(null);
    setValorCheio('');
    setValorRecebido('');
    setError('');
    setErrorField(null);
  };

  const handleSave = async () => {
    setError('');
    setErrorField(null);
    if (!selected) {
      setError('Selecione um produto.');
      return;
    }

    const producaoNum = qtdProducao
      ? parseFloat(String(qtdProducao).replace(',', '.'))
      : 0;
    const temProducao = !!qtdProducao && !isNaN(producaoNum) && producaoNum > 0;
    if (qtdProducao && (isNaN(producaoNum) || producaoNum < 0)) {
      setError('Quantidade produzida inválida.');
      setErrorField('producao');
      scrollToField('producao');
      return;
    }

    const qNum = quantidade ? parseFloat(String(quantidade).replace(',', '.')) : 0;
    const temSobra = !!quantidade && !isNaN(qNum) && qNum > 0;
    if (quantidade && (isNaN(qNum) || qNum < 0)) {
      setError('Quantidade de sobra inválida.');
      setErrorField('sobra');
      scrollToField('sobra');
      return;
    }

    if (!temProducao && !temSobra) {
      setError('Informe a quantidade produzida ou de sobra.');
      setErrorField('sobra');
      scrollToField('sobra');
      return;
    }

    let valorCheioNum;
    let valorRecebidoNum;
    if (temSobra) {
      if (!destino) {
        setError('Selecione o destino da sobra.');
        setErrorField('destino');
        scrollToField('destino');
        return;
      }
      if (destino === 'Venda Resgatada') {
        valorCheioNum = parseFloat(String(valorCheio).replace(',', '.'));
        valorRecebidoNum = parseFloat(String(valorRecebido).replace(',', '.'));
        if (!valorCheio || isNaN(valorCheioNum) || valorCheioNum < 0) {
          setError('Informe o valor cheio.');
          setErrorField('venda');
          scrollToField('venda');
          return;
        }
        if (!valorRecebido || isNaN(valorRecebidoNum) || valorRecebidoNum < 0) {
          setError('Informe o valor recebido.');
          setErrorField('venda');
          scrollToField('venda');
          return;
        }
      }
    }

    Keyboard.dismiss();
    setSaving(true);

    const agora = new Date();
    const agoraISO = agora.toISOString();
    const hojeYMD = ymdLocal(agora);

    if (temProducao) {
      const { error: prodErr } = await supabase.from('producao').insert({
        empresa_id: empresaId,
        user_id: userId,
        produto_id: selected.id,
        quantidade: producaoNum,
        data: agoraISO,
      });
      if (prodErr) {
        setSaving(false);
        setError(`Erro ao salvar produção: ${prodErr.message}`);
        return;
      }

      if (selected.validade_dias != null && selected.validade_dias >= 0) {
        const vencDate = new Date(agora);
        vencDate.setDate(vencDate.getDate() + selected.validade_dias);
        const { error: loteErr } = await supabase.from('lotes').insert({
          empresa_id: empresaId,
          user_id: userId,
          produto_id: selected.id,
          quantidade: producaoNum,
          data_producao: hojeYMD,
          data_vencimento: ymdLocal(vencDate),
          status: 'aberto',
        });
        if (loteErr) {
          setSaving(false);
          setError(`Erro ao salvar lote: ${loteErr.message}`);
          return;
        }
      }
    }

    if (temSobra) {
      console.log('[Lanc] destino sendo enviado:', destino);

      const payload = {
        produto_id: selected.id,
        produto_nome: selected.nome,
        quantidade: qNum,
        unidade,
        destino,
        user_id: userId,
        empresa_id: empresaId,
        data: agoraISO,
      };
      if (destino === 'Venda Resgatada') {
        payload.valor_cheio = valorCheioNum;
        payload.valor_recebido = valorRecebidoNum;
      }

      const { error: insErr } = await supabase
        .from('lancamentos_sobras')
        .insert(payload);
      if (insErr) {
        setSaving(false);
        setError(insErr.message);
        return;
      }

      const { error: baixaErr } = await supabase
        .from('lotes')
        .update({ status: 'baixado' })
        .eq('empresa_id', empresaId)
        .eq('produto_id', selected.id)
        .eq('status', 'aberto')
        .lte('data_vencimento', hojeYMD);
      if (baixaErr) {
        console.error('[Lanc] baixar lotes vencidos:', baixaErr);
      }
    }

    setSaving(false);

    if (temProducao && temSobra) {
      showToast('✓ Produção e lançamento salvos!');
    } else if (temProducao) {
      showToast('✓ Produção registrada!');
    } else {
      showToast('✓ Lançamento salvo!');
    }

    resetForm();
    await loadLancamentosHoje();
    await loadProdutosVencendoHoje();
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <AppHeader />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          {produtosVencendoHoje.length > 0 ? (
            <View style={styles.vencimentoBanner}>
              <Text style={styles.vencimentoTitle}>
                ⚠️ Produtos vencendo hoje — registre as sobras:
              </Text>
              {produtosVencendoHoje.map((lote) => {
                const nome = lote.produtos?.nome || 'Produto';
                const unidadeLote = lote.produtos?.unidade || '';
                const validade = lote.produtos?.validade_dias;
                const qtdStr = formatarQuantidade(lote.quantidade ?? '');
                return (
                  <View key={lote.id} style={styles.vencimentoItem}>
                    <Text style={styles.vencimentoNome}>
                      🔔 {nome} vence hoje!
                    </Text>
                    <Text style={styles.vencimentoMeta}>
                      Produzido em {formatDDMM(lote.data_producao)} · {qtdStr}{' '}
                      {unidadeLote}
                    </Text>
                    {validade != null ? (
                      <Text style={styles.vencimentoMeta}>
                        Validade: {validade} dias
                      </Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ) : null}

          {/* OPERAÇÃO DO DIA */}
          <View style={styles.resumoWrap}>
            <LinearGradient
              colors={['#2a2a2a', '#1c1811', '#1a1a1a']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.resumoCard}
            >
              <LinearGradient
                colors={['rgba(245,200,66,0.35)', 'rgba(245,200,66,0)']}
                start={{ x: 1, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.resumoGlow}
                pointerEvents="none"
              />
              <View style={styles.resumoTop}>
                <Text style={styles.resumoLabel}>OPERAÇÃO DO DIA</Text>
                <View style={styles.hojeBtn}>
                  <Text style={styles.hojeBtnText}>Hoje</Text>
                </View>
              </View>
              <Text style={styles.resumoTitle}>Registrar sobra</Text>
              <Text style={styles.resumoSub}>
                Fluxo rápido para transformar perda em informação de produção.
              </Text>
            </LinearGradient>
          </View>

          {/* Steps horizontais */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.stepsRow}
          >
            {[
              { n: '01', label: 'Produto' },
              { n: '02', label: 'Quantidade' },
              { n: '03', label: 'Destino' },
              { n: '04', label: 'Salvar' },
            ].map((s, idx) => {
              const stepNum = idx + 1;
              const active = stepNum === currentStep;
              return (
                <View
                  key={s.n}
                  style={[styles.stepCard, active && styles.stepCardActive]}
                >
                  <Text style={styles.stepNum}>{s.n}</Text>
                  <Text style={styles.stepLabel}>{s.label}</Text>
                </View>
              );
            })}
          </ScrollView>

          {!selected ? (
            <View style={styles.formCard}>
              <Text style={styles.formCardTitle}>Buscar produto</Text>
              <View style={styles.searchRow}>
                <Ionicons name="search" size={20} color={ACOES_MUTED} style={styles.searchIcon} />
                <TextInput
                  style={styles.searchInput}
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Digite o nome do produto"
                  placeholderTextColor={ACOES_MUTED}
                  autoCorrect={false}
                />
                {search ? (
                  <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
                    <Ionicons name="close-circle" size={20} color={ACOES_MUTED} />
                  </TouchableOpacity>
                ) : null}
              </View>

              {loadingProdutos ? (
                <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />
              ) : produtosError ? (
                <Text style={styles.error}>{produtosError}</Text>
              ) : search.trim().length === 0 ? (
                <Text style={styles.empty}>Digite para buscar um produto</Text>
              ) : filtered.length === 0 ? (
                <Text style={styles.empty}>Nenhum produto encontrado.</Text>
              ) : (
                <View style={styles.list}>
                  {(prodListExpanded ? filtered : filtered.slice(0, 6)).map((p) => (
                    <TouchableOpacity
                      key={p.id}
                      style={styles.produtoItem}
                      onPress={() => setSelected(p)}
                    >
                      <Text style={styles.produtoNome}>{p.nome}</Text>
                      <Ionicons name="chevron-forward" size={20} color={colors.accent} />
                    </TouchableOpacity>
                  ))}
                  {filtered.length > 6 ? (
                    <TouchableOpacity
                      style={styles.verTodosBtn}
                      onPress={() => setProdListExpanded((v) => !v)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.verTodosText}>
                        {prodListExpanded
                          ? 'Recolher ▲'
                          : `Ver todos os ${filtered.length} resultados ▼`}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              )}
            </View>
          ) : (
            <View
              style={styles.formCard}
              onLayout={(e) => {
                formCardY.current = e.nativeEvent.layout.y;
              }}
            >
              <View style={styles.selectedHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.selectedLabel}>PRODUTO</Text>
                  <Text style={styles.selectedNome}>{selected.nome}</Text>
                </View>
                <View style={styles.trocarActions}>
                  <TouchableOpacity onPress={resetForm} style={styles.trocarBtn}>
                    <Ionicons name="swap-horizontal" size={18} color={colors.accent} />
                    <Text style={styles.trocarText}>Trocar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={resetForm} style={styles.limparBtn} hitSlop={8}>
                    <Ionicons name="close-circle" size={22} color={colors.muted} />
                  </TouchableOpacity>
                </View>
              </View>

              <Text style={styles.formLabel}>Qtd. de Sobra</Text>
              <TextInput
                style={[
                  styles.formInput,
                  errorField === 'sobra' && styles.inputError,
                ]}
                value={quantidade}
                onChangeText={setQuantidade}
                placeholder="0"
                placeholderTextColor={ACOES_MUTED}
                keyboardType="decimal-pad"
                editable={!saving}
                onLayout={(e) => {
                  fieldY.current.sobra = e.nativeEvent.layout.y;
                }}
              />

              {unidade === 'Kg' || unidade === 'L' ? (
                <>
                  <View style={styles.equivaleLabelRow}>
                    <Text style={styles.formLabelInline}>
                      Equivale a{' '}
                      <Text style={styles.labelOpcional}>opcional</Text>
                    </Text>
                    <TouchableOpacity
                      style={styles.helpBtn}
                      onPress={() =>
                        Alert.alert(
                          'Equivale a',
                          'Se a sobra é em Kg, informe aqui quantas unidades isso representa. Útil para orientar a produção do próximo dia.'
                        )
                      }
                      hitSlop={8}
                      accessibilityLabel="Sobre o campo Equivale a"
                    >
                      <Text style={styles.helpBtnText}>?</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.equivaleInputWrap}>
                    <TextInput
                      style={[styles.formInput, styles.equivaleInput]}
                      value={equivaleA}
                      onChangeText={setEquivaleA}
                      placeholder="Ex: 30"
                      placeholderTextColor={ACOES_MUTED}
                      keyboardType="number-pad"
                      editable={!saving}
                    />
                    <View style={styles.equivaleBadge}>
                      <Text style={styles.equivaleBadgeText}>Un</Text>
                    </View>
                  </View>
                </>
              ) : null}

              <Text style={styles.formLabel}>Unidade</Text>
              <View style={styles.pillsRow}>
                {UNIDADES.map((u) => {
                  const active = u === unidade;
                  return (
                    <TouchableOpacity
                      key={u}
                      style={[styles.unidadePill, active && styles.unidadePillActive]}
                      onPress={() => setUnidade(u)}
                      disabled={saving}
                    >
                      <Text style={[styles.unidadePillText, active && styles.unidadePillTextActive]}>
                        {u}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.formLabel}>Destino da sobra</Text>
              <View
                style={[
                  styles.destinosRow,
                  errorField === 'destino' && styles.destinosRowError,
                ]}
                onLayout={(e) => {
                  fieldY.current.destino = e.nativeEvent.layout.y;
                }}
              >
                {DESTINOS.filter((d) => d.id !== 'Venda Resgatada').map((d) => {
                  const active = d.id === destino;
                  const palette = DESTINO_PALETTE[d.id];
                  return (
                    <TouchableOpacity
                      key={d.id}
                      style={[
                        styles.destinoPill,
                        active && {
                          backgroundColor: palette.bg,
                          borderColor: palette.border,
                        },
                      ]}
                      onPress={() => setDestino(d.id)}
                      disabled={saving}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.destinoEmoji}>{d.emoji}</Text>
                      <Text
                        style={[
                          styles.destinoLabel,
                          active && { color: palette.border },
                        ]}
                      >
                        {d.id.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity
                style={[
                  styles.vendaResgatadaBtn,
                  destino === 'Venda Resgatada' && styles.vendaResgatadaBtnActive,
                ]}
                onPress={() => setDestino('Venda Resgatada')}
                disabled={saving}
                activeOpacity={0.85}
              >
                <Text style={styles.vendaResgatadaEmoji}>💰</Text>
                <Text
                  style={[
                    styles.vendaResgatadaText,
                    destino === 'Venda Resgatada' && styles.vendaResgatadaTextActive,
                  ]}
                >
                  VENDA RESGATADA
                </Text>
              </TouchableOpacity>

              {destino === 'Venda Resgatada' ? (
                <View
                  style={styles.vendaBox}
                  onLayout={(e) => {
                    fieldY.current.venda = e.nativeEvent.layout.y;
                  }}
                >
                  <Text style={styles.formLabel}>Valor cheio (R$)</Text>
                  <TextInput
                    style={styles.formInput}
                    value={valorCheio}
                    onChangeText={setValorCheio}
                    placeholder="0,00"
                    placeholderTextColor={ACOES_MUTED}
                    keyboardType="decimal-pad"
                    editable={!saving}
                  />
                  <Text style={styles.formLabel}>Valor recebido (R$)</Text>
                  <TextInput
                    style={styles.formInput}
                    value={valorRecebido}
                    onChangeText={setValorRecebido}
                    placeholder="0,00"
                    placeholderTextColor={ACOES_MUTED}
                    keyboardType="decimal-pad"
                    editable={!saving}
                  />
                </View>
              ) : null}

              <Text style={styles.formLabel}>
                Qtd. Produzida{' '}
                <Text style={styles.labelOpcional}>opcional</Text>
              </Text>
              <TextInput
                style={[
                  styles.formInput,
                  errorField === 'producao' && styles.inputError,
                ]}
                value={qtdProducao}
                onChangeText={setQtdProducao}
                placeholder="Ex: 200"
                placeholderTextColor={ACOES_MUTED}
                keyboardType="decimal-pad"
                editable={!saving}
                onLayout={(e) => {
                  fieldY.current.producao = e.nativeEvent.layout.y;
                }}
              />
              <Text style={styles.helperText}>Registre o que foi produzido hoje</Text>

              {error ? (
                <View style={styles.errorBanner}>
                  <Ionicons name="alert-circle" size={20} color={colors.danger} />
                  <Text style={styles.errorBannerText}>{error}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={[styles.saveButton, saving && styles.buttonDisabled]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fdfaf4" />
                ) : (
                  <Text style={styles.saveButtonText}>{saveButtonLabel}</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.sacolaCard}>
            <View style={styles.sacolaHeaderRow}>
              <TouchableOpacity
                style={styles.sacolaHeaderTitleWrap}
                onPress={() => setSacolaVisible((v) => !v)}
                activeOpacity={0.8}
              >
                <Text style={styles.sacolaHeaderTitle}>
                  🛍️ Sacola de venda resgatada
                  {sacola.length > 0 ? (
                    <Text style={styles.sacolaHeaderCount}> ({sacola.length})</Text>
                  ) : null}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.helpBtn}
                onPress={showSacolaAjuda}
                hitSlop={8}
                accessibilityLabel="O que é a sacola?"
              >
                <Text style={styles.helpBtnText}>?</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setSacolaVisible((v) => !v)}
                hitSlop={8}
                style={styles.sacolaChevron}
              >
                <Ionicons
                  name={sacolaVisible ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  color={colors.muted}
                />
              </TouchableOpacity>
            </View>

            {sacolaVisible ? (
              <View style={styles.sacolaBody}>
                {sacola.length === 0 ? (
                  <Text style={styles.sacolaEmpty}>
                    🛍️ Sacola vazia — adicione itens abaixo
                  </Text>
                ) : (
                  <>
                    {(sacolaVerTodos ? sacola : sacola.slice(0, 5)).map((item) => (
                      <View key={item.produto_id} style={styles.sacolaItem}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.sacolaItemNome}>{item.produto_nome}</Text>
                          <Text style={styles.sacolaItemMeta}>
                            {formatarQuantidade(item.quantidade)} {item.unidade}
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={styles.lancAction}
                          onPress={() => handleRemoveSacolaItem(item.produto_id)}
                          hitSlop={8}
                        >
                          <Ionicons name="trash-outline" size={20} color={colors.accent} />
                        </TouchableOpacity>
                      </View>
                    ))}
                    {sacola.length > 5 && !sacolaVerTodos ? (
                      <TouchableOpacity
                        style={styles.verTodosBtn}
                        onPress={() => setSacolaVerTodos(true)}
                      >
                        <Text style={styles.verTodosText}>
                          Ver todos ({sacola.length})
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </>
                )}

                <Text style={styles.sacolaSectionLabel}>Adicionar item</Text>
                <View style={styles.searchRow}>
                  <Ionicons name="search" size={20} color={colors.muted} style={styles.searchIcon} />
                  <TextInput
                    style={styles.searchInput}
                    value={sacolaBusca}
                    onChangeText={handleSacolaSearchChange}
                    placeholder="Buscar produto..."
                    placeholderTextColor={colors.muted}
                    autoCorrect={false}
                    editable={!sacolaSaving}
                    onFocus={() => setSacolaInputFocused(true)}
                    onBlur={() =>
                      setTimeout(() => setSacolaInputFocused(false), 200)
                    }
                  />
                  {sacolaBusca ? (
                    <TouchableOpacity
                      onPress={() => {
                        setSacolaBusca('');
                        setSacolaProdutoSelecionado(null);
                      }}
                      hitSlop={8}
                    >
                      <Ionicons name="close-circle" size={20} color={colors.muted} />
                    </TouchableOpacity>
                  ) : null}
                </View>

                {sacolaProdutosFiltrados.length > 0 ? (
                  <View style={styles.sacolaDropdown}>
                    {sacolaProdutosFiltrados.map((p) => (
                      <TouchableOpacity
                        key={p.id}
                        style={styles.sacolaDropdownItem}
                        onPress={() => handleSacolaPickProduto(p)}
                      >
                        <Text style={styles.sacolaDropdownText}>{p.nome}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}

                <Text style={styles.sacolaSectionLabel}>Quantidade da sobra</Text>
                <TextInput
                  style={styles.input}
                  value={sacolaQtd}
                  onChangeText={setSacolaQtd}
                  placeholder="Ex: 3"
                  placeholderTextColor={colors.muted}
                  keyboardType="decimal-pad"
                  editable={!sacolaSaving}
                />

                <TouchableOpacity
                  style={[styles.addSacolaBtn, sacolaSaving && styles.buttonDisabled]}
                  onPress={handleAddSacolaItem}
                  disabled={sacolaSaving}
                >
                  <Ionicons name="add" size={18} color={colors.surface} />
                  <Text style={styles.addSacolaBtnText}>Adicionar</Text>
                </TouchableOpacity>

                <Text style={styles.sacolaSectionLabel}>Valores da venda</Text>
                <Text style={styles.sacolaSectionLabel}>💰 Valor cheio — quanto valeria sem desconto (R$)</Text>
                <TextInput
                  style={styles.input}
                  value={sacolaValorCheio}
                  onChangeText={setSacolaValorCheio}
                  placeholder="Ex: 50,00"
                  placeholderTextColor={colors.muted}
                  keyboardType="decimal-pad"
                  editable={!sacolaSaving}
                />
                <Text style={styles.sacolaSectionLabel}>✅ Valor recebido — quanto o cliente pagou (R$)</Text>
                <TextInput
                  style={styles.input}
                  value={sacolaValorRecebido}
                  onChangeText={setSacolaValorRecebido}
                  placeholder="Ex: 25,00"
                  placeholderTextColor={colors.muted}
                  keyboardType="decimal-pad"
                  editable={!sacolaSaving}
                />

                {sacolaError ? <Text style={styles.error}>{sacolaError}</Text> : null}

                <TouchableOpacity
                  style={[styles.confirmSacolaBtn, sacolaSaving && styles.buttonDisabled]}
                  onPress={handleConfirmarSacola}
                  disabled={sacolaSaving}
                >
                  {sacolaSaving ? (
                    <ActivityIndicator color={colors.surface} />
                  ) : (
                    <Text style={styles.confirmSacolaBtnText}>Confirmar sacola</Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : null}
          </View>

          {/* Planejar produção de amanhã */}
          <View style={styles.sacolaCard}>
            <TouchableOpacity
              style={styles.sacolaHeaderTitleWrap}
              onPress={() => setPlanejVisible((v) => !v)}
              activeOpacity={0.8}
            >
              <View style={styles.sacolaHeaderRow}>
                <Text style={styles.sacolaHeaderTitle}>
                  🔴 Planejar produção de amanhã
                  {planejList.length > 0 ? (
                    <Text style={styles.sacolaHeaderCount}>
                      {' '}({planejList.length})
                    </Text>
                  ) : null}
                </Text>
                <Ionicons
                  name={planejVisible ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  color={colors.muted}
                />
              </View>
            </TouchableOpacity>

            {planejVisible ? (
              <View style={styles.sacolaBody}>
                {planejList.length === 0 ? (
                  <Text style={styles.sacolaEmpty}>
                    📋 Adicione produtos abaixo para planejar a produção de amanhã
                  </Text>
                ) : (
                  planejList.map((item) => (
                    <View key={item.produto_id} style={styles.sacolaItem}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.sacolaItemNome}>{item.produto_nome}</Text>
                        <Text style={styles.sacolaItemMeta}>
                          {formatarQuantidade(item.quantidade)} {item.unidade}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.lancAction}
                        onPress={() => handleRemovePlanejItem(item.produto_id)}
                        hitSlop={8}
                      >
                        <Ionicons name="trash-outline" size={20} color={colors.accent} />
                      </TouchableOpacity>
                    </View>
                  ))
                )}

                <Text style={styles.sacolaSectionLabel}>Adicionar produto</Text>
                <View style={styles.searchRow}>
                  <Ionicons name="search" size={20} color={ACOES_MUTED} style={styles.searchIcon} />
                  <TextInput
                    style={styles.searchInput}
                    value={planejBusca}
                    onChangeText={handlePlanejBuscaChange}
                    placeholder="Buscar produto..."
                    placeholderTextColor={ACOES_MUTED}
                    autoCorrect={false}
                    editable={!planejSaving}
                    onFocus={() => setPlanejInputFocused(true)}
                    onBlur={() =>
                      setTimeout(() => setPlanejInputFocused(false), 200)
                    }
                  />
                  {planejBusca ? (
                    <TouchableOpacity
                      onPress={() => {
                        setPlanejBusca('');
                        setPlanejProduto(null);
                      }}
                      hitSlop={8}
                    >
                      <Ionicons name="close-circle" size={20} color={ACOES_MUTED} />
                    </TouchableOpacity>
                  ) : null}
                </View>

                {planejProdutosFiltrados.length > 0 ? (
                  <View style={styles.sacolaDropdown}>
                    {planejProdutosFiltrados.map((p) => (
                      <TouchableOpacity
                        key={p.id}
                        style={styles.sacolaDropdownItem}
                        onPress={() => handlePlanejPickProduto(p)}
                      >
                        <Text style={styles.sacolaDropdownText}>{p.nome}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}

                <Text style={styles.formLabel}>Quantidade</Text>
                <TextInput
                  style={styles.formInput}
                  value={planejQtd}
                  onChangeText={setPlanejQtd}
                  placeholder="0"
                  placeholderTextColor={ACOES_MUTED}
                  keyboardType="decimal-pad"
                  editable={!planejSaving}
                />

                <TouchableOpacity
                  style={[styles.addSacolaBtn, planejSaving && styles.buttonDisabled]}
                  onPress={handleAddPlanejItem}
                  disabled={planejSaving}
                >
                  <Ionicons name="add" size={18} color="#fdfaf4" />
                  <Text style={styles.addSacolaBtnText}>Adicionar</Text>
                </TouchableOpacity>

                {planejError ? <Text style={styles.error}>{planejError}</Text> : null}

                <TouchableOpacity
                  style={[styles.confirmSacolaBtn, planejSaving && styles.buttonDisabled]}
                  onPress={handleSalvarPlanejamento}
                  disabled={planejSaving}
                >
                  {planejSaving ? (
                    <ActivityIndicator color="#fdfaf4" />
                  ) : (
                    <Text style={styles.confirmSacolaBtnText}>Salvar planejamento</Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : null}
          </View>

          {planejHistorico.length > 0 ? (
            <View style={styles.planejHistCard}>
              <Text style={styles.planejHistTitle}>
                📋 Planejamento salvo para amanhã{' '}
                <Text style={styles.planejHistCount}>
                  ({planejHistorico.length})
                </Text>
              </Text>
              {(planejHistExpanded
                ? planejHistorico
                : planejHistorico.slice(0, 4)
              ).map((item) => (
                <View key={item.id} style={styles.planejHistRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.planejHistNome}>
                      {item.produtos?.nome || 'Produto'}
                    </Text>
                    <Text style={styles.planejHistMeta}>
                      {formatarQuantidade(item.quantidade)}{' '}
                      {item.produtos?.unidade || ''}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.lancAction}
                    onPress={() => handleRemovePlanejHistorico(item)}
                    hitSlop={8}
                  >
                    <Ionicons name="trash-outline" size={20} color={colors.accent} />
                  </TouchableOpacity>
                </View>
              ))}
              {planejHistorico.length > 4 ? (
                <TouchableOpacity
                  style={styles.verTodosBtn}
                  onPress={() => setPlanejHistExpanded((v) => !v)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.verTodosText}>
                    {planejHistExpanded
                      ? 'Recolher ▲'
                      : `Ver todos ${planejHistorico.length} itens ▼`}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          <View style={styles.hojeSection}>
            <View style={styles.hojeHeader}>
              <Text style={styles.hojeTitle}>
                Lançamentos de hoje{' '}
                <Text style={styles.hojeCount}>({lancamentosHoje.length})</Text>
              </Text>
              {loadingLancamentos ? (
                <ActivityIndicator color={colors.accent} size="small" />
              ) : null}
            </View>

            {lancamentosHoje.length === 0 && !loadingLancamentos ? (
              <View style={styles.hojeEmpty}>
                <Text style={styles.hojeEmptyEmoji}>📋</Text>
                <Text style={styles.hojeEmptyText}>Nenhum lançamento hoje</Text>
              </View>
            ) : (
              <>
                {(lancListExpanded
                  ? lancamentosNormais
                  : lancamentosNormais.slice(0, 5)
                ).map((l) => (
                  <LancRow
                    key={l.id}
                    lanc={l}
                    onEdit={() => openEdit(l)}
                    onDelete={() => handleDelete(l)}
                  />
                ))}

                {lancamentosNormais.length > 5 ? (
                  <TouchableOpacity
                    style={styles.verTodosBtn}
                    onPress={() => setLancListExpanded((v) => !v)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.verTodosText}>
                      {lancListExpanded
                        ? 'Recolher ▲'
                        : `Ver todos ${lancamentosNormais.length} lançamentos ▼`}
                    </Text>
                  </TouchableOpacity>
                ) : null}

                {lancamentosVenda.length > 0 ? (
                  <View style={styles.vendaGroup}>
                    <TouchableOpacity
                      style={styles.vendaGroupHeader}
                      onPress={() => setVendaGroupExpanded((v) => !v)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.vendaGroupTitle}>
                        💰 Venda Resgatada ({lancamentosVenda.length})
                      </Text>
                      <View style={styles.vendaGroupRight}>
                        <Text style={styles.vendaGroupTotal}>
                          {formatBRL(totalRecuperado)}
                        </Text>
                        <Ionicons
                          name={vendaGroupExpanded ? 'chevron-up' : 'chevron-down'}
                          size={18}
                          color={DESTINO_BLUE}
                          style={{ marginLeft: 8 }}
                        />
                      </View>
                    </TouchableOpacity>
                    {vendaGroupExpanded
                      ? lancamentosVenda.map((l) => (
                          <LancRow
                            key={l.id}
                            lanc={l}
                            onEdit={() => openEdit(l)}
                            onDelete={() => handleDelete(l)}
                          />
                        ))
                      : null}
                  </View>
                ) : null}
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={!!editingLanc}
        transparent
        animationType="slide"
        onRequestClose={closeEdit}
      >
        <View style={styles.modalBackdrop}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ width: '100%' }}
          >
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Editar lançamento</Text>
                <TouchableOpacity onPress={closeEdit} hitSlop={8}>
                  <Ionicons name="close" size={24} color={colors.text} />
                </TouchableOpacity>
              </View>

              <ScrollView keyboardShouldPersistTaps="handled">
                {editingLanc ? (
                  <>
                    <Text style={styles.modalProduto}>{editingLanc.produto_nome}</Text>
                    <Text style={styles.modalSubmeta}>
                      {formatarQuantidade(editingLanc.quantidade)} {editingLanc.unidade}
                    </Text>

                    <Text style={styles.label}>Destino</Text>
                    <View style={styles.pillsWrap}>
                      {DESTINOS.map((d) => {
                        const active = d.id === editDestino;
                        return (
                          <TouchableOpacity
                            key={d.id}
                            style={[styles.pillLarge, active && styles.pillActive]}
                            onPress={() => setEditDestino(d.id)}
                            disabled={editSaving}
                          >
                            <Text style={[styles.pillText, active && styles.pillTextActive]}>
                              {d.emoji} {d.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {editDestino === 'Venda Resgatada' ? (
                      <View style={styles.vendaBox}>
                        <Text style={styles.label}>Valor cheio (R$)</Text>
                        <TextInput
                          style={styles.input}
                          value={editValorCheio}
                          onChangeText={setEditValorCheio}
                          placeholder="0,00"
                          placeholderTextColor={colors.muted}
                          keyboardType="decimal-pad"
                          editable={!editSaving}
                        />
                        <Text style={styles.label}>Valor recebido (R$)</Text>
                        <TextInput
                          style={styles.input}
                          value={editValorRecebido}
                          onChangeText={setEditValorRecebido}
                          placeholder="0,00"
                          placeholderTextColor={colors.muted}
                          keyboardType="decimal-pad"
                          editable={!editSaving}
                        />
                      </View>
                    ) : null}

                    {editError ? <Text style={styles.error}>{editError}</Text> : null}

                    <View style={styles.modalActions}>
                      <TouchableOpacity
                        style={[styles.modalCancelBtn, editSaving && styles.buttonDisabled]}
                        onPress={closeEdit}
                        disabled={editSaving}
                      >
                        <Text style={styles.modalCancelText}>Cancelar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.modalSaveBtn, editSaving && styles.buttonDisabled]}
                        onPress={handleEditSave}
                        disabled={editSaving}
                      >
                        {editSaving ? (
                          <ActivityIndicator color={colors.surface} />
                        ) : (
                          <Text style={styles.modalSaveText}>Salvar</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </>
                ) : null}
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {toast ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.toast,
            {
              opacity: toastAnim,
              transform: [
                {
                  translateY: toastAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-20, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <Ionicons name="checkmark-circle" size={20} color={colors.surface} />
          <Text style={styles.toastText}>{toast}</Text>
        </Animated.View>
      ) : null}
    </SafeAreaView>
  );
}

function LancRow({ lanc, onEdit, onDelete }) {
  const destinoColor = getDestinoColor(lanc.destino);
  return (
    <View style={styles.lancRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.lancNome}>{lanc.produto_nome}</Text>
        <View style={styles.lancMetaRow}>
          <Text style={styles.lancQtd}>
            {formatarQuantidade(lanc.quantidade)} {lanc.unidade}
          </Text>
          <Text style={styles.lancSep}>·</Text>
          <Text style={[styles.lancDestino, { color: destinoColor }]}>
            {lanc.destino}
          </Text>
          <Text style={styles.lancSep}>·</Text>
          <Text style={styles.lancHora}>{formatTime(lanc.data)}</Text>
        </View>
        {lanc.destino === 'Venda Resgatada' && lanc.valor_recebido != null ? (
          <Text style={styles.lancRecuperado}>
            Recuperado: {formatBRL(lanc.valor_recebido)}
          </Text>
        ) : null}
      </View>
      <TouchableOpacity style={styles.lancAction} onPress={onEdit} hitSlop={8}>
        <Ionicons name="create-outline" size={20} color={colors.accent} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.lancAction} onPress={onDelete} hitSlop={8}>
        <Ionicons name="trash-outline" size={20} color={colors.accent} />
      </TouchableOpacity>
    </View>
  );
}

const ACOES_BG = colors.surface;
const ACOES_TEXT = colors.text;
const ACOES_MUTED = colors.muted;
const ACOES_BORDER = colors.border;
const ACOES_INPUT_BG = colors.bg;

const DESTINO_PALETTE = {
  Lixo: { bg: '#2a1a14', border: '#e05c2a' },
  'Doação': { bg: '#142214', border: '#2d7a4f' },
  'Transformação': { bg: '#2a2200', border: '#f5c842' },
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: 20, paddingBottom: 40 },

  resumoWrap: { marginBottom: 14 },
  resumoCard: {
    borderRadius: 14,
    padding: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2f2a22',
  },
  resumoGlow: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 220,
    height: 160,
  },
  resumoTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  resumoLabel: {
    color: colors.gold,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  hojeBtn: {
    backgroundColor: '#444',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  hojeBtnText: { color: '#fdfaf4', fontSize: 12, fontWeight: '600' },
  resumoTitle: {
    color: '#fdfaf4',
    fontSize: 22,
    fontWeight: '700',
    marginTop: 10,
  },
  resumoSub: {
    color: '#bdb5a4',
    fontSize: 13,
    marginTop: 6,
    lineHeight: 18,
  },

  stepsRow: { gap: 8, paddingBottom: 4, paddingRight: 10, marginBottom: 14 },
  stepCard: {
    backgroundColor: colors.surfaceCard,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: ACOES_BORDER,
    minWidth: 110,
  },
  stepCardActive: { borderColor: colors.accent, borderWidth: 1.5 },
  stepNum: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  stepLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
  },

  formCard: {
    backgroundColor: ACOES_BG,
    borderRadius: 16,
    padding: 20,
    marginBottom: 18,
  },
  formCardTitle: {
    color: ACOES_TEXT,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  formLabel: {
    fontSize: 11,
    color: ACOES_MUTED,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: 14,
    marginBottom: 6,
  },
  labelOpcional: {
    color: colors.gold,
    textTransform: 'lowercase',
    letterSpacing: 0,
    fontSize: 10,
    fontWeight: '700',
  },
  formInput: {
    backgroundColor: ACOES_INPUT_BG,
    color: ACOES_TEXT,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: ACOES_BORDER,
  },
  inputError: {
    borderColor: colors.danger,
    borderWidth: 1.5,
  },
  destinosRowError: {
    borderWidth: 1.5,
    borderColor: colors.danger,
    borderRadius: 12,
    padding: 6,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(194,66,42,0.12)',
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 10,
    padding: 12,
    marginTop: 16,
  },
  errorBannerText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
    flex: 1,
  },
  formLabelInline: {
    fontSize: 11,
    color: ACOES_MUTED,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  equivaleLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 6,
  },
  equivaleInputWrap: {
    position: 'relative',
    justifyContent: 'center',
  },
  equivaleInput: {
    paddingRight: 56,
  },
  equivaleBadge: {
    position: 'absolute',
    right: 8,
    top: 8,
    bottom: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: ACOES_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  equivaleBadgeText: {
    color: ACOES_TEXT,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  destinosRow: {
    flexDirection: 'row',
    gap: 8,
  },
  destinoPill: {
    flex: 1,
    backgroundColor: ACOES_INPUT_BG,
    borderWidth: 1,
    borderColor: ACOES_BORDER,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  destinoEmoji: { fontSize: 22, marginBottom: 4 },
  destinoLabel: {
    color: ACOES_TEXT,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
    textAlign: 'center',
  },

  vendaResgatadaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ACOES_INPUT_BG,
    borderWidth: 1,
    borderColor: ACOES_BORDER,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 10,
  },
  vendaResgatadaBtnActive: {
    backgroundColor: '#e7efff',
    borderColor: colors.blue,
  },
  vendaResgatadaEmoji: { fontSize: 20, marginRight: 8 },
  vendaResgatadaText: {
    color: ACOES_TEXT,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  vendaResgatadaTextActive: { color: colors.blue },

  unidadePill: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: ACOES_BORDER,
    backgroundColor: ACOES_INPUT_BG,
    marginRight: 8,
    marginBottom: 8,
  },
  unidadePillActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  unidadePillText: { color: ACOES_TEXT, fontSize: 14, fontWeight: '600' },
  unidadePillTextActive: { color: '#fdfaf4' },

  helpBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: ACOES_MUTED,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  helpBtnText: {
    color: ACOES_MUTED,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 16,
  },
  sacolaHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  sacolaHeaderTitleWrap: { flex: 1 },
  sacolaChevron: { marginLeft: 8 },

  planejHistCard: {
    marginTop: 14,
    backgroundColor: ACOES_BG,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: ACOES_BORDER,
    padding: 16,
  },
  planejHistTitle: {
    color: ACOES_TEXT,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 10,
  },
  planejHistCount: { color: colors.accent, fontWeight: '700' },
  planejHistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: ACOES_BORDER,
  },
  planejHistNome: { color: ACOES_TEXT, fontSize: 14, fontWeight: '700' },
  planejHistMeta: { color: ACOES_MUTED, fontSize: 12, marginTop: 2 },

  vencimentoBanner: {
    backgroundColor: colors.surfaceCard,
    borderWidth: 1.5,
    borderColor: colors.gold,
    borderRadius: 12,
    padding: 14,
    marginBottom: 18,
  },
  vencimentoTitle: {
    color: colors.gold,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  vencimentoItem: {
    marginTop: 6,
  },
  vencimentoNome: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  vencimentoMeta: {
    color: colors.gold,
    fontSize: 12,
    marginTop: 2,
    opacity: 0.9,
  },

  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    fontFamily: SERIF,
    marginBottom: 12,
  },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: ACOES_INPUT_BG,
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: ACOES_BORDER,
  },
  searchIcon: { marginRight: 8 },
  searchInput: {
    flex: 1,
    color: ACOES_TEXT,
    paddingVertical: 12,
    fontSize: 15,
  },

  list: { marginTop: 16 },
  produtoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: ACOES_INPUT_BG,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: ACOES_BORDER,
  },
  produtoNome: { color: ACOES_TEXT, fontSize: 15, flex: 1, marginRight: 8 },

  empty: { color: ACOES_MUTED, marginTop: 24, textAlign: 'center' },

  selectedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: ACOES_INPUT_BG,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.accent,
    marginBottom: 6,
  },
  selectedLabel: {
    color: ACOES_MUTED,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  selectedNome: {
    color: colors.accent,
    fontSize: 20,
    fontWeight: '700',
    fontFamily: SERIF,
  },
  trocarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  trocarText: { color: colors.accent, marginLeft: 4, fontWeight: '600' },
  trocarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  limparBtn: {
    padding: 4,
  },

  label: {
    color: colors.text,
    fontSize: 14,
    marginTop: 16,
    marginBottom: 8,
    opacity: 0.85,
  },
  input: {
    backgroundColor: colors.surface,
    color: colors.text,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  helperText: {
    color: ACOES_MUTED,
    fontSize: 12,
    marginTop: 6,
    fontStyle: 'italic',
  },

  pillsRow: { flexDirection: 'row', flexWrap: 'wrap' },
  pillsWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  pill: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginRight: 8,
    marginBottom: 8,
  },
  pillLarge: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginRight: 8,
    marginBottom: 8,
  },
  pillActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  pillText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  pillTextActive: { color: colors.surface },

  vendaBox: {
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },

  error: {
    color: colors.danger,
    marginTop: 16,
    textAlign: 'center',
  },

  saveButton: {
    backgroundColor: colors.accent,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 18,
  },
  saveButtonText: {
    color: '#fdfaf4',
    fontSize: 15,
    fontWeight: '700',
  },
  buttonDisabled: { opacity: 0.6 },

  toast: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 30,
    left: 20,
    right: 20,
    backgroundColor: colors.green,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 6,
  },
  toastText: {
    color: colors.surface,
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
    flex: 1,
  },

  hojeSection: { marginTop: 28 },
  hojeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  hojeTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    fontFamily: SERIF,
  },
  hojeCount: { color: colors.muted, fontWeight: '600' },

  hojeEmpty: {
    alignItems: 'center',
    paddingVertical: 32,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hojeEmptyEmoji: { fontSize: 36, marginBottom: 6 },
  hojeEmptyText: { color: colors.muted, fontSize: 14 },

  lancRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 8,
  },
  lancNome: { color: colors.text, fontSize: 15, fontWeight: '700' },
  lancMetaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, flexWrap: 'wrap' },
  lancQtd: { color: colors.muted, fontSize: 13 },
  lancSep: { color: colors.muted, fontSize: 13, marginHorizontal: 6 },
  lancDestino: { fontSize: 13, fontWeight: '600' },
  lancHora: { color: colors.muted, fontSize: 13 },
  lancRecuperado: { color: colors.green, fontSize: 12, marginTop: 4 },
  lancAction: { padding: 6, marginLeft: 4 },

  vendaGroup: {
    marginTop: 8,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: DESTINO_BLUE,
    padding: 10,
  },
  vendaGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  vendaGroupTitle: { color: DESTINO_BLUE, fontWeight: '700', fontSize: 14, flex: 1 },
  vendaGroupTotal: { color: colors.green, fontWeight: '700', fontSize: 14 },
  vendaGroupRight: { flexDirection: 'row', alignItems: 'center' },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
    fontFamily: SERIF,
  },
  modalProduto: {
    color: colors.accent,
    fontSize: 22,
    fontWeight: '700',
    fontFamily: SERIF,
    marginBottom: 4,
  },
  modalSubmeta: { color: colors.muted, fontSize: 13, marginBottom: 8 },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 20,
  },
  modalCancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 10,
    minWidth: 100,
    alignItems: 'center',
  },
  modalCancelText: { color: colors.text, fontWeight: '600' },
  modalSaveBtn: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 8,
    backgroundColor: colors.accent,
    minWidth: 100,
    alignItems: 'center',
  },
  modalSaveText: { color: colors.surface, fontWeight: '700' },

  sacolaCard: {
    marginTop: 14,
    backgroundColor: ACOES_BG,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: ACOES_BORDER,
    overflow: 'hidden',
  },
  sacolaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  sacolaHeaderTitle: {
    color: ACOES_TEXT,
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  sacolaHeaderCount: { color: colors.accent, fontWeight: '700' },
  sacolaBody: {
    padding: 16,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: ACOES_BORDER,
  },
  sacolaEmpty: {
    color: ACOES_MUTED,
    textAlign: 'center',
    paddingVertical: 16,
    fontSize: 14,
  },
  sacolaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: ACOES_BORDER,
  },
  sacolaItemNome: { color: ACOES_TEXT, fontSize: 15, fontWeight: '700' },
  sacolaItemMeta: { color: ACOES_MUTED, fontSize: 13, marginTop: 2 },

  verTodosBtn: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  verTodosText: { color: colors.accent, fontWeight: '600' },

  sacolaSectionLabel: {
    color: ACOES_MUTED,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 18,
    marginBottom: 8,
  },

  sacolaDropdown: {
    marginTop: 8,
    backgroundColor: ACOES_INPUT_BG,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ACOES_BORDER,
    overflow: 'hidden',
  },
  sacolaDropdownItem: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: ACOES_BORDER,
  },
  sacolaDropdownText: { color: ACOES_TEXT, fontSize: 15 },

  addSacolaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 12,
  },
  addSacolaBtnText: {
    color: colors.text,
    fontWeight: '700',
    marginLeft: 6,
  },

  confirmSacolaBtn: {
    backgroundColor: colors.accent,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  confirmSacolaBtnText: {
    color: '#fdfaf4',
    fontSize: 15,
    fontWeight: '700',
  },
});
