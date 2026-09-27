import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../services/supabase';
import { colors } from '../theme/colors';

export default function AssinaturaBloqueadaScreen() {
  const [saindo, setSaindo] = useState(false);

  // Se o signOut normal falhar (ex.: sem internet), sai so neste aparelho.
  // A pessoa nunca pode ficar presa nesta tela.
  const handleSair = async () => {
    setSaindo(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (err) {
      console.warn('[AssinaturaBloqueada] signOut falhou, tentando local:', err?.message);
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch (localErr) {
        console.error('[AssinaturaBloqueada] signOut local falhou:', localErr);
      }
    } finally {
      setSaindo(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>Seu período de teste terminou.</Text>
        <Text style={styles.body}>
          Para continuar usando o Sobrou, fale com a gente:
        </Text>
        <Text style={styles.phone}>(44) 98857-0731</Text>

        <Pressable
          style={({ pressed }) => [
            styles.button,
            (pressed || saindo) && styles.buttonPressed,
          ]}
          onPress={handleSair}
          disabled={saindo}
        >
          {saindo ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <Text style={styles.buttonText}>Sair</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    color: colors.accent,
    fontSize: 26,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
  },
  body: {
    color: colors.text,
    fontSize: 16,
    textAlign: 'center',
    opacity: 0.85,
    lineHeight: 22,
  },
  phone: {
    color: colors.text,
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 12,
  },
  button: {
    backgroundColor: colors.accent,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 40,
  },
  buttonPressed: { opacity: 0.6 },
  buttonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
});
