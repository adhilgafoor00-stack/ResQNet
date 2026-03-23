import { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthStore } from './src/store/useStore';
import { startOfflineSync } from './src/services/offline';

// Auth screens
import PhoneInput from './src/screens/auth/PhoneInput';
import OTPVerify from './src/screens/auth/OTPVerify';

// Role screens
import SOSScreen from './src/screens/citizen/SOSScreen';
import DriverMap from './src/screens/driver/DriverMap';
import CommunityHome from './src/screens/community/CommunityHome';
import VoicePlayer from './src/screens/shared/VoicePlayer';

const Stack = createNativeStackNavigator();

const screenOptions = {
  headerStyle: { backgroundColor: '#1A2535' },
  headerTintColor: '#FFFFFF',
  headerTitleStyle: { fontWeight: '700' },
  headerBackTitle: 'Back',
  contentStyle: { backgroundColor: '#0F1923' },
};

export default function App() {
  const { user, isAuthenticated, hydrate } = useAuthStore();

  useEffect(() => {
    // Restore session from AsyncStorage on launch
    hydrate();
    // Start offline queue sync service
    startOfflineSync();
  }, []);

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={screenOptions}>
        {!isAuthenticated ? (
          // Auth stack
          <>
            <Stack.Screen name="PhoneInput" component={PhoneInput} options={{ title: 'ResQNet', headerShown: true }} />
            <Stack.Screen name="OTPVerify" component={OTPVerify} options={{ title: 'Verify OTP' }} />
          </>
        ) : (
          // Role-based stack — role detected from DB after login
          <>
            {user?.role === 'citizen' && (
              <Stack.Screen
                name="SOSScreen"
                component={SOSScreen}
                options={{ title: 'Send SOS', headerShown: true }}
              />
            )}
            {user?.role === 'driver' && (
              <Stack.Screen
                name="DriverMap"
                component={DriverMap}
                options={{ title: `${user.vehicleType || 'Vehicle'} — ResQNet`, headerShown: true }}
              />
            )}
            {user?.role === 'community' && (
              <Stack.Screen
                name="CommunityHome"
                component={CommunityHome}
                options={{ title: 'ResQNet', headerShown: true }}
              />
            )}
            {/* Shared screens accessible across roles */}
            <Stack.Screen
              name="VoicePlayer"
              component={VoicePlayer}
              options={{ title: 'Voice Broadcast', presentation: 'modal' }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
