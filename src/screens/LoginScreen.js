import React, { useState } from 'react';
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
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../services/supabase';

const PALETTE = {
  cardBg: '#fdfaf4',
  cardShadowDark: '#1c1811',
  cream: '#f5f0e8',
  text: '#1c1811',
  muted: '#8c7f6e',
  border: '#e2d9c8',
  inputBg: '#eef2ff',
  gold: '#e8a020',
  accent: '#c84b2f',
  green: '#2d7a4f',
  errorBg: '#fef0ed',
  errorBorder: '#f5c4bb',
  errorText: '#c84b2f',
  successBg: '#edf6f1',
  successBorder: '#a8d5bc',
  successText: '#2d7a4f',
};

export default function LoginScreen() {
  const [tab, setTab] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const switchTab = (next) => {
    if (next === tab || loading) return;
    setTab(next);
    setError('');
    setInfo('');
  };

  const validateLogin = () => {
    if (!email.trim() || !password) {
      setError('Preencha e-mail e senha.');
      return false;
    }
    return true;
  };

  const validateSignup = () => {
    if (!email.trim() || !password) {
      setError('Preencha e-mail e senha.');
      return false;
    }
    if (password.length < 6) {
      setError('A senha precisa ter pelo menos 6 caracteres.');
      return false;
    }
    if (password !== confirmPassword) {
      setError('As senhas não coincidem.');
      return false;
    }
    return true;
  };

  const handleSignIn = async () => {
    setError('');
    setInfo('');
    if (!validateLogin()) return;
    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (signInError) {
      setError(translateError(signInError.message));
    }
  };

  const handleResetPassword = async () => {
    setError('');
    setInfo('');
    if (!email.trim()) {
      setError('Informe seu e-mail para redefinir a senha.');
      return;
    }
    setLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim());
    setLoading(false);
    if (resetError) {
      setError(translateError(resetError.message));
      return;
    }
    setInfo('E-mail enviado. Verifique sua caixa de entrada para redefinir a senha.');
  };

  const handleSignUp = async () => {
    setError('');
    setInfo('');
    if (!validateSignup()) return;
    setLoading(true);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (signUpError) {
      setError(translateError(signUpError.message));
      return;
    }
    if (data?.session) return;
    setInfo('Cadastro criado! Verifique seu e-mail para confirmar a conta.');
  };

  const isLogin = tab === 'login';

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#3d1f0f', '#1a0a00', '#0a0a0a']}
        start={{ x: 0.5, y: 0.3 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.card}>
              <View style={styles.logoBlock}>
                <View style={styles.logoMark}>
                  <Text style={styles.logoMarkText}>?</Text>
                </View>
                <Text style={styles.brand}>
                  Sobrou<Text style={styles.brandQ}>?</Text>
                </Text>
                <Text style={styles.tagline}>Amanhã não sobra mais.</Text>
              </View>

              <View style={styles.tabs}>
                <TouchableOpacity
                  style={[styles.tab, isLogin && styles.tabActive]}
                  onPress={() => switchTab('login')}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.tabText, isLogin && styles.tabTextActive]}>
                    Entrar
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.tab, !isLogin && styles.tabActive]}
                  onPress={() => switchTab('signup')}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.tabText, !isLogin && styles.tabTextActive]}>
                    Criar conta
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>E-mail</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="seu@email.com"
                  placeholderTextColor={PALETTE.muted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  editable={!loading}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Senha</Text>
                <View style={styles.passwordWrap}>
                  <TextInput
                    style={styles.passwordInput}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Sua senha"
                    placeholderTextColor={PALETTE.muted}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!loading}
                  />
                  <TouchableOpacity
                    style={styles.passwordToggle}
                    onPress={() => setShowPassword((v) => !v)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={showPassword ? 'eye-off' : 'eye'}
                      size={20}
                      color={PALETTE.muted}
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {isLogin ? (
                <TouchableOpacity
                  onPress={handleResetPassword}
                  disabled={loading}
                  activeOpacity={0.7}
                >
                  <Text style={styles.forgotPasswordText}>Esqueci minha senha</Text>
                </TouchableOpacity>
              ) : null}

              {!isLogin ? (
                <View style={styles.field}>
                  <Text style={styles.label}>Confirmar senha</Text>
                  <View style={styles.passwordWrap}>
                    <TextInput
                      style={styles.passwordInput}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      placeholder="Repita a senha"
                      placeholderTextColor={PALETTE.muted}
                      secureTextEntry={!showConfirmPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={!loading}
                    />
                    <TouchableOpacity
                      style={styles.passwordToggle}
                      onPress={() => setShowConfirmPassword((v) => !v)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={showConfirmPassword ? 'eye-off' : 'eye'}
                        size={20}
                        color={PALETTE.muted}
                      />
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}

              {error ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              {info ? (
                <View style={styles.successBox}>
                  <Text style={styles.successText}>{info}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={[styles.primaryButton, loading && styles.buttonDisabled]}
                onPress={isLogin ? handleSignIn : handleSignUp}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator color={PALETTE.cardBg} />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    {isLogin ? 'Entrar' : 'Cadastrar'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function translateError(message) {
  if (!message) return 'Erro ao autenticar. Tente novamente.';
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'E-mail ou senha inválidos.';
  if (m.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar.';
  if (m.includes('user already registered')) return 'Este e-mail já está cadastrado.';
  if (m.includes('password should be at least'))
    return 'A senha precisa ter pelo menos 6 caracteres.';
  if (m.includes('unable to validate email')) return 'E-mail inválido.';
  return message;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: PALETTE.cardBg,
    borderRadius: 20,
    paddingVertical: 36,
    paddingHorizontal: 28,
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 12,
  },

  logoBlock: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoMark: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: PALETTE.cardShadowDark,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  logoMarkText: {
    color: PALETTE.gold,
    fontSize: 44,
    fontWeight: 'bold',
    lineHeight: 50,
  },
  brand: {
    color: PALETTE.text,
    fontSize: 28,
    fontWeight: 'bold',
  },
  brandQ: { color: PALETTE.gold },
  tagline: {
    fontSize: 12,
    color: PALETTE.muted,
    marginTop: 2,
  },

  tabs: {
    flexDirection: 'row',
    backgroundColor: PALETTE.cream,
    borderRadius: 10,
    padding: 4,
    gap: 4,
    marginBottom: 22,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: PALETTE.cardBg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: {
    color: PALETTE.muted,
    fontSize: 14,
    fontWeight: '600',
  },
  tabTextActive: {
    color: PALETTE.text,
  },

  field: { marginBottom: 14 },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: PALETTE.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  input: {
    backgroundColor: PALETTE.inputBg,
    color: PALETTE.text,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingRight: 44,
    paddingVertical: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: PALETTE.border,
  },
  passwordWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PALETTE.inputBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: PALETTE.border,
  },
  passwordInput: {
    flex: 1,
    backgroundColor: 'transparent',
    borderWidth: 0,
    color: PALETTE.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  passwordToggle: {
    position: 'absolute',
    right: 12,
    height: '100%',
    justifyContent: 'center',
  },
  forgotPasswordText: {
    color: PALETTE.accent,
    fontSize: 13,
    marginTop: 6,
    marginBottom: 10,
  },

  errorBox: {
    backgroundColor: PALETTE.errorBg,
    borderWidth: 1,
    borderColor: PALETTE.errorBorder,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 4,
    marginBottom: 6,
  },
  errorText: {
    color: PALETTE.errorText,
    fontSize: 13,
  },
  successBox: {
    backgroundColor: PALETTE.successBg,
    borderWidth: 1,
    borderColor: PALETTE.successBorder,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 4,
    marginBottom: 6,
  },
  successText: {
    color: PALETTE.successText,
    fontSize: 13,
  },

  primaryButton: {
    backgroundColor: PALETTE.accent,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 14,
    width: '100%',
  },
  primaryButtonText: {
    color: PALETTE.cardBg,
    fontSize: 15,
    fontWeight: 'bold',
  },
  buttonDisabled: { opacity: 0.65 },
});
