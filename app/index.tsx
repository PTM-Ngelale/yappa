import { router } from "expo-router";
import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Pressable } from "../src/components/Pressable";
import { SoundToggles } from "../src/components/SoundToggles";
import { Avatar, Eyebrow, OUTLINE, Screen, Sticker, StickerButton } from "../src/components/ui";
import { PRIVACY_POLICY_URL } from "../src/lib/links";
import { SUPABASE_CONFIGURED } from "../src/supabase/config";
import { generateRoomCode } from "../src/lib/roomCode";
import { useGameStore } from "../src/store/gameStore";
import { usePlayerStore } from "../src/store/playerStore";
import { fonts, radius, spacing, type, useStyles, useTheme, type Palette } from "../src/theme";

export default function HomeScreen() {
  const styles = useStyles(makeStyles);
  const p = useTheme();
  const { name, setName, avatarColor, setUid } = usePlayerStore();
  const { setRoomCode, setIsHost } = useGameStore();

  const [joinCode, setJoinCode] = useState("");
  const [showJoin, setShowJoin] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const trimmedName = name.trim();
  const canProceed = trimmedName.length >= 2;

  async function getUid(): Promise<string | null> {
    if (!SUPABASE_CONFIGURED) return null;
    const { signInAnon } = await import("../src/supabase/auth");
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
        const { createRoom } = await import("../src/supabase/room");
        await createRoom(code, {
          uid,
          name: trimmedName,
          avatarColor,
          role: "knower",
          lastSeenAt: Date.now(),
        });
        const { startPresence } = await import("../src/supabase/presence");
        startPresence(code, uid);
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
        const { joinRoom } = await import("../src/supabase/room");
        await joinRoom(code, {
          uid,
          name: trimmedName,
          avatarColor,
          role: "knower",
          lastSeenAt: Date.now(),
        });
        const { startPresence } = await import("../src/supabase/presence");
        startPresence(code, uid);
      }
      router.push("/lobby");
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      if (message.includes("not found")) {
        setError("No game found with that code — check it and try again.");
      } else if (message.includes("already started")) {
        setError("That game has already started.");
      } else if (message.includes("is full")) {
        setError("That room is already full.");
      } else {
        setError("Failed to join room. Check the code and your connection.");
      }
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <View pointerEvents="none" style={[styles.blobCircle, { backgroundColor: p.coral }]} />
      <View pointerEvents="none" style={[styles.blobSquare, { backgroundColor: p.blue }]} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.topBar}>
            <SoundToggles />
          </View>

          <View style={styles.hero}>
            <Sticker
              bg={p.isDark ? p.yellow : p.card}
              radius={26}
              offset={6}
              style={styles.wordmarkWrap}
              contentStyle={styles.wordmark}
            >
              <Text
                style={[styles.wordmarkText, { color: p.isDark ? p.onYellow : p.ink }]}
                accessibilityRole="header"
                maxFontSizeMultiplier={1.2}
                numberOfLines={1}
              >
                Yappa
              </Text>
            </Sticker>
            <Text style={styles.tagline} maxFontSizeMultiplier={1.3}>Chain words. Guess the secret. Beat the clock.</Text>
          </View>

          <Sticker radius={22} offset={5} contentStyle={styles.nameCard}>
            <Avatar name={trimmedName || "?"} color={avatarColor} size={48} />
            <View style={styles.flex}>
              <Eyebrow style={styles.nameLabel}>Your name</Eyebrow>
              <TextInput
                style={styles.nameInput}
                value={name}
                onChangeText={(t) => {
                  setName(t);
                  setError("");
                }}
                placeholder="Type your name…"
                placeholderTextColor={p.muted}
                autoCapitalize="words"
                autoCorrect={false}
                maxLength={20}
                returnKeyType="done"
                accessibilityLabel="Your name"
              />
            </View>
          </Sticker>

          {error !== "" && (
            <Text style={styles.errorText} accessibilityLiveRegion="assertive">
              {error}
            </Text>
          )}

          <StickerButton
            label={loading && !showJoin ? "Creating…" : "Create game"}
            onPress={handleCreate}
            disabled={!canProceed || loading}
            height={64}
            fontSize={22}
            accessibilityLabel="Create a new game"
          />

          {!showJoin ? (
            <StickerButton
              label="Join with a code"
              icon="log-in"
              variant="card"
              fontSize={20}
              onPress={() => setShowJoin(true)}
              accessibilityLabel="Join an existing game"
            />
          ) : (
            <Sticker radius={22} offset={5} contentStyle={styles.joinCard}>
              <Eyebrow>Room code</Eyebrow>
              <TextInput
                style={styles.joinInput}
                value={joinCode}
                onChangeText={(t) => setJoinCode(t.toUpperCase())}
                placeholder="ABCD"
                placeholderTextColor={p.muted}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={4}
                returnKeyType="go"
                onSubmitEditing={handleJoin}
                accessibilityLabel="Room code"
                autoFocus
              />
              <StickerButton
                label={loading ? "Joining…" : "Join"}
                icon="arrow-right"
                variant="blue"
                height={56}
                fontSize={20}
                onPress={handleJoin}
                disabled={!canProceed || loading || joinCode.trim().length !== 4}
                accessibilityLabel="Join room"
                style={styles.stretch}
              />
              <Pressable
                onPress={() => {
                  setShowJoin(false);
                  setJoinCode("");
                }}
                accessibilityRole="button"
                style={styles.cancel}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
            </Sticker>
          )}

          <View style={styles.links}>
            <Pressable
              onPress={() => router.push("/how-to-play")}
              accessibilityRole="button"
              accessibilityLabel="How to play"
              style={styles.howTo}
            >
              <Text style={styles.howToText}>How to play</Text>
            </Pressable>
            <Pressable
              onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}
              accessibilityRole="link"
              accessibilityLabel="Privacy policy, opens in your browser"
              style={styles.howTo}
            >
              <Text style={styles.howToText}>Privacy</Text>
            </Pressable>
          </View>

          {!SUPABASE_CONFIGURED && (
            <Text style={styles.configNotice}>
              Add Supabase env vars to .env.local to enable multiplayer.
            </Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    flex: { flex: 1 },
    stretch: { alignSelf: "stretch" },
    blobCircle: {
      position: "absolute",
      width: 220,
      height: 220,
      borderRadius: 110,
      borderWidth: OUTLINE,
      borderColor: p.line,
      top: -70,
      left: -80,
    },
    blobSquare: {
      position: "absolute",
      width: 120,
      height: 120,
      borderRadius: 28,
      borderWidth: OUTLINE,
      borderColor: p.line,
      top: 230,
      right: -40,
      transform: [{ rotate: "18deg" }],
    },
    // Plain top-to-bottom flow: no stretchy spacer, so nothing depends on the scroll height.
    body: {
      paddingHorizontal: spacing.screen,
      paddingTop: 8,
      paddingBottom: 24,
      gap: 16,
    },
    topBar: { alignItems: "flex-end" },
    hero: { alignItems: "flex-start", gap: 14, marginTop: 20, marginBottom: 20 },
    wordmarkWrap: { transform: [{ rotate: "-4deg" }] },
    wordmark: { paddingHorizontal: 24, paddingBottom: 8, paddingTop: 2 },
    wordmarkText: { fontFamily: fonts.black, fontSize: 84, lineHeight: 96, letterSpacing: -3 },
    tagline: { fontFamily: fonts.bold, fontSize: 19, lineHeight: 24, color: p.ink, maxWidth: 270, marginLeft: 6 },
    nameCard: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 12 },
    nameLabel: { color: p.muted },
    nameInput: { fontFamily: fonts.bold, fontSize: 22, color: p.ink, paddingVertical: 2, paddingHorizontal: 0 },
    errorText: { ...type.bodyBold, color: p.danger, textAlign: "center" },
    joinCard: { alignItems: "center", gap: 12, padding: 16 },
    joinInput: {
      alignSelf: "stretch",
      height: 60,
      borderRadius: radius.md,
      borderWidth: OUTLINE,
      borderColor: p.line,
      backgroundColor: p.isDark ? p.disabled : p.yellow,
      textAlign: "center",
      fontFamily: fonts.black,
      fontSize: 28,
      letterSpacing: 10,
      color: p.ink,
    },
    cancel: { paddingVertical: 6, paddingHorizontal: 12 },
    cancelText: { fontFamily: fonts.bold, fontSize: 16, color: p.muted },
    links: { flexDirection: "row", justifyContent: "center", gap: 8 },
    howTo: { paddingVertical: 10, paddingHorizontal: 12 },
    howToText: {
      fontFamily: fonts.bold,
      fontSize: 17,
      color: p.ink,
      textDecorationLine: "underline",
    },
    configNotice: { ...type.small, fontSize: 12, color: p.muted, textAlign: "center" },
  });
