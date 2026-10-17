import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  BackHandler,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { PoweredBy } from "../src/components/PoweredBy";
import { Pressable } from "../src/components/Pressable";
import { SoundToggles } from "../src/components/SoundToggles";
import { Avatar, Eyebrow, IconButton, OUTLINE, Screen, Sticker, StickerButton } from "../src/components/ui";
import { errorText } from "../src/lib/errorText";
import { loadLatestApp } from "../src/lib/loadLatestApp";
import { PRIVACY_POLICY_URL } from "../src/lib/links";
import { SUPABASE_CONFIGURED } from "../src/supabase/config";
import { generateRoomCode } from "../src/lib/roomCode";
import { useGameStore } from "../src/store/gameStore";
import { usePlayerStore } from "../src/store/playerStore";
import { useSettingsStore } from "../src/store/settingsStore";
import { fonts, radius, spacing, type, useStyles, useTheme, type Palette } from "../src/theme";

export default function HomeScreen() {
  const styles = useStyles(makeStyles);
  const p = useTheme();
  const { name, setName, avatarColor, setUid } = usePlayerStore();
  const { setRoomCode, setIsHost } = useGameStore();

  const [joinCode, setJoinCode] = useState("");
  // The code an invite link filled in, so a join with it counts as "via link".
  const [linkCode, setLinkCode] = useState("");
  const [showJoin, setShowJoin] = useState(false);
  // Home offers Play with friends and Play online; Play with friends opens Create game / Join with a code.
  const [localPlay, setLocalPlay] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [matching, setMatching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showNotice, setShowNotice] = useState(false);
  const { onlineNoticeSeen, markOnlineNoticeSeen } = useSettingsStore();

  // Invite links (/?room=ABCD, or /join/ABCD which redirects here) open the Join form with
  // the code filled in. Only the web app gets these links.
  const { room } = useLocalSearchParams<{ room?: string }>();
  useEffect(() => {
    const code = (typeof room === "string" ? room : "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (code.length !== 4) return;
    setJoinCode(code);
    setLinkCode(code);
    setLocalPlay(true);
    setShowJoin(true);
  }, [room]);

  // First launch: play the demo before Home, unless an invite link brought them here to join.
  const [settingsLoaded, setSettingsLoaded] = useState(() => useSettingsStore.persist.hasHydrated());
  useEffect(() => useSettingsStore.persist.onFinishHydration(() => setSettingsLoaded(true)), []);
  useEffect(() => {
    if (settingsLoaded && !useSettingsStore.getState().demoSeen && !room) router.replace("/demo");
    // Only on arrival: once the demo has run it marks itself seen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsLoaded]);

  // Android back steps out of Play with friends before leaving Home.
  useEffect(() => {
    if (!localPlay || Platform.OS === "web") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      closeLocalPlay();
      return true;
    });
    return () => sub.remove();
  }, [localPlay]);

  function closeLocalPlay() {
    setLocalPlay(false);
    setShowJoin(false);
    setJoinCode("");
    setError("");
  }

  const trimmedName = name.trim();
  const canProceed = trimmedName.length >= 2;

  async function getUid(): Promise<string | null> {
    if (!SUPABASE_CONFIGURED) return null;
    const { signInAnon } = await import("../src/supabase/auth");
    const uid = await signInAnon();
    setUid(uid);
    return uid;
  }

  /** The server rejects offensive names (migration 009); say so instead of a generic error. */
  function nameRejected(e: unknown): boolean {
    return e instanceof Error && e.message.includes("name not allowed");
  }

  // Sign-in blocked by the CAPTCHA check: show the reason so it can be reported.
  function captchaError(e: unknown): string | null {
    const message = e instanceof Error ? e.message : "";
    return message.startsWith("captcha")
      ? `Couldn’t confirm you’re a real player (${message}). Try again.`
      : null;
  }

  // Refresh (button or pull down): load a newer app version if one is out, otherwise sign in
  // again, which also recovers from a failed check on launch.
  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    setError("");
    try {
      if (await loadLatestApp()) return;
      await getUid();
    } catch (e) {
      setError(captchaError(e) ?? "Couldn’t connect. Check your connection and try again.");
      console.error(e);
    } finally {
      setRefreshing(false);
    }
  }

  function handlePlayOnline() {
    if (!canProceed) {
      setError("Enter your name first (2+ characters).");
      return;
    }
    if (!onlineNoticeSeen) {
      setShowNotice(true);
      return;
    }
    playOnline();
  }

  async function playOnline() {
    setError("");
    setMatching(true);
    try {
      const uid = await getUid();
      if (!uid) {
        setError("Online play needs Supabase configured.");
        return;
      }
      const { quickMatch } = await import("../src/supabase/room");
      const code = await quickMatch({
        uid,
        name: trimmedName,
        avatarColor,
        role: "knower",
        lastSeenAt: Date.now(),
      });
      setRoomCode(code);
      setIsHost(false); // the Lobby reads the real host from the room
      const { startPresence } = await import("../src/supabase/presence");
      startPresence(code, uid);
      router.push("/lobby");
    } catch (e) {
      setError(
        captchaError(e) ??
          (nameRejected(e)
            ? "That name isn’t allowed — please pick another."
            : "Couldn’t find a game. Check your connection and try again.")
      );
      console.error(e);
    } finally {
      setMatching(false);
    }
  }

  async function handleCreate() {
    if (!canProceed) {
      setError("Enter your name first (2+ characters).");
      return;
    }
    setError("");
    setLoading(true);
    try {
      let code = generateRoomCode();
      const uid = await getUid();
      if (uid) {
        const { createRoom } = await import("../src/supabase/room");
        const host = { uid, name: trimmedName, avatarColor, role: "knower" as const, lastSeenAt: Date.now() };
        // A code that's already in use comes back as taken: try a fresh one.
        for (let attempt = 1; !(await createRoom(code, host)); attempt++) {
          if (attempt === 3) throw new Error("no free room code");
          code = generateRoomCode();
        }
        const { startPresence } = await import("../src/supabase/presence");
        startPresence(code, uid);
      }
      setRoomCode(code);
      setIsHost(true);
      router.push("/lobby");
    } catch (e) {
      setError(
        captchaError(e) ??
          (nameRejected(e)
            ? "That name isn’t allowed — please pick another."
            : "Failed to create room. Check your connection.")
      );
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
        }, code === linkCode ? "link" : "code");
        const { startPresence } = await import("../src/supabase/presence");
        startPresence(code, uid);
      }
      router.push("/lobby");
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      if (captchaError(e)) {
        setError(captchaError(e)!);
      } else if (message.includes("not found")) {
        setError("No game found with that code — check it and try again.");
      } else if (message.includes("already started")) {
        setError("That game has already started.");
      } else if (message.includes("name not allowed")) {
        setError("That name isn’t allowed — please pick another.");
      } else if (message.includes("is full")) {
        setError("That room is already full.");
      } else if (message.includes("too many attempts")) {
        setError("Too many codes tried. Wait a while, then try again.");
      } else {
        setError("Failed to join room. Check the code and your connection.");
      }
      console.error(`Join failed: ${errorText(e)}`, e);
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
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={p.ink} colors={[p.coral]} />}
        >
          <View style={styles.topBar}>
            <IconButton icon="refresh-cw" onPress={refresh} accessibilityLabel="Refresh" />
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
            <Text style={styles.tagline} maxFontSizeMultiplier={1.3}>Describe it together. Guess the secret. Beat the clock.</Text>
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

          {localPlay ? (
            <>
              <Text style={styles.sectionTitle} accessibilityRole="header">Play with friends</Text>
              <StickerButton
                label={loading && !showJoin ? "Creating…" : "Create game"}
                onPress={handleCreate}
                disabled={!canProceed || loading || matching}
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

              <Pressable
                onPress={closeLocalPlay}
                accessibilityRole="button"
                accessibilityLabel="Back to Play with friends or Play online"
                style={styles.back}
              >
                <Text style={styles.cancelText}>Back</Text>
              </Pressable>
            </>
          ) : (
            <>
              <StickerButton
                label="Play with friends"
                icon="users"
                height={64}
                fontSize={22}
                onPress={() => {
                  setError("");
                  setLocalPlay(true);
                }}
                disabled={matching}
                accessibilityLabel="Play with friends: create a game or join one with a code"
              />

              <StickerButton
                label={matching ? "Finding a game…" : "Play online"}
                icon="globe"
                variant="blue"
                fontSize={20}
                onPress={handlePlayOnline}
                disabled={!canProceed || loading}
                loading={matching}
                accessibilityLabel="Play online with other players"
              />
            </>
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

          <PoweredBy />

          {!SUPABASE_CONFIGURED && (
            <Text style={styles.configNotice}>
              Add Supabase env vars to .env.local to enable multiplayer.
            </Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={showNotice} transparent animationType="fade" onRequestClose={() => setShowNotice(false)} statusBarTranslucent>
        <View style={styles.scrim}>
          <Sticker radius={24} offset={6} style={styles.stretch} contentStyle={styles.noticeCard}>
            <Text style={styles.noticeTitle} accessibilityRole="header">Playing online</Text>
            <Text style={styles.noticeItem}>• You’ll play with people you don’t know.</Text>
            <Text style={styles.noticeItem}>• Be kind. Offensive names and words are blocked.</Text>
            <Text style={styles.noticeItem}>• Don’t share personal info like your full name, age or where you live.</Text>
            <Text style={styles.noticeItem}>• Someone being nasty? Tap the flag next to their name to report them.</Text>
            <StickerButton
              label="Got it, let’s play"
              height={56}
              fontSize={19}
              onPress={() => {
                markOnlineNoticeSeen();
                setShowNotice(false);
                playOnline();
              }}
            />
            <Pressable onPress={() => setShowNotice(false)} accessibilityRole="button" style={styles.cancel}>
              <Text style={styles.cancelText}>Not now</Text>
            </Pressable>
          </Sticker>
        </View>
      </Modal>
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
    topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
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
    sectionTitle: { fontFamily: fonts.black, fontSize: 24, color: p.ink },
    back: { alignSelf: "center", paddingVertical: 6, paddingHorizontal: 12 },
    cancelText: { fontFamily: fonts.bold, fontSize: 16, color: p.muted },
    links: { flexDirection: "row", justifyContent: "center", gap: 8 },
    scrim: { flex: 1, backgroundColor: p.scrim, justifyContent: "center", padding: spacing.screen },
    noticeCard: { padding: 20, gap: 10 },
    noticeTitle: { fontFamily: fonts.black, fontSize: 26, color: p.ink },
    noticeItem: { ...type.body, color: p.ink },
    howTo: { paddingVertical: 10, paddingHorizontal: 12 },
    howToText: {
      fontFamily: fonts.bold,
      fontSize: 17,
      color: p.ink,
      textDecorationLine: "underline",
    },
    configNotice: { ...type.small, fontSize: 12, color: p.muted, textAlign: "center" },
  });
