import {
  NavigationContainer,
  DarkTheme as NavigationDarkTheme,
  DefaultTheme as NavigationDefaultTheme,
} from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useColorScheme } from "react-native";
import AppNavigator from "./src/navigation";

export default function App() {
  const colorScheme = useColorScheme();
  const theme =
    colorScheme === "dark" ? NavigationDarkTheme : NavigationDefaultTheme;

  return (
    <SafeAreaProvider>
      <NavigationContainer linking={AppNavigator.linking} theme={theme}>
        <AppNavigator.Navigator />
        <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
