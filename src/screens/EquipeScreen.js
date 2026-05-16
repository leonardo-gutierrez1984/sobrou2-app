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

function papelLabel(p) {
  if (p === 'admin') return '👑 Admin';
  return '🔧 Operador';
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

    // 1. Buscar a pessoa em qualquer outra empresa pra confirmar que tem conta
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

    // 2. Já é membro desta empresa?
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

    // 3. Insert
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
        <View style={styles.container}>
          <Text style={styles.error}>{bootError}</Text>
        </View>
      </SafeAreaView>
    );
  }

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
          <Text style={styles.screenTitle}>Equipe</Text>
          <Text style={styles.screenSubtitle}>
            {empresa?.nome || 'Sua empresa'}
          </Text>

          {isAdmin ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Nome da empresa</Text>
              <TextInput
                style={styles.input}
                value={nomeEmpresaInput}
                onChangeText={setNomeEmpresaInput}
                placeholder="Nome da empresa"
                placeholderTextColor={colors.muted}
                editable={!savingEmpresa}
              />
              <TouchableOpacity
                style={[styles.primaryBtn, savingEmpresa && styles.btnDisabled]}
                onPress={handleSaveEmpresaNome}
                disabled={savingEmpresa}
              >
                {savingEmpresa ? (
                  <ActivityIndicator color={colors.surface} />
                ) : (
                  <Text style={styles.primaryBtnText}>Salvar</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : null}

          {isAdmin ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Convidar membro</Text>
              <Text style={styles.label}>E-mail</Text>
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
              <Text style={styles.label}>Papel</Text>
              <View style={styles.pillsRow}>
                {PAPEIS.map((p) => {
                  const active = p.id === invitePapel;
                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={[styles.pill, active && styles.pillActive]}
                      onPress={() => setInvitePapel(p.id)}
                      disabled={inviting}
                    >
                      <Text style={[styles.pillText, active && styles.pillTextActive]}>
                        {p.emoji} {p.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TouchableOpacity
                style={[styles.primaryBtn, inviting && styles.btnDisabled]}
                onPress={handleInvite}
                disabled={inviting}
              >
                {inviting ? (
                  <ActivityIndicator color={colors.surface} />
                ) : (
                  <Text style={styles.primaryBtnText}>Adicionar membro</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={styles.membrosHeader}>
            <Text style={styles.sectionTitle}>
              Membros{' '}
              <Text style={styles.membrosCount}>({membros.length})</Text>
            </Text>
          </View>

          {membros.length === 0 ? (
            <Text style={styles.empty}>Nenhum membro encontrado.</Text>
          ) : (
            membros.map((m) => {
              const isSelf = m.user_id === userId;
              return (
                <View key={m.id} style={styles.membroCard}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.membroNomeRow}>
                      <Text style={styles.membroNome}>{getDisplayName(m)}</Text>
                      {isSelf ? <Text style={styles.youBadge}>(você)</Text> : null}
                    </View>
                    <Text style={styles.membroEmail}>{m.email}</Text>
                    <Text style={styles.membroPapel}>{papelLabel(m.papel)}</Text>
                  </View>
                  {isAdmin ? (
                    <View style={styles.membroActions}>
                      <TouchableOpacity
                        style={styles.iconBtn}
                        onPress={() => openEditMembro(m)}
                        hitSlop={8}
                      >
                        <Ionicons name="create-outline" size={20} color={colors.accent} />
                      </TouchableOpacity>
                      {!isSelf ? (
                        <TouchableOpacity
                          style={styles.removeBtn}
                          onPress={() => handleRemove(m)}
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
        </ScrollView>
      </KeyboardAvoidingView>

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
                  <Text style={styles.label}>Nome de exibição</Text>
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
                      style={[styles.modalCancelBtn, editMembroSaving && styles.btnDisabled]}
                      onPress={closeEditMembro}
                      disabled={editMembroSaving}
                    >
                      <Text style={styles.modalCancelText}>Cancelar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.modalSaveBtn, editMembroSaving && styles.btnDisabled]}
                      onPress={handleSaveMembroNome}
                      disabled={editMembroSaving}
                    >
                      {editMembroSaving ? (
                        <ActivityIndicator color={colors.surface} />
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
  container: { padding: 20, paddingBottom: 60 },

  screenTitle: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
    fontFamily: SERIF,
  },
  screenSubtitle: {
    color: colors.muted,
    fontSize: 14,
    marginTop: 4,
    marginBottom: 20,
  },

  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    fontFamily: SERIF,
    marginBottom: 12,
  },
  label: {
    color: colors.text,
    fontSize: 13,
    marginTop: 12,
    marginBottom: 6,
    opacity: 0.85,
  },
  input: {
    backgroundColor: colors.bg,
    color: colors.text,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },

  pillsRow: { flexDirection: 'row', flexWrap: 'wrap' },
  pill: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    marginRight: 8,
    marginBottom: 8,
  },
  pillActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  pillText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  pillTextActive: { color: colors.surface },

  primaryBtn: {
    backgroundColor: colors.accent,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 16,
  },
  primaryBtnText: {
    color: colors.surface,
    fontSize: 15,
    fontWeight: '700',
  },
  btnDisabled: { opacity: 0.6 },

  membrosHeader: { marginTop: 8, marginBottom: 12 },
  membrosCount: { color: colors.muted, fontWeight: '600' },

  empty: { color: colors.muted, textAlign: 'center', marginTop: 20 },

  membroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 10,
  },
  membroNomeRow: { flexDirection: 'row', alignItems: 'center' },
  membroNome: { color: colors.text, fontSize: 15, fontWeight: '700' },
  youBadge: {
    color: colors.gold,
    fontSize: 12,
    marginLeft: 6,
    fontWeight: '700',
  },
  membroEmail: { color: colors.muted, fontSize: 13, marginTop: 2 },
  membroPapel: { color: colors.text, fontSize: 13, marginTop: 4 },

  membroActions: { flexDirection: 'row', alignItems: 'center' },
  iconBtn: { padding: 6, marginRight: 6 },

  removeBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  removeBtnText: { color: colors.accent, fontWeight: '700', fontSize: 12 },

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
    marginBottom: 8,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
    fontFamily: SERIF,
  },
  modalEmail: { color: colors.muted, fontSize: 13, marginBottom: 4 },
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

  error: { color: colors.danger, textAlign: 'center', marginTop: 24 },

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
    color: colors.surface,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});
