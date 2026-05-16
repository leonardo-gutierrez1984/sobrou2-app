import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import LoginScreen from './src/screens/LoginScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import { supabase } from './src/services/supabase';
import { colors } from './src/theme/colors';

console.log('[App] module evaluated');

export default function App() {
  console.log('[App] component rendering');
  const [session, setSession] = useState(null);
  const [hasEmpresa, setHasEmpresa] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log('[App] useEffect running');
    let mounted = true;
    let bootDone = false;

    const CHECK_TIMEOUT_MS = 6000;
    const CHECK_MAX_ATTEMPTS = 2;
    const CHECK_RETRY_DELAY_MS = 1000;

    const runMembrosQuery = (userId) => {
      const query = supabase
        .from('membros')
        .select('empresa_id')
        .eq('user_id', userId)
        .limit(1);
      const timeout = new Promise((resolve) =>
        setTimeout(() => resolve({ __timeout: true }), CHECK_TIMEOUT_MS)
      );
      return Promise.race([query, timeout]);
    };

    const checkEmpresa = async (userId) => {
      console.log('[App] checkEmpresa start', userId);
      for (let attempt = 1; attempt <= CHECK_MAX_ATTEMPTS; attempt++) {
        try {
          console.log(`[App] checkEmpresa retry ${attempt}/${CHECK_MAX_ATTEMPTS}...`);
          const result = await runMembrosQuery(userId);
          if (!mounted) return;

          if (result.__timeout) {
            console.warn(`[App] checkEmpresa attempt ${attempt} timed out after ${CHECK_TIMEOUT_MS}ms`);
            if (attempt < CHECK_MAX_ATTEMPTS) {
              await new Promise((r) => setTimeout(r, CHECK_RETRY_DELAY_MS));
              if (!mounted) return;
              continue;
            }
            console.error('[App] checkEmpresa: all attempts timed out — assuming no empresa');
            setHasEmpresa(false);
            return;
          }

          const { data, error } = result;
          if (error) {
            console.error(`[App] checkEmpresa attempt ${attempt} error:`, error);
            if (attempt < CHECK_MAX_ATTEMPTS) {
              await new Promise((r) => setTimeout(r, CHECK_RETRY_DELAY_MS));
              if (!mounted) return;
              continue;
            }
            setHasEmpresa(false);
            return;
          }

          const found = (data || []).length > 0;
          console.log('[App] checkEmpresa result:', { userId, attempt, found, data });
          setHasEmpresa(found);
          return;
        } catch (err) {
          console.error(`[App] checkEmpresa attempt ${attempt} threw:`, err);
          if (!mounted) return;
          if (attempt < CHECK_MAX_ATTEMPTS) {
            await new Promise((r) => setTimeout(r, CHECK_RETRY_DELAY_MS));
            if (!mounted) return;
            continue;
          }
          setHasEmpresa(false);
          return;
        }
      }
    };

    (async () => {
      console.log('[App] boot IIFE starting');
      try {
        console.log('[App] awaiting getSession + warm-up ping in parallel...');
        const [sessionRes, warmupRes] = await Promise.all([
          supabase.auth.getSession(),
          supabase
            .from('membros')
            .select('id')
            .limit(1)
            .then(
              (r) => ({ ok: !r.error, error: r.error }),
              (err) => ({ ok: false, error: err })
            ),
        ]);
        console.log('[App] session + warm-up prontos', {
          hasSession: !!sessionRes?.data?.session,
          warmupOk: warmupRes.ok,
          warmupError: warmupRes.error?.message,
        });
        const { data: getData, error: getErr } = sessionRes;
        if (getErr) console.error('[App] getSession error:', getErr);
        if (!mounted) return;

        if (getData?.session) {
          const { data: refreshData, error: refreshErr } =
            await supabase.auth.refreshSession();
          if (!mounted) return;

          if (refreshErr) {
            console.error('[App] refreshSession error, signing out:', refreshErr);
            try {
              await supabase.auth.signOut({ scope: 'local' });
            } catch (signOutErr) {
              console.error('[App] signOut failed:', signOutErr);
            }
            if (!mounted) return;
            setSession(null);
            setHasEmpresa(null);
          } else {
            setSession(refreshData.session);
            if (refreshData.session) {
              await checkEmpresa(refreshData.session.user.id);
            } else {
              setHasEmpresa(null);
            }
          }
        } else {
          setSession(null);
          setHasEmpresa(null);
        }
      } catch (err) {
        console.error('[App] boot flow threw:', err);
        if (!mounted) return;
        setSession(null);
        setHasEmpresa(false);
      } finally {
        bootDone = true;
        console.log('[App] boot done');
        if (mounted) setLoading(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!mounted) return;
      if (!bootDone) {
        console.log('[App] onAuthStateChange ignored during boot:', event);
        return;
      }
      console.log('[App] onAuthStateChange:', event);
      try {
        if (event === 'SIGNED_IN') {
          setSession(newSession);
          if (newSession) {
            setHasEmpresa(null);
            await checkEmpresa(newSession.user.id);
          }
        } else if (event === 'SIGNED_OUT') {
          setSession(null);
          setHasEmpresa(null);
        } else if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
          setSession(newSession);
        }
      } catch (err) {
        console.error('[App] onAuthStateChange threw:', err);
        if (mounted) setHasEmpresa(false);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const renderContent = () => {
    if (loading) {
      return (
        <View style={styles.splash}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      );
    }
    if (!session) return <LoginScreen />;
    if (hasEmpresa === null) {
      return (
        <View style={styles.splash}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      );
    }
    if (!hasEmpresa) {
      return <OnboardingScreen onComplete={() => setHasEmpresa(true)} />;
    }
    return <AppNavigator />;
  };

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {renderContent()}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
