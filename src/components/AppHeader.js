import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../services/supabase';
import { colors } from '../theme/colors';

const SERIF = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });

function formatDateLong(d) {
  try {
    return d.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

export default function AppHeader() {
  const navigation = useNavigation();
  const [empresaNome, setEmpresaNome] = useState('');
  const hoje = new Date();

  const goEquipe = () => {
    try {
      navigation?.navigate('Equipe');
    } catch (err) {
      console.warn('[AppHeader] navigate Equipe failed:', err?.message);
    }
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data: userRes } = await supabase.auth.getUser();
        const user = userRes?.user;
        if (!user || !mounted) return;
        const { data: membro } = await supabase
          .from('membros')
          .select('empresa_id')
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle();
        if (!membro?.empresa_id || !mounted) return;
        const { data: empresa } = await supabase
          .from('empresas')
          .select('nome')
          .eq('id', membro.empresa_id)
          .maybeSingle();
        if (!mounted) return;
        setEmpresaNome(empresa?.nome || '');
      } catch (err) {
        console.warn('[AppHeader] empresa lookup:', err?.message);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const handleSair = () => {
    Alert.alert('Sair', 'Deseja encerrar a sessão?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
        },
      },
    ]);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={styles.brandBlock}>
          <Text style={styles.brand}>
            Sobrou <Text style={styles.brandQuestion}>?</Text>
          </Text>
          <Text style={styles.date}>{formatDateLong(hoje)}</Text>
        </View>
        <View style={styles.right}>
          {empresaNome ? (
            <Text style={styles.empresa} numberOfLines={1}>
              {empresaNome}
            </Text>
          ) : null}
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={goEquipe}
              activeOpacity={0.7}
              accessibilityLabel="Equipe"
            >
              <Ionicons name="people-outline" size={18} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.sairBtn} onPress={handleSair} activeOpacity={0.7}>
              <Text style={styles.sairText}>Sair</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.bg,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandBlock: { flex: 1 },
  brand: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
    fontFamily: SERIF,
  },
  brandQuestion: { color: colors.gold },
  date: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  right: {
    alignItems: 'flex-end',
    marginLeft: 12,
  },
  empresa: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    maxWidth: 160,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sairBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  sairText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
});
