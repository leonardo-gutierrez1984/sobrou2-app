import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../services/supabase';
import { colors } from '../theme/colors';

export default function OnboardingScreen({ onComplete }) {
  const [nome, setNome] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.user) {
          if (mounted) setChecking(false);
          return;
        }

        // 1) Tenta vincular convite via RPC (bypassa RLS)
        const { data: vinculou, error: rpcErr } = await supabase
          .rpc('vincular_convite');

        if (!mounted) return;

        if (rpcErr) {
          console.warn('[Onboarding] vincular_convite falhou:', rpcErr.message);
          setChecking(false);
          return;
        }

        if (vinculou) {
          // Convite encontrado e vinculado — pula criação de empresa
          onComplete?.();
          return;
        }

        // Nenhum convite — segue para o formulário de criação de empresa
        setChecking(false);
      } catch (err) {
        console.warn('[Onboarding] erro inesperado:', err?.message);
        if (mounted) setChecking(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [onComplete]);

  const handleStart = async () => {
    setError('');
    const nomeTrim = nome.trim();
    if (!nomeTrim) {
      setError('Informe o nome da empresa.');
      return;
    }

    setLoading(true);

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      setLoading(false);
      setError('Sessão expirada. Faça login novamente.');
      return;
    }

    const { data: rpcData, error: rpcErr } = await supabase
      .rpc('criar_empresa', { nome_empresa: nomeTrim });

    setLoading(false);

    if (rpcErr) {
      console.log('[Onboarding] rpcErr completo:', JSON.stringify(rpcErr));
      setError(rpcErr.message);
      return;
    }

    onComplete?.();
  };

  if (checking) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.checkingWrap}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={styles.checkingText}>Verificando seu cadastro...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>Bem-vindo ao Sobrou?</Text>
          <Text style={styles.subtitle}>Vamos configurar sua empresa</Text>

          <Text style={styles.label}>Nome da empresa</Text>
          <TextInput
            style={styles.input}
            value={nome}
            onChangeText={setNome}
            placeholder="Ex: Padaria do Zé"
            placeholderTextColor={colors.muted}
            autoCapitalize="words"
            editable={!loading}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleStart}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <Text style={styles.buttonText}>Começar</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    color: colors.accent,
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    color: colors.text,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 32,
    opacity: 0.8,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    marginBottom: 8,
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
  error: {
    color: colors.danger,
    marginTop: 16,
    textAlign: 'center',
  },
  button: {
    backgroundColor: colors.accent,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 24,
  },
  buttonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  buttonDisabled: { opacity: 0.6 },
  checkingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  checkingText: {
    color: colors.muted,
    fontSize: 14,
    marginTop: 16,
    textAlign: 'center',
  },
});
