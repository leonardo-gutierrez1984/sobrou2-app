import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { LinearGradient } from 'expo-linear-gradient';
import * as DocumentPicker from 'expo-document-picker';
import * as XLSX from 'xlsx';
import { supabase } from '../services/supabase';
import { colors } from '../theme/colors';
import AppHeader from '../components/AppHeader';

const UNIDADES = ['Un', 'Kg', 'Dz', 'L'];
const IMPORT_BATCH_SIZE = 50;
const IMPORT_MAX_PRODUTOS = 500;
const FAKE_ERP_COST = 13.16;

export default function ProdutosScreen() {
  const [userId, setUserId] = useState(null);
  const [empresaId, setEmpresaId] = useState(null);
  const [papelAtual, setPapelAtual] = useState(null);
  const isAdmin = papelAtual === 'admin';

  const [produtos, setProdutos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // Formulário inline (Novo produto)
  const [nome, setNome] = useState('');
  const [unidade, setUnidade] = useState('Un');
  const [custo, setCusto] = useState('');
  const [validade, setValidade] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [unidadePickerOpen, setUnidadePickerOpen] = useState(false);

  // Edição via modal
  const [editTarget, setEditTarget] = useState(null);

  // Exclusão
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Importação
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState('');
  const [deleteAllVisible, setDeleteAllVisible] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [deleteAllConfirm, setDeleteAllConfirm] = useState('');

  // Catálogo
  const [search, setSearch] = useState('');
  const [listExpanded, setListExpanded] = useState(true);

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
        .select('empresa_id, papel')
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
      setPapelAtual(membro.papel || null);
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

  const resetForm = () => {
    setNome('');
    setUnidade('Un');
    setCusto('');
    setValidade('');
    setFormError('');
  };

  const salvarProduto = async () => {
    setFormError('');
    const nomeTrim = nome.trim();
    if (!nomeTrim) {
      setFormError('Informe o nome do produto.');
      return;
    }
    const custoNum = parseFloat(String(custo).replace(',', '.'));
    if (custo && (isNaN(custoNum) || custoNum < 0)) {
      setFormError('Custo inválido.');
      return;
    }
    let validadeNum = null;
    if (validade.trim()) {
      validadeNum = parseInt(validade, 10);
      if (isNaN(validadeNum) || validadeNum < 0) {
        setFormError('Validade inválida.');
        return;
      }
    }

    setSaving(true);
    const { error } = await supabase.from('produtos').insert({
      nome: nomeTrim,
      unidade,
      custo_estimado: isNaN(custoNum) ? null : custoNum,
      validade_dias: validadeNum,
      user_id: userId,
      empresa_id: empresaId,
    });
    setSaving(false);
    if (error) {
      setFormError(error.message);
      return;
    }
    resetForm();
    if (empresaId) await loadProdutos(empresaId);
  };

  const handleSaved = async () => {
    setEditTarget(null);
    if (empresaId) await loadProdutos(empresaId);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const idParaExcluir = deleteTarget.id;
    // Atualização otimista: remove da lista imediatamente
    setProdutos((prev) => prev.filter((p) => p.id !== idParaExcluir));
    setDeleteTarget(null);
    setDeleting(true);
    const { error } = await supabase.from('produtos').delete().eq('id', idParaExcluir);
    setDeleting(false);
    if (error) {
      // Se falhou, recarrega a lista do servidor
      setLoadError(error.message);
      if (empresaId) await loadProdutos(empresaId);
    }
  };

  const handleDeleteAll = async () => {
    if (!isAdmin) return;
    if (deleteAllConfirm.trim().toUpperCase() !== 'APAGAR') return;
    setDeletingAll(true);
    const { error } = await supabase
      .from('produtos')
      .delete()
      .eq('empresa_id', empresaId);
    setDeletingAll(false);
    if (error) {
      setImportStatus('❌ Erro ao apagar: ' + error.message);
    } else {
      setDeleteAllVisible(false);
      setDeleteAllConfirm('');
      setImportStatus('✅ Todos os produtos foram apagados');
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
    console.log('[Import] rows[0..10]:', JSON.stringify(rows.slice(0, 10)));
    console.log('[Import] headerInfo:', JSON.stringify(headerInfo));
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
      const nomeStr = String(nomeRaw).trim();
      if (!nomeStr || nomeStr.toUpperCase() === 'NOME') continue;

      const unidadeRaw = headerInfo.unidadeIdx !== -1 ? row[headerInfo.unidadeIdx] : '';
      const unidadeNorm = normalizarUnidade(unidadeRaw);

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
        nome: nomeStr,
        unidade: unidadeNorm,
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
    // sem limite — importa tudo

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

  const filtrados = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return produtos;
    return produtos.filter((p) => (p.nome || '').toLowerCase().includes(q));
  }, [produtos, search]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <AppHeader />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {/* 1. Hero Banner */}
        <LinearGradient
          colors={['#1a1a1a', '#2a1a0a']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroContent}>
            <Text style={styles.heroEyebrow}>BASE OPERACIONAL</Text>
            <Text style={styles.heroTitle}>Produtos e custos</Text>
            <Text style={styles.heroSubtitle}>
              Cadastre, importe e mantenha a ficha básica dos itens monitorados.
            </Text>
          </View>
          <View style={styles.erpBadge}>
            <Text style={styles.erpBadgeText}>ERP</Text>
          </View>
        </LinearGradient>

        {/* 2. Card Importar */}
        <View style={styles.card}>
          <View style={styles.importRow}>
            <Text style={styles.importTitle}>Importar produtos do ERP</Text>
            <TouchableOpacity
              style={[styles.ghostBtn, importing && styles.disabled]}
              onPress={handleImportXLSX}
              disabled={importing}
              activeOpacity={0.7}
            >
              {importing ? (
                <ActivityIndicator color={colors.text} size="small" />
              ) : (
                <Text style={styles.ghostBtnText}>Selecionar arquivo</Text>
              )}
            </TouchableOpacity>
          </View>
          {importStatus ? <Text style={styles.importStatus}>{importStatus}</Text> : null}
          {isAdmin ? (
            <TouchableOpacity
              style={styles.deleteAllBtn}
              onPress={() => { setDeleteAllVisible(true); setDeleteAllConfirm(''); }}
              activeOpacity={0.7}
            >
              <Text style={styles.deleteAllBtnText}>Apagar todos os produtos</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* 3. Card Novo produto */}
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <View style={styles.bullet} />
            <Text style={styles.sectionTitle}>Novo produto</Text>
          </View>

          <Text style={styles.label}>NOME DO PRODUTO</Text>
          <TextInput
            style={styles.input}
            value={nome}
            onChangeText={setNome}
            placeholder="Ex: Pão Francês"
            placeholderTextColor={colors.muted}
            editable={!saving}
          />

          <View style={styles.row2}>
            <View style={styles.col}>
              <Text style={styles.label}>UNIDADE</Text>
              <TouchableOpacity
                style={[styles.input, styles.pickerInput]}
                onPress={() => setUnidadePickerOpen(true)}
                disabled={saving}
                activeOpacity={0.7}
              >
                <Text style={styles.pickerValue}>{unidade}</Text>
                <Ionicons name="chevron-down" size={16} color={colors.muted} />
              </TouchableOpacity>
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>
                CUSTO EST. (R$) <Text style={styles.optionalTag}>opcional</Text>
              </Text>
              <TextInput
                style={styles.input}
                value={custo}
                onChangeText={setCusto}
                placeholder="0,00"
                placeholderTextColor={colors.muted}
                keyboardType="decimal-pad"
                editable={!saving}
              />
            </View>
          </View>

          <View style={styles.alert}>
            <Text style={styles.alertText}>Custo estimado para fins de gestão</Text>
          </View>

          <Text style={styles.label}>
            VALIDADE (DIAS) <Text style={styles.optionalTag}>opcional</Text>
          </Text>
          <TextInput
            style={styles.input}
            value={validade}
            onChangeText={setValidade}
            placeholder="Ex: 5"
            placeholderTextColor={colors.muted}
            keyboardType="number-pad"
            editable={!saving}
          />
          <Text style={styles.helperText}>
            Se informado, o app alertará no dia do vencimento
          </Text>

          {formError ? <Text style={styles.error}>{formError}</Text> : null}

          <TouchableOpacity
            style={[styles.primaryBtn, saving && styles.disabled]}
            onPress={salvarProduto}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Cadastrar produto</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* 4. Card Catálogo */}
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <View style={styles.bullet} />
            <Text style={styles.sectionTitle}>Catálogo de produtos</Text>
          </View>

          <View style={styles.searchWrap}>
            <Ionicons name="search" size={14} color={colors.muted} style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Buscar produto..."
              placeholderTextColor={colors.muted}
            />
          </View>

          <TouchableOpacity
            style={styles.collapseHeader}
            onPress={() => setListExpanded((v) => !v)}
            activeOpacity={0.7}
          >
            <Text style={styles.collapseHeaderText}>
              PRODUTOS CADASTRADOS ({filtrados.length})
            </Text>
            <Ionicons
              name={listExpanded ? 'chevron-up' : 'chevron-down'}
              size={14}
              color={colors.accent}
            />
          </TouchableOpacity>

          {listExpanded ? (
            loading ? (
              <ActivityIndicator color={colors.accent} style={{ marginTop: 16 }} />
            ) : loadError ? (
              <Text style={styles.error}>{loadError}</Text>
            ) : filtrados.length === 0 ? (
              <Text style={styles.empty}>
                {search ? 'Nenhum produto encontrado.' : 'Nenhum produto cadastrado.'}
              </Text>
            ) : (
              filtrados.map((p, idx) => {
                const last = idx === filtrados.length - 1;
                return (
                  <View
                    key={p.id}
                    style={[styles.productItem, last && styles.productItemLast]}
                  >
                    <View style={styles.productInfo}>
                      <Text style={styles.productName}>
                        {p.nome || ''}
                      </Text>
                      <Text style={styles.productMeta}>
                        {p.unidade || '-'}
                        {' · '}
                        {formatBRL(p.custo_estimado)}
                        {p.validade_dias != null ? (
                          <Text style={styles.productMeta}>
                            {' · '}
                            {p.validade_dias} dias
                          </Text>
                        ) : (
                          <Text style={styles.warningText}>
                            {' · '}⚠️ sem alerta de vencimento
                          </Text>
                        )}
                      </Text>
                    </View>
                    <View style={styles.productActions}>
                      <TouchableOpacity
                        style={styles.editBtn}
                        onPress={() => setEditTarget(p)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.editBtnText}>Editar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.deleteBtn}
                        onPress={() => setDeleteTarget(p)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.deleteBtnText}>Excluir</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )
          ) : null}
        </View>
      </ScrollView>

      {/* Picker de unidade */}
      <Modal
        visible={unidadePickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setUnidadePickerOpen(false)}
      >
        <TouchableOpacity
          style={styles.pickerBackdrop}
          activeOpacity={1}
          onPress={() => setUnidadePickerOpen(false)}
        >
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>Selecionar unidade</Text>
            {UNIDADES.map((u) => {
              const active = u === unidade;
              return (
                <TouchableOpacity
                  key={u}
                  style={[styles.pickerOption, active && styles.pickerOptionActive]}
                  onPress={() => {
                    setUnidade(u);
                    setUnidadePickerOpen(false);
                  }}
                >
                  <Text
                    style={[
                      styles.pickerOptionText,
                      active && styles.pickerOptionTextActive,
                    ]}
                  >
                    {u}
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

      <Modal
        visible={deleteAllVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteAllVisible(false)}
      >
        <View style={styles.confirmBackdrop}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Apagar todos os produtos</Text>
            <Text style={styles.confirmText}>
              Esta ação é irreversível. Todos os produtos da empresa serão apagados permanentemente.{'\n\n'}
              Digite <Text style={{ color: colors.danger, fontWeight: 'bold' }}>APAGAR</Text> para confirmar:
            </Text>
            <TextInput
              style={[styles.input, { marginBottom: 16 }]}
              value={deleteAllConfirm}
              onChangeText={setDeleteAllConfirm}
              placeholder="Digite APAGAR"
              placeholderTextColor={colors.muted}
              autoCapitalize="characters"
              editable={!deletingAll}
            />
            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={[styles.confirmBtn, styles.cancelBtn]}
                onPress={() => setDeleteAllVisible(false)}
                disabled={deletingAll}
              >
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.confirmBtn,
                  styles.confirmDeleteBtn,
                  (deletingAll || deleteAllConfirm.trim().toUpperCase() !== 'APAGAR') && styles.disabled
                ]}
                onPress={handleDeleteAll}
                disabled={deletingAll || deleteAllConfirm.trim().toUpperCase() !== 'APAGAR'}
              >
                {deletingAll ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.confirmDeleteBtnText}>Apagar tudo</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ProductFormModal
        visible={!!editTarget}
        produto={editTarget}
        userId={userId}
        empresaId={empresaId}
        onClose={() => setEditTarget(null)}
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
  const [pickerOpen, setPickerOpen] = useState(false);

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
              <Text style={styles.label}>NOME DO PRODUTO</Text>
              <TextInput
                style={styles.input}
                value={nome}
                onChangeText={setNome}
                placeholder="Ex: Pão Francês"
                placeholderTextColor={colors.muted}
                editable={!saving}
              />

              <View style={styles.row2}>
                <View style={styles.col}>
                  <Text style={styles.label}>UNIDADE</Text>
                  <TouchableOpacity
                    style={[styles.input, styles.pickerInput]}
                    onPress={() => setPickerOpen(true)}
                    disabled={saving}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.pickerValue}>{unidade}</Text>
                    <Ionicons name="chevron-down" size={16} color={colors.muted} />
                  </TouchableOpacity>
                </View>
                <View style={styles.col}>
                  <Text style={styles.label}>
                    CUSTO EST. (R$) <Text style={styles.optionalTag}>opcional</Text>
                  </Text>
                  <TextInput
                    style={styles.input}
                    value={custo}
                    onChangeText={setCusto}
                    placeholder="0,00"
                    placeholderTextColor={colors.muted}
                    keyboardType="decimal-pad"
                    editable={!saving}
                  />
                </View>
              </View>

              <Text style={styles.label}>
                VALIDADE (DIAS) <Text style={styles.optionalTag}>opcional</Text>
              </Text>
              <TextInput
                style={styles.input}
                value={validade}
                onChangeText={setValidade}
                placeholder="Ex: 5"
                placeholderTextColor={colors.muted}
                keyboardType="number-pad"
                editable={!saving}
              />
              <Text style={styles.helperText}>
                Se informado, o app alertará no dia do vencimento
              </Text>

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <TouchableOpacity
                style={[styles.primaryBtn, saving && styles.disabled]}
                onPress={handleSubmit}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>
                    {isEdit ? 'Salvar alterações' : 'Cadastrar produto'}
                  </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>

        <Modal
          visible={pickerOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setPickerOpen(false)}
        >
          <TouchableOpacity
            style={styles.pickerBackdrop}
            activeOpacity={1}
            onPress={() => setPickerOpen(false)}
          >
            <View style={styles.pickerCard}>
              <Text style={styles.pickerTitle}>Selecionar unidade</Text>
              {UNIDADES.map((u) => {
                const active = u === unidade;
                return (
                  <TouchableOpacity
                    key={u}
                    style={[styles.pickerOption, active && styles.pickerOptionActive]}
                    onPress={() => {
                      setUnidade(u);
                      setPickerOpen(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.pickerOptionText,
                        active && styles.pickerOptionTextActive,
                      ]}
                    >
                      {u}
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
              style={[styles.confirmBtn, styles.confirmDeleteBtn, deleting && styles.disabled]}
              onPress={onConfirm}
              disabled={deleting}
            >
              {deleting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.confirmDeleteBtnText}>Excluir</Text>
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
  const maxScan = Math.min(30, rows.length);
  let headerIdx = -1;

  // Procura a linha que contém cabeçalhos de coluna reais
  // Prioriza linhas que contenham palavras-chave de colunas conhecidas
  for (let i = 0; i < maxScan; i++) {
    const row = rows[i] || [];
    const upper = row.map((c) =>
      typeof c === 'string'
        ? c.toUpperCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '')
        : ''
    );
    const textCells = row.filter((c) => typeof c === 'string' && c.trim().length > 0);
    if (textCells.length < 4) continue;

    const hasDescri = upper.some((h) => h.includes('DESCRI'));
    const hasNome = upper.some((h) => h === 'NOME' || h.includes('PRODUTO'));
    const hasUnidade = upper.some((h) => h.includes('UNID') || h === 'UN' || h.includes('UN,VENDA') || h.includes('UN.VENDA'));
    const hasCodigo = upper.some((h) => h.includes('COD') || h.includes('CED'));

    if (hasDescri || hasNome || (hasUnidade && hasCodigo)) {
      headerIdx = i;
      break;
    }
  }

  // Fallback: primeira linha com 3+ células de texto
  if (headerIdx === -1) {
    for (let i = 0; i < maxScan; i++) {
      const row = rows[i] || [];
      const textCells = row.filter((c) => typeof c === 'string' && c.trim().length > 0);
      if (textCells.length >= 3) {
        headerIdx = i;
        break;
      }
    }
  }

  if (headerIdx === -1) return null;

  const headers = (rows[headerIdx] || []).map((h) =>
    typeof h === 'string'
      ? h.toUpperCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '')
      : ''
  );

  // Detecta Allfood
  const hasDescri = headers.some((h) => h.includes('DESCRI'));
  const hasIntern = headers.some((h) => h.includes('INTERN'));
  const hasUnVenda = headers.some((h) => h.includes('UN') && (h.includes('VENDA') || h.includes(',VENDA')));
  const isAllfood = (hasDescri && hasIntern) || hasUnVenda;

  let nomeIdx;
  let unidadeIdx;
  let custoIdx;

  if (isAllfood) {
    // Allfood: DESCRIÇÃO INTERNA é o nome
    nomeIdx = headers.findIndex((h) => h.includes('DESCRI') && h.includes('INTERN'));
    if (nomeIdx === -1) nomeIdx = headers.findIndex((h) => h.includes('DESCRI'));
    unidadeIdx = headers.findIndex((h) => h.includes('UN') && (h.includes('VENDA') || h.includes(',VENDA')));
    custoIdx = headers.findIndex((h) => h.includes('CUSTO'));
  } else {
    nomeIdx = headers.findIndex((h) =>
      h === 'NOME' ||
      h === 'PRODUTO' ||
      h === 'DESCRICAO' ||
      h === 'DESCR' ||
      h === 'ITEM' ||
      h === 'MERCADORIA' ||
      h === 'MATERIAL' ||
      h.includes('DESCRI') ||
      h.includes('PRODUTO') ||
      h.includes('NOME')
    );
    unidadeIdx = headers.findIndex((h) =>
      h === 'UN' ||
      h === 'UND' ||
      h === 'UNID' ||
      h === 'UNIDADE' ||
      h === 'UNIDADES' ||
      h === 'UNIT' ||
      h.includes('UNID') ||
      h.includes('MEDIDA')
    );
    custoIdx = headers.findIndex((h) =>
      h.includes('CUSTO') ||
      h.includes('PRECO') ||
      h.includes('VALOR') ||
      h.includes('VLR') ||
      h.includes('PRICE')
    );
  }

  // Fallback: primeira coluna com texto
  if (nomeIdx === -1) {
    nomeIdx = headers.findIndex((h) => h.length > 0);
  }

  if (nomeIdx === -1) return null;

  return {
    formato: isAllfood ? 'allfood' : 'generico',
    headerIdx,
    nomeIdx,
    unidadeIdx: unidadeIdx === -1 ? -1 : unidadeIdx,
    custoIdx: custoIdx === -1 ? -1 : custoIdx,
  };
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { paddingBottom: 40 },

  // 1. Hero Banner
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
    borderColor: '#3a2a1a',
  },
  heroContent: { flex: 1, paddingRight: 12 },
  heroEyebrow: {
    color: colors.gold,
    fontSize: 11,
    fontWeight: '700',
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
  erpBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  erpBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
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

  // 2. Importar
  importRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  importTitle: {
    color: colors.gold,
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  ghostBtn: {
    borderWidth: 1,
    borderColor: '#333333',
    backgroundColor: 'transparent',
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 38,
  },
  ghostBtnText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  importStatus: {
    color: colors.text,
    fontSize: 13,
    marginTop: 10,
    opacity: 0.85,
  },

  // Section header (bolinha + título)
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
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

  // Labels e inputs
  label: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.muted,
    marginBottom: 5,
    marginTop: 10,
  },
  optionalTag: {
    color: colors.gold,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'lowercase',
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
  row2: {
    flexDirection: 'row',
    gap: 10,
  },
  col: { flex: 1 },
  helperText: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 5,
    fontStyle: 'italic',
  },

  // Alert amarelo
  alert: {
    backgroundColor: '#2a2200',
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: 8,
    padding: 10,
    marginTop: 12,
  },
  alertText: {
    color: colors.gold,
    fontSize: 12,
    fontWeight: '600',
  },

  // Primary button
  primaryBtn: {
    backgroundColor: colors.accent,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  disabled: { opacity: 0.6 },

  // Catálogo - busca
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderWidth: 1.5,
    borderColor: '#333333',
    borderRadius: 10,
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 11,
    fontSize: 15,
    color: colors.text,
  },

  // Colapsável
  collapseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  collapseHeaderText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  collapseChevron: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '700',
  },

  // Lista de produtos
  productItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  productItemLast: {
    borderBottomWidth: 0,
  },
  productInfo: {
    flex: 1,
    paddingRight: 10,
  },
  productName: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 4,
    letterSpacing: 0.3,
  },
  productMeta: {
    color: colors.muted,
    fontSize: 12,
  },
  warningText: {
    color: colors.gold,
    fontSize: 12,
  },
  productActions: {
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
  deleteBtn: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  deleteBtnText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '600',
  },

  empty: {
    color: colors.muted,
    textAlign: 'center',
    paddingVertical: 20,
    fontSize: 13,
  },
  error: {
    color: colors.danger,
    marginTop: 12,
    fontSize: 13,
  },

  // Picker modal de unidade
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  pickerCard: {
    width: '100%',
    maxWidth: 320,
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

  // Modal de edição
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalKAV: { width: '100%' },
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
  },

  // Modal de confirmação de exclusão
  confirmBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  confirmCard: {
    width: '100%',
    backgroundColor: '#2a2a2a',
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: '#333333',
  },
  confirmTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 10,
  },
  confirmText: {
    color: colors.text,
    fontSize: 15,
    marginBottom: 20,
    lineHeight: 22,
  },
  confirmActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  confirmBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    marginLeft: 10,
    minWidth: 100,
    alignItems: 'center',
  },
  cancelBtn: {
    borderWidth: 1,
    borderColor: '#333333',
    backgroundColor: 'transparent',
  },
  cancelBtnText: {
    color: colors.text,
    fontWeight: '600',
  },
  confirmDeleteBtn: {
    backgroundColor: colors.accent,
  },
  confirmDeleteBtnText: {
    color: '#fff',
    fontWeight: '700',
  },
  deleteAllBtn: {
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.danger,
    alignItems: 'center',
  },
  deleteAllBtnText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '600',
  },
});
