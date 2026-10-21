import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Animated, AppState, BackHandler, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { playSound } from '../../src/audio/sounds';
import { CategoryScreen, CategorySummary } from '../../src/components/CategoryScreen';
import { DescriptionFeed } from '../../src/components/DescriptionFeed';
import { LeaveGameDialog } from '../../src/components/LeaveGame';
import { Pressable } from '../../src/components/Pressable';
import { TimerBar } from '../../src/components/TimerBar';
import {
  Eyebrow,
  IconButton,
  OUTLINE,
  Pill,
  Screen,
  ScreenBody,
  Sticker,
  StickerButton,
  useShortScreen,
} from '../../src/components/ui';
import { CategoryName } from '../../src/components/CategoryName';
import {
  drawSoloRun,
  isSoloAnswer,
  SOLO_CLUE_SECONDS,
  SOLO_CLUES,
  SOLO_FULL_POINTS_BY,
  SOLO_LAST_CHANCE_SECONDS,
  SOLO_MAX_POINTS,
  SOLO_MAX_STARS,
  SOLO_RUN_LENGTHS,
  soloPercent,
  soloPoints,
  soloStars,
  type SoloLadder,
  type SoloRunLength,
} from '../../src/game/solo';
import { useLeaveWarning } from '../../src/hooks/useLeaveWarning';
import { useShakeAnimation } from '../../src/hooks/useShakeAnimation';
import type { FeedEntry } from '../../src/supabase/room';
import type { RoomPlayer } from '../../src/store/gameStore';
import { useSettingsStore } from '../../src/store/settingsStore';
import { fonts, radius, spacing, type, useStyles, useTheme, type Palette } from '../../src/theme';

/** One finished word: the clues it took, or null if they didn't get it. */
type WordResult = { ladder: SoloLadder; cluesUsed: number | null };

type State = {
  run: SoloLadder[];
  index: number;
  /** Clues on screen for the current word. */
  shown: number;
  feed: FeedEntry[];
  /** When the next clue appears (or, after the last one, when the word is lost). */
  deadline: number;
  /** `setup`: picking how many rounds, before the first word. */
  phase: 'setup' | 'playing' | 'result' | 'done';
  results: WordResult[];
};

type Action =
  | { type: 'tick'; now: number }
  | { type: 'reveal'; now: number }
  | { type: 'guess'; text: string }
  | { type: 'giveUp' }
  | { type: 'next'; now: number }
  | { type: 'resume'; deadline: number }
  | { type: 'setup' }
  | { type: 'newRun'; run: SoloLadder[]; now: number };

const clueEntry = (text: string): FeedEntry => ({ kind: 'word', text, by: 'clue' });

const SETUP: State = { run: [], index: 0, shown: 0, feed: [], deadline: 0, phase: 'setup', results: [] };

function startWord(run: SoloLadder[], index: number, results: WordResult[], now: number): State {
  return {
    run,
    index,
    results,
    shown: 1,
    feed: [clueEntry(run[index].clues[0])],
    deadline: now + SOLO_CLUE_SECONDS * 1000,
    phase: 'playing',
  };
}

function finishWord(s: State, cluesUsed: number | null): State {
  return { ...s, phase: 'result', results: [...s.results, { ladder: s.run[s.index], cluesUsed }] };
}

function reveal(s: State, now: number): State {
  if (s.shown >= SOLO_CLUES) return finishWord(s, null);
  const shown = s.shown + 1;
  return {
    ...s,
    shown,
    feed: [...s.feed, clueEntry(s.run[s.index].clues[shown - 1])],
    deadline: now + (shown === SOLO_CLUES ? SOLO_LAST_CHANCE_SECONDS : SOLO_CLUE_SECONDS) * 1000,
  };
}

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'tick':
      return s.phase === 'playing' && a.now >= s.deadline ? reveal(s, a.now) : s;
    case 'reveal':
      return s.phase === 'playing' ? reveal(s, a.now) : s;
    case 'guess': {
      if (s.phase !== 'playing') return s;
      const correct = isSoloAnswer(a.text, s.run[s.index]);
      const next = { ...s, feed: [...s.feed, { kind: 'guess' as const, text: a.text, by: 'me', correct }] };
      return correct ? finishWord(next, s.shown) : next;
    }
    case 'giveUp':
      return s.phase === 'playing' ? finishWord(s, null) : s;
    case 'next':
      if (s.phase !== 'result') return s;
      return s.index + 1 < s.run.length ? startWord(s.run, s.index + 1, s.results, a.now) : { ...s, phase: 'done' };
    case 'resume':
      return s.phase === 'playing' ? { ...s, deadline: a.deadline } : s;
    case 'setup':
      return s.phase === 'done' ? SETUP : s;
    case 'newRun':
      return startWord(a.run, 0, [], a.now);
  }
}

const score = (results: WordResult[]) =>
  results.reduce((sum, r) => sum + (r.cluesUsed ? soloPoints(r.cluesUsed) : 0), 0);

export default function SoloScreen() {
  const styles = useStyles(makeStyles);
  const p = useTheme();
  const short = useShortScreen();
  const [state, dispatch] = useReducer(reducer, SETUP);
  const [now, setNow] = useState(() => Date.now());
  const [guess, setGuess] = useState('');
  const [message, setMessage] = useState('');
  const soloLength = useSettingsStore((s) => s.soloLength);
  const soloBests = useSettingsStore((s) => s.soloBests);
  const soloCategories = useSettingsStore((s) => s.soloCategories);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  // The best score before this run, so the summary can say whether it's a new best.
  const [bestBefore, setBestBefore] = useState(0);
  const { shakeAnim, shake } = useShakeAnimation();

  const { run, index, shown, feed, deadline, phase, results } = state;
  const ladder = run[index];
  const total = score(results);

  // The clue clock stops while "Leave the game?" asks and while the app is in the background
  // (a call, a notification), so neither costs a clue. `clockLeft` holds the time that was
  // left on it. Refs, so the AppState listener always sees the current values.
  const [pauses, setPauses] = useState({ leave: false, away: false });
  const pausesRef = useRef(pauses);
  const deadlineRef = useRef(deadline);
  deadlineRef.current = deadline;
  const clockLeft = useRef(0);
  const leaveOpen = pauses.leave;
  const paused = pauses.leave || pauses.away;

  function pause(reason: 'leave' | 'away') {
    const current = pausesRef.current;
    if (current[reason]) return;
    if (!current.leave && !current.away) clockLeft.current = Math.max(0, deadlineRef.current - Date.now());
    pausesRef.current = { ...current, [reason]: true };
    setPauses(pausesRef.current);
  }

  function unpause(reason: 'leave' | 'away') {
    const current = pausesRef.current;
    if (!current[reason]) return;
    pausesRef.current = { ...current, [reason]: false };
    setPauses(pausesRef.current);
    if (!pausesRef.current.leave && !pausesRef.current.away) {
      const t = Date.now();
      dispatch({ type: 'resume', deadline: t + clockLeft.current });
      setNow(t);
    }
  }

  useEffect(() => {
    const sub = AppState.addEventListener('change', (status) => (status === 'active' ? unpause('away') : pause('away')));
    return () => sub.remove();
    // pause() and unpause() only use refs and setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The clue clock: a new clue when it runs out, and the word is lost after the last one.
  useEffect(() => {
    if (phase !== 'playing' || paused) return;
    const interval = setInterval(() => {
      const t = Date.now();
      setNow(t);
      dispatch({ type: 'tick', now: t });
    }, 250);
    return () => clearInterval(interval);
  }, [phase, paused]);

  // "Give up" takes a second tap within a few seconds, so a stray tap doesn't lose the word.
  const [confirmGiveUp, setConfirmGiveUp] = useState(false);
  useEffect(() => {
    if (!confirmGiveUp) return;
    const timer = setTimeout(() => setConfirmGiveUp(false), 3000);
    return () => clearTimeout(timer);
  }, [confirmGiveUp]);
  useEffect(() => setConfirmGiveUp(false), [index, phase]);

  function giveUp() {
    if (!confirmGiveUp) {
      setConfirmGiveUp(true);
      return;
    }
    setConfirmGiveUp(false);
    dispatch({ type: 'giveUp' });
  }

  // A new clue pops in with a sound (the first one arrives with the word).
  useEffect(() => {
    if (phase === 'playing' && shown > 1) playSound('pop');
  }, [shown, phase]);

  useEffect(() => {
    if (phase === 'result') playSound(results[results.length - 1]?.cluesUsed ? 'win' : 'lose');
    if (phase === 'done') {
      playSound('gameOver');
      useSettingsStore.getState().recordSoloScore(run.length as SoloRunLength, total);
    }
    // Only when the phase changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // This run's words count as played, so the next run picks others.
  useEffect(() => {
    if (run.length) useSettingsStore.getState().markSoloWordsPlayed(run.map((l) => l.id));
  }, [run]);

  const players = useMemo<Record<string, RoomPlayer>>(
    () => ({
      clue: { uid: 'clue', name: 'Clue', avatarColor: p.blue, role: 'knower', lastSeenAt: 0 },
      me: { uid: 'me', name: 'You', avatarColor: p.coral, role: 'guesser', lastSeenAt: 0 },
    }),
    [p.blue, p.coral],
  );

  function submitGuess() {
    const text = guess.trim().replace(/\s+/g, ' ');
    if (!text || phase !== 'playing') return;
    if (text.length > 40 || !/^[\p{L} '’-]+$/u.test(text)) {
      setMessage('Guess with words only: letters, up to 40.');
      return;
    }
    setGuess('');
    setMessage('');
    if (!isSoloAnswer(text, ladder)) {
      shake();
      setMessage('Not it! Keep guessing.');
    }
    dispatch({ type: 'guess', text });
  }

  function nextWord() {
    setMessage('');
    setGuess('');
    dispatch({ type: 'next', now: Date.now() });
  }

  function startRun() {
    const { soloLength: length, soloBests: bests, soloRecent, soloCategories } = useSettingsStore.getState();
    setBestBefore(bests[length]);
    setMessage('');
    setGuess('');
    dispatch({ type: 'newRun', run: drawSoloRun(length, soloRecent, soloCategories), now: Date.now() });
  }

  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const askLeave = () => pause('leave');
  const stay = () => unpause('leave');

  // Android back asks first instead of dropping out of the run; on the web, closing or
  // reloading the tab asks too.
  const inRun = phase === 'playing' || phase === 'result';
  useLeaveWarning(inRun);
  useEffect(() => {
    if (!inRun || Platform.OS === 'web') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      askLeave();
      return true;
    });
    return () => sub.remove();
  });

  const picker = (
    <RoundsPicker value={soloLength} bests={soloBests} onChange={(n) => useSettingsStore.getState().setSoloLength(n)} />
  );

  if (phase === 'setup') {
    return (
      <Screen>
        <ScrollView contentContainerStyle={styles.summary}>
          <View style={styles.topRow}>
            <Text style={styles.title} accessibilityRole="header">Play solo</Text>
            <IconButton icon="x" onPress={leave} accessibilityLabel="Back to Home" />
          </View>
          <Sticker radius={22} offset={5} contentStyle={styles.howCard}>
            <Text style={styles.howText}>
              Clues appear one word at a time, from vague to obvious. Guess the secret word early for more points.
            </Text>
            <View style={styles.howStars}>
              <Stars count={3} size={18} />
              <Text style={styles.howSmall}>
                By clue {SOLO_FULL_POINTS_BY}: full {SOLO_MAX_POINTS} points. Later clues score less.
              </Text>
            </View>
          </Sticker>
          <Eyebrow>How many rounds?</Eyebrow>
          {picker}
          <Eyebrow>Categories</Eyebrow>
          <CategorySummary pick={soloCategories} onPress={() => setCategoriesOpen(true)} />
          <CategoryScreen
            visible={categoriesOpen}
            pick={soloCategories}
            note="Pick the kinds of words you want. Your choice is kept for next time."
            onDone={(pick) => useSettingsStore.getState().setSoloCategories(pick)}
            onClose={() => setCategoriesOpen(false)}
          />
          <StickerButton label={`Start ${soloLength} rounds`} icon="play" onPress={startRun} />
        </ScrollView>
      </Screen>
    );
  }

  if (phase === 'done') {
    const length = run.length as SoloRunLength;
    const best = Math.max(bestBefore, total);
    const stars = results.reduce((sum, r) => sum + soloStars(r.cluesUsed), 0);
    return (
      <Screen>
        <ScrollView contentContainerStyle={styles.summary}>
          <View style={styles.topRow}>
            <Text style={styles.title} accessibilityRole="header">Run complete</Text>
            <IconButton icon="x" onPress={leave} accessibilityLabel="Back to Home" />
          </View>
          <Sticker bg={p.hero} shadow={p.coral} radius={24} offset={5} contentStyle={styles.totalCard}>
            <Eyebrow style={{ color: p.heroAccent }}>Your score</Eyebrow>
            <Text style={styles.total} accessibilityLabel={`${soloPercent(total, length)} percent`}>
              {soloPercent(total, length)}
              <Text style={styles.totalOf}>%</Text>
            </Text>
            <View style={styles.starTotal}>
              <MaterialCommunityIcons name="star" size={22} color={p.heroAccent} />
              <Text style={[styles.starTotalText, { color: p.onHero }]}>
                {stars} of {length * SOLO_MAX_STARS} stars
              </Text>
            </View>
            <Text style={[styles.best, { color: p.heroAccent }]}>
              {stars === length * SOLO_MAX_STARS
                ? `Perfect run! Every word by clue ${SOLO_FULL_POINTS_BY}.`
                : total > bestBefore && bestBefore > 0
                  ? 'New best score!'
                  : `Best for ${length} rounds: ${soloPercent(best, length)}%`}
            </Text>
          </Sticker>
          <RunWords results={results} />
          <StickerButton label="Play again" icon="refresh-cw" onPress={startRun} />
          <StickerButton
            label="Change rounds or categories"
            icon="sliders"
            variant="card"
            height={52}
            fontSize={17}
            onPress={() => dispatch({ type: 'setup' })}
          />
          <StickerButton label="Home" variant="card" height={52} fontSize={18} onPress={() => router.replace('/')} />
        </ScrollView>
      </Screen>
    );
  }

  const last = results[results.length - 1];
  const finalClue = shown === SOLO_CLUES;
  const secondsLeft = Math.max(0, Math.ceil((deadline - now) / 1000));

  return (
    <Screen>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScreenBody style={styles.body}>
          <View style={styles.topRow}>
            <View style={styles.pills}>
              <Pill label={`Round ${index + 1} / ${run.length}`} />
              <Pill label={`${total} pts`} bg={p.coral} fg={p.onCoral} />
            </View>
            <IconButton icon="x" onPress={askLeave} accessibilityLabel="Stop playing" />
          </View>

          <View style={styles.categoryBlock}>
            {!short && <Eyebrow>The category is</Eyebrow>}
            <CategoryName
              category={ladder.category}
              style={[styles.category, short && styles.categoryCompact, ladder.category.length > 9 && styles.categoryLong]}
              adjustsFontSizeToFit
              numberOfLines={1}
            />
          </View>

          {phase === 'result' && last ? (
            <>
              <WordReveal result={last} />
              {results.length > 1 && (
                <View style={styles.earlier}>
                  <Eyebrow>Earlier this run</Eyebrow>
                  <RunWords results={results.slice(0, -1)} />
                </View>
              )}
            </>
          ) : (
            <Sticker style={[styles.feedWrap, short && styles.feedWrapCompact]} radius={26} offset={6} contentStyle={styles.feedCard}>
              <View style={styles.feedTop}>
                <Eyebrow>Clue {shown} of {SOLO_CLUES}</Eyebrow>
                <View style={styles.worthRow}>
                  <Stars count={soloStars(shown)} size={16} />
                  <Text style={styles.worth}>{soloPoints(shown)} pts</Text>
                </View>
              </View>
              <DescriptionFeed entries={feed} players={players} large style={styles.flex} />
              <View style={styles.clock}>
                <TimerBar
                  key={`${index}-${shown}`}
                  durationSeconds={finalClue ? SOLO_LAST_CHANCE_SECONDS : SOLO_CLUE_SECONDS}
                  secondsRemaining={secondsLeft}
                />
                <Text style={[styles.clockText, finalClue && { color: p.danger }]} accessibilityLiveRegion="polite">
                  {finalClue ? 'Last clue! Get it before time runs out' : 'Next clue on its way'}
                </Text>
              </View>
            </Sticker>
          )}
        </ScreenBody>

        <View style={styles.footer}>
          {phase === 'result' ? (
            <StickerButton
              label={index + 1 < run.length ? 'Next word' : 'See your score'}
              icon="arrow-right"
              variant="blue"
              onPress={nextWord}
            />
          ) : (
            <>
              {message !== '' && (
                <Text style={styles.message} accessibilityLiveRegion="assertive">
                  {message}
                </Text>
              )}
              <Animated.View style={[styles.guessRow, { transform: [{ translateX: shakeAnim }] }]}>
                <TextInput
                  style={styles.guessInput}
                  value={guess}
                  onChangeText={(t) => {
                    setGuess(t);
                    if (message) setMessage('');
                  }}
                  placeholder="What's the secret word?"
                  placeholderTextColor={p.muted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="send"
                  onSubmitEditing={submitGuess}
                  blurOnSubmit={false}
                  maxLength={40}
                  accessibilityLabel="Your guess"
                />
                <Pressable
                  onPress={submitGuess}
                  disabled={!guess.trim()}
                  accessibilityRole="button"
                  accessibilityLabel="Submit guess"
                  accessibilityState={{ disabled: !guess.trim() }}
                  style={[styles.submit, !guess.trim() && styles.submitDisabled]}
                >
                  <Feather name="check" size={28} color={guess.trim() ? p.onCoral : p.onDisabled} />
                </Pressable>
              </Animated.View>
              <View style={styles.helpRow}>
                <Pressable
                  onPress={() => dispatch({ type: 'reveal', now: Date.now() })}
                  disabled={finalClue}
                  accessibilityRole="button"
                  accessibilityLabel={`Show the next clue now. The word will be worth ${soloPoints(shown + 1)} points and ${soloStars(shown + 1)} stars.`}
                  style={[styles.helpButton, finalClue && styles.helpDisabled]}
                >
                  <Feather name="plus" size={16} color={p.ink} />
                  <Text style={styles.helpText}>Next clue now</Text>
                </Pressable>
                <Pressable
                  onPress={giveUp}
                  accessibilityRole="button"
                  accessibilityLabel={confirmGiveUp ? 'Tap again to give up this word' : 'Give up this word'}
                  style={styles.giveUp}
                >
                  <Text style={[styles.giveUpText, confirmGiveUp && { color: p.danger }]}>
                    {confirmGiveUp ? 'Tap again to give up' : 'Give up'}
                  </Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
      <LeaveGameDialog
        visible={leaveOpen}
        onLeave={leave}
        onStay={stay}
        body="You’ll lose this run’s score. The clock is paused while you decide."
      />
    </Screen>
  );
}

/** After a word: what it was, what it scored, and the whole ladder with the clues used marked. */
function WordReveal({ result }: { result: WordResult }) {
  const styles = useStyles(makeStyles);
  const p = useTheme();
  const { ladder, cluesUsed } = result;
  return (
    <View style={styles.reveal}>
      <Sticker bg={p.hero} shadow={cluesUsed ? p.blue : p.coral} radius={24} offset={5} contentStyle={styles.revealCard}>
        <Eyebrow style={{ color: p.heroAccent }}>{cluesUsed ? 'Got it!' : 'The word was'}</Eyebrow>
        <Text style={styles.revealWord} adjustsFontSizeToFit numberOfLines={1}>
          {ladder.word}
        </Text>
        {cluesUsed !== null && (
          <Stars count={soloStars(cluesUsed)} size={30} fill={p.heroAccent} empty={p.heroAccent} />
        )}
        <Text style={[styles.revealPts, { color: p.heroAccent }]}>
          {cluesUsed
            ? `+${soloPoints(cluesUsed)} points on clue ${cluesUsed}`
            : 'No points this time'}
        </Text>
      </Sticker>
      <View style={styles.ladder} accessibilityLabel={`All the clues: ${ladder.clues.join(', ')}`}>
        {ladder.clues.map((c, i) => {
          const used = cluesUsed !== null && i < cluesUsed;
          return (
            <View key={c} style={[styles.rung, used && styles.rungUsed]}>
              <Text style={[styles.rungNum, used && { color: p.onBlue }]}>{i + 1}</Text>
              <Text style={[styles.rungText, used && { color: p.onBlue }]}>{c}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/**
 * A word's stars, out of 3. On the cards they're yellow with the stickers' outline; on the dark
 * hero card, `fill` and `empty` colour them instead.
 */
function Stars({ count, size = 20, fill, empty }: { count: number; size?: number; fill?: string; empty?: string }) {
  const p = useTheme();
  return (
    <View
      style={{ flexDirection: 'row', gap: size / 8 }}
      accessible
      accessibilityLabel={`${count} of ${SOLO_MAX_STARS} stars`}
    >
      {Array.from({ length: SOLO_MAX_STARS }, (_, i) =>
        i < count ? (
          <View key={i} style={{ width: size, height: size }}>
            <MaterialCommunityIcons name="star" size={size} color={fill ?? p.yellow} />
            {!fill && (
              <MaterialCommunityIcons name="star-outline" size={size} color={p.line} style={StyleSheet.absoluteFill} />
            )}
          </View>
        ) : (
          <MaterialCommunityIcons key={i} name="star-outline" size={size} color={empty ?? p.muted} />
        ),
      )}
    </View>
  );
}

/** 5 or 10 rounds, each with its best score so far. */
function RoundsPicker({
  value,
  bests,
  onChange,
}: {
  value: SoloRunLength;
  bests: Record<SoloRunLength, number>;
  onChange: (length: SoloRunLength) => void;
}) {
  const styles = useStyles(makeStyles);
  const p = useTheme();
  return (
    <View style={styles.picker} accessibilityRole="radiogroup" accessibilityLabel="Rounds">
      {SOLO_RUN_LENGTHS.map((n) => {
        const on = n === value;
        const fg = on ? p.onBlue : p.ink;
        return (
          <Pressable
            key={n}
            onPress={() => onChange(n)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={`${n} rounds${bests[n] ? `, best score ${soloPercent(bests[n], n)} percent` : ''}`}
            style={[styles.option, on && styles.optionOn]}
          >
            <Text style={[styles.optionNum, { color: fg }]}>{n}</Text>
            <Text style={[styles.optionLabel, { color: fg }]}>rounds</Text>
            <Text style={[styles.optionBest, { color: on ? p.onBlue : p.muted }]}>
              {bests[n] ? `Best ${soloPercent(bests[n], n)}%` : n === 5 ? 'Quick game' : 'Full run'}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The run's words in order, each with what it scored. */
function RunWords({ results }: { results: WordResult[] }) {
  const styles = useStyles(makeStyles);
  return (
    <Sticker radius={22} offset={5} contentStyle={styles.breakdown}>
      {results.map((r, i) => (
        <View key={r.ladder.id} style={[styles.resultRow, i > 0 && styles.resultDivider]}>
          <Text style={styles.resultNum}>{i + 1}</Text>
          <Text style={styles.resultWord} numberOfLines={1}>{r.ladder.word}</Text>
          {r.cluesUsed ? <Stars count={soloStars(r.cluesUsed)} size={16} /> : null}
          <Text style={[styles.resultPts, !r.cluesUsed && styles.resultMissed]}>
            {r.cluesUsed ? `+${soloPoints(r.cluesUsed)}` : 'missed'}
          </Text>
        </View>
      ))}
    </Sticker>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    flex: { flex: 1 },
    earlier: { gap: 8 },
    howCard: { padding: 16, gap: 6 },
    howText: { ...type.bodyBold, color: p.ink },
    howSmall: { ...type.small, color: p.muted, flexShrink: 1 },
    howStars: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    worthRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    starTotal: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    starTotalText: { fontFamily: fonts.black, fontSize: 18 },
    picker: { flexDirection: 'row', gap: 12 },
    option: {
      flex: 1,
      alignItems: 'center',
      gap: 2,
      paddingVertical: 14,
      borderWidth: OUTLINE,
      borderColor: p.line,
      borderRadius: radius.lg,
      backgroundColor: p.card,
    },
    optionOn: { backgroundColor: p.blue },
    optionNum: { fontFamily: fonts.black, fontSize: 40, lineHeight: 44 },
    optionLabel: { fontFamily: fonts.bold, fontSize: 16 },
    optionBest: { fontFamily: fonts.bold, fontSize: 13 },
    body: { paddingHorizontal: spacing.screen, paddingTop: 10, gap: 14 },
    topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    pills: { flexDirection: 'row', gap: 8, flexShrink: 1, flexWrap: 'wrap' },
    title: { fontFamily: fonts.black, fontSize: 30, color: p.ink },
    categoryBlock: { alignItems: 'center', gap: 2 },
    category: { fontFamily: fonts.black, fontSize: 44, lineHeight: 50, letterSpacing: -1.2, color: p.ink },
    categoryCompact: { fontSize: 32, lineHeight: 38 },
    // "🏠 Around the House": the web can't shrink text to fit, so size long labels down.
    categoryLong: { fontSize: 30, lineHeight: 36, letterSpacing: -0.8 },
    feedWrap: { flex: 1, minHeight: 200 },
    feedWrapCompact: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', minHeight: 0, height: 190 },
    feedCard: { flex: 1, paddingVertical: 14, paddingHorizontal: 14, gap: 10 },
    feedTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    worth: { fontFamily: fonts.black, fontSize: 15, color: p.ink },
    clock: { gap: 6 },
    clockText: { fontFamily: fonts.bold, fontSize: 14, color: p.muted, textAlign: 'center' },
    footer: { paddingHorizontal: spacing.screen, paddingTop: 12, paddingBottom: 14, gap: 10 },
    message: { ...type.bodyBold, color: p.danger, textAlign: 'center' },
    guessRow: { flexDirection: 'row', gap: 10 },
    guessInput: {
      flex: 1,
      height: 60,
      borderRadius: radius.md + 2,
      borderWidth: OUTLINE,
      borderColor: p.line,
      backgroundColor: p.card,
      paddingHorizontal: 18,
      fontFamily: fonts.bold,
      fontSize: 20,
      color: p.ink,
    },
    submit: {
      width: 60,
      height: 60,
      borderRadius: radius.md + 2,
      borderWidth: OUTLINE,
      borderColor: p.line,
      backgroundColor: p.coral,
      alignItems: 'center',
      justifyContent: 'center',
    },
    submitDisabled: { backgroundColor: p.disabled },
    helpRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    helpButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderWidth: 2.5,
      borderColor: p.line,
      borderRadius: 999,
      backgroundColor: p.card,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    helpDisabled: { opacity: 0.4 },
    helpText: { fontFamily: fonts.bold, fontSize: 15, color: p.ink },
    giveUp: { paddingHorizontal: 10, paddingVertical: 8 },
    giveUpText: { fontFamily: fonts.bold, fontSize: 15, color: p.ink, textDecorationLine: 'underline' },
    reveal: { gap: 16 },
    revealCard: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 16, gap: 4, alignItems: 'center' },
    revealWord: { fontFamily: fonts.black, fontSize: 46, lineHeight: 52, letterSpacing: -1.2, color: p.onHero },
    revealPts: { fontFamily: fonts.bold, fontSize: 17 },
    ladder: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
    rung: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderWidth: 2.5,
      borderColor: p.line,
      borderRadius: radius.sm,
      backgroundColor: p.card,
      paddingLeft: 8,
      paddingRight: 11,
      paddingVertical: 4,
    },
    rungUsed: { backgroundColor: p.blue },
    rungNum: { fontFamily: fonts.black, fontSize: 13, color: p.muted },
    rungText: { fontFamily: fonts.bold, fontSize: 18, color: p.ink },
    summary: { paddingHorizontal: spacing.screen, paddingTop: 12, paddingBottom: 24, gap: 16 },
    totalCard: { padding: 18, alignItems: 'center', gap: 2 },
    total: { fontFamily: fonts.black, fontSize: 64, lineHeight: 70, color: p.onHero },
    totalOf: { fontSize: 26, color: p.onHero },
    best: { fontFamily: fonts.bold, fontSize: 17 },
    breakdown: { paddingHorizontal: 16, paddingVertical: 6 },
    resultRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
    resultDivider: { borderTopWidth: 2, borderTopColor: p.divider },
    resultNum: { fontFamily: fonts.black, fontSize: 15, color: p.muted, width: 22 },
    resultWord: { flex: 1, fontFamily: fonts.bold, fontSize: 18, color: p.ink },
    resultPts: { fontFamily: fonts.black, fontSize: 18, color: p.ink },
    resultMissed: { fontFamily: fonts.bold, fontSize: 15, color: p.muted },
  });
