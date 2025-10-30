import { createNativeStackNavigator } from "@react-navigation/native-stack";
import * as Linking from "expo-linking";
import AlertsListScreen from "../screens/AlertsListScreen";
import AlertDetailScreen from "../screens/AlertDetailScreen";
import LoginScreen from "../screens/LoginScreen";
import { useEffect } from "react";
import useAuthStore from "../stores/authStore";

export const linking = {
  prefixes: [Linking.createURL("/"), "quantumeye://"],
  config: {
    screens: {
      Alerts: "alerts",
      AlertDetail: "alert/:id",
    },
  },
};

const Stack = createNativeStackNavigator();

function Navigator() {
  const token = useAuthStore((s) => s.token);
  const loading = useAuthStore((s) => s.loading);
  const restore = useAuthStore((s) => s.restore);

  useEffect(() => {
    restore();
  }, []);

  if (loading) return null;

  return (
    <Stack.Navigator>
      {!token ? (
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ headerShown: false }}
        />
      ) : (
        <>
          <Stack.Screen
            name="Alerts"
            component={AlertsListScreen}
            options={{ title: "Alerts" }}
          />
          <Stack.Screen
            name="AlertDetail"
            component={AlertDetailScreen}
            options={{ title: "Alert" }}
          />
        </>
      )}
    </Stack.Navigator>
  );
}

export default { Navigator, linking };
