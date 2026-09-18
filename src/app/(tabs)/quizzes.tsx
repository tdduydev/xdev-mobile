import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getCachedQuizzes } from '@/api/cache';
import type { QuizSummary } from '@/api/schema';
import { EmptyState } from '@/components/empty-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

// Not tagged by locale the way ContentProvider's snapshots are — quizzes
// aren't partitioned by locale (api/client.ts's fetchQuizzes doc comment),
// and this screen is the only consumer, so there's nothing to share/lift
// into ContentProvider for (see task-12-report.md for that decision).
type QuizListSnapshot = {
  quizzes: QuizSummary[] | null;
  error: Error | null;
};

function QuizRow({ quiz, onPress }: { quiz: QuizSummary; onPress: () => void }) {
  const metaParts = [
    quiz.provider,
    quiz.level,
    `${quiz.questions_count} câu`,
    `${quiz.duration_minutes} phút`,
    `Đạt ${quiz.passing_score}%`,
  ];

  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView type="backgroundElement" style={styles.quizCard}>
        <ThemedText type="smallBold" numberOfLines={2}>
          {quiz.title}
        </ThemedText>
        {quiz.description.length > 0 && (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
            {quiz.description}
          </ThemedText>
        )}
        <ThemedText type="small" themeColor="textSecondary">
          {metaParts.join(' · ')}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

export default function QuizzesScreen() {
  const [snapshot, setSnapshot] = useState<QuizListSnapshot | null>(null);

  // Same shape as series.tsx's retry button: a plain event-handler fetch
  // with no `cancelled` guard, since a single explicit tap is the only
  // thing that calls it. `getCachedQuizzes()` re-attempts the network fetch
  // on retry for free — a failed first attempt never wrote a cache file, so
  // there is nothing to serve from disk yet.
  const retry = useCallback(() => {
    getCachedQuizzes()
      .then((quizzes) => setSnapshot({ quizzes, error: null }))
      .catch((err) => setSnapshot({ quizzes: null, error: toError(err) }));
  }, []);

  // The mount-time load, with the `cancelled` guard the retry button above
  // doesn't need — same split as content.tsx's series-loading effect vs its
  // `refreshSeries` retry handler.
  useEffect(() => {
    let cancelled = false;
    getCachedQuizzes()
      .then((quizzes) => {
        if (cancelled) return;
        setSnapshot({ quizzes, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setSnapshot({ quizzes: null, error: toError(err) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isLoading = snapshot === null;
  const quizzes = snapshot?.quizzes ?? null;
  const error = snapshot?.error ?? null;

  if (isLoading) {
    return (
      <ThemedView style={styles.centerFill}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.flex} edges={['top']}>
        <EmptyState
          title="No quizzes to show"
          message="Couldn't load the quiz list and nothing is saved on this device yet. Check your connection and try again."
          onRetry={retry}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      <FlatList
        data={quizzes ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <ThemedText type="title" style={styles.heading}>
            Quizzes
          </ThemedText>
        }
        renderItem={({ item }) => (
          <ThemedView style={styles.itemWrapper}>
            <QuizRow quiz={item} onPress={() => router.push({ pathname: '/quiz/[slug]', params: { slug: item.slug } })} />
          </ThemedView>
        )}
      />
    </SafeAreaView>
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
  listContent: {
    paddingBottom: Spacing.six,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  heading: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
  },
  itemWrapper: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  pressed: {
    opacity: 0.7,
  },
  quizCard: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.one,
  },
});
