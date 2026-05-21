import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../services/supabase';

const EmpresaContext = createContext(null);

export function EmpresaProvider({ children }) {
  const [userId, setUserId] = useState(null);
  const [empresaId, setEmpresaId] = useState(null);
  const [empresaNome, setEmpresaNome] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data: userRes } = await supabase.auth.getUser();
        const user = userRes?.user;
        if (!mounted || !user) { setReady(true); return; }
        setUserId(user.id);

        const { data: membro } = await supabase
          .from('membros')
          .select('empresa_id')
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle();
        if (!mounted || !membro?.empresa_id) { setReady(true); return; }
        setEmpresaId(membro.empresa_id);

        const { data: empresa } = await supabase
          .from('empresas')
          .select('nome')
          .eq('id', membro.empresa_id)
          .maybeSingle();
        if (!mounted) return;
        setEmpresaNome(empresa?.nome || '');
      } catch (err) {
        console.warn('[EmpresaContext] boot error:', err?.message);
      } finally {
        if (mounted) setReady(true);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const refreshNome = async () => {
    if (!empresaId) return;
    const { data } = await supabase
      .from('empresas')
      .select('nome')
      .eq('id', empresaId)
      .maybeSingle();
    if (data?.nome) setEmpresaNome(data.nome);
  };

  return (
    <EmpresaContext.Provider value={{ userId, empresaId, empresaNome, ready, refreshNome }}>
      {children}
    </EmpresaContext.Provider>
  );
}

export function useEmpresa() {
  return useContext(EmpresaContext);
}
