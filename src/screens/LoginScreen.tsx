import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Button,
  StyleSheet,
  useColorScheme,
} from "react-native";
import useAuthStore from "../stores/authStore";
import AuthService from "../services/AuthService";

const LoginScreen: React.FC = () => {
  const setToken = useAuthStore((s) => s.setToken);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const colorScheme = useColorScheme();

  const onLogin = async () => {
    try {
      setLoading(true);
      const token = await AuthService.login(username, password);
      setToken(token);
    } catch (e) {
      setError((e as { message: string })?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colorScheme === "dark" ? "#000" : "#fff" },
      ]}
      accessibilityLabel="Login screen"
    >
      <Text
        style={[
          styles.title,
          { color: colorScheme === "dark" ? "#EEE" : "#111" },
        ]}
      >
        Sign in
      </Text>
      {error ? (
        <Text style={{ color: "#b00", marginBottom: 8 }}>{error}</Text>
      ) : null}
      <TextInput
        placeholder="Username"
        value={username}
        onChangeText={setUsername}
        style={[
          styles.input,
          {
            borderColor: colorScheme === "dark" ? "#333" : "#ddd",
            color: colorScheme === "dark" ? "#EEE" : "#111",
          },
        ]}
        autoCapitalize="none"
      />
      <TextInput
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        style={[
          styles.input,
          {
            borderColor: colorScheme === "dark" ? "#333" : "#ddd",
            color: colorScheme === "dark" ? "#EEE" : "#111",
          },
        ]}
        secureTextEntry
      />
      <Button
        title={loading ? "Signing in..." : "Sign in"}
        onPress={onLogin}
        disabled={loading}
      />
    </View>
  );
};

export default LoginScreen;

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, justifyContent: "center" },
  title: { fontSize: 24, marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    padding: 8,
    marginBottom: 12,
    borderRadius: 6,
  },
});
