import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import * as Linking from 'expo-linking';
import { Ionicons } from '@expo/vector-icons';
import InicioScreen from '../screens/InicioScreen';
import LancamentoScreen from '../screens/LancamentoScreen';
import PainelScreen from '../screens/PainelScreen';
import ProdutosScreen from '../screens/ProdutosScreen';
import EquipeScreen from '../screens/EquipeScreen';
import ResetPasswordScreen from '../screens/ResetPasswordScreen';
import { colors } from '../theme/colors';
import { EmpresaProvider } from '../context/EmpresaContext';

const Tab = createBottomTabNavigator();
const TAB_BG = '#1a1a1a';
const TAB_BORDER = '#333333';
const TAB_ACTIVE = '#e05c2a';
const TAB_INACTIVE = '#8c8c8c';
const ICONS = { Inicio: 'home-outline', Lancamento: 'add-circle-outline', Produtos: 'cube-outline', Painel: 'bar-chart-outline' };

export default function AppNavigator({ navigationRef }) {
  const linking = {
    prefixes: ['sobrou://'],
    config: {
      screens: {
        Inicio: 'inicio',
        Lancamento: 'lancamento',
        Produtos: 'produtos',
        Painel: 'painel',
        Equipe: 'equipe',
        ResetPassword: 'reset-password',
      },
    },
  };

  return (
    <EmpresaProvider>
      <NavigationContainer
        ref={navigationRef}
        linking={linking}
        theme={{ dark: true, colors: { primary: colors.accent, background: colors.bg, card: colors.surface, text: colors.text, border: colors.border, notification: colors.gold } }}
      >
        <Tab.Navigator
          screenOptions={({ route }) => ({
            headerShown: false,
            tabBarStyle: { backgroundColor: TAB_BG, borderTopColor: TAB_BORDER, borderTopWidth: 1 },
            tabBarActiveTintColor: TAB_ACTIVE,
            tabBarInactiveTintColor: TAB_INACTIVE,
            tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
            tabBarIcon: ({ color, size }) => {
              const name = ICONS[route.name];
              if (!name) return null;
              return <Ionicons name={name} color={color} size={size} />;
            },
          })}
        >
          <Tab.Screen name="Inicio" component={InicioScreen} options={{ title: 'Início' }} />
          <Tab.Screen name="Lancamento" component={LancamentoScreen} options={{ title: 'Lançar' }} />
          <Tab.Screen name="Produtos" component={ProdutosScreen} />
          <Tab.Screen name="Painel" component={PainelScreen} options={{ title: 'Análises' }} />
          <Tab.Screen name="Equipe" component={EquipeScreen} options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
          <Tab.Screen
            name="ResetPassword"
            component={ResetPasswordScreen}
            options={{ tabBarButton: () => null, title: 'Redefinir senha' }}
          />
        </Tab.Navigator>
      </NavigationContainer>
    </EmpresaProvider>
  );
}
