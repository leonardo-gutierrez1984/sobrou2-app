import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker from '@react-native-community/datetimepicker';
import AppHeader from '../components/AppHeader';
import { supabase } from '../services/supabase';
import { colors } from '../theme/colors';
import {
  DESTINOS,
  getDestinoColor,
  formatBRL,
  getRangeForDate,
} from '../utils/lancamentos';

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function fmtDateBR(d) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function fmtDDMM(d) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

export default function InicioScreen() {
  const navigation = useNavigation();

  const [userId, setUserId] = useState(null);
  const [empresaId, setEmpresaId] = useState(null);

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [lancamentos, setLancamentos] = useState([]);
  const [loadingLancs, setLoadingLancs] = useState(false);
  const [membrosMap, setMembrosMap] = useState({});

  const [bootError, setBootError] = useState('');
  const [bootLoading, setBootLoading] = useState(true);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [tempDate, setTempDate] = useState(new Date());
  const [verTodos, setVerTodos] = useState(false);

  const [editingLanc, setEditingLanc] = useState(null);
  const [editDestino, setEditDestino] = useState(null);
  const [editValorCheio, setEditValorCheio] = useState('');
  const [editValorRecebido, setEditValorRecebido] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const [toast, setToast] = useState('');
  const toastAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data: userRes } = await supabase.auth.getUser();
        const user = userRes?.user;
        if (!mounted) return;
        if (!user) {
          setBootError('Sessão inválida.');
          setBootLoading(false);
          return;
        }
        setUserId(user.id);

        const { data: membro, error: membroErr } = await supabase
          .from('membros')
          .select('empresa_id')
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle();
        if (!mounted) return;
        if (membroErr) {
          setBootError(membroErr.message);
          setBootLoading(false);
          return;
        }
        if (!membro?.empresa_id) {
          setBootError('Empresa não encontrada.');
          setBootLoading(false);
          return;
        }
        setEmpresaId(membro.empresa_id);
        setBootLoading(false);
      } catch (err) {
        if (!mounted) return;
        setBootError(err?.message || 'Erro inesperado.');
        setBootLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const loadMembros = useCallback(async (empId) => {
    if (!empId) return;
    const { data, error } = await supabase
      .from('membros')
      .select('user_id, nome, email')
      .eq('empresa_id', empId);
    if (error) {
      console.error('[Inicio] loadMembros error:', error);
      return;
    }
    const map = {};
    (data || []).forEach((m) => {
      map[m.user_id] = m.nome?.trim() || (m.email?.split('@')[0] ?? '');
    });
    setMembrosMap(map);
  }, []);

  const loadLancamentos = useCallback(
    async (empId, date) => {
      if (!empId) return;
      setLoadingLancs(true);
      const { inicio, fim } = getRangeForDate(date);
      const { data, error } = await supabase
        .from('lancamentos_sobras')
        .select('*, produtos(custo_estimado)')
        .eq('empresa_id', empId)
        .gte('data', inicio.toISOString())
        .lte('data', fim.toISOString())
        .order('data', { ascending: false });
      if (error) {
        console.error('[Inicio] loadLancamentos error:', error);
        setLancamentos([]);
      } else {
        setLancamentos(data || []);
      }
      setLoadingLancs(false);
    },
    []
  );

  useFocusEffect(
    useCallback(() => {
      if (!empresaId) return;
      loadMembros(empresaId);
      loadLancamentos(empresaId, selectedDate);
    }, [empresaId, selectedDate, loadMembros, loadLancamentos])
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

  const totals = useMemo(() => {
    const count = lancamentos.length;
    let prejuizo = 0;
    let recuperado = 0;
    for (const l of lancamentos) {
      const qtd = parseFloat(l.quantidade) || 0;
      const custo = parseFloat(l.produtos?.custo_estimado) || 0;
      if (l.destino === 'Venda Resgatada') {
        recuperado += parseFloat(l.valor_recebido) || 0;
      } else {
        prejuizo += qtd * custo;
      }
    }
    return { count, prejuizo, recuperado };
  }, [lancamentos]);

  const lancsVisiveis = useMemo(
    () => (verTodos ? lancamentos : lancamentos.slice(0, 5)),
    [lancamentos, verTodos]
  );

  const openDatePicker = () => {
    setTempDate(selectedDate);
    setShowDatePicker(true);
  };

  const cancelDatePicker = () => {
    setShowDatePicker(false);
  };

  const confirmDatePicker = () => {
    setSelectedDate(tempDate);
    setShowDatePicker(false);
  };

  const handleDateChange = (event, date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
      if (event?.type === 'set' && date) {
        setSelectedDate(date);
      }
      return;
    }
    if (date) setTempDate(date);
  };

  const isHoje = isSameDay(selectedDate, new Date());

  const goHoje = () => {
    if (!isHoje) setSelectedDate(new Date());
    setVerTodos(false);
  };

  const openEdit = (lanc) => {
    setEditingLanc(lanc);
    setEditDestino(lanc.destino);
    setEditValorCheio(lanc.valor_cheio != null ? String(lanc.valor_cheio) : '');
    setEditValorRecebido(
      lanc.valor_recebido != null ? String(lanc.valor_recebido) : ''
    );
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
    const { error } = await supabase
      .from('lancamentos_sobras')
      .update(payload)
      .eq('id', editingLanc.id);
    setEditSaving(false);
    if (error) {
      setEditError(error.message);
      return;
    }
    closeEdit();
    showToast('Lançamento atualizado!');
    await loadLancamentos(empresaId, selectedDate);
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
            const { error } = await supabase
              .from('lancamentos_sobras')
              .delete()
              .eq('id', lanc.id);
            if (error) {
              Alert.alert('Erro', error.message);
              return;
            }
            showToast('Lançamento excluído.');
            await loadLancamentos(empresaId, selectedDate);
          },
        },
      ]
    );
  };

  if (bootLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <AppHeader />
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }
  if (bootError) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <AppHeader />
        <Text style={styles.error}>{bootError}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <AppHeader />
      <ScrollView contentContainerStyle={styles.container}>
        {/* Banner */}
        <View style={styles.banner}>
          <Text style={styles.bannerTitle}>Gestão inteligente de perdas</Text>
          <Text style={styles.bannerSub}>
            Cada sobra registrada vira aprendizado para amanhã.
          </Text>
        </View>

        {/* Card Resumo do dia */}
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
              <Text style={styles.resumoLabel}>VISÃO RÁPIDA</Text>
              <TouchableOpacity
                style={[styles.hojeBtn, isHoje && styles.hojeBtnActive]}
                onPress={goHoje}
                activeOpacity={0.8}
              >
                <Text style={styles.hojeBtnText}>Hoje</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.resumoTitle}>Resumo do dia</Text>
            <Text style={styles.resumoSub}>
              Acompanhe os lançamentos recentes e o impacto financeiro da
              jornada.
            </Text>
          </LinearGradient>
        </View>

        {/* Ações rápidas */}
        <View style={styles.acoesCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <Ionicons name="flash" size={16} color={colors.accent} style={{ marginRight: 6 }} />
            <Text style={styles.acoesTitle}>Ações rápidas</Text>
          </View>
          <View style={styles.acoesRow}>
            <TouchableOpacity
              style={styles.acaoPrimary}
              onPress={() => navigation.navigate('Lancamento')}
              activeOpacity={0.85}
            >
              <Text style={styles.acaoPrimaryText}>+ Lançar sobra</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.acaoSecondary}
              onPress={() => navigation.navigate('Painel')}
              activeOpacity={0.85}
            >
              <Text style={styles.acaoSecondaryText}>Ver análises</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Stats do dia */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>SOBRAS HOJE</Text>
            <Text style={styles.statValue}>{totals.count}</Text>
            <Text style={styles.statSub}>lançamentos</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>PREJUÍZO EST.</Text>
            <Text style={[styles.statValue, { color: colors.accent }]}>
              {formatBRL(totals.prejuizo)}
            </Text>
            <Text style={styles.statSub}>{isHoje ? 'hoje' : fmtDateBR(selectedDate)}</Text>
          </View>
        </View>
        <View style={styles.statCardLarge}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
            <Ionicons name="cash-outline" size={12} color={colors.muted} style={{ marginRight: 4 }} />
            <Text style={styles.statLabel}>VALOR RECUPERADO HOJE</Text>
          </View>
          <Text style={[styles.statValueLarge, { color: colors.gold }]}>
            {formatBRL(totals.recuperado)}
          </Text>
          <Text style={styles.statSub}>vendas resgatadas</Text>
        </View>

        {/* Lançamentos */}
        <View style={styles.lancHeaderRow}>
          <View style={[styles.lancHeaderTitle, { flexDirection: 'row', alignItems: 'center' }]}>
            <Ionicons name="list" size={16} color={colors.accent} style={{ marginRight: 6 }} />
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>Lançamentos</Text>
          </View>
          <View style={styles.lancHeaderActions}>
            {!isHoje ? (
              <>
                <Text style={styles.lancHeaderDateLabel}>
                  {fmtDDMM(selectedDate)}
                </Text>
                <TouchableOpacity
                  style={styles.hojePillBtn}
                  onPress={goHoje}
                  activeOpacity={0.7}
                >
                  <Text style={styles.hojePillText}>Hoje</Text>
                </TouchableOpacity>
              </>
            ) : null}
            <TouchableOpacity
              onPress={openDatePicker}
              hitSlop={10}
              style={styles.lupaIconBtn}
            >
              <Ionicons name="search" size={18} color={colors.muted} />
            </TouchableOpacity>
          </View>
        </View>

        {loadingLancs ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 20 }} />
        ) : lancamentos.length === 0 ? (
          <View style={styles.lancEmpty}>
            <Text style={styles.lancEmptyEmoji}>📋</Text>
            <Text style={styles.lancEmptyText}>Nenhum lançamento</Text>
          </View>
        ) : (
          <View style={styles.tableCard}>
            <View style={styles.tableHeader}>
              <Text style={[styles.th, styles.colProduto]}>PRODUTO</Text>
              <Text style={[styles.th, styles.colSobra]}>SOBRA</Text>
              <Text style={[styles.th, styles.colDestino]}>DESTINO</Text>
              <Text style={[styles.th, styles.colAcoes]}></Text>
            </View>
            {lancsVisiveis.map((l) => {
              const dColor = getDestinoColor(l.destino);
              const autorNome =
                membrosMap[l.user_id] || '';
              return (
                <View key={l.id} style={styles.tr}>
                  <View style={styles.colProduto}>
                    <Text style={styles.tdProduto} numberOfLines={1}>
                      {l.produto_nome}
                    </Text>
                    {autorNome ? (
                      <Text style={styles.tdAutor} numberOfLines={1}>
                        por {autorNome}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={[styles.td, styles.colSobra]}>
                    {String(l.quantidade).replace('.', ',')} {l.unidade}
                  </Text>
                  <View style={styles.colDestino}>
                    <View
                      style={[
                        styles.destinoTag,
                        { backgroundColor: dColor + '22', borderColor: dColor },
                      ]}
                    >
                      <Text
                        style={[styles.destinoTagText, { color: dColor }]}
                        numberOfLines={1}
                      >
                        {l.destino}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.colAcoes, styles.acoesCell]}>
                    <TouchableOpacity
                      onPress={() => openEdit(l)}
                      hitSlop={8}
                      style={styles.iconBtn}
                    >
                      <Ionicons name="create-outline" size={18} color={colors.accent} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDelete(l)}
                      hitSlop={8}
                      style={styles.iconBtn}
                    >
                      <Ionicons name="trash-outline" size={18} color={colors.danger} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}

            {lancamentos.length > 5 ? (
              <TouchableOpacity
                style={styles.verTodosBtn}
                onPress={() => setVerTodos((v) => !v)}
                activeOpacity={0.7}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={styles.verTodosText}>
                    {verTodos ? 'Mostrar menos' : `Ver todos ${lancamentos.length} lançamentos`}
                  </Text>
                  <Ionicons
                    name={verTodos ? 'chevron-up' : 'chevron-down'}
                    size={14}
                    color={colors.accent}
                  />
                </View>
              </TouchableOpacity>
            ) : null}
          </View>
        )}
      </ScrollView>

      {Platform.OS === 'android' && showDatePicker ? (
        <DateTimePicker
          value={selectedDate}
          mode="date"
          display="default"
          maximumDate={new Date()}
          onChange={handleDateChange}
        />
      ) : null}

      {Platform.OS === 'ios' ? (
        <Modal
          visible={showDatePicker}
          transparent
          animationType="fade"
          onRequestClose={cancelDatePicker}
        >
          <View style={styles.dateModalBackdrop}>
            <View style={styles.dateModalCard}>
              <Text style={styles.dateModalTitle}>Selecionar data</Text>
              <DateTimePicker
                value={tempDate}
                mode="date"
                display="spinner"
                maximumDate={new Date()}
                onChange={handleDateChange}
                textColor="#fdfaf4"
                themeVariant="dark"
              />
              <TouchableOpacity
                style={styles.dateModalConfirm}
                onPress={confirmDatePicker}
                activeOpacity={0.85}
              >
                <Text style={styles.dateModalConfirmText}>Confirmar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.dateModalCancel}
                onPress={cancelDatePicker}
                activeOpacity={0.7}
              >
                <Text style={styles.dateModalCancelText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      ) : null}

      {/* Modal de edição */}
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
                      {String(editingLanc.quantidade).replace('.', ',')}{' '}
                      {editingLanc.unidade}
                    </Text>

                    <Text style={styles.modalLabel}>Destino</Text>
                    <View style={styles.pillsWrap}>
                      {DESTINOS.map((d) => {
                        const active = d.id === editDestino;
                        return (
                          <TouchableOpacity
                            key={d.id}
                            style={[styles.pill, active && styles.pillActive]}
                            onPress={() => setEditDestino(d.id)}
                            disabled={editSaving}
                          >
                            <Text
                              style={[styles.pillText, active && styles.pillTextActive]}
                            >
                              {d.emoji} {d.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {editDestino === 'Venda Resgatada' ? (
                      <>
                        <Text style={styles.modalLabel}>Valor cheio (R$)</Text>
                        <TextInput
                          style={styles.input}
                          value={editValorCheio}
                          onChangeText={setEditValorCheio}
                          placeholder="0,00"
                          placeholderTextColor={colors.muted}
                          keyboardType="decimal-pad"
                          editable={!editSaving}
                        />
                        <Text style={styles.modalLabel}>Valor recebido (R$)</Text>
                        <TextInput
                          style={styles.input}
                          value={editValorRecebido}
                          onChangeText={setEditValorRecebido}
                          placeholder="0,00"
                          placeholderTextColor={colors.muted}
                          keyboardType="decimal-pad"
                          editable={!editSaving}
                        />
                      </>
                    ) : null}

                    {editError ? (
                      <Text style={styles.error}>{editError}</Text>
                    ) : null}

                    <View style={styles.modalActions}>
                      <TouchableOpacity
                        style={[
                          styles.modalCancelBtn,
                          editSaving && styles.btnDisabled,
                        ]}
                        onPress={closeEdit}
                        disabled={editSaving}
                      >
                        <Text style={styles.modalCancelText}>Cancelar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.modalSaveBtn,
                          editSaving && styles.btnDisabled,
                        ]}
                        onPress={handleEditSave}
                        disabled={editSaving}
                      >
                        {editSaving ? (
                          <ActivityIndicator color={colors.text} />
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
          <Ionicons name="checkmark-circle" size={20} color={colors.text} />
          <Text style={styles.toastText}>{toast}</Text>
        </Animated.View>
      ) : null}
    </SafeAreaView>
  );
}

const ACOES_BG = '#fdfaf4';
const ACOES_TEXT = '#1c1811';
const ACOES_MUTED = '#8c7f6e';

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: 20, paddingBottom: 40 },

  error: { color: colors.danger, textAlign: 'center', marginTop: 24 },

  banner: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  bannerTitle: { color: '#fdfaf4', fontSize: 15, fontWeight: '700' },
  bannerSub: { color: '#bdb5a4', fontSize: 12, marginTop: 4 },

  resumoWrap: { marginBottom: 16 },
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
  hojeBtnActive: { backgroundColor: '#555' },
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

  acoesCard: {
    backgroundColor: '#2a2a2a',
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 14,
    padding: 18,
    marginBottom: 18,
  },
  acoesTitle: {
    color: '#fdfaf4',
    fontSize: 16,
    fontWeight: '700',
  },
  acoesRow: {
    flexDirection: 'row',
    gap: 10,
  },
  acaoPrimary: {
    flex: 1,
    backgroundColor: colors.accent,
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acaoPrimaryText: { color: '#fdfaf4', fontSize: 15, fontWeight: '700' },
  acaoSecondary: {
    flex: 1,
    borderColor: '#333333',
    borderWidth: 1,
    backgroundColor: 'transparent',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acaoSecondaryText: { color: '#fdfaf4', fontSize: 15, fontWeight: '600' },

  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
  },
  statCardLarge: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
    marginBottom: 18,
  },
  statLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  statValue: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
  },
  statValueLarge: {
    fontSize: 26,
    fontWeight: '700',
  },
  statSub: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 4,
  },

  lancHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    marginBottom: 10,
  },
  lancHeaderTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  lancHeaderSub: { color: colors.muted, fontWeight: '600' },
  lancHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  lancHeaderDateLabel: {
    color: '#8c8c8c',
    fontSize: 12,
    fontWeight: '600',
  },
  hojePillBtn: {
    borderWidth: 1,
    borderColor: '#e05c2a',
    borderRadius: 20,
    paddingVertical: 3,
    paddingHorizontal: 8,
    backgroundColor: 'transparent',
  },
  hojePillText: {
    color: '#e05c2a',
    fontSize: 11,
    fontWeight: '700',
  },
  lupaIconBtn: {
    padding: 4,
  },

  dateModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  dateModalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
  },
  dateModalTitle: {
    color: '#fdfaf4',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  dateModalConfirm: {
    backgroundColor: '#e05c2a',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  dateModalConfirmText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  dateModalCancel: {
    borderWidth: 1,
    borderColor: '#333333',
    backgroundColor: 'transparent',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  dateModalCancelText: {
    color: '#fdfaf4',
    fontSize: 14,
    fontWeight: '600',
  },
  lupaBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },

  lancEmpty: {
    alignItems: 'center',
    paddingVertical: 28,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
  },
  lancEmptyEmoji: { fontSize: 32, marginBottom: 6 },
  lancEmptyText: { color: colors.muted, fontSize: 14 },

  tableCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.surfaceCard,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    alignItems: 'center',
  },
  th: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  tr: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  td: { color: colors.text, fontSize: 13 },
  colProduto: { flex: 2.3, paddingRight: 6 },
  colSobra: { flex: 1.1, paddingRight: 6 },
  colDestino: { flex: 1.6, paddingRight: 6 },
  colAcoes: { flex: 1, alignItems: 'flex-end' },
  acoesCell: { flexDirection: 'row', justifyContent: 'flex-end' },
  iconBtn: { padding: 4, marginLeft: 2 },
  tdProduto: { color: colors.text, fontSize: 13, fontWeight: '600' },
  tdAutor: { color: colors.muted, fontSize: 11, marginTop: 2 },
  destinoTag: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  destinoTagText: { fontSize: 11, fontWeight: '700' },

  verTodosBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: colors.surfaceCard,
  },
  verTodosText: { color: colors.accent, fontWeight: '600', fontSize: 13 },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.surfaceCard,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modalTitle: { color: colors.text, fontSize: 20, fontWeight: '700' },
  modalProduto: {
    color: colors.accent,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  modalSubmeta: { color: colors.muted, fontSize: 13, marginBottom: 8 },
  modalLabel: {
    color: colors.text,
    fontSize: 13,
    marginTop: 14,
    marginBottom: 6,
    opacity: 0.85,
  },
  pillsWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  pill: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginRight: 8,
    marginBottom: 8,
  },
  pillActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  pillText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  pillTextActive: { color: colors.text },
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
  modalSaveText: { color: colors.text, fontWeight: '700' },
  btnDisabled: { opacity: 0.6 },

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
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
    flex: 1,
  },
});
