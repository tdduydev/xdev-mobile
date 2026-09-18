import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { clearSavedQuizAttempt, getCachedQuiz, getSavedQuizAttempt, saveQuizAttempt } from '@/api/cache';
import type { QuizAttemptState, QuizDetail } from '@/api/schema';
import { EmptyState } from '@/components/empty-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import {
  createAttempt,
  formatRemaining,
  goToQuestion,
  isExpired,
  remainingSeconds,
  resumeOrCreateAttempt,
  setAnswer,
} from '@/content/quiz-attempt';
import { groupResultsByDomain, scoreQuiz, type QuizResult } from '@/content/quiz-scoring';

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

// Same string-matching coupling to client.ts's error shape as
// post/[slug].tsx's own isNotFoundError — a deep link or stale list item can
// point at a slug the API no longer has.
function isNotFoundError(error: Error): boolean {
  return /-> HTTP 404\b/.test(error.message);
}

// Derived the same way as content.tsx's IndexSnapshot and post/[slug].tsx's
// MarkdownSnapshot: `isLoading`/`quiz`/`error` compare `snapshot.slug`
// against the current route param at render time, rather than being set
// synchronously inside the loading effect (`react-hooks/set-state-in-effect`
// — see content.tsx's doc comment). `attempt` is deliberately NOT folded
// into this snapshot: once loaded it is mutated on every answer/navigation
// via plain event-handler `setState` calls, which this tagged/derived shape
// would only get in the way of.
type QuizDetailSnapshot = {
  slug: string;
  quiz: QuizDetail | null;
  error: Error | null;
};

export default function QuizScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();

  const [snapshot, setSnapshot] = useState<QuizDetailSnapshot | null>(null);
  const [attempt, setAttempt] = useState<QuizAttemptState | null>(null);
  const [manualResult, setManualResult] = useState<QuizResult | null>(null);
  // A tick counter, not tied to any persisted state — re-rendering every
  // second is all this needs to keep the displayed countdown and the
  // derived `isTimeUp` check below current. The actual deadline lives in
  // `attempt.deadlineMs` (an absolute timestamp), so this can be thrown away
  // and recreated freely without losing anything.
  const [now, setNow] = useState(() => Date.now());

  const isCurrent = snapshot !== null && snapshot.slug === slug;
  const isLoading = !isCurrent;
  const quiz = isCurrent ? snapshot.quiz : null;
  const loadError = isCurrent ? snapshot.error : null;

  const load = useCallback(() => {
    Promise.all([getCachedQuiz(slug), getSavedQuizAttempt(slug)])
      .then(([quizDetail, saved]) => {
        setSnapshot({ slug, quiz: quizDetail, error: null });
        setAttempt(resumeOrCreateAttempt(quizDetail, saved, Date.now()));
        setManualResult(null);
      })
      .catch((err) => setSnapshot({ slug, quiz: null, error: toError(err) }));
  }, [slug]);

  // The mount/slug-change load, with the `cancelled` guard `load` above (a
  // retry-button handler) doesn't need — same split as content.tsx's
  // series-loading effect vs its `refreshSeries` retry handler.
  useEffect(() => {
    let cancelled = false;
    Promise.all([getCachedQuiz(slug), getSavedQuizAttempt(slug)])
      .then(([quizDetail, saved]) => {
        if (cancelled) return;
        setSnapshot({ slug, quiz: quizDetail, error: null });
        setAttempt(resumeOrCreateAttempt(quizDetail, saved, Date.now()));
        setManualResult(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setSnapshot({ slug, quiz: null, error: toError(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Derived at render time, never set via an effect: this is what lets time
  // running out auto-submit with no extra `setState` call in an effect body
  // (which `react-hooks/set-state-in-effect` would flag). It also makes
  // resuming an attempt whose deadline already passed while the app was
  // closed land straight on the result screen for free — `now` (read at
  // this render) is already past a `deadlineMs` loaded from storage.
  const isTimeUp = attempt !== null && isExpired(attempt, now);
  const result =
    manualResult ?? (quiz && attempt && isTimeUp ? scoreQuiz(quiz.questions, attempt.answers, quiz.passing_score) : null);
  const hasResult = result !== null;
  const hasAttempt = attempt !== null;

  // Ticks `now` once a second while an exam is in progress, so the
  // countdown display and `isTimeUp` above stay live. Depends on booleans,
  // not on `attempt`/`result` themselves, so answering a question or moving
  // between questions (both of which replace `attempt` with a new object)
  // doesn't tear down and restart the interval on every interaction.
  useEffect(() => {
    if (!hasAttempt || hasResult) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [hasAttempt, hasResult]);

  // Persists on every answer/navigation change — not on unmount, since
  // exiting the app via the OS never runs a cleanup function (spec
  // requirement: "thoát giữa chừng rồi quay lại không được mất bài").
  useEffect(() => {
    if (attempt === null || hasResult) return;
    saveQuizAttempt(attempt).catch(() => {});
  }, [attempt, hasResult]);

  // Time running out is the one "finish" path with no event handler to
  // clear the saved attempt from inside (unlike the manual Submit button
  // below) — this side effect doesn't call any React state setter, so it
  // isn't the pattern `react-hooks/set-state-in-effect` is about.
  useEffect(() => {
    if (isTimeUp) clearSavedQuizAttempt(slug).catch(() => {});
  }, [isTimeUp, slug]);

  const selectOption = (optionIndex: number) => {
    setAttempt((prev) => (prev ? setAnswer(prev, prev.currentIndex, optionIndex) : prev));
  };

  const goPrev = () => {
    if (!quiz) return;
    setAttempt((prev) => (prev ? goToQuestion(prev, prev.currentIndex - 1, quiz.questions.length) : prev));
  };

  const goNext = () => {
    if (!quiz) return;
    setAttempt((prev) => (prev ? goToQuestion(prev, prev.currentIndex + 1, quiz.questions.length) : prev));
  };

  const submit = () => {
    if (!quiz || !attempt) return;
    setManualResult(scoreQuiz(quiz.questions, attempt.answers, quiz.passing_score));
    clearSavedQuizAttempt(slug).catch(() => {});
  };

  const retake = () => {
    if (!quiz) return;
    setAttempt(createAttempt(quiz, Date.now()));
    setManualResult(null);
  };

  if (isLoading) {
    return (
      <ThemedView style={styles.centerFill}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  if (loadError || !quiz) {
    return (
      <SafeAreaView style={styles.flex} edges={['top']}>
        <EmptyState
          title={loadError && isNotFoundError(loadError) ? 'Quiz not found' : "Couldn't load this quiz"}
          message={
            loadError && isNotFoundError(loadError)
              ? "This quiz isn't available on the server anymore."
              : 'Check your connection and try again.'
          }
          onRetry={load}
        />
      </SafeAreaView>
    );
  }

  if (!attempt) {
    return (
      <ThemedView style={styles.centerFill}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  if (result) {
    const domainBreakdown = groupResultsByDomain(quiz.questions, result.perQuestion);
    return (
      <>
        <Stack.Screen options={{ headerTitle: quiz.title }} />
        <SafeAreaView style={styles.flex} edges={['bottom']}>
          <FlatList
            data={result.perQuestion}
            keyExtractor={(item) => String(quiz.questions[item.questionIndex].id)}
            contentContainerStyle={styles.resultList}
            ListHeaderComponent={
              <View style={styles.resultHeader}>
                <ThemedText type="title">{result.scorePercent}%</ThemedText>
                <ThemedText type="subtitle">
                  {result.passed ? 'Đạt' : 'Chưa đạt'} — {result.correctCount}/{result.totalCount} câu đúng (cần đạt{' '}
                  {quiz.passing_score}%)
                </ThemedText>
                {domainBreakdown.length > 0 && (
                  <View style={styles.domainList}>
                    {domainBreakdown.map((domain) => (
                      <ThemedText key={domain.domain} type="small" themeColor="textSecondary">
                        {domain.domain}: {domain.correct}/{domain.total}
                      </ThemedText>
                    ))}
                  </View>
                )}
                <Pressable onPress={retake} style={({ pressed }) => pressed && styles.pressed}>
                  <ThemedView type="backgroundElement" style={styles.retakeButton}>
                    <ThemedText type="smallBold">Làm lại</ThemedText>
                  </ThemedView>
                </Pressable>
                <ThemedText type="smallBold" style={styles.reviewHeading}>
                  Xem lại
                </ThemedText>
              </View>
            }
            renderItem={({ item }) => {
              const question = quiz.questions[item.questionIndex];
              return (
                <ThemedView type="backgroundElement" style={styles.reviewCard}>
                  <ThemedText type="smallBold">
                    {item.questionIndex + 1}. {question.question}
                  </ThemedText>
                  {question.options.map((option, optionIndex) => {
                    const isYourAnswer = item.selected === optionIndex;
                    const isCorrectAnswer = question.correct === optionIndex;
                    return (
                      <ThemedText
                        key={optionIndex}
                        type={isCorrectAnswer || isYourAnswer ? 'smallBold' : 'small'}
                        themeColor={isCorrectAnswer || isYourAnswer ? undefined : 'textSecondary'}
                        style={styles.reviewOption}>
                        {isCorrectAnswer ? '✓ ' : isYourAnswer ? '✗ ' : '   '}
                        {option}
                      </ThemedText>
                    );
                  })}
                  {item.selected === null && (
                    <ThemedText type="small" themeColor="textSecondary" style={styles.reviewOption}>
                      Bạn chưa trả lời câu này.
                    </ThemedText>
                  )}
                  <ThemedText type="small" themeColor="textSecondary" style={styles.explanation}>
                    {question.explanation}
                  </ThemedText>
                </ThemedView>
              );
            }}
          />
        </SafeAreaView>
      </>
    );
  }

  const totalQuestions = quiz.questions.length;
  const currentQuestion = quiz.questions[attempt.currentIndex];
  const selected = attempt.answers[attempt.currentIndex] ?? null;

  return (
    <>
      <Stack.Screen options={{ headerTitle: quiz.title }} />
      <SafeAreaView style={styles.flex} edges={['bottom']}>
        <View style={styles.progressRow}>
          <ThemedText type="small" themeColor="textSecondary">
            Câu {attempt.currentIndex + 1}/{totalQuestions}
          </ThemedText>
          <ThemedText type="smallBold">{formatRemaining(remainingSeconds(attempt, now))}</ThemedText>
        </View>
        <ScrollView contentContainerStyle={styles.questionScroll}>
          <ThemedText type="subtitle" style={styles.questionText}>
            {currentQuestion.question}
          </ThemedText>
          {currentQuestion.options.map((option, optionIndex) => {
            const isSelected = selected === optionIndex;
            return (
              <Pressable
                key={optionIndex}
                onPress={() => selectOption(optionIndex)}
                style={({ pressed }) => [styles.optionRow, pressed && styles.pressed]}>
                <ThemedView type={isSelected ? 'backgroundSelected' : 'backgroundElement'} style={styles.optionInner}>
                  <ThemedText type={isSelected ? 'smallBold' : 'small'}>{option}</ThemedText>
                </ThemedView>
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={styles.navRow}>
          {attempt.currentIndex > 0 && (
            <Pressable onPress={goPrev} style={({ pressed }) => [styles.navButton, pressed && styles.pressed]}>
              <ThemedView type="backgroundElement" style={styles.navButtonInner}>
                <ThemedText type="smallBold">‹ Trước</ThemedText>
              </ThemedView>
            </Pressable>
          )}
          <Pressable onPress={submit} style={({ pressed }) => [styles.navButton, pressed && styles.pressed]}>
            <ThemedView type="backgroundSelected" style={styles.navButtonInner}>
              <ThemedText type="smallBold">Nộp bài</ThemedText>
            </ThemedView>
          </Pressable>
          {attempt.currentIndex < totalQuestions - 1 && (
            <Pressable onPress={goNext} style={({ pressed }) => [styles.navButton, pressed && styles.pressed]}>
              <ThemedView type="backgroundElement" style={styles.navButtonInner}>
                <ThemedText type="smallBold">Tiếp ›</ThemedText>
              </ThemedView>
            </Pressable>
          )}
        </View>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  centerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
  questionScroll: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  questionText: {
    marginBottom: Spacing.two,
  },
  optionRow: {
    marginBottom: Spacing.two,
  },
  optionInner: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
  },
  navRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  navButton: {
    flex: 1,
  },
  navButtonInner: {
    borderRadius: Spacing.three,
    paddingVertical: Spacing.two,
    alignItems: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  resultList: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  resultHeader: {
    gap: Spacing.two,
    paddingBottom: Spacing.three,
  },
  domainList: {
    gap: Spacing.half,
  },
  retakeButton: {
    alignSelf: 'flex-start',
    borderRadius: Spacing.five,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  reviewHeading: {
    marginTop: Spacing.two,
  },
  reviewCard: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.one,
    marginBottom: Spacing.two,
  },
  reviewOption: {
    paddingLeft: Spacing.one,
  },
  explanation: {
    marginTop: Spacing.one,
  },
});
