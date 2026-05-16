import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Animated,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../services/supabase';
import { colors } from '../theme/colors';
import AppHeader from '../components/AppHeader';

const SERIF = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });

const PAPEIS = [
  { id: 'operador', label: 'Operador', emoji: '🔧' },
  { id: 'admin', label: 'Admin', emoji: '👑' },
];

function getDisplayName(m) {
  if (m?.nome && m.nome.trim()) return m.nome.trim();
  const email = m?.email || '';
  const prefix = email.split('@')[0];
  return prefix || 'Sem nome';
}

function papelEmoji(p) {
  return p === 'admin' ? '👑' : '🔧';
}

export default function EquipeScreen() {
  const [userId, setUserId] = useState(null);
  const [empresaId, setEmpresaId] = useState(null);

  const [empresa, setEmpresa] = useState(null);
  const [papelAtual, setPapelAtual] = useState(null);
  const [membros, setMembros] = useState([]);

  const [loading, setLoading] = useState(true);
  const [bootError, setBootError] = useState('');

  const [nomeEmpresaInput, setNomeEmpresaInput] = useState('');
  const [savingEmpresa, setSavingEmpresa] = useState(false);

  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePapel, setInvitePapel] = useState('operador');
  const [papelPickerOpen, setPapelPickerOpen] = useState(false);
  const [inviting, setInviting] = useState(false);

  const [editMembro, setEditMembro] = useState(null);
  const [editMembroNome, setEditMembroNome] = useState('');
  const [editMembroSaving, setEditMembroSaving] = useState(false);

  const [toast, setToast] = useState('');
  const toastAnim = useRef(new Animated.Value(0)).current;

  const isAdmin = papelAtual === 'admin';

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data: userRes } = await supabase.auth.getUser();
        const user = userRes?.user;
        if (!mounted) return;
        if (!user) {
          setBootError('Sessão inválida.');
          setLoading(false);
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
          setLoading(false);
          return;
        }
        if (!membro?.empresa_id) {
          setBootError('Empresa não encontrada para este usuário.');
          setLoading(false);
          return;
        }
        setEmpresaId(membro.empresa_id);
      } catch (err) {
        if (!mounted) return;
        console.error('[Equipe] boot threw:', err);
        setBootError(err?.message || 'Erro inesperado.');
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const loadEmpresa = async (empId) => {
    const { data, error } = await supabase
      .from('empresas')
      .select('id, nome, dono_id')
      .eq('id', empId)
      .maybeSingle();
    if (error) {
      console.error('[Equipe] loadEmpresa error:', error);
      return null;
    }
    return data;
  };

  const loadPapel = async (empId, uid) => {
    const { data, error } = await supabase
      .from('membros')
      .select('papel')
      .eq('empresa_id', empId)
      .eq('user_id', uid)
      .maybeSingle();
    if (error) {
      console.error('[Equipe] loadPapel error:', error);
      return null;
    }
    return data?.papel || null;
  };

  const loadMembros = async (empId = empresaId) => {
    if (!empId) return;
    const { data, error } = await supabase
      .from('membros')
      .select('*')
      .eq('empresa_id', empId)
      .order('criado_em', { ascending: true });
    if (error) {
      console.error('[Equipe] loadMembros error:', error);
      return;
    }
    setMembros(data || []);
  };

  const reloadAll = useCallback(async () => {
    if (!empresaId || !userId) return;
    const [emp, papel] = await Promise.all([
      loadEmpresa(empresaId),
      loadPapel(empresaId, userId),
    ]);
    if (emp) {
      setEmpresa(emp);
      setNomeEmpresaInput(emp.nome || '');
    }
    setPapelAtual(papel);
    await loadMembros(empresaId);
    setLoading(false);
  }, [empresaId, userId]);

  useFocusEffect(
    useCallback(() => {
      reloadAll();
    }, [reloadAll])
  );

  const showToast = (msg) => {
    setToast(msg);
    toastAnim.setValue(0);
    Animated.sequence([
      Animated.timing(toastAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(2000),
      Animated.timing(toastAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start(() => setToast(''));
  };

  const handleSaveEmpresaNome = async () => {
    const novo = nomeEmpresaInput.trim();
    if (!novo) {
      showToast('Informe o nome da empresa.');
      return;
    }
    if (novo === empresa?.nome) {
      showToast('Nada para salvar.');
      return;
    }
    setSavingEmpresa(true);
    const { error } = await supabase
      .from('empresas')
      .update({ nome: novo })
      .eq('id', empresaId);
    setSavingEmpresa(false);
    if (error) {
      Alert.alert('Erro', error.message);
      return;
    }
    setEmpresa((e) => (e ? { ...e, nome: novo } : e));
    showToast('✓ Nome da empresa atualizado!');
  };

  const handleInvite = async () => {
    const emailLc = inviteEmail.trim().toLowerCase();
    if (!emailLc) {
      showToast('Informe o e-mail.');
      return;
    }
    if (!emailLc.includes('@')) {
      showToast('E-mail inválido.');
      return;
    }
    setInviting(true);

    const { data: foundList, error: findErr } = await supabase
      .from('membros')
      .select('user_id, nome, email')
      .eq('email', emailLc)
      .neq('empresa_id', empresaId)
      .limit(1);
    if (findErr) {
      setInviting(false);
      Alert.alert('Erro', findErr.message);
      return;
    }
    if (!foundList || foundList.length === 0) {
      setInviting(false);
      showToast('⚠️ E-mail não cadastrado. O funcionário deve criar uma conta no app primeiro.');
      return;
    }
    const found = foundList[0];

    const { data: existsList, error: existsErr } = await supabase
      .from('membros')
      .select('id')
      .eq('empresa_id', empresaId)
      .eq('email', emailLc)
      .limit(1);
    if (existsErr) {
      setInviting(false);
      Alert.alert('Erro', existsErr.message);
      return;
    }
    if (existsList && existsList.length > 0) {
      setInviting(false);
      showToast('Este usuário já faz parte da equipe');
      return;
    }

    const { error: insErr } = await supabase.from('membros').insert({
      empresa_id: empresaId,
      user_id: found.user_id,
      email: emailLc,
      nome: found.nome || null,
      papel: invitePapel,
    });
    setInviting(false);
    if (insErr) {
      Alert.alert('Erro', insErr.message);
      return;
    }

    setInviteEmail('');
    setInvitePapel('operador');
    showToast('✅ Membro adicionado!');
    await loadMembros();
  };

  const handleRemove = (membro) => {
    if (membro.user_id === userId) return;
    Alert.alert(
      'Remover membro?',
      `Deseja remover ${getDisplayName(membro)} da equipe?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('membros')
              .delete()
              .eq('id', membro.id)
              .eq('empresa_id', empresaId);
            if (error) {
              Alert.alert('Erro', error.message);
              return;
            }
            showToast('Membro removido');
            await loadMembros();
          },
        },
      ]
    );
  };

  const openEditMembro = (membro) => {
    setEditMembro(membro);
    setEditMembroNome(membro.nome || '');
  };

  const closeEditMembro = () => {
    setEditMembro(null);
    setEditMembroNome('');
  };

  const handleSaveMembroNome = async () => {
    if (!editMembro) return;
    const novo = editMembroNome.trim();
    setEditMembroSaving(true);
    const { error } = await supabase
      .from('membros')
      .update({ nome: novo || null })
      .eq('id', editMembro.id)
      .eq('empresa_id', empresaId);
    setEditMembroSaving(false);
    if (error) {
      Alert.alert('Erro', error.message);
      return;
    }
    closeEditMembro();
    showToast('Nome atualizado');
    await loadMembros();
  };

  if (loading) {
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
        <View style={{ padding: 20 }}>
          <Text style={styles.error}>{bootError}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const papelAtualObj = PAPEIS.find((p) => p.id === invitePapel) || PAPEIS[0];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <AppHeader />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header compacto da tela */}
          <View style={styles.screenHeader}>
            <Text style={styles.screenHeaderText}>👥 Equipe e permissões</Text>
          </View>

          {/* Card Nome da Empresa */}
          {isAdmin ? (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardHeaderEmoji}>🏪</Text>
                <Text style={styles.cardHeaderTitle}>Nome da Empresa</Text>
              </View>
              <TextInput
                style={styles.input}
                value={nomeEmpresaInput}
                onChangeText={setNomeEmpresaInput}
                placeholder="Nome da empresa"
                placeholderTextColor={colors.muted}
                editable={!savingEmpresa}
              />
              <TouchableOpacity
                style={[styles.primaryBtn, savingEmpresa && styles.disabled]}
                onPress={handleSaveEmpresaNome}
                disabled={savingEmpresa}
                activeOpacity={0.85}
              >
                {savingEmpresa ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>Salvar nome</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Card Minha Equipe */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardHeaderEmoji}>👥</Text>
              <Text style={styles.cardHeaderTitle}>Minha Equipe</Text>
            </View>

            {membros.length === 0 ? (
              <Text style={styles.empty}>Nenhum membro encontrado.</Text>
            ) : (
              membros.map((m, idx) => {
                const isSelf = m.user_id === userId;
                const last = idx === membros.length - 1;
                return (
                  <View
                    key={m.id}
                    style={[styles.membroRow, last && styles.membroRowLast]}
                  >
                    <View style={styles.membroInfo}>
                      <View style={styles.membroNomeRow}>
                        <Text style={styles.membroNome}>{getDisplayName(m)}</Text>
                        {isSelf ? (
                          <Text style={styles.youBadge}> (você)</Text>
                        ) : null}
                      </View>
                      <Text style={styles.membroMeta}>
                        {m.email} · {papelEmoji(m.papel)} · {m.papel || 'operador'}
                      </Text>
                    </View>

                    {isAdmin ? (
                      <View style={styles.membroActions}>
                        <TouchableOpacity
                          style={styles.editBtn}
                          onPress={() => openEditMembro(m)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.editBtnText}>✏️ Nome</Text>
                        </TouchableOpacity>
                        {!isSelf ? (
                          <TouchableOpacity
                            style={styles.removeBtn}
                            onPress={() => handleRemove(m)}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.removeBtnText}>Remover</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                );
              })
            )}
          </View>

          {/* Card Adicionar Membro */}
          {isAdmin ? (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardHeaderEmoji}>✉️</Text>
                <Text style={styles.cardHeaderTitle}>Adicionar Membro</Text>
              </View>

              <Text style={styles.helperText}>
                O funcionário deve criar uma conta no app com este e-mail. Após o cadastro,
                ele será vinculado à sua empresa.
              </Text>

              <Text style={styles.label}>E-MAIL</Text>
              <TextInput
                style={styles.input}
                value={inviteEmail}
                onChangeText={(t) => setInviteEmail(t.toLowerCase())}
                placeholder="email@dominio.com"
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                editable={!inviting}
              />

              <Text style={styles.label}>PAPEL</Text>
              <TouchableOpacity
                style={[styles.input, styles.pickerInput]}
                onPress={() => setPapelPickerOpen(true)}
                disabled={inviting}
                activeOpacity={0.7}
              >
                <Text style={styles.pickerValue}>
                  {papelAtualObj.emoji} {papelAtualObj.label}
                </Text>
                <Ionicons name="chevron-down" size={16} color={colors.muted} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.primaryBtn, inviting && styles.disabled]}
                onPress={handleInvite}
                disabled={inviting}
                activeOpacity={0.85}
              >
                {inviting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>✅ Adicionar à equipe</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Picker de papel */}
      <Modal
        visible={papelPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPapelPickerOpen(false)}
      >
        <TouchableOpacity
          style={styles.pickerBackdrop}
          activeOpacity={1}
          onPress={() => setPapelPickerOpen(false)}
        >
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>Selecionar papel</Text>
            {PAPEIS.map((p) => {
              const active = p.id === invitePapel;
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.pickerOption, active && styles.pickerOptionActive]}
                  onPress={() => {
                    setInvitePapel(p.id);
                    setPapelPickerOpen(false);
                  }}
                >
                  <Text
                    style={[
                      styles.pickerOptionText,
                      active && styles.pickerOptionTextActive,
                    ]}
                  >
                    {p.emoji} {p.label}
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

      {/* Modal de edição de nome */}
      <Modal
        visible={!!editMembro}
        transparent
        animationType="slide"
        onRequestClose={closeEditMembro}
      >
        <View style={styles.modalBackdrop}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ width: '100%' }}
          >
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Editar nome</Text>
                <TouchableOpacity onPress={closeEditMembro} hitSlop={8}>
                  <Ionicons name="close" size={24} color={colors.text} />
                </TouchableOpacity>
              </View>
              {editMembro ? (
                <>
                  <Text style={styles.modalEmail}>{editMembro.email}</Text>
                  <Text style={styles.label}>NOME DE EXIBIÇÃO</Text>
                  <TextInput
                    style={styles.input}
                    value={editMembroNome}
                    onChangeText={setEditMembroNome}
                    placeholder="Como deve aparecer na lista"
                    placeholderTextColor={colors.muted}
                    editable={!editMembroSaving}
                  />
                  <View style={styles.modalActions}>
                    <TouchableOpacity
                      style={[styles.modalCancelBtn, editMembroSaving && styles.disabled]}
                      onPress={closeEditMembro}
                      disabled={editMembroSaving}
                    >
                      <Text style={styles.modalCancelText}>Cancelar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.modalSaveBtn, editMembroSaving && styles.disabled]}
                      onPress={handleSaveMembroNome}
                      disabled={editMembroSaving}
                    >
                      {editMembroSaving ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.modalSaveText}>Salvar</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </>
              ) : null}
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
          <Text style={styles.toastText}>{toast}</Text>
        </Animated.View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { paddingBottom: 40 },

  // Header compacto
  screenHeader: {
    padding: 20,
  },
  screenHeaderText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },

  // Cards
  card: {
    backgroundColor: '#2a2a2a',
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 14,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  cardHeaderEmoji: {
    fontSize: 18,
    marginRight: 8,
  },
  cardHeaderTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    fontFamily: SERIF,
  },

  // Inputs / labels
  label: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.muted,
    marginTop: 12,
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
  pickerInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pickerValue: {
    color: colors.text,
    fontSize: 15,
  },
  helperText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },

  // Primary button
  primaryBtn: {
    backgroundColor: colors.accent,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  disabled: { opacity: 0.6 },

  // Membros
  membroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  membroRowLast: {
    borderBottomWidth: 0,
  },
  membroInfo: {
    flex: 1,
    paddingRight: 10,
  },
  membroNomeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  membroNome: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  youBadge: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  membroMeta: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 3,
  },
  membroActions: {
    flexDirection: 'row',
    gap: 6,
  },
  editBtn: {
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  editBtnText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  removeBtn: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  removeBtnText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '600',
  },

  empty: {
    color: colors.muted,
    textAlign: 'center',
    paddingVertical: 14,
    fontSize: 13,
  },
  error: {
    color: colors.danger,
    textAlign: 'center',
    marginTop: 24,
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

  // Modal de edição de nome
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#2a2a2a',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    maxHeight: '90%',
    borderTopWidth: 1,
    borderTopColor: '#333333',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    fontFamily: SERIF,
  },
  modalEmail: {
    color: colors.muted,
    fontSize: 13,
    marginBottom: 4,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 20,
  },
  modalCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#333333',
    backgroundColor: 'transparent',
    marginRight: 10,
    minWidth: 100,
    alignItems: 'center',
  },
  modalCancelText: {
    color: colors.text,
    fontWeight: '600',
  },
  modalSaveBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: colors.accent,
    minWidth: 100,
    alignItems: 'center',
  },
  modalSaveText: {
    color: '#fff',
    fontWeight: '700',
  },

  // Toast
  toast: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 30,
    left: 20,
    right: 20,
    backgroundColor: colors.text,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 6,
  },
  toastText: {
    color: '#2a2a2a',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});
