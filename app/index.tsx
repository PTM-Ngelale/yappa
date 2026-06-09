import { router } from "expo-router";
import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FIREBASE_CONFIGURED } from "../src/firebase/config";
import { generateRoomCode } from "../src/lib/roomCode";
import { useGameStore } from "../src/store/gameStore";
import { usePlayerStore } from "../src/store/playerStore";
import { colors, radius, spacing, typography } from "../src/theme";

export default function HomeScreen() {
  const { name, setName, avatarColor, setUid } = usePlayerStore();
  const { setRoomCode, setIsHost } = useGameStore();

  const [joinCode, setJoinCode] = useState("");
  const [showJoin, setShowJoin] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const trimmedName = name.trim();
  const canProceed = trimmedName.length >= 2;
  const initial = trimmedName.charAt(0).toUpperCase();

  async function getUid(): Promise<string | null> {
    if (!FIREBASE_CONFIGURED) return null;
    const { signInAnon } = await import("../src/firebase/auth");
    const uid = await signInAnon();
    setUid(uid);
    return uid;
  }

  async function handleCreate() {
    if (!canProceed) {
      setError("Enter your name first (2+ characters).");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const code = generateRoomCode();
      setRoomCode(code);
      setIsHost(true);
      const uid = await getUid();
      if (uid) {
        const { createRoom } = await import("../src/firebase/room");
        await createRoom(code, {
          uid,
          name: trimmedName,
          avatarColor,
          role: "knower",
          lastSeenAt: Date.now(),
        });
        const { startHeartbeat } = await import("../src/firebase/presence");
        startHeartbeat(code, uid);
      }
      router.push("/lobby");
    } catch (e) {
      setError("Failed to create room. Check your connection.");
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function handleJoin() {
    const code = joinCode.trim().toUpperCase();
    if (!canProceed) {
      setError("Enter your name first.");
      return;
    }
    if (code.length !== 4) {
      setError("Room code must be 4 characters.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      setRoomCode(code);
      setIsHost(false);
      const uid = await getUid();
      if (uid) {
        const { joinRoom } = await import("../src/firebase/room");
        await joinRoom(code, {
          uid,
          name: trimmedName,
          avatarColor,
          role: "knower",
          lastSeenAt: Date.now(),
        });
        const { startHeartbeat } = await import("../src/firebase/presence");
        startHeartbeat(code, uid);
      }
      router.push("/lobby");
    } catch (e) {
      setError("Failed to join room. Check the code and your connection.");
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const createActive = canProceed && !loading;

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Hero */}
          <View style={styles.hero}>
            <View style={styles.decorRow}>
              <View
                style={[
                  styles.decorDot,
                  { backgroundColor: colors.primaryContainer },
                ]}
              />
              <View
                style={[
                  styles.decorDot,
                  styles.decorDotMid,
                  { backgroundColor: colors.primary },
                ]}
              />
              <View
                style={[
                  styles.decorDot,
                  { backgroundColor: colors.primaryContainer },
                ]}
              />
            </View>
            <Text style={styles.appName}>Yappa</Text>
            <Text style={styles.tagline}>Word chain party game</Text>
          </View>

          {/* Name input */}
          <View style={styles.nameCard}>
            <View style={styles.nameRow}>
              <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
                <Text style={styles.avatarText}>{initial || "?"}</Text>
              </View>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={(t) => {
                  setName(t);
                  setError("");
                }}
                placeholder="Your name…"
                placeholderTextColor={colors.onSurfaceVariant}
                autoCapitalize="words"
                autoCorrect={false}
                maxLength={20}
                returnKeyType="done"
                accessibilityLabel="Your player name"
              />
            </View>
          </View>

          {error !== "" && <Text style={styles.errorText}>{error}</Text>}

          {/* Actions */}
          <View style={styles.actions}>
            {/* Create Game */}
            <Pressable
              onPress={handleCreate}
              disabled={!createActive}
              accessibilityRole="button"
              accessibilityLabel="Create a new game"
              style={({ pressed }) =>
                pressed && createActive && styles.btnPressed
              }
            >
              <View
                style={[
                  styles.createBtn,
                  !createActive && styles.createBtnInactive,
                ]}
              >
                <Text
                  style={[
                    styles.createBtnText,
                    !createActive && styles.createBtnTextInactive,
                  ]}
                >
                  {loading && !showJoin ? "Creating…" : "Create Game"}
                </Text>
              </View>
            </Pressable>

            {/* Divider */}
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Join section */}
            {!showJoin ? (
              <Pressable
                onPress={() => setShowJoin(true)}
                accessibilityRole="button"
                accessibilityLabel="Join an existing game"
                style={({ pressed }) => pressed && styles.btnPressed}
              >
                <View style={styles.joinGhostBtn}>
                  <Text style={styles.joinGhostText}>Join a game</Text>
                </View>
              </Pressable>
            ) : (
              <View style={styles.joinCard}>
                <Text style={styles.joinCardLabel}>ENTER ROOM CODE</Text>

                {/* Code input — full width */}
                <TextInput
                  style={styles.joinInput}
                  value={joinCode}
                  onChangeText={(t) => setJoinCode(t.toUpperCase())}
                  placeholder="A B C D"
                  placeholderTextColor={colors.onSurfaceVariant}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={4}
                  returnKeyType="go"
                  onSubmitEditing={handleJoin}
                  accessibilityLabel="Room code input"
                  autoFocus
                />

                {/* Submit button — full width below input */}
                <Pressable
                  onPress={handleJoin}
                  disabled={!canProceed || loading}
                  accessibilityRole="button"
                  accessibilityLabel="Join room"
                  style={({ pressed }) =>
                    pressed && canProceed && !loading && styles.btnPressed
                  }
                >
                  <View
                    style={[
                      styles.joinSubmitBtn,
                      (!canProceed || loading) && styles.joinSubmitBtnInactive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.joinSubmitText,
                        (!canProceed || loading) &&
                          styles.joinSubmitTextInactive,
                      ]}
                    >
                      {loading ? "Joining…" : "Join →"}
                    </Text>
                  </View>
                </Pressable>

                <Pressable
                  onPress={() => {
                    setShowJoin(false);
                    setJoinCode("");
                  }}
                >
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
              </View>
            )}
          </View>

          {!FIREBASE_CONFIGURED && (
            <Text style={styles.configNotice}>
              Add databaseURL to firebase/config.ts to enable multiplayer.
            </Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  body: {
    flexGrow: 1,
    paddingHorizontal: spacing.containerMargin,
    paddingTop: 48,
    paddingBottom: spacing.stackLg,
    gap: spacing.stackLg,
  },

  // Hero
  hero: { alignItems: "center", gap: 10 },
  decorRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    marginBottom: 4,
  },
  decorDot: { width: 12, height: 12, borderRadius: radius.full },
  decorDotMid: { width: 18, height: 18 },
  appName: {
    fontFamily: "Rubik_700Bold",
    fontSize: 72,
    lineHeight: 80,
    color: colors.primary,
    letterSpacing: -2,
  },
  tagline: {
    fontFamily: "Rubik_400Regular",
    fontSize: 16,
    color: colors.onSurfaceVariant,
    letterSpacing: 0.3,
  },

  // Name card
  nameCard: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    paddingHorizontal: spacing.stackMd,
    paddingVertical: 10,
  },
  nameRow: { flexDirection: "row", alignItems: "center", gap: spacing.stackMd },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  avatarText: { fontFamily: "Rubik_700Bold", fontSize: 16, color: "#fff" },
  input: {
    flex: 1,
    height: 44,
    fontFamily: "Rubik_400Regular",
    fontSize: 18,
    color: colors.onSurface,
  },

  errorText: { ...typography.bodyMd, color: colors.error, textAlign: "center" },

  actions: { gap: spacing.stackMd },

  // Create Game button — two explicit states, no opacity tricks
  createBtn: {
    height: 60,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 6,
  },
  createBtnInactive: {
    backgroundColor: colors.surfaceContainerHigh,
    shadowOpacity: 0,
    elevation: 0,
  },
  createBtnText: {
    fontFamily: "Rubik_700Bold",
    fontSize: 18,
    color: colors.onPrimary,
    letterSpacing: 0.5,
    textAlign: "center",
  },
  createBtnTextInactive: { color: colors.onSurfaceVariant },

  // Divider
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.stackMd,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.outlineVariant },
  dividerText: {
    fontFamily: "Rubik_400Regular",
    fontSize: 14,
    color: colors.onSurfaceVariant,
  },

  // Join ghost button
  joinGhostBtn: {
    width: "100%",
    height: 52,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.outline,
    justifyContent: "center",
    alignItems: "center",
  },
  joinGhostText: {
    fontFamily: "Rubik_600SemiBold",
    fontSize: 18,
    color: colors.onSurface,
    textAlign: "center",
  },

  // Join expanded card — stacked layout
  joinCard: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    paddingHorizontal: spacing.stackMd,
    paddingVertical: spacing.stackMd,
    gap: spacing.stackMd,
    alignItems: "center",
  },
  joinCardLabel: {
    fontFamily: "Rubik_500Medium",
    fontSize: 11,
    color: colors.onSurfaceVariant,
    letterSpacing: 1.5,
  },
  joinInput: {
    width: "100%",
    height: 56,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.full,
    fontFamily: "Rubik_700Bold",
    fontSize: 24,
    color: colors.onSurface,
    borderWidth: 2,
    borderColor: colors.primary,
    letterSpacing: 8,
    textAlign: "center",
  },
  joinSubmitBtn: {
    width: "100%",
    height: 40,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    justifyContent: "center",
    alignItems: "center",
    padding: 10,
  },
  joinSubmitBtnInactive: {
    backgroundColor: colors.surfaceContainerHigh,
  },
  joinSubmitText: {
    fontFamily: "Rubik_700Bold",
    fontSize: 17,
    color: colors.onPrimary,
    textAlign: "center",
  },
  joinSubmitTextInactive: { color: colors.onSurfaceVariant },
  cancelText: {
    fontFamily: "Rubik_400Regular",
    fontSize: 14,
    color: colors.onSurfaceVariant,
  },

  btnPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.97 }],
  },

  configNotice: {
    fontFamily: "Rubik_400Regular",
    fontSize: 12,
    color: colors.onSurfaceVariant,
    textAlign: "center",
    opacity: 0.6,
  },
});
