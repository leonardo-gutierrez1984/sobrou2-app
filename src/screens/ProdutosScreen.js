import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as XLSX from 'xlsx';
import { supabase } from '../services/supabase';
import { colors } from '../theme/colors';
import AppHeader from '../components/AppHeader';

const UNIDADES = ['Un', 'Kg', 'Dz', 'L'];
const IMPORT_BATCH_SIZE = 50;
const FAKE_ERP_COST = 13.16;

export default function ProdutosScreen() {
  const [userId, setUserId] = useState(null);
  const [empresaId, setEmpresaId] = useState(null);

  const [produtos, setProdutos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [formVisible, setFormVisible] = useState(false);
  const [editing, setEditing] = useState(null);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!mounted || !user) {
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
        setLoadError(membroErr.message);
        setLoading(false);
        return;
      }
      if (!membro?.empresa_id) {
        setLoadError('Empresa não encontrada para este usuário.');
        setLoading(false);
        return;
      }
      setEmpresaId(membro.empresa_id);
      // produtos são carregados via useFocusEffect abaixo
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!empresaId) return;
      loadProdutos(empresaId);
    }, [empresaId])
  );

  const loadProdutos = async (empId, mounted = true) => {
    setLoadError('');
    const { data, error } = await supabase
      .from('produtos')
      .select('*')
      .eq('empresa_id', empId)
      .order('nome', { ascending: true });
    if (!mounted) return;
    if (error) {
      setLoadError(error.message);
    } else {
      setProdutos(data || []);
    }
    setLoading(false);
  };

  const openNew = () => {
    setEditing(null);
    setFormVisible(true);
  };

  const openEdit = (produto) => {
    setEditing(produto);
    setFormVisible(true);
  };

  const closeForm = () => {
    setFormVisible(false);
    setEditing(null);
  };

  const handleSaved = async () => {
    closeForm();
    if (empresaId) await loadProdutos(empresaId);
  };

  const confirmDelete = (produto) => setDeleteTarget(produto);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from('produtos').delete().eq('id', deleteTarget.id);
    setDeleting(false);
    if (error) {
      setLoadError(error.message);
    } else {
      setDeleteTarget(null);
      if (empresaId) await loadProdutos(empresaId);
    }
  };

  const handleImportXLSX = async () => {
    if (importing) return;
    if (!empresaId || !userId) {
      setImportStatus('❌ Empresa ou usuário não identificados');
      return;
    }

    setImporting(true);
    setImportStatus('');

    let pickerResult;
    try {
      pickerResult = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });
    } catch (e) {
      setImportStatus('❌ Erro ao ler arquivo. Verifique se é .xlsx válido');
      setImporting(false);
      return;
    }

    if (pickerResult.canceled || !pickerResult.assets || pickerResult.assets.length === 0) {
      setImportStatus('');
      setImporting(false);
      return;
    }

    const file = pickerResult.assets[0];
    setImportStatus('⏳ Lendo arquivo...');

    let rows;
    try {
      const response = await fetch(file.uri);
      const arrayBuffer = await response.arrayBuffer();
      const data = new Uint8Array(arrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    } catch (e) {
      setImportStatus('❌ Erro ao ler arquivo. Verifique se é .xlsx válido');
      setImporting(false);
      return;
    }

    const headerInfo = detectarFormato(rows);
    if (!headerInfo) {
      setImportStatus('❌ Formato não reconhecido');
      setImporting(false);
      return;
    }

    setImportStatus(
      `⏳ Formato detectado: ${headerInfo.formato === 'allfood' ? 'Allfood' : 'Padrão'}`
    );

    const produtosToImport = [];
    for (let i = headerInfo.headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      const nomeRaw = row[headerInfo.nomeIdx];
      if (nomeRaw == null) continue;
      const nome = String(nomeRaw).trim();
      if (!nome || nome.toUpperCase() === 'NOME') continue;

      const unidadeRaw = headerInfo.unidadeIdx !== -1 ? row[headerInfo.unidadeIdx] : '';
      const unidade = normalizarUnidade(unidadeRaw);

      let custoEstimado = null;
      if (headerInfo.custoIdx !== -1) {
        const raw = row[headerInfo.custoIdx];
        const n =
          typeof raw === 'number'
            ? raw
            : parseFloat(String(raw).replace(/\./g, '').replace(',', '.'));
        if (!isNaN(n) && n > 0 && n !== FAKE_ERP_COST) {
          custoEstimado = n;
        }
      }

      produtosToImport.push({
        nome,
        unidade,
        custo_estimado: custoEstimado,
        empresa_id: empresaId,
        user_id: userId,
      });
    }

    if (produtosToImport.length === 0) {
      setImportStatus('❌ Nenhum produto encontrado');
      setImporting(false);
      return;
    }

    let inserted = 0;
    let errors = 0;
    for (let i = 0; i < produtosToImport.length; i += IMPORT_BATCH_SIZE) {
      const lote = produtosToImport.slice(i, i + IMPORT_BATCH_SIZE);
      const processed = Math.min(i + IMPORT_BATCH_SIZE, produtosToImport.length);
      setImportStatus(`⏳ Importando... ${processed}/${produtosToImport.length}`);
      const { error } = await supabase.from('produtos').insert(lote);
      if (error) {
        errors += lote.length;
      } else {
        inserted += lote.length;
      }
    }

    setImportStatus(
      errors > 0
        ? `✅ ${inserted} produtos importados (${errors} com erro)`
        : `✅ ${inserted} produtos importados`
    );
    setImporting(false);
    if (empresaId) await loadProdutos(empresaId);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <AppHeader />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.importSection}>
          <TouchableOpacity
            style={[styles.importButton, importing && styles.buttonDisabled]}
            onPress={handleImportXLSX}
            disabled={importing}
            activeOpacity={0.7}
          >
            {importing ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <Text style={styles.importButtonText}>📥 Importar XLSX</Text>
            )}
          </TouchableOpacity>
          {importStatus ? (
            <Text style={styles.importStatus}>{importStatus}</Text>
          ) : null}
        </View>

        {loading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
        ) : loadError ? (
          <Text style={styles.error}>{loadError}</Text>
        ) : produtos.length === 0 ? (
          <Text style={styles.empty}>Nenhum produto cadastrado. Toque em + para adicionar.</Text>
        ) : (
          produtos.map((p) => (
            <View key={p.id} style={styles.card}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardNome}>{p.nome}</Text>
                <View style={styles.cardMeta}>
                  <Text style={styles.metaItem}>
                    <Text style={styles.metaLabel}>Un: </Text>
                    {p.unidade || '-'}
                  </Text>
                  <Text style={styles.metaItem}>
                    <Text style={styles.metaLabel}>Custo: </Text>
                    {formatBRL(p.custo_estimado)}
                  </Text>
                  {p.validade_dias != null ? (
                    <Text style={styles.metaItem}>
                      <Text style={styles.metaLabel}>Validade: </Text>
                      {p.validade_dias}d
                    </Text>
                  ) : null}
                </View>
              </View>
              <View style={styles.cardActions}>
                <TouchableOpacity
                  style={styles.iconBtn}
                  onPress={() => openEdit(p)}
                  hitSlop={8}
                >
                  <Ionicons name="create-outline" size={22} color={colors.accent} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.iconBtn}
                  onPress={() => confirmDelete(p)}
                  hitSlop={8}
                >
                  <Ionicons name="trash-outline" size={22} color={colors.danger} />
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={openNew} activeOpacity={0.85}>
        <Ionicons name="add" size={30} color={colors.text} />
      </TouchableOpacity>

      <ProductFormModal
        visible={formVisible}
        produto={editing}
        userId={userId}
        empresaId={empresaId}
        onClose={closeForm}
        onSaved={handleSaved}
      />

      <ConfirmDeleteModal
        produto={deleteTarget}
        deleting={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </SafeAreaView>
  );
}

function ProductFormModal({ visible, produto, userId, empresaId, onClose, onSaved }) {
  const isEdit = !!produto;
  const [nome, setNome] = useState('');
  const [unidade, setUnidade] = useState('Un');
  const [custo, setCusto] = useState('');
  const [validade, setValidade] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (produto) {
      setNome(produto.nome ?? '');
      setUnidade(produto.unidade ?? 'Un');
      setCusto(produto.custo_estimado != null ? String(produto.custo_estimado) : '');
      setValidade(produto.validade_dias != null ? String(produto.validade_dias) : '');
    } else {
      setNome('');
      setUnidade('Un');
      setCusto('');
      setValidade('');
    }
    setError('');
  }, [visible, produto]);

  const handleSubmit = async () => {
    setError('');
    const nomeTrim = nome.trim();
    if (!nomeTrim) {
      setError('Informe o nome do produto.');
      return;
    }
    const custoNum = parseFloat(String(custo).replace(',', '.'));
    if (custo && (isNaN(custoNum) || custoNum < 0)) {
      setError('Custo inválido.');
      return;
    }
    let validadeNum = null;
    if (validade.trim()) {
      validadeNum = parseInt(validade, 10);
      if (isNaN(validadeNum) || validadeNum < 0) {
        setError('Validade inválida.');
        return;
      }
    }

    setSaving(true);
    let result;
    if (isEdit) {
      result = await supabase
        .from('produtos')
        .update({
          nome: nomeTrim,
          unidade,
          custo_estimado: isNaN(custoNum) ? null : custoNum,
          validade_dias: validadeNum,
        })
        .eq('id', produto.id);
    } else {
      result = await supabase.from('produtos').insert({
        nome: nomeTrim,
        unidade,
        custo_estimado: isNaN(custoNum) ? null : custoNum,
        validade_dias: validadeNum,
        user_id: userId,
        empresa_id: empresaId,
      });
    }
    setSaving(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    onSaved();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalKAV}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {isEdit ? 'Editar produto' : 'Novo produto'}
              </Text>
              <TouchableOpacity onPress={onClose} hitSlop={8}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.label}>Nome do produto</Text>
              <TextInput
                style={styles.input}
                value={nome}
                onChangeText={setNome}
                placeholder="Ex: Pão francês"
                placeholderTextColor={colors.muted}
                editable={!saving}
              />

              <Text style={styles.label}>Unidade</Text>
              <View style={styles.pillsRow}>
                {UNIDADES.map((u) => {
                  const active = u === unidade;
                  return (
                    <TouchableOpacity
                      key={u}
                      style={[styles.pill, active && styles.pillActive]}
                      onPress={() => setUnidade(u)}
                      disabled={saving}
                    >
                      <Text style={[styles.pillText, active && styles.pillTextActive]}>{u}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.label}>Custo estimado (R$)</Text>
              <TextInput
                style={styles.input}
                value={custo}
                onChangeText={setCusto}
                placeholder="0,00"
                placeholderTextColor={colors.muted}
                keyboardType="decimal-pad"
                editable={!saving}
              />

              <Text style={styles.label}>Validade em dias (opcional)</Text>
              <TextInput
                style={styles.input}
                value={validade}
                onChangeText={setValidade}
                placeholder="Ex: 5"
                placeholderTextColor={colors.muted}
                keyboardType="number-pad"
                editable={!saving}
              />

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <TouchableOpacity
                style={[styles.saveButton, saving && styles.buttonDisabled]}
                onPress={handleSubmit}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color={colors.text} />
                ) : (
                  <Text style={styles.saveButtonText}>Salvar</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function ConfirmDeleteModal({ produto, deleting, onCancel, onConfirm }) {
  return (
    <Modal
      visible={!!produto}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.confirmBackdrop}>
        <View style={styles.confirmCard}>
          <Text style={styles.confirmTitle}>Excluir produto</Text>
          <Text style={styles.confirmText}>
            Tem certeza que deseja excluir{' '}
            <Text style={{ color: colors.accent, fontWeight: 'bold' }}>
              {produto?.nome}
            </Text>
            ?
          </Text>
          <View style={styles.confirmActions}>
            <TouchableOpacity
              style={[styles.confirmBtn, styles.cancelBtn]}
              onPress={onCancel}
              disabled={deleting}
            >
              <Text style={styles.cancelBtnText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, styles.deleteBtn, deleting && styles.buttonDisabled]}
              onPress={onConfirm}
              disabled={deleting}
            >
              {deleting ? (
                <ActivityIndicator color={colors.text} />
              ) : (
                <Text style={styles.deleteBtnText}>Excluir</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function formatBRL(value) {
  if (value == null || value === '') return '-';
  const n = typeof value === 'number' ? value : parseFloat(value);
  if (isNaN(n)) return '-';
  return `R$ ${n.toFixed(2).replace('.', ',')}`;
}

function normalizarUnidade(raw) {
  if (raw == null) return 'Un';
  const s = String(raw).toUpperCase().trim();
  if (!s) return 'Un';
  if (s === 'KG') return 'Kg';
  if (s === 'UN' || s === 'UNI' || s === 'UND' || s === 'UNID') return 'Un';
  if (s === 'DZ') return 'Dz';
  if (s === 'L' || s === 'LT') return 'L';
  return 'Un';
}

function detectarFormato(rows) {
  const maxScan = Math.min(20, rows.length);
  let headerIdx = -1;
  for (let i = 0; i < maxScan; i++) {
    const row = rows[i] || [];
    const textCells = row.filter(
      (c) => typeof c === 'string' && c.trim().length > 0
    );
    if (textCells.length >= 3) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return null;

  const headers = (rows[headerIdx] || []).map((h) =>
    typeof h === 'string' ? h.toUpperCase().trim() : ''
  );

  const hasDescri = headers.some((h) => h.includes('DESCRI'));
  const hasIntern = headers.some((h) => h.includes('INTERN'));
  const hasUnVenda = headers.some((h) => h.includes('UN') && h.includes('VENDA'));
  const isAllfood = (hasDescri && hasIntern) || hasUnVenda;

  let nomeIdx;
  let unidadeIdx;
  let custoIdx;

  if (isAllfood) {
    nomeIdx = headers.findIndex((h) => h.includes('DESCRI'));
    unidadeIdx = headers.findIndex((h) => h.includes('UN') && h.includes('VENDA'));
    custoIdx = headers.findIndex((h) => h.includes('CUSTO'));
  } else {
    nomeIdx = headers.findIndex(
      (h) => h === 'NOME' || h.includes('DESCRI') || h.includes('PRODUTO')
    );
    unidadeIdx = headers.findIndex(
      (h) => h.includes('UNIDADE') || h.includes('UNID') || h === 'UN'
    );
    custoIdx = headers.findIndex(
      (h) => h.includes('CUSTO') || h.includes('PRECO') || h.includes('PREÇO')
    );
  }

  if (nomeIdx === -1) return null;

  return {
    formato: isAllfood ? 'allfood' : 'generico',
    headerIdx,
    nomeIdx,
    unidadeIdx,
    custoIdx,
  };
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: 20, paddingBottom: 100 },

  empty: { color: colors.muted, textAlign: 'center', marginTop: 40 },
  error: { color: colors.danger, marginTop: 16, textAlign: 'center' },

  importSection: { marginBottom: 16 },
  importButton: {
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: 'transparent',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
  },
  importButtonText: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '600',
  },
  importStatus: {
    color: colors.text,
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
    opacity: 0.85,
  },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceCard,
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardNome: { color: colors.text, fontSize: 16, fontWeight: 'bold', marginBottom: 6 },
  cardMeta: { flexDirection: 'row', flexWrap: 'wrap' },
  metaItem: { color: colors.text, fontSize: 13, marginRight: 12, opacity: 0.9 },
  metaLabel: { color: colors.muted },
  cardActions: { flexDirection: 'row', alignItems: 'center' },
  iconBtn: { padding: 6, marginLeft: 4 },

  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 8,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalKAV: { width: '100%' },
  modalCard: {
    backgroundColor: colors.surfaceCard,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    maxHeight: '90%',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modalTitle: { color: colors.accent, fontSize: 20, fontWeight: 'bold' },

  label: {
    color: colors.text,
    fontSize: 14,
    marginTop: 14,
    marginBottom: 6,
    opacity: 0.9,
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
  pillsRow: { flexDirection: 'row', flexWrap: 'wrap' },
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
  pillActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  pillText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  pillTextActive: { color: colors.text },

  saveButton: {
    backgroundColor: colors.accent,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 20,
  },
  saveButtonText: { color: colors.text, fontSize: 16, fontWeight: 'bold' },
  buttonDisabled: { opacity: 0.6 },

  confirmBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  confirmCard: {
    width: '100%',
    backgroundColor: colors.surfaceCard,
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  confirmTitle: { color: colors.text, fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
  confirmText: { color: colors.text, fontSize: 15, marginBottom: 20, lineHeight: 22 },
  confirmActions: { flexDirection: 'row', justifyContent: 'flex-end' },
  confirmBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    marginLeft: 10,
    minWidth: 100,
    alignItems: 'center',
  },
  cancelBtn: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  cancelBtnText: { color: colors.text, fontWeight: '600' },
  deleteBtn: { backgroundColor: colors.danger },
  deleteBtnText: { color: colors.text, fontWeight: 'bold' },
});
